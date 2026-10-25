import { readConfiguredChannels } from "@/lib/alerts/configured-channels";
import { readEnvironment } from "@/lib/environment";
import type { AlertChannel } from "@/lib/schema/alerts";

export interface AlertNotification {
  title: string;
  message: string;
  state: "firing" | "resolved";
}

type ExternalChannel = Exclude<AlertChannel, "inapp">;

const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

/*
 * Webhook URLs and bot tokens are secrets, and fetch puts the URL into its error messages. Errors
 * are replaced with fixed text before they reach the logs, the database or the Settings page.
 */
async function postWithTimeout(url: string, init: RequestInit): Promise<void> {
  if (!URL.canParse(url)) throw new Error("invalid URL");
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "TimeoutError" ? "timed out" : "network error");
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
}

function stripHeaderCharacters(value: string): string {
  return value.replaceAll(/[^ -~]/g, "").slice(0, 200);
}

async function sendNtfy(notification: AlertNotification): Promise<void> {
  const headers: Record<string, string> = {
    Title: stripHeaderCharacters(notification.title),
    Priority: notification.state === "firing" ? "high" : "default",
    Tags: notification.state === "firing" ? "rotating_light" : "white_check_mark",
  };
  const ntfyToken = readEnvironment("NTFY_TOKEN");
  if (ntfyToken) headers.Authorization = `Bearer ${ntfyToken}`;
  await postWithTimeout(readEnvironment("NTFY_URL") ?? "", { method: "POST", headers, body: notification.message });
}

async function sendDiscord(notification: AlertNotification): Promise<void> {
  const embedColor = notification.state === "firing" ? 0xff_46_55 : 0x2e_e5_9d;
  await postWithTimeout(readEnvironment("DISCORD_WEBHOOK_URL") ?? "", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ServerLab", embeds: [{ title: notification.title.slice(0, 256), description: notification.message.slice(0, 4000), color: embedColor }] }),
  });
}

function escapeTelegramMarkdown(text: string): string {
  return text.replaceAll(/[_*[\]()~`>#+\-=|{}.!\\]/g, (character) => `\\${character}`);
}

async function sendTelegram(notification: AlertNotification): Promise<void> {
  const prefix = notification.state === "firing" ? "🚨" : "✅";
  await postWithTimeout(`https://api.telegram.org/bot${readEnvironment("TELEGRAM_BOT_TOKEN") ?? ""}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: readEnvironment("TELEGRAM_CHAT_ID"), parse_mode: "MarkdownV2", text: `${prefix} *${escapeTelegramMarkdown(notification.title)}*\n${escapeTelegramMarkdown(notification.message)}` }),
  });
}

const SENDERS: Record<ExternalChannel, (notification: AlertNotification) => Promise<void>> = { ntfy: sendNtfy, discord: sendDiscord, telegram: sendTelegram };

/**
 * Sends to one external channel. Throws when the channel is not configured or the request fails.
 */
export async function sendToChannel(channel: ExternalChannel, notification: AlertNotification): Promise<void> {
  if (!readConfiguredChannels()[channel]) throw new Error(`${channel} is not configured`);
  await SENDERS[channel](notification);
}

/**
 * Sends to every configured external channel in `channels` (in-app needs no sending). Failures
 * are logged, never thrown, so one broken webhook does not stop the others.
 */
export async function notifyChannels(channels: readonly AlertChannel[], notification: AlertNotification): Promise<boolean> {
  const configuredChannels = readConfiguredChannels();
  const externalChannels = channels.filter((channel): channel is ExternalChannel => channel !== "inapp" && configuredChannels[channel as ExternalChannel]);
  const results = await Promise.allSettled(externalChannels.map((channel) => SENDERS[channel](notification)));
  results.forEach((result, resultIndex) => {
    if (result.status === "rejected") console.error(`[collector] ${externalChannels[resultIndex]} notification failed:`, result.reason instanceof Error ? result.reason.message : result.reason);
  });
  return results.some((result) => result.status === "fulfilled");
}

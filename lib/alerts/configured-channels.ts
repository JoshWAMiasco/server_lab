import { readEnvironment } from "@/lib/environment";

/**
 * Which notification channels have their secrets in the environment. Only presence is checked;
 * the values never leave the server.
 */
export function readConfiguredChannels(): Record<"ntfy" | "discord" | "telegram", boolean> {
  return {
    ntfy: Boolean(readEnvironment("NTFY_URL")),
    discord: Boolean(readEnvironment("DISCORD_WEBHOOK_URL")),
    telegram: Boolean(readEnvironment("TELEGRAM_BOT_TOKEN") && readEnvironment("TELEGRAM_CHAT_ID")),
  };
}

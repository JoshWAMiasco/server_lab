import { afterEach, describe, expect, test, vi } from "vitest";
import { sendToChannel } from "./notifiers";

const NOTIFICATION = { title: "Test", message: "Body", state: "resolved" } as const;

async function readErrorMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a rejection");
}

describe("sendToChannel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("does not reveal a malformed webhook URL in the error", async () => {
    vi.stubEnv("DISCORD_WEBHOOK_URL", "discord.com/api/webhooks/123/SECRETTOKEN");
    const errorMessage = await readErrorMessage(sendToChannel("discord", NOTIFICATION));
    expect(errorMessage).toBe("invalid URL");
  });

  test("does not reveal the URL when the request fails", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:SECRETTOKEN");
    vi.stubEnv("TELEGRAM_CHAT_ID", "42");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED https://api.telegram.org/bot123:SECRETTOKEN/sendMessage") })));
    const errorMessage = await readErrorMessage(sendToChannel("telegram", NOTIFICATION));
    expect(errorMessage).toBe("network error");
  });

  test("reports the HTTP status", async () => {
    vi.stubEnv("NTFY_URL", "https://ntfy.example.com/SECRETTOPIC");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: "Forbidden" })));
    const errorMessage = await readErrorMessage(sendToChannel("ntfy", NOTIFICATION));
    expect(errorMessage).toBe("HTTP 403 Forbidden");
  });
});

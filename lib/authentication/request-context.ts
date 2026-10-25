import { isIP } from "node:net";
import { headers } from "next/headers";

/**
 * The client IP from nginx's `X-Real-IP`, else the first `X-Forwarded-For` hop. Values that are not
 * IP addresses are ignored, so a client that reaches 127.0.0.1:3000 without nginx cannot write
 * arbitrary text into the User Watcher.
 */
export function pickClientAddress(realAddress: string | null, forwardedFor: string | null): string | null {
  for (const candidate of [realAddress, forwardedFor?.split(",")[0]]) {
    const trimmed = candidate?.trim() ?? "";
    if (isIP(trimmed)) return trimmed;
  }
  return null;
}

/**
 * The client IP as seen by nginx. The web process listens on 127.0.0.1 only, so these headers come
 * from the local proxy (or from another local process, which is why they are only validated, not trusted).
 */
export async function readClientAddress(): Promise<string | null> {
  const requestHeaders = await headers();
  return pickClientAddress(requestHeaders.get("x-real-ip"), requestHeaders.get("x-forwarded-for"));
}

/**
 * The request's User-Agent, truncated to 300 characters.
 */
export async function readUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}

/**
 * Whether the session cookie gets the `Secure` flag. On by default; set `COOKIE_SECURE=false`
 * only for plain-HTTP testing on localhost.
 */
export function isSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE !== "false";
  return process.env.NODE_ENV === "production";
}

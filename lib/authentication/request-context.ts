import { headers } from "next/headers";

/**
 * The client IP as seen by nginx (`X-Real-IP`, then the first `X-Forwarded-For` hop). The web
 * process listens on 127.0.0.1 only, so these headers can only come from the local proxy.
 */
export async function readClientAddress(): Promise<string | null> {
  const requestHeaders = await headers();
  const realAddress = requestHeaders.get("x-real-ip");
  if (realAddress) return realAddress.trim();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || null;
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

/**
 * Returns `nextPath` when it is a same-origin path, otherwise "/". Rejects protocol-relative
 * URLs (`//host`), backslash tricks (`/\host`, which browsers treat as `//host`) and control
 * characters, so the post-login redirect cannot send anyone to another site.
 */
export function readSafeNextPath(nextPath: unknown): string {
  if (typeof nextPath !== "string" || !nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("//") || nextPath.includes("\\") || /[\u0000-\u001f\u007f]/.test(nextPath)) return "/";
  return nextPath;
}

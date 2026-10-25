/**
 * The time a server component renders, read once per request. Client components get it as a prop
 * so server and browser format relative times ("up 3d") from the same reference.
 */
export function readRenderTimestamp(): number {
  return Date.now();
}

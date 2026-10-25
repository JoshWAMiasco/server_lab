import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const ICON_NAME_PATTERN = /^[a-z0-9-]+\.svg$/;

/**
 * Serves a vendored catalog icon. The strict name pattern keeps requests inside catalog/icons, and the
 * CSP stops any markup in the SVG from running if it is opened directly.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ iconName: string }> }): Promise<Response> {
  const { iconName } = await params;
  if (!ICON_NAME_PATTERN.test(iconName)) return new Response("Not found", { status: 404 });

  let content: Buffer;
  try {
    content = await readFile(path.join(process.cwd(), "catalog", "icons", iconName));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=604800, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { readSession } from "@/lib/authentication/require-session";
import { getDatabase } from "@/lib/database/client";
import { readCustomIcon } from "@/lib/lobby/custom-icon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves an uploaded Lobby icon to signed-in users. The sandboxing CSP means that even an SVG
 * opened directly in a tab cannot run scripts or load anything.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ iconId: string }> }) {
  if (!(await readSession())) return new Response("Unauthorized", { status: 401 });
  const { iconId } = await params;
  if (!/^[a-f0-9]{64}$/.test(iconId)) return new Response("Not found", { status: 404 });
  const icon = readCustomIcon(getDatabase(), iconId);
  if (!icon) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      "Content-Type": icon.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

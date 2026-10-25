import { Box } from "lucide-react";
import { resolveIconUrl } from "@/lib/lobby/icon-reference";
import { mergeClassNames } from "@/utilities/merge-class-names";

/**
 * A Lobby item's icon: an uploaded one (`custom:<hash>`, served from `/custom-icons/`), a vendored
 * catalog icon (`jellyfin.svg`, served from `/catalog-icons/`), or a lucide `Box` when there is
 * none. Icons never load from a CDN.
 *
 * @example
 * <CatalogIcon iconFileName="jellyfin.svg" name="Jellyfin" className="h-10 w-10" />
 * <CatalogIcon iconFileName="custom:3f2a…" name="Side Project" className="h-10 w-10" />
 */
export function CatalogIcon({ iconFileName, name, className }: { iconFileName: string | null; name: string; className?: string }) {
  const iconUrl = resolveIconUrl(iconFileName);
  if (!iconUrl) {
    return (
      <div className={mergeClassNames("flex shrink-0 items-center justify-center border border-line-strong bg-surface-muted text-foreground-subtle", className)}>
        <Box className="h-1/2 w-1/2 stroke-[1.2]" />
      </div>
    );
  }
  return (
    <div className={mergeClassNames("flex shrink-0 items-center justify-center border border-line bg-surface-subtle p-1.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVGs need no optimization */}
      <img src={iconUrl} alt={`${name} icon`} className="h-full w-full object-contain" loading="lazy" />
    </div>
  );
}

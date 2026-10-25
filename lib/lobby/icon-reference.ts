/*
 * A Lobby item's `icon` is either a vendored catalog file name ("jellyfin.svg") or an uploaded
 * icon ("custom:<sha256>"). This module has no server imports, so client components can use it.
 */

export const CUSTOM_ICON_PREFIX = "custom:";

const CUSTOM_ICON_PATTERN = /^custom:([a-f0-9]{64})$/;
const CATALOG_ICON_PATTERN = /^[a-z0-9-]+\.svg$/;

/**
 * The id of an uploaded icon reference, or null.
 *
 * @example
 * readCustomIconId("custom:3f2a…"); // "3f2a…"
 */
export function readCustomIconId(iconReference: string | null | undefined): string | null {
  return iconReference ? (CUSTOM_ICON_PATTERN.exec(iconReference)?.[1] ?? null) : null;
}

/**
 * The URL that serves an icon reference, or null when it is empty or malformed.
 *
 * @example
 * resolveIconUrl("jellyfin.svg"); // "/catalog-icons/jellyfin.svg"
 * resolveIconUrl("custom:3f2a…"); // "/custom-icons/3f2a…"
 */
export function resolveIconUrl(iconReference: string | null | undefined): string | null {
  const customIconId = readCustomIconId(iconReference);
  if (customIconId) return `/custom-icons/${customIconId}`;
  return iconReference && CATALOG_ICON_PATTERN.test(iconReference) ? `/catalog-icons/${iconReference}` : null;
}

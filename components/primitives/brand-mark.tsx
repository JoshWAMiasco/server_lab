/**
 * The ServerLab mark ("Bastion"): an angular shield holding three server bars. Same drawing as
 * branding/mark.svg and app/icon.svg. Decorative by default; pass `title` when it stands alone.
 *
 * @example
 * <BrandMark className="h-[34px] w-[34px]" />
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M32 3 57 11V35L32 61 7 35V11Z" fill="var(--color-brand)" />
      <g fill="var(--color-canvas)">
        <rect x="19.5" y="23" width="6.5" height="17" rx="3.25" opacity=".55" />
        <rect x="28.75" y="15" width="6.5" height="31" rx="3.25" />
        <rect x="38" y="23" width="6.5" height="17" rx="3.25" opacity=".55" />
      </g>
    </svg>
  );
}

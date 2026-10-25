import { joinClassNames } from "@/utilities/join-class-names";
import Link from "next/link";
import { THEME_IDENTITY } from "@/configuration/theme-identity";

export interface BrandLogoClassNames {
  brandLink: string;
  brandMark: string;
  brandMarkGlyph: string;
  brandName: string;
}

/**
 * The ServerLab logo mark and product name. The theme decides where it sits and how it looks
 * (`SHELL_APPEARANCE.classNames`); pass `brandName` to show your product name instead.
 *
 * @example
 * <BrandLogo href="/" brandName="ACME ADMIN" classNames={SHELL_APPEARANCE.classNames} />
 */
export function BrandLogo({
  href = "/",
  brandName = THEME_IDENTITY.productName.toUpperCase(),
  classNames,
}: {
  href?: string;
  brandName?: string;
  classNames: BrandLogoClassNames;
}) {
  const glyph = (
    <div className={classNames.brandMarkGlyph}>
      <div className="absolute inset-y-0 left-0 my-auto h-[75%] w-[21%] rounded-full opacity-50" />
      <div className="absolute inset-0 m-auto h-[120%] w-[21%] rounded-full" />
      <div className="absolute inset-y-0 right-0 my-auto h-[75%] w-[21%] rounded-full opacity-50" />
    </div>
  );
  return (
    <Link href={href} aria-label={`${brandName} home`} className={joinClassNames(classNames.brandLink)}>
      {classNames.brandMark ? <div className={classNames.brandMark}>{glyph}</div> : glyph}
      <div className={classNames.brandName}>{brandName}</div>
    </Link>
  );
}

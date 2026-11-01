import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/layout-shell/brand-logo";
import type { ShellAppearance } from "@/components/layout-shell/shell-appearance";
import { MobileSideMenuDrawer } from "@/components/layout-shell/mobile-side-menu-drawer";
import { CompactMenuToggle, HoverableSideMenuContent } from "@/components/layout-shell/side-menu-state";
import { SideMenuGroup, SideMenuLink } from "@/components/layout-shell/side-menu-link";
import type { SideMenuEntry, SideMenuLinkEntry } from "@/configuration/side-menu-navigation";

const SIDE_MENU_ICON_CLASS_NAMES = "side-menu__link__icon h-5 w-5 stroke-[1]";

function renderLink(linkEntry: SideMenuLinkEntry) {
  const LinkIcon = linkEntry.icon;
  return <SideMenuLink href={linkEntry.href} title={linkEntry.title} badge={linkEntry.badge} icon={<LinkIcon className={SIDE_MENU_ICON_CLASS_NAMES} />} />;
}

function SideMenuNavigation({ navigation, className }: { navigation: readonly SideMenuEntry[]; className: string }) {
  return (
    <nav aria-label="Main menu" className={`scrollable-ref ${className}`}>
      <ul className="scrollable">
        {navigation.map((menuEntry) => {
          if (menuEntry.entryKind === "divider") {
            return (
              <li key={`divider-${menuEntry.title}`} className="side-menu__divider">
                {menuEntry.title.toUpperCase()}
              </li>
            );
          }
          if (menuEntry.entryKind === "link") return <li key={menuEntry.href}>{renderLink(menuEntry)}</li>;
          const GroupIcon = menuEntry.icon;
          return (
            <li key={`group-${menuEntry.title}`}>
              <SideMenuGroup title={menuEntry.title} icon={<GroupIcon className={SIDE_MENU_ICON_CLASS_NAMES} />} linkHrefs={menuEntry.links.map((childLink) => childLink.href)}>
                {menuEntry.links.map((childLink) => (
                  <li key={childLink.href}>{renderLink(childLink)}</li>
                ))}
              </SideMenuGroup>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The side menu: dividers, links and collapsible groups from `navigation`, in the theme's
 * layout (`appearance.layoutVariant`). From 1280px it is a fixed column; below that the same
 * navigation opens in `MobileSideMenuDrawer`. In `side-menu-with-brand` themes it also holds the logo and
 * the collapse toggle. Server component; only the active-link highlight and group toggles run on
 * the client.
 *
 * @example
 * <SideMenu navigation={buildSideMenuNavigation({ firingAlertCount: 0 })} appearance={SHELL_APPEARANCE} homeHref="/" />
 */
export function SideMenu({ navigation, appearance, homeHref = "/" }: { navigation: readonly SideMenuEntry[]; appearance: ShellAppearance; homeHref?: string }) {
  const { classNames } = appearance;
  const menuNavigation = <SideMenuNavigation navigation={navigation} className={classNames.sideMenuNavigation} />;
  const mobileDrawer = (
    <MobileSideMenuDrawer
      header={<BrandLogo href={homeHref} classNames={{ ...classNames, brandLink: classNames.mobileDrawerBrandLink }} />}
      classNames={{ panel: classNames.mobileDrawerPanel, header: classNames.mobileDrawerHeader, closeButton: classNames.mobileDrawerCloseButton }}
    >
      <SideMenuNavigation navigation={navigation} className={classNames.sideMenuNavigation} />
    </MobileSideMenuDrawer>
  );

  if (appearance.layoutVariant === "side-menu-with-brand") {
    return (
      <>
        {mobileDrawer}
        <HoverableSideMenuContent className={classNames.sideMenuContent}>
          <div className={classNames.brandArea}>
            <BrandLogo href={homeHref} classNames={classNames} />
            <CompactMenuToggle className={classNames.compactMenuToggle}>
              <ArrowLeft className="h-3.5 w-3.5 stroke-[1.3]" />
            </CompactMenuToggle>
          </div>
          {menuNavigation}
        </HoverableSideMenuContent>
      </>
    );
  }

  return (
    <>
      {mobileDrawer}
      <HoverableSideMenuContent className={classNames.sideMenuContent}>
        {classNames.sideMenuPanel ? <div className={classNames.sideMenuPanel}>{menuNavigation}</div> : menuNavigation}
      </HoverableSideMenuContent>
    </>
  );
}

import { AlignJustify, ArrowLeft, Expand, Search } from "lucide-react";
import { AccountMenu } from "@/components/layout-shell/account-menu";
import { BrandLogo } from "@/components/layout-shell/brand-logo";
import { BreadcrumbTrail } from "@/components/layout-shell/breadcrumb-trail";
import { FullScreenButton } from "@/components/layout-shell/full-screen-button";
import { GlobalSearch, type GlobalSearchResultGroup, type GlobalSearchShortcut } from "@/components/layout-shell/global-search";
import { NotificationsPanel } from "@/components/layout-shell/notifications-panel";
import type { ShellAppearance } from "@/components/layout-shell/shell-appearance";
import { ShellWrappers } from "@/components/layout-shell/shell-wrappers";
import { CompactMenuToggle, HoverableSideMenuContent, MobileMenuOpenButton } from "@/components/layout-shell/side-menu-state";
import { CollectorStatus } from "@/components/shell/collector-status";
import type { LiveAlertEvent, LiveStatus } from "@/lib/queries/live-types";

export interface TopBarProps {
  appearance: ShellAppearance;
  homeHref?: string;
  liveStatus: LiveStatus;
  alertEvents: readonly LiveAlertEvent[];
  searchResultGroups: readonly GlobalSearchResultGroup[];
  searchShortcuts: readonly GlobalSearchShortcut[];
}

/**
 * The fixed 65px top bar: breadcrumb, quick search (⌘K), collector status and host name, full
 * screen, alert notifications and the admin menu, plus the logo and collapse toggle in `top-bar-with-brand` themes. Server
 * component; each control is a small client island. Its look comes from `appearance`.
 *
 * @example
 * <TopBar appearance={SHELL_APPEARANCE} liveStatus={status} alertEvents={recentAlertEvents} searchResultGroups={groups} searchShortcuts={shortcuts} />
 */
export function TopBar({ appearance, homeHref = "/", liveStatus, alertEvents, searchResultGroups, searchShortcuts }: TopBarProps) {
  const { classNames } = appearance;
  const mobileMenuButtons = (
    <div className={classNames.mobileMenuButtons}>
      <MobileMenuOpenButton className={classNames.mobileMenuButton}>
        <AlignJustify className={classNames.mobileMenuIcon} />
      </MobileMenuOpenButton>
      <GlobalSearch
        resultGroups={searchResultGroups}
        shortcuts={searchShortcuts}
        trigger={
          <button type="button" aria-label="Quick search" className={`cursor-pointer ${classNames.mobileMenuButton}`}>
            <Search className={classNames.mobileMenuIcon} />
          </button>
        }
      />
    </div>
  );
  const topBarItems = (
    <>
      <BreadcrumbTrail classNames={classNames} />
      <div className={classNames.searchArea}>
        <GlobalSearch
          resultGroups={searchResultGroups}
          shortcuts={searchShortcuts}
          trigger={
            <button type="button" className={classNames.searchTrigger}>
              <Search className="h-[18px] w-[18px] stroke-[1]" />
              <div className="mr-auto ml-2.5">Quick search...</div>
              <div>⌘K</div>
            </button>
          }
        />
      </div>
      <div className="flex flex-1 items-center">
        <div className={classNames.actionButtons}>
          <CollectorStatus initialStatus={liveStatus} />
          <div className="hidden sm:flex">
            <FullScreenButton className={classNames.actionButton}>
              <Expand className={classNames.actionIcon} />
            </FullScreenButton>
          </div>
          <NotificationsPanel initialEvents={alertEvents} triggerClassName={classNames.actionButton} iconClassName={classNames.actionIcon} />
        </div>
        <AccountMenu avatarClassName={classNames.accountAvatarButton} />
      </div>
    </>
  );

  if (appearance.layoutVariant === "side-menu-with-brand") {
    return (
      <ShellWrappers classNameLayers={classNames.topBarWrappers} hasScrollAwareTopBar={appearance.hasScrollAwareTopBar}>
        {mobileMenuButtons}
        {topBarItems}
      </ShellWrappers>
    );
  }

  return (
    <ShellWrappers classNameLayers={classNames.topBarWrappers} hasScrollAwareTopBar={appearance.hasScrollAwareTopBar}>
      <HoverableSideMenuContent className={classNames.topBarBrandArea}>
        <BrandLogo href={homeHref} classNames={classNames} />
        <CompactMenuToggle className={classNames.compactMenuToggle}>
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.3]" />
        </CompactMenuToggle>
        {mobileMenuButtons}
      </HoverableSideMenuContent>
      <ShellWrappers classNameLayers={classNames.topBarMainWrappers}>{topBarItems}</ShellWrappers>
    </ShellWrappers>
  );
}

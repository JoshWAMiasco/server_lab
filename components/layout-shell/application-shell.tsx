import { Activity, BarChart3, LayoutGrid, Settings, ShieldCheck, Siren } from "lucide-react";
import type { ReactNode } from "react";
import { ToastViewport } from "@/components/interactive/toast-notification";
import type { GlobalSearchResultGroup } from "@/components/layout-shell/global-search";
import { PageLoadingOverlay } from "@/components/layout-shell/page-loading-overlay";
import { ScrollAwareElement } from "@/components/layout-shell/scroll-aware-element";
import { ShellWrappers } from "@/components/layout-shell/shell-wrappers";
import { SideMenu } from "@/components/layout-shell/side-menu";
import { PageContentFrame, SideMenuFrame, SideMenuStateProvider } from "@/components/layout-shell/side-menu-state";
import { TopBar } from "@/components/layout-shell/top-bar";
import { CollectorOfflineBanner } from "@/components/shell/collector-status";
import { SHELL_APPEARANCE } from "@/configuration/shell-appearance";
import { buildSideMenuNavigation } from "@/configuration/side-menu-navigation";
import type { LiveAlertEvent, LiveStatus } from "@/lib/queries/live-types";

const SEARCH_SHORTCUTS = [
  { label: "Lobby", href: "/", icon: <LayoutGrid className="h-4 w-4 stroke-[1.3]" /> },
  { label: "Resources", href: "/resources", icon: <Activity className="h-4 w-4 stroke-[1.3]" /> },
  { label: "Applications", href: "/apps", icon: <BarChart3 className="h-4 w-4 stroke-[1.3]" /> },
  { label: "User Watcher", href: "/watcher", icon: <ShieldCheck className="h-4 w-4 stroke-[1.3]" /> },
  { label: "Alerts", href: "/alerts", icon: <Siren className="h-4 w-4 stroke-[1.3]" /> },
  { label: "Settings", href: "/settings", icon: <Settings className="h-4 w-4 stroke-[1.3]" /> },
];

const DASHBOARD_HOME_HREF = "/";

export interface ApplicationShellProps {
  liveStatus: LiveStatus;
  alertEvents: readonly LiveAlertEvent[];
  searchResultGroups: readonly GlobalSearchResultGroup[];
  offlineAfterMilliseconds: number | null;
  children: ReactNode;
}

/**
 * The dashboard frame around every page: theme wrapper, loading overlay, side menu (with the
 * firing-alert badge), top bar and the content container. `app/(dashboard)/layout.tsx` passes the
 * live status, recent alert events and the Lobby search index.
 *
 * @example
 * <ApplicationShell liveStatus={status} alertEvents={events} searchResultGroups={groups} offlineAfterMilliseconds={60_000}>{children}</ApplicationShell>
 */
export function ApplicationShell({ liveStatus, alertEvents, searchResultGroups, offlineAfterMilliseconds, children }: ApplicationShellProps) {
  const { classNames } = SHELL_APPEARANCE;
  const topBar = <TopBar appearance={SHELL_APPEARANCE} homeHref={DASHBOARD_HOME_HREF} liveStatus={liveStatus} alertEvents={alertEvents} searchResultGroups={searchResultGroups} searchShortcuts={SEARCH_SHORTCUTS} />;
  const sideMenu = <SideMenu navigation={buildSideMenuNavigation({ firingAlertCount: liveStatus.firingAlertCount })} appearance={SHELL_APPEARANCE} homeHref={DASHBOARD_HOME_HREF} />;
  const dashboard = (
    <PageLoadingOverlay className={classNames.loadingPage}>
      <SideMenuStateProvider>
        <SideMenuFrame className={classNames.sideMenuFrame}>
          {SHELL_APPEARANCE.layoutVariant === "side-menu-with-brand" ? (
            <>
              {sideMenu}
              {topBar}
            </>
          ) : (
            <>
              {topBar}
              {sideMenu}
            </>
          )}
        </SideMenuFrame>
        <PageContentFrame className={classNames.pageContent} hasScrollAwareMode={SHELL_APPEARANCE.hasScrollAwareBackground}>
          <ShellWrappers classNameLayers={classNames.pageContentWrappers}>
            <div className={classNames.pageContainer}>
              <CollectorOfflineBanner initialStatus={liveStatus} offlineAfterMilliseconds={offlineAfterMilliseconds} />
              {children}
            </div>
          </ShellWrappers>
        </PageContentFrame>
      </SideMenuStateProvider>
    </PageLoadingOverlay>
  );
  return (
    <>
      {SHELL_APPEARANCE.hasScrollAwareBackground ? (
        <ScrollAwareElement className={classNames.themeWrapper} classNameWhenScrolled="background--hidden">
          {dashboard}
        </ScrollAwareElement>
      ) : (
        <div className={classNames.themeWrapper}>{dashboard}</div>
      )}
      <ToastViewport />
    </>
  );
}

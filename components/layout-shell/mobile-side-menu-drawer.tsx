"use client";

import { CloseButton, Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { OVERLAY_BACKDROP_CLASS_NAMES } from "@/components/interactive/overlay-open-state";
import { MOBILE_MENU_DRAWER_ID, useSideMenuState } from "@/components/layout-shell/side-menu-state";
import { mergeClassNames } from "@/utilities/merge-class-names";

export interface MobileSideMenuDrawerClassNames {
  panel: string;
  header: string;
  closeButton: string;
}

/**
 * The side menu as a drawer for screens narrower than 1280px. It opens from the top bar's
 * hamburger button and closes on a tap outside it, the close button, Escape, a tap on any menu
 * link, or a route change. While it is open the page behind it cannot scroll and keyboard focus
 * stays inside it. Pass the server-rendered navigation as `children` and the brand as `header`.
 *
 * @example
 * <MobileSideMenuDrawer header={<BrandLogo … />} classNames={drawerClassNames}>
 *   <nav aria-label="Main menu">…</nav>
 * </MobileSideMenuDrawer>
 */
export function MobileSideMenuDrawer({ header, classNames, children }: { header: ReactNode; classNames: MobileSideMenuDrawerClassNames; children: ReactNode }) {
  const { isMobileMenuOpen, closeMobileMenu } = useSideMenuState();
  const closeOnLinkTap = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("a[href]")) closeMobileMenu();
  };
  return (
    <Dialog open={isMobileMenuOpen} onClose={closeMobileMenu} className="relative z-[60] xl:hidden">
      <DialogBackdrop transition data-testid="mobile-menu-backdrop" className={OVERLAY_BACKDROP_CLASS_NAMES} />
      <DialogPanel
        id={MOBILE_MENU_DRAWER_ID}
        aria-label="Main menu"
        transition
        className={mergeClassNames("side-menu fixed inset-y-0 left-0 flex h-dvh w-[275px] max-w-[85vw] flex-col transition-transform duration-300 ease-out data-closed:-translate-x-full", classNames.panel)}
      >
        <div className={classNames.header}>
          {header}
          <CloseButton aria-label="Close menu" className={classNames.closeButton}>
            <X className="h-5 w-5 stroke-[1.3]" />
          </CloseButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col" onClick={closeOnLinkTap}>
          {children}
        </div>
      </DialogPanel>
    </Dialog>
  );
}

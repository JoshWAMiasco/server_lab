import type { ShellAppearance } from "@/components/layout-shell/shell-appearance";

const BREADCRUMB_SEPARATOR_CLASS_NAMES =
  "relative ml-5 pl-0.5 before:content-[''] before:w-[14px] before:h-[14px] before:bg-chevron-white before:opacity-50 before:transform before:rotate-[-90deg] before:bg-[length:100%] before:-ml-[1.125rem] before:absolute before:my-auto before:inset-y-0";

/**
 * How the Red Alert dashboard shell looks: a full-width command bar with the logo and a red
 * alarm rule, the side menu below it, and the class lists of every shell element. Theme-owned and
 * safe to edit by hand; the layout-shell components read it.
 */
export const SHELL_APPEARANCE: ShellAppearance = {
  layoutVariant: "top-bar-with-brand",
  hasScrollAwareTopBar: false,
  hasScrollAwareBackground: false,
  classNames: {
    themeWrapper: "decoration-grid-backdrop relative min-h-screen",
    loadingPage:
      "h-screen relative [&.loading-page--before-hide]:before:block [&.loading-page--hide]:before:opacity-0 before:content-[''] before:transition-opacity before:duration-300 before:hidden before:inset-0 before:h-screen before:w-screen before:fixed before:bg-canvas before:z-[60] [&.loading-page--before-hide]:after:block [&.loading-page--hide]:after:opacity-0 after:content-[''] after:transition-opacity after:duration-300 after:hidden after:h-16 after:w-16 after:animate-pulse after:fixed after:opacity-80 after:inset-0 after:m-auto after:bg-loading-puff after:bg-cover after:z-[61]",
    sideMenuFrame: "fixed top-0 left-0 z-50 h-screen",
    topBarWrappers: ["fixed inset-x-0 top-0 z-10 flex h-[65px] border-b-2 border-brand bg-surface shadow-[0_6px_18px_-10px_rgb(255_42_58_/_0.45)]"],
    topBarBrandArea:
      "xl:bg-canvas flex-none flex items-center z-10 px-5 h-full xl:w-[275px] overflow-hidden relative duration-300 xl:group-[.side-menu--collapsed]:w-[91px] xl:group-[.side-menu--collapsed.side-menu--on-hover]:w-[275px] xl:group-[.side-menu--collapsed.side-menu--on-hover]:shadow-xl before:content-[''] before:hidden xl:before:block before:absolute before:right-0 before:border-r before:border-line before:h-full",
    topBarMainWrappers: [
      "absolute inset-x-0 h-full transition-[padding] duration-100 xl:pl-[275px] xl:group-[.side-menu--collapsed]:pl-[91px]",
      "flex items-center w-full h-full px-5",
    ],
    brandArea: "",
    brandLink:
      "hidden items-center transition-[margin] xl:flex xl:group-[.side-menu--collapsed.side-menu--on-hover]:ml-0 xl:group-[.side-menu--collapsed]:ml-2",
    brandMark:
      "flex h-[34px] w-[34px] flex-none items-center justify-center bg-brand [clip-path:polygon(0_0,100%_0,100%_70%,70%_100%,0_100%)] transition-transform ease-in-out xl:group-[.side-menu--collapsed.side-menu--on-hover]:-rotate-180",
    brandMarkGlyph: "relative h-[16px] w-[16px] -rotate-45 [&_div]:bg-on-primary",
    brandName:
      "ml-3.5 font-display text-base font-bold uppercase tracking-[0.14em] text-foreground-strong transition-opacity xl:group-[.side-menu--collapsed.side-menu--on-hover]:opacity-100 xl:group-[.side-menu--collapsed]:opacity-0",
    compactMenuToggle:
      "ml-auto hidden h-[22px] w-[22px] items-center justify-center border border-line-strong text-foreground-muted transition-[opacity,transform] hover:border-brand hover:text-brand xl:group-[.side-menu--collapsed]:rotate-180 xl:group-[.side-menu--collapsed.side-menu--on-hover]:opacity-100 xl:group-[.side-menu--collapsed]:opacity-0 3xl:flex",
    mobileMenuButtons: "flex items-center gap-1 xl:hidden",
    mobileMenuButton: "p-2 text-foreground-muted hover:bg-surface-muted hover:text-brand",
    mobileMenuIcon: "stroke-[1.3] h-[18px] w-[18px]",
    breadcrumbList: "flex items-center whitespace-nowrap font-display font-semibold uppercase tracking-[0.08em] text-brand",
    breadcrumbItem: BREADCRUMB_SEPARATOR_CLASS_NAMES,
    breadcrumbCurrentItem: `${BREADCRUMB_SEPARATOR_CLASS_NAMES} text-foreground-muted cursor-text`,
    searchArea: "relative justify-center flex-1 hidden xl:flex",
    searchTrigger:
      "flex w-[350px] cursor-pointer items-center border border-line-strong border-b-2 border-b-brand bg-field px-3.5 py-2 text-foreground-subtle transition-colors hover:text-foreground",
    actionButtons: "flex items-center gap-1 ml-auto",
    actionButton: "p-2 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-brand",
    actionIcon: "stroke-[1.3] h-[18px] w-[18px]",
    accountAvatarButton: "cursor-pointer image-fit h-[36px] w-[36px] overflow-hidden rounded-full border-2 border-line-strong",
    closeMobileMenu: "fixed ml-[275px] w-10 h-10 items-center justify-center xl:hidden [&.close-mobile-menu--mobile-menu-open]:flex hidden",
    sideMenuContent: "absolute inset-y-0 z-10 xl:top-[65px] xl:z-0",
    sideMenuPanel:
      "xl:ml-0 bg-surface border-r border-line rounded-none w-[275px] duration-300 transition-[width,margin] xl:group-[.side-menu--collapsed]:w-[91px] xl:group-[.side-menu--collapsed.side-menu--on-hover]:shadow-xl xl:group-[.side-menu--collapsed.side-menu--on-hover]:w-[275px] relative overflow-hidden h-full flex flex-col after:content-[''] after:fixed after:inset-0 after:bg-black/80 after:z-[-1] xl:after:hidden group-[.side-menu--mobile-menu-open]:ml-0 group-[.side-menu--mobile-menu-open]:after:block -ml-[275px] after:hidden",
    sideMenuNavigation:
      "w-full h-full z-20 px-4 pt-4 overflow-y-auto overflow-x-hidden pb-3 [-webkit-mask-image:-webkit-linear-gradient(top,rgba(0,0,0,0),black_30px)] [&:-webkit-scrollbar]:w-0 [&:-webkit-scrollbar]:bg-transparent [&_.simplebar-content]:p-0 [&_.simplebar-track.simplebar-vertical]:w-[10px] [&_.simplebar-track.simplebar-vertical]:mr-0.5 [&_.simplebar-track.simplebar-vertical_.simplebar-scrollbar]:before:bg-brand/30",
    pageContent: "transition-[margin,width] duration-100 px-5 mt-[65px] pt-[31px] pb-16 relative z-10 xl:ml-[275px] xl:[&.content--compact]:ml-[91px]",
    pageContentWrappers: [],
    pageContainer: "container",
  },
};

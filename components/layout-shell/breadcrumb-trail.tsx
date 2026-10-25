"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTE_MAP } from "@/configuration/route-map";

function findRouteEntry(currentPathname: string) {
  return ROUTE_MAP.find((routeEntry) => {
    if (!routeEntry.routePath.includes("[")) return routeEntry.routePath === currentPathname;
    const routePattern = new RegExp(`^${routeEntry.routePath.replace(/\[[^\]]+\]/g, "[^/]+")}$`);
    return routePattern.test(currentPathname);
  });
}

export interface BreadcrumbTrailClassNames {
  breadcrumbList: string;
  breadcrumbItem: string;
  breadcrumbCurrentItem: string;
}

/**
 * "App › Group › Page" for the current route, derived from the route map. The theme styles the
 * list and the chevron separators (`SHELL_APPEARANCE.classNames`).
 *
 * @example
 * <BreadcrumbTrail classNames={SHELL_APPEARANCE.classNames} />
 */
export function BreadcrumbTrail({ classNames }: { classNames: BreadcrumbTrailClassNames }) {
  const routeEntry = findRouteEntry(usePathname());
  return (
    <nav aria-label="breadcrumb" className="hidden flex-1 xl:block">
      <ol className={classNames.breadcrumbList}>
        <li>
          <Link href="/">ServerLab</Link>
        </li>
        {routeEntry && <li className={classNames.breadcrumbItem}>{routeEntry.groupName}</li>}
        {routeEntry && (
          <li aria-current="page" className={classNames.breadcrumbCurrentItem}>
            {routeEntry.title}
          </li>
        )}
      </ol>
    </nav>
  );
}

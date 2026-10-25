import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ReactNode } from "react";
import { mergeClassNames } from "@/utilities/merge-class-names";

const PAGINATION_LINK_CLASS_NAMES =
  "transition duration-200 border items-center justify-center py-2 rounded-md cursor-pointer focus:ring-4 focus:ring-primary/20 focus-visible:outline-hidden [&:not(button)]:text-center min-w-0 sm:min-w-[40px] shadow-none font-normal flex border-transparent text-foreground-strong sm:mr-2 px-1 sm:px-3";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageHrefTemplate: string;
  siblingCount?: number;
  className?: string;
}

function createPageHref(pageHrefTemplate: string, pageNumber: number): string {
  return pageHrefTemplate.replace("{page}", String(pageNumber));
}

function createVisiblePageNumbers(currentPage: number, totalPages: number, siblingCount: number): (number | "ellipsis")[] {
  const firstVisiblePage = Math.max(1, currentPage - siblingCount);
  const lastVisiblePage = Math.min(totalPages, currentPage + siblingCount);
  const visiblePageNumbers: (number | "ellipsis")[] = [];
  if (firstVisiblePage > 1) visiblePageNumbers.push("ellipsis");
  for (let pageNumber = firstVisiblePage; pageNumber <= lastVisiblePage; pageNumber += 1) visiblePageNumbers.push(pageNumber);
  if (lastVisiblePage < totalPages) visiblePageNumbers.push("ellipsis");
  return visiblePageNumbers;
}

function PaginationLink({ href, isCurrent = false, label, children }: { href: string; isCurrent?: boolean; label: string; children: ReactNode }) {
  return (
    <li className="flex-1 sm:flex-initial">
      <Link href={href} aria-label={label} aria-current={isCurrent ? "page" : undefined} className={mergeClassNames(PAGINATION_LINK_CLASS_NAMES, isCurrent && "box!")}>
        {children}
      </Link>
    </li>
  );
}

/**
 * Link-based pagination (first, previous, page numbers, next, last). Server component: each page
 * is a URL, so it needs no client JavaScript. `pageHrefTemplate` must contain `{page}`.
 *
 * @example
 * <Pagination currentPage={2} totalPages={12} pageHrefTemplate="/users?page={page}" />
 */
export function Pagination({ currentPage, totalPages, pageHrefTemplate, siblingCount = 1, className }: PaginationProps) {
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);
  return (
    <nav aria-label="Pagination" className={mergeClassNames("mr-auto w-full flex-1 sm:w-auto", className)}>
      <ul className="mr-0 flex w-full sm:mr-auto sm:w-auto">
        <PaginationLink href={createPageHref(pageHrefTemplate, 1)} label="First page">
          <ChevronsLeft className="h-4 w-4 stroke-[1]" />
        </PaginationLink>
        <PaginationLink href={createPageHref(pageHrefTemplate, previousPage)} label="Previous page">
          <ChevronLeft className="h-4 w-4 stroke-[1]" />
        </PaginationLink>
        {createVisiblePageNumbers(currentPage, totalPages, siblingCount).map((pageNumber, positionIndex) =>
          pageNumber === "ellipsis" ? (
            <li key={`ellipsis-${positionIndex}`} className="flex-1 sm:flex-initial">
              <span className={PAGINATION_LINK_CLASS_NAMES}>...</span>
            </li>
          ) : (
            <PaginationLink key={pageNumber} href={createPageHref(pageHrefTemplate, pageNumber)} label={`Page ${pageNumber}`} isCurrent={pageNumber === currentPage}>
              {pageNumber}
            </PaginationLink>
          ),
        )}
        <PaginationLink href={createPageHref(pageHrefTemplate, nextPage)} label="Next page">
          <ChevronRight className="h-4 w-4 stroke-[1]" />
        </PaginationLink>
        <PaginationLink href={createPageHref(pageHrefTemplate, totalPages)} label="Last page">
          <ChevronsRight className="h-4 w-4 stroke-[1]" />
        </PaginationLink>
      </ul>
    </nav>
  );
}

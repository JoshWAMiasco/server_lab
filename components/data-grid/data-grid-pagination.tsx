"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ReactNode } from "react";
import { FormSelect } from "@/components/primitives/form-select";
import { mergeClassNames } from "@/utilities/merge-class-names";

const PAGE_BUTTON_CLASS_NAMES =
  "flex min-w-0 cursor-pointer items-center justify-center rounded-md border border-transparent px-1 py-2 font-normal text-foreground-strong transition duration-200 focus:ring-4 focus:ring-primary/20 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 sm:mr-2 sm:min-w-[40px] sm:px-3";

export interface DataGridPaginationProps {
  currentPageIndex: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPageIndexChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function PageButton({ label, isCurrent = false, isDisabled = false, onClick, children }: { label: string; isCurrent?: boolean; isDisabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <li className="flex-1 sm:flex-initial">
      <button type="button" aria-label={label} aria-current={isCurrent ? "page" : undefined} disabled={isDisabled} onClick={onClick} className={mergeClassNames(PAGE_BUTTON_CLASS_NAMES, isCurrent && "box!")}>
        {children}
      </button>
    </li>
  );
}

/**
 * Client-side pagination controls with a page-size select, used by `DataGrid`. For URL-based
 * pagination on server pages use `Pagination` instead.
 *
 * @example
 * <DataGridPagination currentPageIndex={0} pageCount={5} pageSize={10} pageSizeOptions={[10, 20]} onPageIndexChange={setPageIndex} onPageSizeChange={setPageSize} />
 */
export function DataGridPagination({ currentPageIndex, pageCount, pageSize, pageSizeOptions, onPageIndexChange, onPageSizeChange }: DataGridPaginationProps) {
  const lastPageIndex = Math.max(0, pageCount - 1);
  const firstVisiblePageIndex = Math.max(0, Math.min(currentPageIndex - 1, lastPageIndex - 2));
  const visiblePageIndexes = Array.from({ length: Math.min(3, pageCount) }, (_, offset) => firstVisiblePageIndex + offset);
  return (
    <div className="flex flex-col-reverse flex-wrap items-center gap-y-2 p-5 sm:flex-row">
      <nav aria-label="Table pagination" className="mr-auto w-full flex-1 sm:w-auto">
        <ul className="mr-0 flex w-full sm:mr-auto sm:w-auto">
          <PageButton label="First page" isDisabled={currentPageIndex === 0} onClick={() => onPageIndexChange(0)}><ChevronsLeft className="h-4 w-4 stroke-[1]" /></PageButton>
          <PageButton label="Previous page" isDisabled={currentPageIndex === 0} onClick={() => onPageIndexChange(currentPageIndex - 1)}><ChevronLeft className="h-4 w-4 stroke-[1]" /></PageButton>
          {visiblePageIndexes.map((pageIndex) => (
            <PageButton key={pageIndex} label={`Page ${pageIndex + 1}`} isCurrent={pageIndex === currentPageIndex} onClick={() => onPageIndexChange(pageIndex)}>{pageIndex + 1}</PageButton>
          ))}
          <PageButton label="Next page" isDisabled={currentPageIndex >= lastPageIndex} onClick={() => onPageIndexChange(currentPageIndex + 1)}><ChevronRight className="h-4 w-4 stroke-[1]" /></PageButton>
          <PageButton label="Last page" isDisabled={currentPageIndex >= lastPageIndex} onClick={() => onPageIndexChange(lastPageIndex)}><ChevronsRight className="h-4 w-4 stroke-[1]" /></PageButton>
        </ul>
      </nav>
      <FormSelect aria-label="Rows per page" value={String(pageSize)} onChange={(changeEvent) => onPageSizeChange(Number(changeEvent.target.value))} options={pageSizeOptions.map((pageSizeOption) => ({ label: String(pageSizeOption), value: String(pageSizeOption) }))} className="rounded-box sm:w-20" />
    </div>
  );
}

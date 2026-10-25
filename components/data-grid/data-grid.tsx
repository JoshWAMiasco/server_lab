"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown, FileCheck2, Printer } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuItem } from "@/components/interactive/dropdown-menu";
import { Button } from "@/components/primitives/button";
import { FormCheckbox } from "@/components/primitives/form-check";
import { FormLabel } from "@/components/primitives/form-field";
import { FormInput } from "@/components/primitives/form-input";
import { FormSelect } from "@/components/primitives/form-select";
import { DataGridPagination } from "@/components/data-grid/data-grid-pagination";
import { exportRowsAsCsv, exportRowsAsHtml, exportRowsAsJson, printRows, type ExportColumn } from "@/components/data-grid/export-rows";
import { mergeClassNames } from "@/utilities/merge-class-names";

export type DataGridFilterOperator = "like" | "=" | "<" | "<=" | ">" | ">=" | "!=";

export interface DataGridFilterField {
  label: string;
  columnIdentifier: string;
}

export interface DataGridProps<RowType> {
  columns: ColumnDef<RowType, unknown>[];
  rows: readonly RowType[];
  filterFields?: readonly DataGridFilterField[];
  exportColumns?: readonly ExportColumn<RowType>[];
  exportFileName?: string;
  pageSizeOptions?: readonly number[];
  isSelectable?: boolean;
  onSelectionChange?: (selectedRows: RowType[]) => void;
  emptyState?: ReactNode;
  className?: string;
}

const compareWithOperator: FilterFn<unknown> = (row, columnIdentifier, filterValue: { operator: DataGridFilterOperator; keyword: string }) => {
  const cellValue = row.getValue(columnIdentifier);
  const { operator, keyword } = filterValue;
  if (operator === "like") return String(cellValue ?? "").toLowerCase().includes(keyword.toLowerCase());
  const numericCellValue = Number(cellValue);
  const numericKeyword = Number(keyword);
  const isNumericComparison = !Number.isNaN(numericCellValue) && !Number.isNaN(numericKeyword);
  const leftValue = isNumericComparison ? numericCellValue : String(cellValue);
  const rightValue = isNumericComparison ? numericKeyword : keyword;
  if (operator === "=") return leftValue === rightValue;
  if (operator === "!=") return leftValue !== rightValue;
  if (operator === "<") return leftValue < rightValue;
  if (operator === "<=") return leftValue <= rightValue;
  if (operator === ">") return leftValue > rightValue;
  return leftValue >= rightValue;
};

const FILTER_OPERATOR_OPTIONS = (["like", "=", "<", "<=", ">", ">=", "!="] as const).map((operator) => ({ label: operator, value: operator }));

/**
 * A sortable, filterable, paginated table with selection and exports (replaces the template's
 * Tabulator). Column definitions contain render functions, so define them in a client file and
 * pass `rows` from a server component.
 *
 * @example
 * "use client";
 * const productColumns: ColumnDef<Product, unknown>[] = [
 *   createTextColumn({ columnIdentifier: "name", header: "Product Name", readValue: (product) => product.name }),
 *   createStatusColumn({ columnIdentifier: "status", header: "Status", readStatus: (product) => product.status }),
 * ];
 * export function ProductDataGrid({ products }: { products: readonly Product[] }) {
 *   return (
 *     <DataGrid
 *       columns={productColumns}
 *       rows={products}
 *       filterFields={[{ label: "Name", columnIdentifier: "name" }]}
 *       exportColumns={[{ header: "Name", readValue: (product) => product.name }]}
 *       exportFileName="products"
 *       isSelectable
 *     />
 *   );
 * }
 */
export function DataGrid<RowType>({
  columns,
  rows,
  filterFields = [],
  exportColumns,
  exportFileName = "export",
  pageSizeOptions = [10, 20, 30, 40],
  isSelectable = false,
  onSelectionChange,
  emptyState = "No matching records found",
  className,
}: DataGridProps<RowType>) {
  const [sortingState, setSortingState] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [filterColumnIdentifier, setFilterColumnIdentifier] = useState(filterFields[0]?.columnIdentifier ?? "");
  const [filterOperator, setFilterOperator] = useState<DataGridFilterOperator>("like");
  const [filterKeyword, setFilterKeyword] = useState("");

  const selectionColumn: ColumnDef<RowType, unknown> = {
    id: "row-selection",
    enableSorting: false,
    header: ({ table }) => <FormCheckbox aria-label="Select all rows" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />,
    cell: ({ row }) => <FormCheckbox aria-label="Select row" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
  };

  const table = useReactTable({
    data: rows as RowType[],
    columns: isSelectable ? [selectionColumn, ...columns] : columns,
    state: { sorting: sortingState, columnFilters, rowSelection },
    defaultColumn: { filterFn: compareWithOperator as FilterFn<RowType> },
    enableRowSelection: isSelectable,
    onSortingChange: setSortingState,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: (selectionUpdater) => {
      const nextSelection = typeof selectionUpdater === "function" ? selectionUpdater(rowSelection) : selectionUpdater;
      setRowSelection(nextSelection);
      onSelectionChange?.(Object.keys(nextSelection).filter((rowIndex) => nextSelection[rowIndex]).map((rowIndex) => rows[Number(rowIndex)] as RowType));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: pageSizeOptions[0] ?? 10 } },
  });

  const applyFilter = () => setColumnFilters(filterKeyword ? [{ id: filterColumnIdentifier, value: { operator: filterOperator, keyword: filterKeyword } }] : []);
  const resetFilter = () => {
    setFilterKeyword("");
    setFilterOperator("like");
    setColumnFilters([]);
  };
  const filteredRows = table.getFilteredRowModel().rows.map((row) => row.original);

  return (
    <div className={className}>
      {(filterFields.length > 0 || exportColumns) && (
        <div className="flex flex-col gap-y-2 p-5 xl:flex-row xl:items-center">
          {filterFields.length > 0 && (
            <form
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                applyFilter();
              }}
              className="flex flex-col gap-x-5 gap-y-2 rounded-box border border-dashed border-line-strong/80 p-4 sm:flex-row xl:items-center"
            >
              <div className="form-inline group flex flex-col items-start gap-y-2 xl:flex-row xl:items-center">
                <FormLabel className="mr-3 mb-0 whitespace-nowrap">Search by</FormLabel>
                <FormSelect value={filterColumnIdentifier} onChange={(changeEvent) => setFilterColumnIdentifier(changeEvent.target.value)} options={filterFields.map((filterField) => ({ label: filterField.label, value: filterField.columnIdentifier }))} className="w-full 2xl:w-full" />
              </div>
              <div className="form-inline group flex flex-col items-start gap-y-2 xl:flex-row xl:items-center">
                <FormLabel className="mr-3 mb-0 whitespace-nowrap">Type</FormLabel>
                <FormSelect value={filterOperator} onChange={(changeEvent) => setFilterOperator(changeEvent.target.value as DataGridFilterOperator)} options={FILTER_OPERATOR_OPTIONS} className="w-full sm:w-auto" />
              </div>
              <div className="form-inline group flex flex-col items-start gap-y-2 xl:flex-row xl:items-center">
                <FormLabel className="mr-3 mb-0 whitespace-nowrap">Keywords</FormLabel>
                <FormInput value={filterKeyword} onChange={(changeEvent) => setFilterKeyword(changeEvent.target.value)} placeholder="Search..." className="sm:w-40 2xl:w-full" />
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row xl:mt-0">
                <Button type="submit" variant="primary" className="w-full sm:w-16">Search</Button>
                <Button variant="outline-secondary" onClick={resetFilter} className="w-full sm:w-16">Reset</Button>
              </div>
            </form>
          )}
          {exportColumns && (
            <div className="mt-3 flex flex-col gap-x-3 gap-y-2 sm:flex-row xl:mt-0 xl:ml-auto">
              <Button variant="outline-secondary" onClick={() => printRows(filteredRows, exportColumns)} leadingIcon={<Printer className="mr-2 h-4 w-4 stroke-[1.3]" />}>
                Print
              </Button>
              <DropdownMenu
                placement="bottom end"
                menuClassName="w-48"
                trigger={
                  <span className="inline-flex items-center justify-center rounded-md border border-secondary px-3 py-2 font-medium text-foreground-muted shadow-xs">
                    <FileCheck2 className="mr-2 h-4 w-4 stroke-[1.3]" />
                    Export
                    <ChevronDown className="ml-2 h-4 w-4 stroke-[1.3]" />
                  </span>
                }
              >
                <DropdownMenuItem onSelect={() => exportRowsAsCsv(filteredRows, exportColumns, `${exportFileName}.csv`)} icon={<FileCheck2 className="mr-2 h-4 w-4 stroke-[1]" />}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportRowsAsJson(filteredRows, exportColumns, `${exportFileName}.json`)} icon={<FileCheck2 className="mr-2 h-4 w-4 stroke-[1]" />}>Export JSON</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportRowsAsHtml(filteredRows, exportColumns, `${exportFileName}.html`)} icon={<FileCheck2 className="mr-2 h-4 w-4 stroke-[1]" />}>Export HTML</DropdownMenuItem>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}
      <div className="scrollbar-hidden overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDirection = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th key={header.id} className="border-t border-b border-line/60 bg-surface-subtle px-5 py-4 font-medium whitespace-nowrap text-foreground-muted">
                      {header.isPlaceholder ? null : canSort ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()} className="flex cursor-pointer items-center gap-1 uppercase">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDirection === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : sortDirection === "desc" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="border-b border-dashed px-5 py-10 text-center text-foreground-muted">
                  {emptyState}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={mergeClassNames("last:[&_td]:border-b-0", row.getIsSelected() && "bg-primary/5")}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="border-b border-dashed border-line-strong/70 px-5 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <DataGridPagination
        currentPageIndex={table.getState().pagination.pageIndex}
        pageCount={table.getPageCount()}
        pageSize={table.getState().pagination.pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageIndexChange={(pageIndex) => table.setPageIndex(pageIndex)}
        onPageSizeChange={(pageSize) => table.setPageSize(pageSize)}
      />
    </div>
  );
}

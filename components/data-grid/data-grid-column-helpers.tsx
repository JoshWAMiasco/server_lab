import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Avatar } from "@/components/primitives/avatar";
import { StatusIndicator, type StatusIndicatorTone } from "@/components/primitives/status-indicator";
import { formatDate } from "@/utilities/format-date";

interface ColumnHelperBaseOptions {
  columnIdentifier: string;
  header: string;
  isSortable?: boolean;
}

/**
 * A text column, optionally with a muted second line.
 *
 * @example
 * createTextColumn<Product>({ columnIdentifier: "name", header: "Product Name", readValue: (product) => product.name, readSecondaryText: (product) => product.categoryName })
 */
export function createTextColumn<RowType>({ columnIdentifier, header, isSortable = true, readValue, readSecondaryText }: ColumnHelperBaseOptions & { readValue: (row: RowType) => string | number; readSecondaryText?: (row: RowType) => ReactNode }): ColumnDef<RowType, unknown> {
  return {
    id: columnIdentifier,
    header,
    accessorFn: readValue,
    enableSorting: isSortable,
    cell: (cellContext) => (
      <div>
        <div className="font-medium whitespace-nowrap">{cellContext.getValue() as ReactNode}</div>
        {readSecondaryText && <div className="mt-0.5 text-xs whitespace-nowrap text-foreground-muted">{readSecondaryText(cellContext.row.original)}</div>}
      </div>
    ),
  };
}

/**
 * A person column: avatar, name and a muted second line (email, role…).
 *
 * @example
 * createAvatarColumn<User>({ columnIdentifier: "fullName", header: "Name", readName: (user) => user.fullName, readPhotoUrl: (user) => buildUserPhotoPath(user.photoNumber), readSecondaryText: (user) => user.emailAddress })
 */
export function createAvatarColumn<RowType>({ columnIdentifier, header, isSortable = true, readName, readPhotoUrl, readSecondaryText }: ColumnHelperBaseOptions & { readName: (row: RowType) => string; readPhotoUrl: (row: RowType) => string; readSecondaryText?: (row: RowType) => ReactNode }): ColumnDef<RowType, unknown> {
  return {
    id: columnIdentifier,
    header,
    accessorFn: readName,
    enableSorting: isSortable,
    cell: (cellContext) => (
      <div className="flex items-center">
        <Avatar photoUrl={readPhotoUrl(cellContext.row.original)} name={readName(cellContext.row.original)} isZoomable />
        <div className="ml-3.5">
          <div className="font-medium whitespace-nowrap">{readName(cellContext.row.original)}</div>
          {readSecondaryText && <div className="mt-0.5 text-xs whitespace-nowrap text-foreground-muted">{readSecondaryText(cellContext.row.original)}</div>}
        </div>
      </div>
    ),
  };
}

/**
 * A colored status column. Map each status to a label and tone with `statusAppearance`.
 *
 * @example
 * createStatusColumn<Product>({ columnIdentifier: "status", header: "Status", readStatus: (product) => product.status,
 *   statusAppearance: { active: { label: "Active", tone: "success" }, inactive: { label: "Inactive", tone: "danger" } } })
 */
export function createStatusColumn<RowType, StatusValue extends string>({ columnIdentifier, header, isSortable = true, readStatus, statusAppearance }: ColumnHelperBaseOptions & { readStatus: (row: RowType) => StatusValue; statusAppearance: Record<StatusValue, { label: string; tone: StatusIndicatorTone }> }): ColumnDef<RowType, unknown> {
  return {
    id: columnIdentifier,
    header,
    accessorFn: readStatus,
    enableSorting: isSortable,
    cell: (cellContext) => {
      const appearance = statusAppearance[readStatus(cellContext.row.original)];
      return <StatusIndicator label={appearance.label} tone={appearance.tone} />;
    },
  };
}

/**
 * A date column formatted with a dayjs pattern.
 *
 * @example
 * createDateColumn<User>({ columnIdentifier: "joinedDate", header: "Joined Date", readIsoDate: (user) => user.joinedDate })
 */
export function createDateColumn<RowType>({ columnIdentifier, header, isSortable = true, readIsoDate, displayFormat }: ColumnHelperBaseOptions & { readIsoDate: (row: RowType) => string; displayFormat?: string }): ColumnDef<RowType, unknown> {
  return { id: columnIdentifier, header, accessorFn: readIsoDate, enableSorting: isSortable, cell: (cellContext) => <span className="whitespace-nowrap">{formatDate(String(cellContext.getValue()), displayFormat)}</span> };
}

/**
 * A non-sortable column for per-row actions (menus, buttons).
 *
 * @example
 * createActionsColumn<User>({ columnIdentifier: "actions", header: "Action", renderActions: (user) => <UserRowActionsMenu userId={user.id} /> })
 */
export function createActionsColumn<RowType>({ columnIdentifier, header, renderActions }: Omit<ColumnHelperBaseOptions, "isSortable"> & { renderActions: (row: RowType) => ReactNode }): ColumnDef<RowType, unknown> {
  return { id: columnIdentifier, header, enableSorting: false, cell: (cellContext) => <div className="flex items-center justify-center">{renderActions(cellContext.row.original)}</div> };
}

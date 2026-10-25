export interface ExportColumn<RowType> {
  header: string;
  readValue: (row: RowType) => string | number;
}

function downloadBlob(fileContent: BlobPart, fileName: string, mimeType: string) {
  const downloadUrl = URL.createObjectURL(new Blob([fileContent], { type: mimeType }));
  const downloadLink = document.createElement("a");
  downloadLink.href = downloadUrl;
  downloadLink.download = fileName;
  downloadLink.click();
  URL.revokeObjectURL(downloadUrl);
}

/*
 * Cells starting with = + - @ (or tab/CR) are run as formulas by spreadsheet apps. Login
 * usernames come from whoever tries to SSH in, so such cells get a leading apostrophe.
 */
function neutralizeFormula(textValue: string): string {
  return /^[=+\-@\t\r]/.test(textValue) ? `'${textValue}` : textValue;
}

function escapeCsvValue(cellValue: string | number): string {
  const textValue = typeof cellValue === "number" ? String(cellValue) : neutralizeFormula(cellValue);
  return /[",\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
}

/**
 * Downloads rows as a CSV file. Client-only.
 *
 * @example
 * exportRowsAsCsv(products, [{ header: "Name", readValue: (product) => product.name }], "products.csv");
 */
export function exportRowsAsCsv<RowType>(rows: readonly RowType[], exportColumns: readonly ExportColumn<RowType>[], fileName: string): void {
  const headerLine = exportColumns.map((exportColumn) => escapeCsvValue(exportColumn.header)).join(",");
  const rowLines = rows.map((row) => exportColumns.map((exportColumn) => escapeCsvValue(exportColumn.readValue(row))).join(","));
  downloadBlob([headerLine, ...rowLines].join("\n"), fileName, "text/csv;charset=utf-8");
}

/**
 * Downloads rows as a JSON file. Client-only.
 *
 * @example
 * exportRowsAsJson(products, exportColumns, "products.json");
 */
export function exportRowsAsJson<RowType>(rows: readonly RowType[], exportColumns: readonly ExportColumn<RowType>[], fileName: string): void {
  const exportedRows = rows.map((row) => Object.fromEntries(exportColumns.map((exportColumn) => [exportColumn.header, exportColumn.readValue(row)])));
  downloadBlob(JSON.stringify(exportedRows, null, 2), fileName, "application/json");
}

/**
 * Downloads rows as a standalone HTML table. Client-only.
 *
 * @example
 * exportRowsAsHtml(products, exportColumns, "products.html");
 */
export function exportRowsAsHtml<RowType>(rows: readonly RowType[], exportColumns: readonly ExportColumn<RowType>[], fileName: string): void {
  downloadBlob(createHtmlTable(rows, exportColumns), fileName, "text/html");
}

function escapeHtml(textValue: string | number): string {
  return String(textValue).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
}

function createHtmlTable<RowType>(rows: readonly RowType[], exportColumns: readonly ExportColumn<RowType>[]): string {
  const headerCells = exportColumns.map((exportColumn) => `<th>${escapeHtml(exportColumn.header)}</th>`).join("");
  const bodyRows = rows.map((row) => `<tr>${exportColumns.map((exportColumn) => `<td>${escapeHtml(exportColumn.readValue(row))}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}th{background:#f1f5f9}</style></head><body><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
}

/**
 * Opens the browser print dialog with the rows laid out as a plain table. Client-only.
 *
 * @example
 * printRows(products, exportColumns);
 */
export function printRows<RowType>(rows: readonly RowType[], exportColumns: readonly ExportColumn<RowType>[]): void {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;
  printWindow.document.write(createHtmlTable(rows, exportColumns));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

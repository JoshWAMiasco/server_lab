/*
 * Parses one `lspci -mm -s <address>` line:
 *   00:1f.6 "Ethernet controller" "Intel Corporation" "Ethernet Connection (2) I219-LM" -r31 -p00 "Hewlett-Packard Company" "Device 80d5"
 * into "Intel Corporation Ethernet Connection (2) I219-LM" (vendor + device), or null.
 */
export function parseLspciDeviceName(text: string): string | null {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
  const fields = [...firstLine.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  if (fields.length < 3) return null;
  const name = `${fields[1]} ${fields[2]}`.replaceAll(/\s+/g, " ").trim();
  return name === "" ? null : name;
}

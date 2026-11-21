/*
 * The display name from /etc/os-release: PRETTY_NAME ("Ubuntu 24.04.1 LTS"), else NAME plus
 * VERSION, else null. Values may be double- or single-quoted.
 */
export function parseOsReleaseName(text: string): string | null {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values.set(match[1] ?? "", (match[2] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim());
  }
  const prettyName = values.get("PRETTY_NAME");
  if (prettyName) return prettyName;
  const name = values.get("NAME");
  if (!name) return null;
  const version = values.get("VERSION");
  return version ? `${name} ${version}` : name;
}

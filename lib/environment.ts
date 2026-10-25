/**
 * Reads an environment variable, treating an empty value as unset (systemd `EnvironmentFile`
 * lines like `NTFY_URL=` define the variable as an empty string).
 */
export function readEnvironment(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

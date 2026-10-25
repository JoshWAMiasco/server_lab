export type ThemeColorName =
  | "canvas"
  | "surface"
  | "surface-subtle"
  | "surface-muted"
  | "surface-strong"
  | "surface-heavy"
  | "foreground-strong"
  | "foreground"
  | "foreground-muted"
  | "foreground-subtle"
  | "foreground-faint"
  | "field"
  | "line"
  | "line-strong"
  | "on-primary"
  | "on-neutral"
  | "brand"
  | "accent"
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "pending"
  | "danger"
  | "light"
  | "dark";

function convertHexToChannels(hexColor: string): string {
  const digits = hexColor.replace("#", "");
  const fullDigits = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits.slice(0, 6);
  const red = Number.parseInt(fullDigits.slice(0, 2), 16);
  const green = Number.parseInt(fullDigits.slice(2, 4), 16);
  const blue = Number.parseInt(fullDigits.slice(4, 6), 16);
  return `${red} ${green} ${blue}`;
}

/**
 * Reads a design-token colour (see styles/design-tokens.css) as an `rgb()` string, for libraries
 * that need concrete colours (Chart.js, Leaflet). Client-only: call it in effects or event handlers.
 *
 * @example
 * readThemeColor("primary"); // "rgb(0 240 255 / 1)"
 * readThemeColor("line", 0.5); // "rgb(38 38 63 / 0.5)"
 */
export function readThemeColor(colorName: ThemeColorName, opacity = 1): string {
  const declaredValue = getComputedStyle(document.documentElement).getPropertyValue(`--color-${colorName}`).trim();
  const channels = declaredValue.startsWith("#") ? convertHexToChannels(declaredValue) : "0 0 0";
  return `rgb(${channels} / ${opacity})`;
}

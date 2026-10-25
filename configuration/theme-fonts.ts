import localFont from "next/font/local";

/** Chakra Petch, the display face for headings, brand and highlighted numbers (`font-display`). */
export const DISPLAY_FONT = localFont({
  variable: "--font-family-display",
  src: [
    { path: "../styles/fonts/chakra-petch-latin-500-weight.woff2", weight: "500", style: "normal" },
    { path: "../styles/fonts/chakra-petch-latin-600-weight.woff2", weight: "600", style: "normal" },
    { path: "../styles/fonts/chakra-petch-latin-700-weight.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

/** Roboto Mono, the body face for all other text (`font-body`, the default). */
export const BODY_FONT = localFont({
  variable: "--font-family-body",
  src: [{ path: "../styles/fonts/roboto-mono-latin-variable-weight.woff2", weight: "100 700", style: "normal" }],
  display: "swap",
});

/**
 * The font variable classes the root layout puts on `<html>`. The font files are bundled in
 * styles/fonts, so the theme renders the same without an internet connection.
 *
 * @example
 * <html className={THEME_FONT_VARIABLE_CLASS_NAMES}>
 */
export const THEME_FONT_VARIABLE_CLASS_NAMES = `${DISPLAY_FONT.variable} ${BODY_FONT.variable}`;

import type { Metadata } from "next";
import { THEME_FONT_VARIABLE_CLASS_NAMES } from "@/configuration/theme-fonts";
import { THEME_IDENTITY } from "@/configuration/theme-identity";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { template: `%s · ${THEME_IDENTITY.productName}`, default: THEME_IDENTITY.productName },
  description: "A minimalist dashboard for one homelab server.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${THEME_IDENTITY.themeName} ${THEME_FONT_VARIABLE_CLASS_NAMES}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

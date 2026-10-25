import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/*
 * The icon routes set their own, stricter sandboxing CSP, so the page CSP skips them; the other
 * security headers apply everywhere.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2", "maxmind"],
  poweredByHeader: false,
  agentRules: false,
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  headers: async () => [
    {
      source: "/:path((?!custom-icons/|catalog-icons/).*)",
      headers: [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }],
    },
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;

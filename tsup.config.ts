import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "collector/index.ts" },
  outDir: "dist/collector",
  format: ["cjs"],
  platform: "node",
  target: "node22",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["better-sqlite3", "@node-rs/argon2", "maxmind"],
});

import { defineConfig, type Options } from "tsup";

const shared: Options = {
  format: ["cjs"],
  platform: "node",
  target: "node22",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
};

export default defineConfig([
  { ...shared, entry: { index: "collector/index.ts" }, outDir: "dist/collector", external: ["better-sqlite3", "@node-rs/argon2", "maxmind"] },
  /* The root helper is copied to /usr/local/libexec/serverlab/ as one self-contained file. */
  { ...shared, entry: { index: "host-action/index.ts" }, outDir: "dist/host-action", sourcemap: false, noExternal: [/.*/] },
]);

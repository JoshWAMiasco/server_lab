import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./lib/schema/alerts.ts", "./lib/schema/authentication.ts", "./lib/schema/lobby.ts", "./lib/schema/metrics.ts", "./lib/schema/security.ts", "./lib/schema/system.ts", "./lib/schema/watcher.ts"],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "./data/serverlab.db" },
});

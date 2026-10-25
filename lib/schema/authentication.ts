import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The single admin account (id is always 1). */
export const adminAccount = sqliteTable("admin", {
  id: integer("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Web sessions; only the SHA-256 of the token is stored. */
export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  lastSeen: integer("last_seen").notNull(),
  ipAddress: text("ip"),
  userAgent: text("user_agent"),
});

/** Failed sign-in counters per client IP. */
export const loginThrottle = sqliteTable("login_throttle", {
  ipAddress: text("ip").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: integer("window_started_at").notNull(),
  lockoutCount: integer("lockout_count").notNull().default(0),
  lockedUntil: integer("locked_until"),
});

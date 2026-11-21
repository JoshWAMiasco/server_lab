CREATE TABLE `boot_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_id` integer DEFAULT 1 NOT NULL,
	`boot_id` text NOT NULL,
	`booted_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`ended_at` integer,
	`end_kind` text,
	`streak_started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `boot_sessions_boot_id_unique` ON `boot_sessions` (`boot_id`);--> statement-breakpoint
CREATE INDEX `boot_sessions_booted_at` ON `boot_sessions` (`booted_at`);
CREATE TABLE `alert_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_id` integer DEFAULT 1 NOT NULL,
	`rule_id` integer,
	`rule_name` text NOT NULL,
	`entity` text DEFAULT '' NOT NULL,
	`state` text NOT NULL,
	`value` real,
	`message` text NOT NULL,
	`started_at` integer NOT NULL,
	`resolved_at` integer,
	`notified_at` integer,
	`acknowledged` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `alert_events_started` ON `alert_events` (`started_at`);--> statement-breakpoint
CREATE INDEX `alert_events_state` ON `alert_events` (`state`);--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`metric` text,
	`entity` text,
	`op` text,
	`threshold` real,
	`for_s` integer DEFAULT 0 NOT NULL,
	`event` text,
	`params` text DEFAULT '{}' NOT NULL,
	`cooldown_s` integer DEFAULT 1800 NOT NULL,
	`channels` text DEFAULT '["inapp"]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`seed_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_rules_seed_key_unique` ON `alert_rules` (`seed_key`);--> statement-breakpoint
CREATE TABLE `admin` (
	`id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_throttle` (
	`ip` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL,
	`lockout_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`ip` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE TABLE `discovered_items` (
	`key` text PRIMARY KEY NOT NULL,
	`host_id` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`raw_name` text NOT NULL,
	`image` text,
	`unit` text,
	`process_name` text,
	`description` text,
	`ports` text DEFAULT '[]' NOT NULL,
	`labels` text DEFAULT '{}' NOT NULL,
	`catalog_id` text,
	`state` text DEFAULT 'unknown' NOT NULL,
	`health` text DEFAULT 'none' NOT NULL,
	`bind_scope` text DEFAULT 'local' NOT NULL,
	`via_nginx_key` text,
	`extra` text DEFAULT '{}' NOT NULL,
	`started_at` integer,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lobby_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text,
	`name` text,
	`description` text,
	`url` text,
	`icon` text,
	`category` text,
	`hidden` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`health_check_url` text,
	`health_check_state` text,
	`health_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lobby_items_key_unique` ON `lobby_items` (`key`);--> statement-breakpoint
CREATE TABLE `app_usage_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_id` integer DEFAULT 1 NOT NULL,
	`ts` integer NOT NULL,
	`app_key` text NOT NULL,
	`source` text NOT NULL,
	`cpu_pct` real NOT NULL,
	`mem_bytes` integer NOT NULL,
	`mem_limit` integer
);
--> statement-breakpoint
CREATE INDEX `app_usage_samples_ts` ON `app_usage_samples` (`ts`);--> statement-breakpoint
CREATE INDEX `app_usage_samples_key_ts` ON `app_usage_samples` (`app_key`,`ts`);--> statement-breakpoint
CREATE TABLE `cpu_core_samples` (
	`sample_id` integer NOT NULL,
	`core` integer NOT NULL,
	`pct` real NOT NULL,
	FOREIGN KEY (`sample_id`) REFERENCES `metric_samples`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cpu_core_samples_sample` ON `cpu_core_samples` (`sample_id`);--> statement-breakpoint
CREATE TABLE `disk_io_samples` (
	`sample_id` integer NOT NULL,
	`device` text NOT NULL,
	`read_bps` real NOT NULL,
	`write_bps` real NOT NULL,
	FOREIGN KEY (`sample_id`) REFERENCES `metric_samples`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `disk_io_samples_sample` ON `disk_io_samples` (`sample_id`);--> statement-breakpoint
CREATE TABLE `fs_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_id` integer DEFAULT 1 NOT NULL,
	`ts` integer NOT NULL,
	`mount` text NOT NULL,
	`device` text NOT NULL,
	`fstype` text NOT NULL,
	`used` integer NOT NULL,
	`size` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fs_usage_ts` ON `fs_usage` (`ts`);--> statement-breakpoint
CREATE TABLE `gpu_samples` (
	`sample_id` integer NOT NULL,
	`gpu_index` integer NOT NULL,
	`vendor` text NOT NULL,
	`name` text NOT NULL,
	`util_pct` real,
	`vram_used` integer,
	`vram_total` integer,
	`temp_c` real,
	`power_w` real,
	FOREIGN KEY (`sample_id`) REFERENCES `metric_samples`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gpu_samples_sample` ON `gpu_samples` (`sample_id`);--> statement-breakpoint
CREATE TABLE `metric_rollups` (
	`host_id` integer DEFAULT 1 NOT NULL,
	`bucket_ts` integer NOT NULL,
	`resolution` text NOT NULL,
	`metric` text NOT NULL,
	`entity` text DEFAULT '' NOT NULL,
	`avg` real NOT NULL,
	`max` real NOT NULL,
	`min` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metric_rollups_unique` ON `metric_rollups` (`host_id`,`resolution`,`metric`,`entity`,`bucket_ts`);--> statement-breakpoint
CREATE TABLE `metric_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_id` integer DEFAULT 1 NOT NULL,
	`ts` integer NOT NULL,
	`cpu_pct` real NOT NULL,
	`load1` real NOT NULL,
	`load5` real NOT NULL,
	`load15` real NOT NULL,
	`mem_used` integer NOT NULL,
	`mem_total` integer NOT NULL,
	`mem_cached` integer DEFAULT 0 NOT NULL,
	`swap_used` integer NOT NULL,
	`swap_total` integer NOT NULL,
	`cpu_temp_c` real,
	`net_rx_bps` real NOT NULL,
	`net_tx_bps` real NOT NULL,
	`disk_read_bps` real NOT NULL,
	`disk_write_bps` real NOT NULL,
	`uptime_s` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `metric_samples_ts` ON `metric_samples` (`ts`);--> statement-breakpoint
CREATE TABLE `net_iface_samples` (
	`sample_id` integer NOT NULL,
	`iface` text NOT NULL,
	`rx_bps` real NOT NULL,
	`tx_bps` real NOT NULL,
	FOREIGN KEY (`sample_id`) REFERENCES `metric_samples`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `net_iface_samples_sample` ON `net_iface_samples` (`sample_id`);--> statement-breakpoint
CREATE TABLE `temp_sensors` (
	`sample_id` integer NOT NULL,
	`label` text NOT NULL,
	`temp_c` real NOT NULL,
	FOREIGN KEY (`sample_id`) REFERENCES `metric_samples`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `temp_sensors_sample` ON `temp_sensors` (`sample_id`);--> statement-breakpoint
CREATE TABLE `capabilities` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collector_heartbeat` (
	`id` integer PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`version` text NOT NULL,
	`driver` text NOT NULL,
	`hostname` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_id` integer DEFAULT 1 NOT NULL,
	`ts` integer NOT NULL,
	`channel` text NOT NULL,
	`username` text NOT NULL,
	`result` text NOT NULL,
	`method` text NOT NULL,
	`src_ip` text,
	`src_port` integer,
	`geo_country` text,
	`geo_country_code` text,
	`geo_city` text,
	`geo_lat` real,
	`geo_lon` real,
	`network_tag` text,
	`backfilled` integer DEFAULT false NOT NULL,
	`tailnet_device` text,
	`raw` text,
	`dedupe_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `login_events_dedupe_hash_unique` ON `login_events` (`dedupe_hash`);--> statement-breakpoint
CREATE INDEX `login_events_ts` ON `login_events` (`ts`);--> statement-breakpoint
CREATE INDEX `login_events_src` ON `login_events` (`src_ip`);
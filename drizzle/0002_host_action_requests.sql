CREATE TABLE `host_action_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`requested_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `host_action_requests_status` ON `host_action_requests` (`status`);--> statement-breakpoint
CREATE INDEX `host_action_requests_requested` ON `host_action_requests` (`requested_at`);
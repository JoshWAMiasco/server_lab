CREATE TABLE `custom_icons` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`bytes` blob NOT NULL,
	`original_name` text,
	`created_at` integer NOT NULL
);

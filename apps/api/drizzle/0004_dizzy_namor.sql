CREATE TABLE `collector_checkpoints` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`group_id` varchar(36) NOT NULL,
	`last_post_id` varchar(100),
	`last_post_url` varchar(700),
	`last_scan` datetime,
	`last_cursor` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collector_checkpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `collector_checkpoints_group_unique` UNIQUE(`group_id`)
);
--> statement-breakpoint
CREATE TABLE `collector_runs` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` datetime,
	`groups_processed` int NOT NULL DEFAULT 0,
	`posts_collected` int NOT NULL DEFAULT 0,
	`errors` int NOT NULL DEFAULT 0,
	`error_summary` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collector_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `facebook_raw_signals` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`group_id` varchar(36) NOT NULL,
	`facebook_post_id` varchar(100),
	`post_url` varchar(700) NOT NULL,
	`raw_html` text,
	`raw_json` text,
	`content_hash` varchar(64) NOT NULL,
	`collected_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `facebook_raw_signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `facebook_raw_signals_workspace_url_unique` UNIQUE(`workspace_id`,`post_url`)
);
--> statement-breakpoint
CREATE TABLE `facebook_signals` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`group_id` varchar(36) NOT NULL,
	`facebook_post_id` varchar(100),
	`post_url` varchar(700) NOT NULL,
	`author_name` varchar(255),
	`author_profile` varchar(700),
	`message` text,
	`media_urls` text,
	`created_time` datetime,
	`normalized_hash` varchar(64) NOT NULL,
	`normalized_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `facebook_signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `facebook_signals_workspace_url_unique` UNIQUE(`workspace_id`,`post_url`)
);
--> statement-breakpoint
ALTER TABLE `collector_checkpoints` ADD CONSTRAINT `collector_checkpoints_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collector_checkpoints` ADD CONSTRAINT `collector_checkpoints_group_id_facebook_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `facebook_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collector_runs` ADD CONSTRAINT `collector_runs_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `facebook_raw_signals` ADD CONSTRAINT `facebook_raw_signals_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `facebook_raw_signals` ADD CONSTRAINT `facebook_raw_signals_group_id_facebook_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `facebook_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `facebook_signals` ADD CONSTRAINT `facebook_signals_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `facebook_signals` ADD CONSTRAINT `facebook_signals_group_id_facebook_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `facebook_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `collector_runs_workspace_idx` ON `collector_runs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `facebook_raw_signals_group_idx` ON `facebook_raw_signals` (`group_id`);--> statement-breakpoint
CREATE INDEX `facebook_raw_signals_hash_idx` ON `facebook_raw_signals` (`content_hash`);--> statement-breakpoint
CREATE INDEX `facebook_signals_fb_post_idx` ON `facebook_signals` (`workspace_id`,`facebook_post_id`);--> statement-breakpoint
CREATE INDEX `facebook_signals_hash_idx` ON `facebook_signals` (`workspace_id`,`normalized_hash`);--> statement-breakpoint
CREATE INDEX `facebook_signals_group_idx` ON `facebook_signals` (`group_id`);
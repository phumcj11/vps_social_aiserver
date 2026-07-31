CREATE TABLE `business_facebook_groups` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`facebook_group_id` varchar(36) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_facebook_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_facebook_groups_unique` UNIQUE(`business_id`,`facebook_group_id`)
);
--> statement-breakpoint
CREATE TABLE `facebook_groups` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`facebook_group_id` varchar(100),
	`name` varchar(255),
	`canonical_url` varchar(500) NOT NULL,
	`original_url` varchar(1000) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`access_state` varchar(30) NOT NULL DEFAULT 'unknown',
	`last_validated_at` datetime,
	`last_error_code` varchar(40),
	`last_error_message` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `facebook_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `facebook_groups_workspace_url_unique` UNIQUE(`workspace_id`,`canonical_url`),
	CONSTRAINT `facebook_groups_workspace_fbid_unique` UNIQUE(`workspace_id`,`facebook_group_id`)
);
--> statement-breakpoint
ALTER TABLE `business_facebook_groups` ADD CONSTRAINT `business_facebook_groups_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_facebook_groups` ADD CONSTRAINT `business_facebook_groups_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_facebook_groups` ADD CONSTRAINT `business_facebook_groups_facebook_group_id_facebook_groups_id_fk` FOREIGN KEY (`facebook_group_id`) REFERENCES `facebook_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `facebook_groups` ADD CONSTRAINT `facebook_groups_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_facebook_groups_group_idx` ON `business_facebook_groups` (`facebook_group_id`);--> statement-breakpoint
CREATE INDEX `business_facebook_groups_business_idx` ON `business_facebook_groups` (`business_id`);--> statement-breakpoint
CREATE INDEX `facebook_groups_workspace_idx` ON `facebook_groups` (`workspace_id`);
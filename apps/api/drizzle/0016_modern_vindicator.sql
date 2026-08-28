CREATE TABLE `business_group_subscriptions` (
	`id` varchar(36) NOT NULL,
	`source_group_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_group_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_group_subscriptions_unique` UNIQUE(`source_group_id`,`business_id`)
);
--> statement-breakpoint
ALTER TABLE `business_group_subscriptions` ADD CONSTRAINT `business_group_subscriptions_source_group_id_facebook_groups_id_fk` FOREIGN KEY (`source_group_id`) REFERENCES `facebook_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_group_subscriptions` ADD CONSTRAINT `business_group_subscriptions_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_group_subscriptions_source_group_idx` ON `business_group_subscriptions` (`source_group_id`);--> statement-breakpoint
CREATE INDEX `business_group_subscriptions_business_idx` ON `business_group_subscriptions` (`business_id`);
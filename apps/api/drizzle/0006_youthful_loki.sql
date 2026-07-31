CREATE TABLE `business_matches` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`opportunity_id` varchar(36) NOT NULL,
	`decision` varchar(10) NOT NULL,
	`reasons` text,
	`matcher_version` varchar(40) NOT NULL,
	`matched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_matches_opportunity_business_unique` UNIQUE(`opportunity_id`,`business_id`)
);
--> statement-breakpoint
ALTER TABLE `business_matches` ADD CONSTRAINT `business_matches_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_matches` ADD CONSTRAINT `business_matches_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_matches` ADD CONSTRAINT `business_matches_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_matches_workspace_idx` ON `business_matches` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `business_matches_opportunity_idx` ON `business_matches` (`opportunity_id`);--> statement-breakpoint
CREATE INDEX `business_matches_business_idx` ON `business_matches` (`business_id`);
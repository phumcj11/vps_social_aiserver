CREATE TABLE `property_matches` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`opportunity_id` varchar(36) NOT NULL,
	`business_match_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`property_id` varchar(36),
	`decision` varchar(10) NOT NULL,
	`reasons` text,
	`matcher_version` varchar(40) NOT NULL,
	`candidates_evaluated` int NOT NULL DEFAULT 0,
	`evaluated_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `property_matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `property_matches_business_match_unique` UNIQUE(`business_match_id`)
);
--> statement-breakpoint
ALTER TABLE `review_tasks` ADD `business_id` varchar(36);--> statement-breakpoint
ALTER TABLE `review_tasks` ADD `property_id` varchar(36);--> statement-breakpoint
ALTER TABLE `review_tasks` ADD `property_match_id` varchar(36);--> statement-breakpoint
ALTER TABLE `review_tasks` ADD `context_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `property_matches` ADD CONSTRAINT `property_matches_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_matches` ADD CONSTRAINT `property_matches_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_matches` ADD CONSTRAINT `property_matches_business_match_id_business_matches_id_fk` FOREIGN KEY (`business_match_id`) REFERENCES `business_matches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_matches` ADD CONSTRAINT `property_matches_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_matches` ADD CONSTRAINT `property_matches_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `property_matches_workspace_idx` ON `property_matches` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `property_matches_opportunity_idx` ON `property_matches` (`opportunity_id`);--> statement-breakpoint
CREATE INDEX `property_matches_business_idx` ON `property_matches` (`business_id`);--> statement-breakpoint
CREATE INDEX `property_matches_property_idx` ON `property_matches` (`property_id`);--> statement-breakpoint
CREATE INDEX `property_matches_decision_idx` ON `property_matches` (`workspace_id`,`decision`);
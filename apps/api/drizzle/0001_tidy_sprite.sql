CREATE TABLE `business_knowledge` (
	`id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_knowledge_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_matching_rules` (
	`id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`rule_type` varchar(40) NOT NULL,
	`rule_value` varchar(255) NOT NULL,
	`priority` int NOT NULL DEFAULT 0,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_matching_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_profiles` (
	`id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`category` varchar(120),
	`description` text,
	`selling_points` text,
	`service_area` text,
	`contact_information` text,
	`response_tone` varchar(120),
	`prohibited_claims` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_profiles_business_unique` UNIQUE(`business_id`)
);
--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `businesses_id` PRIMARY KEY(`id`),
	CONSTRAINT `businesses_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `businesses_workspace_name_unique` UNIQUE(`workspace_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `business_knowledge` ADD CONSTRAINT `business_knowledge_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_matching_rules` ADD CONSTRAINT `business_matching_rules_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_profiles` ADD CONSTRAINT `business_profiles_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `businesses` ADD CONSTRAINT `businesses_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_knowledge_business_idx` ON `business_knowledge` (`business_id`);--> statement-breakpoint
CREATE INDEX `business_matching_rules_business_idx` ON `business_matching_rules` (`business_id`);--> statement-breakpoint
CREATE INDEX `businesses_workspace_idx` ON `businesses` (`workspace_id`);
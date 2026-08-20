CREATE TABLE `business_audit_events` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_id` varchar(36),
	`property_id` varchar(36),
	`event_type` varchar(60) NOT NULL,
	`actor_email` varchar(255),
	`payload` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_contacts` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`type` varchar(20) NOT NULL,
	`value` varchar(255) NOT NULL,
	`label` varchar(120),
	`enabled` boolean NOT NULL DEFAULT true,
	`approved_for_drafts` boolean NOT NULL DEFAULT false,
	`approved_for_public_response` boolean NOT NULL DEFAULT false,
	`owner_verified_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_policies` (
	`id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`availability_policy` varchar(40),
	`pricing_policy` varchar(40),
	`promotion_policy` varchar(40),
	`booking_policy` varchar(40),
	`cancellation_info_policy` text,
	`prohibited_claims` text,
	`escalation_policy` text,
	`responsible_owner` varchar(200),
	`operating_hours` varchar(200),
	`response_sla_minutes` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_policies_business_unique` UNIQUE(`business_id`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`name` varchar(200) NOT NULL,
	`code` varchar(80),
	`property_type` varchar(80),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`description` text,
	`province` varchar(120),
	`district` varchar(120),
	`area` varchar(120),
	`max_guests` int,
	`bedrooms` int,
	`bathrooms` int,
	`beds` int,
	`private_pool` boolean NOT NULL DEFAULT false,
	`near_beach` boolean NOT NULL DEFAULT false,
	`beachfront` boolean NOT NULL DEFAULT false,
	`riverfront` boolean NOT NULL DEFAULT false,
	`details` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_policies` (
	`id` varchar(36) NOT NULL,
	`property_id` varchar(36) NOT NULL,
	`availability_policy` varchar(40),
	`pricing_policy` varchar(40),
	`promotion_policy` varchar(40),
	`booking_policy` varchar(40),
	`prohibited_claims` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `property_policies_property_unique` UNIQUE(`property_id`)
);
--> statement-breakpoint
ALTER TABLE `businesses` ADD `environment` varchar(20) DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE `business_audit_events` ADD CONSTRAINT `business_audit_events_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_contacts` ADD CONSTRAINT `business_contacts_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_contacts` ADD CONSTRAINT `business_contacts_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_policies` ADD CONSTRAINT `business_policies_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `properties` ADD CONSTRAINT `properties_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `properties` ADD CONSTRAINT `properties_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_policies` ADD CONSTRAINT `property_policies_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_audit_workspace_idx` ON `business_audit_events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `business_audit_business_idx` ON `business_audit_events` (`business_id`);--> statement-breakpoint
CREATE INDEX `business_contacts_business_idx` ON `business_contacts` (`business_id`);--> statement-breakpoint
CREATE INDEX `properties_workspace_idx` ON `properties` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `properties_business_idx` ON `properties` (`business_id`);--> statement-breakpoint
CREATE INDEX `properties_status_idx` ON `properties` (`status`);--> statement-breakpoint
CREATE INDEX `properties_area_idx` ON `properties` (`area`);--> statement-breakpoint
CREATE INDEX `properties_type_idx` ON `properties` (`property_type`);
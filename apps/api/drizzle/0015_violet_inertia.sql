CREATE TABLE `media_assets` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`property_id` varchar(36),
	`media_type` varchar(20) NOT NULL DEFAULT 'IMAGE',
	`storage_key` varchar(500) NOT NULL,
	`original_filename` varchar(300) NOT NULL,
	`mime_type` varchar(60) NOT NULL,
	`size_bytes` int NOT NULL,
	`category` varchar(30) NOT NULL DEFAULT 'other',
	`caption` varchar(300),
	`status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
	`approved_for_drafts` boolean NOT NULL DEFAULT false,
	`approved_for_public_response` boolean NOT NULL DEFAULT false,
	`owner_verified` boolean NOT NULL DEFAULT false,
	`width` int,
	`height` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `media_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `business_policies` ADD `image_response_mode` varchar(40);--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `media_assets_business_idx` ON `media_assets` (`business_id`);--> statement-breakpoint
CREATE INDEX `media_assets_property_idx` ON `media_assets` (`property_id`);
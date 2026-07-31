CREATE TABLE `ai_draft_events` (
	`id` varchar(36) NOT NULL,
	`ai_draft_id` varchar(36) NOT NULL,
	`event` varchar(60) NOT NULL,
	`payload` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_draft_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_drafts` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_match_id` varchar(36) NOT NULL,
	`opportunity_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`content` text,
	`provider` varchar(40) NOT NULL,
	`model` varchar(80) NOT NULL,
	`prompt_version` varchar(40) NOT NULL,
	`input_snapshot` text,
	`policy_result` text,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_drafts_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_drafts_match_version_unique` UNIQUE(`business_match_id`,`version`)
);
--> statement-breakpoint
ALTER TABLE `ai_draft_events` ADD CONSTRAINT `ai_draft_events_ai_draft_id_ai_drafts_id_fk` FOREIGN KEY (`ai_draft_id`) REFERENCES `ai_drafts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_drafts` ADD CONSTRAINT `ai_drafts_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_drafts` ADD CONSTRAINT `ai_drafts_business_match_id_business_matches_id_fk` FOREIGN KEY (`business_match_id`) REFERENCES `business_matches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_drafts` ADD CONSTRAINT `ai_drafts_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_drafts` ADD CONSTRAINT `ai_drafts_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_draft_events_draft_idx` ON `ai_draft_events` (`ai_draft_id`);--> statement-breakpoint
CREATE INDEX `ai_drafts_workspace_idx` ON `ai_drafts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `ai_drafts_match_idx` ON `ai_drafts` (`business_match_id`);--> statement-breakpoint
CREATE INDEX `ai_drafts_status_idx` ON `ai_drafts` (`workspace_id`,`status`);
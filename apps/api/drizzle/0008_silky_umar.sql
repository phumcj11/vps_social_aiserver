CREATE TABLE `review_events` (
	`id` varchar(36) NOT NULL,
	`review_task_id` varchar(36) NOT NULL,
	`event` varchar(60) NOT NULL,
	`payload` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `review_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `review_tasks` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_match_id` varchar(36) NOT NULL,
	`draft_id` varchar(36) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	`assigned_to` varchar(36),
	`edited_content` text,
	`editor` varchar(36),
	`edited_at` datetime,
	`decided_by` varchar(36),
	`decided_at` datetime,
	`decision_reason` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `review_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `review_tasks_draft_unique` UNIQUE(`draft_id`)
);
--> statement-breakpoint
ALTER TABLE `review_events` ADD CONSTRAINT `review_events_review_task_id_review_tasks_id_fk` FOREIGN KEY (`review_task_id`) REFERENCES `review_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_tasks` ADD CONSTRAINT `review_tasks_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_tasks` ADD CONSTRAINT `review_tasks_business_match_id_business_matches_id_fk` FOREIGN KEY (`business_match_id`) REFERENCES `business_matches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_tasks` ADD CONSTRAINT `review_tasks_draft_id_ai_drafts_id_fk` FOREIGN KEY (`draft_id`) REFERENCES `ai_drafts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `review_events_task_idx` ON `review_events` (`review_task_id`);--> statement-breakpoint
CREATE INDEX `review_tasks_workspace_idx` ON `review_tasks` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `review_tasks_status_idx` ON `review_tasks` (`workspace_id`,`status`);
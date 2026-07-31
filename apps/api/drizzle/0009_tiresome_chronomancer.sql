CREATE TABLE `action_events` (
	`id` varchar(36) NOT NULL,
	`action_job_id` varchar(36) NOT NULL,
	`event` varchar(60) NOT NULL,
	`payload` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `action_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `action_jobs` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`review_task_id` varchar(36) NOT NULL,
	`ai_draft_id` varchar(36) NOT NULL,
	`business_match_id` varchar(36) NOT NULL,
	`action_type` varchar(40) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'blocked',
	`target_platform` varchar(20) NOT NULL DEFAULT 'facebook',
	`target_url` varchar(700) NOT NULL,
	`approved_content` text NOT NULL,
	`attempt_count` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`scheduled_at` datetime,
	`started_at` datetime,
	`completed_at` datetime,
	`cancelled_at` datetime,
	`blocked_at` datetime,
	`last_error_code` varchar(40),
	`last_error_message` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `action_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `action_events` ADD CONSTRAINT `action_events_action_job_id_action_jobs_id_fk` FOREIGN KEY (`action_job_id`) REFERENCES `action_jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_jobs` ADD CONSTRAINT `action_jobs_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_jobs` ADD CONSTRAINT `action_jobs_review_task_id_review_tasks_id_fk` FOREIGN KEY (`review_task_id`) REFERENCES `review_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_jobs` ADD CONSTRAINT `action_jobs_ai_draft_id_ai_drafts_id_fk` FOREIGN KEY (`ai_draft_id`) REFERENCES `ai_drafts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_jobs` ADD CONSTRAINT `action_jobs_business_match_id_business_matches_id_fk` FOREIGN KEY (`business_match_id`) REFERENCES `business_matches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `action_events_job_idx` ON `action_events` (`action_job_id`);--> statement-breakpoint
CREATE INDEX `action_jobs_review_type_idx` ON `action_jobs` (`review_task_id`,`action_type`);--> statement-breakpoint
CREATE INDEX `action_jobs_workspace_idx` ON `action_jobs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `action_jobs_status_idx` ON `action_jobs` (`workspace_id`,`status`);
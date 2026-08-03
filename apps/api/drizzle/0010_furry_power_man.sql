CREATE TABLE `action_execution_evidence` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`action_job_id` varchar(36) NOT NULL,
	`execution_session_id` varchar(36) NOT NULL,
	`evidence_type` varchar(40) NOT NULL,
	`storage_key` varchar(300),
	`evidence_hash` varchar(64),
	`facebook_comment_id` varchar(100),
	`observed_content` text,
	`observed_author` varchar(255),
	`observed_post_url` varchar(700),
	`observed_at` datetime,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `action_execution_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `action_execution_sessions` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`action_job_id` varchar(36) NOT NULL,
	`attempt_number` int NOT NULL,
	`status` varchar(30) NOT NULL DEFAULT 'created',
	`adapter` varchar(20) NOT NULL,
	`browser_profile_key` varchar(128),
	`started_at` datetime,
	`preflight_verified_at` datetime,
	`submit_started_at` datetime,
	`submitted_at` datetime,
	`verification_started_at` datetime,
	`verified_at` datetime,
	`ambiguous_at` datetime,
	`failed_at` datetime,
	`cancelled_at` datetime,
	`finished_at` datetime,
	`error_code` varchar(40),
	`error_message` varchar(500),
	`recovery_state` varchar(40),
	`active_key` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `action_execution_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `action_exec_sessions_active_unique` UNIQUE(`active_key`),
	CONSTRAINT `action_exec_sessions_job_attempt_unique` UNIQUE(`action_job_id`,`attempt_number`)
);
--> statement-breakpoint
CREATE TABLE `action_idempotency_records` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`business_id` varchar(36) NOT NULL,
	`target_post_key` varchar(128) NOT NULL,
	`action_type` varchar(40) NOT NULL,
	`action_job_id` varchar(36) NOT NULL,
	`execution_session_id` varchar(36),
	`status` varchar(20) NOT NULL DEFAULT 'reserved',
	`facebook_comment_id` varchar(100),
	`idem_key` varchar(260),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `action_idempotency_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `action_idempotency_idem_unique` UNIQUE(`idem_key`)
);
--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `target_post_key` varchar(128);--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `active_dedup_key` varchar(120);--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `success_idempotency_key` varchar(200);--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `execution_state` varchar(30) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `ambiguous_at` datetime;--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `verification_required` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `last_execution_session_id` varchar(36);--> statement-breakpoint
ALTER TABLE `action_jobs` ADD CONSTRAINT `action_jobs_active_dedup_unique` UNIQUE(`active_dedup_key`);--> statement-breakpoint
ALTER TABLE `action_jobs` ADD CONSTRAINT `action_jobs_success_unique` UNIQUE(`success_idempotency_key`);--> statement-breakpoint
ALTER TABLE `action_execution_evidence` ADD CONSTRAINT `action_execution_evidence_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_execution_evidence` ADD CONSTRAINT `action_execution_evidence_action_job_id_action_jobs_id_fk` FOREIGN KEY (`action_job_id`) REFERENCES `action_jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_execution_evidence` ADD CONSTRAINT `action_exec_evidence_session_fk` FOREIGN KEY (`execution_session_id`) REFERENCES `action_execution_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_execution_sessions` ADD CONSTRAINT `action_execution_sessions_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_execution_sessions` ADD CONSTRAINT `action_execution_sessions_action_job_id_action_jobs_id_fk` FOREIGN KEY (`action_job_id`) REFERENCES `action_jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_idempotency_records` ADD CONSTRAINT `action_idempotency_records_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_idempotency_records` ADD CONSTRAINT `action_idempotency_records_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `action_idempotency_records` ADD CONSTRAINT `action_idempotency_records_action_job_id_action_jobs_id_fk` FOREIGN KEY (`action_job_id`) REFERENCES `action_jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `action_exec_evidence_session_idx` ON `action_execution_evidence` (`execution_session_id`);--> statement-breakpoint
CREATE INDEX `action_exec_evidence_job_idx` ON `action_execution_evidence` (`action_job_id`);--> statement-breakpoint
CREATE INDEX `action_exec_sessions_workspace_idx` ON `action_execution_sessions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `action_exec_sessions_job_idx` ON `action_execution_sessions` (`action_job_id`);--> statement-breakpoint
CREATE INDEX `action_idempotency_lookup_idx` ON `action_idempotency_records` (`workspace_id`,`business_id`,`target_post_key`,`action_type`);--> statement-breakpoint
CREATE INDEX `action_idempotency_job_idx` ON `action_idempotency_records` (`action_job_id`);
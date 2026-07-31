CREATE TABLE `audit_events` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36),
	`user_id` varchar(36),
	`event_type` varchar(60) NOT NULL,
	`payload` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `facebook_accounts` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`platform` varchar(20) NOT NULL DEFAULT 'facebook',
	`display_name` varchar(255),
	`facebook_user_id` varchar(64),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`connection_state` varchar(30) NOT NULL DEFAULT 'not_connected',
	`profile_path` varchar(255) NOT NULL,
	`connected_at` datetime,
	`last_validated_at` datetime,
	`session_expires_at` datetime,
	`disconnected_at` datetime,
	`last_error_code` varchar(40),
	`last_error_message` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `facebook_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `facebook_accounts_workspace_unique` UNIQUE(`workspace_id`)
);
--> statement-breakpoint
ALTER TABLE `facebook_accounts` ADD CONSTRAINT `facebook_accounts_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_events_workspace_idx` ON `audit_events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `audit_events_type_idx` ON `audit_events` (`event_type`);
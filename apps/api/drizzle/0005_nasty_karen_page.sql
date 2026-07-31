CREATE TABLE `opportunities` (
	`id` varchar(36) NOT NULL,
	`workspace_id` varchar(36) NOT NULL,
	`signal_id` varchar(36) NOT NULL,
	`decision` varchar(10) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'NEW',
	`classifier_version` varchar(40) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `opportunities_id` PRIMARY KEY(`id`),
	CONSTRAINT `opportunities_signal_unique` UNIQUE(`signal_id`)
);
--> statement-breakpoint
CREATE TABLE `opportunity_events` (
	`id` varchar(36) NOT NULL,
	`opportunity_id` varchar(36) NOT NULL,
	`event` varchar(60) NOT NULL,
	`payload` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `opportunity_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `opportunities` ADD CONSTRAINT `opportunities_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `opportunities` ADD CONSTRAINT `opportunities_signal_id_facebook_signals_id_fk` FOREIGN KEY (`signal_id`) REFERENCES `facebook_signals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `opportunity_events` ADD CONSTRAINT `opportunity_events_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `opportunities_workspace_idx` ON `opportunities` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `opportunities_status_idx` ON `opportunities` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `opportunity_events_opportunity_idx` ON `opportunity_events` (`opportunity_id`);
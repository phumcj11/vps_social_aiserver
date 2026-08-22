ALTER TABLE `business_policies` ADD `no_property_match_strategy` varchar(40);--> statement-breakpoint
ALTER TABLE `business_policies` ADD `allow_near_match_suggestions` boolean DEFAULT false NOT NULL;
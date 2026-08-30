-- M9B — Property tri-state facts (private_pool / near_beach / beachfront /
-- riverfront). These columns were `boolean NOT NULL DEFAULT false`, which could
-- not distinguish "confirmed absent" from "owner has not provided". They become
-- a NULLABLE boolean: true = YES, false = NO, NULL = UNKNOWN.
--
-- CRITICAL MIGRATION RULE: historical `false`/`0` was AMBIGUOUS, so it must
-- become UNKNOWN (NULL), NOT a confirmed NO. Historical `true`/`1` becomes YES
-- (stays 1). A confirmed NO (0) can only be written later by an explicit owner
-- choice. The MODIFY (allow NULL) MUST run before the UPDATE that writes NULL.
--
-- Reverse (manual, forward-only migrator): collapse tri-state back to boolean —
--   UPDATE `properties` SET `private_pool` = 0 WHERE `private_pool` IS NULL; (×4)
--   ALTER TABLE `properties` MODIFY COLUMN `private_pool` boolean NOT NULL DEFAULT false; (×4)
-- This restores the original v1 boolean semantics (YES→1, NO/UNKNOWN→0).

ALTER TABLE `properties` MODIFY COLUMN `private_pool` boolean;--> statement-breakpoint
ALTER TABLE `properties` MODIFY COLUMN `near_beach` boolean;--> statement-breakpoint
ALTER TABLE `properties` MODIFY COLUMN `beachfront` boolean;--> statement-breakpoint
ALTER TABLE `properties` MODIFY COLUMN `riverfront` boolean;--> statement-breakpoint
UPDATE `properties` SET `private_pool` = NULL WHERE `private_pool` = 0;--> statement-breakpoint
UPDATE `properties` SET `near_beach` = NULL WHERE `near_beach` = 0;--> statement-breakpoint
UPDATE `properties` SET `beachfront` = NULL WHERE `beachfront` = 0;--> statement-breakpoint
UPDATE `properties` SET `riverfront` = NULL WHERE `riverfront` = 0;

-- M9C — Matching Semantics v2 introduces a third property-match decision,
-- 'NEEDS_CONFIRMATION' (18 chars), which does not fit the varchar(10) column.
-- Widen property_matches.decision to varchar(20). Non-destructive: existing
-- 'MATCH'/'NO_MATCH' values are unchanged; only the max length grows.
-- Reverse: ALTER TABLE `property_matches` MODIFY COLUMN `decision` varchar(10) NOT NULL;
-- (safe only once no NEEDS_CONFIRMATION rows exist).

ALTER TABLE `property_matches` MODIFY COLUMN `decision` varchar(20) NOT NULL;

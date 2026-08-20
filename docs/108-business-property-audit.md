# 108 — Business / Property Audit

**Status:** SPRINT 015. Table: `business_audit_events`. Store: `recordAudit` / `listAuditByBusiness`.

Every important production change is recorded as a safe, append-only audit event — **no secrets in the payload** (no cookies, tokens, credentials, or raw contact values beyond a type label).

## Event types

`BusinessCreated` · `BusinessUpdated` · `BusinessArchived` · `PropertyCreated` · `PropertyUpdated` · `PropertyArchived` · `ContactChanged` · `PolicyChanged` · `ReadinessChanged` · `MatchingRuleChanged` · `GroupAssignmentChanged`.

## Record

`{ id, workspaceId, businessId?, propertyId?, eventType, actorEmail?, payload (safe JSON), createdAt }`. Listed newest-first per Business for the History tab. Cross-workspace access is impossible (events are always loaded under the owned Business).

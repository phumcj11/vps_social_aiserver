# 123 — NO_PROPERTY_MATCH Policy

**Status:** SPRINT 016B — SHIPPED.

When a Business MATCHes but **no Property qualifies**, the system:

1. Persists a single `property_matches` row with `decision = NO_MATCH`,
   `property_id = NULL`, reason `NO_PROPERTY_MATCH` (never a fabricated Property).
2. Builds the draft context with `property = null` and `noPropertyMatch = true`;
   the prompt instructs the model to respond **only at the Business level** and to
   make no specific-property, price, or availability claim.
3. The policy checker marks every such draft **NEEDS_REVIEW** with a
   `NO_PROPERTY_MATCH` reason, and the review surfaces a `NO_PROPERTY_MATCH`
   warning.

**Chosen policy:** a safe Business-level response that a human must review — the
system never silently manufactures Property facts, and never auto-approves. This
is the documented behaviour for the no-match case.

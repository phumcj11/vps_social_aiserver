# Current Sprint

## Current Sprint

**SPRINT 009 — AI Draft Engine**

## Objectives

**AI Draft Engine (draft only, AI disabled by default).**

Turn a **MATCH** Business Match into a **draft comment suggestion** for human review, using only that business's context. The output is a **DRAFT ONLY** — never sent to Telegram, never posted to Facebook, never a write action. **Human approval remains mandatory.** Concretely:

- Database: `ai_drafts` (UNIQUE `(business_match_id, version)`) + `ai_draft_events` (migration `0007`).
- Six modules: BusinessContextBuilder (pure), AiDraftPromptBuilder (pure, layered, `rules-v1`), AiDraftProvider (deterministic Mock + disabled external boundary), DraftPolicyChecker (pure, PASS/NEEDS_REVIEW/BLOCK), AiDraftRepository (only DB boundary), AiDraftCoordinator.
- Immutable versioning: only MATCH generates; generate idempotent; regenerate → new version; older → superseded; nothing overwritten.
- API, Business Match Detail AI Draft section, `/settings/ai-drafts` list + detail, `ai-draft:*` CLI; 8 audit event types.
- Documentation ([48](48-ai-draft-engine.md)–[53](53-ai-provider-abstraction.md)) and [ADR-015](adr/ADR-015-ai-provider-abstraction.md)/[ADR-016](adr/ADR-016-immutable-ai-draft-versioning.md)/[ADR-017](adr/ADR-017-human-approval-after-ai-draft.md).

## Scope

**In scope**

- Draft generation: MATCH → safe context → layered prompt → provider → policy check → immutable Draft version → events.
- Deterministic Mock provider; AI disabled by default; a real provider refuses while `AI_ENABLED=false`.
- Policy screening (prohibited claims, guaranteed availability/price, unsupported contact, length, unsafe language); safe missing-data wording.

**Out of scope**

- Telegram notification/approval, Facebook comment/message, auto-comment, approval execution, Action Worker, Facebook write.
- Embeddings, semantic search, vector database, AI training, autonomous regeneration loops, multiple active AI providers.
- The AI Draft has no downstream consumer — the pipeline ends at AI Draft.

The full exclusion list is in [not-doing.md](not-doing.md).

## Status

**Complete (not committed).**

The engine turns a MATCH into an immutable, versioned draft — as pure Context/Prompt/Policy modules, a Mock/disabled-external provider, an only-DB-boundary Repository, and a Coordinator that enforces ownership and the versioning invariant. Only MATCH generates; NO_MATCH is refused. Generate is idempotent (never overwrites); regenerate creates the next version and supersedes older ones; reject is a human decision. Policy PASS → `draft`, NEEDS_REVIEW/BLOCK → `needs_review` (never a ready state); a provider failure is recorded safely. The prompt is layered (safety above business voice) and requests no chain-of-thought; prohibited claims are enforced and re-checked. AI is disabled by default and the Mock is deterministic — no external call in tests or runtime verification. It never sends Telegram, never posts to Facebook, never approves. The full quality suite passes (lint, typecheck, test — 245 passing, build, format:check, doctor) and `db:status` is green; the flow was verified live against MySQL with the Mock provider. No commit was made this sprint. Detail: [sprints/SPRINT-009-ai-draft.md](sprints/SPRINT-009-ai-draft.md).

## Definition of Done

- [x] Migration `0007` (`ai_drafts` UNIQUE `(business_match_id, version)`, `ai_draft_events`); no approval/comment-job/Telegram/secret tables.
- [x] Six modules (Context/Prompt/Policy pure; Provider Mock+disabled boundary; Repository sole DB boundary; Coordinator).
- [x] Only MATCH generates; immutable versioning; idempotent generate; regenerate + supersede; reject.
- [x] Policy PASS/NEEDS_REVIEW/BLOCK; provider failure safe; prohibited claims enforced; safe missing-data wording.
- [x] 8 events with safe payloads (no secrets, no chain-of-thought); every attempt auditable.
- [x] API + UI + CLI; ownership enforced (404 cross-workspace); no API key or hidden prompt in responses.
- [x] AI disabled by default; Mock deterministic; no external/Telegram/Facebook call anywhere.
- [x] Tests (245 passing, 49 new) with Mock provider; full quality suite + `db:status` green; live runtime verified.
- [x] Documentation + ADR-015/016/017. **No commit** made.

## Next

On sign-off, the project proceeds to **SPRINT 010 — Telegram Approval**: deliver drafts/opportunities to Telegram and capture human approve/edit/reject decisions safely (approval recorded, not yet executed). See [12-mvp-roadmap.md](12-mvp-roadmap.md).

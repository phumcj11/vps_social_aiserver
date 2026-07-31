# SPRINT 009 — AI Draft Engine

- **Stage:** SPRINT 009 — AI Draft Engine
- **Type:** Feature implementation (AI-assisted drafts — DRAFT ONLY, AI disabled by default)
- **Date:** 2026-07-31
- **Owner:** Principal Software Architect / Senior Full Stack Engineer

---

## Goal

Turn a **MATCH** Business Match into a **draft comment suggestion** for human review, using only that business's context. The output is a **DRAFT ONLY** — never sent to Telegram, never posted to Facebook, never a write action. **Human approval remains mandatory.** AI is **disabled by default**; a deterministic **Mock** provider powers tests and local use.

```
Collector → Signal → Opportunity → Business Matching → [ AI Draft ] → END
```

---

## Deliverables

- **Database:** Drizzle migration `0007` — `ai_drafts` (**UNIQUE `(business_match_id, version)`**, version from 1; status `draft`/`needs_review`/`rejected`/`superseded`; `input_snapshot`, `policy_result`, provider/model/prompt_version, created_by) and `ai_draft_events` (append-only, safe payloads). No approval/comment-job/Telegram/secret columns.
- **Engine** (`apps/api/src/ai/*`): **BusinessContextBuilder** (pure), **AiDraftPromptBuilder** (pure, layered, `rules-v1`, no chain-of-thought), **AiDraftProvider** (Mock default + disabled external boundary), **DraftPolicyChecker** (pure, PASS/NEEDS_REVIEW/BLOCK), **AiDraftRepository** (only DB boundary), **AiDraftCoordinator**. Plus `types.ts`/`errors.ts`. Store methods added to `InMemoryStore` and `DrizzleStore`.
- **Provider abstraction:** deterministic Mock (no network); real provider refuses while `AI_ENABLED=false` and is not connected. Config `AI_ENABLED`/`AI_PROVIDER`/`AI_MODEL`/`AI_PROMPT_VERSION`/`AI_DRAFT_MAX_LENGTH`/`AI_CONTEXT_MAX_KNOWLEDGE_ITEMS`/`AI_CONTEXT_MAX_CHARACTERS`.
- **Lifecycle:** only MATCH generates; NO_MATCH refused; immutable versioning (idempotent generate, regenerate → v+1, older → superseded); reject; 8 event types with safe payloads.
- **API:** `POST /ai-drafts/generate`, `POST /ai-drafts/:id/regenerate`, `POST /ai-drafts/:id/reject`, `GET /ai-drafts`, `GET /ai-drafts/:id`, `GET /business-matches/:id/ai-drafts` — authenticated, workspace-scoped, CSRF-guarded, safe responses (no API key, no hidden prompt).
- **Web:** Business Match Detail AI Draft section (generate/regenerate/reject, status, provider/model/version/prompt/policy, version history) + `/settings/ai-drafts` list + `/settings/ai-drafts/[id]` detail; nav link. Clear notice: "This is an AI-assisted draft. It has not been sent to Facebook." No Approve-and-Send, Telegram, Comment, Message, or Auto mode.
- **CLI:** `pnpm ai-draft:generate|list|show|regenerate` (Mock provider; validate UUIDs; ownership; never print secrets/hidden prompt; never approve/send/comment; useful exit codes).
- **Tests:** 245 passing (49 new: context builder, prompt builder, provider, policy checker, coordinator, repository, API). All use `MockAiDraftProvider`; no real AI call.
- **Documentation:** [48](../48-ai-draft-engine.md)–[53](../53-ai-provider-abstraction.md); [ADR-015](../adr/ADR-015-ai-provider-abstraction.md), [ADR-016](../adr/ADR-016-immutable-ai-draft-versioning.md), [ADR-017](../adr/ADR-017-human-approval-after-ai-draft.md); updates to ai-design, system-overview, domain-model, roadmap, product-memory, environment-configuration, development-workflow, current-sprint.

---

## Non-Goals (not implemented)

Telegram notification/approval, Facebook comment/message, auto-comment, approval execution, Action Worker execution, Facebook write, billing, subscription, teams, multiple active AI providers, embeddings, semantic search, vector database, AI training, autonomous regeneration loops. The AI Draft has **no downstream consumer** — the pipeline ends at AI Draft.

---

## Acceptance Criteria

- [x] Context/Prompt/Policy modules are pure (no DB, no network, no AI); Repository is the only DB boundary.
- [x] Only MATCH generates a draft; NO_MATCH is refused.
- [x] Immutable versioning — `UNIQUE (business_match_id, version)`; generate idempotent; regenerate → new version; older → superseded; never overwritten.
- [x] Policy PASS → `draft`, NEEDS_REVIEW → `needs_review`, BLOCK → `needs_review` (never ready); provider failure recorded safely.
- [x] Prohibited claims enforced; no invented availability/price/promotion/facility/location/contact/terms; missing data handled with safe wording.
- [x] Every attempt auditable via events with safe payloads (no secrets, no chain-of-thought).
- [x] API + UI + CLI; ownership enforced (404 cross-workspace); no API key or hidden prompt in responses; no approval/Telegram/Facebook action.
- [x] AI disabled by default; Mock deterministic; no external call in tests or runtime verification.
- [x] `pnpm lint | typecheck | test | build | format:check | run doctor | db:status` all pass.

---

## Runtime verification

MySQL + API started with `AI_ENABLED=false`, `AI_PROVIDER=mock` (migration `0007`, 20 tables incl. `ai_drafts`, `ai_draft_events`). Seeded a business (`category=ประปา`, keyword rule), group, assignment; inserted a Thai Signal; classified → ACCEPT Opportunity; matched → MATCH. Live flow: `POST /ai-drafts/generate` → version 1, status `draft`, policy `PASS`, provider `mock`, safe Thai content, no secrets/prompt in response; duplicate generate → `created:false`, same id, still 1 version; `regenerate` → version 2, version 1 → `superseded`; `reject` → `rejected`; NO_MATCH generate → `409 not_a_match`; cross-workspace detail → `404`, list empty. No API key / hidden prompt in any response; `input_snapshot` carries only safe context; no external/AI/Telegram/Facebook network attempt in the API log. Services stopped.

---

## Risks & Mitigations

- **A draft acting on its own (posting/approving).** Prevented by construction — no approval/sent/posted state or code path exists ([ADR-017](../adr/ADR-017-human-approval-after-ai-draft.md)).
- **Hallucinated facts / prohibited claims.** Mitigated by the layered prompt (safety above voice), the pure policy checker (BLOCK on guarantees/prohibited claims), and safe missing-data wording.
- **Accidental real AI call or leaked key.** Mitigated by AI disabled by default, the Mock default, a refusing external boundary, and secrets documented-not-populated.
- **Overwriting/losing a draft.** Mitigated by immutable versioning (`UNIQUE (business_match_id, version)`) and idempotent generate ([ADR-016](../adr/ADR-016-immutable-ai-draft-versioning.md)).

---

## Outcome

AI Draft Engine implemented end-to-end (engine, provider abstraction, policy, API, UI, CLI, tests, docs) as **draft-only**, with AI disabled by default and a deterministic Mock. No commit made this sprint (per instruction). **Ready for Sprint 010.**

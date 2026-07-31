# 24 — Business Knowledge

**Document status:** SPRINT 003 — Business Foundation
**Applies to:** KMKT Social AI
**Date:** 2026-07-30

> **Important:** Business Knowledge is **NOT AI memory**. It is **structured business information** — titled notes a business owner records (opening hours, policies, FAQs, packages, etc.). A later sprint's AI will *consume* this information; this sprint only stores and serves it.

Each business owns many knowledge items.

---

## Fields

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | id | UUID. |
| `businessId` | id | Owning business. |
| `title` | string | Required, min 2 chars, ≤200. |
| `content` | text | Optional. |
| `status` | string | `active` (default) or `archived`. |
| `createdAt` / `updatedAt` | timestamps | Safe timestamps. |

---

## API

| Method & path | Purpose |
| ------------- | ------- |
| `GET /businesses/:id/knowledge` | List the business's knowledge items (oldest first). |
| `POST /businesses/:id/knowledge` | Create an item (`title` required). |
| `PATCH /businesses/:id/knowledge/:knowledgeId` | Update title/content/status. |
| `DELETE /businesses/:id/knowledge/:knowledgeId` | Delete an item (hard delete — allowed for knowledge). |

All require authentication; mutations pass the CSRF/origin guard. Ownership is verified via user → workspace → business, and the item must belong to that business (else `404 knowledge_not_found`).

---

## Validation

- `title`: required on create, minimum **2** characters, maximum 200.
- `content`: optional (bounded length).
- `status`: one of `active`, `archived`.

---

## UI

The **Knowledge** tab of the Business Detail page provides CRUD: add (title + content), archive/activate (status toggle), and delete. The tab notes clearly that this is structured business information, not AI memory.

---

## Not AI

No embeddings, vector store, or model calls are involved. Knowledge is plain structured rows. When AI arrives, it will read these rows as business context — but the storage and semantics defined here remain deterministic and human-authored.

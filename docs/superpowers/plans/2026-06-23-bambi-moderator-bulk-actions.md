# Bambi Moderator Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace moderator preview bulk actions with API-backed bulk moderation actions that are safe, auditable, and reversible where possible.

**Architecture:** Bulk actions are server-side transactions with per-target authorization, explicit reason text, action logs, and partial-failure reporting. The Web action bar sends target ids and receives an itemized result instead of mutating local state optimistically.

**Tech Stack:** oRPC, Drizzle ORM, PostgreSQL, TanStack Query, Next.js App Router, React 19, Vitest, Ultracite.

---

## Scope

Included:

- Bulk job post moderation.
- Bulk report status update.
- Bulk user warning/suspension.
- Audit log entries per target.
- Web confirmation and result summary.

Excluded:

- Undo workflow.
- Scheduled moderation jobs.
- ML-assisted moderation.

## File Structure

- Modify: `packages/api/src/routers/bambi/moderation.ts`
- Create: `packages/api/src/services/bambi-moderation-bulk.ts`
- Test: `packages/api/src/routers/bambi/moderation.test.ts`
- Modify: `apps/web/src/components/bambi/screens/moderator-context.tsx`
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`
- Modify: `apps/web/src/app/moderator/page.tsx`
- Modify: `apps/web/src/app/moderator/reports/page.tsx`
- Modify: `apps/web/src/app/moderator/users/page.tsx`

## Task 1: Bulk Moderation Service

**Files:**

- Create: `packages/api/src/services/bambi-moderation-bulk.ts`
- Test: `packages/api/src/services/bambi-moderation-bulk.test.ts`

- [x] **Step 1: Define result shape**

Return `{ total, succeeded, failed, failures }`, where each failure includes `targetId`, `code`, and `message`.

- [x] **Step 2: Add input constraints**

Limit one bulk request to 50 target ids and reject empty id arrays.

- [x] **Step 3: Add service tests**

Verify empty request rejection, max count rejection, and mixed success/failure result formatting.

## Task 2: Bulk API Endpoints

**Files:**

- Modify: `packages/api/src/routers/bambi/moderation.ts`
- Test: `packages/api/src/routers/bambi/moderation.test.ts`

- [x] **Step 1: Add `bulkSetJobPostStatus`**

Accept job post ids, status, and reason. Create one admin action log per updated job post.

- [x] **Step 2: Add `bulkSetReportStatus`**

Accept report ids, status, and reason. Create one admin action log per updated report.

- [x] **Step 3: Add `bulkSetUserStatus`**

Accept user ids, status, and reason. Create one admin action log per updated user.

- [x] **Step 4: Add API tests**

Verify admin-only access, partial failure behavior, and audit log creation.

## Task 3: Web Confirmation And Result UI

**Files:**

- Modify: `apps/web/src/components/bambi/screens/moderator-context.tsx`
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`

- [x] **Step 1: Replace local bulk state mutation**

Use TanStack mutations for bulk actions and invalidate affected moderator queries on success.

- [x] **Step 2: Add confirmation sheet**

Before applying a bulk action, show selected count, target action, reason input, and confirm/cancel buttons.

- [x] **Step 3: Add result toast**

After completion, show success count and failure count. If failures exist, show a compact list of failed ids.

- [x] **Step 4: Browser verify**

As `admin@bambi.dev`, select multiple queue items, approve them with a reason, and verify the queue count updates from API data.

## Task 4: Final Verification

- [x] **Step 1: Run automated checks**

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
pnpm --filter web build
```

Expected: all commands pass.

- [x] **Step 2: Update plan and commit**

Check completed boxes, add browser verification notes, and commit with Korean Conventional Commits format.

## Verification Notes

- 2026-06-25: Checked `packages/db/src/migrations/` before implementation. Latest migration is `0005_bambi_org_team_management.sql`; no new migration was required because bulk actions reuse existing moderation and audit tables.
- 2026-06-25: Added service tests for empty requests, 50-target limit, and mixed success/failure formatting. Verified with `pnpm --filter @bambi-app/api test src/services/bambi-moderation-bulk.test.ts` (3 passed).
- 2026-06-25: Added router tests for admin-only access, partial job-post failure reporting, and audit logs for job/report/user bulk updates. Verified endpoint exposure without DB using `pnpm --filter @bambi-app/api test src/routers/bambi/moderation.test.ts -t "exposes bulk moderation procedures"` (1 passed, 4 skipped).
- 2026-06-25: Browser smoke checked on `http://localhost:23001` preview fallback: queue selection -> 승인 confirmation sheet -> reason field -> result toast and queue count update; reports/users selection action bars also appeared with the expected actions.
- 2026-06-25: Updated DB target to local PostgreSQL (`localhost:55432/bambi`, password omitted). `select 1` succeeded in 52ms, `pnpm --filter @bambi-app/db db:migrate` applied migrations successfully, and `pnpm --filter @bambi-app/api test` passed with 13 files / 64 tests. The previous connection timeout against `dev.mkvista.com` is resolved for local DB.
- 2026-06-25: `pnpm run check-types`, `pnpm run check`, and `pnpm --filter web build` passed.
- 2026-06-25: Added `getVisibleModerationData` to keep successful empty API results from falling back to moderator preview data. Verified with `pnpm vitest run apps/web/src/lib/bambi/moderation-data.test.ts` (3 passed).
- 2026-06-25: API-data browser verification completed with `admin@bambi.dev`. Ran `pnpm run db:seed:bambi`, temporarily moved `22222222-2222-4222-8222-222222222201` to `pending_review` for a two-item queue, selected both queue items, applied bulk 승인, and verified the API-backed count changed from `검수 대기 2` to `검수 대기 0` with `검수할 공고가 없어요`.
- 2026-06-25: Final verification passed: `pnpm --filter @bambi-app/api test` (13 files / 64 tests), `pnpm run check-types`, `pnpm run check`, and `pnpm --filter web build`.

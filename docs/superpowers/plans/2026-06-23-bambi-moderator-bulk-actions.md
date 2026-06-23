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

- [ ] **Step 1: Define result shape**

Return `{ total, succeeded, failed, failures }`, where each failure includes `targetId`, `code`, and `message`.

- [ ] **Step 2: Add input constraints**

Limit one bulk request to 50 target ids and reject empty id arrays.

- [ ] **Step 3: Add service tests**

Verify empty request rejection, max count rejection, and mixed success/failure result formatting.

## Task 2: Bulk API Endpoints

**Files:**

- Modify: `packages/api/src/routers/bambi/moderation.ts`
- Test: `packages/api/src/routers/bambi/moderation.test.ts`

- [ ] **Step 1: Add `bulkSetJobPostStatus`**

Accept job post ids, status, and reason. Create one admin action log per updated job post.

- [ ] **Step 2: Add `bulkSetReportStatus`**

Accept report ids, status, and reason. Create one admin action log per updated report.

- [ ] **Step 3: Add `bulkSetUserStatus`**

Accept user ids, status, and reason. Create one admin action log per updated user.

- [ ] **Step 4: Add API tests**

Verify admin-only access, partial failure behavior, and audit log creation.

## Task 3: Web Confirmation And Result UI

**Files:**

- Modify: `apps/web/src/components/bambi/screens/moderator-context.tsx`
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`

- [ ] **Step 1: Replace local bulk state mutation**

Use TanStack mutations for bulk actions and invalidate affected moderator queries on success.

- [ ] **Step 2: Add confirmation sheet**

Before applying a bulk action, show selected count, target action, reason input, and confirm/cancel buttons.

- [ ] **Step 3: Add result toast**

After completion, show success count and failure count. If failures exist, show a compact list of failed ids.

- [ ] **Step 4: Browser verify**

As `admin@bambi.dev`, select multiple queue items, approve them with a reason, and verify the queue count updates from API data.

## Task 4: Final Verification

- [ ] **Step 1: Run automated checks**

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
pnpm --filter web build
```

Expected: all commands pass.

- [ ] **Step 2: Update plan and commit**

Check completed boxes, add browser verification notes, and commit with Korean Conventional Commits format.

# Bambi Employer Analytics And Paid Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add employer-facing performance analytics and a transparent paid placement foundation.

**Architecture:** Capture immutable events for impressions, detail views, chat starts, and contact reveals. Paid placement changes ranking through explicit sponsored slots and visible labeling, not hidden manipulation.

**Tech Stack:** Drizzle ORM, PostgreSQL, oRPC, TanStack Query, Next.js App Router, React 19, Tailwind CSS, Vitest, Ultracite.

---

## Scope

Included:

- Job performance event schema.
- Employer analytics dashboard.
- Sponsored placement campaign schema.
- Sponsored label on seeker-facing listings.

Excluded:

- Payment provider integration.
- Automated bidding.
- External ad network integration.

## File Structure

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0005_bambi_analytics_paid_placement.sql`
- Create: `packages/api/src/services/bambi-analytics.ts`
- Create: `packages/api/src/routers/bambi/analytics.ts`
- Create: `packages/api/src/routers/bambi/promotions.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Modify: `apps/web/src/app/employer/page.tsx`
- Create: `apps/web/src/app/employer/analytics/page.tsx`
- Create: `apps/web/src/app/employer/promotions/page.tsx`
- Modify: `apps/web/src/components/bambi/marketplace.tsx`

## Task 1: Event Collection

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0005_bambi_analytics_paid_placement.sql`
- Create: `packages/api/src/services/bambi-analytics.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`

- [ ] **Step 1: Add event table**

Store `id`, `jobPostId`, `organizationId`, `actorUserId`, `eventType`, `metadata`, `createdAt`.

- [ ] **Step 2: Define event types**

Support `impression`, `detail_view`, `chat_start`, `contact_reveal`.

- [ ] **Step 3: Record events from existing flows**

Record detail views in job detail fetch, chat starts in chat creation, and contact reveal in contact reveal mutation.

- [ ] **Step 4: Add tests**

Verify event creation for chat start and contact reveal.

## Task 2: Employer Analytics Dashboard

**Files:**

- Create: `packages/api/src/routers/bambi/analytics.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Create: `apps/web/src/app/employer/analytics/page.tsx`
- Modify: `apps/web/src/app/employer/page.tsx`

- [ ] **Step 1: Add summary API**

Return per-job counts for impressions, detail views, chat starts, and contact reveals scoped to organizations the employer can manage.

- [ ] **Step 2: Add analytics route**

Create `/employer/analytics` with compact tables and conversion ratios.

- [ ] **Step 3: Link from employer dashboard**

Add a navigation entry from `/employer` to `/employer/analytics`.

- [ ] **Step 4: Browser verify**

Seed data, generate at least one detail view and chat start, then verify analytics numbers appear for `owner@bambi.dev`.

## Task 3: Paid Placement Foundation

**Files:**

- Create: `packages/api/src/routers/bambi/promotions.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Create: `apps/web/src/app/employer/promotions/page.tsx`
- Modify: `apps/web/src/components/bambi/marketplace.tsx`

- [ ] **Step 1: Add campaign schema**

Store `id`, `jobPostId`, `organizationId`, `status`, `startsAt`, `endsAt`, `dailyBudgetAmount`, `createdAt`, `updatedAt`.

- [ ] **Step 2: Add campaign API**

Allow employers to create, pause, and list campaigns for owned published jobs.

- [ ] **Step 3: Add sponsored listing label**

When a job is promoted, show a visible "스폰서" label on seeker job cards and detail.

- [ ] **Step 4: Preserve ranking transparency**

Keep sponsored jobs in a dedicated promoted slot before organic listings instead of mixing them invisibly.

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

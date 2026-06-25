# Bambi Employer Analytics And Paid Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add employer-facing performance analytics and billing-ready reporting over job discovery and promoted placement.

**Architecture:** Capture immutable events for impressions, detail views, chat starts, contact reveals, promotion impressions, and boost actions. Paid placement reporting should read the transparent promotion sections defined by [Dense Marketplace And Promotion Ops](./2026-06-24-bambi-dense-marketplace-promotion-ops.md), not invent a second hidden ranking model.

**Tech Stack:** Drizzle ORM, PostgreSQL, oRPC, TanStack Query, Next.js App Router, React 19, Tailwind CSS, Vitest, Ultracite.

---

## Scope

Included:

- Job performance event schema.
- Employer analytics dashboard.
- Billing-ready promotion performance events.
- Sponsored label analytics for seeker-facing listings.
- Reporting that can aggregate by promotion tier, campaign, and job.

Excluded:

- Payment provider integration.
- Automated bidding.
- External ad network integration.
- Dense marketplace list redesign.
- Manual boost credit management.
- Promotion tier purchase or campaign-management UI.

## Dependency

This plan should run after [Dense Marketplace And Promotion Ops](./2026-06-24-bambi-dense-marketplace-promotion-ops.md) if the project wants Foxalba-style listing density, promotion tiers, and manual boosts first.

If this plan runs first, implement only neutral analytics primitives and leave promotion-specific tables or UI to the Dense Marketplace And Promotion Ops plan. Do not create a separate campaign schema that conflicts with `jobPromotionCampaign` or `jobPromotionBoostEvent`.

## File Structure

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0007_bambi_analytics_paid_placement.sql`
- Create: `packages/api/src/services/bambi-analytics.ts`
- Create: `packages/api/src/routers/bambi/analytics.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Modify: `apps/web/src/app/employer/page.tsx`
- Create: `apps/web/src/app/employer/analytics/page.tsx`

## Task 1: Event Collection

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0007_bambi_analytics_paid_placement.sql`
- Create: `packages/api/src/services/bambi-analytics.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`

- [x] **Step 1: Add event table**

Store `id`, `jobPostId`, `organizationId`, `actorUserId`, `eventType`, `metadata`, `createdAt`.

- [x] **Step 2: Define event types**

Support `impression`, `detail_view`, `chat_start`, `contact_reveal`.

- [x] **Step 3: Record events from existing flows**

Record detail views in job detail fetch, chat starts in chat creation, and contact reveal in contact reveal mutation.

- [x] **Step 4: Add tests**

Verify event creation for chat start and contact reveal.

## Task 2: Employer Analytics Dashboard

**Files:**

- Create: `packages/api/src/routers/bambi/analytics.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Create: `apps/web/src/app/employer/analytics/page.tsx`
- Modify: `apps/web/src/app/employer/page.tsx`

- [x] **Step 1: Add summary API**

Return per-job counts for impressions, detail views, chat starts, and contact reveals scoped to organizations the employer can manage.

- [x] **Step 2: Add analytics route**

Create `/employer/analytics` with compact tables and conversion ratios.

- [x] **Step 3: Link from employer dashboard**

Add a navigation entry from `/employer` to `/employer/analytics`.

- [x] **Step 4: Browser verify**

Seed data, generate at least one detail view and chat start, then verify analytics numbers appear for `owner@bambi.dev`.

## Task 3: Paid Placement Foundation

**Files:**

- Modify: `packages/api/src/routers/bambi/index.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`

- [x] **Step 1: Reuse campaign schema when available**

If [Dense Marketplace And Promotion Ops](./2026-06-24-bambi-dense-marketplace-promotion-ops.md) has already run, read `jobPromotionCampaign` and `jobPromotionBoostEvent` for tier, status, boost, and expiry dimensions.

If it has not run, skip campaign table creation in this plan and keep analytics events generic so the later promotion plan can add the campaign schema once.

- [x] **Step 2: Add promoted impression events**

Record promoted listing impressions with metadata containing:

- `section`: `premium`, `recommended`, or `organic`
- `promotionTier`
- `campaignId` when available
- `position`

- [x] **Step 3: Add sponsored listing label metrics**

When a job is promoted by the dense marketplace plan, ensure the analytics dashboard can report performance for visibly labeled sponsored listings separately from organic listings.

- [x] **Step 4: Preserve ranking transparency**

Report sponsored sections separately from organic listings. Do not mix sponsored and organic metrics into a single unexplained ranking score.

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

## Implementation Notes

- Migration numbering was reconciled against existing migrations and generated as `packages/db/src/migrations/0007_bambi_analytics_paid_placement.sql`.
- `jobPerformanceEvent` stores immutable `impression`, `detail_view`, `chat_start`, and `contact_reveal` events with nullable `actorUserId` for anonymous/public listing traffic.
- Promoted listing impressions reuse the Dense Marketplace And Promotion Ops campaign schema by storing `campaignId`, `promotionTier`, `section`, and `position` in event metadata. No duplicate promotion campaign schema was created.
- `apps/web/src/components/bambi/marketplace.tsx` did not need a direct code change because promoted/organic sections and labels were already exposed by the marketplace model; analytics now records those sections at the `jobs.list` API boundary and reports them separately in `/employer/analytics`.

## Verification Notes

- `pnpm --filter @bambi-app/db db:migrate` passed after generating migration `0007_bambi_analytics_paid_placement.sql`.
- `pnpm db:seed:bambi` passed before browser verification.
- Browser verification on 2026-06-25:
  - Logged in as `seeker@bambi.dev`, opened a seeded job detail, started a chat from the job detail chat route, and opened `/seeker` to generate listing impressions.
  - Logged in as `owner@bambi.dev` and verified `/employer/analytics` showed `노출 3`, `상세 조회 3`, `채팅 시작 1`, `연락처 공개 0`, and section split `프리미엄 1`, `추천 1`, `일반 1`.
  - Browser error scan returned no errors.
- Final automated checks:
  - `pnpm --filter @bambi-app/api test` passed: 17 files, 78 tests.
  - `pnpm run check-types` passed.
  - `pnpm run check` passed.
  - `pnpm --filter web build` passed and included `/employer/analytics`.
  - `git diff --check` passed.

# Bambi Dense Marketplace And Promotion Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Foxalba benchmark where it fits Bambi: show more jobs per screen, add transparent promotion tiers, and give employers a practical ad-management surface.

**Architecture:** Keep seeker discovery fast and dense without copying Foxalba's unsafe free-form HTML model. Add promotion concepts as explicit records and visible listing sections, then expose remaining boosts, status, and expiry in employer management.

**Tech Stack:** Drizzle ORM, PostgreSQL, oRPC, TanStack Query, Next.js App Router, React 19, Tailwind CSS, @bambi-app/ui, Vitest, Ultracite.

---

## Source Benchmark

Use [Foxalba 벤치마킹 정리](../../foxalba-benchmark-2026-06-24.md) as the product reference.

Important takeaways:

- Dense mobile lists make the service feel active.
- Public listings should separate premium/recommended/organic placement instead of hiding ranking manipulation.
- Employer ad management needs clear status, expiry, edit limits, and boost counts.
- Free-form HTML detail editing should not be copied into Bambi; use structured fields and later block-based content instead.
- Payment-provider integration is out of scope for this plan.

## Scope

Included:

- Dense seeker job list row and count/tabs surface.
- Public listing API support for promoted sections.
- Promotion tier and boost-credit schema.
- Employer promotion management page with status, expiry, remaining boosts, and manual boost action.
- Ranking transparency through visible `프리미엄`, `추천`, and `일반` sections.
- Tests for promotion eligibility, boost consumption, and list ordering.

Excluded:

- Payment provider integration.
- Automatic card billing or tax invoice workflow.
- Rich block editor for job descriptions.
- Actual image upload pipeline beyond displaying existing job logo/initial fallback.
- Native app parity.

## File Structure

- Modify: `packages/db/src/schema/bambi.ts`
  - Add promotion tier/status enums, promotion campaign table, and boost event table.
- Create: `packages/db/src/migrations/0003_outgoing_wolf_cub.sql`
  - Add promotion tables, indexes, and constraints.
- Create: `packages/api/src/services/bambi-promotions.ts`
  - Own promotion section ordering, active campaign lookup, boost eligibility, and boost consumption.
- Create: `packages/api/src/services/bambi-promotions.test.ts`
  - Verify ordering, status handling, and boost consumption.
- Modify: `packages/api/src/routers/bambi/jobs.ts`
  - Return promoted sections and total count from public job listing.
- Create: `packages/api/src/routers/bambi/promotions.ts`
  - Employer-facing list/create/manual boost/pause API.
- Modify: `packages/api/src/routers/bambi/index.ts`
  - Register promotions router.
- Modify: `apps/web/src/lib/bambi/api-jobs.ts`
  - Read sectioned marketplace results and total count.
- Modify: `apps/web/src/components/bambi/marketplace.tsx`
  - Add dense row card and sectioned job list rendering.
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
  - Show discovery tabs, total count, and promoted/organic sections.
- Create: `apps/web/src/app/employer/promotions/page.tsx`
  - Employer promotion management surface.
- Modify: `apps/web/src/app/employer/page.tsx`
  - Add link and compact summary for promotion management.
- Modify: `apps/server/src/seeds/bambi-dev.ts`
  - Seed a premium campaign, a recommended campaign, and an organic-only job.

## Domain Model

Promotion tiers:

- `premium`: top visual section, strongest placement, manual and automatic boost allowance.
- `recommended`: section below premium, visible sponsor label, smaller boost allowance.
- `standard`: paid or verified baseline; appears in organic list unless explicitly promoted.

Promotion statuses:

- `draft`: configured but not visible.
- `pending_payment`: waiting for manual/admin payment confirmation.
- `active`: visible when the linked job is published and within date range.
- `paused`: employer or operator paused.
- `expired`: end date has passed.
- `canceled`: no longer eligible.

Boost behavior:

- Manual boost consumes one remaining credit and updates `lastBoostedAt`.
- Active promoted jobs order by `lastBoostedAt DESC`, then `startsAt DESC`.
- Organic jobs order by verified organization first, then `publishedAt DESC`.
- Boost is denied for unpublished, hidden, rejected, expired, paused, or unauthorized jobs.

## Task 1: Promotion Schema

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0003_outgoing_wolf_cub.sql`

- [x] **Step 1: Add promotion enums**

Add `promotionTier` and `promotionStatus` to `packages/db/src/schema/bambi.ts`.

Values:

```ts
export const promotionTier = pgEnum("promotion_tier", [
	"premium",
	"recommended",
	"standard",
]);

export const promotionStatus = pgEnum("promotion_status", [
	"draft",
	"pending_payment",
	"active",
	"paused",
	"expired",
	"canceled",
]);
```

- [x] **Step 2: Add campaign table**

Add `jobPromotionCampaign` to `packages/db/src/schema/bambi.ts`.

Required columns:

- `id`
- `jobPostId`
- `organizationId`
- `tier`
- `status`
- `startsAt`
- `endsAt`
- `manualBoostsTotal`
- `manualBoostsUsed`
- `autoBoostsPerDay`
- `lastBoostedAt`
- `createdAt`
- `updatedAt`

Required indexes:

- `job_promotion_campaign_job_post_id_idx`
- `job_promotion_campaign_organization_id_idx`
- `job_promotion_campaign_status_idx`
- `job_promotion_campaign_active_listing_idx` on `status`, `tier`, `endsAt`, `lastBoostedAt`

- [x] **Step 3: Add boost event table**

Add `jobPromotionBoostEvent` to `packages/db/src/schema/bambi.ts`.

Required columns:

- `id`
- `campaignId`
- `jobPostId`
- `organizationId`
- `actorUserId`
- `boostType`
- `createdAt`

Use `boostType` as text with allowed service values `manual` and `automatic`.

- [x] **Step 4: Create SQL migration**

Create `packages/db/src/migrations/0003_outgoing_wolf_cub.sql` with matching enum/table/index DDL.

- [x] **Step 5: Run schema checks**

Run:

```bash
pnpm run check-types
pnpm run check
```

Expected: both commands pass.

## Task 2: Promotion Service

**Files:**

- Create: `packages/api/src/services/bambi-promotions.ts`
- Create: `packages/api/src/services/bambi-promotions.test.ts`

- [x] **Step 1: Write ordering tests**

Create tests that verify:

- active premium campaigns appear before active recommended campaigns.
- active recommended campaigns appear before organic jobs only in their own visible section.
- expired, paused, canceled, and hidden-job campaigns are excluded from public promoted sections.

- [x] **Step 2: Write boost tests**

Create tests that verify:

- manual boost increments `manualBoostsUsed`.
- manual boost updates `lastBoostedAt`.
- boost is rejected when `manualBoostsUsed >= manualBoostsTotal`.
- boost is rejected when campaign status is not `active`.

- [x] **Step 3: Implement pure helpers**

Implement helpers in `bambi-promotions.ts`:

- `isCampaignPubliclyActive`
- `getPromotionSection`
- `sortPromotedCampaigns`
- `canConsumeManualBoost`
- `getRemainingManualBoosts`

- [x] **Step 4: Run service tests**

Run:

```bash
pnpm --filter @bambi-app/api test -- bambi-promotions
```

Expected: promotion service tests pass.

## Task 3: Sectioned Public Job Listing API

**Files:**

- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Create: `packages/api/src/routers/bambi/promotions.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`

- [x] **Step 1: Extend list response**

Change `bambi.jobs.list` to return:

```ts
{
	totalCount: number;
	sections: {
		premium: JobListItem[];
		recommended: JobListItem[];
		organic: JobListItem[];
	};
}
```

Keep existing job fields and add:

- `promotionTier`
- `promotionLabel`
- `isPromoted`
- `lastBoostedAt`

- [x] **Step 2: Preserve filter behavior**

Apply existing filters to every section:

- `industryCategory`
- `region`
- `minPayAmount`
- `limit`

Use separate per-section limits:

- premium: max 5
- recommended: max 10
- organic: remaining result budget up to requested `limit`

- [x] **Step 3: Add promotions router**

Create `bambi.promotions` procedures:

- `listMine`
- `createDraft`
- `activateForManualPayment`
- `pause`
- `boost`

All procedures must call existing employer access checks before touching a job's campaign.

- [ ] **Step 4: Add API tests**

Cover:

- sectioned list excludes unpublished jobs.
- promoted labels are visible only for active campaigns.
- employer cannot boost a campaign for another organization.

Run:

```bash
pnpm --filter @bambi-app/api test
```

Expected: all API tests pass.

Note: router-level API tests were not added in this pass. Promotion ordering and
boost policy are covered by `bambi-promotions.test.ts`; router behavior was
verified through type checks, full API tests, seed data, and browser smoke checks.

## Task 4: Dense Marketplace UI

**Files:**

- Modify: `apps/web/src/lib/bambi/api-jobs.ts`
- Modify: `apps/web/src/components/bambi/marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`

- [x] **Step 1: Adapt API mapping**

Update `useMarketplaceJobs` so it returns:

- `totalCount`
- `premiumJobs`
- `recommendedJobs`
- `organicJobs`
- `isApiBacked`
- `isError`
- `isLoading`
- `refetch`

Map `promotionTier`, `promotionLabel`, and `isPromoted` into the local `Job` shape or a new `MarketplaceJob` type.

- [x] **Step 2: Add dense row card**

Adapt `ResponsiveJobCard` in `apps/web/src/components/bambi/marketplace.tsx`
into a denser row-style card.

Required row content:

- 44px logo/initial square
- title
- company
- region
- pay
- work schedule
- verification or promotion badge
- compact chat button on desktop

Target height: 60px to 72px on mobile.

- [x] **Step 3: Add sectioned list**

Add `SectionedJobList` that renders:

- `프리미엄`
- `추천`
- `전체 공고`

Hide empty promoted sections. Keep `전체 공고` visible even when empty so the empty state remains understandable.

- [x] **Step 4: Add discovery tabs and total count**

In `SeekerMarketplaceScreen`, add top tabs:

- `전체`
- `지역별`
- `업종별`
- `지도`
- `오늘 본 공고`

`전체`, `지역별`, and `업종별` are selectable tabs. `지도` and `오늘 본 공고`
remain disabled with accessible disabled states; actual filtering still uses the
existing sidebar/search controls.

- [x] **Step 5: Browser verify density**

Run the web app and verify:

- mobile viewport shows at least 8 job rows before long scrolling.
- desktop viewport shows filter/sidebar/list/detail without overlap.
- promotion labels are visible and not confused with verification badges.

## Task 5: Employer Promotion Management UI

**Files:**

- Create: `apps/web/src/app/employer/promotions/page.tsx`
- Modify: `apps/web/src/app/employer/page.tsx`

- [x] **Step 1: Add employer route**

Create `/employer/promotions` with:

- campaign status tabs
- job title
- tier
- status
- start/end dates
- remaining manual boosts
- last boosted time
- actions: `끌어올리기`, `일시중지`

- [x] **Step 2: Add status grouping**

Use these groups:

- `게재중`: active campaigns
- `결제대기`: pending_payment campaigns
- `종료`: expired or canceled campaigns
- `일시중지`: paused campaigns

- [x] **Step 3: Add boost action**

Connect `끌어올리기` to `bambi.promotions.boost`.

Disable the button when:

- remaining boosts are 0
- campaign is not active
- linked job is not published

- [x] **Step 4: Link from employer dashboard**

Add a visible link from `/employer` to `/employer/promotions`.

Also show a compact summary:

- active promotion count
- pending payment count
- total remaining boosts

## Task 6: Seed Data And Verification

**Files:**

- Modify: `apps/server/src/seeds/bambi-dev.ts`
- Modify: `docs/superpowers/plans/2026-06-24-bambi-dense-marketplace-promotion-ops.md`

- [x] **Step 1: Seed promotion campaigns**

Seed:

- one active premium campaign
- one active recommended campaign
- one expired campaign
- one organic published job without promotion

- [x] **Step 2: Run seed**

Run:

```bash
pnpm run db:seed:bambi
```

Expected: seed completes without errors.

- [x] **Step 3: Run automated checks**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
pnpm --filter web build
```

Expected: all commands pass.

- [x] **Step 4: Browser smoke check**

Verify:

- `/seeker` shows `프리미엄`, `추천`, and `전체 공고` sections with dense rows.
- `/employer/promotions` shows seeded campaigns.
- manual boost updates remaining boost count.
- promoted job moves to the top of its section after boost.

- [x] **Step 5: Update plan status and commit**

Check completed boxes, add notes with exact verification results, then commit with Korean Conventional Commits format.

Verification results on 2026-06-24:

- `pnpm run db:migrate`: passed.
- `pnpm run db:seed:bambi`: passed.
- `pnpm run check-types`: passed.
- `pnpm run test`: passed.
- `pnpm run check`: passed.
- `pnpm --filter web build`: passed.
- Playwright `/seeker`: premium, recommended, organic sections visible with promotion labels.
- Playwright `/employer/promotions`: status tabs, active/expired campaigns, disabled expired boost, and remaining boost counts visible.
- Playwright manual boost smoke: active campaign remaining boost count decreased, then seed was rerun to restore deterministic values.

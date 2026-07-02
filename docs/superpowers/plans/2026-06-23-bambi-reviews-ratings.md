# Bambi Reviews And Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add post-interview or post-work review authoring and safe public rating summaries for job seekers.

**Architecture:** Reviews are tied to completed chat/interview context to reduce fake reviews. Public surfaces show aggregate rating signals, while detailed review text goes through moderation and privacy filtering before display.

**Tech Stack:** Drizzle ORM, PostgreSQL, oRPC, TanStack Query, Next.js App Router, React 19, Tailwind CSS, Vitest, Ultracite.

---

## Scope

Included:

- Review schema and policy service.
- Review creation after confirmed/completed interview context.
- Aggregate ratings on job cards and details.
- Basic moderation flags for review text.

Excluded:

- Public employer reply workflow.
- Review incentives or rewards.
- Native review UI.

## File Structure

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0006_bambi_reviews_ratings.sql`
- Create: `packages/api/src/services/bambi-review-policy.ts`
- Create: `packages/api/src/services/bambi-review-policy.test.ts`
- Create: `packages/api/src/routers/bambi/reviews.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Modify: `apps/web/src/components/bambi/marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
- Create: `apps/web/src/components/bambi/review-form.tsx`

## Task 1: Review Domain Model

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0006_bambi_reviews_ratings.sql`
- Create: `packages/api/src/services/bambi-review-policy.ts`
- Test: `packages/api/src/services/bambi-review-policy.test.ts`

- [x] **Step 1: Add review table**

Store `id`, `jobPostId`, `organizationId`, `chatRoomId`, `reviewerUserId`, `rating`, `body`, `status`, `riskFlags`, `createdAt`, `updatedAt`.

Implementation note: `packages/db/src/schema/bambi.ts` already has an early MVP `review` table from migration `0000_perfect_stranger.sql`. This plan should extend/migrate that table with `0006_bambi_reviews_ratings.sql` instead of creating a new `0004` migration.

- [x] **Step 2: Add unique constraint**

Enforce one review per `(chatRoomId, reviewerUserId)`.

- [x] **Step 3: Add review policy**

Ratings must be integers from 1 to 5. Review body must be 20 to 1000 characters. Text with phone numbers, external messenger IDs, threats, or explicit personal data gets `pending_review`.

- [x] **Step 4: Add policy tests**

Test valid review, invalid rating, too-short body, phone number detection, and external messenger detection.

## Task 2: Review API

**Files:**

- Create: `packages/api/src/routers/bambi/reviews.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`

- [x] **Step 1: Add `create` endpoint**

Allow only the job seeker in a chat room to create a review after at least one confirmed or completed interview schedule exists.

- [x] **Step 2: Add `listMine` endpoint**

Return reviews authored by the current user.

- [x] **Step 3: Add aggregates to jobs**

Return `ratingAverage` and `ratingCount` from `bambi.jobs.list` and job detail responses.

- [x] **Step 4: Add API tests**

Verify authorized creation, duplicate prevention, and aggregate calculation.

## Task 3: Web Review UI

**Files:**

- Create: `apps/web/src/components/bambi/review-form.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Modify: `apps/web/src/components/bambi/marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`

- [x] **Step 1: Add review form component**

Use a 1-5 rating control, body textarea, validation messages, and submit button.

- [x] **Step 2: Show review CTA**

In a chat room with confirmed/completed interview context, show "후기 남기기" for the seeker when no review exists.

- [x] **Step 3: Show aggregate ratings**

Update job cards and detail to use API-provided `ratingAverage` and `ratingCount`.

- [x] **Step 4: Browser verify**

As `seeker@bambi.dev`, complete a review from a qualified chat and confirm aggregate rating updates after refresh.

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

- 2026-06-25: Applied `0006_bambi_reviews_ratings.sql` locally with `pnpm --filter @bambi-app/db db:migrate`, then reset seed state with `pnpm db:seed:bambi`.
- Automated checks passed: `pnpm --filter @bambi-app/api test`, `pnpm vitest run apps/web/src/lib/bambi/api-jobs.test.ts`, `pnpm run check-types`, `pnpm run check`, `pnpm --filter web build`.
- Browser verification passed with `agent-browser`: logged in as `seeker@bambi.dev`, opened `/seeker/chats/33333333-3333-4333-8333-333333333301`, submitted a 5-star review, then confirmed `/seeker` and `/seeker/jobs/22222222-2222-4222-8222-222222222202` show `후기 1개 · 5.0`.
- `agent-browser errors` returned no console/runtime errors after the browser flow.

# Bambi Web Final QA Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the Web experience is ready for final acceptance before any Native App work resumes.

**Architecture:** Treat this as a documentation and verification gate, not a feature implementation pass. Use the completed Web MVP and Post-MVP plans as source material, run the full automated gate against the current `develop` worktree, then record browser or route-smoke evidence for seeker, employer, moderator, and public surfaces.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Turborepo, pnpm, Better Auth, oRPC, Drizzle ORM, Vitest, Ultracite, local seeded PostgreSQL.

---

## Scope

Included:

- Documentation consistency audit for current Web status.
- Seed reset with deterministic Bambi development data.
- API test, typecheck, Ultracite, and Web production build gates.
- Browser or route-smoke verification for public, seeker, employer, and moderator Web surfaces.
- Final acceptance note that Native App remains paused unless this Web gate is accepted.

Excluded:

- Native App implementation or simulator verification.
- New feature implementation.
- Payment provider integration.
- Job post image upload or block editor implementation.

## Acceptance Matrix

Web final acceptance requires evidence for every item below:

| Area | Evidence |
| --- | --- |
| Documentation | Post-MVP roadmap shows only Native App as paused; historical plans do not look like active work. |
| Seed data | `pnpm run db:seed:bambi` passes. |
| API behavior | `pnpm --filter @bambi-app/api test` passes. |
| Types | `pnpm run check-types` passes. |
| Code quality | `pnpm run check` passes. |
| Production readiness | `pnpm --filter web build` passes. |
| Web surfaces | Public marketplace, seeker, employer, and moderator routes render without server errors. |
| Native boundary | Native App remains explicitly deferred until Web acceptance is reviewed. |

## Task 1: Documentation Consistency Audit

**Files:**

- Modify: `docs/result.md`
- Modify: `docs/superpowers/plans/2026-06-23-bambi-post-mvp-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-12-bambi-domain-foundation.md`
- Modify: `docs/superpowers/plans/2026-06-12-bambi-onboarding-seed.md`
- Modify: `docs/superpowers/plans/2026-06-12-bambi-web-marketplace-mvp.md`
- Modify: `docs/superpowers/plans/2026-06-23-bambi-responsive-marketplace-redesign.md`

- [x] **Step 1: Mark completed Post-MVP rows consistently**

Update the roadmap index so Reviews And Ratings and Employer Analytics And Paid Placement show completed status in the same way as earlier completed rows.

- [x] **Step 2: Refresh result summary follow-up status**

Update `docs/result.md` so completed Post-MVP candidates are marked as completed and Native App is marked as deferred until Web final acceptance.

- [x] **Step 3: Disambiguate historical plans**

Add status notes to older plans with unchecked archival checkboxes so they are not mistaken for active roadmap work.

## Task 2: Automated Final Gate

**Files:**

- Modify this plan with exact verification results.

- [x] **Step 1: Reset deterministic seed data**

Run:

```bash
pnpm run db:seed:bambi
```

Expected: seed completes without errors and prints deterministic development accounts.

- [x] **Step 2: Run API tests**

Run:

```bash
pnpm --filter @bambi-app/api test
```

Expected: all Bambi API tests pass.

- [x] **Step 3: Run monorepo typecheck**

Run:

```bash
pnpm run check-types
```

Expected: all scoped package type checks pass.

- [x] **Step 4: Run Ultracite check**

Run:

```bash
pnpm run check
```

Expected: Ultracite reports no required fixes.

- [x] **Step 5: Run Web production build**

Run:

```bash
pnpm --filter web build
```

Expected: Next.js production build succeeds and includes public, seeker, employer, moderator, analytics, and promotions routes.

## Task 3: Web Surface Smoke Verification

**Files:**

- Modify this plan with exact smoke results.

- [x] **Step 1: Start local API server**

Run:

```bash
pnpm run dev:server
```

Expected: server starts on the configured local API port without TypeScript or runtime errors.

- [x] **Step 2: Start local Web server**

Run:

```bash
pnpm run dev:web
```

Expected: Web starts on `http://localhost:23001`.

- [x] **Step 3: Smoke public and protected routes**

Open or request:

```text
http://localhost:23001/
http://localhost:23001/seeker
http://localhost:23001/employer
http://localhost:23001/employer/promotions
http://localhost:23001/employer/analytics
http://localhost:23001/moderator
```

Expected:

- Public route renders the dense marketplace first impression.
- Protected seeker, employer, and moderator routes either render for the current authenticated session or redirect to login without server errors.
- No route returns a Next.js error page.

- [x] **Step 4: Smoke key authenticated flows when browser session is available**

Use seeded dev accounts:

- `seeker@bambi.dev` / `Bambi1234!`: browse jobs, open a detail, open chat, verify review/contact-reveal entry points remain visible only in eligible contexts.
- `owner@bambi.dev` / `Bambi1234!`: open employer dashboard, promotions, analytics, create/edit route entry points.
- `admin@bambi.dev` / `Bambi1234!`: open moderator dashboard, queue, reports, and users.

Expected: each role reaches its main Web surface without console/runtime errors.

## Task 4: Final Acceptance Note

**Files:**

- Modify: `docs/result.md`
- Modify: `docs/superpowers/plans/2026-06-26-bambi-web-final-qa-acceptance.md`

- [x] **Step 1: Record final QA result**

Append verification notes with exact command results and any route-smoke findings.

- [x] **Step 2: Keep Native App deferred**

Confirm the roadmap still says Native App is paused until Web final completion is accepted.

- [x] **Step 3: Commit docs after review**

After the user reviews the result, commit with a Korean Conventional Commit message.

## Verification Notes

- 2026-06-26 documentation consistency audit completed:
  - Post-MVP Roadmap now marks Reviews And Ratings and Employer Analytics And Paid Placement as completed.
  - `docs/result.md` now marks completed follow-up candidates and keeps Native App deferred until Web final acceptance.
  - Historical 2026-06-12 and responsive redesign plans now explain that unchecked boxes are archival implementation recipes, not active roadmap tasks.
- 2026-06-29 commit follow-up:
  - Documentation review result was committed in `e2e5442`.
- Automated final gate on 2026-06-26:
  - `pnpm run db:seed:bambi` passed.
  - `pnpm --filter @bambi-app/api test` passed: 17 files, 78 tests.
  - `pnpm run check-types` passed.
  - `pnpm run check` passed.
  - `pnpm --filter web build` passed and generated 21 static pages plus dynamic seeker, employer, and moderator routes.
- Route smoke on 2026-06-26:
  - Existing dev servers had stopped, so API and Web were restarted with `pnpm run dev:server` and `pnpm run dev:web`.
  - Public and protected routes returned 200 OK without Next error markers: `/`, `/seeker`, `/employer`, `/employer/promotions`, `/employer/analytics`, `/moderator`, `/moderator/reports`, `/moderator/users`, `/login`.
  - Seeded dynamic routes returned 200 OK without Next error markers: seeker job detail/chat/reveal, employer edit, moderator queue/report/user detail.
- Browser QA on 2026-06-26:
  - `seeker@bambi.dev` logged in, reached onboarding with an existing job seeker profile, moved to `/seeker`, and opened seeded job detail.
  - `owner@bambi.dev` logged in, reached `/employer`, and rendered `/employer/promotions` plus `/employer/analytics` in the same authenticated session.
  - `admin@bambi.dev` logged in and initially exposed a routing bug: the existing admin profile button labeled `관리자 화면으로 이동` navigated to `/employer`.
  - Fixed the routing bug by extracting `getOnboardingNextRoute` and routing `admin` to `/moderator`.
  - Added `apps/web/src/lib/bambi/onboarding-routes.test.ts`; targeted test passed with 3 tests.
  - Rechecked admin browser flow: `관리자 화면으로 이동` now navigates to `/moderator`, and moderator queue renders with seeded data.
  - Playwright console logs for the final `localhost` browser checks showed React DevTools/HMR informational messages and no application runtime errors. An earlier `127.0.0.1` dev check produced a Next HMR WebSocket handshake error, so browser checks were continued against `http://localhost:23001`.
- Post-fix verification on 2026-06-26:
  - `pnpm vitest run apps/web/src/lib/bambi/onboarding-routes.test.ts` passed: 1 file, 3 tests.
  - `pnpm run check-types` passed.
  - `pnpm run check` passed.
  - `pnpm --filter web build` passed.
- Acceptance status: Web final QA gate is passed for the documented automated checks, route smoke, and authenticated browser entry checks. Native App remains deferred until the user reviews and accepts this Web gate.

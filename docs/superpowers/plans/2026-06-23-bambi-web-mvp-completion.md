# Bambi Web MVP Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the first Web MVP across seeker, employer, and moderator flows using the current `/seeker`, `/employer`, and `/moderator` route structure.

**Architecture:** Keep policy and authorization in the existing `bambi.*` oRPC routers, and make Web screens thin TanStack Query clients. Reuse the responsive Bambi shell and light safety-first visual language, while replacing preview/sample-only screens with API-backed flows where the specs mark work as remaining.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, @bambi-app/ui, Better Auth, oRPC, TanStack Query, Drizzle ORM, Vitest, Ultracite.

**Current Status:** Specs are current as of 2026-06-23. Seeker marketplace/detail/chat entry/list/detail are API-first with sample fallback. Login and onboarding exist. Backend routers already expose `bambi.jobs.listMine/create/update/getEditableById`, `bambi.chats.proposeInterview/setInterviewStatus/revealContact`, and `bambi.moderation.*`. Remaining Web MVP work is primarily UI wiring.

---

## Scope

Included from specs:

- Seeker: finish chat room scheduling and contact reveal UI on `/seeker/chats/[id]` and `/seeker/chats/[id]/reveal`.
- Employer: replace sample/local `/employer` and `/employer/new` with API-backed job management, and add `/employer/jobs/[id]/edit`.
- Moderator: connect existing moderator screens to `bambi.moderation` action mutations for report status, job post status, and user status.
- Plans: keep this completion plan as the authoritative checklist for remaining 1st Web MVP work; older plans remain historical context.

Excluded from this completion pass:

- Native app screens.
- WebSocket real-time chat, read receipts, typing indicators, image messages.
- Review/rating authoring.
- Paid placement and employer analytics.
- Full organization/team administration beyond existing onboarding/profile data.

## File Structure

- Modify `apps/web/src/app/employer/page.tsx`
  - Query `bambi.onboarding.getMine` and `bambi.jobs.listMine`.
  - Show organization/team profile status and editable owned job list.
- Modify `apps/web/src/app/employer/new/page.tsx`
  - Use `bambi.jobs.create` with accessible posting scopes from `getMine`.
- Create `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`
  - Use `bambi.jobs.getEditableById` and `bambi.jobs.update`.
- Create `apps/web/src/components/bambi/empty-state.tsx`
  - Shared compact empty/error state for management screens.
- Create `apps/web/src/components/bambi/form-message.tsx`
  - Accessible form-level and field-level validation messages.
- Create `apps/web/src/components/bambi/page-shell.tsx`
  - Shared management page wrapper.
- Create `apps/web/src/components/bambi/status-badge.tsx`
  - Border-first status badge component.
- Create `apps/web/src/lib/bambi-format.ts`
  - Format pay, date/time, and nullable values.
- Create `apps/web/src/lib/bambi-options.ts`
  - Centralize industry, region, pay unit, status label options.
- Create `apps/web/src/lib/bambi-job-form.ts`
  - Validate job create/update form and produce API input.
- Modify `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
  - Add schedule proposal and confirm/decline/cancel/complete mutations.
  - Route contact reveal only when a confirmed schedule exists.
- Modify `apps/web/src/components/bambi/screens/contact-reveal.tsx`
  - Replace preview content with `bambi.chats.revealContact` consent UI.
- Modify `apps/web/src/components/bambi/screens/moderator.tsx`
  - Add real mutation hooks or callbacks for moderation actions.
- Modify `apps/web/src/app/moderator/**/*.tsx`
  - Ensure queue/report/user detail pages can trigger actual moderation API actions.

## Task 1: Employer API Job Management

**Files:**

- Create: `apps/web/src/components/bambi/empty-state.tsx`
- Create: `apps/web/src/components/bambi/form-message.tsx`
- Create: `apps/web/src/components/bambi/page-shell.tsx`
- Create: `apps/web/src/components/bambi/status-badge.tsx`
- Create: `apps/web/src/lib/bambi-format.ts`
- Create: `apps/web/src/lib/bambi-options.ts`
- Create: `apps/web/src/lib/bambi-job-form.ts`
- Modify: `apps/web/src/app/employer/page.tsx`
- Modify: `apps/web/src/app/employer/new/page.tsx`
- Create: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`

- [x] **Step 1: Move reusable helper files from `apps/web/src_temp` into `apps/web/src`**

Use the existing temp files as the starting point, then change stale links from `/jobs` and `/employer/jobs/new` to `/seeker` and `/employer/new`.

- [x] **Step 2: Replace `/employer` with API-backed management**

`/employer` must query `orpc.bambi.onboarding.getMine` and `orpc.bambi.jobs.listMine`, show organization/team status, list owned jobs, link new jobs to `/employer/new`, and link edits to `/employer/jobs/[id]/edit`.

- [x] **Step 3: Replace `/employer/new` with API-backed create form**

`/employer/new` must validate job fields with `validateJobForm`, use `orpc.bambi.jobs.create`, invalidate `listMine`, and return to `/employer` on success.

- [x] **Step 4: Add `/employer/jobs/[id]/edit`**

The edit page must query `getEditableById`, keep organization/team read-only, validate fields with `validateJobForm`, call `orpc.bambi.jobs.update`, invalidate related job queries, and return to `/employer`.

- [x] **Step 5: Verify employer flow**

Run:

```bash
pnpm run check-types
pnpm run check
```

Expected: both commands pass.

## Task 2: Chat Scheduling And Contact Reveal

**Files:**

- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Modify: `apps/web/src/components/bambi/screens/contact-reveal.tsx`
- Modify: `apps/web/src/app/seeker/chats/[id]/reveal/page.tsx`

- [x] **Step 1: Add interview proposal form**

Add `datetime-local` and location note fields to the chat detail side panel. Submit through `orpc.bambi.chats.proposeInterview`, then invalidate `getById` and `listMine`.

- [x] **Step 2: Add schedule status actions**

For each proposed schedule not proposed by the current user, show confirm and decline buttons. For confirmed schedules, show cancel and complete actions where the API allows them. Use `orpc.bambi.chats.setInterviewStatus`.

- [x] **Step 3: Connect reveal contact**

The reveal route must query the chat room, find a confirmed schedule, collect contact method/value, call `orpc.bambi.chats.revealContact`, and show the saved consent state.

- [x] **Step 4: Verify chat flow**

Run:

```bash
pnpm run check-types
pnpm run check
```

Expected: both commands pass.

## Task 3: Moderator Action Wiring

**Files:**

- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`
- Modify: `apps/web/src/components/bambi/screens/moderator-context.tsx`
- Modify: `apps/web/src/app/moderator/page.tsx`
- Modify: `apps/web/src/app/moderator/queue/[id]/page.tsx`
- Modify: `apps/web/src/app/moderator/reports/[id]/page.tsx`
- Modify: `apps/web/src/app/moderator/users/[id]/page.tsx`

- [x] **Step 1: Identify current moderator preview state**

Read the moderator context and screens. Keep local preview data only as fallback copy; API-backed pages should call `bambi.moderation.listReports`, `setReportStatus`, `setJobPostStatus`, and `setUserStatus`.

- [x] **Step 2: Wire report status actions**

Report detail pages must set reports to `reviewing`, `resolved`, or `dismissed` with a required reason.

- [x] **Step 3: Wire job post moderation actions**

Queue detail pages must publish, reject, or hide pending posts with a required reason.

- [x] **Step 4: Wire user status actions**

User detail pages must set user status to `active`, `warned`, or `suspended` with a required reason.

- [x] **Step 5: Verify moderator flow**

Run:

```bash
pnpm run check-types
pnpm run check
```

Expected: both commands pass.

## Task 4: Final Web MVP Verification

**Files:**

- Modify only files required by verification findings.

- [x] **Step 1: Run automated checks**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
pnpm --filter web build
```

Expected: all commands pass.

- [ ] **Step 2: Browser verify main flows**

With seeded data and local API/web servers:

- `seeker@bambi.dev` can browse, open detail, start chat, send message, respond to interview proposal, and reveal contact after confirmation.
- `owner@bambi.dev` can see organization/team status, create a job, and edit a job.
- `admin@bambi.dev` can review reports, moderate job posts, and change user status through Web screens.

2026-06-23 진행 노트:

- `pnpm run db:seed:bambi` 성공.
- dev API 서버 `http://127.0.0.1:23000`와 Web 서버 `http://localhost:23001` 구동 확인.
- 브라우저에서 `/seeker`, owner 로그인 후 `/employer`, admin 로그인 후 `/moderator` 렌더링 확인.
- owner `/employer`와 admin `/moderator`는 API 데이터가 표시되고 콘솔 오류 0건 확인.
- 교차 계정 채팅 일정 제안/확정/연락처 공개의 전체 브라우저 시나리오는 후속 자동화 검증으로 남긴다.

- [ ] **Step 3: Update docs and commit**

Update specs/plans checkboxes or status notes to reflect completed Web MVP scope, then commit in Korean Conventional Commits format.

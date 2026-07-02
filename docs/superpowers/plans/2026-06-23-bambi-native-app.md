# Bambi Native App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile native app shell and first-pass seeker, employer, and moderator flows aligned with the completed Web MVP.

**Architecture:** Reuse existing API contracts and domain rules instead of creating native-only behavior. Native screens should follow Expo Router structure, share validation constants where possible, and keep sensitive contact/reveal flows consistent with Web.

**Tech Stack:** Expo, React Native, Expo Router, TypeScript, oRPC client, Better Auth client, TanStack Query, NativeWind or project-native styling, EAS-compatible build setup.

---

## Status

Paused / deferred as of 2026-06-25. Still deferred as of 2026-06-29.

The native shell foundation landed in `738f321`, including the role-based app shell, seeker/employer/moderator screens, native oRPC client, and automated checks. The Web final baseline is now documented, but native implementation, simulator hardening, and native-only flow design should still not continue until the user explicitly asks to resume native work.

Resume this plan only after:

- The user explicitly resumes Native App work.
- Web API/domain contracts remain stable enough to be the native source of truth.
- Remaining native verification can focus on parity instead of defining new behavior.

When resumed, start with the pending iOS/Android simulator smoke items for seeker contact reveal, owner create/edit, and admin moderation actions.

## Scope

Included:

- Native auth/onboarding entry.
- Seeker job list/detail/chat/reveal shell.
- Employer job list/create/edit shell.
- Moderator queue/report/user shell.
- Local simulator verification.

Excluded:

- App Store deployment.
- Push notifications.
- Native media upload.
- Deep links.

## File Structure

- Modify: `apps/native/app/_layout.tsx`
- Create: `apps/native/app/login.tsx`
- Create: `apps/native/app/onboarding.tsx`
- Create: `apps/native/app/(seeker)/index.tsx`
- Create: `apps/native/app/(seeker)/jobs/[id].tsx`
- Create: `apps/native/app/(seeker)/chats/index.tsx`
- Create: `apps/native/app/(seeker)/chats/[id].tsx`
- Create: `apps/native/app/(seeker)/chats/[id]/reveal.tsx`
- Create: `apps/native/app/(employer)/index.tsx`
- Create: `apps/native/app/(employer)/new.tsx`
- Create: `apps/native/app/(employer)/jobs/[id]/edit.tsx`
- Create: `apps/native/app/(moderator)/index.tsx`
- Create: `apps/native/app/(moderator)/reports.tsx`
- Create: `apps/native/app/(moderator)/users.tsx`
- Create: `apps/native/app/index.tsx`
- Create: `apps/native/app/(seeker)/_layout.tsx`
- Create: `apps/native/app/(employer)/_layout.tsx`
- Create: `apps/native/app/(moderator)/_layout.tsx`
- Create: `apps/native/src/lib/orpc.ts`
- Create: `apps/native/src/components/*`
- Modify: `apps/native/package.json`
- Remove: Expo sample drawer, tab, modal, AI, and todo routes.

## Task 1: Native App Foundation

**Files:**

- Modify: `apps/native/app/_layout.tsx`
- Create: `apps/native/src/lib/orpc.ts`
- Create: `apps/native/app/login.tsx`
- Create: `apps/native/app/onboarding.tsx`

- [x] **Step 1: Configure API client**

Create a native oRPC client that points to the configured API base URL and sends auth credentials according to the existing Better Auth setup.

- [x] **Step 2: Add app-level providers**

Wrap the app in TanStack Query provider and auth/session provider.

- [x] **Step 3: Add login screen**

Support email/password login for dev accounts and route by profile role after login.

- [x] **Step 4: Add onboarding screen**

Mirror the Web role selection and profile completion behavior.

- [x] **Step 5: Verify**

Run:

```bash
pnpm expo start
```

Expected: the app launches in simulator and login renders.

## Task 2: Native Seeker Flow

**Files:**

- Create: `apps/native/app/(seeker)/index.tsx`
- Create: `apps/native/app/(seeker)/jobs/[id].tsx`
- Create: `apps/native/app/(seeker)/chats/index.tsx`
- Create: `apps/native/app/(seeker)/chats/[id].tsx`
- Create: `apps/native/app/(seeker)/chats/[id]/reveal.tsx`

- [x] **Step 1: Add job list**

Use `bambi.jobs.list` and render mobile-first job cards.

- [x] **Step 2: Add job detail**

Use job detail data and expose chat start CTA.

- [x] **Step 3: Add chat room**

Use existing chat APIs for messages, interview schedule status actions, and message send.

- [x] **Step 4: Add contact reveal**

Use `bambi.chats.revealContact` only when a confirmed schedule exists.

- [ ] **Step 5: Simulator verify**

As `seeker@bambi.dev`, browse jobs, open detail, open chat, and reveal contact after confirmed schedule.

## Task 3: Native Employer Flow

**Files:**

- Create: `apps/native/app/(employer)/index.tsx`
- Create: `apps/native/app/(employer)/new.tsx`
- Create: `apps/native/app/(employer)/jobs/[id]/edit.tsx`

- [x] **Step 1: Add employer dashboard**

Use `bambi.onboarding.getMine` and `bambi.jobs.listMine`.

- [x] **Step 2: Add create form**

Reuse the same field requirements as Web `validateJobForm`.

- [x] **Step 3: Add edit form**

Use `getEditableById` and `update`.

- [ ] **Step 4: Simulator verify**

As `owner@bambi.dev`, create and edit one job.

## Task 4: Native Moderator Flow

**Files:**

- Create: `apps/native/app/(moderator)/index.tsx`
- Create: `apps/native/app/(moderator)/reports.tsx`
- Create: `apps/native/app/(moderator)/users.tsx`

- [x] **Step 1: Add moderation queue**

Use `bambi.moderation.listJobPosts` and status mutation actions.

- [x] **Step 2: Add reports screen**

Use `listReports` and report status actions.

- [x] **Step 3: Add users screen**

Use `listUsers` and user status actions.

- [ ] **Step 4: Simulator verify**

As `admin@bambi.dev`, approve a job, dismiss a report, and warn a user.

## Task 5: Final Verification

- [x] **Step 1: Run automated checks**

```bash
pnpm run check-types
pnpm run check
```

Expected: all commands pass.

- [ ] **Step 2: Update plan and commit**

Check completed boxes, add simulator verification notes, and commit with Korean Conventional Commits format.

## Implementation Notes

- Replaced the Better T Stack sample native drawer/tabs/todo/AI routes with a Bambi-specific Expo Router stack.
- Added `/login`, `/onboarding`, role-based root routing, and grouped seeker/employer/moderator route stacks.
- Added `apps/native/src/lib/orpc.ts` for the native oRPC client and Better Auth cookie forwarding, while keeping the existing `apps/native/utils/orpc.ts` usable for legacy native components.
- Added `apps/native/src/lib/bambi-native.ts` with Web-compatible job form validation helpers, native route selection helpers, status labels, and contact-reveal schedule guards.
- Added a focused helper test at `apps/native/src/lib/bambi-native.test.ts`.
- Added a native `check-types` script so `pnpm run check-types` includes the native package.
- Local ignored file `apps/native/.env` was adjusted to `EXPO_PUBLIC_SERVER_URL=http://localhost:23000` to match the server dev port.

## Verification Notes

- `pnpm exec vitest run apps/native/src/lib/bambi-native.test.ts` passed: 1 file, 3 tests.
- `pnpm --filter native check-types` passed.
- `pnpm run check-types` passed and included `native:check-types`.
- `pnpm run check` passed after formatting Expo-generated ignored declaration files.
- `git diff --check` passed.
- `pnpm db:seed:bambi` passed before native API smoke verification.
- `pnpm --filter native exec expo start --clear` initially failed in sandbox while installing React Native DevTools, then passed with escalated permission and showed the Expo Go QR/Metro URL.
- Expo web bundle passed from the Expo dev menu.
- Browser smoke on 2026-06-25:
  - Opened `http://127.0.0.1:8081`.
  - Verified the native login screen rendered with no console errors.
  - Started the API server with `CORS_ORIGIN=http://127.0.0.1:8081` and `BETTER_AUTH_URL=http://127.0.0.1:23000`.
  - Logged in as `seeker@bambi.dev`.
  - Verified the app routed to `공고 탐색` and rendered seeded premium, recommended, and organic jobs.
  - Console error count was 0.
- Pending manual/simulator smoke:
  - Complete the seeker detail -> chat start -> confirmed schedule -> contact reveal flow in an iOS/Android simulator.
  - Complete the owner create/edit job flow in an iOS/Android simulator.
  - Complete the admin approve/dismiss/warn flow in an iOS/Android simulator.

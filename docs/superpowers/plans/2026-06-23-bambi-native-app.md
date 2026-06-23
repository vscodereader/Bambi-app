# Bambi Native App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile native app shell and first-pass seeker, employer, and moderator flows aligned with the completed Web MVP.

**Architecture:** Reuse existing API contracts and domain rules instead of creating native-only behavior. Native screens should follow Expo Router structure, share validation constants where possible, and keep sensitive contact/reveal flows consistent with Web.

**Tech Stack:** Expo, React Native, Expo Router, TypeScript, oRPC client, Better Auth client, TanStack Query, NativeWind or project-native styling, EAS-compatible build setup.

---

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
- Create: `apps/native/src/lib/orpc.ts`
- Create: `apps/native/src/components/*`

## Task 1: Native App Foundation

**Files:**

- Modify: `apps/native/app/_layout.tsx`
- Create: `apps/native/src/lib/orpc.ts`
- Create: `apps/native/app/login.tsx`
- Create: `apps/native/app/onboarding.tsx`

- [ ] **Step 1: Configure API client**

Create a native oRPC client that points to the configured API base URL and sends auth credentials according to the existing Better Auth setup.

- [ ] **Step 2: Add app-level providers**

Wrap the app in TanStack Query provider and auth/session provider.

- [ ] **Step 3: Add login screen**

Support email/password login for dev accounts and route by profile role after login.

- [ ] **Step 4: Add onboarding screen**

Mirror the Web role selection and profile completion behavior.

- [ ] **Step 5: Verify**

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

- [ ] **Step 1: Add job list**

Use `bambi.jobs.list` and render mobile-first job cards.

- [ ] **Step 2: Add job detail**

Use job detail data and expose chat start CTA.

- [ ] **Step 3: Add chat room**

Use existing chat APIs for messages, interview schedule status actions, and message send.

- [ ] **Step 4: Add contact reveal**

Use `bambi.chats.revealContact` only when a confirmed schedule exists.

- [ ] **Step 5: Simulator verify**

As `seeker@bambi.dev`, browse jobs, open detail, open chat, and reveal contact after confirmed schedule.

## Task 3: Native Employer Flow

**Files:**

- Create: `apps/native/app/(employer)/index.tsx`
- Create: `apps/native/app/(employer)/new.tsx`
- Create: `apps/native/app/(employer)/jobs/[id]/edit.tsx`

- [ ] **Step 1: Add employer dashboard**

Use `bambi.onboarding.getMine` and `bambi.jobs.listMine`.

- [ ] **Step 2: Add create form**

Reuse the same field requirements as Web `validateJobForm`.

- [ ] **Step 3: Add edit form**

Use `getEditableById` and `update`.

- [ ] **Step 4: Simulator verify**

As `owner@bambi.dev`, create and edit one job.

## Task 4: Native Moderator Flow

**Files:**

- Create: `apps/native/app/(moderator)/index.tsx`
- Create: `apps/native/app/(moderator)/reports.tsx`
- Create: `apps/native/app/(moderator)/users.tsx`

- [ ] **Step 1: Add moderation queue**

Use `bambi.moderation.listJobPosts` and status mutation actions.

- [ ] **Step 2: Add reports screen**

Use `listReports` and report status actions.

- [ ] **Step 3: Add users screen**

Use `listUsers` and user status actions.

- [ ] **Step 4: Simulator verify**

As `admin@bambi.dev`, approve a job, dismiss a report, and warn a user.

## Task 5: Final Verification

- [ ] **Step 1: Run automated checks**

```bash
pnpm run check-types
pnpm run check
```

Expected: all commands pass.

- [ ] **Step 2: Update plan and commit**

Check completed boxes, add simulator verification notes, and commit with Korean Conventional Commits format.

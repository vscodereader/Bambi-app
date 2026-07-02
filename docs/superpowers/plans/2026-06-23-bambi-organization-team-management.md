# Bambi Organization And Team Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add employer organization and team administration beyond the current onboarding/profile foundation.

**Architecture:** Keep organization, team, membership, and permission checks server-side in `bambi` routers. Web management screens should be thin clients that expose only organizations and teams the current employer can manage.

**Tech Stack:** Better Auth, oRPC, Drizzle ORM, PostgreSQL, TanStack Query, Next.js App Router, React 19, Tailwind CSS, Vitest.

---

## Scope

Included:

- Organization profile edit.
- Team creation/edit.
- Team member invitation and role changes.
- Authorization tests for organization and team boundaries.

Excluded:

- Payment ownership.
- Enterprise SSO.
- Native organization management.

## File Structure

- Modify: `packages/db/src/schema/auth.ts`
- Create: `packages/db/src/migrations/0005_bambi_org_team_management.sql`
- Create: `packages/api/src/services/bambi-organization-authz.ts`
- Create: `packages/api/src/routers/bambi/organizations.ts`
- Create: `packages/api/src/routers/bambi/teams.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Test: `packages/api/src/routers/bambi/organizations.test.ts`
- Create: `apps/web/src/app/employer/settings/page.tsx`
- Create: `apps/web/src/app/employer/settings/teams/page.tsx`
- Create: `apps/web/src/components/bambi/org-profile-form.tsx`
- Create: `apps/web/src/components/bambi/team-form.tsx`
- Create: `apps/web/src/components/bambi/team-member-list.tsx`

## Task 1: Authorization Foundation

**Files:**

- Create: `packages/api/src/services/bambi-organization-authz.ts`
- Test: `packages/api/src/services/bambi-organization-authz.test.ts`

- [x] **Step 1: Define management roles**

Support `owner`, `manager`, and `staff`.

- [x] **Step 2: Define permission helpers**

Add helpers for:

- `canManageOrganization`
- `canManageTeam`
- `canManageJobPosts`
- `canInviteMembers`

- [x] **Step 3: Add tests**

Verify owner full access, manager team access, staff job-only access, and no cross-organization access.

Verification 2026-06-24:

- `pnpm --filter @bambi-app/api test -- src/services/bambi-organization-authz.test.ts` passed: 11 files / 53 tests.
- `pnpm run check-types` passed: 6 tasks successful.

## Task 2: Organization And Team API

**Files:**

- Modify: `packages/db/src/schema/auth.ts`
- Create: `packages/db/src/migrations/0005_bambi_org_team_management.sql`
- Create: `packages/api/src/routers/bambi/organizations.ts`
- Create: `packages/api/src/routers/bambi/teams.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Test: `packages/api/src/routers/bambi/organizations.test.ts`

- [x] **Step 1: Extend membership schema**

Ensure memberships include role, invite status, invited email, accepted user id, createdAt, and updatedAt.

- [x] **Step 2: Add organization endpoints**

Add `getMine`, `updateProfile`, and `listMembers`.

- [x] **Step 3: Add team endpoints**

Add `list`, `create`, `update`, `inviteMember`, and `setMemberRole`.

- [x] **Step 4: Add API tests**

Verify cross-org access denial and owner-only member role changes.

Verification 2026-06-24:

- `pnpm run db:migrate` applied `0005_bambi_org_team_management.sql`.
- `pnpm --filter @bambi-app/api test -- src/routers/bambi/organizations.test.ts` passed: 12 files / 57 tests.
- `pnpm --filter @bambi-app/api test` passed: 12 files / 57 tests.
- `pnpm run check-types` passed: 6 tasks successful.
- `pnpm run check` passed: 198 files checked with no fixes.

## Task 3: Employer Settings UI

**Files:**

- Create: `apps/web/src/app/employer/settings/page.tsx`
- Create: `apps/web/src/app/employer/settings/teams/page.tsx`
- Create: `apps/web/src/components/bambi/org-profile-form.tsx`
- Create: `apps/web/src/components/bambi/team-form.tsx`
- Create: `apps/web/src/components/bambi/team-member-list.tsx`
- Modify: `apps/web/src/app/employer/page.tsx`

- [x] **Step 1: Add settings landing**

Create `/employer/settings` showing organization profile, verification status, and editable fields.

- [x] **Step 2: Add team management**

Create `/employer/settings/teams` with team list, create form, edit action, and member list.

- [x] **Step 3: Add member invite**

Allow owner/manager to invite by email with role selection.

- [x] **Step 4: Link from employer dashboard**

Add a settings link from `/employer`.

- [x] **Step 5: Browser verify**

As `owner@bambi.dev`, update organization display name, create a team, and invite a staff email.

Verification 2026-06-24:

- Browser verified `/employer/settings` and `/employer/settings/teams` as `owner@bambi.dev`.
- Updated organization display name to `클럽 루나 테스트`; the settings page reflected the saved value.
- Created `잠실점 테스트` team with `서울 송파구`; the team appeared in the team list and invite team selector.
- Invited `new-staff@bambi.test` as staff; the member list showed a pending invitation.
- Initial empty team/invite validation messages no longer show before submit.
- Browser console reported 0 errors and 0 warnings after verification.
- Verification-only DB rows for `잠실점 테스트` and `new-staff@bambi.test` were removed after seed refresh.

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

Verification 2026-06-24:

- `pnpm --filter @bambi-app/api test` passed: 12 files / 57 tests.
- `pnpm run check-types` passed: 6 tasks successful.
- `pnpm run check` passed: 203 files checked with no fixes.
- `pnpm --filter web build` passed and included `/employer/settings` and `/employer/settings/teams`.

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

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0006_bambi_org_team_management.sql`
- Create: `packages/api/src/services/bambi-organization-authz.ts`
- Create: `packages/api/src/routers/bambi/organizations.ts`
- Create: `packages/api/src/routers/bambi/teams.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Create: `apps/web/src/app/employer/settings/page.tsx`
- Create: `apps/web/src/app/employer/settings/teams/page.tsx`
- Create: `apps/web/src/components/bambi/org-profile-form.tsx`
- Create: `apps/web/src/components/bambi/team-form.tsx`
- Create: `apps/web/src/components/bambi/team-member-list.tsx`

## Task 1: Authorization Foundation

**Files:**

- Create: `packages/api/src/services/bambi-organization-authz.ts`
- Test: `packages/api/src/services/bambi-organization-authz.test.ts`

- [ ] **Step 1: Define management roles**

Support `owner`, `manager`, and `staff`.

- [ ] **Step 2: Define permission helpers**

Add helpers for:

- `canManageOrganization`
- `canManageTeam`
- `canManageJobPosts`
- `canInviteMembers`

- [ ] **Step 3: Add tests**

Verify owner full access, manager team access, staff job-only access, and no cross-organization access.

## Task 2: Organization And Team API

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0006_bambi_org_team_management.sql`
- Create: `packages/api/src/routers/bambi/organizations.ts`
- Create: `packages/api/src/routers/bambi/teams.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`

- [ ] **Step 1: Extend membership schema**

Ensure memberships include role, invite status, invited email, accepted user id, createdAt, and updatedAt.

- [ ] **Step 2: Add organization endpoints**

Add `getMine`, `updateProfile`, and `listMembers`.

- [ ] **Step 3: Add team endpoints**

Add `list`, `create`, `update`, `inviteMember`, and `setMemberRole`.

- [ ] **Step 4: Add API tests**

Verify cross-org access denial and owner-only member role changes.

## Task 3: Employer Settings UI

**Files:**

- Create: `apps/web/src/app/employer/settings/page.tsx`
- Create: `apps/web/src/app/employer/settings/teams/page.tsx`
- Create: `apps/web/src/components/bambi/org-profile-form.tsx`
- Create: `apps/web/src/components/bambi/team-form.tsx`
- Create: `apps/web/src/components/bambi/team-member-list.tsx`
- Modify: `apps/web/src/app/employer/page.tsx`

- [ ] **Step 1: Add settings landing**

Create `/employer/settings` showing organization profile, verification status, and editable fields.

- [ ] **Step 2: Add team management**

Create `/employer/settings/teams` with team list, create form, edit action, and member list.

- [ ] **Step 3: Add member invite**

Allow owner/manager to invite by email with role selection.

- [ ] **Step 4: Link from employer dashboard**

Add a settings link from `/employer`.

- [ ] **Step 5: Browser verify**

As `owner@bambi.dev`, update organization display name, create a team, and invite a staff email.

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

# Bambi Onboarding And Dev Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable onboarding API and deterministic development seed data with login-capable Better Auth accounts.

**Architecture:** Keep Better Auth as the source of login credentials and organization membership tables. Add Bambi-specific onboarding procedures under the existing `bambi` router, and place the dev seed in the server app so it can use both `@bambi-app/auth` and `@bambi-app/db` without creating package cycles.

**Tech Stack:** TypeScript, oRPC, Drizzle ORM, PostgreSQL, Better Auth email/password and organization teams, Vitest, Ultracite.

---

## File Structure

- Create `packages/api/src/services/bambi-onboarding.ts`: pure authorization and state-transition helpers for onboarding.
- Create `packages/api/src/services/bambi-onboarding.test.ts`: TDD coverage for profile role conflicts and employer profile management roles.
- Create `packages/api/src/routers/bambi/onboarding.ts`: protected oRPC procedures for current profile, job seeker profile creation, employer profile creation, employer organization profile upsert, team profile upsert, and verification request.
- Modify `packages/api/src/routers/bambi/index.ts`: register the onboarding router.
- Create `apps/server/src/seeds/bambi-dev.ts`: idempotent seed that signs up dev users through Better Auth and upserts Bambi domain rows.
- Modify `apps/server/package.json`: add `seed:bambi` script.
- Modify root `package.json`: add `db:seed:bambi` convenience script.

## Tasks

### Task 1: Onboarding Rules

**Files:**
- Create: `packages/api/src/services/bambi-onboarding.ts`
- Test: `packages/api/src/services/bambi-onboarding.test.ts`

- [x] Write failing tests for role conflict handling and employer profile manager roles.
- [x] Run `pnpm --filter @bambi-app/api test -- bambi-onboarding`.
- [x] Implement helpers that reject role replacement and allow only `owner`/`admin` to manage employer organization/team profiles.
- [x] Re-run the targeted API tests.

### Task 2: Onboarding Router

**Files:**
- Create: `packages/api/src/routers/bambi/onboarding.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`

- [x] Add protected procedures for `getMine`, `createJobSeekerProfile`, `createEmployerProfile`, `upsertEmployerOrganizationProfile`, `upsertEmployerTeamProfile`, and `requestEmployerVerification`.
- [x] Use existing Better Auth `member`/`team` tables for organization and team authorization.
- [x] Keep profile creation conservative: existing profile roles cannot be changed through onboarding.
- [x] Run `pnpm --filter @bambi-app/api test`.

### Task 3: Login-Capable Dev Seed

**Files:**
- Create: `apps/server/src/seeds/bambi-dev.ts`
- Modify: `apps/server/package.json`
- Modify: `package.json`

- [x] Add an idempotent seed script that creates or reuses Better Auth email/password users through `auth.api.signUpEmail`.
- [x] Upsert deterministic organization, member, team, team member, Bambi profile, employer profiles, job posts, chat room, messages, interview, contact reveal consent, and report sample rows.
- [x] Print dev account credentials and seeded entity identifiers.
- [x] Add `seed:bambi` and root `db:seed:bambi` scripts.

### Task 4: Verification And Commit

**Files:**
- All changed files.

- [x] Run `pnpm --filter @bambi-app/api test`.
- [x] Run `pnpm run check-types`.
- [x] Run `pnpm run check`.
- [x] Attempt `pnpm run db:seed:bambi`; blocked by missing local `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `CORS_ORIGIN`.
- [ ] Commit with a Korean Conventional Commit message.

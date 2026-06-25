# Bambi Post-MVP Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the post-MVP candidates from `docs/result.md` and the Foxalba benchmark into independently executable implementation plans.

**Architecture:** Keep each post-MVP item as a separate vertical slice with its own API, data, UI, and verification scope. Execute plans in dependency order so chat infrastructure lands before rich chat features, and organization foundations land before promotion and analytics work.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, @bambi-app/ui, Better Auth, oRPC, TanStack Query, Drizzle ORM, Expo/React Native, Vitest, Ultracite.

---

## Plan Index

| Order | Plan | Scope | Primary Risk |
| --- | --- | --- | --- |
| 1 | [Realtime Chat](./2026-06-23-bambi-realtime-chat.md) | Socket.IO transport, read receipts, typing indicators | Completed 2026-06-24 |
| 2 | [Chat Media Messages](./2026-06-23-bambi-chat-media-messages.md) | Image/file upload, moderation, rendering | Completed 2026-06-24 |
| 3 | [Organization And Team Management](./2026-06-23-bambi-organization-team-management.md) | Multi-branch organization/team admin | Completed 2026-06-24 |
| 4 | [Dense Marketplace And Promotion Ops](./2026-06-24-bambi-dense-marketplace-promotion-ops.md) | Foxalba-informed dense job list, promotion sections, boost management | Completed 2026-06-24 |
| 5 | [Moderator Bulk Actions](./2026-06-23-bambi-moderator-bulk-actions.md) | API-backed bulk moderation actions | Completed 2026-06-25 |
| 6 | [Reviews And Ratings](./2026-06-23-bambi-reviews-ratings.md) | Post-interview reviews and public rating summaries | Abuse and privacy |
| 7 | [Employer Analytics And Paid Placement](./2026-06-23-bambi-employer-analytics-paid-placement.md) | Employer metrics, billing-ready events, analytics over promoted listings | Trust and reporting accuracy |
| 8 | [Native App](./2026-06-23-bambi-native-app.md) | Mobile native seeker/employer/admin shell and MVP flows | Web/native parity |

## Benchmark Inputs

- [Foxalba 벤치마킹 정리](../../foxalba-benchmark-2026-06-24.md) informs the Dense Marketplace And Promotion Ops plan.
- Adopt from Foxalba: dense listing density, visible premium/recommended/organic sections, boost-style ad refresh, employer ad-management status, and edit/boost limits.
- Do not adopt from Foxalba: unrestricted HTML detail editing, opaque ranking manipulation, or exposing large keyword-ban dictionaries to employers.

## Recommended Execution Order

1. Realtime Chat
2. Chat Media Messages
3. Organization And Team Management
4. Dense Marketplace And Promotion Ops
5. Moderator Bulk Actions
6. Reviews And Ratings
7. Employer Analytics And Paid Placement
8. Native App

The native app can begin after the Web contracts are stable, but it should not define new domain rules independently from Web/API.

Dense Marketplace And Promotion Ops should run before Employer Analytics And Paid Placement if promotion tables or boost events are needed as analytics dimensions. If Analytics runs first, its promotion foundation task should be reconciled with the dense marketplace promotion schema before implementation.

## Shared Completion Criteria

Every linked plan is complete only when:

- The relevant router/service/database changes have tests.
- Web or native UI has a browser/simulator smoke check.
- `pnpm run check-types` passes.
- `pnpm run check` passes.
- Any API package change has `pnpm --filter @bambi-app/api test` passing.
- Any Web route change has `pnpm --filter web build` passing.
- The plan file itself is updated with completed checkboxes and verification notes.

## Roadmap Tracking

- [x] **Step 1: Execute Realtime Chat plan**

Open [Realtime Chat](./2026-06-23-bambi-realtime-chat.md), complete every task, then return here and check this step.

- [x] **Step 2: Execute Chat Media Messages plan**

Open [Chat Media Messages](./2026-06-23-bambi-chat-media-messages.md), complete every task, then return here and check this step.

- [x] **Step 3: Execute Organization And Team Management plan**

Open [Organization And Team Management](./2026-06-23-bambi-organization-team-management.md), complete every task, then return here and check this step.

- [x] **Step 4: Execute Dense Marketplace And Promotion Ops plan**

Open [Dense Marketplace And Promotion Ops](./2026-06-24-bambi-dense-marketplace-promotion-ops.md), complete every task, then return here and check this step.

- [x] **Step 5: Execute Moderator Bulk Actions plan**

Open [Moderator Bulk Actions](./2026-06-23-bambi-moderator-bulk-actions.md), complete every task, then return here and check this step.

- [x] **Step 6: Execute Reviews And Ratings plan**

Open [Reviews And Ratings](./2026-06-23-bambi-reviews-ratings.md), complete every task, then return here and check this step.

- [x] **Step 7: Execute Employer Analytics And Paid Placement plan**

Open [Employer Analytics And Paid Placement](./2026-06-23-bambi-employer-analytics-paid-placement.md), complete every task, then return here and check this step.

- [ ] **Step 8: Execute Native App plan**

Open [Native App](./2026-06-23-bambi-native-app.md), complete every task, then return here and check this step.

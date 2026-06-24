# Bambi Post-MVP Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the seven post-MVP candidates from `docs/result.md` into independently executable implementation plans.

**Architecture:** Keep each post-MVP item as a separate vertical slice with its own API, data, UI, and verification scope. Execute plans in dependency order so chat infrastructure lands before rich chat features, and organization foundations land before paid/analytics work.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, @bambi-app/ui, Better Auth, oRPC, TanStack Query, Drizzle ORM, Expo/React Native, Vitest, Ultracite.

---

## Plan Index

| Order | Plan | Scope | Primary Risk |
| --- | --- | --- | --- |
| 1 | [Realtime Chat](./2026-06-23-bambi-realtime-chat.md) | Socket.IO transport, read receipts, typing indicators | Completed 2026-06-24 |
| 2 | [Chat Media Messages](./2026-06-23-bambi-chat-media-messages.md) | Image/file upload, moderation, rendering | Unsafe media handling |
| 3 | [Reviews And Ratings](./2026-06-23-bambi-reviews-ratings.md) | Post-interview reviews and public rating summaries | Abuse and privacy |
| 4 | [Employer Analytics And Paid Placement](./2026-06-23-bambi-employer-analytics-paid-placement.md) | Employer metrics, promoted listings, billing-ready events | Trust and ranking fairness |
| 5 | [Organization And Team Management](./2026-06-23-bambi-organization-team-management.md) | Multi-branch organization/team admin | Authorization boundaries |
| 6 | [Moderator Bulk Actions](./2026-06-23-bambi-moderator-bulk-actions.md) | API-backed bulk moderation actions | Accidental mass changes |
| 7 | [Native App](./2026-06-23-bambi-native-app.md) | Mobile native seeker/employer/admin shell and MVP flows | Web/native parity |

## Recommended Execution Order

1. Realtime Chat
2. Chat Media Messages
3. Organization And Team Management
4. Moderator Bulk Actions
5. Reviews And Ratings
6. Employer Analytics And Paid Placement
7. Native App

The native app can begin after the Web contracts are stable, but it should not define new domain rules independently from Web/API.

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

- [ ] **Step 2: Execute Chat Media Messages plan**

Open [Chat Media Messages](./2026-06-23-bambi-chat-media-messages.md), complete every task, then return here and check this step.

- [ ] **Step 3: Execute Reviews And Ratings plan**

Open [Reviews And Ratings](./2026-06-23-bambi-reviews-ratings.md), complete every task, then return here and check this step.

- [ ] **Step 4: Execute Employer Analytics And Paid Placement plan**

Open [Employer Analytics And Paid Placement](./2026-06-23-bambi-employer-analytics-paid-placement.md), complete every task, then return here and check this step.

- [ ] **Step 5: Execute Organization And Team Management plan**

Open [Organization And Team Management](./2026-06-23-bambi-organization-team-management.md), complete every task, then return here and check this step.

- [ ] **Step 6: Execute Moderator Bulk Actions plan**

Open [Moderator Bulk Actions](./2026-06-23-bambi-moderator-bulk-actions.md), complete every task, then return here and check this step.

- [ ] **Step 7: Execute Native App plan**

Open [Native App](./2026-06-23-bambi-native-app.md), complete every task, then return here and check this step.

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
| 6 | [Reviews And Ratings](./2026-06-23-bambi-reviews-ratings.md) | Post-interview reviews and public rating summaries | Completed 2026-06-25 |
| 7 | [Employer Analytics And Paid Placement](./2026-06-23-bambi-employer-analytics-paid-placement.md) | Employer metrics, billing-ready events, analytics over promoted listings | Completed 2026-06-25 |
| 8 | [Job Post Media And Block Editor](./2026-06-26-bambi-job-post-media-block-editor.md) | Employer cover/detail images and safe structured job detail blocks | Completed 2026-06-29 |
| 9 | [Visual Job Exposure UI/UX](./2026-06-29-bambi-visual-job-exposure-uiux.md) | Queenalba-informed visual job exposure sections for Web marketplace | Active Web UI/UX improvement |
| 10 | [Native App](./2026-06-23-bambi-native-app.md) | Mobile native seeker/employer/admin shell and MVP flows, deferred until explicit resume | Web/native parity after explicit resume |

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
8. Job Post Media And Block Editor
9. Visual Job Exposure UI/UX
10. Native App (deferred until explicit resume)

The Web final QA gate is tracked in [Web Final QA Acceptance](./2026-06-26-bambi-web-final-qa-acceptance.md). The Web baseline is documented as complete as of 2026-06-29 after Web MVP, Post-MVP Web work, Foxalba-informed Web adoption, and final QA verification.

The native app is paused as of 2026-06-25 and remains deferred as of 2026-06-29. Do not select Native App as the next roadmap task unless the user explicitly asks to resume it. The next product direction is new Web feature requests and design/UI/UX improvement work; create or update a focused plan under `docs/superpowers/plans/` before implementation.

The first post-baseline Web UI/UX improvement is [Visual Job Exposure UI/UX](./2026-06-29-bambi-visual-job-exposure-uiux.md), based on the [Queenalba benchmark](../../queenalba-benchmark-2026-06-29.md). This plan should run before any Native App resume because it changes the Web source-of-truth marketplace presentation.

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

- [x] **Step 8: Execute Job Post Media And Block Editor plan**

Open [Job Post Media And Block Editor](./2026-06-26-bambi-job-post-media-block-editor.md), complete every task, then return here and check this step.

- [ ] **Step 9: Track deferred Native App plan**

Open [Native App](./2026-06-23-bambi-native-app.md) only when the user explicitly resumes native work. Keep this step unchecked while Web UI/UX improvement remains active.

Progress: Native app shell, seeker/employer/moderator screens, native oRPC client, and automated checks are implemented. Full iOS/Android simulator smoke for seeker contact reveal, owner create/edit, and admin moderation actions remains pending.

Historical status 2026-06-25: Paused while Web final completion was pending. This step stayed unchecked while the Web experience was being finalized and accepted.

Status 2026-06-29: Web final baseline is documented, but Native App is still not the next task. Keep this step unchecked. Continue with incoming Web feature plans and UI/UX improvement plans unless the user explicitly resumes native work.

- [ ] **Step 10: Execute Visual Job Exposure UI/UX plan**

Open [Visual Job Exposure UI/UX](./2026-06-29-bambi-visual-job-exposure-uiux.md), complete every task, then return here and check this step.

Status 2026-06-29: Added as the active Web UI/UX improvement after the Queenalba benchmark. This is the recommended next implementation task.

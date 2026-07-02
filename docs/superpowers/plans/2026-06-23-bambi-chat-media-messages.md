# Bambi Chat Media Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe image and file messages to chat without weakening contact protection or moderation controls.

**Architecture:** Store media metadata in the database and binary objects in a storage provider behind server-issued upload URLs. Treat every media item as reviewable content and render only files that pass validation.

**Tech Stack:** Next.js App Router, Fastify/oRPC, Drizzle ORM, PostgreSQL, object storage adapter, TanStack Query, React 19, Vitest, Ultracite.

---

## Scope

Included:

- Image/file message metadata.
- Upload URL creation with file type and size validation.
- Chat media rendering in Web chat room.
- Moderator visibility into media messages for reports.

Excluded:

- Video transcoding.
- End-to-end encryption.
- Native media upload. Use [Native App](./2026-06-23-bambi-native-app.md).

## File Structure

- Modify: `packages/db/src/schema/bambi.ts`
  - Add chat attachment metadata table or attachment columns.
- Create: `packages/db/src/migrations/0004_bambi_chat_media.sql`
  - Add attachment schema.
- Create: `packages/api/src/services/bambi-media-policy.ts`
  - Define allowed MIME types, max sizes, and display category mapping.
- Create: `packages/api/src/services/bambi-storage.ts`
  - Abstract upload URL and object URL creation.
- Modify: `packages/api/src/routers/bambi/chats.ts`
  - Add upload intent and media message creation endpoints.
- Modify: `packages/api/src/routers/bambi/moderation.ts`
  - Include media metadata in report detail context.
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
  - Add attachment picker, upload state, and message rendering.
- Test: `packages/api/src/services/bambi-media-policy.test.ts`
- Test: `packages/api/src/routers/bambi/chats.test.ts`
- Test: `packages/api/src/routers/bambi/moderation.test.ts`

## Task 1: Media Policy And Schema

**Files:**

- Create: `packages/api/src/services/bambi-media-policy.ts`
- Test: `packages/api/src/services/bambi-media-policy.test.ts`
- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0004_bambi_chat_media.sql`

- [x] **Step 1: Define allowed media policy**

Allow:

- JPEG, PNG, WebP images up to 8 MB.
- PDF files up to 10 MB.

Reject executable files, archives, unknown MIME types, and files with empty names.

- [x] **Step 2: Add policy tests**

Cover allowed image, allowed PDF, oversized image, executable MIME type, and empty filename.

- [x] **Step 3: Add attachment metadata schema**

Store `id`, `chatRoomId`, `messageId`, `storageKey`, `fileName`, `mimeType`, `byteSize`, `category`, `createdByUserId`, `createdAt`.

- [x] **Step 4: Verify**

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
```

Expected: all commands pass.

Verification 2026-06-24:

- `pnpm --filter @bambi-app/api test` passed: 8 files / 44 tests.
- `pnpm run check-types` passed: 6 tasks successful.

## Task 2: Upload And Media Message API

**Files:**

- Create: `packages/api/src/services/bambi-storage.ts`
- Modify: `packages/api/src/routers/bambi/chats.ts`
- Test: `packages/api/src/routers/bambi/chats.test.ts`

- [x] **Step 1: Add storage adapter**

Create an adapter with `createUploadIntent` and `getPublicOrSignedUrl` so local development can use deterministic local object keys.

- [x] **Step 2: Add upload intent endpoint**

Add `bambi.chats.createAttachmentUpload` that validates room access, media policy, and returns upload metadata.

- [x] **Step 3: Add media message endpoint**

Add `bambi.chats.sendMediaMessage` that creates a chat message and attachment metadata in one transaction.

- [x] **Step 4: Add API tests**

Verify participant access, MIME rejection, and metadata creation.

- [x] **Step 5: Add moderation report context**

Include safe attachment metadata in reported chat message context without exposing storage internals.

- [x] **Step 6: Verify**

```bash
pnpm --filter @bambi-app/api test
pnpm run check
```

Expected: all commands pass.

Verification 2026-06-24:

- `pnpm --filter @bambi-app/api test` passed: 9 files / 47 tests.
- `pnpm run check` passed: 189 files checked.
- `pnpm --filter @bambi-app/api test -- src/routers/bambi/moderation.test.ts` passed: 10 files / 48 tests after adding report media context.

## Task 3: Web Media UI

**Files:**

- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Create: `apps/web/src/components/bambi/chat-attachment-preview.tsx`

- [x] **Step 1: Add attachment picker**

Add an icon button near the message composer that accepts image and PDF files only.

- [x] **Step 2: Add upload progress state**

Show selected filename, size, uploading state, and validation errors near the composer.

- [x] **Step 3: Render media messages**

Render image thumbnails and PDF file rows inside the existing chat message list.

- [x] **Step 4: Keep contact protection intact**

Do not expose phone, Kakao, or external contact metadata in attachment UI.

- [x] **Step 5: Browser verify**

Seed data, open a known chat room, upload one allowed image and one rejected file, and confirm the allowed media appears while the rejected file shows an error.

Verification 2026-06-24:

- `pnpm run db:seed:bambi` passed and loaded dev chat room `33333333-3333-4333-8333-333333333301`.
- Browser verified `/seeker/chats/33333333-3333-4333-8333-333333333301` as `seeker@bambi.dev`.
- Rejected `package.json` synthetic file showed client validation error for unsupported type.
- Allowed `browser-allowed.png` synthetic image created a media message; thumbnail loaded at `960x540`.
- Next DevTools `get_errors` returned no config/session errors; browser console had 0 errors and 0 warnings after reload.

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

- `pnpm --filter @bambi-app/api test` passed: 10 files / 48 tests.
- `pnpm run check-types` passed: 6 tasks successful.
- `pnpm run check` passed: 192 files checked with no fixes.
- `pnpm --filter web build` passed and included `/bambi/local-chat-attachments`.

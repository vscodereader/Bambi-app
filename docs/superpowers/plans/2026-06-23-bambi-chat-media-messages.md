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
- Create: `packages/db/src/migrations/0003_bambi_chat_media.sql`
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

## Task 1: Media Policy And Schema

**Files:**

- Create: `packages/api/src/services/bambi-media-policy.ts`
- Test: `packages/api/src/services/bambi-media-policy.test.ts`
- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0003_bambi_chat_media.sql`

- [ ] **Step 1: Define allowed media policy**

Allow:

- JPEG, PNG, WebP images up to 8 MB.
- PDF files up to 10 MB.

Reject executable files, archives, unknown MIME types, and files with empty names.

- [ ] **Step 2: Add policy tests**

Cover allowed image, allowed PDF, oversized image, executable MIME type, and empty filename.

- [ ] **Step 3: Add attachment metadata schema**

Store `id`, `chatRoomId`, `messageId`, `storageKey`, `fileName`, `mimeType`, `byteSize`, `category`, `createdByUserId`, `createdAt`.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
```

Expected: all commands pass.

## Task 2: Upload And Media Message API

**Files:**

- Create: `packages/api/src/services/bambi-storage.ts`
- Modify: `packages/api/src/routers/bambi/chats.ts`
- Test: `packages/api/src/routers/bambi/chats.test.ts`

- [ ] **Step 1: Add storage adapter**

Create an adapter with `createUploadIntent` and `getPublicOrSignedUrl` so local development can use deterministic local object keys.

- [ ] **Step 2: Add upload intent endpoint**

Add `bambi.chats.createAttachmentUpload` that validates room access, media policy, and returns upload metadata.

- [ ] **Step 3: Add media message endpoint**

Add `bambi.chats.sendMediaMessage` that creates a chat message and attachment metadata in one transaction.

- [ ] **Step 4: Add API tests**

Verify participant access, MIME rejection, and metadata creation.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @bambi-app/api test
pnpm run check
```

Expected: all commands pass.

## Task 3: Web Media UI

**Files:**

- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Create: `apps/web/src/components/bambi/chat-attachment-preview.tsx`

- [ ] **Step 1: Add attachment picker**

Add an icon button near the message composer that accepts image and PDF files only.

- [ ] **Step 2: Add upload progress state**

Show selected filename, size, uploading state, and validation errors near the composer.

- [ ] **Step 3: Render media messages**

Render image thumbnails and PDF file rows inside the existing chat message list.

- [ ] **Step 4: Keep contact protection intact**

Do not expose phone, Kakao, or external contact metadata in attachment UI.

- [ ] **Step 5: Browser verify**

Seed data, open a known chat room, upload one allowed image and one rejected file, and confirm the allowed media appears while the rejected file shows an error.

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

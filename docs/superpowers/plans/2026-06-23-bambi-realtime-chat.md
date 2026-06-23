# Bambi Realtime Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add realtime chat delivery, read receipts, and typing indicators to the existing seeker/employer chat rooms.

**Architecture:** Keep persisted chat state in the existing database and `bambi.chats` router. Add a realtime gateway for ephemeral events, while messages and read receipts remain durable API-backed records so refresh and reconnect are safe.

**Tech Stack:** Hono/oRPC server, Better Auth session validation, Drizzle ORM, PostgreSQL, WebSocket, TanStack Query, Next.js App Router, React 19, Vitest.

---

## Scope

Included:

- Realtime message arrival in `/seeker/chats/[id]`.
- Read receipt state for the current room.
- Typing indicator events scoped to chat room participants.
- Reconnect behavior that re-fetches durable room state.

Excluded:

- Image/file messages. Use [Chat Media Messages](./2026-06-23-bambi-chat-media-messages.md).
- Push notifications.
- Native app realtime support. Use [Native App](./2026-06-23-bambi-native-app.md).

## File Structure

- Modify: `packages/db/src/schema/bambi.ts`
  - Add durable read receipt fields or a `chat_message_read_receipt` table.
- Create: `packages/db/src/migrations/0002_bambi_chat_realtime.sql`
  - Add migration for read receipts.
- Modify: `packages/api/src/routers/bambi/chats.ts`
  - Add read receipt query/mutation and message cursor support.
- Create: `packages/api/src/services/bambi-chat-realtime.ts`
  - Define event payload types and room authorization helpers.
- Modify: `apps/server/src/index.ts`
  - Mount WebSocket endpoint for chat rooms.
- Create: `apps/web/src/lib/bambi-chat-realtime.ts`
  - WebSocket client wrapper with reconnect and event parsing.
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
  - Subscribe to room events, show typing indicator, update messages, send read receipts.
- Test: `packages/api/src/routers/bambi/chats.test.ts`
  - Cover read receipt authorization and room state.

## Task 1: Durable Read Receipts

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0002_bambi_chat_realtime.sql`
- Modify: `packages/api/src/routers/bambi/chats.ts`
- Test: `packages/api/src/routers/bambi/chats.test.ts`

- [ ] **Step 1: Add read receipt schema**

Create `chatMessageReadReceipt` with `messageId`, `userId`, `readAt`, and a unique index on `(messageId, userId)`.

- [ ] **Step 2: Add migration**

Run the project migration generator if available; otherwise create SQL that adds the table, foreign keys, and unique index.

- [ ] **Step 3: Add API methods**

Add:

- `bambi.chats.markRead`
- `bambi.chats.getReadState`

Both methods must verify that the session user is a participant in the chat room.

- [ ] **Step 4: Add API tests**

Test that a room participant can mark messages read, and a non-participant receives an authorization error.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
```

Expected: all commands pass.

## Task 2: Realtime Gateway

**Files:**

- Create: `packages/api/src/services/bambi-chat-realtime.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Define event payloads**

Create typed payloads for:

- `message.created`
- `message.read`
- `typing.started`
- `typing.stopped`

- [ ] **Step 2: Authorize socket join**

Validate Better Auth session and verify chat room participant access before joining a room channel.

- [ ] **Step 3: Broadcast durable message events**

After `sendMessage` succeeds, broadcast `message.created` to the room.

- [ ] **Step 4: Broadcast ephemeral typing events**

Accept typing events only from room participants and never persist them.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter server check-types
pnpm run check
```

Expected: all commands pass.

## Task 3: Web Chat Subscription

**Files:**

- Create: `apps/web/src/lib/bambi-chat-realtime.ts`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`

- [ ] **Step 1: Add WebSocket client wrapper**

Create a small client that connects to the room endpoint, parses known event names, reconnects with backoff, and exposes `sendTyping`.

- [ ] **Step 2: Subscribe from chat room screen**

When room data is loaded, connect to the realtime endpoint for that room and disconnect on unmount.

- [ ] **Step 3: Handle incoming messages**

On `message.created`, invalidate `orpc.bambi.chats.getById` and `listMine`, then keep scroll anchored near the newest message.

- [ ] **Step 4: Show typing state**

Show a compact typing indicator in the message column only when the other participant is currently typing.

- [ ] **Step 5: Mark visible messages read**

After the room loads or receives a new message, call `markRead` for unread messages from the other participant.

- [ ] **Step 6: Verify in browser**

Run API and Web dev servers, open two browser sessions as `staff@bambi.dev` and `seeker@bambi.dev`, send a message from one session, and verify the other receives it without manual refresh.

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

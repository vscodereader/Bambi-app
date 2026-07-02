# Bambi Realtime Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Socket.IO-based realtime delivery, read receipts, typing indicators, and unread recovery to the existing seeker/employer chat rooms.

**Architecture:** Keep the existing Fastify/oRPC API and database as the source of truth. Socket.IO is only the realtime transport for room membership, reconnect/backoff, typing events, read broadcasts, and lightweight cache invalidation signals; message persistence and authorization remain in `bambi.chats` oRPC mutations and DB-backed services.

**Tech Stack:** Fastify/oRPC + Socket.IO, Better Auth session validation, Drizzle ORM, PostgreSQL, TanStack Query, Next.js App Router, React 19, Vitest, Ultracite.

---

## Why Socket.IO

밤비는 PC Web도 지원하지만 실제 주 사용자는 모바일 Web 비중이 높을 것으로 본다. 저수준 직접 소켓 구현 대신 Socket.IO를 선택하는 이유는 다음과 같다.

- 모바일 Web은 LTE/Wi-Fi 전환, 잠금화면, 백그라운드 복귀 등으로 연결이 자주 흔들린다.
- Socket.IO는 automatic reconnect, backoff, packet buffering, acknowledgement, timeout 패턴을 제공해 채팅 UX에 유리하다.
- Socket.IO room join/leave와 room broadcast 모델은 채팅방 단위 이벤트에 잘 맞는다.
- 추후 멀티 서버 전환 시 `@socket.io/redis-adapter`로 Redis adapter를 붙일 수 있어 확장 경로가 분명하다.

## Core Principles

- Socket.IO는 API를 대체하지 않는다.
- DB 저장, 권한, 도메인 규칙은 oRPC와 DB가 담당한다.
- 메시지 저장은 기존 `bambi.chats.sendMessage` oRPC mutation을 유지한다.
- 메시지 저장 성공 후 서버가 Socket.IO room에 `chat:message:created`를 emit한다.
- realtime payload에는 본문, 연락처, 면접 장소, 민감 개인정보를 싣지 않는다.
- read receipt는 oRPC로 저장하고 Socket.IO로 `chat:message:read`를 broadcast한다.
- typing indicator는 Socket.IO ephemeral event로 처리하고 DB에 저장하지 않는다.
- active socket 여부는 UX 최적화 신호일 뿐이다.
- unread count와 notification 상태의 source of truth는 DB다.
- Web Push/Native Push는 이번 범위가 아니며 별도 notification plan으로 분리한다.

## Scope

Included:

- Socket.IO server mounted on the existing Fastify server.
- Socket.IO client wrapper for Web.
- Realtime room join/leave for `/seeker/chats/[id]`.
- Message-created event after durable `sendMessage` succeeds.
- Read receipt persistence and realtime read broadcast.
- Typing start/stop ephemeral events.
- DB-backed unread count recovery for `/seeker/chats` and room nav badges.
- DB-backed notification record creation when the other participant is offline or outside the room.
- Reconnect handling that re-joins the room and re-fetches durable state.

Excluded:

- Image/file messages. Use [Chat Media Messages](./2026-06-23-bambi-chat-media-messages.md).
- Web Push and Native Push delivery. Create a later notification plan for external push.
- Native app realtime support. Use [Native App](./2026-06-23-bambi-native-app.md).
- Redis adapter implementation. Leave a clear adapter seam for `@socket.io/redis-adapter`.

## Event Contract

Client to server:

- `chat:join`
- `chat:leave`
- `chat:typing:start`
- `chat:typing:stop`
- `chat:message:ack-read`

Server to client:

- `chat:message:created`
- `chat:message:read`
- `chat:typing:started`
- `chat:typing:stopped`
- `chat:unread:updated`
- `chat:error`

Server internal event:

- `notification:created`

Payloads:

```ts
export interface ChatMessageCreatedEvent {
	createdAt: string;
	messageId: string;
	roomId: string;
	senderUserId: string;
}

export interface ChatMessageReadEvent {
	messageId: string;
	readAt: string;
	readerUserId: string;
	roomId: string;
}

export interface ChatTypingEvent {
	roomId: string;
	userId: string;
}

export interface ChatUnreadUpdatedEvent {
	roomId: string;
	unreadCount: number;
}

export interface ChatErrorEvent {
	code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST";
	message: string;
}
```

Never include message body, contact value, interview location, or sensitive personal data in realtime event payloads. Clients that receive `messageId` must invalidate `orpc.bambi.chats.getById` or fetch durable state from DB-backed APIs.

## Message Send Flow

1. Web client calls `bambi.chats.sendMessage` oRPC mutation.
2. Server verifies permissions and stores the message in DB.
3. Server checks the active Socket.IO participant registry for the chat room.
4. If the other participant has an active socket joined to the room:
   - Emit `chat:message:created` to the Socket.IO room.
   - Emit `chat:unread:updated` if the list badge count changes.
5. If the other participant is not connected to the room:
   - Keep unread state recoverable from DB.
   - Create a notification record in DB.
   - Do not send Web Push or Native Push in this plan.
6. When the other participant later opens `/seeker/chats` or `/seeker/chats/[id]`:
   - `bambi.chats.listMine` returns unread counts.
   - `bambi.chats.getById` returns missed durable messages.
   - Socket.IO joins the room.
   - The client calls read acknowledgement through oRPC or `chat:message:ack-read`.
   - Server persists read state and broadcasts `chat:message:read`.

## File Structure

- Modify: `package.json` or workspace package manifests
  - Add `socket.io` to `apps/server`.
  - Add `socket.io-client` to `apps/web`.
  - Leave `@socket.io/redis-adapter` as a documented future dependency, not installed unless implementing multi-server support.
- Modify: `packages/db/src/schema/bambi.ts`
  - Add `chatMessageReadReceipt` and `bambiNotification` tables.
- Create: `packages/db/src/migrations/0002_bambi_chat_realtime.sql`
  - Add read receipt and notification schema.
- Create: `packages/api/src/services/bambi-chat-realtime.ts`
  - Define Socket.IO event payload types, room name helpers, active socket participant registry, and emit helpers.
- Create: `packages/api/src/services/bambi-notifications.ts`
  - Create DB notification records without external push delivery.
- Modify: `packages/api/src/routers/bambi/chats.ts`
  - Add read receipt query/mutation.
  - Keep `sendMessage` as the only durable message creation path.
  - After successful message creation, call realtime emit/notification helpers.
- Modify: `apps/server/src/index.ts`
  - Attach Socket.IO `Server` to `fastify.server`.
  - Align CORS and cookie/session behavior with existing Fastify/oRPC API.
  - Add Fastify `preClose` hook to disconnect local sockets.
- Create: `apps/web/src/lib/bambi-chat-realtime.ts`
  - Socket.IO client wrapper with reconnect/backoff status and typed event handlers.
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
  - Join/leave room, show typing indicator, handle message/read/unread events, and send read acknowledgements.
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx`
  - Display unread counts and invalidate list state on `chat:unread:updated`.
- Test: `packages/api/src/services/bambi-chat-read-state.test.ts`
  - Cover read receipt values, unread counting, and recipient resolution.
- Test: `packages/api/src/services/bambi-chat-realtime.test.ts`
  - Cover room naming, active participant registry, and safe event payload shape.
- Test: `packages/api/src/services/bambi-notifications.test.ts`
  - Cover notification record creation without external push.

## Task 1: Dependencies And Server Attachment

**Files:**

- Modify: `apps/server/package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/server/src/index.ts`
- Create: `packages/api/src/services/bambi-chat-realtime.ts`

- [x] **Step 1: Add Socket.IO dependencies**

Install server and client packages:

```bash
pnpm --filter server add socket.io
pnpm --filter web add socket.io-client
```

Expected: `apps/server/package.json`, `apps/web/package.json`, and `pnpm-lock.yaml` update.

- [x] **Step 2: Attach Socket.IO to Fastify**

In `apps/server/src/index.ts`, create `new Server(fastify.server, { cors })` after Fastify is created and before `fastify.listen`. Use the same allowed origin and credentials policy as the existing API CORS config.

- [x] **Step 3: Add Fastify close hook**

Add a `preClose` hook that calls `io.local.disconnectSockets(true)` so local socket connections are closed when Fastify shuts down.

- [x] **Step 4: Export or register realtime service**

Wire the Socket.IO instance into `bambi-chat-realtime.ts` through an explicit `configureBambiChatRealtime(io)` function. Do not import `apps/server` from `packages/api`.

- [x] **Step 5: Verify**

Run:

```bash
pnpm run check-types
pnpm run check
```

Expected: both commands pass.

## Task 2: Durable Read And Notification Schema

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0002_bambi_chat_realtime.sql`
- Create: `packages/api/src/services/bambi-notifications.ts`
- Test: `packages/api/src/services/bambi-notifications.test.ts`

- [x] **Step 1: Add read receipt schema**

Create `chatMessageReadReceipt` with `messageId`, `chatRoomId`, `readerUserId`, `readAt`, `createdAt`, and a unique index on `(messageId, readerUserId)`.

- [x] **Step 2: Add notification schema**

Create `bambiNotification` with `id`, `recipientUserId`, `actorUserId`, `targetType`, `targetId`, `chatRoomId`, `readAt`, `createdAt`, and `metadata`. Keep message body and contact data out of `metadata`.

- [x] **Step 3: Add migration**

Create SQL for both tables, foreign keys, indexes, and unique read receipt constraint.

- [x] **Step 4: Add notification helper**

Implement a helper that creates a notification record for an offline chat recipient and returns the created notification id. It must not send external push.

- [x] **Step 5: Add tests**

Verify notification creation stores only ids and safe metadata, and does not require a Socket.IO connection.

## Task 3: Socket.IO Event Service

**Files:**

- Modify: `packages/api/src/services/bambi-chat-realtime.ts`
- Test: `packages/api/src/services/bambi-chat-realtime.test.ts`

- [x] **Step 1: Define event types**

Define the TypeScript payload interfaces from the Event Contract section and keep them free of message body and sensitive values.

- [x] **Step 2: Add room helper**

Add `getChatRoomSocketRoom(roomId: string): string` that returns `chat:${roomId}`.

- [x] **Step 3: Add active participant registry**

Track active sockets by `roomId` and `userId`. Store socket ids, not message content. Provide:

- `markParticipantActive`
- `markParticipantInactive`
- `isParticipantActiveInRoom`
- `getActiveParticipantIds`

- [x] **Step 4: Add emit helpers**

Provide helpers for `emitMessageCreated`, `emitMessageRead`, `emitTypingStarted`, `emitTypingStopped`, and `emitUnreadUpdated`.

- [x] **Step 5: Add tests**

Verify room naming, active participant tracking with multiple sockets per user, cleanup on disconnect, and event payloads containing only safe keys.

## Task 4: Chat Router Integration

**Files:**

- Modify: `packages/api/src/routers/bambi/chats.ts`
- Test: `packages/api/src/services/bambi-chat-read-state.test.ts`

- [x] **Step 1: Add read receipt inputs**

Add zod inputs for marking one or more messages read in a chat room.

- [x] **Step 2: Add `markRead` mutation**

Persist read receipt rows after verifying the session user is a chat participant and the messages belong to the room.

- [x] **Step 3: Add unread counts to `listMine`**

Return unread count per chat room based on messages from the other participant without a read receipt by the current user.

- [x] **Step 4: Emit after `sendMessage` success**

After DB insert succeeds, call `emitMessageCreated` with `roomId`, `messageId`, `senderUserId`, and `createdAt`.

- [x] **Step 5: Branch on active participant**

If the recipient is not active in the room, call `createBambiNotification`. If active, rely on realtime event and DB unread/read state.

- [x] **Step 6: Emit after read success**

After read receipts are persisted, emit `chat:message:read` and `chat:unread:updated`.

- [x] **Step 7: Add service/API tests**

Verify read-state helpers, unread count recovery, online recipient emit path, offline recipient notification path, and no message body in realtime payload.

## Task 5: Socket.IO Server Events

**Files:**

- Modify: `apps/server/src/index.ts`
- Modify: `packages/api/src/services/bambi-chat-realtime.ts`

- [x] **Step 1: Validate socket session**

On Socket.IO connection, read the existing auth cookie/session context and reject unauthenticated sockets with `chat:error`.

- [x] **Step 2: Implement `chat:join`**

For `chat:join`, verify the user is a participant in the chat room, then join `getChatRoomSocketRoom(roomId)` and mark the participant active.

- [x] **Step 3: Implement `chat:leave`**

For `chat:leave`, leave the room and mark the participant inactive for that socket.

- [x] **Step 4: Implement typing events**

For `chat:typing:started` and `chat:typing:stopped`, verify active room membership and broadcast typing state to the other room participants.

- [x] **Step 5: Implement `chat:message:ack-read`**

Use this event only as a convenience path to trigger the same server-side read persistence logic as oRPC `markRead`. Do not trust client-only state.

- [x] **Step 6: Add timeout/ack guidance**

Use Socket.IO acknowledgement with timeout for join and read ack flows where the client needs a clear success/failure signal.

## Task 6: Web Socket.IO Client

**Files:**

- Create: `apps/web/src/lib/bambi-chat-realtime.ts`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx`

- [x] **Step 1: Add client wrapper**

Create a Socket.IO client wrapper that connects to the API origin, uses credentials, exposes connection status, and configures reconnect/backoff.

- [x] **Step 2: Add typed handlers**

Expose typed handlers for `chat:message:created`, `chat:message:read`, `chat:typing:started`, `chat:typing:stopped`, `chat:unread:updated`, and `chat:error`.

- [x] **Step 3: Join room from chat detail**

When `getById` loads, emit `chat:join` with ack timeout. On reconnect, re-emit `chat:join` and invalidate `getById`.

- [x] **Step 4: Invalidate on message-created**

When `chat:message:created` arrives, invalidate `orpc.bambi.chats.getById` and `orpc.bambi.chats.listMine`. Do not append message body from the realtime payload.

- [x] **Step 5: Show typing indicator**

Emit typing start/stop from the composer and show a compact indicator only for the other participant.

- [x] **Step 6: Mark messages read**

When the room is visible and messages from the other participant are present, call `bambi.chats.markRead` or emit `chat:message:ack-read`, then update UI after server acknowledgement.

- [x] **Step 7: Update chat list unread count**

In `/seeker/chats`, show unread counts from `listMine` and invalidate the list when `chat:unread:updated` arrives.

## Task 7: Browser Verification

**Files:**

- Update this plan with verification notes.

- [x] **Step 1: Start local services**

Run:

```bash
pnpm run db:seed:bambi
pnpm run dev:server
pnpm run dev:web
```

- [x] **Step 2: Verify same-room realtime delivery**

Open two browser sessions as `staff@bambi.dev` and `seeker@bambi.dev`, join chat room `33333333-3333-4333-8333-333333333301`, send a message, and verify the other side updates without manual refresh.

- [x] **Step 3: Verify typing indicator**

Type in one session and verify the other session shows typing state, then stops after the sender stops or leaves the room.

- [x] **Step 4: Verify read state**

Read the message in the second session and verify read state or unread count changes after the server acknowledgement.

- [x] **Step 5: Verify offline recovery**

Close or leave the recipient room, send another message, reopen `/seeker/chats`, and verify unread count and missed messages recover from DB.

- [x] **Step 6: Verify reconnect recovery**

Simulate network disconnect/reconnect in the browser, verify the client rejoins the room, invalidates durable state, and continues receiving events.

## Task 8: Final Verification

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

## Verification Notes

- Automated checks passed on 2026-06-24:
  - `pnpm --filter @bambi-app/api test`
  - `pnpm run check-types`
  - `pnpm run check`
  - `pnpm --filter web build`
- Database migration was applied locally with `pnpm run db:migrate`, then seed data was refreshed with `pnpm run db:seed:bambi`.
- Realtime verification used two authenticated Socket.IO clients, one seeker and one staff, plus oRPC calls against the local Fastify server. Covered `chat:join`, typing event delivery, safe `chat:message:created` payload without message body, read acknowledgement, offline unread recovery, and reconnect read acknowledgement.
- Browser smoke check opened `http://localhost:23001/seeker/chats/33333333-3333-4333-8333-333333333301` as `seeker@bambi.dev` and confirmed the chat composer and `실시간 연결` status rendered. Browser console errors: 0.
- Verification-created `실시간 자동검증%` messages, room read receipts, and room notifications were removed after the run.

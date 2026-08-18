# 문의 채팅 인터콤 스타일 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문의 채팅을 여러 대화 스레드 + 인터콤 스타일 위젯(홈/메시지/대화 뷰)으로 개편하고, 운영자 콘솔에 상태 탭·종료/재개·소유자 축 차단을 붙인다.

**Architecture:** 1인 1방 부분 유니크를 풀고 방에 status(open/closed)를 더한다. 자동 종료(7일 무활동)는 cron 없이 조회·발신 시점의 파생 판정으로 처리한다. 위젯은 셸 + 뷰 3개(home/messages/conversation) 파일로 나누고 런처 배치 로직(레일 앵커 포털)은 그대로 보존한다.

**Tech Stack:** Drizzle(pg, 마이그레이션 0094), oRPC(publicProcedure/adminProcedure), TanStack Query 폴링, Next.js 16 App Router, shadcn(base-ui) 컴포넌트.

**Spec:** docs/superpowers/specs/2026-08-18-support-chat-intercom-redesign-design.md

## Global Constraints

- 새 npm 의존성 추가 금지.
- `db:push` 절대 금지. `pnpm db:generate`·`pnpm db:migrate`는 사용자가 이번 작업에 허용한 경우에만 실행하고, migrate 후 적용 검증 필수.
- `packages/api/test/routers/bambi` 스위트 실행 금지(dev DB가 지워진다). api 테스트는 cwd=packages/api에서 `test/services`만 실행.
- 빌드·dev 서버 기동·스크린샷 금지(사용자 IDE에서 실행 중, HMR 반영). 검증은 tsc+ultracite만.
- ultracite는 경로 인자 필수: `pnpm exec ultracite check <파일...>` (인자 없으면 0파일 검사).
- pnpm 필터: web/server는 scope 없음, db/api는 `@bambi-app/db`/`@bambi-app/api`.
- DB enum 원값 UI 노출 금지 — 라벨 맵 경유.
- 임의 px 금지(Tailwind 스케일 토큰·rem/dvh 계열 사용).
- 커밋: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿, 멀티라인은 `git commit -F <임시파일>`(Bash 툴은 Git Bash). 서브에이전트는 커밋·stash 금지 — 커밋은 컨트롤러가 순차 실행.
- 문구에서 "채팅방"이 아니라 "대화"라는 단어를 쓴다(인터콤 컨벤션).

---

### Task 1: DB 스키마 + 마이그레이션 0094

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (supportChatRoom 정의부, bambiSiteSettings 정의부)
- Create: `packages/db/src/migrations/0094_*.sql` (drizzle generate 산출물)

**Interfaces:**
- Produces: `supportChatRoomStatus` pgEnum(`"open" | "closed"`), `supportChatRoom.status`, `supportChatRoom.closedAt`, `bambiSiteSettings.supportChatNotice` — 이후 모든 태스크가 참조.

- [ ] **Step 1: 스키마 수정**

`packages/db/src/schema/bambi.ts`의 `supportChatSender` 근처에 enum 추가:

```ts
export const supportChatRoomStatus = pgEnum("support_chat_room_status", [
	"open",
	"closed",
]);
```

`supportChatRoom` 컬럼에 추가(isBlocked 아래):

```ts
		// 대화 상태. closed여도 운영자 발신은 재개(open 복귀)로 이어진다. 자동 종료
		// (7일 무활동)는 이 컬럼을 바꾸지 않는 파생 판정이다 — cron 없음.
		status: supportChatRoomStatus("status").default("open").notNull(),
		// 운영자 명시 종료 시각. 자동 종료는 기록하지 않는다.
		closedAt: timestamp("closed_at"),
```

테이블 옵션에서 부분 유니크 2개를 목록 인덱스로 교체(유니크 삭제가 핵심 — 1인 N방):

```ts
	(table) => [
		index("support_chat_room_user_id_idx").on(
			table.userId,
			table.lastMessageAt
		),
		index("support_chat_room_guest_id_idx").on(
			table.guestId,
			table.lastMessageAt
		),
		index("support_chat_room_last_message_at_idx").on(table.lastMessageAt),
		check(
			"support_chat_room_owner_one_of_ck",
			sql`(${table.userId} IS NULL) <> (${table.guestId} IS NULL)`
		),
	]
```

테이블 주석의 "1인 1방" 설명도 "1인 N대화(종료 후 새 대화)"로 갱신한다.

`bambiSiteSettings`에 컬럼 추가:

```ts
	// 문의 채팅 위젯 홈 탭의 공지 배너 문구. null/빈 값이면 배너를 그리지 않는다.
	supportChatNotice: text("support_chat_notice"),
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm db:generate` (리포 루트)
Expected: `packages/db/src/migrations/0094_*.sql` 생성 — DROP INDEX 2건, CREATE TYPE, ADD COLUMN 3건(status/closed_at/support_chat_notice), CREATE INDEX 2건 포함 확인. `_journal.json` 끝 개행은 훅이 처리.

- [ ] **Step 3: dev DB 적용 + 검증**

Run: `pnpm db:migrate` → 이어서 검증(스크래치패드에 pg 스크립트 작성):
`support_chat_room`의 status/closed_at 컬럼 존재, `support_chat_room_user_id_uidx` 부재(`select indexname from pg_indexes where tablename='support_chat_room'`), `bambi_site_settings.support_chat_notice` 존재 확인.
Expected: 전부 통과. 기존 방 행들은 status='open'으로 채워짐.

- [ ] **Step 4: Commit**

`db: 문의 채팅 다중 대화 스키마 — 방 status·유니크 해제 (0094)` + 블릿.

---

### Task 2: 서비스 헬퍼 (TDD)

**Files:**
- Modify: `packages/api/src/services/bambi-support-chat.ts`
- Test: `packages/api/test/services/bambi-support-chat.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces: `SUPPORT_CHAT_AUTO_CLOSE_DAYS = 7`, `SUPPORT_CHAT_AUTO_CLOSE_MS`, `isSupportChatRoomEffectivelyClosed(room: { lastMessageAt: Date; status: "closed" | "open" }, now: Date): boolean`, `SUPPORT_CHAT_CLOSED_ERROR` — Task 3·4가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

기존 테스트 파일에 추가:

```ts
describe("isSupportChatRoomEffectivelyClosed", () => {
	const now = new Date("2026-08-18T12:00:00Z");
	it("명시 종료(closed)면 최근 메시지가 있어도 종료다", () => {
		expect(
			isSupportChatRoomEffectivelyClosed(
				{ lastMessageAt: now, status: "closed" },
				now
			)
		).toBe(true);
	});
	it("open이라도 마지막 메시지가 7일을 넘기면 종료다", () => {
		const stale = new Date(now.getTime() - SUPPORT_CHAT_AUTO_CLOSE_MS - 1);
		expect(
			isSupportChatRoomEffectivelyClosed(
				{ lastMessageAt: stale, status: "open" },
				now
			)
		).toBe(true);
	});
	it("open이고 7일 이내면 진행 중이다(경계 포함)", () => {
		const edge = new Date(now.getTime() - SUPPORT_CHAT_AUTO_CLOSE_MS);
		expect(
			isSupportChatRoomEffectivelyClosed(
				{ lastMessageAt: edge, status: "open" },
				now
			)
		).toBe(false);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd packages/api && pnpm exec vitest run test/services/bambi-support-chat.test.ts`
Expected: FAIL — `isSupportChatRoomEffectivelyClosed` 미정의.

- [ ] **Step 3: 구현**

`bambi-support-chat.ts`에 추가:

```ts
// 자동 종료 창. open이어도 마지막 메시지 후 이 기간이 지나면 종료로 취급한다 —
// cron 없이 조회·발신 시점에 계산하는 파생 판정이라 행은 바뀌지 않는다.
export const SUPPORT_CHAT_AUTO_CLOSE_DAYS = 7;
export const SUPPORT_CHAT_AUTO_CLOSE_MS =
	SUPPORT_CHAT_AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000;
export const SUPPORT_CHAT_CLOSED_ERROR =
	"종료된 대화예요. 새 대화를 시작해 주세요.";

export function isSupportChatRoomEffectivelyClosed(
	room: { lastMessageAt: Date; status: "closed" | "open" },
	now: Date
): boolean {
	if (room.status === "closed") {
		return true;
	}
	return now.getTime() - room.lastMessageAt.getTime() > SUPPORT_CHAT_AUTO_CLOSE_MS;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd packages/api && pnpm exec vitest run test/services/bambi-support-chat.test.ts`
Expected: PASS (기존 5건 + 신규 3건).

- [ ] **Step 5: Commit** — `feat: 문의 대화 유효 종료 판정 헬퍼(7일 자동 종료)`

---

### Task 3: 문의자 라우터 개편

**Files:**
- Modify: `packages/api/src/routers/bambi/support-chat.ts`

**Interfaces:**
- Consumes: Task 1 컬럼, Task 2 헬퍼.
- Produces (위젯 Task 6이 호출):
  - `getMyRooms(): { rooms: { createdAt: Date; id: string; lastMessageAt: Date; lastMessagePreview: string; status: "closed" | "open"; unreadCount: number }[] }`
  - `getRoomMessages({ roomId }): { messages: {...기존 형태}[]; room: { id: string; isBlocked: boolean; status: "closed" | "open" } }`
  - `sendMessage({ body, roomId? }): { id: string; roomId: string }`
  - `markRead({ roomId }): { ok: boolean }`
  - `getWidgetHome(): { faqs: { id: string; question: string }[]; notice: null | string }`

- [ ] **Step 1: 소유자 차단 검사·유효 상태 유틸 추가**

파일 상단에 import 추가(`faqEntry`, `bambiSiteSettings`, 헬퍼·상수, drizzle `or`/`asc`) 후:

```ts
// 차단은 소유자 축 — 방 단위로 보면 새 대화 생성으로 우회한다.
const isOwnerBlocked = async (inquirer: SupportChatInquirer) => {
	const [row] = await db
		.select({ id: supportChatRoom.id })
		.from(supportChatRoom)
		.where(and(inquirerRoomWhere(inquirer), eq(supportChatRoom.isBlocked, true)))
		.limit(1);
	return Boolean(row);
};

const effectiveStatus = (
	room: { lastMessageAt: Date; status: "closed" | "open" },
	now: Date
): "closed" | "open" =>
	isSupportChatRoomEffectivelyClosed(room, now) ? "closed" : "open";
```

- [ ] **Step 2: getMyRoom → getMyRooms 교체**

```ts
	getMyRooms: publicProcedure.handler(async ({ context }) => {
		const inquirer = resolveInquirer(context);
		if (!inquirer) {
			return { rooms: [] };
		}
		const rooms = await db
			.select()
			.from(supportChatRoom)
			.where(inquirerRoomWhere(inquirer))
			.orderBy(desc(supportChatRoom.lastMessageAt))
			.limit(INQUIRER_ROOM_LIMIT);
		const roomIds = rooms.map((room) => room.id);
		// 미리보기·미읽음은 admin.listRooms와 같은 배치 방식 — 방마다 N+1 금지.
		const lastMessages = roomIds.length
			? await db
					.selectDistinctOn([supportChatMessage.roomId], {
						body: supportChatMessage.body,
						roomId: supportChatMessage.roomId,
					})
					.from(supportChatMessage)
					.where(inArray(supportChatMessage.roomId, roomIds))
					.orderBy(supportChatMessage.roomId, desc(supportChatMessage.createdAt))
			: [];
		const unreadRows = roomIds.length
			? await db
					.select({ roomId: supportChatMessage.roomId, value: count() })
					.from(supportChatMessage)
					.innerJoin(
						supportChatRoom,
						eq(supportChatMessage.roomId, supportChatRoom.id)
					)
					.where(
						and(
							inArray(supportChatMessage.roomId, roomIds),
							eq(supportChatMessage.senderType, "admin"),
							sql`${supportChatMessage.createdAt} > coalesce(${supportChatRoom.userLastReadAt}, to_timestamp(0))`
						)
					)
					.groupBy(supportChatMessage.roomId)
			: [];
		const previewByRoom = new Map(lastMessages.map((row) => [row.roomId, row.body]));
		const unreadByRoom = new Map(unreadRows.map((row) => [row.roomId, row.value]));
		const now = new Date();
		return {
			rooms: rooms.map((room) => ({
				createdAt: room.createdAt,
				id: room.id,
				lastMessageAt: room.lastMessageAt,
				lastMessagePreview: previewByRoom.get(room.id) ?? "",
				status: effectiveStatus(room, now),
				unreadCount: unreadByRoom.get(room.id) ?? 0,
			})),
		};
	}),
```

상수 `const INQUIRER_ROOM_LIMIT = 30;` 추가(ponytail: 문의자 대화가 30개를 넘으면 그때 페이징).

- [ ] **Step 3: getRoomMessages·markRead(roomId) 추가**

```ts
	getRoomMessages: publicProcedure
		.input(z.object({ roomId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const inquirer = resolveInquirer(context);
			if (!inquirer) {
				throw new ORPCError("UNAUTHORIZED", { message: NO_IDENTITY_ERROR });
			}
			const [room] = await db
				.select()
				.from(supportChatRoom)
				.where(
					and(eq(supportChatRoom.id, input.roomId), inquirerRoomWhere(inquirer))
				)
				.limit(1);
			if (!room) {
				throw new ORPCError("NOT_FOUND", { message: ROOM_NOT_FOUND });
			}
			return {
				messages: await loadRecentMessages(room.id, INQUIRER_MESSAGE_LIMIT),
				room: {
					id: room.id,
					isBlocked: room.isBlocked,
					status: effectiveStatus(room, new Date()),
				},
			};
		}),
```

markRead는 입력에 roomId를 받아 `and(eq(supportChatRoom.id, input.roomId), inquirerRoomWhere(inquirer))`로 갱신하도록 교체.

- [ ] **Step 4: sendMessage에 roomId 옵션·차단/종료 검증**

입력을 `z.object({ body: ..., roomId: z.string().uuid().optional() })`로. 기존 "1인 1방 조회/onConflict 생성" 블록을 다음으로 교체(레이트리밋·admin 역할 검사·알림 에지 트리거는 그대로):

```ts
			if (await isOwnerBlocked(inquirer)) {
				throw new ORPCError("FORBIDDEN", { message: BLOCKED_ERROR });
			}
			let room: typeof supportChatRoom.$inferSelect | undefined;
			if (input.roomId) {
				[room] = await db
					.select()
					.from(supportChatRoom)
					.where(
						and(
							eq(supportChatRoom.id, input.roomId),
							inquirerRoomWhere(inquirer)
						)
					)
					.limit(1);
				if (!room) {
					throw new ORPCError("NOT_FOUND", { message: ROOM_NOT_FOUND });
				}
				if (isSupportChatRoomEffectivelyClosed(room, new Date())) {
					// 위젯은 409를 받으면 "새 대화 시작" 안내로 전환한다.
					throw new ORPCError("CONFLICT", {
						message: SUPPORT_CHAT_CLOSED_ERROR,
					});
				}
			} else {
				// 새 대화. 유니크가 없어졌으니 경합 재조회도 없다 — 더블클릭 이중
				// 생성은 위젯의 isPending 가드가 막는다.
				[room] = await db
					.insert(supportChatRoom)
					.values(
						inquirer.kind === "member"
							? { userId: inquirer.userId }
							: { guestId: inquirer.sid }
					)
					.returning();
			}
```

이후 로직에서 `room.isBlocked` 개별 검사 블록은 삭제(위 소유자 축 검사로 대체). 반환은 `return { id: inserted.id, roomId: room.id };`.

- [ ] **Step 5: getWidgetHome 추가**

```ts
	// 홈 탭 데이터 1회 호출. 게시 FAQ는 공개 콘텐츠라 인증을 요구하지 않는다
	// (listFaq는 회원용 그대로 둔다).
	getWidgetHome: publicProcedure.handler(async () => {
		const [settings] = await db
			.select({ notice: bambiSiteSettings.supportChatNotice })
			.from(bambiSiteSettings)
			.limit(1);
		const faqs = await db
			.select({ id: faqEntry.id, question: faqEntry.question })
			.from(faqEntry)
			.where(eq(faqEntry.isPublished, true))
			.orderBy(asc(faqEntry.sortOrder), asc(faqEntry.createdAt))
			.limit(WIDGET_HOME_FAQ_LIMIT);
		const notice = settings?.notice?.trim();
		return { faqs, notice: notice ? notice : null };
	}),
```

상수 `const WIDGET_HOME_FAQ_LIMIT = 5;` 추가. `faqEntry.question` 컬럼명은 스키마에서 확인해 실제 이름(question/title)에 맞춘다.

- [ ] **Step 6: 타입체크 + Commit**

Run: `pnpm --filter @bambi-app/api exec tsc --noEmit` — web은 아직 옛 getMyRoom을 참조해 깨질 수 있으니 api 패키지만 확인.
Commit: `feat: 문의자 다중 대화 API — 목록·대화 조회·새 대화 발신·홈 데이터`

---

### Task 4: 운영자 라우터 개편

**Files:**
- Modify: `packages/api/src/routers/bambi/support-chat.ts` (admin 네임스페이스)

**Interfaces:**
- Consumes: Task 1·2 산출물.
- Produces (콘솔 Task 7이 호출):
  - `admin.listRooms({ page, status: "closed" | "open" })` — 기존 반환에 항목별 `ownerRoomCount: number`, `status: "closed" | "open"` 추가.
  - `admin.getRoom({ roomId })` — room에 `closedAt: Date | null`, `status` 추가.
  - `admin.setClosed({ closed: boolean, roomId }): { ok: boolean }`
  - `admin.sendMessage` — 유효 종료 방이면 재개 후 발신(시그니처 불변).
  - `admin.setBlocked` — 소유자 축 일괄 적용(시그니처 불변).

- [ ] **Step 1: listRooms 상태 필터 + ownerRoomCount**

입력을 `z.object({ page: ..., status: z.enum(["open", "closed"]).default("open") })`로. 유효 상태 조건(파생 판정의 SQL 대응 — 헬퍼와 같은 7일 상수 사용):

```ts
const effectivelyClosedSql = or(
	eq(supportChatRoom.status, "closed"),
	sql`${supportChatRoom.lastMessageAt} < now() - make_interval(days => ${SUPPORT_CHAT_AUTO_CLOSE_DAYS})`
);
const effectivelyOpenSql = and(
	eq(supportChatRoom.status, "open"),
	sql`${supportChatRoom.lastMessageAt} >= now() - make_interval(days => ${SUPPORT_CHAT_AUTO_CLOSE_DAYS})`
);
```

totalCount·rooms 조회 모두 `where(input.status === "closed" ? effectivelyClosedSql : effectivelyOpenSql)` 적용. 페이지 방들의 소유자별 총 대화 수는 한 방 쿼리:

```ts
				const userIds = rooms.flatMap((r) => (r.userId ? [r.userId] : []));
				const guestIds = rooms.flatMap((r) => (r.guestId ? [r.guestId] : []));
				const ownerRows =
					userIds.length || guestIds.length
						? await db
								.select({
									guestId: supportChatRoom.guestId,
									userId: supportChatRoom.userId,
									value: count(),
								})
								.from(supportChatRoom)
								.where(
									or(
										userIds.length
											? inArray(supportChatRoom.userId, userIds)
											: sql`false`,
										guestIds.length
											? inArray(supportChatRoom.guestId, guestIds)
											: sql`false`
									)
								)
								.groupBy(supportChatRoom.userId, supportChatRoom.guestId)
						: [];
				const ownerKey = (userId: null | string, guestId: null | string) =>
					userId ? `u:${userId}` : `g:${guestId ?? ""}`;
				const countByOwner = new Map(
					ownerRows.map((row) => [ownerKey(row.userId, row.guestId), row.value])
				);
```

items 매핑에 `ownerRoomCount: countByOwner.get(ownerKey(room.userId, room.guestId)) ?? 1`과 `status: effectiveStatus(room, now)`(rooms select에 status·lastMessageAt 포함) 추가. rooms select에 `status: supportChatRoom.status` 컬럼을 넣는 것을 잊지 않는다.

- [ ] **Step 2: getRoom·sendMessage·setClosed·setBlocked**

- getRoom 반환 room을 `{ closedAt: room.closedAt, id: room.id, isBlocked: room.isBlocked, status: effectiveStatus(room, new Date()) }`로.
- admin.sendMessage: 방 조회 직후 재개 처리 —

```ts
				const reopen = isSupportChatRoomEffectivelyClosed(room, new Date());
				// ...메시지 insert 후 lastMessageAt 갱신을 다음으로 교체:
				await db
					.update(supportChatRoom)
					.set(
						reopen
							? { closedAt: null, lastMessageAt: inserted.createdAt, status: "open" }
							: { lastMessageAt: inserted.createdAt }
					)
					.where(eq(supportChatRoom.id, room.id));
```

- setClosed 신설:

```ts
		setClosed: adminProcedure
			.input(z.object({ closed: z.boolean(), roomId: z.string().uuid() }))
			.handler(async ({ input }) => {
				const result = await db
					.update(supportChatRoom)
					.set(
						input.closed
							? { closedAt: new Date(), status: "closed" }
							: { closedAt: null, lastMessageAt: new Date(), status: "open" }
					)
					.where(eq(supportChatRoom.id, input.roomId))
					.returning({ id: supportChatRoom.id });
				if (result.length === 0) {
					throw new ORPCError("NOT_FOUND", { message: ROOM_NOT_FOUND });
				}
				return { ok: true };
			}),
```

(재개 시 lastMessageAt도 당겨 7일 자동 종료가 곧바로 다시 닫아버리는 것을 막는다.)

- setBlocked를 소유자 축으로:

```ts
		setBlocked: adminProcedure
			.input(z.object({ isBlocked: z.boolean(), roomId: z.string().uuid() }))
			.handler(async ({ input }) => {
				const [room] = await db
					.select({
						guestId: supportChatRoom.guestId,
						userId: supportChatRoom.userId,
					})
					.from(supportChatRoom)
					.where(eq(supportChatRoom.id, input.roomId))
					.limit(1);
				if (!room) {
					throw new ORPCError("NOT_FOUND", { message: ROOM_NOT_FOUND });
				}
				// 소유자 축 일괄 적용 — 방 단위로 두면 새 대화로 차단을 우회한다.
				await db
					.update(supportChatRoom)
					.set({ isBlocked: input.isBlocked })
					.where(
						room.userId
							? eq(supportChatRoom.userId, room.userId)
							: eq(supportChatRoom.guestId, room.guestId ?? "")
					);
				return { ok: true };
			}),
```

- [ ] **Step 3: 타입체크 + Commit**

Run: `pnpm --filter @bambi-app/api exec tsc --noEmit`
Commit: `feat: 운영자 문의 대화 상태 관리 — 목록 필터·종료/재개·소유자 축 차단`

---

### Task 5: 공지 문구 사이트 설정

**Files:**
- Modify: `packages/api/src/routers/bambi/site-settings.ts`
- Modify: `apps/web/src/app/moderator/site-settings/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `bambiSiteSettings.supportChatNotice`.
- Produces: `siteSettings.getSupportChat(): { supportChatNotice: null | string }` (admin), `siteSettings.updateSupportChat({ supportChatNotice?: null | string }): { ok: boolean }` (admin). 위젯 노출은 Task 3의 getWidgetHome이 담당하므로 공개 프로시저는 만들지 않는다.

- [ ] **Step 1: 라우터 프로시저 추가**

기존 `updateFooter`의 단일 행 upsert 패턴(SETTINGS_ROW_ID 행 insert onConflictDoUpdate)을 그대로 따라:

```ts
const updateSupportChatInput = z.object({
	supportChatNotice: optionalText(300),
});
```

`getSupportChat`(adminProcedure): `select({ supportChatNotice: bambiSiteSettings.supportChatNotice })` 단일 행 반환(행 없으면 `{ supportChatNotice: null }`). `updateSupportChat`(adminProcedure): updateFooter와 동일한 upsert 구조로 supportChatNotice만 저장.

- [ ] **Step 2: 운영자 설정 카드 추가**

`ModeratorSiteSettingsPage`에 기존 카드들("푸터 사업자 정보" 등)과 같은 패턴으로 "문의 채팅" Card 추가 — `getSupportChat` 조회로 초기값, Textarea(maxLength 300, placeholder "위젯 홈에 노출할 공지 문구 (비우면 배너 미표시)"), 저장 버튼이 `updateSupportChat` 뮤테이션 호출 + 성공 toast. 페이지의 기존 폼 상태 관리 방식(useState + useEffect 초기화)을 그대로 따른다.

- [ ] **Step 3: 검증 + Commit**

Run: `pnpm --filter @bambi-app/api exec tsc --noEmit && pnpm --filter web exec tsc --noEmit` / `pnpm exec ultracite check packages/api/src/routers/bambi/site-settings.ts apps/web/src/app/moderator/site-settings/page.tsx`
Commit: `feat: 문의 채팅 공지 문구 사이트 설정`

---

### Task 6: 위젯 인터콤 스타일 개편

**Files:**
- Modify: `apps/web/src/components/bambi/support-chat/support-chat-widget.tsx`
- Create: `apps/web/src/components/bambi/support-chat/widget-home.tsx`
- Create: `apps/web/src/components/bambi/support-chat/widget-messages.tsx`
- Create: `apps/web/src/components/bambi/support-chat/widget-conversation.tsx`

**Interfaces:**
- Consumes: Task 3의 `getMyRooms`/`getRoomMessages`/`sendMessage`/`markRead`/`getWidgetHome`.
- Produces: 없음(말단 UI).

**반드시 보존:** 런처 버튼의 레일 앵커 포털/fixed 폴백 배치 로직, `mounted` 게이트, `?auth=` 숨김(SupportChatSearchParams·useLayoutEffect), moderator 경로·admin 세션 숨김, 쿠키 발급 흐름(`POST /api/support-chat` 후 `setHasCookie(true)`), IME `isComposing` 가드, `?support-chat=1` 딥링크(홈 뷰로 열기).

- [ ] **Step 1: 셸 개편 (support-chat-widget.tsx)**

뷰 상태와 폴링을 셸이 들고 뷰 컴포넌트에 내려준다:

```ts
type WidgetView =
	| { name: "conversation"; roomId: null | string } // null = 새 대화
	| { name: "home" }
	| { name: "messages" };
```

- `const [view, setView] = useState<WidgetView>({ name: "home" });` — 패널을 열 때(런처 클릭·딥링크) 항상 `{ name: "home" }`으로 리셋.
- 목록 폴링: `roomsQuery = useQuery({ ...orpc.bambi.supportChat.getMyRooms.queryOptions(), enabled: canPoll, refetchInterval: open ? 3000 : 30_000 })`. 런처 뱃지 = `rooms.reduce((sum, r) => sum + r.unreadCount, 0)`.
- 홈 데이터: `homeQuery = useQuery({ ...orpc.bambi.supportChat.getWidgetHome.queryOptions(), enabled: mounted && !hidden && open, staleTime: 5 * 60 * 1000 })` — 신원 불요, 패널 연 뒤 1회.
- 패널 컨테이너(SupportChatPanel 교체): `Card className="fixed right-4 bottom-36 z-50 flex h-[70dvh] max-h-[34rem] w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 md:bottom-24"`. 내부는 `view.name`에 따라 `WidgetHome`/`WidgetMessages`/`WidgetConversation` 렌더 + conversation이 아닐 때 하단 탭바:

```tsx
<div className="flex border-t">
	{([
		{ icon: HomeIcon, label: "홈", name: "home" },
		{ icon: MessageSquareIcon, label: "메시지", name: "messages" },
	] as const).map((tab) => (
		<button
			className={cn(
				"flex flex-1 flex-col items-center gap-1 py-2 text-xs",
				view.name === tab.name ? "text-primary" : "text-muted-foreground"
			)}
			key={tab.name}
			onClick={() => setView({ name: tab.name })}
			type="button"
		>
			<tab.icon className="size-5" />
			<span className="relative">
				{tab.label}
				{tab.name === "messages" && totalUnread > 0 ? (
					<span className="-right-2 absolute top-0 size-2 rounded-full bg-primary" />
				) : null}
			</span>
		</button>
	))}
</div>
```

- 발신 로직(쿠키 발급 → sendMessage)은 셸에 남겨 `sendTo(roomId: null | string, body: string)` 형태로 conversation 뷰에 내려주고, onSuccess에서 `roomId`가 null이었으면 `setView({ name: "conversation", roomId: result.roomId })` + rooms/messages invalidate.

- [ ] **Step 2: 홈 뷰 (widget-home.tsx)**

```tsx
export function WidgetHome({
	faqs,
	notice,
	onStartChat,
}: {
	faqs: { id: string; question: string }[];
	notice: null | string;
	onStartChat: () => void;
}) {
	return (
		<div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
			<div className="rounded-xl bg-primary p-4 text-primary-foreground">
				<p className="m-0 font-bold text-lg">안녕하세요 👋</p>
				<p className="m-0 text-sm opacity-90">무엇을 도와드릴까요?</p>
			</div>
			{notice ? (
				<div className="rounded-lg border bg-muted/50 p-3 text-sm">{notice}</div>
			) : null}
			<Button className="justify-between" onClick={onStartChat}>
				메시지를 보내주세요
				<SendHorizontal />
			</Button>
			{faqs.length > 0 ? (
				<div className="flex flex-col gap-1">
					<p className="m-0 px-1 text-muted-foreground text-xs">자주 묻는 질문</p>
					{faqs.map((faq) => (
						<Link
							className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-muted"
							href="/support"
							key={faq.id}
						>
							<span className="min-w-0 truncate">{faq.question}</span>
							<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
						</Link>
					))}
				</div>
			) : null}
		</div>
	);
}
```

`onStartChat`은 셸에서 "진행 중(status open) 최신 대화가 있으면 그 대화, 없으면 새 대화(roomId null)"로 view 전환. FAQ Link 클릭 시 셸의 패널 닫기(onNavigate 콜백로 `setOpen(false)`)도 연결한다.

- [ ] **Step 3: 메시지 뷰 (widget-messages.tsx)**

getMyRooms의 rooms를 받아 목록 렌더. 각 행: 미리보기(truncate)·`formatDateTime(lastMessageAt)`·미읽음 Badge·status가 closed면 "종료" 뱃지(variant="outline"). 클릭 → `onOpenRoom(room.id)`. 목록 하단(또는 빈 목록 EmptyState 아래)에 "메시지를 보내주세요" Button → `onStartNew()`. 대화가 0건이면 "아직 나눈 대화가 없어요" 안내.

- [ ] **Step 4: 대화 뷰 (widget-conversation.tsx)**

- 헤더: 뒤로가기(ChevronLeftIcon → `onBack()`, 메시지 뷰로) + "운영자 문의" 타이틀 + 닫기 X.
- roomId가 있으면 `getRoomMessages({ roomId })` 3초 폴링, null(새 대화)이면 조회 없이 빈 안내("운영자에게 궁금한 점을 남겨 주세요.").
- 말풍선·입력 UI는 기존 SupportChatPanel 코드 이전(IME 가드 포함).
- 읽음 처리: 해당 방 unreadCount(셸이 rooms에서 찾아 내려줌)가 0보다 크면 `markRead({ roomId })` 후 rooms invalidate — 기존 effect 패턴 유지.
- 입력 가드: `room.status === "closed"`면 입력창 대신
  `<p>종료된 대화예요.</p>` + `<Button onClick={onStartNew}>새 대화 시작</Button>`.
  `isBlocked`면 기존 "문의 발신이 제한된 상태예요." 문구 유지.
- 발신 에러 처리: 409(종료 경합)는 toast 후 rooms/messages invalidate로 종료 상태가 반영되게 한다.

- [ ] **Step 5: 검증 + Commit**

Run: `pnpm --filter web exec tsc --noEmit` (낡은 .next 라우트 타입 오탐은 위젯 무관 여부만 확인) / `pnpm exec ultracite check apps/web/src/components/bambi/support-chat/*.tsx`
Expected: 위젯 관련 에러 0. 인지 복잡도 초과 시 뷰 내부 블록을 더 쪼갠다.
Commit: `feat: 문의 위젯 인터콤 스타일 개편 — 홈·메시지·대화 뷰`

---

### Task 7: 운영자 콘솔 개편

**Files:**
- Modify: `apps/web/src/app/moderator/support-chats/page.tsx`

**Interfaces:**
- Consumes: Task 4의 admin API.

- [ ] **Step 1: 목록 상태 탭 + 카드 표시**

- `const [status, setStatus] = useState<"closed" | "open">("open");` — listRooms 입력에 전달, 탭 전환 시 `setPage(1)`·`setSelectedRoomId(null)`.
- 목록 위에 ToggleGroup(단일 선택, 기존 콘솔들 패턴):

```tsx
<ToggleGroup
	onValueChange={(value) => value && switchStatus(value as "closed" | "open")}
	type="single"
	value={status}
>
	<ToggleGroupItem value="open">진행 중</ToggleGroupItem>
	<ToggleGroupItem value="closed">종료</ToggleGroupItem>
</ToggleGroup>
```

- 방 카드에: `room.status === "closed"`면 `<Badge variant="outline">종료</Badge>`, `room.ownerRoomCount > 1`이면 `<span className="text-muted-foreground text-xs">대화 {room.ownerRoomCount}개</span>`.

- [ ] **Step 2: 상세 종료/재개·차단 문구**

- RoomDetail 헤더(문의자 정보 버튼 옆)에 종료/재개 버튼:

```tsx
<Button
	disabled={setClosed.isPending}
	onClick={() =>
		setClosed.mutate({ closed: data?.room.status !== "closed", roomId })
	}
	size="sm"
	variant="outline"
>
	{data?.room.status === "closed" ? "대화 재개" : "대화 종료"}
</Button>
```

(`setClosed`는 `orpc.bambi.supportChat.admin.setClosed` 뮤테이션, 성공 시 invalidate + toast "대화 상태를 바꿨어요.")
- 종료 방 컴포저 위 안내: `data?.room.status === "closed"`면 `<p className="m-0 flex-1 text-center text-muted-foreground text-sm">종료된 대화예요. 답변을 보내면 다시 열려요.</p>` — 입력은 막지 않는다(발신 = 재개).
- InquirerInfo 차단 버튼 라벨을 "발신 잠금" → "문의자 발신 잠금"/"잠금 해제"로, 잠긴 방 안내 문구를 "이 문의자의 발신을 잠갔어요. 해제하면 다시 보낼 수 있어요."로 갱신(소유자 축이 드러나게).

- [ ] **Step 3: 검증 + Commit**

Run: `pnpm --filter web exec tsc --noEmit` / `pnpm exec ultracite check apps/web/src/app/moderator/support-chats/page.tsx`
Commit: `feat: 문의 콘솔 상태 탭·대화 종료/재개·문의자 축 잠금 표시`

---

### Task 8: 매뉴얼 갱신 + 최종 검증

**Files:**
- Modify: `docs/manual/seeker-manual.md`, `docs/manual/employer-manual.md`, `docs/manual/moderator-manual.md`

- [ ] **Step 1: 매뉴얼 3종의 문의 채팅 절 갱신**

- 구직자/구인자: 위젯이 홈·메시지 탭 구조라는 것, 홈의 FAQ 바로가기·공지 배너, 대화가 여러 건 쌓이고 종료된 대화는 "새 대화 시작"으로 이어간다는 것, 7일 무활동 자동 종료.
- 운영자: 진행 중/종료 탭, 대화 종료/재개 버튼(답변 발신 = 자동 재개), 문의자 단위 발신 잠금, 사이트 설정의 공지 문구.

- [ ] **Step 2: 전체 검증**

Run: `cd packages/api && pnpm exec vitest run test/services/bambi-support-chat.test.ts test/services/bambi-support-chat-token.test.ts` → PASS
Run: `pnpm --filter @bambi-app/api exec tsc --noEmit && pnpm --filter web exec tsc --noEmit`
Run: `pnpm exec ultracite check <이번 개편에서 수정·생성한 전체 파일 목록>`
Expected: 전부 통과(라우터 테스트 스위트는 실행 금지).

- [ ] **Step 3: Commit** — `docs: 문의 채팅 매뉴얼 갱신 — 다중 대화·홈 탭·콘솔 상태 관리`

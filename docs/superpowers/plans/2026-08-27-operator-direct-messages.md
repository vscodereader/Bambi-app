# 운영자 쪽지(다이렉트 메시지) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자가 역할 단위(구직자[법률자문 포함]/구인자) 또는 특정 사용자에게 쪽지를 발송하고, 수신자는 쪽지함(읽음·보관·소프트 삭제)에서 확인하며, 도착 시 기존 알림 파이프라인(SSE·OS 배너·벨)으로 알림을 받는다.

**Architecture:** 본문 1행(`bambi_direct_message`) + 수신자 행(`bambi_direct_message_recipient`) 분리. 알림은 `notification_target_type`에 `direct_message` 값 하나를 추가해 기존 `notifyBambiNotification()` → SSE → 라벨 맵 경로를 그대로 재사용한다. 답장 없음(수신 전용).

**Tech Stack:** drizzle(pg) · oRPC(`adminProcedure`/`protectedProcedure`) · Next.js App Router + shadcn(base-ui) + TanStack Query · vitest

**Spec:** `docs/superpowers/specs/2026-08-27-operator-direct-messages-design.md`
(경로 1건 수정: 쪽지함은 스펙의 `/seeker/messages`가 아니라 **`/seeker/me/messages`** — 마이페이지 하위 페이지 패턴(MyPageShell·역할 가시성 표·persona-nav 탭 유지)을 그대로 타기 위함. Task 5에서 스펙 문서도 함께 갱신한다.)

## Global Constraints

- **push·PR 금지.** 로컬 커밋까지만. 병합도 feat 통합 브랜치(`feat/operator-direct-messages`)에만 no-ff로.
- **`db:push` 절대 금지.** 스키마 변경은 `pnpm --filter @bambi-app/db db:generate`로 마이그레이션 생성(0112 예상). 생성된 SQL에 이번 변경 외 유령 CREATE TABLE이 없는지 반드시 눈으로 확인(낡은 스냅샷 함정).
- **커밋 메시지:** 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). Bash 툴은 Git Bash이므로 멀티라인 메시지는 temp 파일 + `git commit -F`.
- **UI:** shadcn(base-ui — `asChild` 아님, `render` prop) + Tailwind만. 인라인 style 금지, 임의 px(`[Npx]`) 금지, `gap-*`(space-* 금지), `size-*`, 시맨틱 색 토큰. 모바일 반응형 필수. enum 원값 화면 노출 금지(라벨 맵 경유).
- **테스트 위치:** api는 `packages/api/test/services`만(라우터 스위트 신설 금지 — dev DB를 지운다), web은 `apps/web/test` 미러 구조 + `@/` alias.
- **검증:** `pnpm dlx ultracite fix <경로 인자 필수>` / `pnpm --filter web check-types` · `pnpm --filter @bambi-app/api check-types`(워크트리 안에서 실행).
- **워크트리:** 모든 작업은 `.claude/worktrees/operator-direct-messages`(브랜치 `worktree-operator-direct-messages`)에서. pnpm install 완료됨.
- 라이브러리 추가 금지.

---

### Task 1: DB 스키마 + enum + SSE 유니온 + 마이그레이션

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (notificationTargetType enum ~L191, bambiNotification 테이블 뒤 ~L1994)
- Modify: `packages/api/src/services/bambi-notification-stream.ts` (~L10 유니온)
- Create: `packages/db/src/migrations/0112_*.sql` (db:generate 산출물)

**Interfaces:**
- Produces: `bambiDirectMessage`, `bambiDirectMessageRecipient` 테이블 객체(후속 Task 3이 import), enum 값 `"direct_message"`, `BambiNotificationTargetType`에 `"direct_message"` 추가.

- [ ] **Step 1: enum에 값 추가**

`packages/db/src/schema/bambi.ts`의 `notificationTargetType = pgEnum(...)` 배열에 `"direct_message"`를 추가한다(알파벳 위치 무관 — 기존 배열 끝에 추가해도 ADD VALUE로 생성되므로 안전. 기존 항목 순서를 절대 바꾸지 말 것).

- [ ] **Step 2: 테이블 2개 추가**

`bambiNotification` 테이블 정의 블록(~L1993) 바로 뒤에 추가:

```ts
// 운영자 쪽지. 본문 1행 + 수신자 행 분리 — 역할 브로드캐스트에서 본문을 수신자 수만큼
// 복제하지 않고, 읽음·보관·삭제 상태는 수신자 행에만 둔다. 답장 없음(수신 전용) —
// 양방향이 필요한 문의는 support-chat이 담당한다.
export const bambiDirectMessage = pgTable("bambi_direct_message", {
	id: uuid("id").defaultRandom().primaryKey(),
	// 발송 운영자. 운영자 계정이 삭제돼도 쪽지는 남아야 하므로 set null.
	senderUserId: text("sender_user_id").references(() => user.id, {
		onDelete: "set null",
	}),
	// 발송 시 선택한 역할 축 스냅샷(표시용). 개별 지정만이면 빈 배열.
	targetRoles: text("target_roles").array().notNull().default([]),
	title: text("title").notNull(),
	body: text("body").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bambiDirectMessageRecipient = pgTable(
	"bambi_direct_message_recipient",
	{
		messageId: uuid("message_id")
			.notNull()
			.references(() => bambiDirectMessage.id, { onDelete: "cascade" }),
		recipientUserId: text("recipient_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		readAt: timestamp("read_at"),
		archivedAt: timestamp("archived_at"),
		// 소프트 삭제. 수신자 화면에서만 사라지고 운영자 발송 이력·읽음 통계는 남는다.
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.messageId, table.recipientUserId] }),
		index("bambi_dm_recipient_user_idx").on(table.recipientUserId),
		// 쪽지함 배지 카운트 전용 부분 인덱스.
		index("bambi_dm_recipient_unread_idx")
			.on(table.recipientUserId)
			.where(sql`${table.readAt} IS NULL AND ${table.deletedAt} IS NULL`),
	]
);
```

- [ ] **Step 3: SSE 유니온에 값 추가**

`packages/api/src/services/bambi-notification-stream.ts`의 `BambiNotificationTargetType` 유니온(정렬돼 있음)에 `| "direct_message"`를 `"contact_reveal"` 다음 줄에 추가. (파일 상단 주석대로 DB enum과 값 복제 관계 — 웹 클라이언트가 import해서 @bambi-app/db를 못 끌어온다.)

- [ ] **Step 4: 마이그레이션 생성·검증**

Run: `pnpm --filter @bambi-app/db db:generate`
Expected: 0112 SQL 파일 생성. 내용이 정확히 ① `ALTER TYPE "public"."notification_target_type" ADD VALUE 'direct_message'` ② CREATE TABLE 2개 ③ 인덱스·FK뿐인지 확인. **관련 없는 CREATE TABLE/DROP이 섞였으면 낡은 스냅샷 문제 — 중단하고 보고.**

- [ ] **Step 5: 타입 체크**

Run: `pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/api check-types`
Expected: PASS

- [ ] **Step 6: dev DB 적용·검증**

Run: `pnpm --filter @bambi-app/db db:migrate`
그 후 적용 확인(psql 또는 drizzle-kit): `bambi_direct_message`·`bambi_direct_message_recipient` 테이블 존재 확인. migrate가 created_at 워터마크 비교로 스킵할 수 있으니 "적용됐다"는 테이블 존재로 판정한다.

- [ ] **Step 7: Commit**

`git add packages/db packages/api/src/services/bambi-notification-stream.ts` 후 커밋:
제목 `feat: 운영자 쪽지 스키마·알림 타입 추가 (0112)`

---

### Task 2: 수신자 해석 서비스 (TDD)

**Files:**
- Create: `packages/api/src/services/bambi-direct-messages.ts`
- Test: `packages/api/test/services/bambi-direct-messages.test.ts`

**Interfaces:**
- Produces:
  - `type DirectMessageTargetRole = "employer" | "job_seeker"`
  - `expandTargetRoles(roles: DirectMessageTargetRole[]): ("employer" | "job_seeker" | "legal_advisor")[]`
  - `mergeRecipientUserIds(roleUserIds: string[], explicitUserIds: string[]): string[]`
  - `DIRECT_MESSAGE_TITLE_MAX = 100`, `DIRECT_MESSAGE_BODY_MAX = 2000`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/test/services/bambi-direct-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	expandTargetRoles,
	mergeRecipientUserIds,
} from "../../src/services/bambi-direct-messages";

describe("expandTargetRoles", () => {
	it("구직자 선택 시 법률자문가를 포함한다", () => {
		expect(expandTargetRoles(["job_seeker"])).toEqual([
			"job_seeker",
			"legal_advisor",
		]);
	});

	it("구인자만 선택하면 구인자만 나온다", () => {
		expect(expandTargetRoles(["employer"])).toEqual(["employer"]);
	});

	it("둘 다 선택하면 세 역할이 모두 나온다", () => {
		expect(expandTargetRoles(["job_seeker", "employer"]).sort()).toEqual([
			"employer",
			"job_seeker",
			"legal_advisor",
		]);
	});

	it("빈 선택은 빈 배열이다(admin·guest는 어떤 조합에도 없다)", () => {
		expect(expandTargetRoles([])).toEqual([]);
	});
});

describe("mergeRecipientUserIds", () => {
	it("역할 조회 결과와 개별 지정을 합치고 중복을 제거한다", () => {
		expect(mergeRecipientUserIds(["a", "b"], ["b", "c"])).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("양쪽이 비면 빈 배열이다", () => {
		expect(mergeRecipientUserIds([], [])).toEqual([]);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run(워크트리의 `packages/api`에서): `pnpm vitest run test/services/bambi-direct-messages.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`packages/api/src/services/bambi-direct-messages.ts`:

```ts
// 운영자 쪽지 발송 대상 해석. DB를 만지지 않는 순수 로직만 둔다 —
// test/services에서 dev DB 없이 검증한다. DB 조회·insert는 라우터가 담당.

/** 발송 UI가 고르는 역할 축. "구직자"는 법률자문가(legal_advisor)를 포함한다. */
export type DirectMessageTargetRole = "employer" | "job_seeker";

export const DIRECT_MESSAGE_TITLE_MAX = 100;
export const DIRECT_MESSAGE_BODY_MAX = 2000;

type ExpandedRole = "employer" | "job_seeker" | "legal_advisor";

/** 역할 축 → 실제 bambi_user_role 값 목록. admin·guest는 어떤 조합에서도 제외된다. */
export const expandTargetRoles = (
	roles: DirectMessageTargetRole[]
): ExpandedRole[] => {
	const expanded = new Set<ExpandedRole>();
	for (const role of roles) {
		expanded.add(role);
		if (role === "job_seeker") {
			expanded.add("legal_advisor");
		}
	}
	return [...expanded];
};

/** 역할 조회 결과 ∪ 개별 지정, 중복 제거. 순서는 역할 조회분 먼저(안정적 발송 순서). */
export const mergeRecipientUserIds = (
	roleUserIds: string[],
	explicitUserIds: string[]
): string[] => [...new Set([...roleUserIds, ...explicitUserIds])];
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/services/bambi-direct-messages.test.ts` (cwd=packages/api)
Expected: PASS 6건.

- [ ] **Step 5: Commit** — 제목 `feat: 쪽지 수신자 해석 서비스 추가`

---

### Task 3: API 라우터 + 등록

**Files:**
- Create: `packages/api/src/routers/bambi/direct-messages.ts`
- Modify: `packages/api/src/routers/bambi/index.ts` (import·타입 주석·객체 3곳)

**Interfaces:**
- Consumes: Task 1 테이블·enum, Task 2 서비스, `adminProcedure`/`protectedProcedure`(`../../index`), `requireActiveBambiProfile`(`../../services/bambi-authz`), `notifyBambiNotification`(`../../services/bambi-notifications`).
- Produces(웹이 호출): `orpc.bambi.directMessages.{send, listSent, sentDetail, listMine, unreadCount, read, setArchived, remove}`.
  - `send({ roles?, recipientUserIds?, title, body })` → `{ messageId, recipientCount }`
  - `listMine({ tab, cursor?, limit? })` → `{ items: [{ messageId, title, body, targetRoles, senderName, readAt, archivedAt, createdAt }], nextCursor }`
  - `unreadCount()` → `{ unreadCount }`

- [ ] **Step 1: 라우터 작성**

`packages/api/src/routers/bambi/direct-messages.ts` 전체:

```ts
import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	bambiDirectMessage,
	bambiDirectMessageRecipient,
	bambiProfile,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNull,
	isNotNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import {
	DIRECT_MESSAGE_BODY_MAX,
	DIRECT_MESSAGE_TITLE_MAX,
	expandTargetRoles,
	mergeRecipientUserIds,
} from "../../services/bambi-direct-messages";
import { notifyBambiNotification } from "../../services/bambi-notifications";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
// 전체 구직자 브로드캐스트가 수천 행일 수 있어 insert를 나눈다(파라미터 한도 대비).
const INSERT_CHUNK_SIZE = 500;

const sendInput = z.object({
	roles: z.array(z.enum(["job_seeker", "employer"])).default([]),
	recipientUserIds: z.array(z.string().min(1)).max(1000).default([]),
	title: z.string().trim().min(1).max(DIRECT_MESSAGE_TITLE_MAX),
	body: z.string().trim().min(1).max(DIRECT_MESSAGE_BODY_MAX),
});

// 정렬 총순서 (created_at, message_id) — notifications.list와 같은 keyset 규칙.
const cursorInput = z.object({
	createdAt: z.string().datetime(),
	messageId: z.string().uuid(),
});

const listMineInput = z.object({
	tab: z.enum(["inbox", "archived"]).default("inbox"),
	cursor: cursorInput.optional(),
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const listSentInput = z.object({
	cursor: cursorInput.optional(),
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const messageIdInput = z.object({ messageId: z.string().uuid() });

const setArchivedInput = z.object({
	messageId: z.string().uuid(),
	archived: z.boolean(),
});

/** 내 수신자 행(소프트 삭제 제외). 모든 수신자 프로시저가 같은 필터를 쓴다. */
const mineFilter = (userId: string) =>
	and(
		eq(bambiDirectMessageRecipient.recipientUserId, userId),
		isNull(bambiDirectMessageRecipient.deletedAt)
	);

const countUnread = async (userId: string): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(bambiDirectMessageRecipient)
		.where(
			and(mineFilter(userId), isNull(bambiDirectMessageRecipient.readAt))
		);
	return row?.value ?? 0;
};

export const directMessagesRouter = {
	// ---- 운영자 ----------------------------------------------------------
	send: adminProcedure.input(sendInput).handler(async ({ context, input }) => {
		const profile = await requireActiveBambiProfile(context.session);

		// 역할 브로드캐스트 대상: 해당 역할의 활성 프로필 계정(탈퇴 계정은 user 삭제
		// 아닌 soft라 bambi_profile이 남는다 — user.deletedAt으로 거른다).
		const expandedRoles = expandTargetRoles(input.roles);
		const roleUserIds =
			expandedRoles.length > 0
				? (
						await db
							.select({ userId: bambiProfile.userId })
							.from(bambiProfile)
							.innerJoin(user, eq(user.id, bambiProfile.userId))
							.where(
								and(
									inArray(bambiProfile.role, expandedRoles),
									isNull(user.deletedAt)
								)
							)
					).map((row) => row.userId)
				: [];

		// 개별 지정은 실존·미탈퇴 계정만 남긴다(지운 계정 id가 섞여도 조용히 제외).
		const explicitUserIds =
			input.recipientUserIds.length > 0
				? (
						await db
							.select({ id: user.id })
							.from(user)
							.where(
								and(
									inArray(user.id, input.recipientUserIds),
									isNull(user.deletedAt)
								)
							)
					).map((row) => row.id)
				: [];

		const recipientUserIds = mergeRecipientUserIds(
			roleUserIds,
			explicitUserIds
		);
		if (recipientUserIds.length === 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "발송할 수신자가 없습니다. 역할 또는 수신자를 선택해 주세요.",
			});
		}

		const messageId = await db.transaction(async (tx) => {
			const [message] = await tx
				.insert(bambiDirectMessage)
				.values({
					senderUserId: profile.userId,
					targetRoles: input.roles,
					title: input.title,
					body: input.body,
				})
				.returning({ id: bambiDirectMessage.id });
			if (!message) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "쪽지 생성에 실패했습니다.",
				});
			}
			for (let i = 0; i < recipientUserIds.length; i += INSERT_CHUNK_SIZE) {
				await tx.insert(bambiDirectMessageRecipient).values(
					recipientUserIds
						.slice(i, i + INSERT_CHUNK_SIZE)
						.map((recipientUserId) => ({
							messageId: message.id,
							recipientUserId,
						}))
				);
			}
			return message.id;
		});

		// 커밋 후 best-effort 알림 — 알림 실패가 발송을 깨지 않는다(래퍼가 삼킨다).
		for (const recipientUserId of recipientUserIds) {
			await notifyBambiNotification({
				actorUserId: profile.userId,
				metadata: { title: input.title },
				recipientUserId,
				targetId: messageId,
				targetType: "direct_message",
			});
		}

		return { messageId, recipientCount: recipientUserIds.length };
	}),

	listSent: adminProcedure
		.input(listSentInput)
		.handler(async ({ input }) => {
			const cursorCreatedAt = input.cursor
				? new Date(input.cursor.createdAt)
				: null;
			const olderThanCursor =
				cursorCreatedAt && input.cursor
					? or(
							lt(bambiDirectMessage.createdAt, cursorCreatedAt),
							and(
								eq(bambiDirectMessage.createdAt, cursorCreatedAt),
								lt(bambiDirectMessage.id, input.cursor.messageId)
							)
						)
					: undefined;

			// 집계는 상관 서브쿼리 — 조인이면 수신자 수만큼 행이 뻥튀기된다
			// (moderation.listUsers와 같은 규칙). 소프트 삭제 행도 통계에는 포함.
			const recipientCountSql = sql<number>`(
				select count(*)::int from ${bambiDirectMessageRecipient}
				where ${bambiDirectMessageRecipient.messageId} = ${bambiDirectMessage.id}
			)`;
			const readCountSql = sql<number>`(
				select count(*)::int from ${bambiDirectMessageRecipient}
				where ${bambiDirectMessageRecipient.messageId} = ${bambiDirectMessage.id}
					and ${bambiDirectMessageRecipient.readAt} is not null
			)`;

			const rows = await db
				.select({
					messageId: bambiDirectMessage.id,
					title: bambiDirectMessage.title,
					targetRoles: bambiDirectMessage.targetRoles,
					senderName: user.name,
					recipientCount: recipientCountSql,
					readCount: readCountSql,
					createdAt: bambiDirectMessage.createdAt,
				})
				.from(bambiDirectMessage)
				.leftJoin(user, eq(user.id, bambiDirectMessage.senderUserId))
				.where(olderThanCursor)
				.orderBy(
					desc(bambiDirectMessage.createdAt),
					desc(bambiDirectMessage.id)
				)
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;
			const last = items.at(-1);
			return {
				items,
				nextCursor:
					hasMore && last
						? {
								createdAt: last.createdAt.toISOString(),
								messageId: last.messageId,
							}
						: null,
			};
		}),

	sentDetail: adminProcedure
		.input(messageIdInput)
		.handler(async ({ input }) => {
			const [message] = await db
				.select({
					messageId: bambiDirectMessage.id,
					title: bambiDirectMessage.title,
					body: bambiDirectMessage.body,
					targetRoles: bambiDirectMessage.targetRoles,
					senderName: user.name,
					createdAt: bambiDirectMessage.createdAt,
				})
				.from(bambiDirectMessage)
				.leftJoin(user, eq(user.id, bambiDirectMessage.senderUserId))
				.where(eq(bambiDirectMessage.id, input.messageId))
				.limit(1);
			if (!message) {
				throw new ORPCError("NOT_FOUND", {
					message: "쪽지를 찾을 수 없습니다.",
				});
			}

			// 수신자별 읽음 여부. 수백~수천이 될 수 있으나 운영자 확인 화면이라 전량 반환
			// 대신 상한을 두고 요약 카운트는 listSent가 담당한다.
			const recipients = await db
				.select({
					recipientUserId: bambiDirectMessageRecipient.recipientUserId,
					recipientName: user.name,
					readAt: bambiDirectMessageRecipient.readAt,
				})
				.from(bambiDirectMessageRecipient)
				.innerJoin(
					user,
					eq(user.id, bambiDirectMessageRecipient.recipientUserId)
				)
				.where(eq(bambiDirectMessageRecipient.messageId, input.messageId))
				.orderBy(desc(bambiDirectMessageRecipient.readAt))
				.limit(1000);

			return { message, recipients };
		}),

	// ---- 수신자 ----------------------------------------------------------
	listMine: protectedProcedure
		.input(listMineInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const cursorCreatedAt = input.cursor
				? new Date(input.cursor.createdAt)
				: null;
			const olderThanCursor =
				cursorCreatedAt && input.cursor
					? or(
							lt(bambiDirectMessage.createdAt, cursorCreatedAt),
							and(
								eq(bambiDirectMessage.createdAt, cursorCreatedAt),
								lt(bambiDirectMessage.id, input.cursor.messageId)
							)
						)
					: undefined;

			const rows = await db
				.select({
					messageId: bambiDirectMessage.id,
					title: bambiDirectMessage.title,
					body: bambiDirectMessage.body,
					targetRoles: bambiDirectMessage.targetRoles,
					senderName: user.name,
					readAt: bambiDirectMessageRecipient.readAt,
					archivedAt: bambiDirectMessageRecipient.archivedAt,
					createdAt: bambiDirectMessage.createdAt,
				})
				.from(bambiDirectMessageRecipient)
				.innerJoin(
					bambiDirectMessage,
					eq(bambiDirectMessage.id, bambiDirectMessageRecipient.messageId)
				)
				.leftJoin(user, eq(user.id, bambiDirectMessage.senderUserId))
				.where(
					and(
						mineFilter(profile.userId),
						input.tab === "inbox"
							? isNull(bambiDirectMessageRecipient.archivedAt)
							: isNotNull(bambiDirectMessageRecipient.archivedAt),
						olderThanCursor
					)
				)
				.orderBy(
					desc(bambiDirectMessage.createdAt),
					desc(bambiDirectMessage.id)
				)
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;
			const last = items.at(-1);
			return {
				items,
				nextCursor:
					hasMore && last
						? {
								createdAt: last.createdAt.toISOString(),
								messageId: last.messageId,
							}
						: null,
			};
		}),

	unreadCount: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
		return { unreadCount: await countUnread(profile.userId) };
	}),

	// 열람 = 읽음. 이미 읽은 행은 그대로 둔다(멱등 — notifications.markRead와 같은 규칙).
	read: protectedProcedure
		.input(messageIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			await db
				.update(bambiDirectMessageRecipient)
				.set({ readAt: new Date() })
				.where(
					and(
						mineFilter(profile.userId),
						eq(bambiDirectMessageRecipient.messageId, input.messageId),
						isNull(bambiDirectMessageRecipient.readAt)
					)
				);
			return { unreadCount: await countUnread(profile.userId) };
		}),

	setArchived: protectedProcedure
		.input(setArchivedInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			await db
				.update(bambiDirectMessageRecipient)
				.set({ archivedAt: input.archived ? new Date() : null })
				.where(
					and(
						mineFilter(profile.userId),
						eq(bambiDirectMessageRecipient.messageId, input.messageId)
					)
				);
			return { ok: true };
		}),

	// 소프트 삭제. 내 행만 건드리므로 남의 messageId를 넣어도 조용히 0건.
	remove: protectedProcedure
		.input(messageIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			await db
				.update(bambiDirectMessageRecipient)
				.set({ deletedAt: new Date() })
				.where(
					and(
						mineFilter(profile.userId),
						eq(bambiDirectMessageRecipient.messageId, input.messageId)
					)
				);
			return { unreadCount: await countUnread(profile.userId) };
		}),
};
```

- [ ] **Step 2: 라우터 등록(3곳)**

`packages/api/src/routers/bambi/index.ts`:
1. import 블록(알파벳순): `import { directMessagesRouter } from "./direct-messages";` (`crawler` 다음)
2. `bambiRouter` 타입 주석에 `directMessages: typeof directMessagesRouter;` (`crawler` 다음)
3. 객체 리터럴에 `directMessages: directMessagesRouter,` (같은 위치)

- [ ] **Step 3: 타입 체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS. (TS7056이 나면 타입 주석 누락 — Step 2를 재확인.)

- [ ] **Step 4: Commit** — 제목 `feat: 운영자 쪽지 API 라우터 추가`

---

### Task 4: 알림 라벨·딥링크 (TDD)

**Files:**
- Modify: `apps/web/src/lib/bambi/notification-labels.ts`
- Test: `apps/web/test/lib/bambi/notification-labels.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `BambiNotificationView` (기존 타입), Task 1의 `"direct_message"` targetType.
- Produces: `direct_message` 알림의 제목·본문·착지 경로. SSE 배너(`use-bambi-notification-stream.ts`)는 `notificationTitle()`을 재사용하므로 자동으로 함께 해결된다.

- [ ] **Step 1: 기존 테스트 파일에 실패 케이스 추가**

`apps/web/test/lib/bambi/notification-labels.test.ts`의 기존 패턴(다른 targetType 케이스 서술 방식)을 그대로 따라 추가:

```ts
describe("direct_message", () => {
	const item = {
		chatRoomId: null,
		metadata: { title: "8월 정산 안내" },
		recipientRole: null,
		targetId: "m-1",
		targetType: "direct_message",
	} as const;

	it("제목은 쪽지 도착 문구다", () => {
		expect(notificationTitle(item)).toBe("운영자 쪽지가 도착했어요");
	});

	it("본문은 쪽지 제목이다", () => {
		expect(notificationBody(item)).toBe("8월 정산 안내");
	});

	it("본문 제목이 없으면 본문을 생략한다", () => {
		expect(notificationBody({ ...item, metadata: {} })).toBeNull();
	});

	it("착지는 쪽지함이다", () => {
		expect(notificationHref(item)).toBe("/seeker/me/messages");
	});
});
```

(주의: 기존 테스트의 item 형태·헬퍼와 다르면 그 파일의 실제 형태에 맞춘다 — 검증 기준은 위 4개 기대값.)

- [ ] **Step 2: 실패 확인**

Run(워크트리의 `apps/web`에서): `pnpm vitest run test/lib/bambi/notification-labels.test.ts`
Expected: 새 4건 FAIL.

- [ ] **Step 3: 라벨 구현**

`notification-labels.ts` 수정 3곳:
1. `TITLE_BY_TARGET` 맵에 `direct_message: "운영자 쪽지가 도착했어요",` 추가.
2. `notificationBody()` 상단 특례 블록(point_shop_order expiry_soon 케이스와 같은 자리)에 추가:

```ts
	// 쪽지는 metadata.title(쪽지 제목)을 본문으로 낸다 — 본문 원문은 정본(쪽지함)에서 읽는다.
	if (item.targetType === "direct_message") {
		return readString(item.metadata, "title");
	}
```

3. `notificationHref()`의 switch에 케이스 추가:

```ts
		case "direct_message":
			return "/seeker/me/messages";
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run test/lib/bambi/notification-labels.test.ts` (cwd=apps/web)
Expected: PASS(기존 케이스 포함 전건).

- [ ] **Step 5: Commit** — 제목 `feat: 쪽지 알림 라벨·딥링크 추가`

---

### Task 5: 쪽지함 화면 `/seeker/me/messages` + 마이페이지 메뉴

**Files:**
- Create: `apps/web/src/components/bambi/screens/messages-screen.tsx`
- Create: `apps/web/src/app/seeker/me/messages/page.tsx`
- Modify: `apps/web/src/components/bambi/my-page-shell.tsx` (NAV_ITEMS + 안읽음 배지)
- Modify: `apps/web/src/components/bambi/screens/seeker.tsx` (`seekerMeSections` 허브 카드)
- Modify: `docs/superpowers/specs/2026-08-27-operator-direct-messages-design.md` (경로 `/seeker/messages` → `/seeker/me/messages`로 정정)
- Test: `apps/web/test/components/bambi/my-page-menu-roles.test.ts` (기존 역할 가시성 테스트에 쪽지함 항목 반영 — 파일의 기존 기대 목록에 추가)

**Interfaces:**
- Consumes: `orpc.bambi.directMessages.{listMine, unreadCount, read, setArchived, remove}` (Task 3), `RequireAuth`, `MyPageShell`.
- Produces: `MessagesScreen()` 컴포넌트, 경로 `/seeker/me/messages`.

- [ ] **Step 1: 페이지 생성**

`apps/web/src/app/seeker/me/messages/page.tsx` (기존 `/seeker/me/reports` 등과 같은 래퍼 패턴 — 해당 파일을 열어 layout 유무를 확인하고 동일하게):

```tsx
import { RequireAuth } from "@/components/bambi/require-auth";
import { MessagesScreen } from "@/components/bambi/screens/messages-screen";

export default function SeekerMessagesPage() {
	return (
		<RequireAuth>
			<MessagesScreen />
		</RequireAuth>
	);
}
```

- [ ] **Step 2: 화면 컴포넌트 작성**

`messages-screen.tsx` — `"use client"`. 구현 요건(코드는 기존 `my-reports-screen.tsx`/`notifications-screen.tsx`의 셸·목록 패턴을 따른다):

- `MyPageShell`(title="쪽지함") 안에서 렌더 — 다른 `/seeker/me/*` 페이지가 쓰는 셸 사용 방식을 `my-reports-screen.tsx`에서 확인해 동일하게.
- 탭: `ToggleGroup` 2항목 — `받은 쪽지`(inbox) / `보관함`(archived). 상태는 `useState<"inbox" | "archived">`.
- 목록: `useInfiniteQuery`(`orpc.bambi.directMessages.listMine.infiniteOptions({ input: (cursor) => ({ tab, cursor }), getNextPageParam: (last) => last.nextCursor ?? undefined, initialPageParam: undefined })` — notifications-screen의 infiniteOptions 사용법을 그대로 복사해 tab 입력만 추가). 행: 제목(안읽음이면 `font-extrabold` + 코럴 dot Badge), 발송 시각, 본문 1줄 `truncate`.
- 상세: 행 클릭 → `Dialog` 열림(제목·발송 시각·본문 `whitespace-pre-wrap`). 열릴 때 `read` mutation 호출 → 성공 시 `unreadCount` 쿼리 데이터를 응답값으로 `setQueryData` + `listMine` invalidate(notifications-screen의 markRead 패턴).
- 행/상세 액션: `보관`·`보관 해제`(`setArchived`), `삭제`(`AlertDialog` 확인 후 `remove`). 성공 시 `listMine`·`unreadCount` invalidate.
- 빈 상태: `EmptyState`(기존 컴포넌트) — inbox "도착한 쪽지가 없어요" / archived "보관한 쪽지가 없어요".
- 로딩: `Skeleton` 3행.
- 더 불러오기: `hasNextPage`면 하단 "더 보기" `Button variant="outline"`.
- enum 원값(`targetRoles` 등)은 화면에 렌더하지 않는다(수신자 화면에는 불필요).

- [ ] **Step 3: 마이페이지 메뉴·허브 카드 추가**

1. `my-page-shell.tsx` `NAV_ITEMS`: "포인트 내역" 항목 다음에
   `{ href: "/seeker/me/messages" as Route, icon: <Message />, label: "쪽지함" },`
   (아이콘은 파일에서 이미 import된 `Message` — 고객센터 항목이 쓰는 것. 없으면 해당 import 목록의 다른 아이콘 재사용, 신규 아이콘 파일 생성 금지.)
2. 같은 파일 `MyPageNav`에서 `orpc.bambi.directMessages.unreadCount` `useQuery`를 호출하고, `item.href === "/seeker/me/messages"`이고 `unreadCount > 0`일 때 라벨 옆 `Badge tone="primary"`로 수를 표시(99+ 캡). 운영자(admin)에게는 항목 자체를 숨긴다: `HIDDEN_MY_PAGE_HREFS.admin` 배열에 `"/seeker/me/messages"` 추가(운영자는 발송자라 수신함이 의미 없다).
3. `screens/seeker.tsx` `seekerMeSections`에 같은 위치로 추가:

```ts
	{
		href: "/seeker/me/messages" as Route,
		icon: <ClipboardListIcon />,
		label: "쪽지함",
		description: "운영자가 보낸 쪽지를 확인해요.",
	},
```

4. 스펙 문서의 `/seeker/messages` 표기를 `/seeker/me/messages`로 정정(2곳: §3 제목·알림 연동 딥링크).

- [ ] **Step 4: 역할 가시성 테스트 갱신·실행**

`apps/web/test/components/bambi/my-page-menu-roles.test.ts`를 열어 기존 기대 목록(역할별 노출 항목)에 쪽지함을 반영한다 — job_seeker·employer·legal_advisor에는 보이고 admin에는 숨김.
Run: `pnpm vitest run test/components/bambi/my-page-menu-roles.test.ts` (cwd=apps/web)
Expected: PASS.

- [ ] **Step 5: 린트·타입**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/screens/messages-screen.tsx apps/web/src/app/seeker/me/messages apps/web/src/components/bambi/my-page-shell.tsx apps/web/src/components/bambi/screens/seeker.tsx` 후 `pnpm --filter web check-types`
Expected: 린트 0건·타입 PASS.

- [ ] **Step 6: Commit** — 제목 `feat: 쪽지함 화면·마이페이지 메뉴 추가`

---

### Task 6: 운영자 화면 `/moderator/messages`

**Files:**
- Create: `apps/web/src/app/moderator/messages/page.tsx`
- Create: `apps/web/src/components/bambi/moderator-messages-panel.tsx`
- Modify: `apps/web/src/lib/bambi/moderator-navigation.ts` ("회원 관리" 그룹에 항목)
- Modify: `apps/web/src/components/bambi/persona-nav.tsx` (`tab = "more"` 경로 목록)
- Modify: `apps/web/src/components/bambi/moderator-users-table.tsx` (행 액션 "쪽지" 진입점)

**Interfaces:**
- Consumes: `orpc.bambi.directMessages.{send, listSent, sentDetail}`, `orpc.bambi.moderation.listUsers`(수신자 선택 — 검색 API 신설 없이 전량 조회 후 클라이언트 필터, listUsers 기본 limit 1000이 이미 그 용도).
- Produces: 경로 `/moderator/messages`(`?to=<userId>` 쿼리로 수신자 프리셋).

- [ ] **Step 1: 페이지·패널 작성**

`page.tsx`는 기존 `/moderator/users/page.tsx`의 래퍼 패턴(어드민 가드 방식)을 확인해 동일하게 만들고 `ModeratorMessagesPanel`을 렌더한다. 패널(`"use client"`) 구현 요건:

- **작성 카드**(Card 풀 구성): 대상 역할 `Checkbox` 2개("구직자(법률자문 포함)"·"구인자") + 특정 사용자 선택 — `Input`으로 이름/로그인 아이디 검색 → `moderation.listUsers` 결과를 클라이언트 필터해 후보 목록(최대 8행) 표시, 클릭 시 선택 목록에 `Badge`로 추가(X로 제거). 제목 `Input`(max 100)·본문 `Textarea`(max 2000).
- URL `?to=<userId>`가 있으면 마운트 시 해당 사용자를 선택 목록에 프리셋(useSearchParams).
- 발송 버튼: 역할·개별 선택이 모두 비면 disabled. 클릭 → `AlertDialog` "…명에게 발송할까요?"(역할 선택 시 인원수는 서버 계산이므로 "선택한 역할 전체 + N명" 문구) → 확인 시 `send` mutation → 성공 `toast("쪽지 N명에게 발송 완료")` + 폼 리셋 + `listSent` invalidate. 실패는 `toast.error`.
- **발송 목록 카드**: `listSent` 목록 — 제목·발송자·발송 시각·대상(역할 스냅샷 라벨: `job_seeker`→"구직자 전체", `employer`→"구인자 전체", 빈 배열→"개별 지정")·`읽음 n/전체 m`. 행 클릭 → `Dialog`로 `sentDetail`: 본문 + 수신자별 읽음 여부 목록(이름·읽은 시각 or "안읽음" Badge). enum 원값 직접 렌더 금지 — 위 라벨 매핑을 패널 안 상수로 둔다.
- 반응형: 카드 세로 스택(모바일) / `md:` 2열 그리드.

- [ ] **Step 2: 내비 연결**

1. `moderator-navigation.ts`의 "회원 관리" 그룹 items에 `{ href: "/moderator/messages" as Route, label: "쪽지" },` 추가(데스크톱 헤더·모바일 더보기 시트가 이 표에서 함께 파생된다).
2. `persona-nav.tsx`의 `tab = "more"` 판정 경로 목록(`path.startsWith("/moderator/attendance") || ...`)에 `path.startsWith("/moderator/messages") ||` 추가.

- [ ] **Step 3: 사용자 목록 진입점**

`moderator-users-table.tsx`의 기존 행 액션 패턴(버튼/드롭다운)을 확인하고, 같은 방식으로 "쪽지" 액션을 추가 — 클릭 시 `router.push(\`/moderator/messages?to=${userId}\`)`.

- [ ] **Step 4: 린트·타입**

Run: `pnpm dlx ultracite fix apps/web/src/app/moderator/messages apps/web/src/components/bambi/moderator-messages-panel.tsx apps/web/src/lib/bambi/moderator-navigation.ts apps/web/src/components/bambi/persona-nav.tsx apps/web/src/components/bambi/moderator-users-table.tsx` 후 `pnpm --filter web check-types`
Expected: 0건·PASS.

- [ ] **Step 5: Commit** — 제목 `feat: 운영자 쪽지 발송·발송 이력 화면 추가`

---

### Task 7: 매뉴얼 동기화

**Files:**
- Modify: `docs/manual/moderator-manual.md` — "쪽지 보내기" 섹션(회원 관리 근처): 대상 선택(역할/개별)·발송·발송 이력·수신자별 읽음 확인. 사용자 화면 기준 버튼명 그대로.
- Modify: `docs/manual/seeker-manual.md` / `docs/manual/employer-manual.md` — "쪽지함" 섹션: 위치(내 정보 → 쪽지함), 알림 도착, 읽음·보관·삭제. 두 매뉴얼 모두 같은 쪽지함을 쓰므로 문구를 각 역할 톤에 맞춰 기술.

- [ ] **Step 1: 세 매뉴얼에 섹션 추가** — 각 매뉴얼의 기존 쉬운 문체·형식(목차 앵커·섹션 번호 규칙)을 그대로 따른다.
- [ ] **Step 2: 매뉴얼 테스트 실행**

Run(cwd=apps/web): `pnpm vitest run test --testPathPattern manual` 로 매뉴얼 관련 테스트를 찾고, 매칭이 없으면 `grep -rln "manual" apps/web/test`로 실제 파일을 찾아 그 파일만 실행.
Expected: PASS(형식 검사 통과).

- [ ] **Step 3: Commit** — 제목 `docs: 매뉴얼 3종에 쪽지 기능 반영`

---

### Task 8: 전체 검증 + 병합

- [ ] **Step 1: 전체 검증(워크트리 안에서)**

```bash
pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types
```

api 테스트(cwd=packages/api): `pnpm vitest run test/services` — 기저 실패로 알려진 dev DB 의존 3건 외 신규 실패가 없어야 한다.
web 테스트(cwd=apps/web): `pnpm vitest run test`
ultracite: 이번 변경 파일 전체 경로를 인자로 `pnpm dlx ultracite fix <paths>` → 0건.

- [ ] **Step 2: 병합(사용자 push 지시 전까지 로컬만)**

superpowers:finishing-a-development-branch 스킬을 따른다. 요지: ExitWorktree로 메인 리포로 복귀 → **현재 브랜치가 `feat/operator-direct-messages`인지 확인을 별도 명령으로 먼저 실행** → `git merge --no-ff worktree-operator-direct-messages`(제목 `merge: 운영자 쪽지 기능 - ...`, `(worktree-*)` 접미사 금지) → 병합 확인 후 `git worktree remove .claude/worktrees/operator-direct-messages` + `git branch -d worktree-operator-direct-messages`. 병합 후 메인 리포에서 MODULE_NOT_FOUND가 나면 `.pnpm-workspace-state-v1.json` 삭제 후 재설치.

- [ ] **Step 3: 보고** — 브랜치·커밋 위치 보고 후 대기(push·PR 금지). 배포 전 운영 DB `db:migrate`(0112) 필요를 함께 고지.

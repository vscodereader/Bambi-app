# 알림 시스템 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 쓰기 전용이던 `bambi_notification`을 실제 알림 시스템으로 확장한다 — 역할 공유 수신(운영자·법률자문 1행 + 확인자 기록)을 포함한 스키마, 읽기 API(`notifications` 라우터), 스펙 §3 매트릭스 전 이벤트의 생성 호출, SSE 확장, 벨 배지 + 알림함 화면 + 탭 비활성 시 OS 알림.

**Architecture:** 기존 `/sse/notifications` 채널을 그대로 재사용한다(서버 플러그인 `apps/server/src/plugins/sse.ts` 무변경). 알림 행 생성은 `packages/api/src/services/bambi-notifications.ts` 한 곳으로 모으고, 운영자 조치 축은 그 파일의 공통 훅 `notifyModerationAction()`이 수신자를 해석해 커버한다. 사용자간 이벤트는 각 라우터에서 `notifyBambiNotification()`을 직접 부른다(전부 best-effort — 실패해도 본 작업을 실패시키지 않는다). 채팅 outbox(`bambi-chat-sync-queue.ts`)는 채팅 전용으로 유지하며 재시도 큐를 위해 `createBambiNotification`을 계속 쓴다. 역할 공유 알림은 DB 행 1개 + SSE만 N명 팬아웃. 웹은 라벨·딥링크 순수 맵(`apps/web/src/lib/bambi/notification-labels.ts`)을 거쳐 렌더하고, SSE 훅이 targetType으로 채팅/비채팅 무효화를 가른다.

**Tech Stack:** drizzle-orm(pg enum·partial index·CHECK), oRPC(`protectedProcedure`), Fastify SSE(기존), Next.js App Router(web), TanStack Query(`useQuery`/`useMutation`/`useInfiniteQuery` + `orpc.*.infiniteOptions`), shadcn(base-ui) 컴포넌트, vitest.

**스펙:** `docs/superpowers/specs/2026-08-06-notifications-attendance-design.md` — 본 계획은 §2·§3·§4·§6·§7의 **알림 부분 전부**를 커버한다. §5(출석체크)는 별도 계획.

## Global Constraints

- **빌드·dev 서버 실행 금지**(사용자가 HMR로 항상 띄워 둔다). 검증은 `check-types` + `ultracite` + 순수 vitest만. 스크린샷·Playwright 금지 — 시각 확인은 사용자 검수.
- **pnpm 필터명**: web/server는 scope 없음(`pnpm --filter web check-types`, `pnpm --filter server check-types`), db/api만 `@bambi-app/db`·`@bambi-app/api`.
- **ultracite는 경로 인자 필수**: `pnpm dlx ultracite fix <경로...>` — 인자 없이 실행하면 0파일 검사라 아무것도 안 한다.
- **`packages/api/src/routers/bambi` vitest 스위트 실행 금지** — `site-settings.test.ts`가 운영 설정 행을 delete해 dev DB를 파괴한다. DB 의존 라우터 테스트는 **작성만 하고 실행 보류**(각 스텝에 명시돼 있다).
- **DB**: `db:push` 절대 금지. `pnpm --filter @bambi-app/db db:generate`로 마이그레이션 파일 생성까지만 하고, `db:migrate` 적용은 **사용자 명시 지시 대기**.
- **npm 의존성 추가 금지**(Notification API는 브라우저 내장, 서비스워커·VAPID·`web-push` 전부 이번 범위 밖).
- **서브에이전트는 git commit/stash/push 금지** — 커밋은 컨트롤러가 태스크 리뷰 후 수행한다. 각 태스크의 "커밋" 스텝은 "변경 파일 목록과 검증 결과를 보고하고 종료"로 대체한다.
- 커밋 메시지(컨트롤러용): 한국어 `type: 제목` + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). Bash(Git Bash)에서는 임시 파일 + `git commit -F <파일>` 사용(PowerShell here-string `@'...'@`은 sh에서 리터럴 `@`가 박힌다).
- 주석은 한국어, 기존 파일의 주석 밀도·톤(왜 이렇게 했는지)을 따른다. 줄바꿈 LF.
- **UI 규칙**: shadcn 컴포넌트 우선(`@bambi-app/ui/components`), 인라인 `style` 금지·Tailwind만, base-ui라 `asChild`가 아니라 `render` prop(렌더 대상이 `<Button>`이 아닌 Link/Input이면 `nativeButton={false}` 동반), **DB enum 원값 화면 노출 금지**(`lib/bambi`의 라벨 맵 경유), **임의 px 금지**(Tailwind 스케일 토큰), `rounded-none` 금지, 모바일 반응형 필수, 빈 상태는 `Empty`(래퍼 `EmptyState`), 배지는 `Badge`, 세로 스택은 `flex flex-col gap-*`(`space-y-*` 금지), 가로=세로는 `size-*`.
- 테스트 실행은 워크트리 루트에서: `pnpm --filter web exec vitest run <파일들>` / `pnpm --filter @bambi-app/api exec vitest run <파일들>` (리포 루트에서 경로 필터로 돌리면 다른 워크트리까지 긁는다).

---

### Task 1: DB 스키마 — `notification_target_type` enum + 역할 공유 수신 컬럼

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (enum 추가: L119-130 `moderationTargetType` 바로 뒤 / 테이블 수정: L1474-1501 `bambiNotification`)
- Create: `packages/db/src/migrations/0070_*.sql` (drizzle generate 산출물, USING 캐스트 손질)
- Modify: `packages/db/src/migrations/meta/_journal.json` (generate가 자동 갱신)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `notificationTargetType` — `pgEnum("notification_target_type", [...13종])`
  - `bambiNotification.recipientUserId: text | null`(FK cascade), `bambiNotification.recipientRole: bambi_user_role | null`, `bambiNotification.readByUserId: text | null`(FK set null), `bambiNotification.targetType: notification_target_type`
  - DB 제약: `bambi_notification_recipient_one_of_ck`(정확히 한쪽), 부분 인덱스 `bambi_notification_recipient_role_idx`

- [ ] **Step 1: enum 신설** — `packages/db/src/schema/bambi.ts`의 `moderationTargetType` 정의(L119-130) **바로 아래**에 붙인다.

```ts
// 알림 전용 대상 타입. 감사 로그(moderation_target_type)와 분리한다 — 알림에만 필요한 값
// (interview_schedule·contact_reveal·job_post 검수 대기 등)이 감사 enum을 오염시키면
// 두 축이 서로의 마이그레이션에 묶인다. 이 시점부터 두 enum은 독립 진화한다.
// 마이그레이션 호환을 위해 새 값은 항상 목록 끝에 덧붙인다(ALTER TYPE ... ADD VALUE).
export const notificationTargetType = pgEnum("notification_target_type", [
	// 채팅 2종은 기존 저장값 호환용(알림함 목록·카운트에서는 제외된다 — 채팅 핀이 담당).
	"chat_message",
	"chat_room",
	"interview_schedule",
	"contact_reveal",
	"support_inquiry",
	"report",
	"community_post",
	"community_comment",
	"review",
	"job_post",
	"employer_verification",
	"team_invitation",
	"organization_member",
]);
```

- [ ] **Step 2: 테이블 수정** — 같은 파일 L1474-1501의 `bambiNotification` 정의를 아래로 통째 교체한다.

```ts
export const bambiNotification = pgTable(
	"bambi_notification",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// 개인 수신자. 역할 공유 알림(운영자 큐·법률자문)에서는 비고 recipient_role만 채운다 —
		// 아래 CHECK가 "정확히 한쪽"을 강제한다(community_post_author_one_of_ck와 같은 패턴).
		recipientUserId: text("recipient_user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		// 역할 공유 수신. 운영자 5명이면 행 5개가 아니라 1개다 — 한 명이 확인하면 전원의
		// 배지에서 사라진다(큐 성격상 의도된 동작). SSE만 그 역할 계정 수만큼 팬아웃한다.
		recipientRole: bambiUserRole("recipient_role"),
		// 공유 행을 누가 확인했는지. 알림함에 "확인: ○○"로 표시한다. 확인자가 탈퇴해도
		// 알림 자체는 남아야 하므로 계정 삭제 시 null로만 떨어뜨린다.
		readByUserId: text("read_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		targetType: notificationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		chatRoomId: uuid("chat_room_id").references(() => chatRoom.id, {
			onDelete: "cascade",
		}),
		readAt: timestamp("read_at"),
		// 이벤트 세부(action·reason·board·postId·jobPostId …). 라벨·딥링크가 이 값을 읽는다.
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("bambi_notification_recipient_user_id_idx").on(table.recipientUserId),
		// 공유 행은 전체의 극소수라 부분 인덱스로 둔다 — 운영자 목록·카운트가 개인 행
		// 수백만 건을 건너뛰고 바로 자기 몫만 읽는다.
		index("bambi_notification_recipient_role_idx")
			.on(table.recipientRole)
			.where(sql`${table.recipientRole} IS NOT NULL`),
		index("bambi_notification_chat_room_id_idx").on(table.chatRoomId),
		index("bambi_notification_target_type_target_id_idx").on(
			table.targetType,
			table.targetId
		),
		check(
			"bambi_notification_recipient_one_of_ck",
			sql`num_nonnulls(${table.recipientUserId}, ${table.recipientRole}) = 1`
		),
	]
);
```

- [ ] **Step 3: 타입 체크로 스키마 오류 확인**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: PASS(에러 없음). 실패하면 `check`·`sql` import가 이미 파일 상단(L1-16)에 있는지 확인 — 둘 다 이미 import돼 있다.

- [ ] **Step 4: 마이그레이션 생성**

Run: `pnpm --filter @bambi-app/db db:generate`
Expected: `packages/db/src/migrations/0070_<랜덤명>.sql` 생성 + `meta/_journal.json`에 idx 70 항목 추가.

- [ ] **Step 5: USING 캐스트로 손질** — 생성된 `0070_*.sql`을 열어 `target_type` 컬럼 전환 구문을 확인한다. drizzle는 enum 교체를 `ALTER TABLE ... ALTER COLUMN "target_type" SET DATA TYPE "public"."notification_target_type"`로 뽑는데, Postgres는 enum→enum 직접 캐스트를 모르므로 **`USING` 절이 없으면 적용 시 실패한다**. 아래처럼 고친다(기존 저장값은 `chat_message`/`chat_room` 2종뿐이고 새 enum에 모두 존재해 무손실이다).

```sql
ALTER TABLE "bambi_notification" ALTER COLUMN "target_type" SET DATA TYPE "public"."notification_target_type" USING "target_type"::text::"public"."notification_target_type";
```

또한 파일 안에 아래 4개 구문이 모두 있는지 확인하고, 없으면 손으로 채운다(순서 중요: 컬럼 추가 → NOT NULL 해제 → CHECK → 인덱스).

```sql
ALTER TABLE "bambi_notification" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD COLUMN "recipient_role" "bambi_user_role";--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD COLUMN "read_by_user_id" text;--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD CONSTRAINT "bambi_notification_read_by_user_id_user_id_fk" FOREIGN KEY ("read_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bambi_notification_recipient_role_idx" ON "bambi_notification" USING btree ("recipient_role") WHERE "bambi_notification"."recipient_role" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "bambi_notification" ADD CONSTRAINT "bambi_notification_recipient_one_of_ck" CHECK (num_nonnulls("bambi_notification"."recipient_user_id", "bambi_notification"."recipient_role") = 1);
```

- [ ] **Step 6: 린트 + 보고**

Run: `pnpm dlx ultracite fix packages/db/src/schema/bambi.ts`
Expected: 변경 없음 또는 포맷만 정리.

**⚠ `db:migrate`는 실행하지 않는다.** 적용은 사용자 명시 지시 후에만 한다. 보고에 "0070_*.sql 생성 완료, 적용 대기" 명시.

- [ ] **Step 7: 커밋(컨트롤러)** — 변경 파일 목록·검증 결과 보고 후 종료.

---

### Task 2: SSE targetType 확장 + 알림 서비스 확장(개인/역할 수신)

**Files:**
- Modify: `packages/api/src/services/bambi-notification-stream.ts` (L7 리터럴 유니언 + 로거 노출 헬퍼 추가)
- Modify: `packages/api/src/services/bambi-notifications.ts` (전체 재작성)
- Create: `packages/api/src/services/bambi-notifications.test.ts`
- Modify: `packages/api/src/services/bambi-chat-sync-queue.ts` (L96-102 호출부에 `metadata` 명시)

**Interfaces:**
- Consumes: `notificationTargetType` 값 13종(Task 1)
- Produces:
  - `type BambiNotificationTargetType` — 13개 리터럴 유니언(웹도 import한다 — 이 모듈에 db import 금지)
  - `logBambiNotificationError(error: unknown, message: string): void`
  - `type BambiNotificationRecipientRole = "admin" | "legal_advisor"`
  - `interface CreateBambiNotificationInput { actorUserId: string; chatRoomId?: null | string; metadata?: Record<string, unknown>; recipientRole?: BambiNotificationRecipientRole | null; recipientUserId?: null | string; targetId: string; targetType: BambiNotificationTargetType }`
  - `hasExactlyOneRecipient(input: CreateBambiNotificationInput): boolean`
  - `buildBambiNotificationValues(input: CreateBambiNotificationInput)`
  - `createBambiNotification(input: CreateBambiNotificationInput): Promise<string | null>`
  - `notifyBambiNotification(input: CreateBambiNotificationInput): Promise<void>` — best-effort 래퍼(이후 모든 신규 호출부가 쓴다)

- [ ] **Step 1: 실패하는 테스트 작성** — `packages/api/src/services/bambi-notifications.test.ts`

```ts
import { describe, expect, it } from "vitest";

import {
	buildBambiNotificationValues,
	hasExactlyOneRecipient,
} from "./bambi-notifications";

const base = {
	actorUserId: "user_actor",
	targetId: "target-1",
	targetType: "job_post" as const,
};

describe("hasExactlyOneRecipient", () => {
	it("개인 수신자만 있으면 통과한다", () => {
		expect(
			hasExactlyOneRecipient({ ...base, recipientUserId: "user_owner" })
		).toBe(true);
	});

	it("역할 공유 수신만 있으면 통과한다", () => {
		expect(hasExactlyOneRecipient({ ...base, recipientRole: "admin" })).toBe(
			true
		);
	});

	it("둘 다 비면 거부한다(수신자 해석 실패는 조용히 생략된다)", () => {
		expect(hasExactlyOneRecipient(base)).toBe(false);
		expect(
			hasExactlyOneRecipient({ ...base, recipientUserId: null })
		).toBe(false);
	});

	it("둘 다 채우면 거부한다(DB CHECK 위반 전에 막는다)", () => {
		expect(
			hasExactlyOneRecipient({
				...base,
				recipientRole: "admin",
				recipientUserId: "user_owner",
			})
		).toBe(false);
	});
});

describe("buildBambiNotificationValues", () => {
	it("개인 수신 행은 recipient_role을 비운다", () => {
		expect(
			buildBambiNotificationValues({
				...base,
				metadata: { action: "set_status:rejected", reason: "사진 미비" },
				recipientUserId: "user_owner",
			})
		).toEqual({
			actorUserId: "user_actor",
			chatRoomId: null,
			metadata: { action: "set_status:rejected", reason: "사진 미비" },
			recipientRole: null,
			recipientUserId: "user_owner",
			targetId: "target-1",
			targetType: "job_post",
		});
	});

	it("역할 공유 행은 recipient_user_id를 비우고 metadata 기본값은 빈 객체다", () => {
		expect(
			buildBambiNotificationValues({ ...base, recipientRole: "admin" })
		).toEqual({
			actorUserId: "user_actor",
			chatRoomId: null,
			metadata: {},
			recipientRole: "admin",
			recipientUserId: null,
			targetId: "target-1",
			targetType: "job_post",
		});
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-notifications.test.ts`
Expected: FAIL — `hasExactlyOneRecipient` export 없음.

- [ ] **Step 3: SSE 타입 확장 + 로거 노출** — `packages/api/src/services/bambi-notification-stream.ts` L7을 교체한다.

```ts
// 알림 대상 타입. DB enum(notification_target_type)과 값이 같아야 하지만, 이 모듈은
// 웹 클라이언트(use-bambi-notification-stream.ts)도 import하므로 @bambi-app/db를
// 끌어올 수 없다 — 그래서 리터럴로 복제해 둔다. 스키마에 값을 추가하면 여기도 함께 늘린다.
export type BambiNotificationTargetType =
	| "chat_message"
	| "chat_room"
	| "community_comment"
	| "community_post"
	| "contact_reveal"
	| "employer_verification"
	| "interview_schedule"
	| "job_post"
	| "organization_member"
	| "report"
	| "review"
	| "support_inquiry"
	| "team_invitation";
```

같은 파일의 `emitBambiNotification` 정의(L141) **앞**에 아래를 추가한다.

```ts
/**
 * 알림 생성 실패를 서버 로거로 흘린다. best-effort 알림의 호출부가 각자 console을
 * 쓰지 않도록, 이미 플러그인이 꽂아 둔 로거(streamLogger)를 그대로 재사용한다.
 */
export const logBambiNotificationError = (
	error: unknown,
	message: string
): void => {
	streamLogger?.error(error, message);
};
```

- [ ] **Step 4: 알림 서비스 재작성** — `packages/api/src/services/bambi-notifications.ts` 전체를 아래로 교체한다.

```ts
import { bambiNotification, bambiProfile } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";

import {
	type BambiNotificationTargetType,
	emitBambiNotification,
	logBambiNotificationError,
} from "./bambi-notification-stream";

/**
 * 역할 공유 수신이 가능한 역할. 개인 수신자가 없는 "큐 도착" 성격 알림만 여기로 온다
 * — 운영자 심사거리·법률자문 새 잠금글. 구직자·구인자는 언제나 개인 수신이다.
 */
export type BambiNotificationRecipientRole = "admin" | "legal_advisor";

export interface CreateBambiNotificationInput {
	actorUserId: string;
	chatRoomId?: null | string;
	/** 이벤트 세부. 라벨·딥링크가 읽는다: { action, reason, board, postId, jobPostId, ... } */
	metadata?: Record<string, unknown>;
	/** recipientUserId와 정확히 한쪽만 채운다(DB CHECK와 같은 규칙). */
	recipientRole?: BambiNotificationRecipientRole | null;
	recipientUserId?: null | string;
	targetId: string;
	targetType: BambiNotificationTargetType;
}

/**
 * 수신자가 정확히 한쪽만 채워졌는지. 수신자 해석 실패(게스트 글·탈퇴 계정·본인 행위
 * 제외)는 null로 내려오므로, 여기서 걸러 조용히 생략한다 — DB CHECK 위반으로
 * 본 작업(검수·면접 제안)이 터지는 일이 없어야 한다.
 */
export const hasExactlyOneRecipient = ({
	recipientRole,
	recipientUserId,
}: CreateBambiNotificationInput): boolean =>
	Boolean(recipientUserId) !== Boolean(recipientRole);

export const buildBambiNotificationValues = ({
	actorUserId,
	chatRoomId,
	metadata,
	recipientRole,
	recipientUserId,
	targetId,
	targetType,
}: CreateBambiNotificationInput) => ({
	actorUserId,
	chatRoomId: chatRoomId ?? null,
	metadata: metadata ?? {},
	recipientRole: recipientRole ?? null,
	recipientUserId: recipientUserId ?? null,
	targetId,
	targetType,
});

export const createBambiNotification = async (
	input: CreateBambiNotificationInput
): Promise<null | string> => {
	if (!hasExactlyOneRecipient(input)) {
		return null;
	}

	const { db } = await import("@bambi-app/db");
	const [notification] = await db
		.insert(bambiNotification)
		.values(buildBambiNotificationValues(input))
		.returning({
			createdAt: bambiNotification.createdAt,
			id: bambiNotification.id,
		});

	if (!notification) {
		return null;
	}

	// 역할 공유 행은 DB에 1개지만 SSE는 그 역할 계정 전원에게 보낸다 — 행을 복제하면
	// 한 명이 확인해도 나머지 배지가 남는다(공유 읽음 의미론이 깨진다).
	// 역할 계정은 소수이고 bambi_profile_role_idx가 있어 조회 비용이 무시할 만하다.
	const recipientUserIds = input.recipientUserId
		? [input.recipientUserId]
		: (
				await db
					.select({ userId: bambiProfile.userId })
					.from(bambiProfile)
					.where(eq(bambiProfile.role, input.recipientRole ?? "admin"))
			).map((row) => row.userId);

	// 본문·연락처는 담지 않고 "무엇이 생겼는지"만 보내 클라이언트가 정본을 다시 조회하게 한다.
	for (const userId of recipientUserIds) {
		emitBambiNotification(userId, {
			chatRoomId: input.chatRoomId ?? null,
			createdAt: notification.createdAt.toISOString(),
			notificationId: notification.id,
			targetId: input.targetId,
			targetType: input.targetType,
		});
	}

	return notification.id;
};

/**
 * best-effort 알림. 알림 생성 실패가 본 작업(면접 제안·검수 처리·글 작성)을 실패시키면
 * 안 된다 — 신규 호출부는 전부 이 래퍼를 쓴다. 재시도가 필요한 채팅 메시지 알림만
 * 예외로 outbox(bambi-chat-sync-queue)가 createBambiNotification을 직접 쓴다.
 */
export const notifyBambiNotification = async (
	input: CreateBambiNotificationInput
): Promise<void> => {
	try {
		await createBambiNotification(input);
	} catch (error) {
		logBambiNotificationError(error, "bambi notification create failed");
	}
};
```

- [ ] **Step 5: 채팅 outbox 호출부에 metadata 명시** — `packages/api/src/services/bambi-chat-sync-queue.ts` L96-102를 교체한다(기존에 서비스가 하드코딩하던 `{ source: "chat" }`를 호출부로 옮긴다).

```ts
		await createBambiNotification({
			actorUserId: profileUserId,
			chatRoomId: room.id,
			metadata: { source: "chat" },
			recipientUserId,
			targetId: messageId,
			targetType: "chat_message",
		});
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-notifications.test.ts`
Expected: PASS — 6 tests.

Run: `pnpm --filter @bambi-app/api check-types` / `pnpm --filter server check-types` / `pnpm --filter web check-types`
Expected: 모두 PASS(SSE 유니언 확장이 웹 훅 타입을 깨지 않는지 함께 확인).

- [ ] **Step 7: 린트 + 커밋(컨트롤러)**

Run: `pnpm dlx ultracite fix packages/api/src/services/bambi-notifications.ts packages/api/src/services/bambi-notifications.test.ts packages/api/src/services/bambi-notification-stream.ts packages/api/src/services/bambi-chat-sync-queue.ts`

---

### Task 3: 운영자 조치 공통 훅 `notifyModerationAction` + 수신자 정리 순수 함수

**Files:**
- Create: `packages/api/src/services/bambi-notification-recipients.ts`
- Create: `packages/api/src/services/bambi-notification-recipients.test.ts`
- Modify: `packages/api/src/services/bambi-notifications.ts` (파일 끝에 `notifyModerationAction` 추가)

**Interfaces:**
- Consumes: `notifyBambiNotification`(Task 2)
- Produces:
  - `resolveNotificationRecipients(candidates: readonly (null | string | undefined)[], actorUserId: string): string[]` — null 제거·중복 제거·행위자 본인 제거
  - `type ModerationNotificationTargetType = "community_comment" | "community_post" | "job_post" | "report" | "review"`
  - `notifyModerationAction(input: { action: string; actorUserId: string; metadata?: Record<string, unknown>; reason?: null | string; targetId: string; targetType: ModerationNotificationTargetType }): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성** — `packages/api/src/services/bambi-notification-recipients.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { resolveNotificationRecipients } from "./bambi-notification-recipients";

describe("resolveNotificationRecipients", () => {
	it("게스트 작성분(null)과 미조회 값(undefined)은 버린다", () => {
		expect(
			resolveNotificationRecipients([null, undefined, "user_a"], "user_actor")
		).toEqual(["user_a"]);
	});

	it("행위자 본인에게는 알리지 않는다", () => {
		expect(
			resolveNotificationRecipients(["user_actor", "user_a"], "user_actor")
		).toEqual(["user_a"]);
	});

	it("글 작성자와 부모 댓글 작성자가 같으면 한 번만 남긴다", () => {
		expect(
			resolveNotificationRecipients(["user_a", "user_a"], "user_actor")
		).toEqual(["user_a"]);
	});

	it("수신자가 하나도 없으면 빈 배열이다", () => {
		expect(resolveNotificationRecipients([null, "user_actor"], "user_actor")).toEqual(
			[]
		);
	});

	it("입력 순서를 유지한다", () => {
		expect(
			resolveNotificationRecipients(["user_b", "user_a"], "user_actor")
		).toEqual(["user_b", "user_a"]);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-notification-recipients.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 순수 함수 구현** — `packages/api/src/services/bambi-notification-recipients.ts`

```ts
/**
 * 알림 수신자 후보 정리. 이벤트마다 흩어져 있던 세 규칙을 한 곳에 모은다:
 * 1) null/undefined 제거 — 게스트 작성분·탈퇴로 사라진 작성자는 수신자가 없다(조용히 생략).
 * 2) 중복 제거 — 대댓글에서 글 작성자와 부모 댓글 작성자가 같은 사람이면 알림도 하나다.
 * 3) 행위자 본인 제거 — 내가 한 일을 나에게 알리지 않는다(운영자가 자기 글을 숨기는 경우 포함).
 */
export const resolveNotificationRecipients = (
	candidates: readonly (null | string | undefined)[],
	actorUserId: string
): string[] => {
	const recipients = new Set<string>();

	for (const candidate of candidates) {
		if (candidate && candidate !== actorUserId) {
			recipients.add(candidate);
		}
	}

	return [...recipients];
};
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-notification-recipients.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: 공통 훅 구현** — `packages/api/src/services/bambi-notifications.ts` **파일 끝**에 추가한다.

```ts
/**
 * 운영자 조치 알림의 대상 타입. 조치 지점마다 "이 대상의 주인이 누구인가"를 다시 쓰지
 * 않도록, 여기 한 곳에서만 해석한다. 수신자 id가 이미 핸들러에 있는 이벤트
 * (사업자 인증 owner·팀 초대 대상·구성원 변경)는 이 훅이 아니라
 * notifyBambiNotification으로 직접 부른다 — 훅이 같은 조회를 두 번 하지 않게.
 */
export type ModerationNotificationTargetType =
	| "community_comment"
	| "community_post"
	| "job_post"
	| "report"
	| "review";

interface NotifyModerationActionInput {
	/** 감사 로그(admin_moderation_action.action)와 같은 문자열을 그대로 넘긴다. */
	action: string;
	actorUserId: string;
	metadata?: Record<string, unknown>;
	reason?: null | string;
	targetId: string;
	targetType: ModerationNotificationTargetType;
}

/** 대상 주인 조회. 못 찾으면 null이고, 알림은 조용히 생략된다. */
const loadModerationOwnerUserId = async (
	targetType: ModerationNotificationTargetType,
	targetId: string
): Promise<null | string> => {
	const { db } = await import("@bambi-app/db");
	const {
		communityComment,
		communityPost,
		jobPost,
		report,
		review,
	} = await import("@bambi-app/db/schema/bambi");

	switch (targetType) {
		case "job_post": {
			const [row] = await db
				.select({ userId: jobPost.createdByUserId })
				.from(jobPost)
				.where(eq(jobPost.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		case "review": {
			const [row] = await db
				.select({ userId: review.reviewerUserId })
				.from(review)
				.where(eq(review.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		case "community_post": {
			// 게스트 글은 author_user_id가 null이다 — 계정이 없어 알림을 보낼 곳도 없다.
			const [row] = await db
				.select({ userId: communityPost.authorUserId })
				.from(communityPost)
				.where(eq(communityPost.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		case "community_comment": {
			const [row] = await db
				.select({ userId: communityComment.authorUserId })
				.from(communityComment)
				.where(eq(communityComment.id, targetId))
				.limit(1);
			return row?.userId ?? null;
		}
		default:
			return null;
	}
};

/**
 * 운영자 조치 → 당사자 알림. admin_moderation_action을 남기는 지점에서 부른다.
 * best-effort라 조회·전송이 실패해도 조치 자체는 그대로 성립한다.
 */
export const notifyModerationAction = async ({
	action,
	actorUserId,
	metadata,
	reason,
	targetId,
	targetType,
}: NotifyModerationActionInput): Promise<void> => {
	try {
		const ownerUserId = await loadModerationOwnerUserId(targetType, targetId);
		const [recipientUserId] = resolveNotificationRecipients(
			[ownerUserId],
			actorUserId
		);

		if (!recipientUserId) {
			return;
		}

		await notifyBambiNotification({
			actorUserId,
			metadata: { ...metadata, action, reason: reason ?? null },
			recipientUserId,
			targetId,
			targetType,
		});
	} catch (error) {
		logBambiNotificationError(error, "bambi moderation notification failed");
	}
};
```

파일 상단 import에 `resolveNotificationRecipients`를 추가한다.

```ts
import { resolveNotificationRecipients } from "./bambi-notification-recipients";
```

- [ ] **Step 6: 타입 체크 + 린트**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS.

Run: `pnpm dlx ultracite fix packages/api/src/services/bambi-notification-recipients.ts packages/api/src/services/bambi-notification-recipients.test.ts packages/api/src/services/bambi-notifications.ts`

- [ ] **Step 7: 커밋(컨트롤러)** — 보고 후 종료.

---

### Task 4: 알림 읽기 API — `routers/bambi/notifications.ts` 신설 + 라우터 등록

**Files:**
- Create: `packages/api/src/routers/bambi/notifications.ts`
- Create: `packages/api/src/routers/bambi/notifications.test.ts` (**작성만, 실행 보류**)
- Modify: `packages/api/src/routers/bambi/index.ts` (L1-19 import 블록 · L21-41 라우터 객체)

**Interfaces:**
- Consumes: Task 1 스키마 컬럼
- Produces (웹이 `orpc.bambi.notifications.*`로 소비):
  - `list({ cursor?: { createdAt: string; id: string }; limit?: number })` → `{ items: NotificationItem[]; nextCursor: { createdAt: string; id: string } | null }`
  - `NotificationItem = { chatRoomId: null | string; createdAt: Date; id: string; metadata: Record<string, unknown> | null; readAt: Date | null; readByName: null | string; recipientRole: null | string; targetId: string; targetType: string }`
  - `unreadCount()` → `{ unreadCount: number }`
  - `markRead({ ids: string[] })` → `{ unreadCount: number }`
  - `markAllRead()` → `{ unreadCount: number }`

- [ ] **Step 1: 라우터 구현** — `packages/api/src/routers/bambi/notifications.ts`

```ts
import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import { bambiNotification } from "@bambi-app/db/schema/bambi";
import { and, count, desc, eq, inArray, isNull, lt, notInArray, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
} from "../../services/bambi-authz";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// 채팅 알림은 헤더 채팅 핀이 담당한다. 알림함에서 또 세면 같은 사건이 두 번 카운트되고,
// "안 읽음 2"인데 알림함에는 하나만 보이는 상태가 된다.
const CHAT_TARGET_TYPES = ["chat_message", "chat_room"] as const;

// 역할 공유 알림을 받는 역할. 그 외 역할은 개인 수신 행만 본다.
const SHARED_RECIPIENT_ROLES = ["admin", "legal_advisor"] as const;

// 정렬 총순서가 (created_at, id)라 커서도 두 값을 함께 든다(chats.getById와 같은 규칙).
const notificationCursorInput = z.object({
	createdAt: z.string().datetime(),
	id: z.string().uuid(),
});

const listInput = z.object({
	cursor: notificationCursorInput.optional(),
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const markReadInput = z.object({
	ids: z.array(z.string().uuid()).min(1).max(MAX_PAGE_SIZE),
});

const isSharedRecipientRole = (
	role: BambiAccessProfile["role"]
): role is "admin" | "legal_advisor" =>
	SHARED_RECIPIENT_ROLES.some((shared) => shared === role);

/**
 * 이 사용자가 볼 수 있는 알림: 개인 수신(본인) + (공유 역할이면) 본인 role 수신.
 * 채팅류는 항상 제외한다 — 읽기·카운트·읽음 처리가 모두 같은 대상 집합을 써야
 * "배지에는 남는데 목록에는 없는" 유령 카운트가 생기지 않는다.
 */
const buildVisibleFilter = (profile: BambiAccessProfile) =>
	and(
		notInArray(bambiNotification.targetType, [...CHAT_TARGET_TYPES]),
		isSharedRecipientRole(profile.role)
			? or(
					eq(bambiNotification.recipientUserId, profile.userId),
					eq(bambiNotification.recipientRole, profile.role)
				)
			: eq(bambiNotification.recipientUserId, profile.userId)
	);

const countUnread = async (profile: BambiAccessProfile): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(bambiNotification)
		.where(and(buildVisibleFilter(profile), isNull(bambiNotification.readAt)));

	return row?.value ?? 0;
};

export const notificationsRouter = {
	list: protectedProcedure
		.input(listInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const cursorCreatedAt = input.cursor
				? new Date(input.cursor.createdAt)
				: null;
			// keyset 페이지네이션. 동시각 알림은 id로 갈라 경계에서 빠지거나 겹치지 않는다.
			const olderThanCursor =
				cursorCreatedAt && input.cursor
					? or(
							lt(bambiNotification.createdAt, cursorCreatedAt),
							and(
								eq(bambiNotification.createdAt, cursorCreatedAt),
								lt(bambiNotification.id, input.cursor.id)
							)
						)
					: undefined;

			// 한 건을 더 읽어 "다음 페이지가 있는지"를 별도 count 없이 판단한다.
			const rows = await db
				.select({
					chatRoomId: bambiNotification.chatRoomId,
					createdAt: bambiNotification.createdAt,
					id: bambiNotification.id,
					metadata: bambiNotification.metadata,
					readAt: bambiNotification.readAt,
					// 공유 행의 "확인: ○○" 표시용. 개인 행에서는 화면이 쓰지 않는다.
					readByName: user.name,
					recipientRole: bambiNotification.recipientRole,
					targetId: bambiNotification.targetId,
					targetType: bambiNotification.targetType,
				})
				.from(bambiNotification)
				.leftJoin(user, eq(user.id, bambiNotification.readByUserId))
				.where(and(buildVisibleFilter(profile), olderThanCursor))
				.orderBy(desc(bambiNotification.createdAt), desc(bambiNotification.id))
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;
			const last = items.at(-1);

			return {
				items,
				nextCursor:
					hasMore && last
						? { createdAt: last.createdAt.toISOString(), id: last.id }
						: null,
			};
		}),

	unreadCount: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		return { unreadCount: await countUnread(profile) };
	}),

	markRead: protectedProcedure
		.input(markReadInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			// 볼 수 있는 행만 건드린다(남의 알림 id를 넣어도 조용히 0건). 이미 읽은 행은
			// 그대로 둬 확인자·확인 시각이 나중 요청으로 덮이지 않게 한다 — 멱등.
			await db
				.update(bambiNotification)
				.set({ readAt: new Date(), readByUserId: profile.userId })
				.where(
					and(
						buildVisibleFilter(profile),
						inArray(bambiNotification.id, input.ids),
						isNull(bambiNotification.readAt)
					)
				);

			// 갱신 후 정본 카운트를 함께 돌려준다 — 클라이언트가 재조회 타이밍에 기대지
			// 않고 배지를 바로 덮어쓸 수 있다(채팅 핀에서 겪은 잔존 버그와 같은 대비).
			return { unreadCount: await countUnread(profile) };
		}),

	markAllRead: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		await db
			.update(bambiNotification)
			.set({ readAt: new Date(), readByUserId: profile.userId })
			.where(
				and(buildVisibleFilter(profile), isNull(bambiNotification.readAt))
			);

		return { unreadCount: await countUnread(profile) };
	}),
};
```

- [ ] **Step 2: `BambiAccessProfile` export 확인** — `packages/api/src/services/bambi-authz.ts` L25는 이미 `export interface BambiAccessProfile`이다. 추가 수정 없음.

- [ ] **Step 3: 라우터 등록** — `packages/api/src/routers/bambi/index.ts`

import 블록에 알파벳 순으로 추가(`moderation` 다음, `onboarding` 앞):

```ts
import { notificationsRouter } from "./notifications";
```

라우터 객체에 추가(`moderation` 다음, `onboarding` 앞):

```ts
	notifications: notificationsRouter,
```

- [ ] **Step 4: 타입 체크**

Run: `pnpm --filter @bambi-app/api check-types` + `pnpm --filter server check-types`
Expected: PASS.

- [ ] **Step 5: DB 의존 라우터 테스트 작성(실행 보류)** — `packages/api/src/routers/bambi/notifications.test.ts`

```ts
import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { notificationsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./notifications"),
	]);

const { user } = authSchema;
const { bambiNotification, bambiProfile } = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: { user: { id: userId } },
	}) as Context;

const seedUserIds: string[] = [];

const seedUser = async (
	role: "admin" | "employer" | "job_seeker"
): Promise<string> => {
	const id = `user_test_notif_${randomUUID()}`;

	await db.insert(user).values({
		email: `${id}@bambi.test`,
		id,
		name: `테스트-${id.slice(-8)}`,
	});
	await db.insert(bambiProfile).values({ role, userId: id });
	seedUserIds.push(id);

	return id;
};

let seekerId = "";
let actorId = "";
let adminAId = "";
let adminBId = "";

beforeAll(async () => {
	seekerId = await seedUser("job_seeker");
	actorId = await seedUser("employer");
	adminAId = await seedUser("admin");
	adminBId = await seedUser("admin");
});

afterAll(async () => {
	await db
		.delete(bambiNotification)
		.where(inArray(bambiNotification.actorUserId, seedUserIds));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, seedUserIds));
	await db.delete(user).where(inArray(user.id, seedUserIds));
});

describe("알림 읽기 API", () => {
	it("채팅류는 알림함 목록·카운트에서 빠진다", async () => {
		await db.insert(bambiNotification).values([
			{
				actorUserId: actorId,
				metadata: {},
				recipientUserId: seekerId,
				targetId: randomUUID(),
				targetType: "chat_message",
			},
			{
				actorUserId: actorId,
				metadata: { action: "proposed" },
				recipientUserId: seekerId,
				targetId: randomUUID(),
				targetType: "interview_schedule",
			},
		]);

		const context = createContextForUser(seekerId);
		const list = await createProcedureClient(notificationsRouter.list, {
			context,
		})({ limit: 20 });
		const unread = await createProcedureClient(
			notificationsRouter.unreadCount,
			{ context }
		)({});

		expect(list.items).toHaveLength(1);
		expect(list.items[0]?.targetType).toBe("interview_schedule");
		expect(unread.unreadCount).toBe(1);
	});

	it("역할 공유 행은 한 운영자가 확인하면 다른 운영자 배지에서도 사라진다", async () => {
		const [shared] = await db
			.insert(bambiNotification)
			.values({
				actorUserId: actorId,
				metadata: { action: "submitted" },
				recipientRole: "admin",
				targetId: randomUUID(),
				targetType: "job_post",
			})
			.returning({ id: bambiNotification.id });

		if (!shared) {
			throw new Error("공유 알림 픽스처 생성 실패");
		}

		await createProcedureClient(notificationsRouter.markRead, {
			context: createContextForUser(adminAId),
		})({ ids: [shared.id] });

		const [row] = await db
			.select({
				readAt: bambiNotification.readAt,
				readByUserId: bambiNotification.readByUserId,
			})
			.from(bambiNotification)
			.where(eq(bambiNotification.id, shared.id))
			.limit(1);

		expect(row?.readAt).not.toBeNull();
		expect(row?.readByUserId).toBe(adminAId);

		const unreadForB = await createProcedureClient(
			notificationsRouter.unreadCount,
			{ context: createContextForUser(adminBId) }
		)({});

		// 이 스위트 전용 시드 외 다른 공유 알림이 dev DB에 있을 수 있어 "0"이 아니라
		// "이 행이 목록에서 읽음으로 보인다"로 단언한다.
		const listForB = await createProcedureClient(notificationsRouter.list, {
			context: createContextForUser(adminBId),
		})({ limit: 50 });

		expect(typeof unreadForB.unreadCount).toBe("number");
		expect(
			listForB.items.find((item) => item.id === shared.id)?.readAt
		).not.toBeNull();
	});

	it("남의 개인 알림 id는 읽음 처리되지 않는다", async () => {
		const [mine] = await db
			.insert(bambiNotification)
			.values({
				actorUserId: actorId,
				metadata: {},
				recipientUserId: seekerId,
				targetId: randomUUID(),
				targetType: "report",
			})
			.returning({ id: bambiNotification.id });

		if (!mine) {
			throw new Error("개인 알림 픽스처 생성 실패");
		}

		await createProcedureClient(notificationsRouter.markRead, {
			context: createContextForUser(adminAId),
		})({ ids: [mine.id] });

		const [row] = await db
			.select({ readAt: bambiNotification.readAt })
			.from(bambiNotification)
			.where(eq(bambiNotification.id, mine.id))
			.limit(1);

		expect(row?.readAt).toBeNull();
	});
});
```

**⚠ 이 파일은 실행하지 않는다.** `packages/api/src/routers/bambi` 스위트는 dev DB를 파괴하므로(Global Constraints) 작성만 하고, Task 1의 마이그레이션이 사용자 지시로 적용된 뒤 사용자가 직접 돌린다. 보고에 "notifications.test.ts 작성 완료, 실행 보류(마이그레이션 미적용 + 스위트 금지)"를 명시한다.

- [ ] **Step 6: 린트 + 커밋(컨트롤러)**

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/notifications.ts packages/api/src/routers/bambi/notifications.test.ts packages/api/src/routers/bambi/index.ts`

---

### Task 5: 채팅 축 개인 알림 — 면접 제안·면접 상태 변경·연락처 공개

**Files:**
- Modify: `packages/api/src/routers/bambi/chats.ts` (import 블록 · `proposeInterview` L1442-1474 · `setInterviewStatus` L1476-1534 · `revealContact` L1628-1697)

**Interfaces:**
- Consumes: `notifyBambiNotification`(Task 2), 기존 `getChatRecipientUserId`(`services/bambi-chat-read-state`, 이미 chats.ts가 import 중)
- Produces: 없음(호출부만)

- [ ] **Step 1: import 추가** — `packages/api/src/routers/bambi/chats.ts` 상단 import 블록에 추가한다(`bambi-chat-read-state` import에 `getChatRecipientUserId`가 없으면 함께 추가; 없을 경우 L44-48 블록에 넣는다).

```ts
import { notifyBambiNotification } from "../../services/bambi-notifications";
```

- [ ] **Step 2: 면접 제안 알림** — `proposeInterview`의 `emitRoomUpdated({ roomId: room.id });`(L1471) **다음 줄**에 삽입한다.

```ts
			// emitRoomUpdated는 그 방 소켓룸에 들어와 있는 클라이언트에게만 닿는다 —
			// 방 밖(목록·다른 화면)에 있는 구직자는 새로고침 전까지 제안을 모른다.
			await notifyBambiNotification({
				actorUserId: profile.userId,
				chatRoomId: room.id,
				metadata: { action: "proposed" },
				recipientUserId: getChatRecipientUserId(room, profile.userId),
				targetId: schedule.id,
				targetType: "interview_schedule",
			});
```

- [ ] **Step 3: 면접 상태 변경 알림** — `setInterviewStatus`의 `emitRoomUpdated({ roomId: room.id });`(L1531) **다음 줄**에 삽입한다.

```ts
			// 확정·거절·취소·완료 전부 상대가 알아야 하는 전이다. 상태값은 metadata.action에
			// 실어 화면이 "면접이 확정됐어요"처럼 문구를 가른다.
			await notifyBambiNotification({
				actorUserId: profile.userId,
				chatRoomId: room.id,
				metadata: { action: input.status },
				recipientUserId: getChatRecipientUserId(room, profile.userId),
				targetId: updatedSchedule.id,
				targetType: "interview_schedule",
			});
```

- [ ] **Step 4: 연락처 공개 알림** — `revealContact`의 `recordJobPerformanceEvent({...})` 호출(L1684-1694) **다음**, `return consent;`(L1696) **앞**에 삽입한다.

```ts
			// 연락처를 공개하는 쪽은 항상 구인자이고, 알아야 하는 쪽은 구직자다.
			await notifyBambiNotification({
				actorUserId: profile.userId,
				chatRoomId: room.id,
				metadata: { contactMethod: input.contactMethod },
				recipientUserId: room.jobSeekerUserId,
				targetId: schedule.id,
				targetType: "contact_reveal",
			});
```

- [ ] **Step 5: 타입 체크 + 린트**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS.

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/chats.ts`

- [ ] **Step 6: 커밋(컨트롤러)** — 보고 후 종료.

---

### Task 6: 고객센터·커뮤니티·후기 개인 알림 + 선행 수정(부모 댓글 `authorUserId`)

**Files:**
- Modify: `packages/api/src/routers/bambi/support.ts` (import · `createInquiryMessage` L234-281)
- Modify: `packages/api/src/routers/bambi/community.ts` (import · `createComment` 부모 SELECT L1402-1411 · 트랜잭션 뒤 알림)
- Modify: `packages/api/src/routers/bambi/reviews.ts` (import · `create` L122-137)

**Interfaces:**
- Consumes: `notifyBambiNotification`, `resolveNotificationRecipients`
- Produces: 없음(호출부만)

- [ ] **Step 1: 문의 답변 알림** — `packages/api/src/routers/bambi/support.ts` import에 추가:

```ts
import { notifyBambiNotification } from "../../services/bambi-notifications";
```

`createInquiryMessage`의 `return { id: created.id };`(L280) **앞**에 삽입한다.

```ts
			// 운영자 답변은 문의자에게, 사용자 재질문은 운영자 큐(공유 1행)에 알린다.
			// 문의자 본인이 자기 문의에 글을 더 남긴 경우는 recipient가 본인이라 생략된다.
			await (isAdmin
				? notifyBambiNotification({
						actorUserId: profile.userId,
						metadata: { action: "answered" },
						recipientUserId: inquiry.authorUserId,
						targetId: inquiry.id,
						targetType: "support_inquiry",
					})
				: notifyBambiNotification({
						actorUserId: profile.userId,
						metadata: { action: "replied" },
						recipientRole: "admin",
						targetId: inquiry.id,
						targetType: "support_inquiry",
					}));
```

- [ ] **Step 2: 부모 댓글 SELECT에 `authorUserId` 추가(선행 수정 §6)** — `packages/api/src/routers/bambi/community.ts` L1402-1411의 부모 조회를 교체한다. 현재 컬럼 목록에 작성자가 없어 대댓글 알림의 수신자를 알 수 없다.

```ts
				const [parent] = await db
					.select({
						// 대댓글 알림 수신자. 게스트 댓글은 null이라 알림이 생략된다.
						authorUserId: communityComment.authorUserId,
						id: communityComment.id,
						parentCommentId: communityComment.parentCommentId,
						postId: communityComment.postId,
						status: communityComment.status,
					})
					.from(communityComment)
					.where(eq(communityComment.id, input.parentCommentId))
					.limit(1);
```

`if (input.parentCommentId) { ... }` 블록이 끝나면 `parent`가 스코프 밖으로 나가므로, 블록 **바깥**에서 쓸 수 있도록 블록 앞에 선언을 올린다.

```ts
		// 대댓글 알림에서 부모 댓글 작성자에게도 알려야 해 블록 밖으로 끌어올린다.
		let parentAuthorUserId: null | string = null;

		if (input.parentCommentId) {
			const [parent] = await db
				.select({
					authorUserId: communityComment.authorUserId,
					id: communityComment.id,
					parentCommentId: communityComment.parentCommentId,
					postId: communityComment.postId,
					status: communityComment.status,
				})
				.from(communityComment)
				.where(eq(communityComment.id, input.parentCommentId))
				.limit(1);

			if (parent?.status !== "published" || parent.postId !== input.postId) {
				throw new ORPCError("NOT_FOUND", {
					message: "답글을 달 댓글을 찾을 수 없습니다.",
				});
			}
			if (parent.parentCommentId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "답글에는 다시 답글을 달 수 없습니다.",
				});
			}

			parentAuthorUserId = parent.authorUserId;
		}
```

- [ ] **Step 3: 댓글 알림 생성** — 같은 핸들러의 `return await db.transaction(async (tx) => {...});`(L1435-1456)를 아래로 교체한다. 알림은 커밋 뒤에 보낸다 — 알림 실패로 댓글이 롤백되면 안 된다.

```ts
		const created = await db.transaction(async (tx) => {
			const [row] = await tx
				.insert(communityComment)
				.values({
					authorGuestId: actorGuestId(actor),
					authorRole: actorRole(actor),
					authorUserId: actorUserId(actor),
					body: input.body,
					parentCommentId: input.parentCommentId ?? null,
					// 회원 댓글은 세션으로 소유권이 증명되므로 글과 같은 관례로 빈 문자열.
					passwordHash: guestPassword
						? hashCommunityPassword(guestPassword)
						: "",
					postId: input.postId,
				})
				.returning({ id: communityComment.id });
			await tx
				.update(communityPost)
				.set({ commentCount: sql`${communityPost.commentCount} + 1` })
				.where(eq(communityPost.id, input.postId));
			return row;
		});

		// 비회원 댓글은 행위자 계정이 없어(actor_user_id NOT NULL) 알림을 만들 수 없다.
		// 글 작성자와 부모 댓글 작성자가 같거나 본인이 단 댓글이면 자동으로 걸러진다.
		const commentActorUserId = actorUserId(actor);

		if (commentActorUserId) {
			const recipients = resolveNotificationRecipients(
				[post.authorUserId, parentAuthorUserId],
				commentActorUserId
			);

			for (const recipientUserId of recipients) {
				const isParentAuthor = recipientUserId === parentAuthorUserId;

				await notifyBambiNotification({
					actorUserId: commentActorUserId,
					metadata: {
						action: isParentAuthor ? "reply" : "comment",
						board: post.board,
						postId: post.id,
					},
					recipientUserId,
					targetId: isParentAuthor
						? (input.parentCommentId ?? post.id)
						: post.id,
					targetType: isParentAuthor ? "community_comment" : "community_post",
				});
			}
		}

		return created;
```

- [ ] **Step 4: legal 게시판 새 잠금글 → 법률자문 공유 알림** — 같은 파일 `createPost`의 `return created;`(L1149) **앞**에 삽입한다.

```ts
			// 법률 자문 글은 전부 잠금글이고 답변 주체가 법률자문 계정이라, 개인 수신자가
			// 아니라 role 공유 1행으로 보낸다(누가 맡아도 되는 큐). 비회원 글은 행위자
			// 계정이 없어 알림을 만들 수 없다 — 정책상 포기(스펙 §3 제외 목록).
			const postActorUserId = actorUserId(actor);

			if (created && input.board === LEGAL_BOARD && postActorUserId) {
				await notifyBambiNotification({
					actorUserId: postActorUserId,
					metadata: { action: "submitted", board: created.board, postId: created.id },
					recipientRole: "legal_advisor",
					targetId: created.id,
					targetType: "community_post",
				});
			}
```

- [ ] **Step 5: community.ts import 추가**

```ts
import { resolveNotificationRecipients } from "../../services/bambi-notification-recipients";
import { notifyBambiNotification } from "../../services/bambi-notifications";
```

- [ ] **Step 6: 새 후기 알림** — `packages/api/src/routers/bambi/reviews.ts` import에 추가:

```ts
import { notifyBambiNotification } from "../../services/bambi-notifications";
```

`create`의 `return created;`(L137) **앞**에 삽입한다.

```ts
			// 후기는 구직자만 남기고, 그 대상은 그 방의 구인자다. 정책 판정이 심사 대기면
			// 아직 게시되지 않으므로 구인자에게는 알리지 않는다(운영자 큐 알림은 Task 9).
			if (created && created.status === "published") {
				await notifyBambiNotification({
					actorUserId: profile.userId,
					metadata: { action: "created", jobPostId: room.jobPostId },
					recipientUserId: room.employerUserId,
					targetId: created.id,
					targetType: "review",
				});
			}
```

- [ ] **Step 7: 타입 체크 + 린트**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS. (`LEGAL_BOARD` 상수는 community.ts에 이미 있다 — 없으면 `"legal"` 리터럴로 대체.)

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/support.ts packages/api/src/routers/bambi/community.ts packages/api/src/routers/bambi/reviews.ts`

- [ ] **Step 8: 커밋(컨트롤러)** — 보고 후 종료.

---

### Task 7: 팀·조직 개인 알림 — 초대 승인/반려, 구성원 제거·역할 변경·소유권 이전

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts` (import · `rejectTeamInvitation` L904-933 · `acceptTeamInvitation` L935-1033 · `setEmployerVerificationStatus` L2453-2497)
- Modify: `packages/api/src/routers/bambi/teams.ts` (import · `setMemberRole` L552-608 · `transferOwnership` L613-679 · `removeMember` L681~)

**Interfaces:**
- Consumes: `notifyBambiNotification`
- Produces: 없음(호출부만)

- [ ] **Step 1: moderation.ts import 추가**

```ts
import { notifyBambiNotification } from "../../services/bambi-notifications";
```

- [ ] **Step 2: 팀 초대 반려 알림** — `rejectTeamInvitation` 헬퍼의 `return updated;`(L932) **앞**에 삽입한다. 이 헬퍼는 트랜잭션 안에서 돌지만, `notifyBambiNotification`은 자체 try/catch로 절대 던지지 않으므로 트랜잭션을 깨지 않는다.

```ts
	// 반려는 초대를 낸 사람이 알아야 한다(초대 대상은 아직 아무 관계도 없다).
	await notifyBambiNotification({
		actorUserId: adminUserId,
		metadata: {
			action: "rejected",
			organizationId: invite.organizationId,
			reason: reason ?? null,
		},
		recipientUserId: invite.inviterId,
		targetId: invite.id,
		targetType: "team_invitation",
	});

```

- [ ] **Step 3: 팀 초대 승인 알림** — `acceptTeamInvitation` 헬퍼의 `return updated;`(L1032) **앞**에 삽입한다. 합류 대상 계정은 L945-955에서 이미 조회돼 있다(`invitee.userId`) — 훅으로 다시 조회하지 않는다.

```ts
	// 승인은 합류된 구인자 본인에게 알린다. 초대자는 조직 설정 화면에서 바로 확인한다.
	await notifyBambiNotification({
		actorUserId: adminUserId,
		metadata: { action: "accepted", organizationId: invite.organizationId },
		recipientUserId: invitee.userId,
		targetId: invite.id,
		targetType: "team_invitation",
	});

```

- [ ] **Step 4: 사업자 인증 승인/반려 알림** — `setEmployerVerificationStatus`의 `return updated;`(L2495) **앞**에 삽입한다. owner는 L2459-2468에서 이미 조회돼 있다.

```ts
				// owner가 없는 조직(멤버 정리 중)이면 수신자가 없어 조용히 생략된다.
				await notifyBambiNotification({
					actorUserId: admin.userId,
					metadata: {
						action: input.status,
						organizationId: input.organizationId,
						reason: input.reason ?? null,
					},
					recipientUserId: owner?.userId ?? null,
					targetId: input.organizationId,
					targetType: "employer_verification",
				});

```

- [ ] **Step 5: teams.ts import 추가**

```ts
import { notifyBambiNotification } from "../../services/bambi-notifications";
```

- [ ] **Step 6: 역할 변경 알림** — `teams.ts` `setMemberRole`의 대상 조회(L564-573)에 `userId`를 추가하고, `return updated;`(L607) 앞에 알림을 넣는다.

SELECT 교체:

```ts
			const [targetMember] = await db
				.select({
					id: member.id,
					role: member.role,
					// 권한 변경은 당사자가 알아야 한다(화면에는 owner만 보이는 정보다).
					userId: member.userId,
				})
				.from(member)
				.where(
					and(
						eq(member.id, input.memberId),
						eq(member.organizationId, input.organizationId)
					)
				)
				.limit(1);
```

`return updated;` 앞에 삽입:

```ts
			await notifyBambiNotification({
				actorUserId: profile.userId,
				metadata: {
					action: "role_changed",
					organizationId: input.organizationId,
					role: normalizedRole,
				},
				recipientUserId: targetMember.userId,
				targetId: input.memberId,
				targetType: "organization_member",
			});

```

- [ ] **Step 7: 소유권 이전 알림** — `transferOwnership`의 대상 조회(L642-651)에 `userId`를 추가하고, `return { success: true };`(L678) 앞에 알림을 넣는다.

SELECT 교체:

```ts
			const [targetMember] = await db
				.select({ id: member.id, status: member.status, userId: member.userId })
				.from(member)
				.where(
					and(
						eq(member.id, input.memberId),
						eq(member.organizationId, input.organizationId)
					)
				)
				.limit(1);
```

`return { success: true };` 앞에 삽입:

```ts
		await notifyBambiNotification({
			actorUserId: profile.userId,
			metadata: {
				action: "ownership_transferred",
				organizationId: input.organizationId,
			},
			recipientUserId: targetMember.userId,
			targetId: input.memberId,
			targetType: "organization_member",
		});

```

- [ ] **Step 8: 구성원 제거 알림** — `removeMember`의 트랜잭션(`await db.transaction(async (tx) => {...})`)이 끝난 **직후**, 핸들러의 반환문 앞에 삽입한다. `targetMember.userId`는 L693-702에서 이미 조회돼 있다(nullable).

```ts
		// 내보내진 사람은 화면에서 사라지므로 알림 말고는 알 방법이 없다.
		await notifyBambiNotification({
			actorUserId: profile.userId,
			metadata: {
				action: "removed",
				organizationId: input.organizationId,
			},
			recipientUserId: targetMember.userId,
			targetId: input.memberId,
			targetType: "organization_member",
		});

```

- [ ] **Step 9: 타입 체크 + 린트**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS.

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/teams.ts`

- [ ] **Step 10: 커밋(컨트롤러)** — 보고 후 종료.

---

### Task 8: 운영자 조치 알림 삽입 — `notifyModerationAction` 13개 지점

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts` (`adminUpdateJobPost` L1235 · `adminDeleteJobPost` L1273 · `setReviewStatus` L1457 · `bulkSetReviewStatus` L1485 · `setReportStatus` L1520 · `bulkSetReportStatus` L1549 · `setJobPostStatus` L1584 · `setJobPostPayment` L1628 · `adjustJobPostExposure` L1695 · `bulkSetJobPostStatus` L1797 · `bulkSetJobPostPayment` L1846)
- Modify: `packages/api/src/routers/bambi/community.ts` (`setPostStatusByAdmin` L1536 · `setCommentStatusByAdmin` L1592)

**Interfaces:**
- Consumes: `notifyModerationAction`(Task 3), 기존 `BulkModerationResult`(`services/bambi-moderation-bulk`)
- Produces: 없음(호출부만)

**공통 규칙(모든 삽입에 적용):**
1. 알림은 **트랜잭션 밖**에서 부른다 — 트랜잭션 안이면 알림 조회가 tx 커넥션을 잡고, 실패 시 조치까지 되돌아간다. `return await db.transaction(...)` 형태는 `const updated = await db.transaction(...);` → 알림 → `return updated;`로 바꾼다.
2. `action`은 감사 로그(`adminModerationAction.action`)에 넣는 문자열과 **같은 값**을 넘긴다.
3. 대상 삭제(하드 delete) 지점은 삭제 **전에** 소유자를 알 수 없으므로 알림도 삭제 전에 부른다.
4. 일괄(bulk) 처리는 **성공한 대상에게만** 알린다 — `executeBulkModeration`은 항목별로 실패를 모아 `failures[].targetId`로 돌려준다(정원 초과 CONFLICT 등). 실패 건까지 알리면 "승인됐다"는 거짓 알림이 나간다.

**알림을 만들지 않는 운영자 조치(스펙 §3 "제외" 근거 — 건드리지 말 것):** `setUserStatus`·`bulkSetUserStatus`·`setUserRole`(계정 경고·정지는 `getMine`의 `accountSanction` 배너가 이미 전달한다), `setChatRoomBlocked`(화면에서 즉시 보인다), `setInquiryStatusByAdmin`·`setInquiryMessageStatusByAdmin`(문의 종료·숨김은 알리면 안 되는 정책이거나 스팸성), `setTeamInvitationStatus`(Task 7의 accept/reject 헬퍼가 이미 알린다 — 여기서 또 부르면 중복).

- [ ] **Step 1: moderation.ts import + bulk 성공분 헬퍼 추가** — import를 추가하고, `type ModerationTx = ...`(L901) 근처 모듈 최상단 헬퍼 구역에 필터 하나를 둔다.

```ts
import { notifyModerationAction } from "../../services/bambi-notifications";
```

```ts
/** 일괄 처리에서 실제로 성공한 대상만 남긴다 — 실패 건에 "처리됨" 알림이 나가면 안 된다. */
const succeededBulkTargetIds = (
	targetIds: readonly string[],
	result: { failures: { targetId: string }[] }
): string[] => {
	const failed = new Set(result.failures.map((failure) => failure.targetId));
	return targetIds.filter((targetId) => !failed.has(targetId));
};
```

- [ ] **Step 2: 공고 검수 상태(`setJobPostStatus`)** — L1589의 `return await db.transaction(async (tx) => {` 를 `const updated = await db.transaction(async (tx) => {`로 바꾸고, 트랜잭션 닫는 `});` 다음에 아래를 넣은 뒤 `return updated;`로 끝낸다.

```ts
			await notifyModerationAction({
				action: `set_status:${input.status}`,
				actorUserId: admin.userId,
				reason: input.reason,
				targetId: input.jobPostId,
				targetType: "job_post",
			});

			return updated;
```

- [ ] **Step 3: 공고 결제 승인(`setJobPostPayment`)** — `syncAdvertiserFlagForOrganization({...})` 호출(L1683-1686) 다음, `return updated;`(L1688) 앞에 삽입한다.

```ts
			// unpaid→paid가 노출 개시라, 구인자에게는 "광고가 시작됐다"는 유일한 신호다.
			await notifyModerationAction({
				action: `set_payment:${input.paymentStatus}`,
				actorUserId: (await requireAdminProfile(context.session)).userId,
				metadata: { paymentStatus: input.paymentStatus },
				targetId: input.jobPostId,
				targetType: "job_post",
			});
```

`setJobPostPayment`는 현재 `await requireAdminProfile(context.session);`(L1631)의 결과를 버리고 있다. 위 인라인 호출 대신 L1631을 `const admin = await requireAdminProfile(context.session);`로 바꾸고 `actorUserId: admin.userId`를 쓴다.

- [ ] **Step 4: 노출 조정(`adjustJobPostExposure`)** — `syncAdvertiserFlagForOrganization({...})`(L1748-1751) 다음, `return updated;`(L1753) 앞에 삽입한다.

```ts
			await notifyModerationAction({
				action: `adjust_job_post_exposure:${input.days > 0 ? "+" : ""}${input.days}`,
				actorUserId: admin.userId,
				metadata: { days: input.days },
				reason: input.reason,
				targetId: input.jobPostId,
				targetType: "job_post",
			});
```

- [ ] **Step 5: 운영자 공고 수정(`adminUpdateJobPost`)** — 감사 로그 insert(L1259-1265) 다음, `return result;`(L1267) 앞에 삽입한다.

```ts
			await notifyModerationAction({
				action: "edit_job_post",
				actorUserId: admin.userId,
				reason: "운영자 공고 수정",
				targetId: input.jobPostId,
				targetType: "job_post",
			});
```

- [ ] **Step 6: 운영자 공고 삭제(`adminDeleteJobPost`)** — 소유자 조회가 삭제 뒤에는 불가능하므로, `const storageKeys = await getJobPostMediaStorageKeys(input.jobPostId);`(L1293) **앞**에 삽입한다.

```ts
			// 행이 사라지면 소유자를 알 수 없다 — 삭제 전에 알린다.
			await notifyModerationAction({
				action: "hard_delete",
				actorUserId: admin.userId,
				reason: input.reason,
				targetId: input.jobPostId,
				targetType: "job_post",
			});
```

- [ ] **Step 7: 후기 상태(`setReviewStatus`)** — L1462 `return await db.transaction(...)`를 `const updated = await db.transaction(...)`로 바꾸고, 그 뒤에 삽입 후 `return updated;`.

```ts
			await notifyModerationAction({
				action: `set_status:${input.status}`,
				actorUserId: admin.userId,
				reason: input.reason,
				targetId: input.reviewId,
				targetType: "review",
			});

			return updated;
```

- [ ] **Step 8: 후기 일괄(`bulkSetReviewStatus`)** — L1490 `return await db.transaction(...)`를 `const result = await db.transaction(...)`로 바꾸고, 그 뒤에 삽입 후 `return result;`.

```ts
			// 알림은 트랜잭션 밖에서 성공분에만 보낸다(항목별 실패가 섞인다).
			for (const reviewId of succeededBulkTargetIds(input.reviewIds, result)) {
				await notifyModerationAction({
					action: `set_status:${input.status}`,
					actorUserId: admin.userId,
					metadata: { bulk: true },
					reason: input.reason,
					targetId: reviewId,
					targetType: "review",
				});
			}

			return result;
```

- [ ] **Step 9: 신고 처리 결과(`setReportStatus`)** — L1525 `return await db.transaction(...)`를 `const updated = await db.transaction(...)`로 바꾸고, 그 뒤에 삽입 후 `return updated;`. **주의**: 여기의 알림 대상은 신고당한 콘텐츠가 아니라 **신고자**이므로 `targetType: "report"`, `targetId: input.reportId`다.

```ts
			await notifyModerationAction({
				action: `set_report_status:${input.status}`,
				actorUserId: admin.userId,
				reason: input.reason,
				targetId: input.reportId,
				targetType: "report",
			});

			return updated;
```

- [ ] **Step 10: 신고 일괄(`bulkSetReportStatus`)** — L1554 `return await db.transaction(...)`를 `const result = await db.transaction(...)`로 바꾸고, 그 뒤에 삽입 후 `return result;`.

```ts
			for (const reportId of succeededBulkTargetIds(input.reportIds, result)) {
				await notifyModerationAction({
					action: `set_report_status:${input.status}`,
					actorUserId: admin.userId,
					metadata: { bulk: true },
					reason: input.reason,
					targetId: reportId,
					targetType: "report",
				});
			}

			return result;
```

- [ ] **Step 10-a: 공고 검수 일괄(`bulkSetJobPostStatus`, L1797)** — L1802 `return await db.transaction(` 를 `const result = await db.transaction(`로 바꾸고, 트랜잭션 뒤에 삽입 후 `return result;`.

```ts
			for (const jobPostId of succeededBulkTargetIds(input.jobPostIds, result)) {
				await notifyModerationAction({
					action: `set_status:${input.status}`,
					actorUserId: admin.userId,
					metadata: { bulk: true },
					reason: input.reason,
					targetId: jobPostId,
					targetType: "job_post",
				});
			}

			return result;
```

- [ ] **Step 10-b: 공고 결제 일괄(`bulkSetJobPostPayment`, L1846)** — 이 핸들러는 이미 `const result = await db.transaction(...)` 형태다. `syncAdvertiserFlagForOrganization` 루프(L1909-1912) 다음, `return result;`(L1914) 앞에 삽입한다. L1849의 `await requireAdminProfile(context.session);`는 결과를 버리고 있으므로 `const admin = await requireAdminProfile(context.session);`로 바꾼다.

```ts
			// 정원 초과로 CONFLICT 난 공고는 승인되지 않았다 — 성공분에만 "노출 개시"를 알린다.
			for (const jobPostId of succeededBulkTargetIds(input.jobPostIds, result)) {
				await notifyModerationAction({
					action: `set_payment:${input.paymentStatus}`,
					actorUserId: admin.userId,
					metadata: { bulk: true, paymentStatus: input.paymentStatus },
					targetId: jobPostId,
					targetType: "job_post",
				});
			}
```

- [ ] **Step 11: 커뮤니티 글 숨김·삭제(`setPostStatusByAdmin`)** — `packages/api/src/routers/bambi/community.ts` L1541 `return await db.transaction(async (tx) => {`를 `const result = await db.transaction(async (tx) => {`로 바꾸고, 트랜잭션 뒤에 삽입 후 `return result;`. 알림 이전에 board·postId를 metadata에 실어야 딥링크가 만들어진다 — 트랜잭션 안 `existing` SELECT(L1544-1548)에 `board`를 추가한다.

SELECT 교체:

```ts
				const [existing] = await tx
					.select({
						// 알림 딥링크(/seeker/community/{slug}/{postId})에 필요하다.
						board: communityPost.board,
						status: communityPost.status,
					})
					.from(communityPost)
					.where(eq(communityPost.id, input.postId))
					.limit(1);
```

트랜잭션이 `{ board: existing.board, id, status }`를 반환하도록 마지막 return을 바꾸고, 트랜잭션 뒤에:

```ts
			await notifyModerationAction({
				action: `set_community_post_status:${input.status}`,
				actorUserId: admin.userId,
				metadata: { board: result.board, postId: input.postId },
				reason: input.reason,
				targetId: input.postId,
				targetType: "community_post",
			});

			return { id: result.id, status: result.status };
```

- [ ] **Step 12: 커뮤니티 댓글 숨김·삭제(`setCommentStatusByAdmin`)** — L1597 `return await db.transaction(...)`를 `const result = await db.transaction(...)`로 바꾼다. 딥링크에 필요한 board는 댓글에 없으므로 트랜잭션 안 `existing` SELECT(L1598-1605)에서 글 board를 함께 읽는다.

SELECT 교체:

```ts
				const [existing] = await tx
					.select({
						// 딥링크는 글 단위다 — 댓글이 속한 글의 게시판·id가 필요하다.
						board: communityPost.board,
						postId: communityComment.postId,
						status: communityComment.status,
					})
					.from(communityComment)
					.innerJoin(
						communityPost,
						eq(communityPost.id, communityComment.postId)
					)
					.where(eq(communityComment.id, input.commentId))
					.limit(1);
```

트랜잭션이 `{ board: existing.board, id, postId: existing.postId, status }`를 반환하게 하고, 트랜잭션 뒤에:

```ts
			await notifyModerationAction({
				action: `set_community_comment_status:${input.status}`,
				actorUserId: admin.userId,
				metadata: { board: result.board, postId: result.postId },
				reason: input.reason,
				targetId: input.commentId,
				targetType: "community_comment",
			});

			return { id: result.id, status: result.status };
```

- [ ] **Step 13: community.ts import 확인** — Task 6에서 이미 `notifyBambiNotification`을 넣었다. 여기에 추가:

```ts
import { notifyModerationAction } from "../../services/bambi-notifications";
```

- [ ] **Step 14: 타입 체크 + 린트**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS. 반환 타입이 바뀐 두 커뮤니티 프로시저는 외부 응답 형태(`{ id, status }`)가 그대로라 웹 타입도 안 깨진다 — `pnpm --filter web check-types`로 함께 확인한다.

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/community.ts`

- [ ] **Step 15: 커밋(컨트롤러)** — 보고 후 종료.

---

### Task 9: 운영자 공유 알림 — 새 심사거리 도착 7종

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` (import · `create` L1607-1727)
- Modify: `packages/api/src/routers/bambi/support.ts` (`createInquiry` L134-167)
- Modify: `packages/api/src/routers/bambi/moderation.ts` (`createReport` L1036-1113)
- Modify: `packages/api/src/routers/bambi/onboarding.ts` (import · `submitEmployerBusinessInfo` L1084~ 두 반환 지점)
- Modify: `packages/api/src/routers/bambi/teams.ts` (`inviteMember` L342-391 · `resubmitInvitation` L393-438)
- Modify: `packages/api/src/routers/bambi/reviews.ts` (`create` — 심사 대기 분기)

**Interfaces:**
- Consumes: `notifyBambiNotification`
- Produces: 없음(호출부만). 전부 `recipientRole: "admin"` 공유 1행 + `metadata.action: "submitted" | "replied"`.

- [ ] **Step 1: 새 공고 검수 대기** — `packages/api/src/routers/bambi/jobs.ts` import 추가 후, `create` 트랜잭션의 `return { ...created, media: toJobPostMediaSet(insertedMedia) };`(L1722-1725)를 아래처럼 바꿔 커밋 뒤에 알린다.

```ts
import { notifyBambiNotification } from "../../services/bambi-notifications";
```

```ts
			const result = await db.transaction(async (tx) => {
				// ... 기존 트랜잭션 본문 그대로 ...
				return {
					...created,
					media: toJobPostMediaSet(insertedMedia),
				};
			});

			// 모든 공고는 예외 없이 pending_review로 들어온다(L1670) — 운영자 검수 큐에
			// 새 건이 쌓였다는 신호다. 개인 수신자가 없으니 role 공유 1행.
			await notifyBambiNotification({
				actorUserId: actor.userId,
				metadata: { action: "submitted", organizationId: input.organizationId },
				recipientRole: "admin",
				targetId: result.id,
				targetType: "job_post",
			});

			return result;
```

**반려 후 재제출 지점**: `jobs.update`는 `applyJobPostUpdate`를 거쳐 상태가 `pending_review`로 돌아간다. `update` 핸들러의 반환 앞에 아래를 추가한다(상태가 실제로 검수 대기로 바뀐 경우에만).

```ts
			// 반려 공고를 고쳐 다시 낸 경우도 새 검수거리다. 게시 중 공고의 단순 수정
			// (상태 불변)까지 알리면 큐가 소음으로 찬다 — 전이가 일어난 경우만 보낸다.
			if (existing.status !== "pending_review" && result.status === "pending_review") {
				await notifyBambiNotification({
					actorUserId: actor.userId,
					metadata: { action: "submitted", organizationId: existing.organizationId },
					recipientRole: "admin",
					targetId: existing.id,
					targetType: "job_post",
				});
			}
```

`applyJobPostUpdate`의 반환값이 `status`를 포함하지 않으면 `const result = await applyJobPostUpdate({...});` 이후 상태를 조회하지 말고 `getJobPostModerationStatusPatch` 결과 대신 반환 객체의 `status` 필드를 쓴다. 반환 타입에 `status`가 없으면 이 블록은 `result.status` 대신 아래로 대체한다.

```ts
			const [afterUpdate] = await db
				.select({ status: jobPost.status })
				.from(jobPost)
				.where(eq(jobPost.id, existing.id))
				.limit(1);

			if (
				existing.status !== "pending_review" &&
				afterUpdate?.status === "pending_review"
			) {
				// ... 위 notifyBambiNotification 호출 ...
			}
```

- [ ] **Step 2: 새 1:1 문의 접수** — `packages/api/src/routers/bambi/support.ts` `createInquiry`의 `return { id: created.id };`(L166) 앞에 삽입한다(import는 Task 6에서 이미 추가됨).

```ts
			await notifyBambiNotification({
				actorUserId: profile.userId,
				metadata: { action: "submitted", category: input.category },
				recipientRole: "admin",
				targetId: created.id,
				targetType: "support_inquiry",
			});
```

- [ ] **Step 3: 새 신고 접수** — `packages/api/src/routers/bambi/moderation.ts` `createReport`의 `return created;`(L1112) 앞에 삽입한다. 멱등 반환 경로(L1097-1099 `if (existing) return existing;`)에는 넣지 않는다 — 같은 신고로 큐를 두 번 울리지 않는다.

```ts
			await notifyBambiNotification({
				actorUserId: profile.userId,
				metadata: {
					action: "submitted",
					reason: input.reason,
					reportTargetType: input.targetType,
				},
				recipientRole: "admin",
				targetId: created?.id ?? input.targetId,
				targetType: "report",
			});
```

- [ ] **Step 4: 사업자 인증 제출/재제출** — `packages/api/src/routers/bambi/onboarding.ts` import 추가 후, `submitEmployerBusinessInfo`의 **pending을 반환하는 모든 지점**(기존 조직 갱신 경로 L1169-1172, 신규 조직 생성 경로의 반환) 앞에 삽입한다. verified 유지 경로(L1142-1147)에는 넣지 않는다 — 심사거리가 아니다.

```ts
import { notifyBambiNotification } from "../../services/bambi-notifications";
```

```ts
				await notifyBambiNotification({
					actorUserId: userId,
					metadata: {
						action: "submitted",
						organizationId: ownedOrg.organizationId,
					},
					recipientRole: "admin",
					targetId: ownedOrg.organizationId,
					targetType: "employer_verification",
				});

```

신규 조직 경로에서는 `ownedOrg.organizationId` 대신 그 경로에서 만들어진 조직 id를 쓴다.

- [ ] **Step 5: 팀 초대 심사 요청** — `packages/api/src/routers/bambi/teams.ts` `inviteMember`의 `return created;`(L390) 앞, `resubmitInvitation`의 `return updated;`(L437) 앞에 각각 삽입한다(import는 Task 7에서 이미 추가됨).

```ts
			await notifyBambiNotification({
				actorUserId: profile.userId,
				metadata: { action: "submitted", organizationId: input.organizationId },
				recipientRole: "admin",
				targetId: created.id,
				targetType: "team_invitation",
			});
```

`resubmitInvitation`에서는 `targetId: input.invitationId`를 쓴다.

- [ ] **Step 6: 리뷰 심사 대기** — `packages/api/src/routers/bambi/reviews.ts` `create`의 Task 6에서 넣은 `published` 분기 **다음**에 붙인다.

```ts
			// 정책 판정이 심사 대기면 구인자 알림 대신 운영자 큐로 보낸다(둘은 배타적이다).
			if (created && created.status === "pending_review") {
				await notifyBambiNotification({
					actorUserId: profile.userId,
					metadata: { action: "submitted", jobPostId: room.jobPostId },
					recipientRole: "admin",
					targetId: created.id,
					targetType: "review",
				});
			}
```

- [ ] **Step 7: 타입 체크 + 린트**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS.

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/jobs.ts packages/api/src/routers/bambi/support.ts packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/teams.ts packages/api/src/routers/bambi/reviews.ts`

- [ ] **Step 8: 커버리지 자가 점검** — 스펙 §3의 4개 표를 열고 각 행의 발생 지점이 실제로 알림을 부르는지 grep으로 확인한다.

Run: `pnpm exec rg -n "notifyBambiNotification|notifyModerationAction" packages/api/src/routers/bambi`
Expected: chats 3 · support 3 · community 4(createPost·createComment 루프·setPostStatusByAdmin·setCommentStatusByAdmin) · reviews 3 · teams 5 · onboarding 2 · jobs 2 · moderation 15(단건 job_post 3 + 일괄 job_post 2 + review 2 + report 2 + 팀 초대 2 + 사업자 인증 1 + 새 신고 1 + 공고 수정·삭제 2) 지점.

- [ ] **Step 9: 커밋(컨트롤러)** — 보고 후 종료.

---

### Task 10: 웹 라벨·딥링크 순수 맵 `notification-labels.ts`

**Files:**
- Create: `apps/web/src/lib/bambi/notification-labels.ts`
- Create: `apps/web/src/lib/bambi/notification-labels.test.ts`

**Interfaces:**
- Consumes: `COMMUNITY_BOARDS`·`communityPostPath`(`@/lib/bambi/community`)
- Produces:
  - `interface BambiNotificationView { chatRoomId: null | string; metadata: Record<string, unknown> | null; recipientRole: null | string; targetId: string; targetType: string }`
  - `notificationTitle(item: BambiNotificationView): string`
  - `notificationBody(item: BambiNotificationView): null | string` — 반려·숨김류의 `metadata.reason`
  - `notificationHref(item: BambiNotificationView): string`
  - `NOTIFICATIONS_HREF = "/seeker/notifications"`

**설계 메모(스펙 §4에서의 의도적 정제):** 커뮤니티 딥링크는 스펙의 `/board/{board}/{postId}`(공개 SEO 영역) 대신 **회원 영역** `/seeker/community/{slug}/{postId}`(`communityPostPath`)를 쓴다 — 알림 수신자는 정의상 항상 로그인 회원이고(게스트는 `actor_user_id` NOT NULL로 구조상 제외), 회원 셸이 그들의 내비·권한 게이트가 있는 곳이다. 게시판 key(`work_talk`)와 URL slug(`work-talk`)가 달라 slug 변환도 이 맵이 담당한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/web/src/lib/bambi/notification-labels.test.ts`

```ts
import { describe, expect, it } from "vitest";

import {
	notificationBody,
	notificationHref,
	notificationTitle,
} from "./notification-labels";

const view = (
	overrides: Partial<Parameters<typeof notificationTitle>[0]>
): Parameters<typeof notificationTitle>[0] => ({
	chatRoomId: null,
	metadata: null,
	recipientRole: null,
	targetId: "target-1",
	targetType: "job_post",
	...overrides,
});

describe("notificationTitle", () => {
	it("면접 상태별로 다른 문구를 낸다", () => {
		expect(
			notificationTitle(
				view({ metadata: { action: "proposed" }, targetType: "interview_schedule" })
			)
		).toBe("면접 제안이 도착했어요");
		expect(
			notificationTitle(
				view({ metadata: { action: "confirmed" }, targetType: "interview_schedule" })
			)
		).toBe("면접 일정이 확정됐어요");
	});

	it("같은 targetType이라도 운영자 공유 행은 큐 문구로 바뀐다", () => {
		expect(
			notificationTitle(
				view({ metadata: { action: "submitted" }, recipientRole: "admin" })
			)
		).toBe("새 공고 검수 요청이 들어왔어요");
		expect(
			notificationTitle(view({ metadata: { action: "set_status:rejected" } }))
		).toBe("공고가 반려됐어요");
	});

	it("모르는 targetType·action도 enum 원값을 노출하지 않는다", () => {
		expect(notificationTitle(view({ targetType: "brand_new_thing" }))).toBe(
			"새 알림이 도착했어요"
		);
	});
});

describe("notificationBody", () => {
	it("반려 사유를 본문으로 보여준다", () => {
		expect(
			notificationBody(view({ metadata: { action: "set_status:rejected", reason: "사진 미비" } }))
		).toBe("사진 미비");
	});

	it("사유가 없으면 본문도 없다", () => {
		expect(notificationBody(view({ metadata: { action: "submitted" } }))).toBeNull();
		expect(notificationBody(view({ metadata: null }))).toBeNull();
	});
});

describe("notificationHref", () => {
	it("채팅 축 알림은 그 방으로 보낸다", () => {
		expect(
			notificationHref(
				view({ chatRoomId: "room-1", targetType: "interview_schedule" })
			)
		).toBe("/seeker/chats/room-1");
	});

	it("방 정보가 없으면 채팅 목록으로 폴백한다", () => {
		expect(notificationHref(view({ targetType: "contact_reveal" }))).toBe(
			"/seeker/chats"
		);
	});

	it("커뮤니티 알림은 게시판 key를 URL slug로 바꿔 회원 영역으로 보낸다", () => {
		expect(
			notificationHref(
				view({
					metadata: { board: "work_talk", postId: "post-1" },
					targetType: "community_comment",
				})
			)
		).toBe("/seeker/community/work-talk/post-1");
	});

	it("운영자 공유 행은 같은 targetType이라도 운영자 큐로 보낸다", () => {
		expect(
			notificationHref(view({ recipientRole: "admin", targetType: "job_post" }))
		).toBe("/moderator/jobs");
		expect(
			notificationHref(
				view({ recipientRole: "admin", targetType: "support_inquiry" })
			)
		).toBe("/moderator/support");
	});

	it("공고 결제 승인은 광고 관리로, 그 외 공고 조치는 수정 화면으로 보낸다", () => {
		expect(
			notificationHref(view({ metadata: { action: "set_payment:paid" } }))
		).toBe("/employer/promotions");
		expect(
			notificationHref(view({ metadata: { action: "set_status:rejected" } }))
		).toBe("/employer/jobs/target-1/edit");
	});

	it("모르는 targetType은 알림함에 머문다", () => {
		expect(notificationHref(view({ targetType: "brand_new_thing" }))).toBe(
			"/seeker/notifications"
		);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/notification-labels.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `apps/web/src/lib/bambi/notification-labels.ts`

```ts
// 알림 한 건을 화면 문구·딥링크로 바꾸는 순수 맵. DB enum(target_type)과 metadata.action이
// 그대로 렌더되지 않도록 표시는 전부 여기를 거친다 — 모르는 값에도 중립 폴백이 있어
// 서버가 먼저 새 값을 내려도 원값이 화면에 새지 않는다(report-labels.ts와 같은 관례).

import { COMMUNITY_BOARDS, communityPostPath } from "./community";

export const NOTIFICATIONS_HREF = "/seeker/notifications";

export interface BambiNotificationView {
	chatRoomId: null | string;
	metadata: Record<string, unknown> | null;
	/** 채워져 있으면 운영자·법률자문이 공유로 받은 큐 알림이다(문구·딥링크가 갈린다). */
	recipientRole: null | string;
	targetId: string;
	targetType: string;
}

const readString = (
	metadata: Record<string, unknown> | null,
	key: string
): null | string => {
	const value = metadata?.[key];
	return typeof value === "string" && value.length > 0 ? value : null;
};

const action = (item: BambiNotificationView): string =>
	readString(item.metadata, "action") ?? "";

const isShared = (item: BambiNotificationView): boolean =>
	item.recipientRole !== null;

// (targetType, action) 조합 문구. 조합이 없으면 targetType 기본 문구로 떨어진다.
const TITLE_BY_TARGET_AND_ACTION: Record<string, string> = {
	"community_comment:reply": "내 댓글에 답글이 달렸어요",
	"community_comment:set_community_comment_status:deleted": "내 댓글이 삭제됐어요",
	"community_comment:set_community_comment_status:hidden": "내 댓글이 숨김 처리됐어요",
	"community_post:comment": "내 글에 새 댓글이 달렸어요",
	"community_post:set_community_post_status:deleted": "내 글이 삭제됐어요",
	"community_post:set_community_post_status:hidden": "내 글이 숨김 처리됐어요",
	"employer_verification:rejected": "사업자 인증이 반려됐어요",
	"employer_verification:verified": "사업자 인증이 승인됐어요",
	"interview_schedule:canceled": "면접이 취소됐어요",
	"interview_schedule:completed": "면접이 완료 처리됐어요",
	"interview_schedule:confirmed": "면접 일정이 확정됐어요",
	"interview_schedule:declined": "면접 제안이 거절됐어요",
	"interview_schedule:proposed": "면접 제안이 도착했어요",
	"job_post:adjust_job_post_exposure": "공고 노출 기간이 조정됐어요",
	"job_post:edit_job_post": "운영자가 내 공고를 수정했어요",
	"job_post:hard_delete": "내 공고가 삭제됐어요",
	"job_post:set_payment:paid": "공고 결제가 승인돼 노출이 시작됐어요",
	"job_post:set_status:hidden": "공고가 숨김 처리됐어요",
	"job_post:set_status:on_hold": "공고 검수가 보류됐어요",
	"job_post:set_status:published": "공고가 승인돼 게시됐어요",
	"job_post:set_status:rejected": "공고가 반려됐어요",
	"organization_member:ownership_transferred": "조직 소유권을 넘겨받았어요",
	"organization_member:removed": "조직에서 제외됐어요",
	"organization_member:role_changed": "조직 내 권한이 변경됐어요",
	"review:set_status:hidden": "내 후기가 숨김 처리됐어요",
	"review:set_status:published": "내 후기가 게시됐어요",
	"support_inquiry:answered": "문의에 답변이 도착했어요",
	"team_invitation:accepted": "팀 합류가 승인됐어요",
	"team_invitation:rejected": "팀 초대가 반려됐어요",
};

// 운영자·법률자문이 공유로 받는 큐 문구. 같은 targetType이라도 "내 것이 처리됐다"가
// 아니라 "새 처리거리가 왔다"로 읽혀야 한다.
const SHARED_TITLE_BY_TARGET: Record<string, string> = {
	community_post: "법률 자문 새 글이 등록됐어요",
	employer_verification: "사업자 인증 심사 요청이 들어왔어요",
	job_post: "새 공고 검수 요청이 들어왔어요",
	report: "새 신고가 접수됐어요",
	review: "후기 심사 요청이 들어왔어요",
	support_inquiry: "새 1:1 문의가 접수됐어요",
	team_invitation: "팀 초대 심사 요청이 들어왔어요",
};

const TITLE_BY_TARGET: Record<string, string> = {
	chat_message: "새 메시지가 도착했어요",
	chat_room: "새 채팅이 시작됐어요",
	community_comment: "댓글에 변동이 있어요",
	community_post: "내 글에 변동이 있어요",
	contact_reveal: "연락처가 공개됐어요",
	employer_verification: "사업자 인증 상태가 변경됐어요",
	interview_schedule: "면접 일정에 변동이 있어요",
	job_post: "공고 상태가 변경됐어요",
	organization_member: "조직 구성원 정보가 변경됐어요",
	report: "신고 처리 결과가 나왔어요",
	review: "후기 상태가 변경됐어요",
	support_inquiry: "문의에 변동이 있어요",
	team_invitation: "팀 초대에 변동이 있어요",
};

export function notificationTitle(item: BambiNotificationView): string {
	if (isShared(item)) {
		// 문의 재질문(replied)만 공유 큐에서 문구가 갈린다.
		if (item.targetType === "support_inquiry" && action(item) === "replied") {
			return "문의자가 다시 질문했어요";
		}
		return (
			SHARED_TITLE_BY_TARGET[item.targetType] ?? "새 처리 요청이 들어왔어요"
		);
	}

	// 노출 조정은 action에 일수가 붙는다(adjust_job_post_exposure:+7) — prefix로 맞춘다.
	const rawAction = action(item);
	const normalizedAction = rawAction.startsWith("adjust_job_post_exposure")
		? "adjust_job_post_exposure"
		: rawAction;

	return (
		TITLE_BY_TARGET_AND_ACTION[`${item.targetType}:${normalizedAction}`] ??
		TITLE_BY_TARGET[item.targetType] ??
		"새 알림이 도착했어요"
	);
}

/** 반려·숨김류의 사유. 사유가 없는 이벤트는 본문 없이 제목만 보여준다. */
export function notificationBody(item: BambiNotificationView): null | string {
	return readString(item.metadata, "reason");
}

const boardSlug = (item: BambiNotificationView): null | string => {
	const board = readString(item.metadata, "board");
	return COMMUNITY_BOARDS.find((meta) => meta.key === board)?.slug ?? null;
};

const communityHref = (item: BambiNotificationView): string => {
	const slug = boardSlug(item);
	const postId = readString(item.metadata, "postId");
	return slug && postId ? communityPostPath(slug, postId) : NOTIFICATIONS_HREF;
};

const SHARED_HREF_BY_TARGET: Record<string, string> = {
	community_post: "/seeker/community/legal",
	employer_verification: "/moderator/employers",
	job_post: "/moderator/jobs",
	report: "/moderator/reports",
	review: "/moderator/reviews",
	support_inquiry: "/moderator/support",
	team_invitation: "/moderator/team-invites",
};

const jobPostHref = (item: BambiNotificationView): string => {
	const rawAction = action(item);
	// 결제 승인은 "노출이 시작됐다"는 신호라 광고 관리가 착지점이다. 하드 삭제된 공고는
	// 수정 화면이 404라 목록으로 보낸다.
	if (rawAction.startsWith("set_payment")) {
		return "/employer/promotions";
	}
	if (rawAction === "hard_delete") {
		return "/employer";
	}
	return `/employer/jobs/${item.targetId}/edit`;
};

export function notificationHref(item: BambiNotificationView): string {
	if (isShared(item)) {
		// 법률자문 공유는 운영자 콘솔이 아니라 법률 자문 게시판 글로 보낸다.
		if (item.recipientRole === "legal_advisor") {
			return communityHref(item);
		}
		return SHARED_HREF_BY_TARGET[item.targetType] ?? NOTIFICATIONS_HREF;
	}

	switch (item.targetType) {
		case "chat_message":
		case "chat_room":
		case "contact_reveal":
		case "interview_schedule":
			return item.chatRoomId
				? `/seeker/chats/${item.chatRoomId}`
				: "/seeker/chats";
		case "community_comment":
		case "community_post":
			return communityHref(item);
		case "employer_verification":
			return "/employer/settings";
		case "job_post":
			return jobPostHref(item);
		case "organization_member":
		case "team_invitation":
			return "/employer/settings/teams";
		case "report":
			return "/seeker/me/reports";
		case "review": {
			const jobPostId = readString(item.metadata, "jobPostId");
			return jobPostId ? `/seeker/jobs/${jobPostId}` : NOTIFICATIONS_HREF;
		}
		default:
			return NOTIFICATIONS_HREF;
	}
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/notification-labels.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: 린트 + 커밋(컨트롤러)**

Run: `pnpm dlx ultracite fix apps/web/src/lib/bambi/notification-labels.ts apps/web/src/lib/bambi/notification-labels.test.ts`

---

### Task 11: SSE 훅 확장 + Notification API(OS 알림)

**Files:**
- Create: `apps/web/src/lib/bambi/os-notification.ts`
- Create: `apps/web/src/lib/bambi/os-notification.test.ts`
- Modify: `apps/web/src/lib/bambi/use-bambi-notification-stream.ts` (L205-238 훅 본문)

**Interfaces:**
- Consumes: `notificationTitle`·`NOTIFICATIONS_HREF`(Task 10), `orpc.bambi.notifications.*`(Task 4)
- Produces:
  - `osNotificationPermission(): "default" | "denied" | "granted" | "unsupported"`
  - `requestOsNotificationPermission(): Promise<"default" | "denied" | "granted" | "unsupported">`
  - `showOsNotification(input: { body?: null | string; href: string; title: string }): void`

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/web/src/lib/bambi/os-notification.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { osNotificationPermission, showOsNotification } from "./os-notification";

afterEach(() => {
	vi.unstubAllGlobals();
});

const stubNotification = (permission: NotificationPermission) => {
	const constructed: { options?: NotificationOptions; title: string }[] = [];
	class FakeNotification {
		static permission = permission;
		onclick: (() => void) | null = null;
		constructor(title: string, options?: NotificationOptions) {
			constructed.push({ options, title });
		}
	}
	vi.stubGlobal("Notification", FakeNotification);
	vi.stubGlobal("window", { Notification: FakeNotification });
	return constructed;
};

describe("osNotificationPermission", () => {
	it("Notification API가 없으면 unsupported다", () => {
		vi.stubGlobal("window", {});
		expect(osNotificationPermission()).toBe("unsupported");
	});

	it("권한 상태를 그대로 돌려준다", () => {
		stubNotification("granted");
		expect(osNotificationPermission()).toBe("granted");
	});
});

describe("showOsNotification", () => {
	it("탭이 숨겨져 있고 권한이 허용이면 띄운다", () => {
		const constructed = stubNotification("granted");
		vi.stubGlobal("document", { hidden: true });

		showOsNotification({ href: "/seeker/notifications", title: "새 알림" });

		expect(constructed).toHaveLength(1);
		expect(constructed[0]?.title).toBe("새 알림");
	});

	it("탭을 보고 있으면 띄우지 않는다(화면이 이미 갱신된다)", () => {
		const constructed = stubNotification("granted");
		vi.stubGlobal("document", { hidden: false });

		showOsNotification({ href: "/seeker/notifications", title: "새 알림" });

		expect(constructed).toHaveLength(0);
	});

	it("권한이 없으면 조용히 무시한다(진입 시 강제 팝업 금지)", () => {
		const constructed = stubNotification("default");
		vi.stubGlobal("document", { hidden: true });

		expect(() =>
			showOsNotification({ href: "/seeker/notifications", title: "새 알림" })
		).not.toThrow();
		expect(constructed).toHaveLength(0);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/os-notification.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `apps/web/src/lib/bambi/os-notification.ts`

```ts
"use client";

// 브라우저 내장 Notification API 얇은 래퍼. 서비스워커·VAPID를 쓰는 진짜 Web Push는
// 의존성이 필요해 이번 범위 밖이고, 여기서는 "탭은 열려 있지만 보고 있지 않을 때"만
// OS 알림을 띄운다. 권한 요청은 알림함 화면의 안내 배너에서만 부른다 — 진입하자마자
// 권한 팝업을 띄우면 대부분 거부로 굳어 되돌릴 방법이 없다.

export type OsNotificationPermission =
	| "default"
	| "denied"
	| "granted"
	| "unsupported";

const notificationApi = (): typeof Notification | null => {
	if (typeof window === "undefined" || !("Notification" in window)) {
		return null;
	}
	return window.Notification;
};

export function osNotificationPermission(): OsNotificationPermission {
	const api = notificationApi();
	return api ? api.permission : "unsupported";
}

export async function requestOsNotificationPermission(): Promise<OsNotificationPermission> {
	const api = notificationApi();

	if (!api) {
		return "unsupported";
	}

	try {
		return await api.requestPermission();
	} catch {
		// 사용자 제스처 없이 부르면 던지는 브라우저가 있다. 배지·알림함이 정본이라
		// 여기서 실패해도 기능 손실은 없다.
		return api.permission;
	}
}

export function showOsNotification({
	body,
	href,
	title,
}: {
	body?: null | string;
	href: string;
	title: string;
}): void {
	const api = notificationApi();

	if (
		!api ||
		api.permission !== "granted" ||
		typeof document === "undefined" ||
		!document.hidden
	) {
		return;
	}

	try {
		// tag를 목적지로 두면 같은 곳으로 가는 알림이 쌓이지 않고 하나로 접힌다.
		const notification = new api(title, { body: body ?? undefined, tag: href });
		notification.onclick = () => {
			window.focus();
			window.location.assign(href);
		};
	} catch {
		// OS·브라우저 정책(집중 모드 등)으로 막히면 그대로 넘어간다.
	}
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/os-notification.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: SSE 훅 확장** — `apps/web/src/lib/bambi/use-bambi-notification-stream.ts`의 훅 본문(L199-238)을 교체한다. 파일 상단 import에 두 줄을 추가한다.

```ts
import {
	NOTIFICATIONS_HREF,
	notificationTitle,
} from "@/lib/bambi/notification-labels";
import { showOsNotification } from "@/lib/bambi/os-notification";
```

```ts
// 채팅 축 알림. 이 두 타입만 채팅 핀·목록·방 캐시를 건드린다.
const CHAT_TARGET_TYPES = new Set(["chat_message", "chat_room"]);

/**
 * 알림 SSE 구독 훅. 서버가 알림 행을 만드는 즉시 이벤트를 받아 관련 캐시를 무효화한다.
 * 채팅류는 기존대로 채팅 핀·목록·방을, 그 외는 알림함 목록·벨 배지를 갱신한다.
 * 탭을 보고 있지 않고 권한이 허용된 경우에만 OS 알림을 덧붙인다 — 토스트는 띄우지 않는다.
 */
export function useBambiNotificationStream(enabled: boolean): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const invalidate = (queryKey: QueryKey) => {
			queryClient.invalidateQueries({ queryKey }).catch(() => undefined);
		};
		const refreshChat = () => {
			invalidate(orpc.bambi.chats.unreadState.queryKey());
			invalidate(orpc.bambi.chats.listMine.queryKey());
		};
		const refreshNotifications = () => {
			invalidate(orpc.bambi.notifications.unreadCount.queryKey());
			invalidate(orpc.bambi.notifications.list.key());
		};

		return subscribeNotificationStream({
			onEvent: (event) => {
				if (CHAT_TARGET_TYPES.has(event.targetType)) {
					refreshChat();

					// 배지·목록만 갱신하면 "안 읽음 1인데 방에는 그 메시지가 없는" 상태가 된다
					// (방 소켓룸을 잃었거나 소켓과 SSE가 서로 다른 인스턴스에 붙은 경우).
					if (event.chatRoomId) {
						invalidate(
							orpc.bambi.chats.getById.key({
								input: { id: event.chatRoomId },
							})
						);
					}
					return;
				}

				refreshNotifications();
				// SSE 페이로드에는 metadata·recipientRole이 없어 targetType 기본 문구만 나온다.
				// 정확한 문구·딥링크는 알림함이 정본이라, 클릭은 알림함으로만 보낸다.
				showOsNotification({
					href: NOTIFICATIONS_HREF,
					title: notificationTitle({
						chatRoomId: event.chatRoomId,
						metadata: null,
						recipientRole: null,
						targetId: event.targetId,
						targetType: event.targetType,
					}),
				});
			},
			// 끊겨 있던 동안 놓친 알림은 재전송되지 않는다 — 재연결마다 양쪽 정본을 다시 읽는다.
			onOpen: () => {
				refreshChat();
				refreshNotifications();
			},
		});
	}, [enabled, queryClient]);
}
```

- [ ] **Step 6: 타입 체크**

Run: `pnpm --filter web check-types`
Expected: PASS. (`orpc.bambi.notifications.list.key()`는 입력 없이 전체 프리픽스를 무효화한다 — 커서별 페이지 키를 한 번에 덮는다.)

- [ ] **Step 7: 린트 + 커밋(컨트롤러)**

Run: `pnpm dlx ultracite fix apps/web/src/lib/bambi/os-notification.ts apps/web/src/lib/bambi/os-notification.test.ts apps/web/src/lib/bambi/use-bambi-notification-stream.ts`

---

### Task 12: 벨 배지 컴포넌트 + 셸 배선(데스크톱·모바일·운영자)

**Files:**
- Create: `apps/web/src/components/bambi/notification-bell.tsx`
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx` (import · `ModeratorHeaderActions` L185-204 · `HeaderRightActions` L207-234 · 모바일 헤더 L339-355)

**Interfaces:**
- Consumes: `orpc.bambi.notifications.unreadCount`(Task 4), `useBambiNotificationStream`(Task 11 — `useUnreadMessageCount`가 이미 셸에서 구독 중이라 중복 구독은 만들지 않는다)
- Produces: `<NotificationBell />` — 로그인 상태에서만 렌더, 배지 9+ 캡, 클릭 시 `/seeker/notifications`

**설계 메모:** 운영자 벨은 `ModeratorHeaderActions`(responsive-shell L194-201)에 이미 있고 이 컴포넌트가 데스크톱·모바일 양쪽에서 운영자 셸에 쓰인다 — 따라서 `persona-nav.tsx`의 `ModeratorShell`은 **손대지 않는다**(스펙 §4의 "ModeratorShell에 벨 진입점"은 이 지점으로 충족된다). 기존 벨 2곳은 onClick 없는 장식이었고, 데스크톱 비운영자 헤더에는 벨 자체가 없어 새로 넣는다.

- [ ] **Step 1: 벨 컴포넌트 구현** — `apps/web/src/components/bambi/notification-bell.tsx`

```tsx
"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { NOTIFICATIONS_HREF } from "@/lib/bambi/notification-labels";
import { orpc } from "@/utils/orpc";
import { useBambiAuth } from "./auth-client-provider";
import { BellIcon } from "./icons";

// 두 자리 배지는 아이콘 버튼 밖으로 삐져나가 헤더 정렬을 흔든다. 정확한 수보다
// "밀렸다"는 신호가 중요한 자리라 9에서 자른다(채팅 핀과 다른 축의 카운트다).
const BADGE_CAP = 9;

export function NotificationBell() {
	const { isAuthenticated } = useBambiAuth();
	const query = useQuery({
		...orpc.bambi.notifications.unreadCount.queryOptions(),
		enabled: isAuthenticated,
	});

	// 비로그인 셸에서는 눌러도 로그인 벽으로 튕기는 죽은 버튼이 된다 — 아예 감춘다.
	if (!isAuthenticated) {
		return null;
	}

	const unreadCount = query.data?.unreadCount ?? 0;
	const showBadge = unreadCount > 0;

	return (
		<span className="relative inline-flex">
			<Button
				aria-label={
					showBadge ? `알림, 읽지 않은 알림 ${unreadCount}개` : "알림"
				}
				className="bg-card"
				nativeButton={false}
				render={<Link href={NOTIFICATIONS_HREF as Route} />}
				size="icon-lg"
				variant="outline"
			>
				<BellIcon />
			</Button>
			{showBadge ? (
				<Badge className="-top-2 -right-2 absolute min-w-5 justify-center px-1 text-xs">
					{unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : unreadCount}
				</Badge>
			) : null}
		</span>
	);
}
```

- [ ] **Step 2: 셸 배선** — `apps/web/src/components/bambi/responsive-shell.tsx`

import 추가(`import { BellIcon, ShieldIcon } from "./icons";`는 `BellIcon`이 더는 쓰이지 않으면 `ShieldIcon`만 남긴다):

```ts
import { NotificationBell } from "./notification-bell";
```

`ModeratorHeaderActions`(L185-204)를 교체:

```tsx
function ModeratorHeaderActions() {
	return (
		<>
			<Badge className="h-9 gap-1.5 px-3 font-bold" variant="secondary">
				<span className="inline-flex size-3.5">
					<ShieldIcon />
				</span>
				운영자 모드
			</Badge>
			<NotificationBell />
		</>
	);
}
```

`HeaderRightActions`(L219-233)의 반환에 벨을 추가한다 — 데스크톱 비운영자 헤더에는 벨이 아예 없었다.

```tsx
	return (
		<>
			{isPublic ? null : <RoleSwitchLink />}
			{isPublic ? null : <NotificationBell />}
			{showChatButton ? <ChatNavButton withPin={!isPublic} /> : null}
			<Link
				className={cn(
					buttonVariants({ variant: isPublic ? "dark" : "outline" }),
					"h-10 px-4 font-bold text-sm no-underline"
				)}
				href={(isPublic ? "/seeker?auth=login" : "/seeker/me") as Route}
			>
				{isPublic ? "시작하기" : "내 정보"}
			</Link>
		</>
	);
```

모바일 헤더의 즉시실행 블록(L339-355)을 교체:

```tsx
					<div className="flex items-center gap-2">
						{isModerator ? <ModeratorHeaderActions /> : <NotificationBell />}
					</div>
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm --filter web check-types`
Expected: PASS. `BellIcon` import가 남아 미사용이면 ultracite가 잡는다.

- [ ] **Step 4: 린트**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/notification-bell.tsx apps/web/src/components/bambi/responsive-shell.tsx`
Expected: 미사용 import 정리 포함 PASS.

- [ ] **Step 5: 커밋(컨트롤러)** — 시각 확인은 사용자 검수 대상임을 보고에 명시.

---

### Task 13: 알림함 화면 `/seeker/notifications`

**Files:**
- Create: `apps/web/src/app/seeker/notifications/page.tsx`
- Create: `apps/web/src/components/bambi/screens/notifications-screen.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.notifications.list/markRead/markAllRead`(Task 4), `notificationTitle`·`notificationBody`·`notificationHref`(Task 10), `osNotificationPermission`·`requestOsNotificationPermission`(Task 11), 기존 `RequireAuth`·`EmptyState`
- Produces: 없음(최종 소비자)

- [ ] **Step 1: 라우트 생성** — `apps/web/src/app/seeker/notifications/page.tsx` (기존 `/seeker/me/reports/page.tsx`와 같은 얇은 형태)

```tsx
import { RequireAuth } from "@/components/bambi/require-auth";
import { NotificationsScreen } from "@/components/bambi/screens/notifications-screen";

export default function SeekerNotificationsPage() {
	return (
		<RequireAuth>
			<NotificationsScreen />
		</RequireAuth>
	);
}
```

- [ ] **Step 2: 화면 구현** — `apps/web/src/components/bambi/screens/notifications-screen.tsx`

```tsx
"use client";

// 밤비 — 전 역할 공용 알림함. 라우트는 /seeker/notifications 하나이고 구직자·구인자·
// 운영자·법률자문이 함께 쓴다(채팅 /seeker/chats/{roomId} 공유 선례와 같다).
// 운영자·법률자문의 공유 알림은 누가 확인했는지("확인: ○○")를 함께 보여준다 —
// 한 명이 확인하면 전원의 배지에서 사라지는 큐 성격을 화면에서 납득시키기 위해서다.

import { Alert, AlertDescription, AlertTitle } from "@bambi-app/ui/components/alert";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";
import {
	type BambiNotificationView,
	notificationBody,
	notificationHref,
	notificationTitle,
} from "@/lib/bambi/notification-labels";
import {
	osNotificationPermission,
	requestOsNotificationPermission,
} from "@/lib/bambi/os-notification";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 20;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Seoul",
	year: "numeric",
});

function formatNotifiedAt(value: Date | string): string {
	const parts = dateFormatter.formatToParts(new Date(value));
	const lookup = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";

	return `${lookup("year")}.${lookup("month")}.${lookup("day")} ${lookup("hour")}:${lookup("minute")}`;
}

// 진입 시 권한 팝업을 띄우지 않는다(대부분 거부로 굳는다) — 배너의 버튼을 눌렀을 때만 요청한다.
function OsNotificationBanner() {
	const [permission, setPermission] = useState<null | string>(null);

	useEffect(() => {
		setPermission(osNotificationPermission());
	}, []);

	if (permission !== "default") {
		return null;
	}

	return (
		<Alert>
			<AlertTitle>탭이 꺼져 있어도 알림을 받을 수 있어요</AlertTitle>
			<AlertDescription className="flex flex-col items-start gap-3">
				<span>
					브라우저 알림을 허용하면 다른 탭을 보고 있을 때도 새 알림을 바로
					알려드려요. 허용하지 않아도 알림함은 그대로 쓸 수 있어요.
				</span>
				<Button
					onClick={async () => {
						setPermission(await requestOsNotificationPermission());
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					브라우저 알림 허용
				</Button>
			</AlertDescription>
		</Alert>
	);
}

export function NotificationsScreen() {
	const queryClient = useQueryClient();
	const router = useRouter();

	const query = useInfiniteQuery(
		orpc.bambi.notifications.list.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as null | { createdAt: string; id: string },
			input: (cursor: null | { createdAt: string; id: string }) => ({
				cursor: cursor ?? undefined,
				limit: PAGE_SIZE,
			}),
		})
	);

	// markRead·markAllRead는 정본 안읽음 수를 함께 돌려준다 — 재조회 타이밍에 기대지 않고
	// 벨 배지 캐시를 직접 덮어 "읽었는데 핀이 남는" 상태를 원천 차단한다.
	const applyUnreadCount = (unreadCount: number) => {
		queryClient.setQueryData(
			orpc.bambi.notifications.unreadCount.queryKey(),
			{ unreadCount }
		);
		queryClient
			.invalidateQueries({ queryKey: orpc.bambi.notifications.list.key() })
			.catch(() => undefined);
	};

	const markRead = useMutation(
		orpc.bambi.notifications.markRead.mutationOptions({
			onSuccess: (result) => {
				applyUnreadCount(result.unreadCount);
			},
		})
	);

	const markAllRead = useMutation(
		orpc.bambi.notifications.markAllRead.mutationOptions({
			onError: () => {
				toast.error("알림을 확인 처리하지 못했어요");
			},
			onSuccess: (result) => {
				applyUnreadCount(result.unreadCount);
				toast.success("모든 알림을 확인했어요");
			},
		})
	);

	const items = query.data?.pages.flatMap((page) => page.items) ?? [];
	const hasUnread = items.some((item) => item.readAt === null);

	const openNotification = (item: (typeof items)[number]) => {
		if (item.readAt === null) {
			markRead.mutate({ ids: [item.id] });
		}
		router.push(notificationHref(toView(item)) as Route);
	};

	return (
		<div
			className={cn(
				"mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6",
				APP_CONTENT_WIDTH
			)}
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
					알림
				</h1>
				<Button
					disabled={!hasUnread || markAllRead.isPending}
					onClick={() => markAllRead.mutate({})}
					size="sm"
					type="button"
					variant="outline"
				>
					모두 확인
				</Button>
			</div>

			<OsNotificationBanner />

			{query.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-20 w-full rounded-xl" />
					<Skeleton className="h-20 w-full rounded-xl" />
					<Skeleton className="h-20 w-full rounded-xl" />
				</div>
			) : null}

			{query.isLoading || items.length > 0 ? null : (
				<EmptyState
					description="면접 제안·검수 결과처럼 바로 알아야 하는 소식이 여기에 쌓여요."
					title="아직 받은 알림이 없어요"
				/>
			)}

			{items.length > 0 ? (
				<ul className="flex list-none flex-col gap-3 p-0">
					{items.map((item) => {
						const view = toView(item);
						const body = notificationBody(view);
						const isUnread = item.readAt === null;

						return (
							<li key={item.id}>
								<button
									className={cn(
										"flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-secondary",
										isUnread ? "border-primary" : "border-border"
									)}
									onClick={() => openNotification(item)}
									type="button"
								>
									<div className="flex flex-wrap items-center gap-2">
										{isUnread ? <Badge>새 알림</Badge> : null}
										<span className="font-semibold text-foreground text-sm">
											{notificationTitle(view)}
										</span>
									</div>
									{body ? (
										<p className="m-0 text-muted-foreground text-sm">{body}</p>
									) : null}
									<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
										<span>{formatNotifiedAt(item.createdAt)}</span>
										{item.recipientRole && item.readByName ? (
											<span>확인: {item.readByName}</span>
										) : null}
									</div>
								</button>
							</li>
						);
					})}
				</ul>
			) : null}

			{query.hasNextPage ? (
				<Button
					className="self-center"
					disabled={query.isFetchingNextPage}
					onClick={() => {
						query.fetchNextPage().catch(() => undefined);
					}}
					type="button"
					variant="outline"
				>
					{query.isFetchingNextPage ? "불러오는 중…" : "더보기"}
				</Button>
			) : null}
		</div>
	);
}

// 서버 응답 행 → 라벨/딥링크 맵이 받는 뷰 모델. metadata는 jsonb라 unknown으로 오므로
// 여기서 한 번만 좁힌다.
function toView(item: {
	chatRoomId: null | string;
	metadata: unknown;
	recipientRole: null | string;
	targetId: string;
	targetType: string;
}): BambiNotificationView {
	return {
		chatRoomId: item.chatRoomId,
		metadata:
			item.metadata && typeof item.metadata === "object"
				? (item.metadata as Record<string, unknown>)
				: null,
		recipientRole: item.recipientRole,
		targetId: item.targetId,
		targetType: item.targetType,
	};
}
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm --filter web check-types`
Expected: PASS. `Alert`/`AlertTitle`/`AlertDescription`은 `packages/ui/src/components/alert.tsx`에 이미 설치돼 있다(추가 설치 불필요).

- [ ] **Step 4: 린트**

Run: `pnpm dlx ultracite fix apps/web/src/app/seeker/notifications/page.tsx apps/web/src/components/bambi/screens/notifications-screen.tsx`

- [ ] **Step 5: 커밋(컨트롤러)** — 시각 확인(데스크톱·모바일 폭)은 사용자 검수 대상임을 보고에 명시.

---

### Task 14: 선행 수정 확인 · 매뉴얼 동기화 · 최종 검증

**Files:**
- Modify: `docs/manual/employer-manual.md` (알림 안내 추가)
- Modify: `docs/manual/moderator-manual.md` (공유 알림 의미론 안내 추가)
- Modify: `docs/manual/seeker-manual.md`

**Interfaces:**
- Consumes: Task 1-13 전부
- Produces: 없음

- [ ] **Step 1: 선행 수정 §6-1 상태 확인(코드 변경 아님)** — 스펙 §6이 결함으로 적어 둔 "공고 반려 사유가 `listMine`에 없다"는 **이미 해소된 상태**다. 아래로 확인하고 결과를 보고에 적는다(재작업 금지).

Run: `pnpm exec rg -n "rejectionReason" packages/api/src/routers/bambi/jobs.ts apps/web/src/components/bambi/employer-jobs-columns.tsx "apps/web/src/app/employer/jobs/[id]/edit/page.tsx"`
Expected: `jobs.ts` L1532에 `rejectionReason: jobPost.rejectionReason`(커밋 4daa6c5e, PR #63), 목록 배지(`employer-jobs-columns.tsx` L51-52)와 수정 화면 Alert(L149-150) 양쪽에 표시된다. `docs/test-flows/employer-test-flow.md`의 결함 #14도 "해소"로 기록돼 있다. **추가 코드 변경 없음.**

- [ ] **Step 2: 선행 수정 §6-2 확인** — 대댓글 부모 SELECT의 `authorUserId`는 Task 6 Step 2에서 추가됐다.

Run: `pnpm exec rg -n "authorUserId: communityComment.authorUserId" packages/api/src/routers/bambi/community.ts`
Expected: `createComment`의 부모 조회에 1건 매치.

- [ ] **Step 3: 매뉴얼 동기화** — 새 기능(벨·알림함·OS 알림)을 매뉴얼에 반영한다. 각 매뉴얼의 화면 안내 톤(번호 목록 + 굵은 UI 라벨)을 그대로 따른다.

`docs/manual/employer-manual.md` — 상단 화면 안내 절에 추가:

```markdown
### 알림

- 화면 오른쪽 위(모바일은 헤더 오른쪽)의 **종 모양 버튼**을 누르면 **알림** 화면으로 갑니다. 읽지 않은 알림이 있으면 종 위에 숫자 배지가 붙습니다(9개를 넘으면 **9+**로 표시됩니다).
- 알림에는 공고 검수 승인·반려·보류, 공고 결제 승인(노출 개시), 운영자의 공고 수정·삭제·노출 조정, 사업자 인증 승인·반려, 팀 초대 승인·반려, 구성원 권한 변경·소유권 이전·제외, 새 후기 등록, 면접·연락처·문의·신고·수다방 소식이 들어옵니다.
- 알림을 누르면 자동으로 읽음 처리되고 해당 화면으로 이동합니다. 반려·숨김처럼 사유가 있는 알림은 사유가 함께 표시됩니다.
- 오른쪽 위 **모두 확인**을 누르면 목록의 안 읽은 알림이 한 번에 읽음 처리됩니다.
- 알림 화면 위에 **브라우저 알림 허용** 안내가 보이면, 눌러서 허용해 두면 다른 탭을 보고 있을 때도 새 알림을 바로 알려줍니다. 허용하지 않아도 알림함은 그대로 쓸 수 있습니다.
```

`docs/manual/moderator-manual.md` — 콘솔 안내 절에 추가:

```markdown
### 알림

- 콘솔 헤더의 **종 모양 버튼**으로 **알림** 화면에 들어갑니다. 새 공고 검수 요청, 새 1:1 문의와 재질문, 새 신고, 사업자 인증 제출, 팀 초대 심사 요청, 후기 심사 요청이 도착하면 여기에 쌓입니다.
- 운영자 알림은 **운영자 전체가 함께 보는 하나의 알림**입니다. 한 명이 알림을 열어 확인하면 다른 운영자의 배지에서도 사라지고, 알림 아래에 **확인: 확인한 사람 이름**이 표시됩니다.
- "확인"은 담당을 맡았다는 표시일 뿐이며, 실제 검수·처리는 각 큐 화면에서 따로 해야 합니다. 대상을 처리해도 알림이 자동으로 확인 처리되지는 않습니다.
```

`docs/manual/seeker-manual.md`에도 같은 톤으로 **벨 + 배지 · 알림함 이동 · 모두 확인 · 브라우저 알림 허용** 4가지를 추가한다. 구직자가 받는 알림 목록도 함께 적는다: 면접 제안 도착, 면접 확정·거절·취소·완료, 연락처 공개, 문의 답변 도착, 신고 처리 결과, 내 글의 새 댓글, 내 댓글의 답글, 내 글·댓글 숨김·삭제, 내 후기 승인·숨김.

- [ ] **Step 4: 4패키지 타입 체크**

Run: `pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/api check-types && pnpm --filter server check-types && pnpm --filter web check-types`
Expected: 모두 PASS.

- [ ] **Step 5: 순수 vitest 전량 실행**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-notifications.test.ts src/services/bambi-notification-recipients.test.ts src/services/bambi-chat-realtime.test.ts`
Expected: PASS.

Run: `pnpm --filter web exec vitest run src/lib/bambi/notification-labels.test.ts src/lib/bambi/os-notification.test.ts`
Expected: PASS — 16 tests.

**`packages/api/src/routers/bambi` 스위트는 실행하지 않는다**(dev DB 파괴). `notifications.test.ts`는 작성 완료·실행 보류 상태로 보고한다.

- [ ] **Step 6: 전체 린트**

Run: `pnpm dlx ultracite fix packages/db/src/schema/bambi.ts packages/api/src packages/api/src/routers/bambi apps/web/src/lib/bambi apps/web/src/components/bambi apps/web/src/app/seeker/notifications`
Expected: PASS(경로 인자 없이 실행하면 0파일 검사라 아무 의미가 없다는 점을 기억할 것).

- [ ] **Step 7: 스펙 대비 커버리지 자가 점검** — 스펙 §3의 4개 표(구직자 9행·구인자 8행+대칭·법률자문 2행·운영자 7행)를 한 줄씩 짚어 발생 지점에 호출이 있는지 확인하고, 없는 행이 있으면 보고에 명시한다(스펙 §3 "제외" 목록의 이벤트는 만들지 않은 것이 정답이다).

- [ ] **Step 8: 최종 보고(컨트롤러 커밋 대기)** — 변경 파일 목록, 검증 결과, 그리고 **사용자 조치 대기 2건**을 명시한다:
  1. `packages/db/src/migrations/0070_*.sql` 적용(`pnpm --filter @bambi-app/db db:migrate`) — 사용자 지시 대기
  2. 마이그레이션 적용 후 `packages/api/src/routers/bambi/notifications.test.ts` 실행 — dev DB 파괴 위험 때문에 사용자가 단일 파일로 직접 실행

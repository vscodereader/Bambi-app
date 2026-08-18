# 운영자 실시간 채팅 문의 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비회원·구직자·구인자가 플로팅 버튼으로 운영자에게 실시간(폴링) 문의 채팅을 보내고, 운영자는 전용 콘솔에서 목록·채팅·문의자 정보를 보며 답변한다. 양쪽 모두 알림을 받는다.

**Architecture:** 새 테이블 2개(`support_chat_room`·`support_chat_message`, 1인 1방)와 oRPC 라우터 1개. 비회원 신원은 HMAC 서명 쿠키(`bambi_support_chat`, 게스트 토큰과 필드명이 달라 상호 오용 불가). 실시간은 폴링(위젯 3초·뱃지 30초·콘솔 5초)이며 소켓·SSE는 건드리지 않는다. 알림은 기존 `notifyBambiNotification`을 미읽음 0→1 에지에서만 호출한다.

**Tech Stack:** Drizzle ORM, oRPC(`publicProcedure`/`adminProcedure`), Next.js(App Router), TanStack Query 폴링, shadcn UI, vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-operator-support-chat-design.md`

## Global Constraints

- 새 npm 의존성 추가 금지. 빌드·dev 서버 실행 금지(HMR 반영, 동작 확인은 사용자).
- `db:push` 절대 금지. 마이그레이션은 `pnpm --filter @bambi-app/db db:generate`로 SQL 생성만 하고 dev DB 적용(`db:migrate`)은 하지 않는다(사용자 확인 후).
- `packages/api/test/routers/bambi` 스위트 실행 금지(dev DB를 지운다). 테스트는 `packages/api/test/services/`에 작성하고 **cwd=packages/api에서 해당 파일만** 실행한다. 워크트리 안에서 실행(리포 루트에서 돌리면 다른 워크트리까지 긁는다).
- 워크트리 첫 커밋 전 `pnpm install` 1회 필요. 줄바꿈 LF.
- UI: shadcn 컴포넌트 최대 재사용, 임의 px(`[Npx]`) 금지 — Tailwind 스케일 토큰. 모바일 반응형 필수. DB enum 원값 화면 노출 금지(라벨 맵 경유).
- 커밋 메시지: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). Bash 툴은 Git Bash이므로 멀티라인 메시지는 임시 파일 + `git commit -F`.
- lint는 `npx ultracite check <파일 경로들>`(경로 인자 필수 — 안 주면 0파일 검사).
- 타입체크: `pnpm --filter @bambi-app/api check-types`, `pnpm --filter web check-types`, `pnpm --filter @bambi-app/db check-types` (web·server는 scope 없는 패키지명).

---

### Task 1: 문의 채팅 토큰 서비스

**Files:**
- Modify: `packages/api/src/services/bambi-guest-token.ts` (내부 헬퍼 3개 export)
- Create: `packages/api/src/services/bambi-support-chat-token.ts`
- Test: `packages/api/test/services/bambi-support-chat-token.test.ts`

**Interfaces:**
- Consumes: `bambi-guest-token.ts`의 `toBase64Url`, `fromBase64Url`, `importHmacKey` (이 태스크에서 export로 승격)
- Produces: `SUPPORT_CHAT_COOKIE_NAME = "bambi_support_chat"`, `SUPPORT_CHAT_COOKIE_MAX_AGE`(180일 초), `SUPPORT_CHAT_HEADER = "x-bambi-support-chat"`, `interface SupportChatTokenPayload { exp: number; sid: string; v: 1 }`, `createSupportChatToken({ maxAgeSeconds, now, secret }): Promise<string>`, `verifySupportChatToken(token, secret, now): Promise<SupportChatTokenPayload | null>`, `readSupportChatTokenFromCookieString(cookieString): null | string`

- [ ] **Step 1: 게스트 토큰 내부 헬퍼 export**

`packages/api/src/services/bambi-guest-token.ts`에서 `toBase64Url`, `fromBase64Url`, `importHmacKey` 세 함수 선언에 `export` 키워드만 추가한다(본문 변경 없음). 파일 상단 근처에 정의돼 있다.

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/api/test/services/bambi-support-chat-token.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createGuestToken } from "@/services/bambi-guest-token";
import {
	createSupportChatToken,
	readSupportChatTokenFromCookieString,
	SUPPORT_CHAT_COOKIE_NAME,
	verifySupportChatToken,
} from "@/services/bambi-support-chat-token";

const SECRET = "test-secret";
const NOW = new Date("2026-08-18T00:00:00Z");

describe("support chat token", () => {
	it("생성한 토큰은 검증을 통과하고 sid를 돌려준다", async () => {
		const token = await createSupportChatToken({
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		const payload = await verifySupportChatToken(token, SECRET, NOW);
		expect(payload?.sid).toMatch(/[0-9a-f-]{36}/);
		expect(payload?.v).toBe(1);
	});

	it("만료된 토큰은 null", async () => {
		const token = await createSupportChatToken({
			maxAgeSeconds: 60,
			now: NOW,
			secret: SECRET,
		});
		const later = new Date(NOW.getTime() + 61_000);
		expect(await verifySupportChatToken(token, SECRET, later)).toBeNull();
	});

	it("서명이 다르면 null", async () => {
		const token = await createSupportChatToken({
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		expect(await verifySupportChatToken(token, "other-secret", NOW)).toBeNull();
	});

	it("게스트 토큰(gid 페이로드)은 문의 토큰으로 인정하지 않는다", async () => {
		// 같은 시크릿으로 서명돼도 sid 필드가 없으면 거부 — 쿠키 상호 오용(성인인증
		// 게이트 우회의 역방향) 차단의 핵심.
		const guestToken = await createGuestToken({
			gender: null,
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		expect(await verifySupportChatToken(guestToken, SECRET, NOW)).toBeNull();
	});

	it("쿠키 문자열에서 토큰을 뽑는다", async () => {
		const token = await createSupportChatToken({
			maxAgeSeconds: 3600,
			now: NOW,
			secret: SECRET,
		});
		const cookie = `a=1; ${SUPPORT_CHAT_COOKIE_NAME}=${token}; b=2`;
		expect(readSupportChatTokenFromCookieString(cookie)).toBe(token);
		expect(readSupportChatTokenFromCookieString("a=1")).toBeNull();
	});
});
```

- [ ] **Step 3: 실패 확인**

Run(워크트리의 `packages/api`에서): `npx vitest run test/services/bambi-support-chat-token.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 4: 구현**

`packages/api/src/services/bambi-support-chat-token.ts`:

```ts
import {
	fromBase64Url,
	importHmacKey,
	toBase64Url,
} from "./bambi-guest-token";

export const SUPPORT_CHAT_COOKIE_NAME = "bambi_support_chat";
// 문의 이력을 잇는 키라 게스트 쿠키(30일)보다 길게 잡는다.
export const SUPPORT_CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
// 쿠키는 host-only라 다른 호스트인 api 서버에 안 실린다 — 게스트 토큰과 같은 방식으로
// 클라이언트가 이 헤더에 옮겨 보낸다(web utils/orpc).
export const SUPPORT_CHAT_HEADER = "x-bambi-support-chat";

/**
 * 익명 문의 신원 토큰. 게스트 토큰(bambi_guest)과 같은 시크릿으로 서명하지만 필드명이
 * 다르다(sid vs gid) — 서로 상대 검증기를 통과할 수 없어, 본인인증 없이 발급되는 이
 * 토큰을 bambi_guest 자리에 옮겨 붙여 성인인증 게이트를 우회하는 길이 원천 차단된다.
 */
export interface SupportChatTokenPayload {
	exp: number;
	sid: string;
	v: 1;
}

const encoder = new TextEncoder();

export async function createSupportChatToken({
	maxAgeSeconds,
	now,
	secret,
}: {
	maxAgeSeconds: number;
	now: Date;
	secret: string;
}): Promise<string> {
	const payload: SupportChatTokenPayload = {
		exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
		sid: crypto.randomUUID(),
		v: 1,
	};
	const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const key = await importHmacKey(secret);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(payloadPart)
	);
	return `${payloadPart}.${toBase64Url(new Uint8Array(signature))}`;
}

const parsePayload = (payloadPart: string): SupportChatTokenPayload | null => {
	const bytes = fromBase64Url(payloadPart);
	if (!bytes) {
		return null;
	}
	try {
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}
		const { exp, sid, v } = parsed as Record<string, unknown>;
		if (v !== 1 || typeof exp !== "number") {
			return null;
		}
		if (typeof sid !== "string" || sid === "") {
			return null;
		}
		return { exp, sid, v };
	} catch {
		return null;
	}
};

// 서명·만료를 검증하고 페이로드를 돌려준다. 실패는 전부 null — 게이트는 null이면 닫힌다.
export async function verifySupportChatToken(
	token: string,
	secret: string,
	now: Date
): Promise<SupportChatTokenPayload | null> {
	const [payloadPart, signaturePart] = token.split(".");
	if (!(payloadPart && signaturePart)) {
		return null;
	}
	const signature = fromBase64Url(signaturePart);
	if (!signature) {
		return null;
	}
	const key = await importHmacKey(secret);
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		signature,
		encoder.encode(payloadPart)
	);
	if (!valid) {
		return null;
	}
	const payload = parsePayload(payloadPart);
	if (!payload || payload.exp <= Math.floor(now.getTime() / 1000)) {
		return null;
	}
	return payload;
}

export const readSupportChatTokenFromCookieString = (
	cookieString: string
): null | string => {
	for (const part of cookieString.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === SUPPORT_CHAT_COOKIE_NAME) {
			const value = rest.join("=");
			return value === "" ? null : value;
		}
	}
	return null;
};
```

주의: `bambi-guest-token.ts`의 `verifyGuestToken`도 문의 토큰을 게스트로 인정하지 않아야 한다 — 기존 `parsePayload`가 `gid` 없는 페이로드를 읽기 전용으로 돌려주는데, `resolveGuest`(context.ts)가 `payload?.gid` 없으면 null 처리하므로 추가 변경 없이 안전하다. 확인만 한다.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run test/services/bambi-support-chat-token.test.ts` (cwd=packages/api)
Expected: PASS 5건.

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/services/bambi-guest-token.ts packages/api/src/services/bambi-support-chat-token.ts packages/api/test/services/bambi-support-chat-token.test.ts
git commit -m "feat: 문의 채팅 익명 신원 토큰 서비스 추가"
```

---

### Task 2: DB 스키마 + 마이그레이션 생성

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (enum 2곳·테이블 2개·알림 actor nullable)
- Modify: `packages/api/src/services/bambi-notification-stream.ts` (`BambiNotificationTargetType`에 `"support_chat"`)
- Modify: `packages/api/src/services/bambi-notifications.ts` (`actorUserId` 옵셔널화)
- Create: `packages/db/src/migrations/0093_*.sql` (drizzle-kit 생성)

**Interfaces:**
- Produces: `supportChatSender` pgEnum(`"inquirer" | "admin"`), `supportChatRoom`, `supportChatMessage` 테이블 객체(이후 태스크가 `@bambi-app/db/schema/bambi`에서 import), `notificationTargetType`에 `"support_chat"` 값, `CreateBambiNotificationInput.actorUserId?: null | string`

- [ ] **Step 1: enum 추가·변경**

`packages/db/src/schema/bambi.ts`의 `notificationTargetType` pgEnum 배열 끝에 `"support_chat"` 추가. `supportInquiryStatus` enum 근처에 신규 enum:

```ts
export const supportChatSender = pgEnum("support_chat_sender", [
	"inquirer",
	"admin",
]);
```

- [ ] **Step 2: 테이블 2개 추가**

`supportInquiry` 테이블 정의 뒤에 추가. `check`가 drizzle-orm/pg-core import에 이미 있는지 확인(파일 내 `check(` 사용 중이므로 있음).

```ts
// 운영자 실시간 문의 채팅방. 회원은 userId, 비회원은 서명 쿠키의 sid(guestId)로
// 1인 1방을 유지한다 — 부분 유니크가 축이고, CHECK가 두 축 중 정확히 하나만 강제한다.
// 비회원이 쿠키를 지우면 새 방이 생기고 옛 방은 콘솔 이력으로 남는다.
// 읽음은 방 단위 워터마크 2개다(운영자는 공용 큐라 1개면 된다). 미읽음 수 =
// 워터마크 이후에 쌓인 상대측 메시지 count.
export const supportChatRoom = pgTable(
	"support_chat_room",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		guestId: text("guest_id"),
		// 운영자가 도배 방을 잠근다 — 잠긴 방의 문의자는 발신 403, 운영자 발신은 가능.
		isBlocked: boolean("is_blocked").default(false).notNull(),
		userLastReadAt: timestamp("user_last_read_at"),
		adminLastReadAt: timestamp("admin_last_read_at"),
		lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("support_chat_room_user_id_uidx")
			.on(table.userId)
			.where(sql`${table.userId} IS NOT NULL`),
		uniqueIndex("support_chat_room_guest_id_uidx")
			.on(table.guestId)
			.where(sql`${table.guestId} IS NOT NULL`),
		index("support_chat_room_last_message_at_idx").on(table.lastMessageAt),
		check(
			"support_chat_room_owner_one_of_ck",
			sql`(${table.userId} IS NULL) <> (${table.guestId} IS NULL)`
		),
	]
);

export const supportChatMessage = pgTable(
	"support_chat_message",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		roomId: uuid("room_id")
			.notNull()
			.references(() => supportChatRoom.id, { onDelete: "cascade" }),
		senderType: supportChatSender("sender_type").notNull(),
		// admin 발신일 때 어느 운영자인지 감사용. 비회원 inquirer는 null.
		senderUserId: text("sender_user_id").references(() => user.id),
		body: text("body").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("support_chat_message_room_id_created_at_idx").on(
			table.roomId,
			table.createdAt
		),
	]
);
```

- [ ] **Step 3: 알림 actor를 nullable로**

비회원 문의 메시지는 행위자 계정이 없다. `bambiNotification.actorUserId`에서 `.notNull()` 제거:

```ts
		actorUserId: text("actor_user_id").references(() => user.id),
```

알림 목록·라벨은 actorUserId를 읽지 않고(라우터 select에 없음), 자기 행위 제외 로직(`resolveNotificationRecipients`)은 이 경로에서 안 쓰므로 영향 없음.

`packages/api/src/services/bambi-notifications.ts`:
- `CreateBambiNotificationInput.actorUserId: string` → `actorUserId?: null | string`
- `buildBambiNotificationValues`의 반환에서 `actorUserId` → `actorUserId: actorUserId ?? null`

`packages/api/src/services/bambi-notification-stream.ts`의 `BambiNotificationTargetType` 유니언에 `| "support_chat"` 추가.

- [ ] **Step 4: 마이그레이션 생성 (적용은 하지 않는다)**

Run(워크트리 루트): `pnpm --filter @bambi-app/db db:generate`
Expected: `packages/db/src/migrations/0093_*.sql` 생성. 내용 검수: `CREATE TYPE support_chat_sender`, 테이블 2개, `ALTER TYPE notification_target_type ADD VALUE 'support_chat'`, `ALTER TABLE bambi_notification ALTER COLUMN actor_user_id DROP NOT NULL`, 부분 유니크 2개·CHECK 1개. **`db:migrate`·`db:push`는 실행하지 않는다** — dev 적용은 사용자 확인 후(배포 체크리스트에 기재).

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/api check-types`
Expected: PASS (api는 아직 새 테이블 미사용이라 영향 없음).

- [ ] **Step 6: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations packages/api/src/services/bambi-notification-stream.ts packages/api/src/services/bambi-notifications.ts
git commit -m "feat: 문의 채팅 스키마·알림 타입 추가 (마이그레이션 0093)"
```

---

### Task 3: 서버 컨텍스트에 문의 신원 추가

**Files:**
- Modify: `packages/api/src/context.ts`

**Interfaces:**
- Consumes: Task 1의 `verifySupportChatToken`, `readSupportChatTokenFromCookieString`, `SUPPORT_CHAT_HEADER`
- Produces: `Context.supportChat: { sid: string } | null` (라우터가 `context.supportChat`으로 읽음)

- [ ] **Step 1: 구현**

`resolveGuest` 아래에 같은 꼴로 추가하고 `createContext` 반환에 `supportChat` 키를 넣는다:

```ts
// 익명 문의 채팅 신원. 게스트 토큰과 같은 헤더 이송 방식(쿠키는 host-only) —
// x-bambi-support-chat 헤더 우선, SSR 경유는 Cookie 헤더 폴백.
const resolveSupportChat = async (
	req: IncomingHttpHeaders
): Promise<null | { sid: string }> => {
	const token =
		headerValue(req, SUPPORT_CHAT_HEADER) ||
		readSupportChatTokenFromCookieString(headerValue(req, "cookie") ?? "");
	if (!token) {
		return null;
	}
	const payload = await verifySupportChatToken(
		token,
		guestTokenSecret(),
		new Date()
	);
	return payload ? { sid: payload.sid } : null;
};
```

`createContext` 반환 객체에 `supportChat: await resolveSupportChat(req),` 추가. import에 Task 1 산출물 3개 추가. (검증 비용은 헤더가 있을 때만 HMAC 1회 — 게스트 토큰과 동일한 수준.)

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add packages/api/src/context.ts
git commit -m "feat: 컨텍스트에 문의 채팅 신원(supportChat) 해석 추가"
```

---

### Task 4: 순수 헬퍼 — 레이트리밋 키·알림 에지 트리거

**Files:**
- Create: `packages/api/src/services/bambi-support-chat.ts`
- Test: `packages/api/test/services/bambi-support-chat.test.ts`

**Interfaces:**
- Produces: `SUPPORT_CHAT_BODY_MAX = 1000`, `SUPPORT_CHAT_SEND_LIMIT = 10`, `SUPPORT_CHAT_WINDOW_MS = 60_000`, `SUPPORT_CHAT_RATE_LIMIT_ERROR`(안내 문구), `type SupportChatInquirer = { kind: "member"; userId: string } | { kind: "guest"; sid: string }`, `supportChatSendKeys(inquirer, clientIp): string[]`, `resolveSupportChatNotificationTarget({ prevUnreadCount, roomUserId, senderType }): { recipientRole: "admin" } | { recipientUserId: string } | null`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/test/services/bambi-support-chat.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	resolveSupportChatNotificationTarget,
	supportChatSendKeys,
} from "@/services/bambi-support-chat";

describe("supportChatSendKeys", () => {
	it("회원은 계정 한 축", () => {
		expect(
			supportChatSendKeys({ kind: "member", userId: "u1" }, "1.2.3.4")
		).toEqual(["supportChat.send:u1"]);
	});

	it("비회원은 sid·IP 두 축, IP 없으면 unknown", () => {
		expect(supportChatSendKeys({ kind: "guest", sid: "s1" }, "1.2.3.4")).toEqual(
			["supportChat.send:sid:s1", "supportChat.send:ip:1.2.3.4"]
		);
		expect(
			supportChatSendKeys({ kind: "guest", sid: "s1" }, undefined)
		).toEqual(["supportChat.send:sid:s1", "supportChat.send:ip:unknown"]);
	});
});

describe("resolveSupportChatNotificationTarget", () => {
	it("이미 미읽음이 있으면 알림 없음(에지 트리거)", () => {
		expect(
			resolveSupportChatNotificationTarget({
				prevUnreadCount: 1,
				roomUserId: "u1",
				senderType: "inquirer",
			})
		).toBeNull();
	});

	it("문의자 발신 0→1이면 운영자 공유 알림", () => {
		expect(
			resolveSupportChatNotificationTarget({
				prevUnreadCount: 0,
				roomUserId: null,
				senderType: "inquirer",
			})
		).toEqual({ recipientRole: "admin" });
	});

	it("운영자 발신 0→1은 회원 방이면 개인 알림, 비회원 방이면 없음", () => {
		expect(
			resolveSupportChatNotificationTarget({
				prevUnreadCount: 0,
				roomUserId: "u1",
				senderType: "admin",
			})
		).toEqual({ recipientUserId: "u1" });
		expect(
			resolveSupportChatNotificationTarget({
				prevUnreadCount: 0,
				roomUserId: null,
				senderType: "admin",
			})
		).toBeNull();
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/services/bambi-support-chat.test.ts` (cwd=packages/api)
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`packages/api/src/services/bambi-support-chat.ts`:

```ts
export const SUPPORT_CHAT_BODY_MAX = 1000;
export const SUPPORT_CHAT_SEND_LIMIT = 10;
export const SUPPORT_CHAT_WINDOW_MS = 60 * 1000;
export const SUPPORT_CHAT_RATE_LIMIT_ERROR =
	"메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해 주세요.";

export type SupportChatInquirer =
	| { kind: "guest"; sid: string }
	| { kind: "member"; userId: string };

// 도배 방지 버킷 키. 회원은 계정 한 축, 비회원은 쿠키를 지우면 sid가 바뀌므로 sid·IP
// 두 축을 모두 건다(커뮤니티 게스트 쓰기와 같은 방식). 방 생성은 첫 발신에서만
// 일어나므로 이 한도가 방 양산도 함께 막는다 — 별도 생성 리밋은 두지 않는다.
export const supportChatSendKeys = (
	inquirer: SupportChatInquirer,
	clientIp: string | undefined
): string[] =>
	inquirer.kind === "member"
		? [`supportChat.send:${inquirer.userId}`]
		: [
				`supportChat.send:sid:${inquirer.sid}`,
				`supportChat.send:ip:${clientIp ?? "unknown"}`,
			];

// 알림 에지 트리거: 수신측 미읽음이 0→1로 바뀌는 삽입에서만 알림 1행을 만든다.
// 메시지마다 쌓으면 알림함이 채팅 로그가 된다. 비회원 문의자는 알림 채널이 없어
// (SSE는 로그인 전제) 운영자 발신이어도 null — 위젯 뱃지 폴링이 유일한 통지다.
export function resolveSupportChatNotificationTarget({
	prevUnreadCount,
	roomUserId,
	senderType,
}: {
	prevUnreadCount: number;
	roomUserId: null | string;
	senderType: "admin" | "inquirer";
}): null | { recipientRole: "admin" } | { recipientUserId: string } {
	if (prevUnreadCount > 0) {
		return null;
	}
	if (senderType === "inquirer") {
		return { recipientRole: "admin" };
	}
	return roomUserId ? { recipientUserId: roomUserId } : null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run test/services/bambi-support-chat.test.ts` (cwd=packages/api)
Expected: PASS 5건.

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/services/bambi-support-chat.ts packages/api/test/services/bambi-support-chat.test.ts
git commit -m "feat: 문의 채팅 레이트리밋 키·알림 에지 트리거 헬퍼"
```

---

### Task 5: 문의자 측 API 라우터

**Files:**
- Create: `packages/api/src/routers/bambi/support-chat.ts`
- Modify: `packages/api/src/routers/bambi/index.ts` (등록)

**Interfaces:**
- Consumes: Task 2 테이블, Task 3 `context.supportChat`, Task 4 헬퍼, `requireActiveBambiProfile`(`@/services/bambi-authz`), `takeRateLimit`(`@/services/rate-limit`), `notifyBambiNotification`
- Produces: `supportChatRouter`의 `getMyRoom`, `sendMessage`, `markRead` — 클라이언트에서 `orpc.bambi.supportChat.*`. `getMyRoom` 반환: `null | { room: { id: string; isBlocked: boolean }, messages: { id; senderType; body; createdAt }[], unreadCount: number }`

- [ ] **Step 1: 라우터 파일 생성 (문의자 측)**

`packages/api/src/routers/bambi/support-chat.ts`:

```ts
import { db } from "@bambi-app/db";
import { supportChatMessage, supportChatRoom } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import { notifyBambiNotification } from "../../services/bambi-notifications";
import { takeRateLimit } from "../../services/rate-limit";
import {
	resolveSupportChatNotificationTarget,
	SUPPORT_CHAT_BODY_MAX,
	SUPPORT_CHAT_RATE_LIMIT_ERROR,
	SUPPORT_CHAT_SEND_LIMIT,
	SUPPORT_CHAT_WINDOW_MS,
	type SupportChatInquirer,
	supportChatSendKeys,
} from "../../services/bambi-support-chat";

// 위젯이 한 번에 보여 주는 최근 메시지 수. ponytail: 커서 페이징 없음 — 문의 채팅이
// 100건을 넘는 방이 흔해지면 그때 커서를 단다.
const INQUIRER_MESSAGE_LIMIT = 100;

const NO_IDENTITY_ERROR =
	"문의 세션이 없어요. 새로고침 후 다시 시도해 주세요.";
const BLOCKED_ERROR = "문의 발신이 제한된 상태예요.";

interface SupportChatContext {
	clientIp: string;
	session: { user: { id: string } } | null;
	supportChat: null | { sid: string };
}

// 세션이 있으면 회원 축, 없으면 서명 쿠키 축. 둘 다 없으면 null — getMyRoom은 "방
// 없음"으로, sendMessage는 쿠키 발급(web 라우트) 후 재시도를 유도한다.
const resolveInquirer = (
	context: SupportChatContext
): null | SupportChatInquirer => {
	const userId = context.session?.user.id;
	if (userId) {
		return { kind: "member", userId };
	}
	return context.supportChat
		? { kind: "guest", sid: context.supportChat.sid }
		: null;
};

const inquirerRoomWhere = (inquirer: SupportChatInquirer) =>
	inquirer.kind === "member"
		? eq(supportChatRoom.userId, inquirer.userId)
		: eq(supportChatRoom.guestId, inquirer.sid);

const EPOCH = new Date(0);

// 워터마크 이후에 쌓인 상대측 메시지 수 — 미읽음의 정의.
const countUnread = async (
	roomId: string,
	senderType: "admin" | "inquirer",
	watermark: Date | null
): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(supportChatMessage)
		.where(
			and(
				eq(supportChatMessage.roomId, roomId),
				eq(supportChatMessage.senderType, senderType),
				gt(supportChatMessage.createdAt, watermark ?? EPOCH)
			)
		);
	return row?.value ?? 0;
};

const loadRecentMessages = async (roomId: string, limit: number) => {
	const rows = await db
		.select({
			body: supportChatMessage.body,
			createdAt: supportChatMessage.createdAt,
			id: supportChatMessage.id,
			senderType: supportChatMessage.senderType,
		})
		.from(supportChatMessage)
		.where(eq(supportChatMessage.roomId, roomId))
		.orderBy(desc(supportChatMessage.createdAt))
		.limit(limit);
	return rows.reverse();
};

export const supportChatRouter = {
	getMyRoom: publicProcedure.handler(async ({ context }) => {
		const inquirer = resolveInquirer(context);
		if (!inquirer) {
			return null;
		}
		const [room] = await db
			.select()
			.from(supportChatRoom)
			.where(inquirerRoomWhere(inquirer))
			.limit(1);
		if (!room) {
			return null;
		}
		return {
			messages: await loadRecentMessages(room.id, INQUIRER_MESSAGE_LIMIT),
			room: { id: room.id, isBlocked: room.isBlocked },
			unreadCount: await countUnread(room.id, "admin", room.userLastReadAt),
		};
	}),

	sendMessage: publicProcedure
		.input(
			z.object({
				body: z.string().trim().min(1).max(SUPPORT_CHAT_BODY_MAX),
			})
		)
		.handler(async ({ context, input }) => {
			const inquirer = resolveInquirer(context);
			if (!inquirer) {
				throw new ORPCError("UNAUTHORIZED", { message: NO_IDENTITY_ERROR });
			}
			if (inquirer.kind === "member") {
				// 정지 계정 차단 겸 역할 확인. 운영자 계정은 받는 쪽이다 — 자기 문의가
				// 공용 큐에 섞이면 처리 대상이 흐려진다(기존 티켓과 같은 규칙).
				const profile = await requireActiveBambiProfile(context.session);
				if (profile.role === "admin") {
					throw new ORPCError("FORBIDDEN", {
						message: "운영자 계정은 문의 채팅을 보낼 수 없어요.",
					});
				}
			}
			const now = Date.now();
			for (const key of supportChatSendKeys(inquirer, context.clientIp)) {
				if (
					!takeRateLimit({
						key,
						limit: SUPPORT_CHAT_SEND_LIMIT,
						now,
						windowMs: SUPPORT_CHAT_WINDOW_MS,
					})
				) {
					throw new ORPCError("TOO_MANY_REQUESTS", {
						message: SUPPORT_CHAT_RATE_LIMIT_ERROR,
					});
				}
			}

			// 1인 1방 — 없으면 만들고, 동시 첫 발신 경합은 부분 유니크 +
			// onConflictDoNothing 후 재조회로 잡는다.
			let [room] = await db
				.select()
				.from(supportChatRoom)
				.where(inquirerRoomWhere(inquirer))
				.limit(1);
			if (!room) {
				await db
					.insert(supportChatRoom)
					.values(
						inquirer.kind === "member"
							? { userId: inquirer.userId }
							: { guestId: inquirer.sid }
					)
					.onConflictDoNothing();
				[room] = await db
					.select()
					.from(supportChatRoom)
					.where(inquirerRoomWhere(inquirer))
					.limit(1);
			}
			if (!room) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "문의 방을 만들지 못했어요.",
				});
			}
			if (room.isBlocked) {
				throw new ORPCError("FORBIDDEN", { message: BLOCKED_ERROR });
			}

			// 에지 트리거 판정은 삽입 전에 센다 — 삽입 후에 세면 항상 1 이상이라
			// 알림이 영영 안 나간다.
			const prevUnreadCount = await countUnread(
				room.id,
				"inquirer",
				room.adminLastReadAt
			);
			const [inserted] = await db
				.insert(supportChatMessage)
				.values({
					body: input.body,
					roomId: room.id,
					senderType: "inquirer",
					senderUserId:
						inquirer.kind === "member" ? inquirer.userId : null,
				})
				.returning({
					createdAt: supportChatMessage.createdAt,
					id: supportChatMessage.id,
				});
			if (!inserted) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "메시지를 보내지 못했어요.",
				});
			}
			await db
				.update(supportChatRoom)
				.set({ lastMessageAt: inserted.createdAt })
				.where(eq(supportChatRoom.id, room.id));

			const target = resolveSupportChatNotificationTarget({
				prevUnreadCount,
				roomUserId: room.userId,
				senderType: "inquirer",
			});
			if (target) {
				await notifyBambiNotification({
					actorUserId:
						inquirer.kind === "member" ? inquirer.userId : null,
					metadata: { action: "message" },
					targetId: room.id,
					targetType: "support_chat",
					...target,
				});
			}
			return { id: inserted.id };
		}),

	markRead: publicProcedure.handler(async ({ context }) => {
		const inquirer = resolveInquirer(context);
		if (!inquirer) {
			return { ok: false };
		}
		await db
			.update(supportChatRoom)
			.set({ userLastReadAt: new Date() })
			.where(inquirerRoomWhere(inquirer));
		return { ok: true };
	}),
};
```

주의: `SupportChatContext`의 session 타입은 실제 컨텍스트 타입과 어긋나면 캐스팅하지 말고 `Context`(`../../context`)를 import해 `context` 파라미터 타입을 추론에 맡긴다 — oRPC 핸들러는 프로시저 체인에서 타입이 오므로 위 인터페이스는 `resolveInquirer` 인자 좁히기 용도로만 쓰고, 실제로는 `Pick<Context, "clientIp" | "session" | "supportChat">`으로 선언하는 편이 정확하다.

- [ ] **Step 2: 라우터 등록**

`packages/api/src/routers/bambi/index.ts`: import 목록에 `import { supportChatRouter } from "./support-chat";` 추가, 명시 타입 주석과 객체 리터럴 양쪽에 `supportChat: typeof supportChatRouter;` / `supportChat: supportChatRouter,`를 `support` 항목 옆에 추가.

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS. (TS7056이 다시 나면 기존 주석 방식대로 명시 타입에 항목이 빠지지 않았는지 확인.)

- [ ] **Step 4: 커밋**

```bash
git add packages/api/src/routers/bambi/support-chat.ts packages/api/src/routers/bambi/index.ts
git commit -m "feat: 문의 채팅 문의자 측 라우터 (getMyRoom·sendMessage·markRead)"
```

---

### Task 6: 운영자 측 API

**Files:**
- Modify: `packages/api/src/routers/bambi/support-chat.ts`

**Interfaces:**
- Consumes: `adminProcedure`(`../../index`), Task 2 테이블, `user`·`member`·`organization`(`@bambi-app/db/schema/auth`), `bambiProfile`
- Produces: `supportChatRouter.admin` 네임스페이스 — `listRooms({ page })`, `getRoom({ roomId })`, `sendMessage({ roomId, body })`, `markRead({ roomId })`, `setBlocked({ roomId, isBlocked })`. `getRoom`의 `inquirer` 반환: `{ kind: "member"; name: string; role: string; gender: null | string; joinedAt: Date; organizationName: null | string } | { kind: "guest"; firstContactAt: Date }`

- [ ] **Step 1: 운영자 프로시저 추가**

같은 파일에 import 추가(`adminProcedure`, `inArray`, `sql`, `bambiProfile`, auth 스키마의 `member`·`organization`·`user`) 후 `supportChatRouter` 객체에 `admin` 키로 추가:

```ts
const ADMIN_ROOM_PAGE_SIZE = 30;
const ADMIN_MESSAGE_LIMIT = 200;
const ROOM_NOT_FOUND = "문의 방을 찾을 수 없어요.";

// (supportChatRouter 객체 안)
	admin: {
		listRooms: adminProcedure
			.input(z.object({ page: z.number().int().min(1).default(1) }))
			.handler(async ({ input }) => {
				const [totalRow] = await db
					.select({ value: count() })
					.from(supportChatRoom);
				const rooms = await db
					.select({
						createdAt: supportChatRoom.createdAt,
						guestId: supportChatRoom.guestId,
						id: supportChatRoom.id,
						isBlocked: supportChatRoom.isBlocked,
						lastMessageAt: supportChatRoom.lastMessageAt,
						userId: supportChatRoom.userId,
						userName: user.name,
					})
					.from(supportChatRoom)
					.leftJoin(user, eq(supportChatRoom.userId, user.id))
					.orderBy(desc(supportChatRoom.lastMessageAt))
					.limit(ADMIN_ROOM_PAGE_SIZE)
					.offset((input.page - 1) * ADMIN_ROOM_PAGE_SIZE);

				const roomIds = rooms.map((room) => room.id);
				// 페이지 방들의 미읽음·마지막 메시지를 각각 한 방 쿼리로 — 방마다
				// N+1을 돌리지 않는다.
				const unreadRows = roomIds.length
					? await db
							.select({
								roomId: supportChatMessage.roomId,
								value: count(),
							})
							.from(supportChatMessage)
							.innerJoin(
								supportChatRoom,
								eq(supportChatMessage.roomId, supportChatRoom.id)
							)
							.where(
								and(
									inArray(supportChatMessage.roomId, roomIds),
									eq(supportChatMessage.senderType, "inquirer"),
									sql`${supportChatMessage.createdAt} > coalesce(${supportChatRoom.adminLastReadAt}, to_timestamp(0))`
								)
							)
							.groupBy(supportChatMessage.roomId)
					: [];
				const lastMessages = roomIds.length
					? await db
							.selectDistinctOn([supportChatMessage.roomId], {
								body: supportChatMessage.body,
								roomId: supportChatMessage.roomId,
							})
							.from(supportChatMessage)
							.where(inArray(supportChatMessage.roomId, roomIds))
							.orderBy(
								supportChatMessage.roomId,
								desc(supportChatMessage.createdAt)
							)
					: [];
				const unreadByRoom = new Map(
					unreadRows.map((row) => [row.roomId, row.value])
				);
				const previewByRoom = new Map(
					lastMessages.map((row) => [row.roomId, row.body])
				);
				return {
					items: rooms.map((room) => ({
						id: room.id,
						// 회원은 계정 이름, 비회원은 sid 앞 8자로 구분만 되게.
						displayName: room.userId
							? (room.userName ?? "회원")
							: `비회원 ${room.guestId?.slice(0, 8) ?? ""}`,
						isBlocked: room.isBlocked,
						isMember: room.userId !== null,
						lastMessageAt: room.lastMessageAt,
						lastMessagePreview: previewByRoom.get(room.id) ?? "",
						unreadCount: unreadByRoom.get(room.id) ?? 0,
					})),
					page: input.page,
					pageSize: ADMIN_ROOM_PAGE_SIZE,
					totalCount: totalRow?.value ?? 0,
				};
			}),

		getRoom: adminProcedure
			.input(z.object({ roomId: z.string().uuid() }))
			.handler(async ({ input }) => {
				const [room] = await db
					.select()
					.from(supportChatRoom)
					.where(eq(supportChatRoom.id, input.roomId))
					.limit(1);
				if (!room) {
					throw new ORPCError("NOT_FOUND", { message: ROOM_NOT_FOUND });
				}
				const messages = await loadRecentMessages(
					room.id,
					ADMIN_MESSAGE_LIMIT
				);
				let inquirer:
					| {
							gender: null | string;
							joinedAt: Date;
							kind: "member";
							name: string;
							organizationName: null | string;
							role: string;
					  }
					| { firstContactAt: Date; kind: "guest" };
				if (room.userId) {
					const [info] = await db
						.select({
							gender: bambiProfile.gender,
							joinedAt: user.createdAt,
							name: user.name,
							role: bambiProfile.role,
						})
						.from(user)
						.leftJoin(bambiProfile, eq(bambiProfile.userId, user.id))
						.where(eq(user.id, room.userId))
						.limit(1);
					const [org] =
						info?.role === "employer"
							? await db
									.select({ name: organization.name })
									.from(member)
									.innerJoin(
										organization,
										eq(member.organizationId, organization.id)
									)
									.where(
										and(
											eq(member.userId, room.userId),
											eq(member.status, "active")
										)
									)
									.limit(1)
							: [];
					inquirer = {
						gender: info?.gender ?? null,
						joinedAt: info?.joinedAt ?? room.createdAt,
						kind: "member",
						name: info?.name ?? "회원",
						organizationName: org?.name ?? null,
						role: info?.role ?? "job_seeker",
					};
				} else {
					inquirer = { firstContactAt: room.createdAt, kind: "guest" };
				}
				return {
					inquirer,
					messages,
					room: { id: room.id, isBlocked: room.isBlocked },
					unreadCount: await countUnread(
						room.id,
						"inquirer",
						room.adminLastReadAt
					),
				};
			}),

		sendMessage: adminProcedure
			.input(
				z.object({
					body: z.string().trim().min(1).max(SUPPORT_CHAT_BODY_MAX),
					roomId: z.string().uuid(),
				})
			)
			.handler(async ({ context, input }) => {
				const [room] = await db
					.select()
					.from(supportChatRoom)
					.where(eq(supportChatRoom.id, input.roomId))
					.limit(1);
				if (!room) {
					throw new ORPCError("NOT_FOUND", { message: ROOM_NOT_FOUND });
				}
				const prevUnreadCount = await countUnread(
					room.id,
					"admin",
					room.userLastReadAt
				);
				const [inserted] = await db
					.insert(supportChatMessage)
					.values({
						body: input.body,
						roomId: room.id,
						senderType: "admin",
						senderUserId: context.session.user.id,
					})
					.returning({
						createdAt: supportChatMessage.createdAt,
						id: supportChatMessage.id,
					});
				if (!inserted) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "메시지를 보내지 못했어요.",
					});
				}
				await db
					.update(supportChatRoom)
					.set({ lastMessageAt: inserted.createdAt })
					.where(eq(supportChatRoom.id, room.id));
				const target = resolveSupportChatNotificationTarget({
					prevUnreadCount,
					roomUserId: room.userId,
					senderType: "admin",
				});
				if (target) {
					await notifyBambiNotification({
						actorUserId: context.session.user.id,
						metadata: { action: "replied" },
						targetId: room.id,
						targetType: "support_chat",
						...target,
					});
				}
				return { id: inserted.id };
			}),

		markRead: adminProcedure
			.input(z.object({ roomId: z.string().uuid() }))
			.handler(async ({ input }) => {
				await db
					.update(supportChatRoom)
					.set({ adminLastReadAt: new Date() })
					.where(eq(supportChatRoom.id, input.roomId));
				return { ok: true };
			}),

		setBlocked: adminProcedure
			.input(
				z.object({ isBlocked: z.boolean(), roomId: z.string().uuid() })
			)
			.handler(async ({ input }) => {
				await db
					.update(supportChatRoom)
					.set({ isBlocked: input.isBlocked })
					.where(eq(supportChatRoom.id, input.roomId));
				return { ok: true };
			}),
	},
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add packages/api/src/routers/bambi/support-chat.ts
git commit -m "feat: 문의 채팅 운영자 측 API (목록·상세·답변·읽음·잠금)"
```

---

### Task 7: 웹 쿠키 발급 라우트 + orpc 헤더 이송

**Files:**
- Create: `apps/web/src/app/api/support-chat/route.ts`
- Modify: `apps/web/src/utils/orpc.ts` (헤더에 문의 토큰 추가)

**Interfaces:**
- Consumes: Task 1 토큰 서비스, `resolveGuestTokenSecret`(guest-token), `resolveClientIp`, `takeRateLimit`
- Produces: `POST /api/support-chat` → `{ ok: true }` + `bambi_support_chat` 쿠키 세팅. orpc 요청마다 `x-bambi-support-chat` 헤더 자동 첨부(쿠키 있을 때).

- [ ] **Step 1: 발급 라우트**

`apps/web/src/app/api/support-chat/route.ts` (`/api/guest` 라우트와 같은 IP 해석·시크릿 해석 방식):

```ts
import {
	resolveGuestTokenSecret,
} from "@bambi-app/api/services/bambi-guest-token";
import {
	createSupportChatToken,
	SUPPORT_CHAT_COOKIE_MAX_AGE,
	SUPPORT_CHAT_COOKIE_NAME,
} from "@bambi-app/api/services/bambi-support-chat-token";
import { resolveClientIp } from "@bambi-app/api/services/client-ip";
import { takeRateLimit } from "@bambi-app/api/services/rate-limit";
import { env } from "@bambi-app/env/web";
import { NextResponse } from "next/server";

// 익명 문의 신원 발급. 본인인증 없이 열려 있으므로 IP당 발급 속도만 끊는다 —
// 발신 자체는 서버 sendMessage 리밋이 다시 막는다.
const ISSUE_LIMIT = 5;
const ISSUE_WINDOW_MS = 60_000;

const clientIp = (request: Request): string =>
	resolveClientIp({
		directIp: request.headers.get("x-vercel-forwarded-for"),
		forwardedFor: request.headers.get("x-forwarded-for"),
		trustedProxyHops: 0,
	});

export async function POST(request: Request) {
	const key = `supportChat.issue:ip:${clientIp(request)}`;
	if (
		!takeRateLimit({
			key,
			limit: ISSUE_LIMIT,
			now: Date.now(),
			windowMs: ISSUE_WINDOW_MS,
		})
	) {
		return NextResponse.json({ ok: false }, { status: 429 });
	}
	const token = await createSupportChatToken({
		maxAgeSeconds: SUPPORT_CHAT_COOKIE_MAX_AGE,
		now: new Date(),
		secret: resolveGuestTokenSecret(
			env.BAMBI_GUEST_TOKEN_SECRET,
			process.env.NODE_ENV
		),
	});
	const response = NextResponse.json({ ok: true });
	// httpOnly:false는 의도된 것 — 쿠키가 host-only라 api 서버에 안 실리므로 JS가
	// 읽어 x-bambi-support-chat 헤더로 옮긴다(게스트 쿠키와 동일 방식). 값 위조는
	// 서버의 HMAC 검증에서 걸린다.
	response.cookies.set({
		httpOnly: false,
		maxAge: SUPPORT_CHAT_COOKIE_MAX_AGE,
		name: SUPPORT_CHAT_COOKIE_NAME,
		path: "/",
		sameSite: "lax",
		secure: true,
		value: token,
	});
	return response;
}
```

- [ ] **Step 2: orpc 헤더 추가**

`apps/web/src/utils/orpc.ts`의 `headers` 브라우저 분기를 다음으로 교체(기존 게스트 헤더 유지):

```ts
		if (typeof window !== "undefined") {
			// 게스트/문의 쿠키는 host-only라 다른 호스트인 API 서버에는 실리지 않는다.
			// httpOnly:false라 JS로 읽을 수 있으므로 헤더로 옮겨 붙여 신원을 서버까지
			// 전달한다(진위 판정은 서버가 서명 검증으로 한다).
			const token = readGuestTokenFromCookieString(document.cookie);
			const supportToken = readSupportChatTokenFromCookieString(
				document.cookie
			);
			return {
				...(token ? { "x-bambi-guest": token } : {}),
				...(supportToken ? { [SUPPORT_CHAT_HEADER]: supportToken } : {}),
			};
		}
```

import 추가: `import { readSupportChatTokenFromCookieString, SUPPORT_CHAT_HEADER } from "@bambi-app/api/services/bambi-support-chat-token";`

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter web check-types`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/api/support-chat/route.ts apps/web/src/utils/orpc.ts
git commit -m "feat: 문의 채팅 익명 쿠키 발급 라우트·orpc 헤더 이송"
```

---

### Task 8: 플로팅 버튼 + 위젯 패널

**Files:**
- Create: `apps/web/src/components/bambi/support-chat/support-chat-widget.tsx`
- Modify: `apps/web/src/app/layout.tsx` (마운트)

**Interfaces:**
- Consumes: `orpc.bambi.supportChat.getMyRoom / sendMessage / markRead`(Task 5), `orpc.bambi.onboarding.getMine`, `authClient.useSession()`(`@/lib/auth-client`), `POST /api/support-chat`(Task 7), shadcn `Button`·`Badge`·`Card`, `toast`(sonner)
- Produces: `<SupportChatWidget />` — 루트 레이아웃에서 무조건 렌더하고 컴포넌트가 스스로 숨김 판정.

- [ ] **Step 1: 위젯 컴포넌트**

`apps/web/src/components/bambi/support-chat/support-chat-widget.tsx` ("use client"). 핵심 동작 요구(구현은 shadcn 재사용, 임의 px 금지):

- 숨김 판정: `usePathname()`이 `/moderator`로 시작하면 null. 로그인 상태(`authClient.useSession()`)면 `orpc.bambi.onboarding.getMine` 조회(`enabled: !!session`) 후 `role === "admin"`이면 null.
- 방 조회: `useQuery({ ...orpc.bambi.supportChat.getMyRoom.queryOptions(), refetchInterval: open ? 3000 : 30_000, enabled: canPoll })`. `canPoll` = 로그인 상태이거나 `readSupportChatTokenFromCookieString(document.cookie)`가 있을 때 — **쿠키 없는 익명 방문자는 폴링하지 않는다**(전 방문자 30초 폴링은 서버 낭비). 쿠키 존재는 state로 들고 발급 후 갱신.
- 플로팅 버튼: `fixed right-4 bottom-20 md:bottom-6 z-50`(모바일 하단 탭을 피한다), 원형 `Button`(`size="icon"`) + `MessageCircle`(lucide) + 미읽음 `Badge`(unreadCount > 0일 때). 세로 배너 레일은 ≥1720px에서만 뜨는 우측 사이드이므로, 고정 우하단 버튼이 그 아래 영역에 자연히 놓인다 — 별도 레일 결합은 하지 않는다.
- 패널(open 시 버튼 위로): `Card` 기반, `fixed right-4 bottom-36 md:bottom-24 z-50 w-80 max-w-[calc(100vw-2rem)]`, 높이 `h-96`. 헤더 "운영자 문의" + 닫기. 본문: 메시지 목록(`overflow-y-auto`, inquirer 우측/admin 좌측 말풍선, `messages` 길이 변화 시 맨 아래로 스크롤), 하단 입력(`Input` + 전송 `Button`, Enter 전송, 1000자 제한은 `maxLength`).
- 열릴 때·새 admin 메시지 표시 시 `markRead` mutation 후 `getMyRoom` invalidate.
- 전송: 비로그인 + 쿠키 없음이면 먼저 `await fetch("/api/support-chat", { method: "POST" })`(실패 시 toast) 후 쿠키 존재 state 갱신, 이어서 `sendMessage` mutation → 성공 시 입력 비우고 invalidate, 429/403은 `toast.error(서버 message)`.
- 자동 열림: `useSearchParams()`의 `support-chat`이 `"1"`이면 마운트 시 open — 알림 클릭 딥링크(`/?support-chat=1`) 대응. (`useSearchParams`는 Suspense 경계가 필요하므로 위젯 내부에서 `<Suspense>`로 감싼 자식에서 읽거나 `window.location.search`를 마운트 시 1회 읽는 쪽이 단순하다 — 후자로 한다.)
- `room.isBlocked`면 입력창 대신 "문의 발신이 제한된 상태예요." 안내.

- [ ] **Step 2: 루트 레이아웃 마운트**

`apps/web/src/app/layout.tsx`의 `<Providers>` 안, `MainPopupLayer` 옆에 `<SupportChatWidget />` 추가(쿼리 훅을 쓰므로 Providers 내부여야 한다).

- [ ] **Step 3: 타입체크·린트**

Run: `pnpm --filter web check-types && npx ultracite check apps/web/src/components/bambi/support-chat/support-chat-widget.tsx apps/web/src/app/layout.tsx`
Expected: PASS / No fixes.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/support-chat/support-chat-widget.tsx apps/web/src/app/layout.tsx
git commit -m "feat: 문의 채팅 플로팅 버튼·위젯 패널"
```

---

### Task 9: 운영자 콘솔 페이지

**Files:**
- Create: `apps/web/src/app/moderator/support-chats/page.tsx`
- Modify: `apps/web/src/lib/bambi/moderator-navigation.ts`

**Interfaces:**
- Consumes: `orpc.bambi.supportChat.admin.*`(Task 6), `userRoleLabel`(`@/lib/bambi/moderation-labels`), shadcn `Button`·`Badge`·`Card`, `EmptyState`(`@/components/bambi/empty-state`)
- Produces: `/moderator/support-chats` 페이지, 내비 "콘텐츠" 그룹에 "문의 채팅" 메뉴

- [ ] **Step 1: 내비 항목**

`moderator-navigation.ts`의 "콘텐츠" 그룹에서 `고객센터` 항목 다음 줄에 추가:

```ts
			{ href: "/moderator/support-chats" as Route, label: "문의 채팅" },
```

- [ ] **Step 2: 페이지 구현**

`apps/web/src/app/moderator/support-chats/page.tsx` ("use client"). 요구 동작:

- 상태: `page`, `selectedRoomId`.
- 목록: `useQuery({ ...orpc.bambi.supportChat.admin.listRooms.queryOptions({ input: { page } }), refetchInterval: 5000 })`. 각 행: `displayName`(회원/비회원 구분 `Badge` — `isMember`로 "회원"/"비회원", **enum 원값 노출 금지**), `lastMessagePreview`(truncate), 상대시간, `unreadCount > 0`이면 카운트 `Badge`, `isBlocked`면 잠금 아이콘. 클릭 → `selectedRoomId` 설정. 페이지네이션은 이전/다음 버튼(totalCount 기반).
- 상세: `useQuery({ ...orpc.bambi.supportChat.admin.getRoom.queryOptions({ input: { roomId: selectedRoomId } }), enabled: !!selectedRoomId, refetchInterval: 5000 })`. 방 선택 시와 unreadCount > 0 감지 시 `admin.markRead` mutation 후 listRooms·getRoom invalidate.
- 레이아웃: 데스크톱 3열 `flex` — 목록 `w-80 shrink-0`, 채팅 `flex-1 min-w-0`(말풍선: inquirer 좌측·admin 우측 — 위젯과 반대 방향, 하단 입력 + 전송), 정보 패널 `w-64 shrink-0`. 모바일(`md` 미만): 방 미선택 시 목록만, 선택 시 뒤로가기 버튼 + 채팅(정보 패널은 채팅 상단 접이식 또는 숨김 — 접이식 권장).
- 정보 패널: `inquirer.kind === "member"`면 이름·`userRoleLabel(role)`·성별("female"→"여성"/"male"→"남성"/null→"미상" 로컬 상수 맵)·가입일·`organizationName`(있을 때). guest면 "비회원"·최초 문의일. 하단에 `setBlocked` 토글 `Button`(잠금/해제, variant="outline") — 성공 시 invalidate.
- 답변 전송: `admin.sendMessage` mutation, 성공 시 입력 비우고 getRoom·listRooms invalidate, 실패는 `toast.error`.

- [ ] **Step 3: 타입체크·린트**

Run: `pnpm --filter web check-types && npx ultracite check apps/web/src/app/moderator/support-chats/page.tsx apps/web/src/lib/bambi/moderator-navigation.ts`
Expected: PASS / No fixes.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/moderator/support-chats/page.tsx apps/web/src/lib/bambi/moderator-navigation.ts
git commit -m "feat: 운영자 문의 채팅 콘솔 (목록·채팅·문의자 정보 3열)"
```

---

### Task 10: 알림 라벨·딥링크

**Files:**
- Modify: `apps/web/src/lib/bambi/notification-labels.ts`

**Interfaces:**
- Consumes: Task 2에서 넓힌 `BambiNotificationTargetType`("support_chat")
- Produces: `support_chat` 알림의 제목·본문·href

- [ ] **Step 1: 라벨 추가**

`notification-labels.ts`에서 기존 `support_inquiry` 항목들이 있는 자리마다 `support_chat`을 나란히 추가한다:

- 액션별 제목 맵(`"support_inquiry:answered"`가 있는 맵): `"support_chat:message": "새 문의 채팅이 도착했어요"`, `"support_chat:replied": "문의 채팅에 답변이 도착했어요"` 추가.
- 운영자(역할 공유) 기본 제목 맵(121행 부근 `support_inquiry: "새 1:1 문의가 접수됐어요"`가 있는 맵): `support_chat: "새 문의 채팅이 도착했어요"` 추가.
- 폴백 제목 맵(137행 부근): `support_chat: "문의 채팅에 변동이 있어요"` 추가.
- 운영자 href 맵(297행 부근 `support_inquiry: "/moderator/support"`): `support_chat: "/moderator/support-chats"` 추가.
- 개인 href switch(333행 부근 `case` 목록): `case "support_chat":`에서 `"/?support-chat=1"` 반환(위젯 자동 열림 딥링크 — Task 8과 약속된 쿼리 파라미터).

기존 코드의 정확한 맵·함수 구조를 열어 확인하고 같은 꼴로 끼워 넣는다. `notificationBody`가 targetType별 본문을 요구하는 구조면 제목과 동일 문구 재사용이 아니라 "운영자 문의 채팅을 확인해 주세요." 수준의 짧은 본문을 준다.

또한 `packages/api/src/routers/bambi/notifications.ts`의 알림함 목록/카운트가 `chat_message`·`chat_room`을 **제외**하는 방식인지 열어 확인한다 — 제외 목록 방식이면 `support_chat`은 자동 포함이므로 변경 없음, 포함 목록 방식이면 `support_chat`을 추가한다.

- [ ] **Step 2: 타입체크·린트**

Run: `pnpm --filter web check-types && npx ultracite check apps/web/src/lib/bambi/notification-labels.ts`
Expected: PASS / No fixes.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/lib/bambi/notification-labels.ts
git commit -m "feat: 문의 채팅 알림 라벨·딥링크 추가"
```

---

### Task 11: 매뉴얼 갱신 + 전체 검증

**Files:**
- Modify: `docs/manual/seeker-manual.md`, `docs/manual/employer-manual.md`, `docs/manual/moderator-manual.md`

- [ ] **Step 1: 매뉴얼**

각 매뉴얼의 기존 목차 구조를 열어 확인하고 같은 꼴로 짧은 섹션을 추가한다:
- seeker·employer: "운영자 문의 채팅" — 우하단 플로팅 버튼, 로그인 없이도 가능, 답변 오면 버튼 뱃지(회원은 알림함에도), 1분 10회 발신 제한.
- moderator: "문의 채팅" 화면(`/moderator/support-chats`) — 공용 큐(모든 운영자가 같은 목록), 미읽음 뱃지, 문의자 정보 패널, 도배 방 잠금, 새 문의는 알림함으로 통지.

- [ ] **Step 2: 전체 검증**

Run(워크트리):
```bash
pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types
```
Run(cwd=packages/api): `npx vitest run test/services/bambi-support-chat-token.test.ts test/services/bambi-support-chat.test.ts`
Run: `npx ultracite check <이번 브랜치에서 만들거나 수정한 모든 파일 경로>`
Expected: 전부 PASS. dev 서버 기동·빌드는 하지 않는다 — 동작 확인은 사용자(단, dev DB에 0093 마이그레이션이 적용되기 전에는 새 테이블 조회가 500이므로, 보고 시 "마이그레이션 적용 필요"를 명시).

- [ ] **Step 3: 커밋**

```bash
git add docs/manual/seeker-manual.md docs/manual/employer-manual.md docs/manual/moderator-manual.md
git commit -m "docs: 매뉴얼에 운영자 문의 채팅 안내 추가"
```

---

## 배포 전 체크리스트 (사용자 확인 사항)

- `0093_*.sql` 마이그레이션을 dev → 운영 순으로 적용(`db:migrate`, 적용 후 새 테이블·enum 값·actor_user_id nullable 확인). `db:push` 금지.
- 레이트리밋 카운터는 인메모리 — server `max-instances=1` 유지 전제.
- 신규 env 없음(`BAMBI_GUEST_TOKEN_SECRET` 재사용).

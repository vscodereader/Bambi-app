# native 포인트몰·알림(SSE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** native 앱에 구직자 포인트몰(목록·구매·내 주문 취소)과 구직자·구인자 알림(SSE 실시간 배지·목록·읽음·딥링크)을 기존 서버 계약만으로 연결한다.

**Architecture:** 서버 변경은 없다(새 프로시저·마이그레이션·의존성 없음). web 전용이던 알림 문구·주문 상태 라벨 순수 함수를 `packages/api/src/services`로 옮겨 web과 native가 공유하고, native는 `expo/fetch` 스트리밍으로 `/sse/notifications`를 직접 파싱하는 훅으로 react-query 캐시를 무효화한다. 화면은 기존 native 관례(`BambiScreen`·`StateCard`·heroui-native `Dialog`/`Chip`·"더 보기" 페이지네이션)를 그대로 따른다.

**Tech Stack:** Expo SDK 56 / expo-router / heroui-native / @tanstack/react-query + oRPC(`orpc.bambi.*`) / vitest(순수 함수만) / biome(ultracite)

**Spec:** `docs/superpowers/specs/2026-09-07-native-point-shop-alerts-design.md`

## Global Constraints

- **의존성 추가 금지.** `expo-notifications` 등 원격 푸시는 보류(스펙 §1). `package.json` 변경 없음.
- **빌드·dev 서버·에뮬레이터 실행 금지.** 검증은 `pnpm --filter <pkg> check-types`, `pnpm --filter <pkg> test`, `pnpm exec ultracite check <경로>`(경로 인자 필수)만.
- **`packages/api` 라우터 테스트 스위트(`src/routers/bambi`) 실행 금지**(dev DB를 지운다). api 테스트는 `cd packages/api && pnpm exec vitest run test/services/<파일>`로 파일 단위 실행.
- **enum 원값 화면 노출 금지.** targetType·action·status는 항상 라벨 함수를 거친다.
- **native 새 라우트 Href는 `"/(seeker)/..." as Href`로 캐스팅**(typedRoutes 생성이 dev 서버 없이 돌지 않음, seeker-header.tsx 주석과 같은 이유).
- **native UI는 `.agents/skills/heroui-native/SKILL.md`와 https://docs.uniwind.dev/llms-full.txt 를 따른다.** 임의 px(`[Npx]`) 금지, Tailwind 스케일 토큰만.
- **native 화면이 없는 알림 타입은 읽음 처리만·이동 없음**(스펙 §4.3 표).
- **커밋 메시지:** 한국어 `type: 제목` + 빈 줄 + `- ` 블릿 본문. 메시지는 파일로 써서 `git commit -F`. 서브에이전트는 커밋하지 않는다(컨트롤러가 순차 커밋).
- 테스트 디렉토리: api는 `packages/api/test/services/*.test.ts`(`@/` = src), native는 `apps/native/src/lib/*.test.ts`(콜로케이션 허용, vitest include가 `{src,test}/**`).

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `packages/api/src/services/bambi-notification-labels.ts` | 알림 제목·본문 순수 함수 + `BambiNotificationView` (web에서 이동) | Task 1 |
| `packages/api/src/services/bambi-ad-exposure.ts` | `LISTING_QUEUE_SHORT_LABELS` 추가 | Task 1 |
| `packages/api/src/services/bambi-team-labels.ts` | `organizationRoleLabel` (web에서 이동) | Task 1 |
| `apps/web/src/lib/bambi/notification-labels.ts` | `notificationHref`만 남기고 문구는 re-export | Task 1 |
| `apps/web/src/lib/bambi/exposure.ts`, `team-labels.ts` | 옮긴 맵 re-export | Task 1 |
| `packages/api/test/services/bambi-notification-labels.test.ts` | 문구 테스트(web에서 이동) | Task 1 |
| `packages/api/src/services/bambi-point-shop-labels.ts` | 주문 상태·혜택 유형·대상 라벨(web에서 이동) | Task 2 |
| `apps/web/src/lib/bambi/point-shop-labels.ts` | re-export | Task 2 |
| `apps/native/src/lib/notification-stream.ts` | SSE 프레임 파서(순수) + `useBambiNotificationStream` 훅 | Task 3 |
| `apps/native/src/components/notification-stream-gate.tsx` | 세션 있을 때만 훅을 켜는 루트 구독 컴포넌트 | Task 3 |
| `apps/native/app/_layout.tsx` | 게이트 마운트 | Task 3 |
| `apps/native/src/components/notification-bell.tsx` | 종 아이콘 + 안읽음 배지 | Task 4 |
| `apps/native/src/components/seeker-header.tsx`, `employer-header.tsx` | 벨 교체/추가 | Task 4 |
| `apps/native/src/lib/notification-route.ts` | 알림 → native 경로 순수 함수 | Task 5 |
| `apps/native/src/components/notifications-screen.tsx` | 공용 알림 목록 화면 | Task 6 |
| `apps/native/app/(seeker)/notifications.tsx`, `(employer)/notifications.tsx`, `(employer)/_layout.tsx` | 라우트 | Task 6 |
| `apps/native/src/lib/point-shop.ts` | 구매 모드 판정·문구(순수) | Task 7 |
| `apps/native/app/(seeker)/point-shop.tsx` | 포인트몰 화면 | Task 7 |

---

### Task 1: 알림 문구 함수를 packages/api로 이동

**Files:**
- Create: `packages/api/src/services/bambi-notification-labels.ts`
- Create: `packages/api/src/services/bambi-team-labels.ts`
- Modify: `packages/api/src/services/bambi-ad-exposure.ts` (`EXPOSURE_TYPE_LABELS` 아래)
- Modify: `apps/web/src/lib/bambi/notification-labels.ts`
- Modify: `apps/web/src/lib/bambi/exposure.ts:28-31`
- Modify: `apps/web/src/lib/bambi/team-labels.ts:5-14`
- Create: `packages/api/test/services/bambi-notification-labels.test.ts`
- Modify: `apps/web/test/lib/bambi/notification-labels.test.ts`

**Interfaces:**
- Produces: `BambiNotificationView { chatRoomId: null|string; metadata: Record<string,unknown>|null; recipientRole: null|string; targetId: string; targetType: string }`, `notificationTitle(item): string`, `notificationBody(item): null|string` — 모두 `@bambi-app/api/services/bambi-notification-labels`에서 import. `LISTING_QUEUE_SHORT_LABELS`는 `@bambi-app/api/services/bambi-ad-exposure`, `organizationRoleLabel`은 `@bambi-app/api/services/bambi-team-labels`.

- [ ] **Step 1: 라벨 맵 두 개를 packages/api에 둔다**

`packages/api/src/services/bambi-ad-exposure.ts`의 `EXPOSURE_TYPE_LABELS` 정의 바로 아래에 추가:

```ts
// 리스팅 대기열 배지·알림 문구용 짧은 라벨. EXPOSURE_TYPE_LABELS("스페셜 채용")는 배지엔
// 길어서 축약 맵을 따로 둔다. 대기열은 스페셜·추천 2종에만 존재한다(web exposure.ts에서 이동).
export const LISTING_QUEUE_SHORT_LABELS = {
	recommended: "추천",
	special: "스페셜",
} as const;
```

`packages/api/src/services/bambi-team-labels.ts` 신설:

```ts
// 조직 관리 역할(owner/manager/staff) 표시 라벨. 알림 문구(packages/api)와 web 팀 관리 화면이
// 공유한다. Record<string,string> + 알 수 없는 값에도 중립 폴백(enum 원값 노출 금지).
export const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
	manager: "매니저",
	owner: "소유자",
	staff: "스태프",
};

export function organizationRoleLabel(role: string): string {
	return ORGANIZATION_ROLE_LABELS[role] ?? "구성원";
}
```

`apps/web/src/lib/bambi/exposure.ts`에서 `LISTING_QUEUE_SHORT_LABELS` 정의(주석 포함 28~31행)를 지우고 파일 상단 import 아래에:

```ts
export { LISTING_QUEUE_SHORT_LABELS } from "@bambi-app/api/services/bambi-ad-exposure";
```

`apps/web/src/lib/bambi/team-labels.ts`에서 `ORGANIZATION_ROLE_LABELS`·`organizationRoleLabel` 정의(5~14행)를 지우고 상단에:

```ts
export {
	ORGANIZATION_ROLE_LABELS,
	organizationRoleLabel,
} from "@bambi-app/api/services/bambi-team-labels";
```

- [ ] **Step 2: 문구 함수 파일을 만든다**

`packages/api/src/services/bambi-notification-labels.ts` 신설. 내용은 `apps/web/src/lib/bambi/notification-labels.ts`의 **1행 주석부터 `notificationBody` 함수 끝(`return visible ? readString(item.metadata, "reason") : null; }`)까지**를 그대로 옮기되 다음만 바꾼다.

1. import 블록을 아래로 교체(chat-paths·community import는 href 전용이라 제외):

```ts
import {
	EXPOSURE_TYPE_LABELS,
	LISTING_QUEUE_SHORT_LABELS,
} from "./bambi-ad-exposure";
import { organizationRoleLabel } from "./bambi-team-labels";
```

2. `export const NOTIFICATIONS_HREF = "/seeker/notifications";` 줄은 옮기지 않는다(web에 남긴다).
3. 파일 첫 주석 끝에 한 줄 추가: `// web·native·(후속)푸시 본문이 같은 함수를 쓴다 — 문구는 여기 한 곳에서만 고친다.`

- [ ] **Step 3: web 파일은 href만 남긴다**

`apps/web/src/lib/bambi/notification-labels.ts`를 다음 구조로 정리한다.

```ts
// 알림 한 건의 딥링크(web 경로) 맵. 제목·본문 문구는 packages/api 서비스로 옮겨 native와
// 공유하고, 여기서는 re-export만 한다(호출부 import 경로 유지). 경로는 플랫폼별이라 남긴다.

import {
	type BambiNotificationView,
	notificationTitle,
	notificationBody,
} from "@bambi-app/api/services/bambi-notification-labels";
import { buildChatRoomPath, CHAT_LIST_PATH } from "./chat-paths";
import {
	COMMUNITY_BOARDS,
	communityCrawledPath,
	communityPostPath,
} from "./community";

export { type BambiNotificationView, notificationBody, notificationTitle };

export const NOTIFICATIONS_HREF = "/seeker/notifications";

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
```

그 아래에 기존 `boardSlug`부터 `notificationHref` 끝까지(원본 파일의 `const boardSlug = ...` 이후 전부)를 그대로 둔다. `readNumber`·`queueSectionLabel`·`pointTransactionTitle`·`TITLE_*`·`SHARED_TITLE_BY_TARGET`·`listingQueueTitle`·`dynamicTitle`·`notificationTitle`·`REASON_VISIBLE_OUTCOMES`·`notificationBody`·`EXPOSURE`/`team-labels` import는 삭제한다.

- [ ] **Step 4: 테스트를 나눈다**

`packages/api/test/services/bambi-notification-labels.test.ts` 신설. `apps/web/test/lib/bambi/notification-labels.test.ts`의 **1~399행**(import·`view` 헬퍼·`describe("notificationTitle")`·`describe("notificationBody")`)과 **577~600행**(`describe("direct_message")`)을 옮기되:

- import를 다음으로 교체:

```ts
import { describe, expect, it } from "vitest";

import {
	notificationBody,
	notificationTitle,
} from "@/services/bambi-notification-labels";
```

- `direct_message` describe 안의 `it("착지는 쪽지함이다", ...)` 케이스는 옮기지 않는다(href는 web).

web 테스트 파일은 `import` + `view` 헬퍼 + `describe("notificationHref")`(401~575행) + `direct_message`의 href 케이스 하나만 남긴다. import는 `notificationHref`만.

- [ ] **Step 5: 테스트·타입 검증**

Run:
```bash
cd packages/api && pnpm exec vitest run test/services/bambi-notification-labels.test.ts
cd ../../apps/web && pnpm exec vitest run test/lib/bambi/notification-labels.test.ts
cd .. && pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types
pnpm exec ultracite check packages/api/src/services/bambi-notification-labels.ts packages/api/src/services/bambi-team-labels.ts packages/api/src/services/bambi-ad-exposure.ts apps/web/src/lib/bambi/notification-labels.ts apps/web/src/lib/bambi/exposure.ts apps/web/src/lib/bambi/team-labels.ts packages/api/test/services/bambi-notification-labels.test.ts apps/web/test/lib/bambi/notification-labels.test.ts
```
Expected: api 테스트 34개 내외 PASS, web 테스트 PASS, 타입 오류 0, biome 오류 0. web의 `use-bambi-notification-stream.ts`·`notifications-screen.tsx`는 import 경로가 그대로라 수정 없음(타입체크가 보증).

- [ ] **Step 6: Commit**

```
refactor: 알림 문구 함수를 packages/api 서비스로 이동해 native와 공유

- notificationTitle/notificationBody/BambiNotificationView를 bambi-notification-labels.ts로, LISTING_QUEUE_SHORT_LABELS·organizationRoleLabel도 api로 이동
- web notification-labels.ts는 notificationHref만 남기고 문구는 re-export(호출부 import 유지)
- 문구 테스트는 packages/api/test/services로, href 테스트는 web에 잔류
```

---

### Task 2: 포인트몰 라벨을 packages/api로 이동

**Files:**
- Create: `packages/api/src/services/bambi-point-shop-labels.ts`
- Modify: `apps/web/src/lib/bambi/point-shop-labels.ts`
- Create: `packages/api/test/services/bambi-point-shop-labels.test.ts`

**Interfaces:**
- Produces: `pointShopBuyerStatusLabel(status: string): string`, `pointShopOrderStatusLabel`, `pointShopBenefitTypeLabel(benefitType: string): string`, `pointShopAudienceLabel` — `@bambi-app/api/services/bambi-point-shop-labels`.

- [ ] **Step 1: 실패하는 테스트**

`packages/api/test/services/bambi-point-shop-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	POINT_SHOP_AUDIENCES,
	POINT_SHOP_BENEFIT_TYPES,
	POINT_SHOP_ORDER_STATUSES,
} from "@/services/bambi-point-shop";
import {
	pointShopAudienceLabel,
	pointShopBenefitTypeLabel,
	pointShopBuyerStatusLabel,
	pointShopOrderStatusLabel,
} from "@/services/bambi-point-shop-labels";

const FALLBACK = /확인 필요/;

describe("point shop labels", () => {
	it("주문 상태 enum 전수에 구매자·운영자 라벨이 있다", () => {
		for (const status of POINT_SHOP_ORDER_STATUSES) {
			expect(pointShopBuyerStatusLabel(status)).not.toMatch(FALLBACK);
			expect(pointShopOrderStatusLabel(status)).not.toMatch(FALLBACK);
		}
	});

	it("혜택 유형·대상 enum 전수에 라벨이 있다", () => {
		for (const type of POINT_SHOP_BENEFIT_TYPES) {
			expect(pointShopBenefitTypeLabel(type)).not.toMatch(FALLBACK);
		}
		for (const audience of POINT_SHOP_AUDIENCES) {
			expect(pointShopAudienceLabel(audience)).not.toMatch(FALLBACK);
		}
	});

	it("모르는 값은 원값 대신 중립 폴백을 낸다", () => {
		expect(pointShopBuyerStatusLabel("weird")).toBe("상태 확인 필요");
		expect(pointShopBenefitTypeLabel("weird")).toBe("혜택 확인 필요");
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd packages/api && pnpm exec vitest run test/services/bambi-point-shop-labels.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 파일 이동**

`packages/api/src/services/bambi-point-shop-labels.ts`를 만들고 `apps/web/src/lib/bambi/point-shop-labels.ts`의 내용 전체를 그대로 옮긴다(수정 없음). web 파일은 다음 한 줄로 교체:

```ts
// 라벨은 packages/api로 옮겨 native와 공유한다 — web 호출부 import 경로는 유지.
export {
	pointShopAudienceLabel,
	pointShopBenefitTypeLabel,
	pointShopBuyerStatusLabel,
	pointShopOrderStatusLabel,
} from "@bambi-app/api/services/bambi-point-shop-labels";
```

- [ ] **Step 4: 검증**

Run:
```bash
cd packages/api && pnpm exec vitest run test/services/bambi-point-shop-labels.test.ts
cd ../.. && pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types
pnpm exec ultracite check packages/api/src/services/bambi-point-shop-labels.ts apps/web/src/lib/bambi/point-shop-labels.ts packages/api/test/services/bambi-point-shop-labels.test.ts
```
Expected: 3 PASS, 타입·biome 오류 0.

- [ ] **Step 5: Commit**

```
refactor: 포인트몰 상태·혜택·대상 라벨을 packages/api로 이동

- point-shop-labels.ts를 api 서비스로 옮기고 web은 re-export
- enum 전수 커버 테스트 추가
```

---

### Task 3: native SSE 파서·구독 훅·루트 게이트

**Files:**
- Create: `apps/native/src/lib/notification-stream.ts`
- Create: `apps/native/src/lib/notification-stream.test.ts`
- Create: `apps/native/src/components/notification-stream-gate.tsx`
- Modify: `apps/native/app/_layout.tsx`

**Interfaces:**
- Consumes: `BAMBI_NOTIFICATION_SSE_EVENT`("bambi:notification"), `BAMBI_HEARTBEAT_SSE_EVENT`("bambi:ping"), `BambiNotificationEvent` from `@bambi-app/api/services/bambi-notification-stream`; `authClient.getCookie()`; `orpc`, `queryClient` from `@/src/lib/orpc`.
- Produces: `parseSseChunk(buffer: string): { frames: SseFrame[]; rest: string }`, `SseFrame { event: string; data: string }`, `useBambiNotificationStream(enabled: boolean): void`.

- [ ] **Step 1: 파서 실패 테스트**

`apps/native/src/lib/notification-stream.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseSseChunk } from "./notification-stream";

describe("parseSseChunk", () => {
	it("빈 줄로 끝난 프레임만 돌려주고 나머지는 버퍼에 남긴다", () => {
		const { frames, rest } = parseSseChunk(
			'event: bambi:ping\ndata: {}\n\nevent: bambi:notification\ndata: {"a":1'
		);
		expect(frames).toEqual([{ data: "{}", event: "bambi:ping" }]);
		expect(rest).toBe('event: bambi:notification\ndata: {"a":1');
	});

	it("data 여러 줄은 개행으로 잇고 CRLF도 받는다", () => {
		const { frames, rest } = parseSseChunk(
			"event: x\r\ndata: a\r\ndata: b\r\n\r\n"
		);
		expect(frames).toEqual([{ data: "a\nb", event: "x" }]);
		expect(rest).toBe("");
	});

	it("event가 없으면 message, 주석(:)과 빈 프레임은 버린다", () => {
		const { frames } = parseSseChunk(": keepalive\n\ndata: hi\n\n\n\n");
		expect(frames).toEqual([{ data: "hi", event: "message" }]);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/native && pnpm exec vitest run src/lib/notification-stream.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 파서 + 훅 구현**

`apps/native/src/lib/notification-stream.ts`:

```ts
// 알림 SSE(/sse/notifications) native 구독. RN에는 EventSource가 없어 expo/fetch의 스트리밍
// 응답 본문을 직접 읽어 `event:`/`data:` 프레임을 자른다. 규약(이벤트명·30초 하트비트·
// 75초 무프레임 재연결·백오프)은 web use-bambi-notification-stream.ts와 같다.
// 연결은 앱이 active일 때만 유지한다 — background에서는 OS가 소켓을 끊으므로 우리가 먼저
// abort하고, 복귀 시 다시 열며 놓친 알림은 재전송되지 않으니 정본(unreadCount·list)을 재조회한다.
import {
	BAMBI_HEARTBEAT_SSE_EVENT,
	BAMBI_NOTIFICATION_SSE_EVENT,
	type BambiNotificationEvent,
} from "@bambi-app/api/services/bambi-notification-stream";
import { env } from "@bambi-app/env/native";
import type { QueryKey } from "@tanstack/react-query";
import { fetch } from "expo/fetch";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/src/lib/orpc";

export interface SseFrame {
	data: string;
	event: string;
}

const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;

// 순수 파서. 완성된 프레임(빈 줄로 끝난 것)만 돌려주고 잘린 꼬리는 rest로 되돌려 다음 청크에
// 이어 붙인다. event가 없는 프레임은 SSE 규약대로 "message"다.
export function parseSseChunk(buffer: string): {
	frames: SseFrame[];
	rest: string;
} {
	const parts = buffer.split(FRAME_SEPARATOR);
	const rest = parts.pop() ?? "";
	const frames: SseFrame[] = [];

	for (const part of parts) {
		let event = "message";
		const data: string[] = [];

		for (const line of part.split(LINE_SEPARATOR)) {
			if (line.startsWith(":") || line.length === 0) {
				continue;
			}
			if (line.startsWith("event:")) {
				event = line.slice("event:".length).trim();
			} else if (line.startsWith("data:")) {
				data.push(line.slice("data:".length).trimStart());
			}
		}

		if (data.length > 0) {
			frames.push({ data: data.join("\n"), event });
		}
	}

	return { frames, rest };
}

const STREAM_URL = `${env.EXPO_PUBLIC_SERVER_URL}/sse/notifications`;
const REOPEN_BASE_MS = 1000;
const REOPEN_MAX_MS = 60_000;
const STREAM_SILENCE_LIMIT_MS = 75_000;
const WATCHDOG_INTERVAL_MS = 15_000;
const CHAT_TARGET_TYPES = new Set(["chat_message", "chat_room"]);

const parseNotificationEvent = (
	data: string
): BambiNotificationEvent | null => {
	try {
		const parsed = JSON.parse(data) as Partial<BambiNotificationEvent>;
		if (!(parsed.notificationId && parsed.targetType)) {
			return null;
		}
		return {
			action: parsed.action ?? null,
			chatRoomId: parsed.chatRoomId ?? null,
			createdAt: parsed.createdAt ?? new Date().toISOString(),
			notificationId: parsed.notificationId,
			recipientRole: parsed.recipientRole ?? null,
			targetId: parsed.targetId ?? "",
			targetType: parsed.targetType,
		};
	} catch {
		return null;
	}
};

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
	invalidate(orpc.bambi.directMessages.unreadCount.queryKey());
};

const handleEvent = (event: BambiNotificationEvent) => {
	if (event.chatRoomId) {
		invalidate(orpc.bambi.chats.getById.key({ input: { id: event.chatRoomId } }));
	}
	if (CHAT_TARGET_TYPES.has(event.targetType)) {
		refreshChat();
		return;
	}
	refreshNotifications();
};

// 한 번의 연결 수명. 반환한 함수로 abort한다. 연결이 끝나면(정상 종료·오류·워치독) onClose를
// 불러 호출부가 백오프 재연결을 결정한다.
const openStream = (onClose: () => void): (() => void) => {
	const controller = new AbortController();
	let lastFrameAt = Date.now();
	let closed = false;

	const finish = () => {
		if (closed) {
			return;
		}
		closed = true;
		clearInterval(watchdog);
		controller.abort();
		onClose();
	};

	const watchdog = setInterval(() => {
		if (Date.now() - lastFrameAt >= STREAM_SILENCE_LIMIT_MS) {
			finish();
		}
	}, WATCHDOG_INTERVAL_MS);

	(async () => {
		const cookie = authClient.getCookie();
		const response = await fetch(STREAM_URL, {
			headers: {
				Accept: "text/event-stream",
				...(cookie ? { Cookie: cookie } : {}),
			},
			signal: controller.signal,
		});
		if (!(response.ok && response.body)) {
			throw new Error(`sse ${response.status}`);
		}

		// 연결이 (다시) 열렸다 — 끊긴 동안의 알림은 재전송되지 않으므로 정본을 읽는다.
		refreshChat();
		refreshNotifications();

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (!closed) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			lastFrameAt = Date.now();
			buffer += decoder.decode(value, { stream: true });
			const parsed = parseSseChunk(buffer);
			buffer = parsed.rest;

			for (const frame of parsed.frames) {
				if (frame.event === BAMBI_HEARTBEAT_SSE_EVENT) {
					continue;
				}
				if (frame.event === BAMBI_NOTIFICATION_SSE_EVENT) {
					const event = parseNotificationEvent(frame.data);
					if (event) {
						handleEvent(event);
					}
				}
			}
		}
	})()
		.catch(() => undefined)
		.finally(finish);

	return finish;
};

/**
 * 알림 SSE 구독 훅. enabled(로그인 세션)일 때 앱이 active인 동안만 연결을 유지한다.
 * 루트에서 한 번만 마운트한다(notification-stream-gate.tsx).
 */
export function useBambiNotificationStream(enabled: boolean): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}

		let abort: (() => void) | null = null;
		let reopenTimer: null | ReturnType<typeof setTimeout> = null;
		let attempt = 0;
		let disposed = false;
		let appState: AppStateStatus = AppState.currentState;

		const clearReopen = () => {
			if (reopenTimer) {
				clearTimeout(reopenTimer);
				reopenTimer = null;
			}
		};

		const connect = () => {
			if (disposed || abort || appState !== "active") {
				return;
			}
			const startedAt = Date.now();
			abort = openStream(() => {
				abort = null;
				// 5초 이상 살아 있던 연결이 끊긴 것은 정상 수명 종료로 보고 백오프를 되감는다.
				if (Date.now() - startedAt > 5000) {
					attempt = 0;
				}
				if (disposed || appState !== "active") {
					return;
				}
				const delay = Math.min(REOPEN_BASE_MS * 2 ** attempt, REOPEN_MAX_MS);
				attempt += 1;
				clearReopen();
				reopenTimer = setTimeout(() => {
					reopenTimer = null;
					connect();
				}, delay);
			});
		};

		const disconnect = () => {
			clearReopen();
			abort?.();
			abort = null;
		};

		const subscription = AppState.addEventListener("change", (next) => {
			appState = next;
			if (next === "active") {
				attempt = 0;
				connect();
			} else {
				disconnect();
			}
		});

		connect();

		return () => {
			disposed = true;
			subscription.remove();
			disconnect();
		};
	}, [enabled]);
}
```

- [ ] **Step 4: 파서 테스트 통과 확인**

Run: `cd apps/native && pnpm exec vitest run src/lib/notification-stream.test.ts`
Expected: 3 PASS. (vitest는 node 환경이라 `expo/fetch`·`react-native` import가 문제될 수 있다. 실패하면 `parseSseChunk`와 `SseFrame`을 `apps/native/src/lib/sse-parser.ts`로 분리하고 테스트는 그 파일을 import한다 — 훅 파일은 `export { parseSseChunk } from "./sse-parser"`로 재노출.)

- [ ] **Step 5: 루트 게이트 마운트**

`apps/native/src/components/notification-stream-gate.tsx`:

```tsx
import { authClient } from "@/lib/auth-client";
import { useBambiNotificationStream } from "@/src/lib/notification-stream";

// 로그인 세션이 있을 때만 알림 SSE를 연다. 게스트·비로그인은 알림이 없어 연결하지 않는다.
// 루트 레이아웃에 한 번만 둔다 — 화면마다 열면 계정당 5스트림 상한에 걸린다.
export function NotificationStreamGate() {
	const session = authClient.useSession();
	useBambiNotificationStream(Boolean(session.data?.user));
	return null;
}
```

`apps/native/app/_layout.tsx`의 `Layout`에서 `<StackLayout />` 바로 위에 `<NotificationStreamGate />`를 추가하고 import한다:

```tsx
import { NotificationStreamGate } from "@/src/components/notification-stream-gate";
// ...
						<HeroUINativeProvider>
							<NotificationStreamGate />
							<StackLayout />
						</HeroUINativeProvider>
```

- [ ] **Step 6: 검증**

Run:
```bash
pnpm --filter native check-types
pnpm exec ultracite check apps/native/src/lib/notification-stream.ts apps/native/src/lib/notification-stream.test.ts apps/native/src/components/notification-stream-gate.tsx apps/native/app/_layout.tsx
```
Expected: 오류 0. (`pnpm --filter native`가 안 잡히면 `cd apps/native && pnpm check-types`.)

- [ ] **Step 7: Commit**

```
feat(native): 알림 SSE 구독 훅 추가 - expo/fetch 스트리밍 파서·AppState 연동

- parseSseChunk 순수 파서(청크 경계·멀티라인 data·CRLF) + 테스트 3건
- useBambiNotificationStream: active에서만 연결, 75초 무프레임 워치독, 1s→60s 백오프, 재연결 시 정본 재조회
- 루트 레이아웃 NotificationStreamGate로 로그인 세션일 때만 구독
```

---

### Task 4: 헤더 종 아이콘 배지(구직자·구인자)

**Files:**
- Create: `apps/native/src/components/notification-bell.tsx`
- Modify: `apps/native/src/components/seeker-header.tsx:118-122` (알림 `HeaderIconButton` 교체)
- Modify: `apps/native/src/components/employer-header.tsx`

**Interfaces:**
- Produces: `NotificationBell({ href }: { href: Href })`.

- [ ] **Step 1: 벨 컴포넌트**

`apps/native/src/components/notification-bell.tsx`:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/src/lib/orpc";

const MAX_BADGE = 9;

// 헤더 알림 종 + 안읽음 배지. 룩은 seeker-header의 HeaderIconButton(outline·rounded-2xl·h-11)과
// 같고, 배지는 web notification-bell.tsx처럼 9 초과를 "9+"로 접는다. 카운트 쿼리는 알림
// 화면·SSE 훅과 같은 키라 캐시를 공유한다(읽음 처리·이벤트가 바로 반영된다).
export function NotificationBell({ href }: { href: Href }) {
	const foreground = useThemeColor("foreground");
	const router = useRouter();
	const session = authClient.useSession();
	const unreadQuery = useQuery({
		...orpc.bambi.notifications.unreadCount.queryOptions(),
		enabled: Boolean(session.data?.user),
	});
	const unread = unreadQuery.data?.unreadCount ?? 0;
	const badge = unread > MAX_BADGE ? `${MAX_BADGE}+` : String(unread);

	return (
		<Pressable
			accessibilityLabel={unread > 0 ? `알림 ${unread}개 안 읽음` : "알림"}
			accessibilityRole="button"
			className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
			onPress={() => router.push(href)}
		>
			<Ionicons color={foreground} name="notifications-outline" size={22} />
			{unread > 0 ? (
				<View className="absolute top-1 right-1 h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1">
					<Text className="font-bold text-[10px] text-danger-foreground">
						{badge}
					</Text>
				</View>
			) : null}
		</Pressable>
	);
}
```

(`text-[10px]`는 배지 폰트에 Tailwind 스케일 `text-xs`(12)가 커서 예외로 둔다. 구현자는 uniwind 문서에 더 작은 스케일 토큰이 있으면 그것으로 바꾼다.)

- [ ] **Step 2: 구직자 헤더 교체**

`seeker-header.tsx`의 `SeekerHomeHeader`에서 알림용 `<HeaderIconButton ... name="notifications-outline" />` 블록을 다음으로 교체하고 import 추가:

```tsx
import { NotificationBell } from "@/src/components/notification-bell";
// ...
					<NotificationBell href={"/(seeker)/notifications" as unknown as Href} />
```

- [ ] **Step 3: 구인자 헤더 추가**

`employer-header.tsx`의 `<RoleSwitchMenu currentArea="/(employer)" />`를 다음으로 감싼다:

```tsx
import type { Href } from "expo-router";
import { NotificationBell } from "@/src/components/notification-bell";
// ...
				<View className="flex-row items-center gap-2">
					<NotificationBell href={"/(employer)/notifications" as unknown as Href} />
					<RoleSwitchMenu currentArea="/(employer)" />
				</View>
```

- [ ] **Step 4: 검증**

Run:
```bash
cd apps/native && pnpm check-types
cd ../.. && pnpm exec ultracite check apps/native/src/components/notification-bell.tsx apps/native/src/components/seeker-header.tsx apps/native/src/components/employer-header.tsx
```
Expected: 오류 0.

- [ ] **Step 5: Commit**

```
feat(native): 헤더 알림 종에 안읽음 배지 추가 - 구인자 헤더에도 종 신설

- NotificationBell 공용 컴포넌트(unreadCount 쿼리·9+ 접기·접근성 라벨)
- SeekerHomeHeader 알림 버튼 교체, EmployerHomeHeader 역할 전환 옆에 추가
```

---

### Task 5: 알림 → native 경로 순수 함수

**Files:**
- Create: `apps/native/src/lib/notification-route.ts`
- Create: `apps/native/src/lib/notification-route.test.ts`

**Interfaces:**
- Consumes: `BambiNotificationView`.
- Produces: `type NotificationRole = "employer" | "seeker"`, `notificationRoute(item: BambiNotificationView, role: NotificationRole): null | string`.

- [ ] **Step 1: 실패 테스트**

`apps/native/src/lib/notification-route.test.ts`:

```ts
import type { BambiNotificationView } from "@bambi-app/api/services/bambi-notification-labels";
import { describe, expect, it } from "vitest";

import { notificationRoute } from "./notification-route";

const view = (
	overrides: Partial<BambiNotificationView>
): BambiNotificationView => ({
	chatRoomId: null,
	metadata: null,
	recipientRole: null,
	targetId: "target-1",
	targetType: "job_post",
	...overrides,
});

describe("notificationRoute", () => {
	it("채팅 축은 역할별 채팅방, 방이 없으면 채팅 탭", () => {
		const withRoom = view({ chatRoomId: "room-1", targetType: "chat_message" });
		expect(notificationRoute(withRoom, "seeker")).toBe("/(seeker)/chats/room-1");
		expect(notificationRoute(withRoom, "employer")).toBe(
			"/(employer)/chats/room-1"
		);
		expect(
			notificationRoute(view({ targetType: "contact_reveal" }), "seeker")
		).toBe("/(seeker)/(tabs)/chats");
	});

	it("구직자 전용 타입은 seeker 셸에서만 이동한다", () => {
		expect(
			notificationRoute(view({ targetType: "interview_schedule" }), "seeker")
		).toBe("/(seeker)/me/interviews");
		expect(
			notificationRoute(view({ targetType: "interview_schedule" }), "employer")
		).toBeNull();
		expect(
			notificationRoute(view({ targetType: "direct_message" }), "seeker")
		).toBe("/(seeker)/me/messages");
		expect(notificationRoute(view({ targetType: "report" }), "seeker")).toBe(
			"/(seeker)/me/reports"
		);
		expect(
			notificationRoute(view({ targetType: "point_transaction" }), "seeker")
		).toBe("/(seeker)/me/attendance");
		expect(
			notificationRoute(view({ targetType: "point_shop_order" }), "seeker")
		).toBe("/(seeker)/me/attendance");
	});

	it("후기는 공고 id가 있을 때만 상세로 간다", () => {
		expect(
			notificationRoute(
				view({ metadata: { jobPostId: "job-9" }, targetType: "review" }),
				"seeker"
			)
		).toBe("/(seeker)/jobs/job-9");
		expect(notificationRoute(view({ targetType: "review" }), "seeker")).toBeNull();
	});

	it("구인자 공고 알림은 대기열·결제류면 광고 관리, 그 외는 편집", () => {
		for (const action of [
			"listing_queued",
			"listing_activated",
			"remove_from_listing_queue",
			"set_payment:paid",
		]) {
			expect(
				notificationRoute(view({ metadata: { action } }), "employer")
			).toBe("/(employer)/promotions");
		}
		expect(
			notificationRoute(
				view({ metadata: { action: "set_status:rejected" }, targetId: "job-3" }),
				"employer"
			)
		).toBe("/(employer)/jobs/job-3/edit");
		expect(
			notificationRoute(view({ metadata: { action: "hard_delete" } }), "employer")
		).toBe("/(employer)/(tabs)");
		expect(notificationRoute(view({}), "seeker")).toBeNull();
	});

	it("구인자 설정류는 employer 셸에서만 이동한다", () => {
		expect(
			notificationRoute(view({ targetType: "employer_verification" }), "employer")
		).toBe("/(employer)/me/business");
		expect(
			notificationRoute(view({ targetType: "team_invitation" }), "employer")
		).toBe("/(employer)/me/teams");
		expect(
			notificationRoute(view({ targetType: "organization_member" }), "employer")
		).toBe("/(employer)/me/teams");
		expect(
			notificationRoute(view({ targetType: "team_invitation" }), "seeker")
		).toBeNull();
	});

	it("native 화면이 없는 타입·공유 알림은 null", () => {
		for (const targetType of [
			"community_post",
			"community_comment",
			"support_inquiry",
			"support_chat",
			"unknown_future_type",
		]) {
			expect(notificationRoute(view({ targetType }), "seeker")).toBeNull();
		}
		expect(
			notificationRoute(
				view({ recipientRole: "admin", targetType: "report" }),
				"seeker"
			)
		).toBeNull();
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/native && pnpm exec vitest run src/lib/notification-route.test.ts`
Expected: FAIL.

- [ ] **Step 3: 구현**

`apps/native/src/lib/notification-route.ts`:

```ts
// 알림 한 건 → native 착지 경로. web notificationHref의 native판이며, 화면이 없는 타입은
// null(읽음 처리만·이동 없음 — 스펙 §4.3). 역할과 맞지 않는 조합도 null이다: 구인자 셸에서
// 구직자 화면으로 push하면 (seeker) 그룹 레이아웃이 통째로 바뀐다.
import type { BambiNotificationView } from "@bambi-app/api/services/bambi-notification-labels";

export type NotificationRole = "employer" | "seeker";

const readString = (
	metadata: Record<string, unknown> | null,
	key: string
): null | string => {
	const value = metadata?.[key];
	return typeof value === "string" && value.length > 0 ? value : null;
};

const PROMOTION_ACTIONS = new Set([
	"listing_activated",
	"listing_queued",
	"remove_from_listing_queue",
]);

const SEEKER_ROUTES: Record<string, string> = {
	direct_message: "/(seeker)/me/messages",
	interview_schedule: "/(seeker)/me/interviews",
	point_shop_order: "/(seeker)/me/attendance",
	point_transaction: "/(seeker)/me/attendance",
	report: "/(seeker)/me/reports",
};

const EMPLOYER_ROUTES: Record<string, string> = {
	employer_verification: "/(employer)/me/business",
	organization_member: "/(employer)/me/teams",
	team_invitation: "/(employer)/me/teams",
};

const jobPostRoute = (item: BambiNotificationView): string => {
	const action = readString(item.metadata, "action") ?? "";
	if (action.startsWith("set_payment") || PROMOTION_ACTIONS.has(action)) {
		return "/(employer)/promotions";
	}
	if (action === "hard_delete") {
		return "/(employer)/(tabs)";
	}
	return `/(employer)/jobs/${item.targetId}/edit`;
};

export function notificationRoute(
	item: BambiNotificationView,
	role: NotificationRole
): null | string {
	if (item.recipientRole !== null) {
		return null;
	}

	switch (item.targetType) {
		case "chat_message":
		case "chat_room":
		case "contact_reveal":
			return item.chatRoomId
				? `/(${role})/chats/${item.chatRoomId}`
				: `/(${role})/(tabs)/chats`;
		case "review": {
			const jobPostId = readString(item.metadata, "jobPostId");
			return role === "seeker" && jobPostId ? `/(seeker)/jobs/${jobPostId}` : null;
		}
		case "job_post":
			return role === "employer" ? jobPostRoute(item) : null;
		default:
			return (
				(role === "seeker" ? SEEKER_ROUTES : EMPLOYER_ROUTES)[item.targetType] ??
				null
			);
	}
}
```

- [ ] **Step 4: 통과 확인·린트**

Run:
```bash
cd apps/native && pnpm exec vitest run src/lib/notification-route.test.ts && pnpm check-types
cd ../.. && pnpm exec ultracite check apps/native/src/lib/notification-route.ts apps/native/src/lib/notification-route.test.ts
```
Expected: 6 PASS, 오류 0.

- [ ] **Step 5: Commit**

```
feat(native): 알림 딥링크 경로 매핑 순수 함수 추가

- notificationRoute(item, role): 채팅·면접·쪽지·신고·포인트·후기·구인자 공고/설정만 이동, 나머지·공유 알림·역할 불일치는 null
- 표 전체를 고정하는 테스트 6건
```

---

### Task 6: 공용 알림 화면 + 라우트

**Files:**
- Create: `apps/native/src/components/notifications-screen.tsx`
- Modify: `apps/native/app/(seeker)/notifications.tsx` (전체 교체)
- Create: `apps/native/app/(employer)/notifications.tsx`
- Modify: `apps/native/app/(employer)/_layout.tsx` (Stack.Screen 추가)

**Interfaces:**
- Consumes: `notificationTitle`, `notificationBody`, `BambiNotificationView`(Task 1), `notificationRoute`, `NotificationRole`(Task 5), `orpc.bambi.notifications.{list,unreadCount,markRead,markAllRead,clearAll}`.
- Produces: `NotificationsScreen({ role }: { role: NotificationRole })`.

- [ ] **Step 1: 화면 컴포넌트**

`apps/native/src/components/notifications-screen.tsx`:

```tsx
import {
	type BambiNotificationView,
	notificationBody,
	notificationTitle,
} from "@bambi-app/api/services/bambi-notification-labels";
import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Button, Skeleton, Surface } from "heroui-native";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	type NotificationRole,
	notificationRoute,
} from "@/src/lib/notification-route";
import { orpc, queryClient } from "@/src/lib/orpc";

const PAGE_SIZE = 20;

type NotificationCursor = null | { createdAt: string; id: string };
type NotificationItem = Awaited<
	ReturnType<AppRouterClient["bambi"]["notifications"]["list"]>
>["items"][number];

// 서버 행 → 문구·경로 맵이 받는 뷰. metadata는 jsonb라 unknown으로 오므로 여기서 한 번 좁힌다.
const toView = (item: NotificationItem): BambiNotificationView => ({
	chatRoomId: item.chatRoomId,
	metadata:
		item.metadata && typeof item.metadata === "object"
			? (item.metadata as Record<string, unknown>)
			: null,
	recipientRole: item.recipientRole,
	targetId: item.targetId,
	targetType: item.targetType,
});

// markRead·markAllRead·clearAll 응답의 unreadCount가 정본이다 — 벨 배지 캐시를 바로 덮어
// 재조회 전에도 숫자가 맞는다(web notifications-screen applyUnreadCount와 같은 계약).
const applyUnreadCount = (unreadCount: number) => {
	queryClient.setQueryData(orpc.bambi.notifications.unreadCount.queryKey(), {
		unreadCount,
	});
	queryClient
		.invalidateQueries({ queryKey: orpc.bambi.notifications.list.key() })
		.catch(() => undefined);
};

function NotificationCard({
	item,
	onPress,
}: {
	item: NotificationItem;
	onPress: () => void;
}) {
	const view = toView(item);
	const body = notificationBody(view);
	const isUnread = item.readAt === null;

	return (
		<Surface
			className={`rounded-lg ${isUnread ? "border border-accent" : ""}`}
			variant="secondary"
		>
			<Pressable
				accessibilityLabel={`${isUnread ? "안 읽은" : "읽은"} 알림, ${notificationTitle(view)}`}
				accessibilityRole="button"
				className="gap-2 p-4 active:opacity-75"
				onPress={onPress}
			>
				{isUnread ? <Pill tone="accent">새 알림</Pill> : null}
				<Text
					className={`text-foreground ${isUnread ? "font-extrabold" : "font-semibold"}`}
				>
					{notificationTitle(view)}
				</Text>
				{body ? <Text className="text-muted text-sm">{body}</Text> : null}
				<Text className="text-muted text-xs">
					{formatDateTime(item.createdAt)}
					{item.recipientRole && item.readByName
						? ` · 확인: ${item.readByName}`
						: ""}
				</Text>
			</Pressable>
		</Surface>
	);
}

export function NotificationsScreen({ role }: { role: NotificationRole }) {
	const query = useInfiniteQuery(
		orpc.bambi.notifications.list.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as NotificationCursor,
			input: (cursor: NotificationCursor) => ({
				cursor: cursor ?? undefined,
				limit: PAGE_SIZE,
			}),
		})
	);
	const unreadQuery = useQuery(orpc.bambi.notifications.unreadCount.queryOptions());

	const markRead = useMutation(
		orpc.bambi.notifications.markRead.mutationOptions({
			onSuccess: (result) => applyUnreadCount(result.unreadCount),
		})
	);
	const markAllRead = useMutation(
		orpc.bambi.notifications.markAllRead.mutationOptions({
			onError: () => Alert.alert("알림을 확인 처리하지 못했어요"),
			onSuccess: (result) => applyUnreadCount(result.unreadCount),
		})
	);
	const clearAll = useMutation(
		orpc.bambi.notifications.clearAll.mutationOptions({
			onError: () => Alert.alert("알림을 비우지 못했어요"),
			onSuccess: (result) => applyUnreadCount(result.unreadCount),
		})
	);

	const items = query.data?.pages.flatMap((page) => page.items) ?? [];
	const hasUnread =
		(unreadQuery.data?.unreadCount ?? 0) > 0 ||
		items.some((item) => item.readAt === null);
	const hasSharedItems = items.some((item) => item.recipientRole !== null);

	const open = (item: NotificationItem) => {
		if (item.readAt === null) {
			markRead.mutate({ ids: [item.id] });
		}
		const href = notificationRoute(toView(item), role);
		if (href) {
			router.push(href as Href);
		}
	};

	const confirmClear = () => {
		Alert.alert(
			"알림을 모두 비울까요?",
			`읽은 알림과 읽지 않은 알림이 모두 삭제되고 되돌릴 수 없어요.${
				hasSharedItems
					? " 함께 받는 처리 요청 알림은 비우면 같은 역할의 다른 담당자에게서도 사라집니다."
					: ""
			}`,
			[
				{ style: "cancel", text: "취소" },
				{
					onPress: () => clearAll.mutate({}),
					style: "destructive",
					text: "비우기",
				},
			]
		);
	};

	const actions = (
		<View className="flex-row gap-2">
			<Button
				isDisabled={!hasUnread || markAllRead.isPending}
				onPress={() => markAllRead.mutate({})}
				size="sm"
				variant="secondary"
			>
				<Button.Label>모두 확인</Button.Label>
			</Button>
			{items.length > 0 ? (
				<Button
					isDisabled={clearAll.isPending}
					onPress={confirmClear}
					size="sm"
					variant="secondary"
				>
					<Button.Label>비우기</Button.Label>
				</Button>
			) : null}
		</View>
	);

	return (
		<BambiScreen>
			<BambiHeader action={actions} title="알림" />
			{query.isPending ? (
				<View className="gap-3">
					<Skeleton className="h-20 rounded-lg" />
					<Skeleton className="h-20 rounded-lg" />
					<Skeleton className="h-20 rounded-lg" />
				</View>
			) : null}
			{!(query.isPending || query.data) ? (
				<StateCard
					action={
						<Button
							isDisabled={query.isFetching}
							onPress={() => query.refetch()}
							size="sm"
							variant="secondary"
						>
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}
			{query.data && items.length === 0 ? (
				<StateCard
					description="면접 제안·검수 결과처럼 바로 알아야 하는 소식이 여기에 쌓여요."
					title="아직 받은 알림이 없어요"
				/>
			) : null}
			{items.length > 0 ? (
				<View className="gap-3">
					{items.map((item) => (
						<NotificationCard item={item} key={item.id} onPress={() => open(item)} />
					))}
					{query.isError ? (
						<Text className="text-center text-danger text-xs">
							최신 알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
						</Text>
					) : null}
					{query.hasNextPage ? (
						<Button
							isDisabled={query.isFetchingNextPage}
							onPress={() => query.fetchNextPage()}
							variant="secondary"
						>
							<Button.Label>
								{query.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
							</Button.Label>
						</Button>
					) : null}
				</View>
			) : null}
		</BambiScreen>
	);
}
```

`BambiScreen`이 ScrollView라 FlatList 대신 형제 화면(me/messages)과 같은 "더 보기" 버튼 페이지네이션을 쓴다(중첩 가상화 목록 회피). 배지 색 토큰(`border-accent`, `text-danger`)은 heroui 테마 토큰이며 구현자가 uniwind 문서로 존재를 확인한다.

- [ ] **Step 2: 라우트 파일**

`apps/native/app/(seeker)/notifications.tsx` 전체 교체:

```tsx
import { MemberOnly } from "@/src/components/member-only";
import { NotificationsScreen } from "@/src/components/notifications-screen";

export default function SeekerNotificationsScreen() {
	return (
		<MemberOnly>
			<NotificationsScreen role="seeker" />
		</MemberOnly>
	);
}
```

`apps/native/app/(employer)/notifications.tsx` 신설(구인자 레이아웃이 세션·역할을 이미 가드한다):

```tsx
import { NotificationsScreen } from "@/src/components/notifications-screen";

export default function EmployerNotificationsScreen() {
	return <NotificationsScreen role="employer" />;
}
```

`apps/native/app/(employer)/_layout.tsx`의 `<Stack.Screen name="analytics" ... />` 아래에:

```tsx
			<Stack.Screen name="notifications" options={{ title: "알림" }} />
```

- [ ] **Step 3: 검증**

Run:
```bash
cd apps/native && pnpm check-types
cd ../.. && pnpm exec ultracite check apps/native/src/components/notifications-screen.tsx "apps/native/app/(seeker)/notifications.tsx" "apps/native/app/(employer)/notifications.tsx" "apps/native/app/(employer)/_layout.tsx"
```
Expected: 오류 0.

- [ ] **Step 4: Commit**

```
feat(native): 알림 목록 화면 연결 - 구직자·구인자 공용

- NotificationsScreen: 커서 페이지네이션·모두 확인·비우기(확인)·탭 시 읽음 처리 후 notificationRoute로 이동
- (seeker)/notifications 플레이스홀더 교체, (employer)/notifications 라우트 신설
```

---

### Task 7: 포인트몰 화면(구직자)

**Files:**
- Create: `apps/native/src/lib/point-shop.ts`
- Create: `apps/native/src/lib/point-shop.test.ts`
- Modify: `apps/native/app/(seeker)/point-shop.tsx` (전체 교체)

**Interfaces:**
- Consumes: `resolvePurchase`, `resolveOrderCancellation`, `PointShopAudience`, `PointShopBenefitType` from `@bambi-app/api/services/bambi-point-shop`; `pointShopBuyerStatusLabel`, `pointShopBenefitTypeLabel` from `@bambi-app/api/services/bambi-point-shop-labels`(Task 2); `useIdentityVerification` from `@/src/lib/use-identity-verification`; `orpc.bambi.pointShop.{listItems,getMyBalance,purchase,myOrders,cancelMyOrder}`, `orpc.bambi.onboarding.getMine`, `orpc.bambi.attendance.getMine`.
- Produces: `PurchaseMode = "audience" | "buy" | "identity" | "insufficient" | "soldout"`, `resolvePurchaseMode(args): PurchaseMode`, `purchaseBlockMessage(mode, audience): null | string`, `benefitNoticeMessage(item): string`, `canCancelOrder(order, now): boolean`, `pointText(n): string`.

- [ ] **Step 1: 실패 테스트**

`apps/native/src/lib/point-shop.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	benefitNoticeMessage,
	canCancelOrder,
	pointText,
	purchaseBlockMessage,
	resolvePurchaseMode,
} from "./point-shop";

const base = {
	audience: "all" as const,
	balance: 1000,
	benefitType: "none" as const,
	isPhoneVerified: true,
	pricePoints: 500,
	role: "job_seeker",
	soldOut: false,
};

describe("resolvePurchaseMode", () => {
	it("구매 가능·잔액 부족·품절·자격·본인인증을 서버 판정 순서로 낸다", () => {
		expect(resolvePurchaseMode(base)).toBe("buy");
		expect(resolvePurchaseMode({ ...base, balance: 100 })).toBe("insufficient");
		expect(resolvePurchaseMode({ ...base, soldOut: true })).toBe("soldout");
		expect(resolvePurchaseMode({ ...base, audience: "employer" })).toBe("audience");
		expect(
			resolvePurchaseMode({ ...base, benefitType: "boost_manual_count" })
		).toBe("audience");
		expect(
			resolvePurchaseMode({ ...base, benefitType: "coupon", isPhoneVerified: false })
		).toBe("identity");
	});

	it("잔액을 모르면(null) 부족 판정을 하지 않는다", () => {
		expect(resolvePurchaseMode({ ...base, balance: null })).toBe("buy");
	});
});

describe("messages", () => {
	it("차단 사유 문구", () => {
		expect(purchaseBlockMessage("buy", "all")).toBeNull();
		expect(purchaseBlockMessage("soldout", "all")).toBe("지금은 품절된 아이템이에요.");
		expect(purchaseBlockMessage("audience", "employer")).toBe(
			"구인 회원 전용 혜택이에요."
		);
		expect(purchaseBlockMessage("audience", "all")).toBe(
			"구인 회원 전용 혜택이에요."
		);
		expect(purchaseBlockMessage("identity", "all")).toBe(
			"본인인증을 완료하면 구매할 수 있어요."
		);
		expect(purchaseBlockMessage("insufficient", "all")).toBe(
			"포인트가 부족해요."
		);
	});

	it("이행 고지는 유형별 한 줄", () => {
		expect(
			benefitNoticeMessage({ benefitType: "ad_extend", usageLimitDays: 7 })
		).toContain("7일 이내");
		expect(
			benefitNoticeMessage({ benefitType: "boost_auto_period", usageLimitDays: null })
		).toContain("기한 없이");
		expect(benefitNoticeMessage({ benefitType: "coupon", usageLimitDays: null })).toContain(
			"휴대폰 번호로 발송"
		);
		expect(benefitNoticeMessage({ benefitType: "none", usageLimitDays: null })).toContain(
			"순서대로 지급"
		);
	});

	it("pointText는 천단위 구분 + P", () => {
		expect(pointText(12_345)).toBe("12,345P");
	});
});

describe("canCancelOrder", () => {
	const now = new Date("2026-09-07T00:00:00Z");
	it("수동·쿠폰은 pending만, 보유형은 owned·미사용·미만료만", () => {
		expect(
			canCancelOrder(
				{ benefitType: "none", status: "pending", usableUntil: null, usedAt: null },
				now
			)
		).toBe(true);
		expect(
			canCancelOrder(
				{ benefitType: "none", status: "completed", usableUntil: null, usedAt: null },
				now
			)
		).toBe(false);
		expect(
			canCancelOrder(
				{
					benefitType: "ad_extend",
					status: "owned",
					usableUntil: new Date("2026-09-08T00:00:00Z"),
					usedAt: null,
				},
				now
			)
		).toBe(true);
		expect(
			canCancelOrder(
				{
					benefitType: "ad_extend",
					status: "owned",
					usableUntil: new Date("2026-09-06T00:00:00Z"),
					usedAt: null,
				},
				now
			)
		).toBe(false);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/native && pnpm exec vitest run src/lib/point-shop.test.ts`
Expected: FAIL.

- [ ] **Step 3: 순수 로직**

`apps/native/src/lib/point-shop.ts`:

```ts
// 포인트몰 화면의 표시 판정. 구매 가부의 정본은 서버 pointShop.purchase(계정 락 안에서
// 재검증)이고, 여기서는 같은 순수 함수 resolvePurchase를 불러 사유 코드만 문구로 바꾼다 —
// 판정 규칙을 native에 복제하지 않는다(web PurchaseDialogBody와 같은 결론, 로직은 공유).
import {
	type PointShopAudience,
	type PointShopBenefitType,
	isUsableBenefit,
	resolveOrderCancellation,
	resolvePurchase,
} from "@bambi-app/api/services/bambi-point-shop";

export type PurchaseMode =
	| "audience"
	| "buy"
	| "identity"
	| "insufficient"
	| "soldout";

export const pointText = (points: number): string =>
	`${points.toLocaleString("ko-KR")}P`;

// balance=null은 잔액 조회 전/실패다 — 0P로 오판해 막지 않고 서버 판정에 맡긴다.
export function resolvePurchaseMode(args: {
	audience: PointShopAudience;
	balance: null | number;
	benefitType: PointShopBenefitType;
	isPhoneVerified: boolean;
	pricePoints: number;
	role: string;
	soldOut: boolean;
}): PurchaseMode {
	const verdict = resolvePurchase({
		audience: args.audience,
		balance: args.balance ?? Number.POSITIVE_INFINITY,
		benefitType: args.benefitType,
		isActive: true,
		isPhoneVerified: args.isPhoneVerified,
		pricePoints: args.pricePoints,
		role: args.role,
		soldOut: args.soldOut,
	});
	if (verdict.ok) {
		return "buy";
	}
	// inactive는 목록(listItems가 isActive만 내려줌)에 없다 — 방어적으로 품절 취급.
	return verdict.code === "inactive" ? "soldout" : verdict.code;
}

const audienceRoleLabel = (audience: string): string =>
	audience === "job_seeker" ? "구직 회원" : "구인 회원";

export function purchaseBlockMessage(
	mode: PurchaseMode,
	audience: string
): null | string {
	switch (mode) {
		case "soldout":
			return "지금은 품절된 아이템이에요.";
		case "audience":
			return `${audienceRoleLabel(audience)} 전용 혜택이에요.`;
		case "identity":
			return "본인인증을 완료하면 구매할 수 있어요.";
		case "insufficient":
			return "포인트가 부족해요.";
		default:
			return null;
	}
}

export function benefitNoticeMessage(item: {
	benefitType: PointShopBenefitType;
	usageLimitDays: null | number;
}): string {
	if (isUsableBenefit(item.benefitType)) {
		const limit =
			item.usageLimitDays === null
				? "구매 후 보유함에서 기한 없이 사용할 수 있어요. "
				: `구매 후 ${item.usageLimitDays}일 이내에 보유함에서 사용해야 하며, 기한이 지나면 소멸돼요(환불 불가). `;
		return `${limit}사용 후에는 취소·환불이 불가하고, 사용 전에는 취소·환불할 수 있어요.`;
	}
	if (item.benefitType === "coupon") {
		return "본인인증 시 등록된 휴대폰 번호로 발송돼요. 지급완료 전에는 취소·환불할 수 있어요.";
	}
	return "운영자가 확인한 뒤 순서대로 지급해요. 지급완료 전에는 취소·환불할 수 있어요.";
}

export const canCancelOrder = (
	order: {
		benefitType: PointShopBenefitType;
		status: string;
		usableUntil: Date | null;
		usedAt: Date | null;
	},
	now: Date
): boolean =>
	resolveOrderCancellation({
		benefitType: order.benefitType,
		now,
		status: order.status,
		usableUntil: order.usableUntil,
		usedAt: order.usedAt,
	}).ok;
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/native && pnpm exec vitest run src/lib/point-shop.test.ts`
Expected: 6 PASS. (`bambi-point-shop.ts`가 drizzle·db를 import해 node에서 못 읽으면, 이 파일이 쓰는 순수 함수 5개(`resolvePurchase`·`resolveOrderCancellation`·`isUsableBenefit`·타입 2개)를 `packages/api/src/services/bambi-point-shop-rules.ts`로 분리하고 원본은 re-export한다. 서버·web 호출부는 import 경로 변경 없음.)

- [ ] **Step 5: 화면**

`apps/native/app/(seeker)/point-shop.tsx` 전체 교체:

```tsx
import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	pointShopBenefitTypeLabel,
	pointShopBuyerStatusLabel,
} from "@bambi-app/api/services/bambi-point-shop-labels";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, Stack } from "expo-router";
import { Button, Chip, Dialog, Separator, Skeleton, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { orpc, queryClient } from "@/src/lib/orpc";
import {
	benefitNoticeMessage,
	canCancelOrder,
	pointText,
	purchaseBlockMessage,
	resolvePurchaseMode,
} from "@/src/lib/point-shop";
import { useIdentityVerification } from "@/src/lib/use-identity-verification";

const LOGIN_HREF = "/login" as Href;
const HANGUL_CHAR = /[가-힣]/;

type ShopTab = "items" | "orders";
type PointShopItem = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["listItems"]>
>[number];
type PointShopOrder = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["myOrders"]>
>[number];

// orpc 입력 검증 실패 메시지는 영어라 그대로 띄우면 안 된다 — 서버가 명시한 한국어만 살린다
// (web localizedPurchaseError와 같은 관례).
const localizedError = (message: string | undefined, fallback: string): string =>
	message && HANGUL_CHAR.test(message) ? message : fallback;

const invalidatePointQueries = () =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: orpc.bambi.pointShop.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.bambi.attendance.getMine.key() }),
	]);

function ShopTabs({ onChange, tab }: { onChange: (next: ShopTab) => void; tab: ShopTab }) {
	// me/messages와 같은 Chip 2개 토글(heroui에 토글 그룹 없음). py-2.5로 48dp 터치 타깃.
	return (
		<View accessibilityRole="tablist" className="flex-row gap-2 py-2.5">
			{(["items", "orders"] as const).map((value) => {
				const selected = tab === value;
				return (
					<Chip
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						color={selected ? "accent" : "default"}
						hitSlop={10}
						key={value}
						onPress={() => onChange(value)}
						size="md"
						variant={selected ? "primary" : "soft"}
					>
						<Chip.Label>{value === "items" ? "상품" : "내 교환 내역"}</Chip.Label>
					</Chip>
				);
			})}
		</View>
	);
}

function ItemImage({ uri }: { uri: null | string }) {
	return (
		<View className="aspect-square w-full items-center justify-center overflow-hidden rounded-t-lg bg-surface-secondary">
			{uri ? (
				<Image
					accessibilityIgnoresInvertColors
					className="h-full w-full"
					resizeMode="contain"
					source={{ uri }}
				/>
			) : (
				<Text className="font-extrabold text-2xl text-muted">🎁</Text>
			)}
		</View>
	);
}

function ItemCard({ item, onOpen }: { item: PointShopItem; onOpen: () => void }) {
	return (
		<View className="w-1/2 p-1.5">
			<Pressable
				accessibilityLabel={`${item.name}, ${pointText(item.pricePoints)}${item.soldOut ? ", 품절" : ""}`}
				accessibilityRole="button"
				className="overflow-hidden rounded-lg border border-border bg-surface active:opacity-75"
				onPress={onOpen}
			>
				<View>
					<ItemImage uri={item.imageUrl} />
					{item.soldOut ? (
						<View className="absolute inset-0 items-center justify-center bg-background/60">
							<Pill tone="neutral">품절</Pill>
						</View>
					) : null}
					<View className="absolute top-2 right-2">
						<Pill tone="accent">{pointText(item.pricePoints)}</Pill>
					</View>
				</View>
				<Text className="px-3 py-2.5 font-extrabold text-foreground text-sm" numberOfLines={1}>
					{item.name}
				</Text>
			</Pressable>
		</View>
	);
}

function PurchaseDialog({
	balance,
	isPhoneVerified,
	item,
	onClose,
	role,
}: {
	balance: null | number;
	isPhoneVerified: boolean;
	item: null | PointShopItem;
	onClose: () => void;
	role: string;
}) {
	const identity = useIdentityVerification();
	const purchase = useMutation(
		orpc.bambi.pointShop.purchase.mutationOptions({
			onError: (error) =>
				Alert.alert(
					"구매하지 못했어요",
					localizedError(error.message, "잠시 후 다시 시도해 주세요.")
				),
			onSuccess: async () => {
				onClose();
				await invalidatePointQueries();
				Alert.alert("교환이 완료됐어요", "내 교환 내역에서 확인할 수 있어요.");
			},
		})
	);

	if (!item) {
		return null;
	}

	const mode = resolvePurchaseMode({
		audience: item.audience,
		balance,
		benefitType: item.benefitType,
		isPhoneVerified,
		pricePoints: item.pricePoints,
		role,
		soldOut: item.soldOut,
	});
	const block = purchaseBlockMessage(mode, item.audience);

	return (
		<Dialog isOpen onOpenChange={(open) => (open ? undefined : onClose())}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<ItemImage uri={item.imageUrl} />
					<View className="flex-row flex-wrap items-center gap-2 pt-3">
						<Dialog.Title>{item.name}</Dialog.Title>
						{item.benefitType !== "none" ? (
							<Pill tone="neutral">{pointShopBenefitTypeLabel(item.benefitType)}</Pill>
						) : null}
					</View>
					<Dialog.Description>
						{item.description ?? "운영자가 확인한 뒤 순서대로 지급해요."}
					</Dialog.Description>
					<Surface className="gap-2 rounded-lg p-3" variant="secondary">
						<View className="flex-row justify-between">
							<Text className="text-muted text-sm">필요 포인트</Text>
							<Text className="font-extrabold text-foreground text-sm">
								{pointText(item.pricePoints)}
							</Text>
						</View>
						{balance === null ? null : (
							<View className="flex-row justify-between">
								<Text className="text-muted text-sm">내 포인트</Text>
								<Text className="font-extrabold text-foreground text-sm">
									{pointText(balance)}
								</Text>
							</View>
						)}
					</Surface>
					<Text className="text-muted text-sm">{benefitNoticeMessage(item)}</Text>
					{block ? <Text className="font-bold text-danger text-sm">{block}</Text> : null}
					{mode === "identity" && identity.isAvailable ? (
						<Button
							isDisabled={identity.isPending}
							onPress={identity.startIdentityVerification}
							variant="secondary"
						>
							<Button.Label>본인인증 하기</Button.Label>
						</Button>
					) : null}
					{identity.verification}
					<View className="flex-row gap-3 pt-2">
						<View className="flex-1">
							<Button onPress={onClose} variant="tertiary">
								<Button.Label>닫기</Button.Label>
							</Button>
						</View>
						{mode === "buy" ? (
							<View className="flex-1">
								<Button
									isDisabled={purchase.isPending}
									onPress={() => purchase.mutate({ itemId: item.id })}
								>
									<Button.Label>{purchase.isPending ? "구매 중…" : "구매하기"}</Button.Label>
								</Button>
							</View>
						) : null}
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}

function ItemsTab({
	balance,
	isPhoneVerified,
	isSignedIn,
	role,
}: {
	balance: null | number;
	isPhoneVerified: boolean;
	isSignedIn: boolean;
	role: string;
}) {
	const itemsQuery = useQuery(orpc.bambi.pointShop.listItems.queryOptions());
	const [selected, setSelected] = useState<null | PointShopItem>(null);

	if (itemsQuery.isPending) {
		return (
			<View className="flex-row flex-wrap">
				{["a", "b", "c", "d"].map((key) => (
					<View className="w-1/2 p-1.5" key={key}>
						<Skeleton className="aspect-square rounded-lg" />
					</View>
				))}
			</View>
		);
	}
	if (!itemsQuery.data) {
		return (
			<StateCard
				action={
					<Button onPress={() => itemsQuery.refetch()} size="sm" variant="secondary">
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="아이템을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
				title="불러오기 실패"
			/>
		);
	}
	if (itemsQuery.data.length === 0) {
		return (
			<StateCard
				description="새 아이템이 등록되면 이곳에 바로 보여요."
				title="준비 중인 아이템이 없어요"
			/>
		);
	}

	return (
		<>
			<View className="-m-1.5 flex-row flex-wrap">
				{itemsQuery.data.map((item) => (
					<ItemCard
						item={item}
						key={item.id}
						onOpen={() => (isSignedIn ? setSelected(item) : router.push(LOGIN_HREF))}
					/>
				))}
			</View>
			<PurchaseDialog
				balance={balance}
				isPhoneVerified={isPhoneVerified}
				item={selected}
				onClose={() => setSelected(null)}
				role={role}
			/>
		</>
	);
}

function OrderCard({ order }: { order: PointShopOrder }) {
	const cancel = useMutation(
		orpc.bambi.pointShop.cancelMyOrder.mutationOptions({
			onError: (error) =>
				Alert.alert(
					"취소하지 못했어요",
					localizedError(error.message, "잠시 후 다시 시도해 주세요.")
				),
			onSuccess: async (result) => {
				await invalidatePointQueries();
				Alert.alert(
					"취소했어요",
					result.refunded > 0
						? `${pointText(result.refunded)}를 돌려드렸어요.`
						: "보유 상한에 걸려 환불 포인트는 소멸됐어요."
				);
			},
		})
	);
	const cancelable = canCancelOrder(
		{
			benefitType: order.benefitType,
			status: order.status,
			usableUntil: order.usableUntil ? new Date(order.usableUntil) : null,
			usedAt: order.usedAt ? new Date(order.usedAt) : null,
		},
		new Date()
	);

	const confirmCancel = () => {
		Alert.alert("취소·환불", `${order.itemName} 구매를 취소할까요? ${pointText(order.pricePoints)}를 돌려드려요.`, [
			{ style: "cancel", text: "닫기" },
			{ onPress: () => cancel.mutate({ orderId: order.id }), style: "destructive", text: "취소·환불" },
		]);
	};

	return (
		<Surface className="gap-2 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-center justify-between gap-3">
				<Text className="flex-1 font-semibold text-foreground" numberOfLines={2}>
					{order.itemName}
				</Text>
				<Pill tone={order.status === "canceled" ? "neutral" : "accent"}>
					{pointShopBuyerStatusLabel(order.status)}
				</Pill>
			</View>
			<Text className="text-muted text-xs">{`${pointText(order.pricePoints)} · ${formatDateTime(order.createdAt)}`}</Text>
			{order.usableUntil ? (
				<Text className="text-muted text-xs">{`사용 기한 ${formatDateTime(order.usableUntil)}`}</Text>
			) : null}
			{order.usedAt ? (
				<Text className="text-muted text-xs">{`사용 ${formatDateTime(order.usedAt)}`}</Text>
			) : null}
			{cancelable ? (
				<>
					<Separator />
					<View className="flex-row justify-end">
						<Button isDisabled={cancel.isPending} onPress={confirmCancel} size="sm" variant="secondary">
							<Button.Label>취소·환불</Button.Label>
						</Button>
					</View>
				</>
			) : null}
		</Surface>
	);
}

function OrdersTab({ isSignedIn }: { isSignedIn: boolean }) {
	const ordersQuery = useQuery({
		...orpc.bambi.pointShop.myOrders.queryOptions(),
		enabled: isSignedIn,
	});

	if (!isSignedIn) {
		return (
			<StateCard
				action={
					<Button onPress={() => router.push(LOGIN_HREF)} size="sm" variant="secondary">
						<Button.Label>로그인</Button.Label>
					</Button>
				}
				description="로그인하면 교환 내역을 볼 수 있어요."
				title="로그인이 필요해요"
			/>
		);
	}
	if (ordersQuery.isPending) {
		return (
			<View className="gap-3">
				<Skeleton className="h-20 rounded-lg" />
				<Skeleton className="h-20 rounded-lg" />
			</View>
		);
	}
	if (!ordersQuery.data) {
		return (
			<StateCard
				action={
					<Button onPress={() => ordersQuery.refetch()} size="sm" variant="secondary">
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="교환 내역을 불러오지 못했어요."
				title="불러오기 실패"
			/>
		);
	}
	if (ordersQuery.data.length === 0) {
		return <StateCard description="상품을 교환하면 여기에 쌓여요." title="교환 내역이 없어요" />;
	}
	return (
		<View className="gap-3">
			{ordersQuery.data.map((order) => (
				<OrderCard key={order.id} order={order} />
			))}
		</View>
	);
}

export default function SeekerPointShopScreen() {
	const [tab, setTab] = useState<ShopTab>("items");
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const role = profile?.role ?? "job_seeker";
	const balanceQuery = useQuery({
		...orpc.bambi.pointShop.getMyBalance.queryOptions(),
		enabled: isSignedIn && (role === "job_seeker" || role === "employer"),
	});
	const balance = balanceQuery.data?.pointBalance ?? null;

	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "포인트몰" }} />
			<BambiHeader
				action={balance === null ? null : <Pill tone="accent">{pointText(balance)}</Pill>}
				description="출석·글쓰기로 모은 포인트로 교환해요. 신청하면 운영자가 확인 후 지급해요."
				title="포인트몰"
			/>
			<ShopTabs onChange={setTab} tab={tab} />
			{tab === "items" ? (
				<ItemsTab
					balance={balance}
					isPhoneVerified={Boolean(profile?.isPhoneVerified)}
					isSignedIn={isSignedIn}
					role={role}
				/>
			) : (
				<OrdersTab isSignedIn={isSignedIn} />
			)}
		</BambiScreen>
	);
}
```

구현 메모: 스펙의 바텀시트 대신 리포에서 이미 8곳이 쓰는 heroui `Dialog`를 쓴다(같은 역할, 검증된 패턴). `myOrders`의 `usableUntil`/`usedAt`은 RPC 경계에서 string/Date 어느 쪽으로 와도 `new Date()`로 감싸 통일한다. 쿠폰형 본인인증은 기존 `useIdentityVerification`이 모달·서버 확정·`getMine` 무효화를 모두 처리하므로 성공 시 `mode`가 자동으로 `buy`로 바뀐다. `role === "admin"`은 `resolvePurchase`가 `audience`로 막는다.

- [ ] **Step 6: 검증**

Run:
```bash
cd apps/native && pnpm check-types
cd ../.. && pnpm exec ultracite check apps/native/src/lib/point-shop.ts apps/native/src/lib/point-shop.test.ts "apps/native/app/(seeker)/point-shop.tsx"
```
Expected: 오류 0. `resizeMode`·`className` 조합이 uniwind에서 막히면 `style={{ width: "100%", height: "100%" }}`로 대체.

- [ ] **Step 7: Commit**

```
feat(native): 포인트몰 화면 연결 - 상품 목록·구매 다이얼로그·내 교환 내역(취소)

- 구매 가부는 api resolvePurchase를 그대로 호출해 사유 문구만 렌더(판정 복제 없음), 테스트 6건
- 쿠폰형 본인인증 미완료면 기존 useIdentityVerification으로 인앱 인증 유도
- 내역 탭: 구매자 상태 라벨·사용기한·취소·환불(resolveOrderCancellation) 후 포인트몰·출석 쿼리 무효화
```

---

### Task 8: 전체 검증·매뉴얼 동기화 확인

**Files:**
- Modify(필요 시): `docs/` 매뉴얼 중 native 알림/포인트몰 언급 파일

- [ ] **Step 1: 전체 정적 검증**

Run:
```bash
pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types && (cd apps/native && pnpm check-types)
(cd apps/native && pnpm test)
(cd packages/api && pnpm exec vitest run test/services/bambi-notification-labels.test.ts test/services/bambi-point-shop-labels.test.ts)
(cd apps/web && pnpm exec vitest run test/lib/bambi/notification-labels.test.ts)
pnpm exec ultracite check apps/native/src apps/native/app packages/api/src/services apps/web/src/lib/bambi
```
Expected: 모두 PASS·오류 0. 실패는 원인 파일을 고치고 해당 Task 커밋에 fixup하지 말고 `fix:` 커밋으로 추가한다.

- [ ] **Step 2: 매뉴얼 언급 확인**

Run: `grep -rln "포인트몰\|알림" docs --include=*.md | grep -iv superpowers | head`
native 매뉴얼에 "준비 중" 문구가 있으면 갱신하고 `docs:` 커밋. 없으면 건너뛴다.

- [ ] **Step 3: 실기기 확인 목록을 최종 보고에 포함**

종 배지 갱신(SSE)·백그라운드 복귀 재조회·알림 목록 더 보기·모두 확인/비우기·딥링크 표 각 1건·구인자 헤더 배지·포인트몰 구매/취소·품절/잔액 부족 문구·쿠폰형 본인인증 유도. 에뮬레이터 조작은 사용자가 한다.

---

## Self-Review

- **스펙 커버리지:** §2 문구 이동(Task 1) · §3.1 SSE 훅(Task 3) · §3.2 배지(Task 4) · §4.1~4.2 화면·라우트(Task 6) · §4.3 딥링크(Task 5) · §5 포인트몰(Task 7, 라벨은 Task 2) · §6 테스트(각 Task) · §7 실기기 목록(Task 8). 스펙과 다른 점 2가지를 명시했다: FlatList 대신 "더 보기"(BambiScreen이 ScrollView), 바텀시트 대신 Dialog(리포 관례). `publicObjectUri`는 `imageUrl`이 절대 URL이라 불필요.
- **타입 일관성:** `NotificationRole`은 Task 5 정의를 Task 6이 그대로 쓴다. `BambiNotificationView`는 Task 1 경로 하나로 통일. `applyUnreadCount`·`toView`는 화면 내부 함수.
- **플레이스홀더:** 없음. 조건부 분기(vitest가 RN import를 못 읽는 경우)는 구체적 대체 경로를 적었다.

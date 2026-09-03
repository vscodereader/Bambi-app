# native 구직자 1:1 채팅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/native` 구직자 채팅 탭·채팅방을 web 1:1 채팅과 기능 동등하게 만들고, socket.io 실시간·낙관적 전송·첨부·읽음·시스템 카드를 갖춘 메신저 UI로 재작성한다.

**Architecture:** web의 순수 채팅 로직(그룹핑·커서 병합·차단 문구·시스템 메시지 문구)을 `packages/api/src/services/`로 승격해 web·native가 공유한다. native는 `src/lib/chat/`에 소켓 싱글턴·훅·순수 함수를, `src/components/chat/`에 heroui-native 기반 컴포넌트를 두고, `app/(seeker)/(tabs)/chats.tsx`·`app/(seeker)/chats/[id].tsx`를 전면 재작성한다. 서버·DB는 변경하지 않는다.

**Tech Stack:** Expo SDK 56 / React Native 0.85 / expo-router / heroui-native 1.0.3 (uniwind) / @orpc/tanstack-query / socket.io-client 4.8 / react-native-keyboard-controller / expo-image-picker / expo-document-picker / vitest 4

**Spec:** `docs/superpowers/specs/2026-09-03-native-chat-design.md`

## Global Constraints

- 소스 수정 후 빌드·dev 서버·에뮬레이터 실행 금지. 검증은 vitest·`tsc --noEmit`·`pnpm dlx ultracite check <경로>`(경로 인자 필수)까지. 실기기 확인은 사용자가 한다.
- 라이브러리 추가는 사용자 승인분만: `socket.io-client`(catalog `^4.8.3`), `expo-document-picker`(`pnpm expo install`이 고른 버전을 catalog에 기록). 그 외 신규 의존성 금지.
- `pnpm-workspace.yaml` catalog에 등록하고 web·native `package.json`은 `"catalog:"`로 참조한다. native 설치는 `pnpm install`이 아니라 `pnpm expo install <pkg>`.
- DB enum 원값을 화면에 그대로 렌더하지 않는다. 면접 상태는 `@/src/lib/me-interviews`의 `interviewStatusLabel`을 쓴다.
- 색은 테마 토큰만(`accent`, `surface`, `muted`, `danger`, `success`, `warning`). 임의 px(`[Npx]`) 금지, Tailwind 스케일 클래스 사용. `primary` 버튼은 화면 주요 액션 한 곳(전송)만.
- heroui-native는 named import `from "heroui-native"`. 컴포넌트는 compound 구조(`Avatar.Image`, `Menu.Item` 등). `Alert.alert` 대신 `Dialog`·`useToast`.
- 테스트는 각 패키지 `test/` 미러 구조(`packages/api/test/services/*.test.ts`, `apps/native/test/lib/chat/*.test.ts`). `src` 안에 테스트 파일 금지. api 테스트는 cwd `packages/api`에서 `test/services`만 실행(`test/routers`는 dev DB를 지우므로 실행 금지).
- 커밋 메시지는 한국어 `type:` 제목 + `- ` 블릿 본문(블릿 사이 빈 줄 없음). 서브에이전트는 커밋하지 않고 컨트롤러가 순차 커밋한다. `git stash` 금지. push·PR 금지.
- 워크트리: `C:\Users\user\projects\bambi-app\.claude\worktrees\native-chat` (브랜치 `worktree-native-chat`). 모든 경로는 이 루트 기준.
- Ultracite/Biome 규칙: `for...of`, 옵셔널 체이닝, 컴포넌트 안에 컴포넌트 정의 금지, `console.log` 금지, 매직 넘버는 이름 붙인 상수.

## File Map

공유(packages/api)
- Create `packages/api/src/services/bambi-chat-message-grouping.ts` ← 이동 `apps/web/src/lib/bambi/chat-message-grouping.ts`
- Create `packages/api/src/services/bambi-chat-room-messages.ts` ← 이동 `apps/web/src/lib/bambi/chat-room-messages.ts`
- Create `packages/api/src/services/bambi-chat-block.ts` ← 이동 `apps/web/src/lib/bambi/chat-block.ts`
- Create `packages/api/src/services/bambi-chat-system-messages.ts` ← 추출(web 채팅방 컴포넌트의 metadata 리더·문구 4함수)
- Modify `packages/api/src/services/bambi-chat-message-id.ts` (crypto 부재 폴백)
- Move tests → `packages/api/test/services/bambi-chat-{message-grouping,room-messages,block}.test.ts`, Create `bambi-chat-system-messages.test.ts`
- Modify web import 6곳: `apps/web/src/app/moderator/chats/chat-history-dialog.tsx`, `apps/web/src/app/seeker/jobs/[id]/chat/page.tsx`, `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx`, `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`, `apps/web/src/lib/bambi/use-older-chat-messages.ts`, `apps/web/src/lib/bambi/use-chat-message-scroll.ts`(isScrolledToBottom 사용 시)

native 데이터·훅 `apps/native/src/lib/chat/`
- `chat-types.ts` — oRPC 응답 파생 타입
- `chat-time.ts` — 목록 시각 포맷(순수)
- `chat-optimistic.ts` — 낙관적 메시지 병합·inverted 변환(순수)
- `chat-typing.ts` — 타이핑 수신 리듀서(순수)
- `chat-errors.ts` — 오류 → 한국어 문구(순수)
- `chat-socket.ts` — socket.io-client 싱글턴
- `use-chat-room-realtime.ts`, `use-chat-messages.ts`, `use-chat-auto-read.ts`, `use-chat-send.ts`, `use-chat-unread-badge.ts`

native UI `apps/native/src/components/chat/`
- `chat-date-chip.tsx`, `chat-message-bubble.tsx`, `chat-attachment-message.tsx`, `chat-typing-indicator.tsx`, `chat-new-message-pill.tsx`, `chat-system-card.tsx`, `chat-block-notice.tsx`, `chat-composer.tsx`, `chat-room-menu.tsx`, `chat-room-list-item.tsx`, `chat-room-header.tsx`

화면
- Rewrite `apps/native/app/(seeker)/(tabs)/chats.tsx`, `apps/native/app/(seeker)/chats/[id].tsx`
- Modify `apps/native/app/(seeker)/(tabs)/_layout.tsx`(탭 배지), `apps/native/app/(seeker)/_layout.tsx`(채팅방 헤더 숨김), `apps/native/app/(seeker)/jobs/[id].tsx`(CTA 오류 문구), `apps/native/app/(seeker)/chats/[id]/reveal.tsx`(기본값 정리)

테스트 인프라
- Create `apps/native/vitest.config.ts`, `apps/native/test/lib/chat/*.test.ts`

---

### Task 1: 의존성 등록 (catalog + package.json)

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog 블록)
- Modify: `apps/web/package.json:39`
- Modify: `apps/native/package.json` dependencies

**Interfaces:**
- Produces: native에서 `import { io } from "socket.io-client"`, `import { getDocumentAsync } from "expo-document-picker"` 가능

- [ ] **Step 1: native에 expo-document-picker 설치(SDK 호환 버전 확정)**

Run (cwd `apps/native`):
```bash
pnpm expo install expo-document-picker
```
Expected: `apps/native/package.json`에 `"expo-document-picker": "~56.x.x"` 추가됨. 그 버전 문자열을 기록한다.

- [ ] **Step 2: catalog 등록**

`pnpm-workspace.yaml`의 `catalog:` 블록에 알파벳 순으로 추가(기존 항목은 `"@ai-sdk/react": ^3.0.3` 형식):
```yaml
  expo-document-picker: <Step 1에서 확정된 버전, 예 ~56.0.7>
  socket.io-client: ^4.8.3
```

- [ ] **Step 3: package.json을 catalog 참조로 변경**

`apps/web/package.json`:
```json
"socket.io-client": "catalog:",
```
`apps/native/package.json` dependencies에(알파벳 순):
```json
"expo-document-picker": "catalog:",
"socket.io-client": "catalog:",
```

- [ ] **Step 4: 설치·검증**

Run (cwd 워크트리 루트):
```bash
pnpm install
node -e "require.resolve('socket.io-client/package.json',{paths:['apps/native']});require.resolve('expo-document-picker/package.json',{paths:['apps/native']});console.log('ok')"
```
Expected: `ok`. `pnpm-lock.yaml`에 두 패키지가 catalog 항목으로 잡힘.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml apps/web/package.json apps/native/package.json
git commit -m "chore: socket.io-client·expo-document-picker를 catalog로 등록(native 채팅 준비)"
```

---

### Task 2: web 순수 채팅 로직 3파일을 packages/api로 승격

**Files:**
- Move: `apps/web/src/lib/bambi/chat-message-grouping.ts` → `packages/api/src/services/bambi-chat-message-grouping.ts`
- Move: `apps/web/src/lib/bambi/chat-room-messages.ts` → `packages/api/src/services/bambi-chat-room-messages.ts`
- Move: `apps/web/src/lib/bambi/chat-block.ts` → `packages/api/src/services/bambi-chat-block.ts`
- Move tests: `apps/web/test/lib/bambi/chat-message-grouping.test.ts`, `chat-room-messages.test.ts`, `chat-block.test.ts` → `packages/api/test/services/bambi-chat-message-grouping.test.ts`, `bambi-chat-room-messages.test.ts`, `bambi-chat-block.test.ts`
- Modify: web import 6곳(File Map 참조)

**Interfaces:**
- Produces(변경 없음, 경로만 이동):
  - `annotateChatMessages<M extends ChatMessageLike>(messages: readonly M[]): AnnotatedChatMessage<M>[]`, `formatChatDateLabel(value): string`, `formatChatTimeLabel(value): string`, 타입 `ChatMessageLike`, `AnnotatedChatMessage<M>`
  - `mergeChatMessagesById<M>(older: readonly M[], latest: readonly M[]): M[]`, `resolveOldestChatMessageCursor(messages): ChatMessageCursor | null`, `isScrolledToBottom({clientHeight, scrollHeight, scrollTop}): boolean`, 타입 `ChatMessageCursor {createdAt: string; id: string}`
  - `getChatBlockMessage(error: unknown): null | string`, 타입 `ChatBlockReason`

- [ ] **Step 1: 파일 이동(git mv로 이력 유지)**

```bash
git mv apps/web/src/lib/bambi/chat-message-grouping.ts packages/api/src/services/bambi-chat-message-grouping.ts
git mv apps/web/src/lib/bambi/chat-room-messages.ts packages/api/src/services/bambi-chat-room-messages.ts
git mv apps/web/src/lib/bambi/chat-block.ts packages/api/src/services/bambi-chat-block.ts
git mv apps/web/test/lib/bambi/chat-message-grouping.test.ts packages/api/test/services/bambi-chat-message-grouping.test.ts
git mv apps/web/test/lib/bambi/chat-room-messages.test.ts packages/api/test/services/bambi-chat-room-messages.test.ts
git mv apps/web/test/lib/bambi/chat-block.test.ts packages/api/test/services/bambi-chat-block.test.ts
```

- [ ] **Step 2: 테스트 import 경로 수정**

세 테스트 파일의 `from "@/lib/bambi/chat-message-grouping"` 등을 아래로 바꾼다(packages/api vitest alias `@` → `packages/api/src`):
```ts
import { ... } from "@/services/bambi-chat-message-grouping";
import { ... } from "@/services/bambi-chat-room-messages";
import { ... } from "@/services/bambi-chat-block";
```

- [ ] **Step 3: 이동한 소스의 상단 주석에 공유 사실 한 줄 추가**

각 파일 첫 주석 블록 끝에:
```ts
// web(apps/web)·native(apps/native)가 함께 import한다. 화면 로직을 여기 넣지 말 것.
```

- [ ] **Step 4: web import 경로 갱신**

`grep -rn "lib/bambi/chat-message-grouping\|lib/bambi/chat-room-messages\|lib/bambi/chat-block\"" apps/web/src` 결과 전부(6곳 예상)를 다음으로 치환:
- `@/lib/bambi/chat-message-grouping` → `@bambi-app/api/services/bambi-chat-message-grouping`
- `@/lib/bambi/chat-room-messages` 및 `./chat-room-messages` → `@bambi-app/api/services/bambi-chat-room-messages`
- `@/lib/bambi/chat-block` → `@bambi-app/api/services/bambi-chat-block`

- [ ] **Step 5: api 테스트 실행**

Run (cwd `packages/api`):
```bash
pnpm vitest run test/services/bambi-chat-message-grouping.test.ts test/services/bambi-chat-room-messages.test.ts test/services/bambi-chat-block.test.ts
```
Expected: 3 files passed, 0 failed.

- [ ] **Step 6: web·api 타입 검사**

Run (cwd 워크트리 루트):
```bash
pnpm --filter web check-types
pnpm --filter @bambi-app/api check-types
```
Expected: 오류 0. (web check-types가 낡은 `.next` 때문에 오탐을 내면 `apps/web/.next` 삭제 후 재실행.)

- [ ] **Step 7: 린트**

```bash
pnpm dlx ultracite check packages/api/src/services/bambi-chat-message-grouping.ts packages/api/src/services/bambi-chat-room-messages.ts packages/api/src/services/bambi-chat-block.ts apps/web/src/components/bambi/screens apps/web/src/lib/bambi apps/web/src/app/moderator/chats apps/web/src/app/seeker/jobs
```
Expected: 오류 0.

- [ ] **Step 8: Commit**

```bash
git add -A packages/api/src/services packages/api/test/services apps/web/src apps/web/test
git commit -m "refactor: 채팅 순수 로직 3파일을 packages/api/services로 승격(web·native 공유)"
```

---

### Task 3: 시스템 메시지 문구 공유 파일 추출 + 메시지 id 생성기 crypto 폴백

**Files:**
- Create: `packages/api/src/services/bambi-chat-system-messages.ts`
- Create: `packages/api/test/services/bambi-chat-system-messages.test.ts`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx:196-310` (로컬 정의 삭제, import로 교체)
- Modify: `packages/api/src/services/bambi-chat-message-id.ts`
- Modify: `packages/api/test/services/bambi-chat-message-id.test.ts`

**Interfaces:**
- Produces:
  - `type ContactRequestStatus = "declined" | "pending" | "revealed"`, `type ContactRevealDecision = "decline" | "reveal"`, `interface ContactRequestMetadata { requesterUserId: string; status: ContactRequestStatus; targetUserId: string }`
  - `readContactRequestMetadata(value: unknown): ContactRequestMetadata | null`
  - `getContactRequestNotice({ counterpartName: string; revealedPhoneLabel: null | string; status: ContactRequestStatus; viewerIsEmployer: boolean }): string`
  - `readInterviewProposalMetadata(value: unknown): { interviewScheduleId: string } | null`
  - `getInterviewProposalNotice(status: string, viewerIsProposer: boolean): string`
  - `generateChatMessageId(): string` (crypto 없으면 Math.random 폴백)

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/test/services/bambi-chat-system-messages.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	getContactRequestNotice,
	getInterviewProposalNotice,
	readContactRequestMetadata,
	readInterviewProposalMetadata,
} from "@/services/bambi-chat-system-messages";

describe("readContactRequestMetadata", () => {
	it("정상 metadata를 좁혀 읽는다", () => {
		expect(
			readContactRequestMetadata({
				requesterUserId: "e",
				status: "pending",
				targetUserId: "s",
			})
		).toEqual({ requesterUserId: "e", status: "pending", targetUserId: "s" });
	});

	it("status가 알 수 없는 값이면 null", () => {
		expect(
			readContactRequestMetadata({
				requesterUserId: "e",
				status: "weird",
				targetUserId: "s",
			})
		).toBeNull();
	});

	it("객체가 아니면 null", () => {
		expect(readContactRequestMetadata(null)).toBeNull();
		expect(readContactRequestMetadata("x")).toBeNull();
	});
});

describe("getContactRequestNotice", () => {
	it("구직자 pending은 상대 이름을 넣어 묻는다", () => {
		expect(
			getContactRequestNotice({
				counterpartName: "밤비업소",
				revealedPhoneLabel: null,
				status: "pending",
				viewerIsEmployer: false,
			})
		).toBe("밤비업소님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?");
	});

	it("구인자 revealed는 포맷된 번호를 그대로 붙인다", () => {
		expect(
			getContactRequestNotice({
				counterpartName: "구직자",
				revealedPhoneLabel: "010-1234-5678",
				status: "revealed",
				viewerIsEmployer: true,
			})
		).toBe("구직자님께서 연락처를 공개했습니다: 010-1234-5678");
	});

	it("구인자 revealed에 번호가 없으면 확인 필요", () => {
		expect(
			getContactRequestNotice({
				counterpartName: "구직자",
				revealedPhoneLabel: null,
				status: "revealed",
				viewerIsEmployer: true,
			})
		).toBe("구직자님께서 연락처를 공개했습니다: 확인 필요");
	});

	it("declined 문구", () => {
		expect(
			getContactRequestNotice({
				counterpartName: "x",
				revealedPhoneLabel: null,
				status: "declined",
				viewerIsEmployer: false,
			})
		).toBe("연락처 공개를 거절했습니다.");
	});
});

describe("readInterviewProposalMetadata / getInterviewProposalNotice", () => {
	it("interviewScheduleId만 읽는다", () => {
		expect(readInterviewProposalMetadata({ interviewScheduleId: "i1" })).toEqual({
			interviewScheduleId: "i1",
		});
		expect(readInterviewProposalMetadata({})).toBeNull();
	});

	it("상태·제안자 여부로 문구가 갈린다", () => {
		expect(getInterviewProposalNotice("proposed", true)).toBe(
			"면접 일정을 제안했어요."
		);
		expect(getInterviewProposalNotice("proposed", false)).toBe(
			"면접 일정 제안이 도착했어요."
		);
		expect(getInterviewProposalNotice("confirmed", false)).toBe(
			"면접 일정이 확정됐어요."
		);
		expect(getInterviewProposalNotice("unknown", false)).toBe(
			"면접 일정을 제안했습니다."
		);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run (cwd `packages/api`): `pnpm vitest run test/services/bambi-chat-system-messages.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 공유 파일 작성**

`packages/api/src/services/bambi-chat-system-messages.ts`:
```ts
// 채팅 인라인 시스템 메시지(contact_request·interview_proposal)의 metadata 해석과 문구.
// web(seeker-chat-room-responsive)·native(chat-system-card)가 함께 import한다.
// 전화번호 포맷은 앱마다 다르므로(web formatPhone) 호출부가 포맷한 문자열을 넘긴다.

export type ContactRequestStatus = "declined" | "pending" | "revealed";
export type ContactRevealDecision = "decline" | "reveal";

export interface ContactRequestMetadata {
	requesterUserId: string;
	status: ContactRequestStatus;
	targetUserId: string;
}

const CONTACT_REQUEST_STATUSES: readonly string[] = [
	"declined",
	"pending",
	"revealed",
];

// contact_request 메시지의 jsonb metadata는 unknown이라 좁혀서 읽는다. 형태가
// 어긋나면 null(특수 렌더를 건너뛴다).
export const readContactRequestMetadata = (
	value: unknown
): ContactRequestMetadata | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const { requesterUserId, status, targetUserId } = value as Record<
		string,
		unknown
	>;

	if (
		typeof requesterUserId === "string" &&
		typeof targetUserId === "string" &&
		typeof status === "string" &&
		CONTACT_REQUEST_STATUSES.includes(status)
	) {
		return {
			requesterUserId,
			status: status as ContactRequestStatus,
			targetUserId,
		};
	}

	return null;
};

// contact_request 인라인 시스템 메시지 문구. 역할(구인자/구직자)과 status 전이로 분기.
export const getContactRequestNotice = ({
	counterpartName,
	revealedPhoneLabel,
	status,
	viewerIsEmployer,
}: {
	counterpartName: string;
	revealedPhoneLabel: null | string;
	status: ContactRequestStatus;
	viewerIsEmployer: boolean;
}): string => {
	if (status === "pending") {
		return viewerIsEmployer
			? "연락처 공개를 요청했습니다. (응답 대기 중)"
			: `${counterpartName}님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?`;
	}

	if (status === "revealed") {
		return viewerIsEmployer
			? `${counterpartName}님께서 연락처를 공개했습니다: ${revealedPhoneLabel ?? "확인 필요"}`
			: "연락처를 공개했습니다.";
	}

	return viewerIsEmployer
		? `${counterpartName}님께서 연락처 공개를 거절하셨습니다.`
		: "연락처 공개를 거절했습니다.";
};

// interview_proposal 메시지 metadata는 interviewScheduleId만 담는다(상태·일시는 방
// 조회 schedules가 정본). 형태가 어긋나면 null → body 텍스트 폴백.
export const readInterviewProposalMetadata = (
	value: unknown
): { interviewScheduleId: string } | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const { interviewScheduleId } = value as Record<string, unknown>;

	if (typeof interviewScheduleId === "string") {
		return { interviewScheduleId };
	}

	return null;
};

// 면접 제안 인라인 카드 문구. status 전이 + 내가 제안자(구인자)인지로 분기.
export const getInterviewProposalNotice = (
	status: string,
	viewerIsProposer: boolean
): string => {
	switch (status) {
		case "proposed":
			return viewerIsProposer
				? "면접 일정을 제안했어요."
				: "면접 일정 제안이 도착했어요.";
		case "confirmed":
			return "면접 일정이 확정됐어요.";
		case "declined":
			return "면접 제안이 거절됐어요.";
		case "canceled":
			return "면접이 취소됐어요.";
		case "completed":
			return "면접이 완료됐어요.";
		default:
			return "면접 일정을 제안했습니다.";
	}
};
```

- [ ] **Step 4: web 채팅방 컴포넌트에서 로컬 정의 제거·import 교체**

`apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`:
- `type ContactRequestStatus`, `type ContactRevealDecision`, `interface ContactRequestMetadata`, `CONTACT_REQUEST_STATUSES`, `readContactRequestMetadata`, `getContactRequestNotice`, `readInterviewProposalMetadata`, `getInterviewProposalNotice` 정의(약 196~310행)를 삭제.
- 상단 import 추가:
```ts
import {
	type ContactRevealDecision,
	getContactRequestNotice,
	getInterviewProposalNotice,
	readContactRequestMetadata,
	readInterviewProposalMetadata,
} from "@bambi-app/api/services/bambi-chat-system-messages";
```
- `ContactRequestMessage` 내부 호출을 새 시그니처로 변경:
```ts
const notice = getContactRequestNotice({
	counterpartName: counterpartName ?? "상대방",
	revealedPhoneLabel: message.revealedPhone
		? formatPhone(message.revealedPhone)
		: null,
	status: metadata.status,
	viewerIsEmployer,
});
```
(`formatPhone` import는 그대로 유지.)

- [ ] **Step 5: 메시지 id 생성기 crypto 폴백**

`packages/api/src/services/bambi-chat-message-id.ts`의 `crypto.getRandomValues(bytes);` 를 `fillRandomBytes(bytes);` 로 교체하고, 상수 아래에 추가:
```ts
// Hermes(React Native)에는 globalThis.crypto가 없다. 이 id는 보안 토큰이 아니라
// 정렬 가능한 멱등키라, 웹크립토가 없을 때만 Math.random으로 채운다(서버·브라우저는
// 항상 crypto 경로). 앞 48비트 타임스탬프 + 74비트 난수라 충돌은 무시할 수 있다.
const fillRandomBytes = (bytes: Uint8Array): void => {
	const webCrypto = (globalThis as { crypto?: Crypto }).crypto;

	if (typeof webCrypto?.getRandomValues === "function") {
		webCrypto.getRandomValues(bytes);
		return;
	}

	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Math.floor(Math.random() * BYTE);
	}
};
```

- [ ] **Step 6: 폴백 테스트 추가**

`packages/api/test/services/bambi-chat-message-id.test.ts` 마지막 `describe` 안에 추가:
```ts
	it("crypto가 없어도 형식을 지킨다(Hermes 폴백)", () => {
		const original = globalThis.crypto;
		Object.defineProperty(globalThis, "crypto", {
			configurable: true,
			value: undefined,
		});

		try {
			const id = generateChatMessageId();

			expect(id).toMatch(UUID_PATTERN);
			expect(id[14]).toBe("7");
		} finally {
			Object.defineProperty(globalThis, "crypto", {
				configurable: true,
				value: original,
			});
		}
	});
```

- [ ] **Step 7: 테스트·타입·린트**

Run (cwd `packages/api`):
```bash
pnpm vitest run test/services/bambi-chat-system-messages.test.ts test/services/bambi-chat-message-id.test.ts
```
Expected: 2 files passed.

Run (cwd 루트):
```bash
pnpm --filter web check-types
pnpm --filter @bambi-app/api check-types
pnpm dlx ultracite check packages/api/src/services/bambi-chat-system-messages.ts packages/api/src/services/bambi-chat-message-id.ts apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx
```
Expected: 오류 0.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/services/bambi-chat-system-messages.ts packages/api/src/services/bambi-chat-message-id.ts packages/api/test/services apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx
git commit -m "refactor: 채팅 시스템 메시지 문구를 공유 서비스로 추출·메시지 id 생성기 crypto 폴백"
```

---

### Task 4: native 순수 함수 + vitest 설정

**Files:**
- Create: `apps/native/vitest.config.ts`
- Create: `apps/native/src/lib/chat/chat-types.ts`
- Create: `apps/native/src/lib/chat/chat-time.ts`
- Create: `apps/native/src/lib/chat/chat-optimistic.ts`
- Create: `apps/native/src/lib/chat/chat-typing.ts`
- Create: `apps/native/src/lib/chat/chat-errors.ts`
- Test: `apps/native/test/lib/chat/chat-time.test.ts`, `chat-optimistic.test.ts`, `chat-typing.test.ts`, `chat-errors.test.ts`

**Interfaces:**
- Produces:
  - `chat-types.ts`: `ChatRoomDetail`, `ChatRoomMessage`, `ChatRoomSchedule`, `ChatRoomAttachment`, `ChatRoomListItem`
  - `chat-time.ts`: `formatChatListTime(value: Date | string, now?: Date): string`
  - `chat-optimistic.ts`: `type ChatSendStatus = "failed" | "sending"`, `interface OptimisticChatMessage { attempts: number; body: string; chatRoomId: string; createdAt: string; id: string; localImageUri: null | string; senderUserId: string; sendStatus: ChatSendStatus }`, `type ChatTimelineMessage = ChatRoomMessage & { localImageUri?: null | string; sendStatus?: ChatSendStatus }`, `createOptimisticTextMessage({ body, chatRoomId, id, senderUserId }): OptimisticChatMessage`, `createOptimisticImageMessage({ chatRoomId, id, localImageUri, senderUserId }): OptimisticChatMessage`, `buildChatTimeline({ optimistic, server }): ChatTimelineMessage[]`(시간순, 서버 우선), `toInvertedTimeline(items): ChatTimelineMessage[]`, `dropSettledOptimistic(optimistic, server): OptimisticChatMessage[]`
  - `chat-typing.ts`: `type TypingState = Readonly<Record<string, number>>`(만료 시각 ms), `TYPING_TTL_MS = 5000`, `applyTypingStarted(state, userId, now): TypingState`, `applyTypingStopped(state, userId): TypingState`, `pruneTyping(state, now): TypingState`, `typingUserIds(state, now): string[]`
  - `chat-errors.ts`: `chatMutationErrorMessage(error: unknown): string`, `startChatErrorMessage(error: unknown): string`, `attachmentPolicyMessage(code: ChatMediaPolicyCode): string`, `readOrpcErrorCode(error: unknown): string | null`

- [ ] **Step 1: vitest 설정**

`apps/native/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

// native 순수 함수(src/lib/chat/*)만 node 환경에서 검증한다. RN 컴포넌트는 렌더 테스트를
// 두지 않는다(라이브러리 추가 금지) — 로직을 훅 밖 순수 함수로 빼서 여기서 덮는다.
// tsconfig paths "@/*" → "./*"와 같은 축.
export default defineConfig({
	resolve: {
		alias: { "@": import.meta.dirname },
	},
	root: import.meta.dirname,
	test: {
		include: ["test/**/*.test.ts"],
	},
});
```
`apps/native/package.json` scripts에 추가:
```json
"test": "vitest run"
```
vitest는 리포 루트 devDependency로 설치되어 있다. `pnpm --filter native test`가 바이너리를 못 찾으면 루트에서 `pnpm vitest run --config apps/native/vitest.config.ts`로 실행한다(둘 중 동작하는 쪽을 이후 단계에서 계속 쓴다).

- [ ] **Step 2: 타입 파일**

`apps/native/src/lib/chat/chat-types.ts`:
```ts
import type { AppRouterClient } from "@bambi-app/api/routers/index";

type ChatsClient = AppRouterClient["bambi"]["chats"];

export type ChatRoomDetail = Awaited<ReturnType<ChatsClient["getById"]>>;
export type ChatRoomMessage = ChatRoomDetail["messages"][number];
export type ChatRoomSchedule = ChatRoomDetail["schedules"][number];
export type ChatRoomAttachment = ChatRoomMessage["attachments"][number];
export type ChatRoomListItem = Awaited<
	ReturnType<ChatsClient["listMine"]>
>[number];
```

- [ ] **Step 3: 실패하는 테스트 4개 작성**

`apps/native/test/lib/chat/chat-time.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { formatChatListTime } from "@/src/lib/chat/chat-time";

const now = new Date(2026, 8, 3, 15, 30);

describe("formatChatListTime", () => {
	it("오늘은 시각", () => {
		expect(formatChatListTime(new Date(2026, 8, 3, 9, 5), now)).toBe(
			"오전 9:05"
		);
	});

	it("어제는 '어제'", () => {
		expect(formatChatListTime(new Date(2026, 8, 2, 23, 59), now)).toBe("어제");
	});

	it("그 이전은 월. 일.", () => {
		expect(formatChatListTime(new Date(2026, 7, 30, 12, 0), now)).toBe(
			"8. 30."
		);
	});
});
```

`apps/native/test/lib/chat/chat-optimistic.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	buildChatTimeline,
	createOptimisticTextMessage,
	dropSettledOptimistic,
	toInvertedTimeline,
} from "@/src/lib/chat/chat-optimistic";
import type { ChatRoomMessage } from "@/src/lib/chat/chat-types";

const serverMessage = (id: string, createdAt: string): ChatRoomMessage =>
	({
		attachments: [],
		body: `서버 ${id}`,
		chatRoomId: "room",
		createdAt: new Date(createdAt),
		id,
		kind: "text",
		metadata: null,
		revealedPhone: null,
		riskFlags: [],
		senderUserId: "me",
	}) as unknown as ChatRoomMessage;

const optimistic = (id: string) =>
	createOptimisticTextMessage({
		body: id,
		chatRoomId: "room",
		id,
		senderUserId: "me",
	});

describe("buildChatTimeline", () => {
	it("낙관적 메시지를 서버 메시지 뒤에 시간순으로 붙인다", () => {
		const timeline = buildChatTimeline({
			optimistic: [optimistic("opt")],
			server: [serverMessage("a", "2026-09-01T00:00:00.000Z")],
		});

		expect(timeline.map(({ id }) => id)).toEqual(["a", "opt"]);
		expect(timeline[1].sendStatus).toBe("sending");
	});

	it("같은 id의 서버 행이 오면 낙관적 항목을 대체하고 sendStatus가 사라진다", () => {
		const timeline = buildChatTimeline({
			optimistic: [optimistic("a")],
			server: [serverMessage("a", "2026-09-01T00:00:00.000Z")],
		});

		expect(timeline).toHaveLength(1);
		expect(timeline[0].body).toBe("서버 a");
		expect(timeline[0].sendStatus).toBeUndefined();
	});
});

describe("dropSettledOptimistic", () => {
	it("서버에 도착한 id만 걷어낸다", () => {
		expect(
			dropSettledOptimistic(
				[optimistic("a"), optimistic("b")],
				[serverMessage("a", "2026-09-01T00:00:00.000Z")]
			).map(({ id }) => id)
		).toEqual(["b"]);
	});
});

describe("toInvertedTimeline", () => {
	it("최신이 0번이 된다(FlatList inverted)", () => {
		const timeline = buildChatTimeline({
			optimistic: [],
			server: [
				serverMessage("a", "2026-09-01T00:00:00.000Z"),
				serverMessage("b", "2026-09-02T00:00:00.000Z"),
			],
		});

		expect(toInvertedTimeline(timeline).map(({ id }) => id)).toEqual([
			"b",
			"a",
		]);
	});
});
```

`apps/native/test/lib/chat/chat-typing.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	applyTypingStarted,
	applyTypingStopped,
	pruneTyping,
	TYPING_TTL_MS,
	typingUserIds,
} from "@/src/lib/chat/chat-typing";

describe("타이핑 리듀서", () => {
	it("started는 TTL 뒤 만료 시각을 기록한다", () => {
		const state = applyTypingStarted({}, "u1", 1000);

		expect(typingUserIds(state, 1000)).toEqual(["u1"]);
		expect(typingUserIds(state, 1000 + TYPING_TTL_MS + 1)).toEqual([]);
	});

	it("stopped는 즉시 지운다", () => {
		const state = applyTypingStopped(applyTypingStarted({}, "u1", 0), "u1");

		expect(typingUserIds(state, 0)).toEqual([]);
	});

	it("pruneTyping은 만료된 항목만 제거하고 바뀐 게 없으면 같은 참조", () => {
		const state = applyTypingStarted(
			applyTypingStarted({}, "old", 0),
			"new",
			4000
		);
		const pruned = pruneTyping(state, TYPING_TTL_MS + 1);

		expect(Object.keys(pruned)).toEqual(["new"]);
		expect(pruneTyping(pruned, TYPING_TTL_MS + 1)).toBe(pruned);
	});
});
```

`apps/native/test/lib/chat/chat-errors.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	attachmentPolicyMessage,
	chatMutationErrorMessage,
	readOrpcErrorCode,
	startChatErrorMessage,
} from "@/src/lib/chat/chat-errors";

const orpcError = (code: string, extra: Record<string, unknown> = {}) =>
	Object.assign(new Error(extra.message as string | undefined), {
		code,
		...extra,
	});

describe("readOrpcErrorCode", () => {
	it("code 문자열을 읽고 없으면 null", () => {
		expect(readOrpcErrorCode(orpcError("FORBIDDEN"))).toBe("FORBIDDEN");
		expect(readOrpcErrorCode(new Error("x"))).toBeNull();
		expect(readOrpcErrorCode(null)).toBeNull();
	});
});

describe("chatMutationErrorMessage", () => {
	it("차단 사유가 있으면 공유 문구", () => {
		expect(
			chatMutationErrorMessage(
				orpcError("FORBIDDEN", { data: { chatBlockReason: "moderation" } })
			)
		).toBe("신고에 대한 운영자 조치로 종료된 채팅방이에요.");
	});

	it("TOO_MANY_REQUESTS는 서버 문구를 그대로", () => {
		expect(
			chatMutationErrorMessage(
				orpcError("TOO_MANY_REQUESTS", { message: "채팅 요청이 너무 잦아요." })
			)
		).toBe("채팅 요청이 너무 잦아요.");
	});

	it("UNAUTHORIZED·FORBIDDEN·기타 폴백", () => {
		expect(chatMutationErrorMessage(orpcError("UNAUTHORIZED"))).toBe(
			"로그인 후 다시 시도해 주세요."
		);
		expect(chatMutationErrorMessage(orpcError("FORBIDDEN"))).toBe(
			"권한이 없거나 차단된 채팅방입니다."
		);
		expect(chatMutationErrorMessage(new Error("boom"))).toBe(
			"요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
		);
	});
});

describe("startChatErrorMessage", () => {
	it("서버가 한국어 message를 실은 FORBIDDEN은 그대로", () => {
		expect(
			startChatErrorMessage(
				orpcError("FORBIDDEN", {
					message:
						"업체 인증 변경사항이 제출되기 전에는 새 채팅을 시작할 수 없습니다.",
				})
			)
		).toBe(
			"업체 인증 변경사항이 제출되기 전에는 새 채팅을 시작할 수 없습니다."
		);
	});

	it("message 없는 FORBIDDEN(영어 기본값 포함)은 자격 안내", () => {
		expect(startChatErrorMessage(orpcError("FORBIDDEN"))).toBe(
			"휴대폰 인증을 마친 구직자만 게재 중인 공고에 채팅을 시작할 수 있어요."
		);
		expect(
			startChatErrorMessage(orpcError("FORBIDDEN", { message: "Forbidden" }))
		).toBe(
			"휴대폰 인증을 마친 구직자만 게재 중인 공고에 채팅을 시작할 수 있어요."
		);
	});

	it("NOT_FOUND", () => {
		expect(startChatErrorMessage(orpcError("NOT_FOUND"))).toBe(
			"공고를 찾을 수 없어요."
		);
	});
});

describe("attachmentPolicyMessage", () => {
	it("정책 코드별 문구", () => {
		expect(attachmentPolicyMessage("file_too_large")).toBe(
			"10MB 이하 파일만 보낼 수 있어요."
		);
		expect(attachmentPolicyMessage("unsupported_type")).toBe(
			"JPG·PNG·WebP 이미지 또는 PDF만 보낼 수 있어요."
		);
		expect(attachmentPolicyMessage("empty_file_name")).toBe(
			"파일 이름을 읽을 수 없어요. 다른 파일을 선택해 주세요."
		);
	});
});
```

- [ ] **Step 4: 실패 확인**

Run (cwd `apps/native`): `pnpm vitest run`
Expected: 4 files FAIL(모듈 없음).

- [ ] **Step 5: 순수 함수 구현**

`apps/native/src/lib/chat/chat-time.ts`:
```ts
import { formatChatTimeLabel } from "@bambi-app/api/services/bambi-chat-message-grouping";

const DAY_MS = 86_400_000;
const listDateFormat = new Intl.DateTimeFormat("ko-KR", {
	day: "numeric",
	month: "numeric",
});

// 채팅 목록 우측 시각 — web seeker-chat-list-responsive의 formatChatListTime과 같은 규칙.
// now를 주입받아 테스트가 시계에 흔들리지 않는다.
export const formatChatListTime = (
	value: Date | string,
	now: Date = new Date()
): string => {
	const at = new Date(value);
	// 로컬 자정 기준으로 오늘/어제를 가른다(UTC로 자르면 새벽 메시지가 어제로 샌다).
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate()
	).getTime();

	if (at.getTime() >= startOfToday) {
		return formatChatTimeLabel(at);
	}
	if (at.getTime() >= startOfToday - DAY_MS) {
		return "어제";
	}
	return listDateFormat.format(at);
};
```

`apps/native/src/lib/chat/chat-optimistic.ts`:
```ts
import { mergeChatMessagesById } from "@bambi-app/api/services/bambi-chat-room-messages";

import type { ChatRoomMessage } from "./chat-types";

export type ChatSendStatus = "failed" | "sending";

// 서버 응답이 오기 전 화면에 먼저 그리는 내 메시지. id는 generateChatMessageId()로
// 만들어 서버에 그대로 보내므로, 서버 행이 캐시에 들어오면 같은 id로 자연히 대체된다.
export interface OptimisticChatMessage {
	attempts: number;
	body: string;
	chatRoomId: string;
	createdAt: string;
	id: string;
	// 이미지 첨부 전송 중 미리 보여줄 로컬 파일 uri. 텍스트면 null.
	localImageUri: null | string;
	senderUserId: string;
	sendStatus: ChatSendStatus;
}

export type ChatTimelineMessage = ChatRoomMessage & {
	localImageUri?: null | string;
	sendStatus?: ChatSendStatus;
};

// 서버 sendMediaMessage가 첨부 메시지 body로 저장하는 문구와 같다(chats.ts).
const OPTIMISTIC_IMAGE_BODY = "첨부 파일을 보냈습니다.";

export const createOptimisticTextMessage = ({
	body,
	chatRoomId,
	id,
	senderUserId,
}: {
	body: string;
	chatRoomId: string;
	id: string;
	senderUserId: string;
}): OptimisticChatMessage => ({
	attempts: 1,
	body,
	chatRoomId,
	createdAt: new Date().toISOString(),
	id,
	localImageUri: null,
	senderUserId,
	sendStatus: "sending",
});

export const createOptimisticImageMessage = ({
	chatRoomId,
	id,
	localImageUri,
	senderUserId,
}: {
	chatRoomId: string;
	id: string;
	localImageUri: string;
	senderUserId: string;
}): OptimisticChatMessage => ({
	attempts: 1,
	body: OPTIMISTIC_IMAGE_BODY,
	chatRoomId,
	createdAt: new Date().toISOString(),
	id,
	localImageUri,
	senderUserId,
	sendStatus: "sending",
});

// 낙관적 항목을 서버 메시지 모양으로 승격한다. 서버 행에만 있는 필드는 비운 값으로 채운다.
const toTimelineMessage = (
	optimistic: OptimisticChatMessage
): ChatTimelineMessage =>
	({
		attachments: [],
		body: optimistic.body,
		chatRoomId: optimistic.chatRoomId,
		createdAt: new Date(optimistic.createdAt),
		id: optimistic.id,
		kind: "text",
		localImageUri: optimistic.localImageUri,
		metadata: null,
		revealedPhone: null,
		riskFlags: [],
		senderUserId: optimistic.senderUserId,
		sendStatus: optimistic.sendStatus,
	}) as unknown as ChatTimelineMessage;

/**
 * 서버 메시지(최신 페이지 + 누적 과거 페이지)와 낙관적 메시지를 시간순 한 줄로 합친다.
 * 같은 id는 서버 행이 이긴다(mergeChatMessagesById의 latest 우선) — 전송 성공 직후
 * sendStatus가 사라지는 것이 그 결과다.
 */
export const buildChatTimeline = ({
	optimistic,
	server,
}: {
	optimistic: readonly OptimisticChatMessage[];
	server: readonly ChatRoomMessage[];
}): ChatTimelineMessage[] =>
	mergeChatMessagesById<ChatTimelineMessage>(
		optimistic.map(toTimelineMessage),
		server
	);

/** 서버에 도착한 id의 낙관적 항목을 걷어낸다(재전송 목록·업로드 중 상태 정리용). */
export const dropSettledOptimistic = (
	optimistic: readonly OptimisticChatMessage[],
	server: readonly ChatRoomMessage[]
): OptimisticChatMessage[] => {
	const serverIds = new Set(server.map(({ id }) => id));

	return optimistic.filter(({ id }) => !serverIds.has(id));
};

/** FlatList inverted는 0번이 화면 맨 아래(최신)다. */
export const toInvertedTimeline = <ItemType>(
	items: readonly ItemType[]
): ItemType[] => [...items].reverse();
```

`apps/native/src/lib/chat/chat-typing.ts`:
```ts
// 상대 타이핑 표시 상태 — userId → 만료 시각(ms). stopped 이벤트가 유실돼도 TTL로 꺼진다.
export type TypingState = Readonly<Record<string, number>>;

export const TYPING_TTL_MS = 5000;

export const applyTypingStarted = (
	state: TypingState,
	userId: string,
	now: number
): TypingState => ({ ...state, [userId]: now + TYPING_TTL_MS });

export const applyTypingStopped = (
	state: TypingState,
	userId: string
): TypingState => {
	if (!(userId in state)) {
		return state;
	}

	return Object.fromEntries(
		Object.entries(state).filter(([key]) => key !== userId)
	);
};

/** 만료된 항목을 제거한다. 바뀐 게 없으면 같은 참조를 돌려 리렌더를 피한다. */
export const pruneTyping = (state: TypingState, now: number): TypingState => {
	const alive = Object.entries(state).filter(([, expiresAt]) => expiresAt > now);

	if (alive.length === Object.keys(state).length) {
		return state;
	}

	return Object.fromEntries(alive);
};

export const typingUserIds = (state: TypingState, now: number): string[] =>
	Object.entries(state)
		.filter(([, expiresAt]) => expiresAt > now)
		.map(([userId]) => userId);
```

`apps/native/src/lib/chat/chat-errors.ts`:
```ts
import { getChatBlockMessage } from "@bambi-app/api/services/bambi-chat-block";
import type { ChatMediaPolicyCode } from "@bambi-app/api/services/bambi-media-policy";

// oRPC는 message 없는 ORPCError에 영어 기본 문구를 채운다(FORBIDDEN→"Forbidden").
// 그래서 서버가 한국어 message를 실었을 때만 그대로 쓰고, 나머지는 code별 우리 문구다.
export const readOrpcErrorCode = (error: unknown): string | null => {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return null;
	}

	const { code } = error as { code?: unknown };

	return typeof code === "string" ? code : null;
};

// 영어 기본값(라틴 문자·공백·마침표만)은 버린다.
const ENGLISH_FALLBACK_PATTERN = /^[A-Za-z .]+$/;

const readServerMessage = (error: unknown): string | null => {
	if (!(error instanceof Error) || !error.message) {
		return null;
	}

	return ENGLISH_FALLBACK_PATTERN.test(error.message) ? null : error.message;
};

const GENERIC_MESSAGE = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
const RATE_LIMIT_MESSAGE = "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";

// web seeker-chat-room-responsive getMutationErrorMessage의 native판 + 레이트리밋·경합 분기.
export const chatMutationErrorMessage = (error: unknown): string => {
	const code = readOrpcErrorCode(error);

	if (code === "UNAUTHORIZED") {
		return "로그인 후 다시 시도해 주세요.";
	}

	const blockMessage = getChatBlockMessage(error);

	if (blockMessage) {
		return blockMessage;
	}

	if (code === "TOO_MANY_REQUESTS") {
		return readServerMessage(error) ?? RATE_LIMIT_MESSAGE;
	}

	if (code === "FORBIDDEN") {
		return "권한이 없거나 차단된 채팅방입니다.";
	}

	if (code === "CONFLICT") {
		return "상태가 이미 바뀌었어요. 채팅방을 새로고침했어요.";
	}

	return GENERIC_MESSAGE;
};

// 공고 상세 "1:1 채팅 시작" 실패 안내. 서버 startFromJobPost는 자격 미달을 message 없는
// FORBIDDEN으로, 업체 미제출은 한국어 message로 돌려준다(chats.ts:785-884).
export const startChatErrorMessage = (error: unknown): string => {
	const code = readOrpcErrorCode(error);
	const serverMessage = readServerMessage(error);

	if (code === "NOT_FOUND") {
		return "공고를 찾을 수 없어요.";
	}

	if (code === "FORBIDDEN") {
		return (
			serverMessage ??
			"휴대폰 인증을 마친 구직자만 게재 중인 공고에 채팅을 시작할 수 있어요."
		);
	}

	if (code === "TOO_MANY_REQUESTS") {
		return serverMessage ?? RATE_LIMIT_MESSAGE;
	}

	return "채팅을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

// validateChatMediaUpload(bambi-media-policy) 실패 코드 → 안내.
export const attachmentPolicyMessage = (code: ChatMediaPolicyCode): string => {
	switch (code) {
		case "file_too_large":
			return "10MB 이하 파일만 보낼 수 있어요.";
		case "unsupported_type":
			return "JPG·PNG·WebP 이미지 또는 PDF만 보낼 수 있어요.";
		default:
			return "파일 이름을 읽을 수 없어요. 다른 파일을 선택해 주세요.";
	}
};
```

- [ ] **Step 6: 테스트 통과 확인**

Run (cwd `apps/native`): `pnpm vitest run`
Expected: 4 files passed.

- [ ] **Step 7: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/lib/chat apps/native/test apps/native/vitest.config.ts
```
Expected: 오류 0.

- [ ] **Step 8: Commit**

```bash
git add apps/native/vitest.config.ts apps/native/package.json apps/native/src/lib/chat apps/native/test
git commit -m "feat(native): 채팅 순수 로직(시각·낙관적 병합·타이핑·오류 문구)과 vitest 설정"
```

---

### Task 5: socket.io 클라이언트 싱글턴 `chat-socket.ts`

**Files:**
- Create: `apps/native/src/lib/chat/chat-socket.ts`

**Interfaces:**
- Consumes: `socket.io-client`(Task 1), `authClient.getCookie()`(`@/lib/auth-client`), `env.EXPO_PUBLIC_SERVER_URL`(`@bambi-app/env/native`), 이벤트 타입 `ChatRealtimeServerToClientEvents`·`ChatErrorEvent`(`@bambi-app/api/services/bambi-chat-realtime`)
- Produces:
  - `type ChatSocket = Socket<ChatRealtimeServerToClientEvents, ChatRealtimeClientToServerEvents>`
  - `getChatSocket(): ChatSocket` — 생성만, 연결 안 함
  - `connectChatSocket(): ChatSocket` — 미연결이면 connect
  - `joinChatRoom(roomId: string): Promise<void>` — ack 5초 타임아웃, 유예 leave 취소
  - `leaveChatRoom(roomId: string): void`
  - `scheduleChatRoomLeave(roomId: string): void` — 30초 유예
  - `emitChatTypingStarted(roomId: string): void`, `emitChatTypingStopped(roomId: string): void`
  - `disconnectChatSocket(): void` — 로그아웃 시 호출용

- [ ] **Step 1: 파일 작성**

`apps/native/src/lib/chat/chat-socket.ts` (web `apps/web/src/lib/bambi-chat-realtime.ts`의 native판 — `window.*` 대신 전역 타이머, 쿠키는 헤더로):
```ts
import type {
	ChatErrorEvent,
	ChatRealtimeServerToClientEvents,
} from "@bambi-app/api/services/bambi-chat-realtime";
import { env } from "@bambi-app/env/native";
import { Platform } from "react-native";
import { io, type Socket } from "socket.io-client";

import { authClient } from "@/lib/auth-client";

interface ChatRoomPayload {
	roomId: string;
}

interface ChatRealtimeAckSuccess {
	ok: true;
}

interface ChatRealtimeAckFailure {
	error: ChatErrorEvent;
	ok: false;
}

type ChatRealtimeAckResponse = ChatRealtimeAckFailure | ChatRealtimeAckSuccess;

interface ChatRealtimeClientToServerEvents {
	"chat:join": (
		payload: ChatRoomPayload,
		ack?: (response: ChatRealtimeAckResponse) => void
	) => void;
	"chat:leave": (
		payload: ChatRoomPayload,
		ack?: (response: ChatRealtimeAckResponse) => void
	) => void;
	"chat:typing:started": (payload: ChatRoomPayload) => void;
	"chat:typing:stopped": (payload: ChatRoomPayload) => void;
}

export type ChatSocket = Socket<
	ChatRealtimeServerToClientEvents,
	ChatRealtimeClientToServerEvents
>;

const ACK_TIMEOUT_MS = 5000;
// 방 화면을 떠난 뒤 소켓 방 입장을 정리하기까지의 유예(web과 동일). 잠깐 다른 화면을
// 보고 돌아오는 왕복에서 매번 leave/join을 하지 않는다.
const LEAVE_GRACE_MS = 30_000;
// 서버 인증 미들웨어 거절(레이트리밋·세션 순단)은 socket.io가 스스로 다시 붙지 않는다
// (socket.active === false). 우리가 지수 백오프로 다시 붙인다.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

let chatSocket: ChatSocket | null = null;
const pendingLeaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let reconnectTimer: null | ReturnType<typeof setTimeout> = null;
let reconnectAttempt = 0;

const clearReconnectTimer = (): void => {
	if (reconnectTimer !== null) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
};

const scheduleReconnect = (): void => {
	if (reconnectTimer !== null) {
		return;
	}

	const backoff = Math.min(
		RECONNECT_BASE_MS * 2 ** reconnectAttempt,
		RECONNECT_MAX_MS
	);
	const delay = backoff + Math.floor(Math.random() * RECONNECT_BASE_MS);
	reconnectAttempt += 1;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		chatSocket?.connect();
	}, delay);
};

const cancelPendingLeave = (roomId: string): void => {
	const timerId = pendingLeaveTimers.get(roomId);

	if (timerId !== undefined) {
		clearTimeout(timerId);
		pendingLeaveTimers.delete(roomId);
	}
};

const rejectFromAck = (response: ChatRealtimeAckResponse): Error | null =>
	response.ok ? null : new Error(response.error.message);

// orpc.ts와 같은 인증 경로: 네이티브는 쿠키 저장소가 없으므로 SecureStore의 세션 쿠키를
// Cookie 헤더로 직접 싣는다(서버 io.use가 createContext(headers)로 세션을 읽는다).
// 웹 빌드(Platform.OS === "web")는 브라우저 쿠키를 withCredentials로 보낸다.
const resolveAuthHeaders = (): Record<string, string> => {
	if (Platform.OS === "web") {
		return {};
	}

	const cookies = authClient.getCookie();

	return cookies ? { Cookie: cookies } : {};
};

export const getChatSocket = (): ChatSocket => {
	if (!chatSocket) {
		chatSocket = io(env.EXPO_PUBLIC_SERVER_URL, {
			autoConnect: false,
			// extraHeaders는 연결 시점에 읽히므로 재연결마다 최신 쿠키를 싣도록 함수형으로
			// 갈아 끼운다(아래 reconnect_attempt 핸들러).
			extraHeaders: resolveAuthHeaders(),
			reconnection: true,
			reconnectionDelay: 500,
			reconnectionDelayMax: 5000,
			timeout: ACK_TIMEOUT_MS,
			withCredentials: Platform.OS === "web",
		}) as ChatSocket;

		chatSocket.on("connect", () => {
			reconnectAttempt = 0;
			clearReconnectTimer();
		});
		chatSocket.on("connect_error", () => {
			if (!chatSocket?.active) {
				scheduleReconnect();
			}
		});
		// 재연결 직전 헤더를 최신 세션 쿠키로 갱신한다(재로그인 뒤 옛 쿠키로 붙는 것 방지).
		chatSocket.io.on("reconnect_attempt", () => {
			if (chatSocket) {
				chatSocket.io.opts.extraHeaders = resolveAuthHeaders();
			}
		});
	}

	return chatSocket;
};

export const connectChatSocket = (): ChatSocket => {
	const socket = getChatSocket();

	if (!socket.connected) {
		socket.io.opts.extraHeaders = resolveAuthHeaders();
		socket.connect();
	}

	return socket;
};

export const joinChatRoom = (roomId: string): Promise<void> =>
	new Promise((resolve, reject) => {
		cancelPendingLeave(roomId);
		const socket = connectChatSocket();
		const timeoutId = setTimeout(() => {
			reject(new Error("실시간 채팅 연결이 지연되고 있어요."));
		}, ACK_TIMEOUT_MS);

		socket.emit("chat:join", { roomId }, (response) => {
			clearTimeout(timeoutId);
			const error = rejectFromAck(response);

			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});

export const leaveChatRoom = (roomId: string): void => {
	cancelPendingLeave(roomId);
	const socket = getChatSocket();

	if (socket.connected) {
		socket.emit("chat:leave", { roomId });
	}
};

export const scheduleChatRoomLeave = (roomId: string): void => {
	if (pendingLeaveTimers.has(roomId)) {
		return;
	}

	pendingLeaveTimers.set(
		roomId,
		setTimeout(() => {
			pendingLeaveTimers.delete(roomId);
			leaveChatRoom(roomId);
		}, LEAVE_GRACE_MS)
	);
};

export const emitChatTypingStarted = (roomId: string): void => {
	const socket = getChatSocket();

	if (socket.connected) {
		socket.emit("chat:typing:started", { roomId });
	}
};

export const emitChatTypingStopped = (roomId: string): void => {
	const socket = getChatSocket();

	if (socket.connected) {
		socket.emit("chat:typing:stopped", { roomId });
	}
};

// 로그아웃 시 세션 쿠키가 사라진 뒤에도 옛 연결이 남지 않게 끊는다.
export const disconnectChatSocket = (): void => {
	clearReconnectTimer();
	for (const timerId of pendingLeaveTimers.values()) {
		clearTimeout(timerId);
	}
	pendingLeaveTimers.clear();
	chatSocket?.disconnect();
};
```

- [ ] **Step 2: 로그아웃 훅 연결**

`apps/native/src/components/logout-button.tsx`(기존)에서 `authClient.signOut` 호출 직후에 `disconnectChatSocket()`을 호출한다:
```ts
import { disconnectChatSocket } from "@/src/lib/chat/chat-socket";
// ... signOut 성공 콜백 안:
disconnectChatSocket();
```
(파일 구조가 다르면 signOut을 호출하는 곳 바로 다음 줄에 넣는다. 다른 로직은 건드리지 않는다.)

- [ ] **Step 3: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/lib/chat/chat-socket.ts apps/native/src/components/logout-button.tsx
```
Expected: 오류 0. `socket.io.opts.extraHeaders` 타입 오류가 나면 `(socket.io.opts as { extraHeaders?: Record<string, string> }).extraHeaders = ...`로 좁힌다.

- [ ] **Step 4: Commit**

```bash
git add apps/native/src/lib/chat/chat-socket.ts apps/native/src/components/logout-button.tsx
git commit -m "feat(native): 채팅 socket.io 클라이언트 싱글턴(쿠키 헤더 인증·30초 leave 유예·재연결)"
```

---

### Task 6: 채팅방 데이터 훅 3종 + 미읽음 배지 훅

**Files:**
- Create: `apps/native/src/lib/chat/use-chat-messages.ts`
- Create: `apps/native/src/lib/chat/use-chat-auto-read.ts`
- Create: `apps/native/src/lib/chat/use-chat-room-realtime.ts`
- Create: `apps/native/src/lib/chat/use-chat-unread-badge.ts`
- Create: `apps/native/src/lib/chat/chat-read-watermark.ts` (순수)
- Test: `apps/native/test/lib/chat/chat-read-watermark.test.ts`

**Interfaces:**
- Consumes: Task 4 타입·`buildChatTimeline`·`dropSettledOptimistic`·타이핑 리듀서, Task 5 소켓 함수, `orpc`·`queryClient`(`@/src/lib/orpc`), 공유 `mergeChatMessagesById`·`resolveOldestChatMessageCursor`
- Produces:
  - `CHAT_MESSAGE_PAGE_SIZE = 50`
  - `useChatMessages({ roomId, optimistic }): { canLoadOlder: boolean; isLoadingOlder: boolean; loadOlder: () => void; room: ChatRoomDetail | undefined; roomQuery: UseQueryResult<ChatRoomDetail>; timeline: ChatTimelineMessage[] /* 시간순 */ }`
  - `useChatAutoRead({ chatRoomId, isActive }): { markReadNow: (messageId: null | string) => void; queueMarkRead: (messageId: null | string) => void; reassertMarkRead: () => void }`
  - `useChatRoomRealtime({ roomId, onIncomingMessage: (messageId: string) => void; onUnreadRemaining: () => void }): { isConnected: boolean; typingUserIds: string[] }`
  - `useChatUnreadBadge(enabled: boolean): number` — 탭 배지 총합
  - `chat-read-watermark.ts`: `resolveNextChatReadWatermark({ attemptedMessageId, latestUnreadMessageId }): null | string`, `canFlushChatRead(latest, sentMessageId, attempted): boolean`
  - 쿼리 키 규약: 방 상세 무효화는 `orpc.bambi.chats.getById.key({ input: { id: roomId } })`(부분 일치), 목록은 `orpc.bambi.chats.listMine.queryKey()`, 배지는 `orpc.bambi.chats.unreadState.queryKey()`

- [ ] **Step 1: 읽음 기준선 순수 함수 + 테스트**

`apps/native/test/lib/chat/chat-read-watermark.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	canFlushChatRead,
	resolveNextChatReadWatermark,
} from "@/src/lib/chat/chat-read-watermark";

describe("resolveNextChatReadWatermark", () => {
	it("서버가 더 새 안읽음을 알려주면 그 id로 갈아탄다", () => {
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "m1",
				latestUnreadMessageId: "m2",
			})
		).toBe("m2");
	});

	it("같은 id거나 null이면 끝", () => {
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "m1",
				latestUnreadMessageId: "m1",
			})
		).toBeNull();
		expect(
			resolveNextChatReadWatermark({
				attemptedMessageId: "m1",
				latestUnreadMessageId: null,
			})
		).toBeNull();
	});
});

describe("canFlushChatRead", () => {
	const latest = { chatRoomId: "r", messageId: "m1" };

	it("기준선이 있고 아직 안 보냈고 이번 루프에서 시도 안 했으면 true", () => {
		expect(canFlushChatRead(latest, null, new Set())).toBe(true);
	});

	it("이미 보낸 기준선이면 false", () => {
		expect(canFlushChatRead(latest, "m1", new Set())).toBe(false);
	});

	it("이번 루프에서 시도한 기준선이면 false(무한 루프 방지)", () => {
		expect(canFlushChatRead(latest, null, new Set(["m1"]))).toBe(false);
	});

	it("기준선이 없으면 false", () => {
		expect(canFlushChatRead(null, null, new Set())).toBe(false);
	});
});
```

Run (cwd `apps/native`): `pnpm vitest run test/lib/chat/chat-read-watermark.test.ts` → FAIL(모듈 없음).

`apps/native/src/lib/chat/chat-read-watermark.ts` (web use-chat-room-auto-read.ts의 순수부 이식):
```ts
export interface ChatReadWatermark {
	chatRoomId: string;
	messageId: string;
}

/** markRead 응답이 "더 새 안읽음"을 알려주면 그 id를 다음 기준선으로 삼는다. */
export const resolveNextChatReadWatermark = ({
	attemptedMessageId,
	latestUnreadMessageId,
}: {
	attemptedMessageId: string;
	latestUnreadMessageId: null | string;
}): null | string =>
	latestUnreadMessageId && latestUnreadMessageId !== attemptedMessageId
		? latestUnreadMessageId
		: null;

export const canFlushChatRead = (
	latest: ChatReadWatermark | null,
	sentMessageId: null | string,
	attemptedMessageIds: ReadonlySet<string>
): latest is ChatReadWatermark =>
	Boolean(
		latest &&
			sentMessageId !== latest.messageId &&
			!attemptedMessageIds.has(latest.messageId)
	);
```

Run again → PASS.

- [ ] **Step 2: `use-chat-messages.ts`**

```ts
import {
	mergeChatMessagesById,
	resolveOldestChatMessageCursor,
} from "@bambi-app/api/services/bambi-chat-room-messages";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { orpc } from "@/src/lib/orpc";

import {
	buildChatTimeline,
	type ChatTimelineMessage,
	type OptimisticChatMessage,
} from "./chat-optimistic";
import type { ChatRoomDetail, ChatRoomMessage } from "./chat-types";

// 서버 기본값(DEFAULT_CHAT_MESSAGE_PAGE_SIZE)과 같다. 화면 한 번에 그릴 상한.
export const CHAT_MESSAGE_PAGE_SIZE = 50;

/**
 * 최신 페이지(쿼리, 소켓마다 재조회) + 과거 페이지(커서로 쌓는 화면 상태, 불변 이력) +
 * 낙관적 메시지를 한 타임라인으로 합친다. web의 useOlderChatMessages를 inverted
 * FlatList의 onEndReached에 맞게 버튼 없이 호출하는 형태로 바꿨다.
 */
export function useChatMessages({
	optimistic,
	roomId,
}: {
	optimistic: readonly OptimisticChatMessage[];
	roomId: string;
}): {
	canLoadOlder: boolean;
	isLoadingOlder: boolean;
	loadOlder: () => void;
	room: ChatRoomDetail | undefined;
	roomQuery: UseQueryResult<ChatRoomDetail>;
	timeline: ChatTimelineMessage[];
} {
	const queryClient = useQueryClient();
	const roomQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({
			input: { id: roomId, limit: CHAT_MESSAGE_PAGE_SIZE },
		})
	);
	const [olderMessages, setOlderMessages] = useState<ChatRoomMessage[]>([]);
	const [olderExhausted, setOlderExhausted] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [trackedRoomId, setTrackedRoomId] = useState(roomId);

	// 방을 갈아타면 이전 방 이력을 버린다(같은 라우트라 컴포넌트가 재사용된다).
	if (trackedRoomId !== roomId) {
		setTrackedRoomId(roomId);
		setOlderMessages([]);
		setOlderExhausted(false);
	}

	const latestMessages = roomQuery.data?.messages;
	const serverMessages = useMemo(
		() => mergeChatMessagesById(olderMessages, latestMessages ?? []),
		[latestMessages, olderMessages]
	);
	const timeline = useMemo(
		() => buildChatTimeline({ optimistic, server: serverMessages }),
		[optimistic, serverMessages]
	);

	const loadOlder = useCallback(() => {
		if (isLoadingOlder) {
			return;
		}

		const cursor = resolveOldestChatMessageCursor(serverMessages);

		if (!cursor) {
			return;
		}

		setIsLoadingOlder(true);
		queryClient
			.fetchQuery(
				orpc.bambi.chats.getById.queryOptions({
					input: { cursor, id: roomId, limit: CHAT_MESSAGE_PAGE_SIZE },
				})
			)
			.then((page) => {
				setOlderMessages((current) =>
					mergeChatMessagesById(page.messages, current)
				);
				setOlderExhausted(!page.nextCursor);
			})
			.catch(() => {
				// 과거 로드 실패는 조용히 둔다 — 스크롤을 다시 올리면 재시도된다.
			})
			.finally(() => {
				setIsLoadingOlder(false);
			});
	}, [isLoadingOlder, queryClient, roomId, serverMessages]);

	return {
		canLoadOlder: Boolean(roomQuery.data?.hasMoreMessages) && !olderExhausted,
		isLoadingOlder,
		loadOlder,
		room: roomQuery.data,
		roomQuery,
		timeline,
	};
}
```

- [ ] **Step 3: `use-chat-auto-read.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { orpc } from "@/src/lib/orpc";

import {
	canFlushChatRead,
	type ChatReadWatermark,
	resolveNextChatReadWatermark,
} from "./chat-read-watermark";
import type { ChatRoomListItem } from "./chat-types";

// 읽음 기준선 합치기 지연. 수신이 몰려도 markRead는 이 창 안에서 최신 기준선 하나로 접힌다.
const MARK_READ_COALESCE_MS = 300;

const zeroUnreadCountForRoom = (
	rooms: ChatRoomListItem[] | undefined,
	roomId: string
): ChatRoomListItem[] | undefined =>
	rooms?.map((room) =>
		room.id === roomId ? { ...room, unreadCount: 0 } : room
	);

/**
 * 보고 있는 방의 자동 읽음(web useChatRoomAutoRead의 native판). 기준은
 * isActive(화면 포커스 + 앱 active) — 백그라운드에서는 목록 배지를 그대로 두고
 * 돌아온 순간 밀린 기준선 하나로 읽음 처리한다.
 * 서버 markRead는 upToMessageId를 무시하고 방 전체를 읽음 처리하므로 기준선은
 * "마지막으로 알게 된 메시지 하나"면 충분하다.
 */
export function useChatAutoRead({
	chatRoomId,
	isActive,
}: {
	chatRoomId: string;
	isActive: boolean;
}): {
	markReadNow: (messageId: null | string) => void;
	queueMarkRead: (messageId: null | string) => void;
	reassertMarkRead: () => void;
} {
	const queryClient = useQueryClient();
	const markReadMutation = useMutation(
		orpc.bambi.chats.markRead.mutationOptions({
			// 왕복 사이에 목록이 다시 그려져도 방금 읽은 방의 배지가 깜빡이지 않게 먼저 0.
			onMutate: () => {
				queryClient.setQueryData(
					orpc.bambi.chats.listMine.queryKey(),
					(rooms: ChatRoomListItem[] | undefined) =>
						zeroUnreadCountForRoom(rooms, chatRoomId)
				);
			},
			onSuccess: (data) => {
				// 탭 배지는 서버가 방금 센 총합으로 즉시 덮는다(무효화만으론 늦은 응답이 이긴다).
				queryClient.setQueryData(orpc.bambi.chats.unreadState.queryKey(), {
					unreadMessageCount: data.totalUnreadMessageCount,
				});
				queryClient
					.invalidateQueries({ queryKey: orpc.bambi.chats.listMine.queryKey() })
					.catch(() => undefined);
			},
		})
	);
	const latestRef = useRef<ChatReadWatermark | null>(null);
	const sentMessageIdRef = useRef<null | string>(null);
	const timerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
	const isActiveRef = useRef(isActive);
	const mutateAsyncRef = useRef(markReadMutation.mutateAsync);

	useEffect(() => {
		isActiveRef.current = isActive;
		mutateAsyncRef.current = markReadMutation.mutateAsync;
	}, [isActive, markReadMutation.mutateAsync]);

	const flush = useCallback(() => {
		const run = async () => {
			const attemptedMessageIds = new Set<string>();

			while (isActiveRef.current) {
				const latest = latestRef.current;

				if (
					!canFlushChatRead(latest, sentMessageIdRef.current, attemptedMessageIds)
				) {
					return;
				}

				attemptedMessageIds.add(latest.messageId);
				sentMessageIdRef.current = latest.messageId;

				try {
					const result = await mutateAsyncRef.current({
						chatRoomId: latest.chatRoomId,
						upToMessageId: latest.messageId,
					});
					const nextMessageId = resolveNextChatReadWatermark({
						attemptedMessageId: latest.messageId,
						latestUnreadMessageId: result.latestUnreadMessageId,
					});

					if (!nextMessageId || result.unreadCount === 0) {
						return;
					}

					latestRef.current = {
						chatRoomId: latest.chatRoomId,
						messageId: nextMessageId,
					};
					sentMessageIdRef.current = null;
				} catch {
					if (sentMessageIdRef.current === latest.messageId) {
						sentMessageIdRef.current = null;
					}
					return;
				}
			}
		};

		run().catch(() => undefined);
	}, []);

	const flushSoon = useCallback(() => {
		if (timerRef.current !== null) {
			return;
		}

		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			flush();
		}, MARK_READ_COALESCE_MS);
	}, [flush]);

	const markReadNow = useCallback(
		(messageId: null | string) => {
			if (!messageId) {
				return;
			}

			latestRef.current = { chatRoomId, messageId };
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			flush();
		},
		[chatRoomId, flush]
	);

	const queueMarkRead = useCallback(
		(messageId: null | string) => {
			if (!messageId) {
				return;
			}

			latestRef.current = { chatRoomId, messageId };

			if (isActiveRef.current) {
				flushSoon();
			}
		},
		[chatRoomId, flushSoon]
	);

	// chat:unread:updated가 "아직 0이 아니다"를 알리면 같은 기준선이라도 다시 보낸다.
	// markRead 성공이 0 신호를 만들므로 루프는 돌지 않는다.
	const reassertMarkRead = useCallback(() => {
		if (latestRef.current?.chatRoomId !== chatRoomId) {
			return;
		}

		sentMessageIdRef.current = null;

		if (isActiveRef.current) {
			flushSoon();
		}
	}, [chatRoomId, flushSoon]);

	// 백그라운드에서 돌아오면 밀린 기준선을 바로 흘린다.
	useEffect(() => {
		if (isActive && latestRef.current) {
			flushSoon();
		}
	}, [flushSoon, isActive]);

	useEffect(
		() => () => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
		},
		[]
	);

	return { markReadNow, queueMarkRead, reassertMarkRead };
}
```

- [ ] **Step 4: `use-chat-room-realtime.ts`**

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { orpc } from "@/src/lib/orpc";

import {
	connectChatSocket,
	emitChatTypingStopped,
	joinChatRoom,
	scheduleChatRoomLeave,
} from "./chat-socket";
import {
	applyTypingStarted,
	applyTypingStopped,
	pruneTyping,
	TYPING_TTL_MS,
	type TypingState,
	typingUserIds,
} from "./chat-typing";

// 소켓이 끊긴 동안만 도는 보강 폴링 간격. 연결되면 즉시 멈춘다.
const OFFLINE_POLL_MS = 15_000;

/**
 * 방 화면의 실시간 배선. 입장·이벤트→쿼리 무효화·타이핑 상태·AppState 복귀 재조회·
 * 오프라인 폴링을 한 곳에서 관리한다. 화면은 반환값만 그린다.
 */
export function useChatRoomRealtime({
	onIncomingMessage,
	onUnreadRemaining,
	roomId,
}: {
	onIncomingMessage: (messageId: string) => void;
	onUnreadRemaining: () => void;
	roomId: string;
}): { isConnected: boolean; typingUserIds: string[] } {
	const queryClient = useQueryClient();
	const [isConnected, setIsConnected] = useState(false);
	const [typing, setTyping] = useState<TypingState>({});
	const [now, setNow] = useState(() => Date.now());
	const onIncomingMessageRef = useRef(onIncomingMessage);
	const onUnreadRemainingRef = useRef(onUnreadRemaining);

	useEffect(() => {
		onIncomingMessageRef.current = onIncomingMessage;
		onUnreadRemainingRef.current = onUnreadRemaining;
	}, [onIncomingMessage, onUnreadRemaining]);

	useEffect(() => {
		const socket = connectChatSocket();
		const roomKey = orpc.bambi.chats.getById.key({ input: { id: roomId } });
		const invalidateRoom = () => {
			queryClient.invalidateQueries({ queryKey: roomKey }).catch(() => undefined);
		};
		const invalidateList = () => {
			queryClient
				.invalidateQueries({ queryKey: orpc.bambi.chats.listMine.queryKey() })
				.catch(() => undefined);
			queryClient
				.invalidateQueries({ queryKey: orpc.bambi.chats.unreadState.queryKey() })
				.catch(() => undefined);
		};
		const join = () => {
			joinChatRoom(roomId)
				.then(() => setIsConnected(true))
				.catch(() => setIsConnected(false));
		};

		const handleConnect = () => {
			join();
			invalidateRoom();
		};
		const handleDisconnect = () => setIsConnected(false);
		const handleMessageCreated = (payload: { messageId: string; roomId: string }) => {
			if (payload.roomId !== roomId) {
				return;
			}
			invalidateRoom();
			onIncomingMessageRef.current(payload.messageId);
		};
		const handleRoomChanged = (payload: { roomId: string }) => {
			if (payload.roomId === roomId) {
				invalidateRoom();
			}
		};
		const handleUnreadUpdated = (payload: { roomId: string; unreadCount: number }) => {
			if (payload.roomId !== roomId) {
				return;
			}
			invalidateRoom();
			if (payload.unreadCount > 0) {
				onUnreadRemainingRef.current();
			}
		};
		const handleTypingStarted = (payload: { roomId: string; userId: string }) => {
			if (payload.roomId === roomId) {
				setTyping((state) => applyTypingStarted(state, payload.userId, Date.now()));
			}
		};
		const handleTypingStopped = (payload: { roomId: string; userId: string }) => {
			if (payload.roomId === roomId) {
				setTyping((state) => applyTypingStopped(state, payload.userId));
			}
		};

		socket.on("connect", handleConnect);
		socket.on("disconnect", handleDisconnect);
		socket.on("chat:message:created", handleMessageCreated);
		socket.on("chat:message:read", handleRoomChanged);
		socket.on("chat:room:updated", handleRoomChanged);
		socket.on("chat:list:updated", invalidateList);
		socket.on("chat:unread:updated", handleUnreadUpdated);
		socket.on("chat:typing:started", handleTypingStarted);
		socket.on("chat:typing:stopped", handleTypingStopped);

		if (socket.connected) {
			join();
		}

		// 백그라운드→active 복귀: 소켓 복구 여부와 무관하게 방·목록을 다시 받는다.
		const appStateSubscription = AppState.addEventListener("change", (state) => {
			if (state === "active") {
				invalidateRoom();
				invalidateList();
				if (!socket.connected) {
					socket.connect();
				}
			}
		});

		return () => {
			socket.off("connect", handleConnect);
			socket.off("disconnect", handleDisconnect);
			socket.off("chat:message:created", handleMessageCreated);
			socket.off("chat:message:read", handleRoomChanged);
			socket.off("chat:room:updated", handleRoomChanged);
			socket.off("chat:list:updated", invalidateList);
			socket.off("chat:unread:updated", handleUnreadUpdated);
			socket.off("chat:typing:started", handleTypingStarted);
			socket.off("chat:typing:stopped", handleTypingStopped);
			appStateSubscription.remove();
			emitChatTypingStopped(roomId);
			scheduleChatRoomLeave(roomId);
		};
	}, [queryClient, roomId]);

	// 소켓이 끊긴 동안만 폴링으로 보강한다.
	useEffect(() => {
		if (isConnected) {
			return;
		}

		const roomKey = orpc.bambi.chats.getById.key({ input: { id: roomId } });
		const timerId = setInterval(() => {
			queryClient.invalidateQueries({ queryKey: roomKey }).catch(() => undefined);
		}, OFFLINE_POLL_MS);

		return () => clearInterval(timerId);
	}, [isConnected, queryClient, roomId]);

	// 타이핑 TTL 만료를 반영할 틱. 표시 중인 사람이 있을 때만 돈다.
	const hasTyping = Object.keys(typing).length > 0;

	useEffect(() => {
		if (!hasTyping) {
			return;
		}

		const timerId = setInterval(() => {
			const current = Date.now();
			setNow(current);
			setTyping((state) => pruneTyping(state, current));
		}, TYPING_TTL_MS / 5);

		return () => clearInterval(timerId);
	}, [hasTyping]);

	return { isConnected, typingUserIds: typingUserIds(typing, now) };
}
```

- [ ] **Step 5: `use-chat-unread-badge.ts`**

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { orpc } from "@/src/lib/orpc";

import { connectChatSocket } from "./chat-socket";

/**
 * 채팅 탭 배지 총합(안 읽은 메시지 행 수, 서버 unreadState가 정본). 회원일 때만 켠다 —
 * unreadState는 protectedProcedure라 게스트에게 401이다. 소켓 chat:list:updated가
 * 오면 재조회하고, 소켓이 없어도 재진입·읽음 응답(useChatAutoRead)이 값을 맞춘다.
 */
export function useChatUnreadBadge(enabled: boolean): number {
	const queryClient = useQueryClient();
	const unreadQuery = useQuery({
		...orpc.bambi.chats.unreadState.queryOptions(),
		enabled,
	});

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const socket = connectChatSocket();
		const refresh = () => {
			queryClient
				.invalidateQueries({ queryKey: orpc.bambi.chats.unreadState.queryKey() })
				.catch(() => undefined);
		};

		socket.on("chat:list:updated", refresh);
		socket.on("connect", refresh);

		return () => {
			socket.off("chat:list:updated", refresh);
			socket.off("connect", refresh);
		};
	}, [enabled, queryClient]);

	return unreadQuery.data?.unreadMessageCount ?? 0;
}
```

- [ ] **Step 6: 타입·린트·테스트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/lib/chat apps/native/test/lib/chat
```
Run (cwd `apps/native`): `pnpm vitest run` → 5 files passed.

- [ ] **Step 7: Commit**

```bash
git add apps/native/src/lib/chat apps/native/test/lib/chat
git commit -m "feat(native): 채팅방 데이터 훅(메시지 타임라인·자동 읽음·실시간 배선·미읽음 배지)"
```

---

### Task 7: 전송 훅 `use-chat-send.ts` (텍스트·첨부·재전송)

**Files:**
- Create: `apps/native/src/lib/chat/use-chat-send.ts`
- Create: `apps/native/src/lib/chat/chat-attachment-picker.ts`
- Test: `apps/native/test/lib/chat/chat-attachment-picker.test.ts`

**Interfaces:**
- Consumes: `generateChatMessageId`(`@bambi-app/api/services/bambi-chat-message-id`), `validateChatMediaUpload`(`@bambi-app/api/services/bambi-media-policy`), Task 4 낙관적 빌더·`attachmentPolicyMessage`·`chatMutationErrorMessage`, `orpc`
- Produces:
  - `interface PickedAttachment { byteSize: number; fileName: string; mimeType: string; uri: string }`
  - `chat-attachment-picker.ts`: `toPickedAttachment(input: { fileName?: null | string; mimeType?: null | string; size?: null | number; uri: string }, fallbackMimeType: string): PickedAttachment`, `validatePickedAttachment(picked: PickedAttachment): { ok: true } | { message: string; ok: false }`, `isImageMimeType(mimeType: string): boolean`
  - `useChatSend({ currentUserId, roomId, onError: (message: string) => void }): { discardFailed: (id: string) => void; isUploading: boolean; optimistic: OptimisticChatMessage[]; retry: (id: string) => void; sendAttachment: (picked: PickedAttachment, body: string) => Promise<void>; sendText: (body: string) => void }`

- [ ] **Step 1: 첨부 선택 순수 함수 테스트**

`apps/native/test/lib/chat/chat-attachment-picker.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	isImageMimeType,
	toPickedAttachment,
	validatePickedAttachment,
} from "@/src/lib/chat/chat-attachment-picker";

describe("toPickedAttachment", () => {
	it("피커 결과의 빈 필드를 폴백으로 채운다", () => {
		expect(
			toPickedAttachment(
				{ fileName: null, mimeType: null, size: 1234, uri: "file:///a/b.jpg" },
				"image/jpeg"
			)
		).toEqual({
			byteSize: 1234,
			fileName: "b.jpg",
			mimeType: "image/jpeg",
			uri: "file:///a/b.jpg",
		});
	});

	it("size가 없으면 0으로 두고 호출부가 blob 크기로 덮는다", () => {
		expect(
			toPickedAttachment({ uri: "file:///x.pdf" }, "application/pdf").byteSize
		).toBe(0);
	});
});

describe("validatePickedAttachment", () => {
	it("허용 mime·크기면 ok", () => {
		expect(
			validatePickedAttachment({
				byteSize: 10,
				fileName: "a.png",
				mimeType: "image/png",
				uri: "u",
			})
		).toEqual({ ok: true });
	});

	it("10MB 초과는 안내 문구", () => {
		expect(
			validatePickedAttachment({
				byteSize: 10 * 1024 * 1024 + 1,
				fileName: "a.png",
				mimeType: "image/png",
				uri: "u",
			})
		).toEqual({ message: "10MB 이하 파일만 보낼 수 있어요.", ok: false });
	});

	it("gif는 거절", () => {
		expect(
			validatePickedAttachment({
				byteSize: 10,
				fileName: "a.gif",
				mimeType: "image/gif",
				uri: "u",
			})
		).toEqual({
			message: "JPG·PNG·WebP 이미지 또는 PDF만 보낼 수 있어요.",
			ok: false,
		});
	});
});

describe("isImageMimeType", () => {
	it("image/* 만 true", () => {
		expect(isImageMimeType("image/webp")).toBe(true);
		expect(isImageMimeType("application/pdf")).toBe(false);
	});
});
```

Run (cwd `apps/native`): `pnpm vitest run test/lib/chat/chat-attachment-picker.test.ts` → FAIL.

- [ ] **Step 2: `chat-attachment-picker.ts`**

```ts
import { validateChatMediaUpload } from "@bambi-app/api/services/bambi-media-policy";

import { attachmentPolicyMessage } from "./chat-errors";

export interface PickedAttachment {
	byteSize: number;
	fileName: string;
	mimeType: string;
	uri: string;
}

const fileNameFromUri = (uri: string): string =>
	uri.split("?")[0]?.split("/").pop() || "attachment";

// expo-image-picker(asset.fileName/mimeType/fileSize)·expo-document-picker(name/mimeType/size)
// 결과를 한 모양으로 맞춘다. 크기가 비어 있으면 0 — 전송 직전에 blob.size로 덮는다
// (서명 URL이 content-length에 묶여 있어 실제 바이트가 정본).
export const toPickedAttachment = (
	input: {
		fileName?: null | string;
		mimeType?: null | string;
		size?: null | number;
		uri: string;
	},
	fallbackMimeType: string
): PickedAttachment => ({
	byteSize: input.size ?? 0,
	fileName: input.fileName || fileNameFromUri(input.uri),
	mimeType: input.mimeType || fallbackMimeType,
	uri: input.uri,
});

export const validatePickedAttachment = (
	picked: PickedAttachment
): { ok: true } | { message: string; ok: false } => {
	const result = validateChatMediaUpload({
		byteSize: Math.max(1, picked.byteSize),
		fileName: picked.fileName,
		mimeType: picked.mimeType,
	});

	return result.ok
		? { ok: true }
		: { message: attachmentPolicyMessage(result.code), ok: false };
};

export const isImageMimeType = (mimeType: string): boolean =>
	mimeType.startsWith("image/");
```

Run again → PASS.

- [ ] **Step 3: `use-chat-send.ts`**

```ts
import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { orpc } from "@/src/lib/orpc";

import {
	isImageMimeType,
	type PickedAttachment,
	validatePickedAttachment,
} from "./chat-attachment-picker";
import { chatMutationErrorMessage } from "./chat-errors";
import {
	createOptimisticImageMessage,
	createOptimisticTextMessage,
	dropSettledOptimistic,
	type OptimisticChatMessage,
} from "./chat-optimistic";
import type { ChatRoomDetail } from "./chat-types";

const MAX_SEND_ATTEMPTS = 3;

export { MAX_SEND_ATTEMPTS };

/**
 * 텍스트·첨부 전송과 낙관적 메시지 상태. id는 클라이언트가 만들어 보내므로(서버 멱등키)
 * 재전송이 중복 말풍선을 만들지 않는다. 서버 행이 캐시에 들어오면 같은 id의 낙관적
 * 항목을 걷어낸다(dropSettledOptimistic).
 */
export function useChatSend({
	currentUserId,
	onError,
	roomId,
}: {
	currentUserId: string;
	onError: (message: string) => void;
	roomId: string;
}): {
	discardFailed: (id: string) => void;
	isUploading: boolean;
	optimistic: OptimisticChatMessage[];
	retry: (id: string) => void;
	sendAttachment: (picked: PickedAttachment, body: string) => Promise<void>;
	sendText: (body: string) => void;
} {
	const queryClient = useQueryClient();
	const [optimistic, setOptimistic] = useState<OptimisticChatMessage[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	// 재전송용 원본(첨부는 picked를 다시 올려야 한다).
	const pendingAttachmentsRef = useRef(new Map<string, { body: string; picked: PickedAttachment }>());
	const onErrorRef = useRef(onError);

	useEffect(() => {
		onErrorRef.current = onError;
	}, [onError]);

	const roomKey = orpc.bambi.chats.getById.key({ input: { id: roomId } });
	const invalidateRoom = useCallback(
		() => queryClient.invalidateQueries({ queryKey: roomKey }).catch(() => undefined),
		[queryClient, roomKey]
	);

	// 서버 최신 페이지가 갱신될 때마다 도착한 낙관적 항목을 정리한다.
	const serverMessages = queryClient.getQueryData<ChatRoomDetail>(
		orpc.bambi.chats.getById.queryKey({ input: { id: roomId, limit: 50 } })
	)?.messages;

	useEffect(() => {
		if (!serverMessages) {
			return;
		}
		setOptimistic((current) => {
			const next = dropSettledOptimistic(current, serverMessages);
			return next.length === current.length ? current : next;
		});
	}, [serverMessages]);

	const markFailed = useCallback((id: string) => {
		setOptimistic((current) =>
			current.map((item) =>
				item.id === id ? { ...item, sendStatus: "failed" as const } : item
			)
		);
	}, []);

	const markSending = useCallback((id: string) => {
		setOptimistic((current) =>
			current.map((item) =>
				item.id === id
					? { ...item, attempts: item.attempts + 1, sendStatus: "sending" as const }
					: item
			)
		);
	}, []);

	const sendMessageMutation = useMutation(
		orpc.bambi.chats.sendMessage.mutationOptions({
			onError: (error, variables) => {
				if (variables.messageId) {
					markFailed(variables.messageId);
				}
				onErrorRef.current(chatMutationErrorMessage(error));
			},
			onSuccess: () => invalidateRoom(),
		})
	);
	const createUploadMutation = useMutation(
		orpc.bambi.chats.createAttachmentUpload.mutationOptions()
	);
	const sendMediaMutation = useMutation(
		orpc.bambi.chats.sendMediaMessage.mutationOptions({
			onSuccess: () => invalidateRoom(),
		})
	);

	const sendText = useCallback(
		(body: string) => {
			const trimmed = body.trim();

			if (!trimmed) {
				return;
			}

			const id = generateChatMessageId();
			setOptimistic((current) => [
				...current,
				createOptimisticTextMessage({
					body: trimmed,
					chatRoomId: roomId,
					id,
					senderUserId: currentUserId,
				}),
			]);
			sendMessageMutation.mutate({ body: trimmed, chatRoomId: roomId, messageId: id });
		},
		[currentUserId, roomId, sendMessageMutation]
	);

	const uploadAndSend = useCallback(
		async (id: string, picked: PickedAttachment, body: string) => {
			setIsUploading(true);
			try {
				// 서명이 content-length에 묶여 있어 피커가 준 size가 아니라 실제 blob 크기를 쓴다.
				const blob = await (await fetch(picked.uri)).blob();
				const resolved = { ...picked, byteSize: blob.size };
				const validation = validatePickedAttachment(resolved);

				if (!validation.ok) {
					throw new Error(validation.message);
				}

				const intent = await createUploadMutation.mutateAsync({
					byteSize: resolved.byteSize,
					chatRoomId: roomId,
					fileName: resolved.fileName,
					mimeType: resolved.mimeType,
				});

				if (!intent.uploadUrl.startsWith("https://")) {
					// 서버 GCS 미구성(dev)이면 local:// 플레이스홀더가 온다 — 올리지 않고 멈춘다.
					throw new Error("지금은 파일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.");
				}

				const response = await fetch(intent.uploadUrl, {
					body: blob,
					headers: { "Content-Type": intent.mimeType },
					method: "PUT",
				});

				if (!response.ok) {
					throw new Error("파일 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
				}

				const trimmed = body.trim();
				await sendMediaMutation.mutateAsync({
					body: trimmed || undefined,
					byteSize: intent.byteSize,
					chatRoomId: roomId,
					fileName: intent.fileName,
					messageId: id,
					mimeType: intent.mimeType,
					storageKey: intent.storageKey,
					textMessageId: trimmed ? generateChatMessageId() : undefined,
				});
				pendingAttachmentsRef.current.delete(id);
			} catch (error) {
				markFailed(id);
				onErrorRef.current(
					error instanceof Error && !("code" in error)
						? error.message
						: chatMutationErrorMessage(error)
				);
			} finally {
				setIsUploading(false);
			}
		},
		[createUploadMutation, markFailed, roomId, sendMediaMutation]
	);

	const sendAttachment = useCallback(
		async (picked: PickedAttachment, body: string) => {
			const validation = validatePickedAttachment(picked);

			if (!validation.ok) {
				onErrorRef.current(validation.message);
				return;
			}

			const id = generateChatMessageId();
			pendingAttachmentsRef.current.set(id, { body, picked });
			setOptimistic((current) => [
				...current,
				isImageMimeType(picked.mimeType)
					? createOptimisticImageMessage({
							chatRoomId: roomId,
							id,
							localImageUri: picked.uri,
							senderUserId: currentUserId,
						})
					: {
							...createOptimisticTextMessage({
								body: `${picked.fileName} 보내는 중`,
								chatRoomId: roomId,
								id,
								senderUserId: currentUserId,
							}),
						},
			]);
			await uploadAndSend(id, picked, body);
		},
		[currentUserId, roomId, uploadAndSend]
	);

	const retry = useCallback(
		(id: string) => {
			const item = optimistic.find((candidate) => candidate.id === id);

			if (!item || item.attempts >= MAX_SEND_ATTEMPTS) {
				return;
			}

			markSending(id);
			const pending = pendingAttachmentsRef.current.get(id);

			if (pending) {
				uploadAndSend(id, pending.picked, pending.body).catch(() => undefined);
				return;
			}

			sendMessageMutation.mutate({ body: item.body, chatRoomId: roomId, messageId: id });
		},
		[markSending, optimistic, roomId, sendMessageMutation, uploadAndSend]
	);

	const discardFailed = useCallback((id: string) => {
		pendingAttachmentsRef.current.delete(id);
		setOptimistic((current) => current.filter((item) => item.id !== id));
	}, []);

	return { discardFailed, isUploading, optimistic, retry, sendAttachment, sendText };
}
```
주의: `queryClient.getQueryData(... limit: 50 ...)`의 `50`은 `CHAT_MESSAGE_PAGE_SIZE`(Task 6)를 import해 쓴다.

- [ ] **Step 4: 타입·린트·테스트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/lib/chat apps/native/test/lib/chat
```
Run (cwd `apps/native`): `pnpm vitest run` → 6 files passed.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/lib/chat apps/native/test/lib/chat
git commit -m "feat(native): 채팅 전송 훅(낙관적 텍스트·첨부 업로드·재전송·실패 폐기)"
```

---

### Task 8: 메시지 렌더 컴포넌트 묶음 A (날짜 칩·말풍선·첨부·타이핑·새 메시지 칩)

**Files:**
- Create: `apps/native/src/components/chat/chat-date-chip.tsx`
- Create: `apps/native/src/components/chat/chat-message-bubble.tsx`
- Create: `apps/native/src/components/chat/chat-attachment-message.tsx`
- Create: `apps/native/src/components/chat/chat-typing-indicator.tsx`
- Create: `apps/native/src/components/chat/chat-new-message-pill.tsx`

**Interfaces:**
- Consumes: `ChatTimelineMessage`(Task 4), `ChatRoomAttachment`(Task 4), `formatChatTimeLabel`(공유), heroui `Avatar`·`Chip`·`Surface`·`Spinner`·`Dialog`·`useThemeColor`·`cn`
- Produces:
  - `ChatDateChip({ label: string })`
  - `ChatMessageBubble({ counterpartName, counterpartProfileImageUrl, isGroupEnd, isGroupStart, isMine, isReadByCounterpart, message: ChatTimelineMessage, onDiscard?: (id) => void, onRetry?: (id) => void })`
  - `ChatAttachmentMessage({ attachment: ChatRoomAttachment | null, localImageUri: null | string, isMine: boolean, sendStatus?: ChatSendStatus })`
  - `ChatTypingIndicator({ counterpartName, counterpartProfileImageUrl })`
  - `ChatNewMessagePill({ onPress: () => void })`
  - 내부 상수: 말풍선 최대 너비 `max-w-[78%]`은 Tailwind 임의값이 아니라 `w-4/5`(80%)로 대체한다. 이미지 최대 높이는 `max-h-80`.

- [ ] **Step 1: `chat-date-chip.tsx`**

```tsx
import { Chip } from "heroui-native";
import { View } from "react-native";

// 날짜가 바뀌는 첫 메시지 위에 가운데 정렬로 뜨는 칩(annotateChatMessages.dateLabel).
export function ChatDateChip({ label }: { label: string }) {
	return (
		<View className="items-center py-3">
			<Chip color="default" size="sm" variant="soft">
				<Chip.Label>{label}</Chip.Label>
			</Chip>
		</View>
	);
}
```

- [ ] **Step 2: `chat-message-bubble.tsx`**

```tsx
import { formatChatTimeLabel } from "@bambi-app/api/services/bambi-chat-message-grouping";
import { Avatar, cn, Spinner } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import type { ChatTimelineMessage } from "@/src/lib/chat/chat-optimistic";

import { ChatAttachmentMessage } from "./chat-attachment-message";

const initialOf = (name: null | string): string =>
	(name ?? "?").trim().charAt(0) || "?";

// 카카오톡식 말풍선. 그룹 첫 메시지에만 아바타·이름, 그룹 마지막에만 시각.
// 내 말풍선은 accent, 상대는 surface-secondary. 첨부 메시지는 색 말풍선 없이 콘텐츠만.
export function ChatMessageBubble({
	counterpartName,
	counterpartProfileImageUrl,
	isGroupEnd,
	isGroupStart,
	isMine,
	isReadByCounterpart,
	message,
	onDiscard,
	onRetry,
}: {
	counterpartName: null | string;
	counterpartProfileImageUrl: null | string;
	isGroupEnd: boolean;
	isGroupStart: boolean;
	isMine: boolean;
	// 내 마지막 메시지에만 의미 있다. 상대 읽음 영수증 수신 여부.
	isReadByCounterpart: boolean;
	message: ChatTimelineMessage;
	onDiscard?: (id: string) => void;
	onRetry?: (id: string) => void;
}) {
	const attachment = message.attachments[0] ?? null;
	const hasAttachment = attachment !== null || Boolean(message.localImageUri);
	const timeLabel = isGroupEnd ? formatChatTimeLabel(message.createdAt) : null;
	const sendStatus = message.sendStatus;

	return (
		<View
			className={cn(
				"flex-row px-4",
				isMine ? "justify-end" : "justify-start",
				isGroupStart ? "mt-3" : "mt-1"
			)}
		>
			{isMine ? null : (
				<View className="mr-2 w-9">
					{isGroupStart ? (
						<Avatar color="accent" size="sm">
							{counterpartProfileImageUrl ? (
								<Avatar.Image source={{ uri: counterpartProfileImageUrl }} />
							) : null}
							<Avatar.Fallback>{initialOf(counterpartName)}</Avatar.Fallback>
						</Avatar>
					) : null}
				</View>
			)}
			<View className={cn("w-4/5", isMine ? "items-end" : "items-start")}>
				{!isMine && isGroupStart ? (
					<Text className="mb-1 text-muted text-xs" numberOfLines={1}>
						{counterpartName ?? "상대"}
					</Text>
				) : null}
				{hasAttachment ? (
					<ChatAttachmentMessage
						attachment={attachment}
						isMine={isMine}
						localImageUri={message.localImageUri ?? null}
						sendStatus={sendStatus}
					/>
				) : (
					<View
						className={cn(
							"max-w-full rounded-2xl px-3.5 py-2.5",
							isMine
								? "rounded-br-md bg-accent"
								: "rounded-bl-md bg-surface-secondary",
							sendStatus === "failed" && "opacity-60"
						)}
					>
						<Text
							className={cn(
								"text-base leading-6",
								isMine ? "text-accent-foreground" : "text-surface-secondary-foreground"
							)}
							selectable
						>
							{message.body}
						</Text>
					</View>
				)}
				<View className="mt-1 flex-row items-center gap-1.5">
					{sendStatus === "sending" ? (
						<>
							<Spinner size="sm" />
							<Text className="text-muted text-xs">전송 중</Text>
						</>
					) : null}
					{sendStatus === "failed" ? (
						<>
							<Text className="text-danger text-xs">전송 실패</Text>
							<Pressable accessibilityRole="button" hitSlop={8} onPress={() => onRetry?.(message.id)}>
								<Text className="font-semibold text-accent text-xs">재전송</Text>
							</Pressable>
							<Pressable accessibilityRole="button" hitSlop={8} onPress={() => onDiscard?.(message.id)}>
								<Text className="text-muted text-xs">삭제</Text>
							</Pressable>
						</>
					) : null}
					{!sendStatus && timeLabel ? (
						<Text className="text-muted text-xs">{timeLabel}</Text>
					) : null}
					{!sendStatus && isMine && isGroupEnd && isReadByCounterpart ? (
						<Text className="text-muted text-xs">읽음</Text>
					) : null}
				</View>
			</View>
		</View>
	);
}
```

- [ ] **Step 3: `chat-attachment-message.tsx`**

```tsx
import { Ionicons } from "@expo/vector-icons";
import { openBrowserAsync } from "expo-web-browser";
import { cn, Dialog, Spinner, Surface, useThemeColor } from "heroui-native";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, useWindowDimensions, View } from "react-native";

import type { ChatSendStatus } from "@/src/lib/chat/chat-optimistic";
import type { ChatRoomAttachment } from "@/src/lib/chat/chat-types";

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_ASPECT_RATIO = 4 / 3;
// 말풍선 최대 너비(w-4/5)에서 아바타 열을 뺀 이미지 실폭 근사치 비율.
const IMAGE_WIDTH_RATIO = 0.62;

export const formatAttachmentSize = (byteSize: number): string => {
	if (byteSize >= BYTES_PER_MB) {
		return `${(byteSize / BYTES_PER_MB).toFixed(1)} MB`;
	}

	return `${Math.max(1, Math.round(byteSize / BYTES_PER_KB)).toLocaleString("ko-KR")} KB`;
};

// 이미지 크기는 응답에 없어 로드 후 비율을 잰다. 재기 전엔 4:3 자리.
function useImageAspectRatio(uri: null | string): number {
	const [ratio, setRatio] = useState(DEFAULT_ASPECT_RATIO);

	useEffect(() => {
		if (!uri) {
			return;
		}
		let cancelled = false;
		Image.getSize(
			uri,
			(width, height) => {
				if (!cancelled && width > 0 && height > 0) {
					setRatio(width / height);
				}
			},
			() => undefined
		);
		return () => {
			cancelled = true;
		};
	}, [uri]);

	return ratio;
}

// 이미지는 색 말풍선 없이 이미지 자체(web 2026-08-12 첨부 UI와 같은 결정), PDF는 정보 카드.
export function ChatAttachmentMessage({
	attachment,
	isMine,
	localImageUri,
	sendStatus,
}: {
	attachment: ChatRoomAttachment | null;
	isMine: boolean;
	localImageUri: null | string;
	sendStatus?: ChatSendStatus;
}) {
	const { width: windowWidth } = useWindowDimensions();
	const [isViewerOpen, setIsViewerOpen] = useState(false);
	const foreground = useThemeColor("foreground");
	const imageUri = attachment?.category === "image" ? attachment.objectUrl : localImageUri;
	const ratio = useImageAspectRatio(imageUri);
	const imageWidth = Math.round(windowWidth * IMAGE_WIDTH_RATIO);

	if (imageUri) {
		return (
			<>
				<Pressable
					accessibilityLabel={attachment?.fileName ?? "전송 중인 이미지"}
					accessibilityRole="imagebutton"
					className={cn("overflow-hidden rounded-xl bg-surface-secondary", sendStatus && "opacity-70")}
					disabled={!attachment}
					onPress={() => setIsViewerOpen(true)}
					style={{ aspectRatio: ratio, width: imageWidth }}
				>
					<Image
						accessibilityIgnoresInvertColors
						resizeMode="cover"
						source={{ uri: imageUri }}
						style={{ height: "100%", width: "100%" }}
					/>
					{sendStatus === "sending" ? (
						<View className="absolute inset-0 items-center justify-center">
							<Spinner size="lg" />
						</View>
					) : null}
				</Pressable>
				<Dialog isOpen={isViewerOpen} onOpenChange={setIsViewerOpen}>
					<Dialog.Portal>
						<Dialog.Overlay />
						<Dialog.Content className="h-full w-full bg-black p-0">
							<Pressable className="flex-1 items-center justify-center" onPress={() => setIsViewerOpen(false)}>
								<Image
									accessibilityIgnoresInvertColors
									resizeMode="contain"
									source={{ uri: imageUri }}
									style={{ height: "100%", width: "100%" }}
								/>
							</Pressable>
						</Dialog.Content>
					</Dialog.Portal>
				</Dialog>
			</>
		);
	}

	if (!attachment) {
		return null;
	}

	return (
		<Surface className="w-64 flex-row items-center gap-3 rounded-2xl p-3" variant={isMine ? "tertiary" : "secondary"}>
			<View className="h-10 w-10 items-center justify-center rounded-xl bg-danger/15">
				<Ionicons color={foreground} name="document-text-outline" size={22} />
			</View>
			<View className="flex-1">
				<Text className="font-semibold text-foreground text-sm" numberOfLines={2}>
					{attachment.fileName}
				</Text>
				<Text className="text-muted text-xs">{formatAttachmentSize(attachment.byteSize)} · PDF</Text>
			</View>
			<Pressable
				accessibilityLabel="PDF 열기"
				accessibilityRole="button"
				hitSlop={8}
				onPress={() => {
					openBrowserAsync(attachment.objectUrl).catch(() => undefined);
				}}
			>
				<Ionicons color={foreground} name="open-outline" size={20} />
			</Pressable>
		</Surface>
	);
}
```

- [ ] **Step 4: `chat-typing-indicator.tsx`**

```tsx
import { Avatar } from "heroui-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

const DOT_COUNT = 3;
const DOT_STAGGER_MS = 160;
const DOT_CYCLE_MS = 480;

function TypingDot({ index }: { index: number }) {
	const progress = useSharedValue(0);

	useEffect(() => {
		progress.value = withDelay(
			index * DOT_STAGGER_MS,
			withRepeat(
				withSequence(
					withTiming(1, { duration: DOT_CYCLE_MS, easing: Easing.inOut(Easing.ease) }),
					withTiming(0, { duration: DOT_CYCLE_MS, easing: Easing.inOut(Easing.ease) })
				),
				-1
			)
		);
	}, [index, progress]);

	const style = useAnimatedStyle(() => ({
		opacity: 0.35 + progress.value * 0.65,
		transform: [{ translateY: -progress.value * 3 }],
	}));

	return <Animated.View className="h-2 w-2 rounded-full bg-muted" style={style} />;
}

// 상대 아바타 + 점 3개 말풍선. 표시 여부는 부모(typingUserIds.length > 0)가 정한다.
export function ChatTypingIndicator({
	counterpartName,
	counterpartProfileImageUrl,
}: {
	counterpartName: null | string;
	counterpartProfileImageUrl: null | string;
}) {
	return (
		<View className="mt-3 flex-row items-end px-4">
			<View className="mr-2 w-9">
				<Avatar color="accent" size="sm">
					{counterpartProfileImageUrl ? (
						<Avatar.Image source={{ uri: counterpartProfileImageUrl }} />
					) : null}
					<Avatar.Fallback>{(counterpartName ?? "?").trim().charAt(0) || "?"}</Avatar.Fallback>
				</Avatar>
			</View>
			<View
				accessibilityLabel={`${counterpartName ?? "상대"}가 입력 중`}
				className="flex-row items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface-secondary px-4 py-3"
			>
				{Array.from({ length: DOT_COUNT }, (_, index) => (
					<TypingDot index={index} key={index} />
				))}
			</View>
		</View>
	);
}
```
(`Animated.View`에 `className`이 안 먹으면 `style={[style, { backgroundColor: useThemeColor("muted"), borderRadius: 4, height: 8, width: 8 }]}`로 대체한다.)

- [ ] **Step 5: `chat-new-message-pill.tsx`**

```tsx
import { Ionicons } from "@expo/vector-icons";
import { Chip, useThemeColor } from "heroui-native";
import { Pressable, View } from "react-native";

// 위로 스크롤해 과거를 보는 중 새 메시지가 오면 하단에 뜨는 플로팅 칩. 탭하면 맨 아래로.
export function ChatNewMessagePill({ onPress }: { onPress: () => void }) {
	const accentForeground = useThemeColor("accent-foreground");

	return (
		<View className="absolute right-0 bottom-3 left-0 items-center" pointerEvents="box-none">
			<Pressable accessibilityLabel="새 메시지로 이동" accessibilityRole="button" onPress={onPress}>
				<Chip color="accent" size="md" variant="primary">
					<Ionicons color={accentForeground} name="arrow-down" size={14} />
					<Chip.Label>새 메시지</Chip.Label>
				</Chip>
			</Pressable>
		</View>
	);
}
```

- [ ] **Step 6: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/components/chat
```
Expected: 오류 0. heroui prop 이름이 다르면(`Chip.Label` 미존재 등) `node .agents/skills/heroui-native/scripts/get_component_docs.mjs <Component>`로 확인 후 맞춘다.

- [ ] **Step 7: Commit**

```bash
git add apps/native/src/components/chat
git commit -m "feat(native): 채팅 말풍선·첨부·날짜 칩·타이핑·새 메시지 칩 컴포넌트"
```

---

### Task 9: 컴포넌트 묶음 B (시스템 카드·차단 안내·입력바·헤더·메뉴·목록 행)

**Files:**
- Create: `apps/native/src/components/chat/chat-system-card.tsx`
- Create: `apps/native/src/components/chat/chat-block-notice.tsx`
- Create: `apps/native/src/components/chat/chat-composer.tsx`
- Create: `apps/native/src/components/chat/chat-room-header.tsx`
- Create: `apps/native/src/components/chat/chat-room-menu.tsx`
- Create: `apps/native/src/components/chat/chat-room-list-item.tsx`

**Interfaces:**
- Consumes: 공유 시스템 메시지 함수(Task 3), `interviewStatusLabel`·`interviewStatusTone`(`@/src/lib/me-interviews`), `Pill`·`formatDateTime`(`@/src/components/bambi-screen`), `PickedAttachment`·`toPickedAttachment`·`isImageMimeType`(Task 7), `emitChatTypingStarted/Stopped`(Task 5), `formatChatListTime`(Task 4), `ChatRoomListItem`·`ChatRoomSchedule`·`ChatTimelineMessage`
- Produces:
  - `ChatSystemCard({ counterpartName, currentUserId, isBusy, message, onRespondContact: (messageId, decision: "decline" | "reveal") => void, onSetInterviewStatus: (interviewScheduleId, status: "confirmed" | "declined") => void, schedules })` — `kind`가 `contact_request`/`interview_proposal`이 아니면 null
  - `ChatBlockNotice({ message: string })`
  - `ChatComposer({ isDisabled, isUploading, onSendAttachment: (picked: PickedAttachment, body: string) => void, onSendText: (body: string) => void, roomId })`
  - `ChatRoomHeader({ counterpartName, counterpartProfileImageUrl, jobTitle, onBack, right?: ReactNode, statusLine: null | string })`
  - `ChatRoomMenu({ canRevealContact, onBlock, onLeave, onReport, onRevealContact })`
  - `ChatRoomListItem({ onPress, room: ChatRoomListItem })`

- [ ] **Step 1: `chat-system-card.tsx`**

```tsx
import {
	type ContactRevealDecision,
	getContactRequestNotice,
	getInterviewProposalNotice,
	readContactRequestMetadata,
	readInterviewProposalMetadata,
} from "@bambi-app/api/services/bambi-chat-system-messages";
import { Ionicons } from "@expo/vector-icons";
import { Button, Surface, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";

import { formatDateTime, Pill } from "@/src/components/bambi-screen";
import type { ChatTimelineMessage } from "@/src/lib/chat/chat-optimistic";
import type { ChatRoomSchedule } from "@/src/lib/chat/chat-types";
import { interviewStatusLabel, interviewStatusTone } from "@/src/lib/me-interviews";

type InterviewResponse = "confirmed" | "declined";

function CardShell({
	children,
	createdAt,
	icon,
}: {
	children: React.ReactNode;
	createdAt: Date | string;
	icon: React.ComponentProps<typeof Ionicons>["name"];
}) {
	const accent = useThemeColor("accent");

	return (
		<View className="items-center px-4 pt-3">
			<Surface className="w-11/12 items-center gap-2 rounded-2xl border border-accent/20 p-4" variant="secondary">
				<Ionicons color={accent} name={icon} size={22} />
				{children}
				<Text className="text-muted text-xs">{formatDateTime(createdAt)}</Text>
			</Surface>
		</View>
	);
}

function ResponseButtons({
	confirmLabel,
	isBusy,
	onConfirm,
	onDecline,
}: {
	confirmLabel: string;
	isBusy: boolean;
	onConfirm: () => void;
	onDecline: () => void;
}) {
	return (
		<View className="mt-1 flex-row gap-2">
			<Button isDisabled={isBusy} onPress={onConfirm} size="sm">
				<Button.Label>{confirmLabel}</Button.Label>
			</Button>
			<Button isDisabled={isBusy} onPress={onDecline} size="sm" variant="tertiary">
				<Button.Label>거절</Button.Label>
			</Button>
		</View>
	);
}

// contact_request·interview_proposal 인라인 시스템 카드(web ContactRequestMessage·
// InterviewProposalMessage와 같은 규칙). 구직자 앱이므로 viewerIsEmployer는 항상 false지만
// 공유 함수 시그니처를 그대로 쓴다.
export function ChatSystemCard({
	counterpartName,
	currentUserId,
	isBusy,
	message,
	onRespondContact,
	onSetInterviewStatus,
	schedules,
}: {
	counterpartName: null | string;
	currentUserId: string;
	isBusy: boolean;
	message: ChatTimelineMessage;
	onRespondContact: (messageId: string, decision: ContactRevealDecision) => void;
	onSetInterviewStatus: (interviewScheduleId: string, status: InterviewResponse) => void;
	schedules: readonly ChatRoomSchedule[];
}) {
	if (message.kind === "contact_request") {
		const metadata = readContactRequestMetadata(message.metadata);

		if (!metadata) {
			return null;
		}

		const notice = getContactRequestNotice({
			counterpartName: counterpartName ?? "상대방",
			revealedPhoneLabel: message.revealedPhone,
			status: metadata.status,
			viewerIsEmployer: false,
		});
		const canRespond = metadata.status === "pending" && metadata.targetUserId === currentUserId;
		const statusLabel = { declined: "거절함", pending: "응답 대기", revealed: "공개함" }[metadata.status];
		const statusTone = { declined: "neutral", pending: "warning", revealed: "success" }[metadata.status] as
			| "neutral"
			| "success"
			| "warning";

		return (
			<CardShell createdAt={message.createdAt} icon="call-outline">
				<Text className="text-center font-semibold text-foreground text-sm leading-5">{notice}</Text>
				<Pill tone={statusTone}>{statusLabel}</Pill>
				{canRespond ? (
					<ResponseButtons
						confirmLabel="공개"
						isBusy={isBusy}
						onConfirm={() => onRespondContact(message.id, "reveal")}
						onDecline={() => onRespondContact(message.id, "decline")}
					/>
				) : null}
			</CardShell>
		);
	}

	if (message.kind === "interview_proposal") {
		const metadata = readInterviewProposalMetadata(message.metadata);
		const schedule = metadata
			? schedules.find(({ id }) => id === metadata.interviewScheduleId)
			: undefined;

		if (!schedule) {
			return (
				<CardShell createdAt={message.createdAt} icon="calendar-outline">
					<Text className="text-center font-semibold text-foreground text-sm">{message.body}</Text>
				</CardShell>
			);
		}

		const viewerIsProposer = schedule.proposedByUserId === currentUserId;
		const canRespond = schedule.status === "proposed" && !viewerIsProposer;

		return (
			<CardShell createdAt={message.createdAt} icon="calendar-outline">
				<Text className="text-center font-semibold text-foreground text-sm leading-5">
					{getInterviewProposalNotice(schedule.status, viewerIsProposer)}
				</Text>
				<Text className="font-semibold text-accent text-base">{formatDateTime(schedule.scheduledAt)}</Text>
				{schedule.locationNote ? (
					<Text className="text-center text-muted text-sm">{schedule.locationNote}</Text>
				) : null}
				<Pill tone={interviewStatusTone(schedule.status)}>{interviewStatusLabel(schedule.status)}</Pill>
				{canRespond ? (
					<ResponseButtons
						confirmLabel="확정"
						isBusy={isBusy}
						onConfirm={() => onSetInterviewStatus(schedule.id, "confirmed")}
						onDecline={() => onSetInterviewStatus(schedule.id, "declined")}
					/>
				) : null}
			</CardShell>
		);
	}

	return null;
}
```

- [ ] **Step 2: `chat-block-notice.tsx`**

```tsx
import { Ionicons } from "@expo/vector-icons";
import { Surface, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 입력바 자리에 뜨는 안내(차단·신고 검토·상대 탈퇴·공고 마감). 이력은 그대로 보이고 발신만 막는다.
export function ChatBlockNotice({ message }: { message: string }) {
	const insets = useSafeAreaInsets();
	const muted = useThemeColor("muted");

	return (
		<View className="border-border border-t bg-background px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
			<Surface className="flex-row items-center gap-3 rounded-2xl p-4" variant="secondary">
				<Ionicons color={muted} name="lock-closed-outline" size={20} />
				<Text className="flex-1 text-muted text-sm leading-5">{message}</Text>
			</Surface>
		</View>
	);
}
```

- [ ] **Step 3: `chat-composer.tsx`**

```tsx
import { Ionicons } from "@expo/vector-icons";
import { getDocumentAsync } from "expo-document-picker";
import {
	launchCameraAsync,
	launchImageLibraryAsync,
	requestCameraPermissionsAsync,
} from "expo-image-picker";
import { BottomSheet, Button, ListGroup, Spinner, TextArea, useThemeColor, useToast } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
	isImageMimeType,
	type PickedAttachment,
	toPickedAttachment,
	validatePickedAttachment,
} from "@/src/lib/chat/chat-attachment-picker";
import { emitChatTypingStarted, emitChatTypingStopped } from "@/src/lib/chat/chat-socket";

// 입력이 멎은 뒤 typing:stopped를 보내기까지의 창.
const TYPING_IDLE_MS = 3000;
const MESSAGE_MAX_LENGTH = 2000;
const IMAGE_QUALITY = 0.85;

// 하단 입력바: + 첨부(BottomSheet) / TextArea / 전송. 첨부를 고르면 입력바 위에 미리보기가
// 뜨고, 전송 시 텍스트가 있으면 첨부와 함께 보낸다(서버가 두 말풍선으로 저장).
export function ChatComposer({
	isDisabled,
	isUploading,
	onSendAttachment,
	onSendText,
	roomId,
}: {
	isDisabled: boolean;
	isUploading: boolean;
	onSendAttachment: (picked: PickedAttachment, body: string) => void;
	onSendText: (body: string) => void;
	roomId: string;
}) {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");
	const accentForeground = useThemeColor("accent-foreground");
	const { toast } = useToast();
	const [body, setBody] = useState("");
	const [draft, setDraft] = useState<PickedAttachment | null>(null);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const typingActiveRef = useRef(false);
	const typingTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);

	const stopTyping = () => {
		if (typingTimerRef.current !== null) {
			clearTimeout(typingTimerRef.current);
			typingTimerRef.current = null;
		}
		if (typingActiveRef.current) {
			typingActiveRef.current = false;
			emitChatTypingStopped(roomId);
		}
	};

	const handleChangeText = (next: string) => {
		setBody(next.slice(0, MESSAGE_MAX_LENGTH));
		if (!next.trim()) {
			stopTyping();
			return;
		}
		if (!typingActiveRef.current) {
			typingActiveRef.current = true;
			emitChatTypingStarted(roomId);
		}
		if (typingTimerRef.current !== null) {
			clearTimeout(typingTimerRef.current);
		}
		typingTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
	};

	useEffect(() => stopTyping, []);

	const acceptDraft = (picked: PickedAttachment) => {
		const validation = validatePickedAttachment(picked);

		if (!validation.ok) {
			toast.show({ label: validation.message, variant: "danger" });
			return;
		}
		setDraft(picked);
	};

	const pickFromLibrary = async () => {
		setIsSheetOpen(false);
		try {
			const result = await launchImageLibraryAsync({ mediaTypes: ["images"], quality: IMAGE_QUALITY });
			const asset = result.canceled ? null : result.assets[0];
			if (asset) {
				acceptDraft(toPickedAttachment({ fileName: asset.fileName, mimeType: asset.mimeType, size: asset.fileSize, uri: asset.uri }, "image/jpeg"));
			}
		} catch {
			toast.show({ label: "사진을 불러오지 못했어요.", variant: "danger" });
		}
	};

	const pickFromCamera = async () => {
		setIsSheetOpen(false);
		try {
			const permission = await requestCameraPermissionsAsync();
			if (!permission.granted) {
				toast.show({ label: "카메라 권한이 필요해요.", variant: "warning" });
				return;
			}
			const result = await launchCameraAsync({ quality: IMAGE_QUALITY });
			const asset = result.canceled ? null : result.assets[0];
			if (asset) {
				acceptDraft(toPickedAttachment({ fileName: asset.fileName, mimeType: asset.mimeType, size: asset.fileSize, uri: asset.uri }, "image/jpeg"));
			}
		} catch {
			toast.show({ label: "사진을 찍지 못했어요.", variant: "danger" });
		}
	};

	const pickDocument = async () => {
		setIsSheetOpen(false);
		try {
			const result = await getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: "application/pdf" });
			const asset = result.canceled ? null : result.assets[0];
			if (asset) {
				acceptDraft(toPickedAttachment({ fileName: asset.name, mimeType: asset.mimeType, size: asset.size, uri: asset.uri }, "application/pdf"));
			}
		} catch {
			toast.show({ label: "파일을 불러오지 못했어요.", variant: "danger" });
		}
	};

	const canSend = !isDisabled && !isUploading && (Boolean(draft) || body.trim().length > 0);

	const handleSend = () => {
		if (!canSend) {
			return;
		}
		stopTyping();
		if (draft) {
			onSendAttachment(draft, body);
			setDraft(null);
		} else {
			onSendText(body);
		}
		setBody("");
	};

	return (
		<View className="border-border border-t bg-background px-3 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
			{draft ? (
				<View className="mb-2 flex-row items-center gap-3 rounded-2xl bg-surface-secondary p-2">
					{isImageMimeType(draft.mimeType) ? (
						<Image accessibilityIgnoresInvertColors className="h-14 w-14 rounded-xl" source={{ uri: draft.uri }} />
					) : (
						<View className="h-14 w-14 items-center justify-center rounded-xl bg-danger/15">
							<Ionicons color={foreground} name="document-text-outline" size={24} />
						</View>
					)}
					<Text className="flex-1 text-foreground text-sm" numberOfLines={2}>{draft.fileName}</Text>
					<Pressable accessibilityLabel="첨부 제거" accessibilityRole="button" hitSlop={8} onPress={() => setDraft(null)}>
						<Ionicons color={foreground} name="close-circle" size={22} />
					</Pressable>
				</View>
			) : null}
			<View className="flex-row items-end gap-2">
				<BottomSheet isOpen={isSheetOpen} onOpenChange={setIsSheetOpen}>
					<BottomSheet.Trigger asChild>
						<Pressable
							accessibilityLabel="첨부 추가"
							accessibilityRole="button"
							className="h-11 w-11 items-center justify-center rounded-2xl bg-surface-secondary active:opacity-75"
							disabled={isDisabled || isUploading}
						>
							<Ionicons color={foreground} name="add" size={26} />
						</Pressable>
					</BottomSheet.Trigger>
					<BottomSheet.Portal>
						<BottomSheet.Overlay />
						<BottomSheet.Content>
							<BottomSheet.Title>무엇을 보낼까요?</BottomSheet.Title>
							<BottomSheet.Description>이미지(JPG·PNG·WebP)와 PDF, 10MB까지</BottomSheet.Description>
							<ListGroup className="mt-4" variant="transparent">
								<ListGroup.Item onPress={pickFromLibrary}>
									<ListGroup.ItemPrefix><Ionicons color={foreground} name="images-outline" size={22} /></ListGroup.ItemPrefix>
									<ListGroup.ItemContent><ListGroup.ItemTitle>앨범에서 선택</ListGroup.ItemTitle></ListGroup.ItemContent>
								</ListGroup.Item>
								<ListGroup.Item onPress={pickFromCamera}>
									<ListGroup.ItemPrefix><Ionicons color={foreground} name="camera-outline" size={22} /></ListGroup.ItemPrefix>
									<ListGroup.ItemContent><ListGroup.ItemTitle>사진 촬영</ListGroup.ItemTitle></ListGroup.ItemContent>
								</ListGroup.Item>
								<ListGroup.Item onPress={pickDocument}>
									<ListGroup.ItemPrefix><Ionicons color={foreground} name="document-outline" size={22} /></ListGroup.ItemPrefix>
									<ListGroup.ItemContent><ListGroup.ItemTitle>PDF 파일</ListGroup.ItemTitle></ListGroup.ItemContent>
								</ListGroup.Item>
							</ListGroup>
						</BottomSheet.Content>
					</BottomSheet.Portal>
				</BottomSheet>
				<View className="flex-1">
					<TextArea
						accessibilityLabel="메시지 입력"
						className="max-h-32 min-h-11"
						editable={!isDisabled}
						maxLength={MESSAGE_MAX_LENGTH}
						onBlur={stopTyping}
						onChangeText={handleChangeText}
						placeholder="메시지를 입력하세요"
						value={body}
						variant="secondary"
					/>
				</View>
				<Button accessibilityLabel="보내기" isDisabled={!canSend} isIconOnly onPress={handleSend} size="md">
					{isUploading ? <Spinner size="sm" /> : <Ionicons color={accentForeground} name="arrow-up" size={20} />}
				</Button>
			</View>
		</View>
	);
}
```
(`Button`에 `isIconOnly`가 없으면 `className="h-11 w-11 rounded-2xl"`로 대체한다. `BottomSheet.Trigger asChild` 미지원이면 `<BottomSheet.Trigger>` 안에 아이콘만 넣는다.)

- [ ] **Step 4: `chat-room-header.tsx`**

```tsx
import { Ionicons } from "@expo/vector-icons";
import { Avatar, useThemeColor } from "heroui-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 채팅방 전용 헤더(SeekerStackHeader 대신). 뒤로 / 상대 아바타·이름·공고명 / 우측 슬롯.
// statusLine은 공고 마감·상대 탈퇴·차단 등 상태가 있을 때만 헤더 아래 얇게 뜬다.
export function ChatRoomHeader({
	counterpartName,
	counterpartProfileImageUrl,
	jobTitle,
	onBack,
	right,
	statusLine,
}: {
	counterpartName: null | string;
	counterpartProfileImageUrl: null | string;
	jobTitle: null | string;
	onBack: () => void;
	right?: ReactNode;
	statusLine: null | string;
}) {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");

	return (
		<View className="border-border border-b bg-background" style={{ paddingTop: insets.top }}>
			<View className="h-14 flex-row items-center gap-3 px-4">
				<Pressable
					accessibilityLabel="뒤로 가기"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
					hitSlop={8}
					onPress={onBack}
				>
					<Ionicons color={foreground} name="arrow-back" size={22} />
				</Pressable>
				<Avatar color="accent" size="sm">
					{counterpartProfileImageUrl ? <Avatar.Image source={{ uri: counterpartProfileImageUrl }} /> : null}
					<Avatar.Fallback>{(counterpartName ?? "?").trim().charAt(0) || "?"}</Avatar.Fallback>
				</Avatar>
				<View className="flex-1">
					<Text className="font-bold text-foreground text-base" numberOfLines={1}>{counterpartName ?? "채팅방"}</Text>
					{jobTitle ? <Text className="text-muted text-xs" numberOfLines={1}>{jobTitle}</Text> : null}
				</View>
				{right}
			</View>
			{statusLine ? (
				<View className="bg-warning/15 px-4 py-1.5">
					<Text className="text-center text-warning-soft-foreground text-xs dark:text-warning">{statusLine}</Text>
				</View>
			) : null}
		</View>
	);
}
```

- [ ] **Step 5: `chat-room-menu.tsx`**

```tsx
import { Ionicons } from "@expo/vector-icons";
import { Menu, useThemeColor } from "heroui-native";
import { Pressable } from "react-native";

const MENU_WIDTH = 220;

// 헤더 우측 케밥. 연락처 공개 보기(확정 면접 있을 때) · 신고 · 차단 · 나가기.
// 차단·나가기 확인 Dialog는 화면([id].tsx)이 띄운다 — 메뉴는 의도만 올린다.
export function ChatRoomMenu({
	canRevealContact,
	onBlock,
	onLeave,
	onReport,
	onRevealContact,
}: {
	canRevealContact: boolean;
	onBlock: () => void;
	onLeave: () => void;
	onReport: () => void;
	onRevealContact: () => void;
}) {
	const foreground = useThemeColor("foreground");

	return (
		<Menu>
			<Menu.Trigger asChild>
				<Pressable
					accessibilityLabel="채팅방 메뉴"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
					hitSlop={8}
				>
					<Ionicons color={foreground} name="ellipsis-vertical" size={20} />
				</Pressable>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Overlay />
				<Menu.Content presentation="popover" width={MENU_WIDTH}>
					{canRevealContact ? (
						<Menu.Item onPress={onRevealContact}>
							<Menu.ItemTitle>연락처 공개</Menu.ItemTitle>
						</Menu.Item>
					) : null}
					<Menu.Item onPress={onReport}>
						<Menu.ItemTitle>신고</Menu.ItemTitle>
					</Menu.Item>
					<Menu.Item onPress={onBlock} variant="danger">
						<Menu.ItemTitle>차단</Menu.ItemTitle>
					</Menu.Item>
					<Menu.Item onPress={onLeave} variant="danger">
						<Menu.ItemTitle>채팅방 나가기</Menu.ItemTitle>
					</Menu.Item>
				</Menu.Content>
			</Menu.Portal>
		</Menu>
	);
}
```

- [ ] **Step 6: `chat-room-list-item.tsx`**

```tsx
import { Avatar, Chip, cn, ListGroup } from "heroui-native";
import { Text, View } from "react-native";

import { formatChatListTime } from "@/src/lib/chat/chat-time";
import type { ChatRoomListItem as ChatRoomListItemData } from "@/src/lib/chat/chat-types";

const UNREAD_CAP = 99;

// 메신저식 목록 행. listMine은 상대 프로필 이미지를 내려주지 않아 이니셜 폴백만 쓴다.
// 차단·탈퇴 행은 열리되(이력 열람) 채도를 낮추고 상태 칩을 단다 — web과 같은 규칙.
export function ChatRoomListItem({
	onPress,
	room,
}: {
	onPress: () => void;
	room: ChatRoomListItemData;
}) {
	const isMuted = room.isBlocked || room.counterpartWithdrawn;
	const unreadLabel = room.unreadCount > UNREAD_CAP ? `${UNREAD_CAP}+` : String(room.unreadCount);

	return (
		<ListGroup.Item
			accessibilityLabel={`${room.counterpartName ?? "상대"}와의 채팅, ${room.jobTitle ?? ""}, 읽지 않음 ${room.unreadCount}건`}
			className={cn("py-3", isMuted && "opacity-60")}
			onPress={onPress}
		>
			<ListGroup.ItemPrefix>
				<Avatar color={isMuted ? "default" : "accent"} size="lg">
					<Avatar.Fallback>{(room.counterpartName ?? "?").trim().charAt(0) || "?"}</Avatar.Fallback>
				</Avatar>
			</ListGroup.ItemPrefix>
			<ListGroup.ItemContent>
				<View className="flex-row items-center gap-2">
					<ListGroup.ItemTitle numberOfLines={1}>{room.counterpartName ?? "상대"}</ListGroup.ItemTitle>
					{room.counterpartWithdrawn ? (
						<Chip color="default" size="sm" variant="soft"><Chip.Label>대화 불가</Chip.Label></Chip>
					) : room.isBlocked ? (
						<Chip color="danger" size="sm" variant="soft"><Chip.Label>차단됨</Chip.Label></Chip>
					) : null}
				</View>
				{room.jobTitle ? <Text className="text-muted text-xs" numberOfLines={1}>{room.jobTitle}</Text> : null}
				<ListGroup.ItemDescription
					className={cn(room.unreadCount > 0 && "font-semibold text-foreground")}
					numberOfLines={1}
				>
					{room.lastMessageBody ?? "메시지가 없습니다"}
				</ListGroup.ItemDescription>
			</ListGroup.ItemContent>
			<ListGroup.ItemSuffix>
				<View className="items-end gap-1.5">
					<Text className="text-muted text-xs">{formatChatListTime(room.updatedAt)}</Text>
					{room.unreadCount > 0 ? (
						<Chip color="accent" size="sm" variant="primary"><Chip.Label>{unreadLabel}</Chip.Label></Chip>
					) : null}
				</View>
			</ListGroup.ItemSuffix>
		</ListGroup.Item>
	);
}
```

- [ ] **Step 7: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/components/chat
```
Expected: 오류 0. heroui prop이 다르면 문서 스크립트로 확인해 맞춘다(`ListGroup.ItemTitle`에 `numberOfLines`가 없으면 `<Text>`로 대체).

- [ ] **Step 8: Commit**

```bash
git add apps/native/src/components/chat
git commit -m "feat(native): 채팅 시스템 카드·차단 안내·입력바·헤더·메뉴·목록 행 컴포넌트"
```

---

### Task 10: 채팅방 화면 `app/(seeker)/chats/[id].tsx` 재작성

**Files:**
- Rewrite: `apps/native/app/(seeker)/chats/[id].tsx`
- Modify: `apps/native/app/(seeker)/_layout.tsx:32` (`chats/[id]`를 `headerShown: false`로 — 화면이 `ChatRoomHeader`를 그린다)

**Interfaces:**
- Consumes: Task 6 훅(`useChatMessages`, `useChatAutoRead`, `useChatRoomRealtime`), Task 7 `useChatSend`, Task 8·9 컴포넌트, 공유 `annotateChatMessages`, `toInvertedTimeline`, `chatMutationErrorMessage`, `getChatBlockMessage`, `getConfirmedScheduleId`(`@/src/lib/bambi-native`), `JobReportDialog`(`@/src/components/report-dialog`) — 단, 이 다이얼로그는 `targetType: "job_post"` 고정이라 채팅 신고에는 쓰지 않는다(아래 Step 2 참고).
- Produces: 화면 하나. 라우트 파라미터 `id`.

- [ ] **Step 1: `_layout.tsx` 헤더 옵션 변경**

`apps/native/app/(seeker)/_layout.tsx`의
```tsx
<Stack.Screen name="chats/[id]" options={{ title: "채팅방" }} />
```
을
```tsx
{/* 채팅방은 상대 아바타·공고명·메뉴를 가진 전용 헤더(ChatRoomHeader)를 화면이 직접 그린다. */}
<Stack.Screen name="chats/[id]" options={{ headerShown: false }} />
```
로 바꾼다.

- [ ] **Step 2: 채팅 신고용 ReportDialog 확장**

`apps/native/src/components/report-dialog.tsx`의 `JobReportDialog` props에 `targetType?: "chat_room" | "job_post"`(기본 `"job_post"`)를 추가하고 `createReport.mutate({ targetType, ... })`로 넘긴다. 제목 문구는 그대로 둔다. 서버 enum `moderationTargetType`에 `chat_room`이 있다(`packages/db/src/schema/bambi.ts:174-185`).

- [ ] **Step 3: 화면 작성**

`apps/native/app/(seeker)/chats/[id].tsx`:
```tsx
import { annotateChatMessages } from "@bambi-app/api/services/bambi-chat-message-grouping";
import { getChatBlockMessage } from "@bambi-app/api/services/bambi-chat-block";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button, Dialog, Skeleton, Spinner, useToast } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, type NativeScrollEvent, type NativeSyntheticEvent, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { ErrorState } from "@/src/components/bambi-screen";
import { ChatBlockNotice } from "@/src/components/chat/chat-block-notice";
import { ChatComposer } from "@/src/components/chat/chat-composer";
import { ChatDateChip } from "@/src/components/chat/chat-date-chip";
import { ChatMessageBubble } from "@/src/components/chat/chat-message-bubble";
import { ChatNewMessagePill } from "@/src/components/chat/chat-new-message-pill";
import { ChatRoomHeader } from "@/src/components/chat/chat-room-header";
import { ChatRoomMenu } from "@/src/components/chat/chat-room-menu";
import { ChatSystemCard } from "@/src/components/chat/chat-system-card";
import { ChatTypingIndicator } from "@/src/components/chat/chat-typing-indicator";
import { MemberOnly } from "@/src/components/member-only";
import { JobReportDialog } from "@/src/components/report-dialog";
import { getConfirmedScheduleId } from "@/src/lib/bambi-native";
import { chatMutationErrorMessage } from "@/src/lib/chat/chat-errors";
import { type ChatTimelineMessage, toInvertedTimeline } from "@/src/lib/chat/chat-optimistic";
import { orpc } from "@/src/lib/orpc";
import { useChatAutoRead } from "@/src/lib/chat/use-chat-auto-read";
import { useChatMessages } from "@/src/lib/chat/use-chat-messages";
import { useChatRoomRealtime } from "@/src/lib/chat/use-chat-room-realtime";
import { useChatSend } from "@/src/lib/chat/use-chat-send";

// inverted 리스트에서 "맨 아래(최신)를 보고 있다"로 칠 오프셋 상한.
const BOTTOM_STICK_THRESHOLD = 80;
const SYSTEM_KINDS = new Set(["contact_request", "interview_proposal"]);
const SKELETON_ROWS = [0, 1, 2, 3, 4];

type ConfirmAction = "block" | "leave" | null;

function RoomSkeleton() {
	return (
		<View className="flex-1 gap-4 p-4">
			{SKELETON_ROWS.map((row) => (
				<View className={row % 2 === 0 ? "items-start" : "items-end"} key={row}>
					<Skeleton className="h-12 w-3/5 rounded-2xl" />
				</View>
			))}
		</View>
	);
}

function resolveStatusLine({
	counterpartWithdrawn,
	jobStatus,
}: {
	counterpartWithdrawn: boolean;
	jobStatus: null | string;
}): null | string {
	if (counterpartWithdrawn) {
		return "상대가 탈퇴해 더 이상 대화할 수 없어요.";
	}
	if (jobStatus && jobStatus !== "published") {
		return "마감된 공고예요. 이전 대화만 볼 수 있어요.";
	}
	return null;
}

function SeekerChatRoomInner() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	// @react-navigation/native는 직접 의존성이 아니라 useIsFocused를 못 쓴다 — expo-router의
	// useFocusEffect로 포커스 상태를 직접 든다.
	const [isFocused, setIsFocused] = useState(false);
	useFocusEffect(
		useCallback(() => {
			setIsFocused(true);
			return () => setIsFocused(false);
		}, [])
	);
	const [appActive, setAppActive] = useState(AppState.currentState === "active");
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [hasUnseenNew, setHasUnseenNew] = useState(false);
	const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
	const [isReportOpen, setIsReportOpen] = useState(false);
	const listRef = useRef<FlatList<ChatTimelineMessage>>(null);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
		return () => subscription.remove();
	}, []);

	const showError = useCallback(
		(message: string) => toast.show({ label: message, variant: "danger" }),
		[toast]
	);

	// 전송 훅은 currentUserId가 필요하지만 방 조회 전엔 모른다 — 빈 문자열로 시작하고
	// 실제 전송 버튼은 room이 로드된 뒤에만 활성화된다.
	const roomForUser = queryClient.getQueryData<{ currentUserId: string }>(
		orpc.bambi.chats.getById.queryKey({ input: { id, limit: 50 } })
	);
	const send = useChatSend({
		currentUserId: roomForUser?.currentUserId ?? "",
		onError: showError,
		roomId: id,
	});
	const { canLoadOlder, isLoadingOlder, loadOlder, room, roomQuery, timeline } = useChatMessages({
		optimistic: send.optimistic,
		roomId: id,
	});
	const autoRead = useChatAutoRead({ chatRoomId: id, isActive: isFocused && appActive });
	const latestMessageId = timeline.at(-1)?.id ?? null;

	const realtime = useChatRoomRealtime({
		onIncomingMessage: (messageId) => {
			autoRead.queueMarkRead(messageId);
			if (!isAtBottom) {
				setHasUnseenNew(true);
			}
		},
		onUnreadRemaining: autoRead.reassertMarkRead,
		roomId: id,
	});

	// 첫 로드가 끝나면 지연 없이 읽음 처리한다.
	const firstLoadedRef = useRef(false);
	useEffect(() => {
		if (room && !firstLoadedRef.current) {
			firstLoadedRef.current = true;
			autoRead.markReadNow(latestMessageId);
		}
	}, [autoRead, latestMessageId, room]);

	const invalidateRoom = useCallback(
		() => queryClient.invalidateQueries({ queryKey: orpc.bambi.chats.getById.key({ input: { id } }) }).catch(() => undefined),
		[id, queryClient]
	);
	const respondContact = useMutation(
		orpc.bambi.chats.respondContactReveal.mutationOptions({
			onError: (error) => showError(chatMutationErrorMessage(error)),
			onSettled: () => invalidateRoom(),
		})
	);
	const setInterviewStatus = useMutation(
		orpc.bambi.chats.setInterviewStatus.mutationOptions({
			onError: (error) => showError(chatMutationErrorMessage(error)),
			onSettled: () => {
				invalidateRoom();
				queryClient.invalidateQueries({ queryKey: orpc.bambi.chats.listMyUpcomingInterviews.queryKey() }).catch(() => undefined);
			},
		})
	);
	const leaveRoom = useMutation(
		orpc.bambi.chats.deleteChatRoom.mutationOptions({
			onError: (error) => showError(chatMutationErrorMessage(error)),
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.bambi.chats.listMine.queryKey() }).catch(() => undefined);
				router.back();
			},
		})
	);
	const blockUser = useMutation(
		orpc.bambi.blocks.blockUser.mutationOptions({
			onError: (error) => showError(chatMutationErrorMessage(error)),
			onSuccess: () => {
				toast.show({ label: "차단했어요. 차단 관리에서 해제할 수 있어요.", variant: "default" });
				invalidateRoom();
				queryClient.invalidateQueries({ queryKey: orpc.bambi.chats.listMine.queryKey() }).catch(() => undefined);
			},
		})
	);

	const annotated = useMemo(() => annotateChatMessages(timeline), [timeline]);
	const inverted = useMemo(() => toInvertedTimeline(annotated), [annotated]);
	// 상대가 읽은 내 마지막 메시지 표시용 — 서버 getById는 영수증을 내려주지 않으므로
	// 소켓 chat:message:read를 받은 뒤 재조회된 unreadCount로 대신 판단하지 않고, 단순히
	// "상대가 보낸 더 새 메시지가 있으면 읽음"으로 근사한다(web과 동일한 한계).
	const lastMineIndex = timeline.findLastIndex((message) => message.senderUserId === room?.currentUserId);
	const isLastMineRead = lastMineIndex >= 0 && timeline.slice(lastMineIndex + 1).some((message) => message.senderUserId !== room?.currentUserId);

	const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const atBottom = event.nativeEvent.contentOffset.y <= BOTTOM_STICK_THRESHOLD;
		setIsAtBottom(atBottom);
		if (atBottom) {
			setHasUnseenNew(false);
		}
	};
	const scrollToBottom = () => {
		listRef.current?.scrollToOffset({ animated: true, offset: 0 });
		setHasUnseenNew(false);
	};

	if (roomQuery.isLoading) {
		return (
			<View className="flex-1 bg-background">
				<ChatRoomHeader counterpartName={null} counterpartProfileImageUrl={null} jobTitle={null} onBack={() => router.back()} statusLine={null} />
				<RoomSkeleton />
			</View>
		);
	}

	if (roomQuery.isError || !room) {
		const blockMessage = getChatBlockMessage(roomQuery.error);
		return (
			<View className="flex-1 bg-background">
				<ChatRoomHeader counterpartName={null} counterpartProfileImageUrl={null} jobTitle={null} onBack={() => router.back()} statusLine={null} />
				{blockMessage ? (
					<View className="flex-1 items-center justify-center p-6">
						<Text className="text-center text-muted leading-6">{blockMessage}</Text>
					</View>
				) : (
					<ErrorState onRetry={() => roomQuery.refetch()} />
				)}
			</View>
		);
	}

	const confirmedScheduleId = getConfirmedScheduleId(room.schedules);
	const statusLine = resolveStatusLine({ counterpartWithdrawn: room.counterpartWithdrawn, jobStatus: room.jobPost?.status ?? null });
	const sendBlockedMessage = room.counterpartWithdrawn
		? "상대가 탈퇴해 메시지를 보낼 수 없어요."
		: room.room.isBlocked
			? "차단된 채팅방이에요."
			: null;
	const isBusy = respondContact.isPending || setInterviewStatus.isPending;

	const renderItem = ({ item }: { item: (typeof inverted)[number] }) => {
		const { dateLabel, isGroupEnd, isGroupStart, message } = item;
		const isMine = message.senderUserId === room.currentUserId;
		const body = SYSTEM_KINDS.has(message.kind) ? (
			<ChatSystemCard
				counterpartName={room.counterpartName}
				currentUserId={room.currentUserId}
				isBusy={isBusy}
				message={message}
				onRespondContact={(messageId, decision) => respondContact.mutate({ decision, messageId })}
				onSetInterviewStatus={(interviewScheduleId, status) => setInterviewStatus.mutate({ interviewScheduleId, status })}
				schedules={room.schedules}
			/>
		) : (
			<ChatMessageBubble
				counterpartName={room.counterpartName}
				counterpartProfileImageUrl={room.counterpartProfileImageUrl}
				isGroupEnd={isGroupEnd}
				isGroupStart={isGroupStart}
				isMine={isMine}
				isReadByCounterpart={isMine && message.id === timeline[lastMineIndex]?.id && isLastMineRead}
				message={message}
				onDiscard={send.discardFailed}
				onRetry={send.retry}
			/>
		);

		// inverted라 날짜 칩은 같은 아이템 "위"(=렌더 순서상 뒤)에 붙인다.
		return (
			<View>
				{body}
				{dateLabel ? <ChatDateChip label={dateLabel} /> : null}
			</View>
		);
	};

	return (
		<View className="flex-1 bg-background">
			<ChatRoomHeader
				counterpartName={room.counterpartName}
				counterpartProfileImageUrl={room.counterpartProfileImageUrl}
				jobTitle={room.jobPost?.title ?? null}
				onBack={() => router.back()}
				right={
					<ChatRoomMenu
						canRevealContact={Boolean(confirmedScheduleId)}
						onBlock={() => setConfirmAction("block")}
						onLeave={() => setConfirmAction("leave")}
						onReport={() => setIsReportOpen(true)}
						onRevealContact={() => router.push({ pathname: "/(seeker)/chats/[id]/reveal", params: { id } } as unknown as Href)}
					/>
				}
				statusLine={statusLine}
			/>
			<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
				<View className="flex-1">
					<FlatList
						ListFooterComponent={isLoadingOlder ? <View className="items-center py-3"><Spinner size="sm" /></View> : <View className="h-3" />}
						ListHeaderComponent={
							realtime.typingUserIds.length > 0 ? (
								<ChatTypingIndicator counterpartName={room.counterpartName} counterpartProfileImageUrl={room.counterpartProfileImageUrl} />
							) : (
								<View className="h-3" />
							)
						}
						contentContainerStyle={{ paddingBottom: 8 }}
						data={inverted}
						inverted
						keyExtractor={(item) => item.message.id}
						keyboardDismissMode="interactive"
						keyboardShouldPersistTaps="handled"
						onEndReached={() => {
							if (canLoadOlder) {
								loadOlder();
							}
						}}
						onEndReachedThreshold={0.6}
						onScroll={handleScroll}
						ref={listRef}
						renderItem={renderItem}
						scrollEventThrottle={100}
					/>
					{hasUnseenNew ? <ChatNewMessagePill onPress={scrollToBottom} /> : null}
				</View>
				{sendBlockedMessage ? (
					<ChatBlockNotice message={sendBlockedMessage} />
				) : (
					<ChatComposer
						isDisabled={!room.currentUserId}
						isUploading={send.isUploading}
						onSendAttachment={(picked, body) => {
							scrollToBottom();
							send.sendAttachment(picked, body).catch(() => undefined);
						}}
						onSendText={(body) => {
							scrollToBottom();
							send.sendText(body);
						}}
						roomId={id}
					/>
				)}
			</KeyboardAvoidingView>

			<JobReportDialog isOpen={isReportOpen} onOpenChange={setIsReportOpen} targetId={id} targetType="chat_room" />

			<Dialog isOpen={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
				<Dialog.Portal>
					<Dialog.Overlay />
					<Dialog.Content>
						<View className="gap-4">
							<View className="gap-1.5">
								<Dialog.Title>{confirmAction === "block" ? "이 상대를 차단할까요?" : "채팅방을 나갈까요?"}</Dialog.Title>
								<Dialog.Description>
									{confirmAction === "block"
										? "차단하면 두 사람의 모든 채팅이 막혀요. 차단 관리에서 해제할 수 있어요."
										: "나가면 이 대화는 목록에서 사라지고 되돌릴 수 없어요. 다시 문의하면 새 대화로 시작돼요."}
								</Dialog.Description>
							</View>
							<View className="flex-row gap-3">
								<View className="flex-1">
									<Button onPress={() => setConfirmAction(null)} variant="tertiary">
										<Button.Label>취소</Button.Label>
									</Button>
								</View>
								<View className="flex-1">
									<Button
										isDisabled={leaveRoom.isPending || blockUser.isPending}
										onPress={() => {
											if (confirmAction === "block") {
												blockUser.mutate({ blockedUserId: room.room.employerUserId, chatRoomId: id });
											} else {
												leaveRoom.mutate({ chatRoomId: id });
											}
											setConfirmAction(null);
										}}
										variant="danger"
									>
										<Button.Label>{confirmAction === "block" ? "차단" : "나가기"}</Button.Label>
									</Button>
								</View>
							</View>
						</View>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog>
		</View>
	);
}

export default function SeekerChatRoomScreen() {
	return (
		<MemberOnly>
			<SeekerChatRoomInner />
		</MemberOnly>
	);
}
```
주의:
- `Array.prototype.findLastIndex`가 Hermes에서 없으면 역순 for 루프로 대체한다.
- `50`은 `CHAT_MESSAGE_PAGE_SIZE`를 import해 쓴다.
- 차단 대상은 구직자 앱이므로 `room.room.employerUserId`(상대=구인자).

- [ ] **Step 4: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check "apps/native/app/(seeker)/chats" "apps/native/app/(seeker)/_layout.tsx" apps/native/src/components/report-dialog.tsx
```
Expected: 오류 0.

- [ ] **Step 5: Commit**

```bash
git add "apps/native/app/(seeker)/chats/[id].tsx" "apps/native/app/(seeker)/_layout.tsx" apps/native/src/components/report-dialog.tsx
git commit -m "feat(native): 채팅방 화면 재작성(inverted 리스트·실시간·자동 읽음·낙관적 전송·시스템 카드·메뉴)"
```

---

### Task 11: 채팅 목록 화면·탭 배지·공고 CTA 문구·연락처 공개 정리

**Files:**
- Rewrite: `apps/native/app/(seeker)/(tabs)/chats.tsx`
- Modify: `apps/native/app/(seeker)/(tabs)/_layout.tsx` (채팅 탭 `tabBarBadge`)
- Modify: `apps/native/app/(seeker)/jobs/[id].tsx:137-146` (CTA 오류 문구)
- Modify: `apps/native/app/(seeker)/chats/[id]/reveal.tsx:19` (기본값 `""`)

**Interfaces:**
- Consumes: `ChatRoomListItem` 컴포넌트(Task 9), `useChatUnreadBadge`(Task 6), `startChatErrorMessage`(Task 4), `connectChatSocket`(Task 5), `useVisitor`(`@/src/lib/guest-store`)

- [ ] **Step 1: 목록 화면 재작성**

`apps/native/app/(seeker)/(tabs)/chats.tsx`:
```tsx
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useFocusEffect } from "expo-router";
import { Button, ListGroup, Separator, Skeleton, useThemeColor } from "heroui-native";
import { Fragment, useCallback, useEffect } from "react";
import { Text, View } from "react-native";

import { BambiHeader, BambiScreen, ErrorState } from "@/src/components/bambi-screen";
import { ChatRoomListItem } from "@/src/components/chat/chat-room-list-item";
import { MemberOnly } from "@/src/components/member-only";
import { connectChatSocket } from "@/src/lib/chat/chat-socket";
import { orpc } from "@/src/lib/orpc";

const SKELETON_ROWS = [0, 1, 2, 3];

function ListSkeleton() {
	return (
		<View className="gap-4">
			{SKELETON_ROWS.map((row) => (
				<View className="flex-row items-center gap-3" key={row}>
					<Skeleton className="h-14 w-14 rounded-full" />
					<View className="flex-1 gap-2">
						<Skeleton className="h-4 w-2/5 rounded-md" />
						<Skeleton className="h-3 w-4/5 rounded-md" />
					</View>
				</View>
			))}
		</View>
	);
}

function EmptyChats() {
	const muted = useThemeColor("muted");

	return (
		<View className="items-center gap-3 py-16">
			<Ionicons color={muted} name="chatbubble-ellipses-outline" size={44} />
			<Text className="font-semibold text-foreground text-lg">아직 채팅이 없어요</Text>
			<Text className="text-center text-muted text-sm leading-5">
				공고 상세에서 1:1 채팅을 시작하면{"\n"}여기에 대화가 쌓여요.
			</Text>
			<Button onPress={() => router.push("/(seeker)" as Href)} size="sm" variant="secondary">
				<Button.Label>공고 탐색하기</Button.Label>
			</Button>
		</View>
	);
}

function SeekerChatsInner() {
	const queryClient = useQueryClient();
	const chatsQuery = useQuery(orpc.bambi.chats.listMine.queryOptions());
	const { refetch } = chatsQuery;

	// RN에는 focusManager가 없어 방에서 돌아와도 자동 재조회가 없다 — 포커스 복귀에 직접 건다.
	useFocusEffect(
		useCallback(() => {
			refetch();
		}, [refetch])
	);

	// 소켓 chat:list:updated(새 메시지·읽음·나가기)로 목록을 갱신한다.
	useEffect(() => {
		const socket = connectChatSocket();
		const refresh = () => {
			queryClient.invalidateQueries({ queryKey: orpc.bambi.chats.listMine.queryKey() }).catch(() => undefined);
		};
		socket.on("chat:list:updated", refresh);
		socket.on("connect", refresh);
		return () => {
			socket.off("chat:list:updated", refresh);
			socket.off("connect", refresh);
		};
	}, [queryClient]);

	if (chatsQuery.isError) {
		return <ErrorState onRetry={() => chatsQuery.refetch()} />;
	}

	const rooms = chatsQuery.data ?? [];

	return (
		<BambiScreen>
			<BambiHeader description="지원한 공고의 대화를 확인합니다." title="채팅" />
			{chatsQuery.isLoading ? (
				<ListSkeleton />
			) : rooms.length === 0 ? (
				<EmptyChats />
			) : (
				<ListGroup variant="transparent">
					{rooms.map((room, index) => (
						<Fragment key={room.id}>
							{index > 0 ? <Separator /> : null}
							<ChatRoomListItem
								onPress={() => router.push({ pathname: "/(seeker)/chats/[id]", params: { id: room.id } } as unknown as Href)}
								room={room}
							/>
						</Fragment>
					))}
				</ListGroup>
			)}
		</BambiScreen>
	);
}

export default function SeekerChatsScreen() {
	return (
		<MemberOnly>
			<SeekerChatsInner />
		</MemberOnly>
	);
}
```

- [ ] **Step 2: 탭 배지**

`apps/native/app/(seeker)/(tabs)/_layout.tsx`에 import 추가:
```tsx
import { useChatUnreadBadge } from "@/src/lib/chat/use-chat-unread-badge";
import { useVisitor } from "@/src/lib/guest-store";
```
컴포넌트 안(훅 호출부):
```tsx
const { state: visitorState } = useVisitor();
const chatUnreadCount = useChatUnreadBadge(visitorState === "member");
```
채팅 탭 옵션:
```tsx
<Tabs.Screen
	name="chats"
	options={{
		tabBarBadge: chatUnreadCount > 0 ? (chatUnreadCount > 99 ? "99+" : chatUnreadCount) : undefined,
		tabBarBadgeStyle: { backgroundColor: accentColor, color: "#ffffff", fontSize: 11 },
		tabBarIcon: tabIcon("chatbubble-ellipses", "chatbubble-ellipses-outline"),
		title: "채팅",
	}}
/>
```
`99`는 `UNREAD_CAP` 상수로 뺀다. `"#ffffff"`는 `useThemeColor("accent-foreground")` 값으로 대체한다.

- [ ] **Step 3: 공고 상세 CTA 오류 문구**

`apps/native/app/(seeker)/jobs/[id].tsx`에서
```tsx
import { startChatErrorMessage } from "@/src/lib/chat/chat-errors";
```
를 추가하고, 하단 바의 오류 텍스트를
```tsx
{startChatMutation.isError ? (
	<Text className="text-danger text-sm" selectable>
		{startChatErrorMessage(startChatMutation.error)}
	</Text>
) : null}
```
로 바꾼다.

- [ ] **Step 4: 연락처 공개 화면 기본값 정리**

`apps/native/app/(seeker)/chats/[id]/reveal.tsx`의 `useState("010-0000-0000")`을 `useState("")`로 바꾸고, 버튼 `isDisabled`에 `|| contactValue.trim().length < 3`을 추가한다(서버 zod `contactValue` 3~120자).

- [ ] **Step 5: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check "apps/native/app/(seeker)/(tabs)" "apps/native/app/(seeker)/jobs/[id].tsx" "apps/native/app/(seeker)/chats/[id]/reveal.tsx"
```
Expected: 오류 0.

- [ ] **Step 6: Commit**

```bash
git add "apps/native/app/(seeker)/(tabs)/chats.tsx" "apps/native/app/(seeker)/(tabs)/_layout.tsx" "apps/native/app/(seeker)/jobs/[id].tsx" "apps/native/app/(seeker)/chats/[id]/reveal.tsx"
git commit -m "feat(native): 채팅 목록 메신저식 재작성·탭 미읽음 배지·채팅 시작 오류 문구"
```

---

### Task 12: 전체 검증·문서 동기화

**Files:**
- Modify: `docs/superpowers/plans/2026-09-03-native-chat.md` (체크박스·검증 노트)
- Modify: `docs/superpowers/specs/2026-09-03-native-chat-design.md` (구현 중 바뀐 결정 반영: 시스템 메시지 공유 파일 추가, 메시지 id crypto 폴백, `chat-read-watermark.ts`·`chat-attachment-picker.ts` 추가)

- [ ] **Step 1: 테스트 전체**

Run (cwd `packages/api`): `pnpm vitest run test/services` → 전부 통과(기존 dev DB 의존 기저 실패 3건은 사전에 기록된 것이면 그대로 보고).
Run (cwd `apps/native`): `pnpm vitest run` → 7 files passed.

- [ ] **Step 2: 타입 검사 3패키지**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm --filter web check-types
pnpm --filter @bambi-app/api check-types
```
Expected: 오류 0.

- [ ] **Step 3: 린트 전체 경로**

```bash
pnpm dlx ultracite check apps/native/src apps/native/app apps/native/test packages/api/src/services packages/api/test/services apps/web/src/components/bambi/screens apps/web/src/lib/bambi apps/web/src/app/moderator/chats apps/web/src/app/seeker/jobs
```
Expected: 오류 0.

- [ ] **Step 4: 잔여 참조 점검**

```bash
grep -rn "lib/bambi/chat-message-grouping\|lib/bambi/chat-room-messages\|lib/bambi/chat-block\"" apps/web/src apps/web/test
grep -rn "Alert.alert" apps/native/src/components/chat "apps/native/app/(seeker)/chats"
```
Expected: 둘 다 출력 없음.

- [ ] **Step 5: 문서 갱신·커밋**

플랜 체크박스를 실제 완료 상태로, 스펙의 "아키텍처" 표에 신규 파일 4개(`bambi-chat-system-messages.ts`, `chat-read-watermark.ts`, `chat-attachment-picker.ts`, `chat-room-header.tsx`)와 "메시지 id 생성기 crypto 폴백" 결정을 추가한다. 스펙의 `app/_layout.tsx`에 `ToastProvider` 추가 항목은 삭제한다 — heroui-native 1.0.3의 `HeroUINativeProvider`가 `ToastProvider`를 내장하므로(`node_modules/heroui-native/lib/module/providers/hero-ui-native/provider.js`) `useToast`만 쓰면 된다.

```bash
git add docs/superpowers
git commit -m "docs: native 채팅 스펙·플랜을 구현 결과에 맞춰 갱신"
```

- [ ] **Step 6: 사용자 실측 안내(보고에 포함)**

에뮬레이터·실기기에서 확인할 항목을 보고에 나열한다: (1) 목록 진입·배지 (2) 방 진입 시 읽음 처리로 배지 0 (3) 텍스트 전송 낙관적 표시→확정 (4) 두 계정 간 실시간 수신·타이핑 (5) 이미지·PDF 첨부(GCS env 필요) (6) 면접 제안 카드 확정/거절 (7) 연락처 요청 카드 공개/거절 (8) 차단·나가기 Dialog (9) 백그라운드 복귀 후 재조회 (10) 마감 공고 상태 줄.

---

## 병렬 실행 그룹 (subagent-driven-development용)

각 그룹 안의 Task는 서로 다른 파일만 만지므로 서브에이전트를 동시에 띄울 수 있다. 그룹 사이에는 의존이 있어 순서대로 진행한다. 서브에이전트는 커밋하지 않고, 그룹이 끝나면 컨트롤러가 Task 순서대로 커밋한다.

| 그룹 | Task | 근거 |
|---|---|---|
| G1 | 1, 2 | 1은 package.json·lockfile, 2는 web/api 소스 — 파일 겹침 없음. 단 2의 web check-types는 1 완료 후(socket.io-client catalog 참조가 lockfile에 반영돼야 함) 실행 |
| G2 | 3, 4 | 3은 packages/api·web 컴포넌트, 4는 apps/native 순수 함수·vitest — 4는 2가 옮긴 공유 모듈을 import하므로 G1 이후 |
| G3 | 5, 8 | 5는 소켓 싱글턴, 8은 렌더 컴포넌트(훅 의존 없음) — 8은 4의 타입만 필요 |
| G4 | 6, 7, 9 | 6·7은 훅(5 의존), 9는 컴포넌트(3·4·5·7의 `chat-attachment-picker` 타입 의존). 7이 만드는 `chat-attachment-picker.ts`를 9가 import하므로 9는 7의 Step 2 완료 뒤 시작하거나, 9 담당자가 같은 내용으로 먼저 만들지 않도록 7에게만 생성 권한을 준다 |
| G5 | 10, 11 | 두 화면은 파일이 다르다. 10의 `_layout.tsx`(seeker)와 11의 `(tabs)/_layout.tsx`도 다른 파일 |
| G6 | 12 | 단독 |

각 서브에이전트에는 해당 Task 본문 + Global Constraints + Interfaces(Consumes/Produces)만 전달한다. 워크트리 경로 고정: 디스패치 전 컨트롤러가 EnterWorktree 상태여야 Edit 가드가 워크트리를 가리킨다.

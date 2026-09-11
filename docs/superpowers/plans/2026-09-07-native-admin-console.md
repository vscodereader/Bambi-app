# native 운영자 콘솔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** native 앱 `(moderator)` 영역을 검수·신고·사용자 3탭 셸로 재편하고, 각 상세를 web 운영자 콘솔과 동등한 수준(사유 다이얼로그·대상 컨텍스트·제재 이력·탈퇴 복구)으로 구현한다.

**Architecture:** 라벨·심각도·판정 프리셋·기본 사유를 `packages/api/src/services/bambi-moderation-labels.ts`로 승격하고 web은 re-export로 유지한다. native는 employer 탭 셸을 복제해 `(moderator)/(tabs)` 3탭과 상세 Stack 3종을 만들며, 공용 다이얼로그 3종(`ReasonDialog`·`SanctionDialog`·`ConfirmDialog`)으로 모든 상태 변경을 사유 입력 뒤에 호출한다. 데이터는 탭별 독립 쿼리, 상세는 목록 캐시에서 찾는다.

**Tech Stack:** Expo Router, heroui-native(Dialog·RadioGroup·TextArea·Chip·SearchField·useToast), @tanstack/react-query + oRPC 클라이언트(`@/src/lib/orpc`), vitest, biome(ultracite).

**Spec:** `docs/superpowers/specs/2026-09-07-native-admin-console-design.md`

## Global Constraints

- 작업 위치: 워크트리 `C:\Users\user\projects\bambi-app\.claude\worktrees\native-admin`(브랜치 `worktree-native-admin`). 모든 명령은 여기서 실행.
- 빌드·dev 서버·스크린샷 금지. 검증은 린트·타입체크·vitest만. 실기기·에뮬레이터 확인은 별도 단계.
- 린트: `pnpm exec ultracite check <경로...>` (경로 인자 필수, 안 주면 0파일). 자동 수정은 `pnpm exec ultracite fix <경로...>`.
- 타입체크: `pnpm --filter native check-types`, `pnpm --filter @bambi-app/api check-types`, `pnpm --filter web check-types`.
- 새 npm 의존성 추가 금지. 임의 px(`[Npx]`) 금지, Tailwind 스케일 토큰만. DB enum 원값 화면 노출 금지(라벨 맵 경유).
- native UI 작업 전 `.agents/skills/heroui-native/SKILL.md`와 https://docs.uniwind.dev/llms-full.txt 참고(테마는 oklch, SKILL.md의 HSL 표기는 오류).
- Surface `overflow-hidden`에서 borderWidth 런타임 토글 금지(Android 클리핑). 테두리는 상시 두고 색만 바꾼다.
- 사유 길이: `MODERATION_REASON_MIN = 2`, `MODERATION_REASON_MAX = 500`. 서버 스키마 `z.string().min(2).max(500)`와 일치(커뮤니티 조치만 `min(1)`이지만 UI는 2자로 통일).
- 커밋 메시지: 한국어 `type: 제목` + `- ` 블릿 본문(블릿 사이 빈 줄 없음), 멀티라인은 파일에 써서 `git commit -F`. push·PR은 컨트롤러가 한다(서브에이전트 push 금지). `git stash` 금지.
- 서브에이전트는 커밋하지 않는다. 커밋은 컨트롤러가 Task 단위로 순차 수행한다.

---

## 파일 구조

| 경로 | 책임 |
|---|---|
| `packages/api/src/services/bambi-moderation-labels.ts` | 신규. 라벨 맵·심각도·판정·기본 사유·필터 판정·토스트 문구 정본 |
| `packages/api/test/services/bambi-moderation-labels.test.ts` | 신규. 위 모듈 테스트 |
| `apps/web/src/lib/bambi/moderation-labels.ts` | 수정. re-export 껍데기 |
| `apps/web/src/lib/bambi/report-labels.ts` | 수정. re-export 껍데기 |
| `apps/native/src/components/moderation/reason-dialog.tsx` | 신규. 프리셋 선택 + 사유 편집 다이얼로그 |
| `apps/native/src/components/moderation/sanction-dialog.tsx` | 신규. 경고·정지 2단계 다이얼로그 |
| `apps/native/src/components/moderation/confirm-dialog.tsx` | 신규. 되돌리기 어려운 조치 확인 |
| `apps/native/src/components/moderation/filter-chips.tsx` | 신규. 단일 선택 Chip 행 |
| `apps/native/src/components/moderation/moderator-header.tsx` | 신규. 탭 셸 헤더 |
| `apps/native/src/components/moderation/chat-moderation-thread.tsx` | 신규. 읽기 전용 채팅 스레드 |
| `apps/native/src/lib/moderation/queries.ts` | 신규. 목록 쿼리 옵션·invalidate 헬퍼 |
| `apps/native/app/(moderator)/_layout.tsx` | 수정. admin 가드 + Stack에 `(tabs)`·상세 등록 |
| `apps/native/app/(moderator)/(tabs)/_layout.tsx` | 신규. 3탭 |
| `apps/native/app/(moderator)/(tabs)/index.tsx` | 신규. 검수 목록 |
| `apps/native/app/(moderator)/(tabs)/reports.tsx` | 신규. 신고 목록 |
| `apps/native/app/(moderator)/(tabs)/users.tsx` | 신규. 사용자 목록 |
| `apps/native/app/(moderator)/queue/[id].tsx` | 신규. 검수 상세 |
| `apps/native/app/(moderator)/reports/[id].tsx` | 신규. 신고 상세 |
| `apps/native/app/(moderator)/users/[id].tsx` | 신규. 사용자 상세 |
| `apps/native/app/(moderator)/index.tsx`, `reports.tsx`, `users.tsx` | 삭제 |

---

### Task 1: 공유 모듈 승격 (`bambi-moderation-labels`)

**Files:**
- Create: `packages/api/src/services/bambi-moderation-labels.ts`
- Create: `packages/api/test/services/bambi-moderation-labels.test.ts`
- Modify: `apps/web/src/lib/bambi/moderation-labels.ts` (전체 교체)
- Modify: `apps/web/src/lib/bambi/report-labels.ts` (전체 교체)

**Interfaces:**
- Produces (native·web 모두 `@bambi-app/api/services/bambi-moderation-labels`에서 import):
  - 기존 web export 전부 동일 이름: `jobPostStatusLabel`, `REVIEW_STATUS_LABELS`, `reviewStatusLabel`, `accountStatusLabel`, `moderationActionLabel`, `userRoleLabel`, `userGenderLabel`, `riskFlagLabel`, `ReportReason`, `ReportTargetType`, `REPORT_REASON_LABELS`, `REPORT_TARGET_TYPE_LABELS`, `targetTypeLabel`, `reportReasonLabel`
  - 신규: 아래 코드 참조

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// packages/api/test/services/bambi-moderation-labels.test.ts
import { describe, expect, it } from "vitest";

import {
	getReportSeverity,
	matchesUserStatusFilter,
	moderationActionLabel,
	QUEUE_VERDICTS,
	REPORT_SEVERITY_LABELS,
	resolveQueueRiskLevel,
	targetTypeLabel,
} from "@/services/bambi-moderation-labels";

describe("getReportSeverity", () => {
	it("marks safety reasons on open reports as high", () => {
		expect(getReportSeverity("coercion_or_safety", "open")).toBe("high");
		expect(getReportSeverity("underage_concern", "reviewing")).toBe("high");
	});
	it("marks other open reasons as mid", () => {
		expect(getReportSeverity("harassment", "open")).toBe("mid");
	});
	it("marks closed reports as low regardless of reason", () => {
		expect(getReportSeverity("coercion_or_safety", "resolved")).toBe("low");
		expect(getReportSeverity("other", "dismissed")).toBe("low");
	});
	it("has a Korean label for every severity", () => {
		expect(REPORT_SEVERITY_LABELS).toEqual({ high: "높음", low: "참고", mid: "중간" });
	});
});

describe("QUEUE_VERDICTS", () => {
	it("maps verdicts to job post statuses with default reasons", () => {
		expect(QUEUE_VERDICTS.approve.status).toBe("published");
		expect(QUEUE_VERDICTS.hold.status).toBe("on_hold");
		expect(QUEUE_VERDICTS.reject.status).toBe("rejected");
		expect(QUEUE_VERDICTS.reject.danger).toBe(true);
		expect(QUEUE_VERDICTS.approve.reasons).toHaveLength(5);
		expect(QUEUE_VERDICTS.hold.defaultReason.length).toBeGreaterThanOrEqual(2);
	});
});

describe("resolveQueueRiskLevel", () => {
	it("is mid when terms were detected and low otherwise", () => {
		expect(resolveQueueRiskLevel(["x"])).toBe("mid");
		expect(resolveQueueRiskLevel([])).toBe("low");
	});
});

describe("matchesUserStatusFilter", () => {
	const active = { deletedAt: null, status: "active" };
	const deleted = { deletedAt: new Date(), status: "active" };
	it("treats all as pass-through", () => {
		expect(matchesUserStatusFilter(active, "all")).toBe(true);
		expect(matchesUserStatusFilter(deleted, "all")).toBe(true);
	});
	it("matches deleted only by deletedAt", () => {
		expect(matchesUserStatusFilter(deleted, "deleted")).toBe(true);
		expect(matchesUserStatusFilter(active, "deleted")).toBe(false);
	});
	it("excludes withdrawn accounts from status filters", () => {
		expect(matchesUserStatusFilter(active, "active")).toBe(true);
		expect(matchesUserStatusFilter(deleted, "active")).toBe(false);
	});
});

describe("labels keep existing behaviour", () => {
	it("labels a test account creation", () => {
		expect(moderationActionLabel("create_test_account")).toBe("가계정 생성");
	});
	it("falls back for unknown target types", () => {
		expect(targetTypeLabel("nope")).toBe("기타");
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd packages/api && pnpm vitest run test/services/bambi-moderation-labels.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 모듈 작성**

`apps/web/src/lib/bambi/moderation-labels.ts`와 `report-labels.ts`의 내용을 그대로 옮긴 뒤(import 경로는 `./bambi-member-grade-policy`, `./bambi-test-account-policy`로 상대 경로), 아래를 추가한다.

```ts
// packages/api/src/services/bambi-moderation-labels.ts (추가 부분)

// 사유 길이. 서버 스키마(min(2).max(500))와 일치시킨다.
export const MODERATION_REASON_MIN = 2;
export const MODERATION_REASON_MAX = 500;

// 신고 심각도. 안전 직결 사유의 미처리 신고만 높음, 그 외 미처리는 중간, 종료는 참고.
export type ReportSeverity = "high" | "low" | "mid";
export const REPORT_SEVERITY_LABELS: Record<ReportSeverity, string> = {
	high: "높음",
	low: "참고",
	mid: "중간",
};
const HIGH_SEVERITY_REPORT_REASONS = new Set<string>([
	"illegal_or_prohibited_content",
	"coercion_or_safety",
	"underage_concern",
]);
export const OPEN_REPORT_STATUSES = new Set<string>(["open", "reviewing"]);
export function getReportSeverity(reason: string, status: string): ReportSeverity {
	if (!OPEN_REPORT_STATUSES.has(status)) {
		return "low";
	}
	return HIGH_SEVERITY_REPORT_REASONS.has(reason) ? "high" : "mid";
}
export const REPORT_STATUS_LABELS: Record<string, string> = {
	open: "접수",
	reviewing: "검토 중",
	resolved: "조치 완료",
	dismissed: "기각",
};
export function reportStatusLabel(status: string): string {
	return REPORT_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 검수 위험도. 무조건 검수 체제라 감지 0건이 다수 — 감지 유무로만 가른다(web과 동일).
export type QueueRiskLevel = "low" | "mid";
export const QUEUE_RISK_LABELS: Record<QueueRiskLevel, string> = {
	low: "감지 없음",
	mid: "감지됨",
};
export function resolveQueueRiskLevel(detectedTerms: readonly string[]): QueueRiskLevel {
	return detectedTerms.length > 0 ? "mid" : "low";
}

// 판정 → 상태·기본 사유·프리셋. web VerdictReasonSheet/QUEUE_VERDICT_STATUS와 같은 문구.
export type QueueVerdict = "approve" | "hold" | "reject";
export interface QueueVerdictConfig {
	confirmLabel: string;
	danger: boolean;
	defaultReason: string;
	description: string;
	label: string;
	reasons: readonly string[];
	status: "on_hold" | "published" | "rejected";
	title: string;
	toast: string;
}
export const QUEUE_VERDICTS: Record<QueueVerdict, QueueVerdictConfig> = {
	approve: {
		confirmLabel: "승인하기",
		danger: false,
		defaultReason: "운영자가 공고를 승인했습니다.",
		description:
			"승인하면 무료 공고는 바로 게시되고, 유료 상품 공고는 입금 확인 후 게시돼요. 사유는 처리 기록에 남아요.",
		label: "승인",
		reasons: [
			"운영 검수 기준 충족",
			"감지 표현이 오해 소지 수준",
			"업소 정보 확인 완료",
			"보완 요청 반영 확인",
			"기타 승인 사유",
		],
		status: "published",
		title: "승인 사유 작성",
		toast: "공고를 승인했어요",
	},
	hold: {
		confirmLabel: "보류하기",
		danger: false,
		defaultReason: "운영자가 추가 확인을 위해 공고를 보류했습니다.",
		description:
			"보류하면 공고가 검수 보류 상태로 내려가고, 사유가 기록돼요. 공고 관리의 '검수 보류' 탭에서 다시 처리할 수 있어요.",
		label: "보류",
		reasons: [
			"업소 정보 추가 확인 필요",
			"사업자 인증 확인 필요",
			"공고 내용 보완 요청 예정",
			"내부 논의 필요",
			"기타 확인 필요",
		],
		status: "on_hold",
		title: "보류 사유 작성",
		toast: "공고를 보류했어요",
	},
	reject: {
		confirmLabel: "반려하기",
		danger: true,
		defaultReason: "운영자가 정책 위반으로 공고를 반려했습니다.",
		description: "작성한 사유는 처리 기록에 그대로 남아요.",
		label: "반려",
		reasons: [
			"성적 서비스 암시 표현",
			"강요·착취 의심 조건",
			"외부 연락 유도",
			"허위·과장 정보",
			"기타 정책 위반",
		],
		status: "rejected",
		title: "반려 사유 작성",
		toast: "공고를 반려했어요",
	},
};

// 신고 처리 기본 사유·토스트.
export const REPORT_DISMISS_DEFAULT_REASON = "운영자가 신고를 기각했습니다.";
export const REPORT_RESOLVE_DEFAULT_REASON = "운영자가 신고 조치를 완료했습니다.";
export const REPORT_TOASTS = {
	dismissed: "신고를 기각했어요",
	resolved: "조치를 적용했어요",
	failed: "신고 상태를 API에 반영하지 못했어요. 다시 시도해 주세요.",
} as const;

// 사용자 제재. status는 account_status enum.
export type SanctionStatus = "suspended" | "warned";
export interface SanctionChoice {
	danger: boolean;
	defaultReason: string;
	description: string;
	label: string;
	status: SanctionStatus;
}
export const SANCTION_CHOICES: readonly SanctionChoice[] = [
	{
		danger: false,
		defaultReason: "정책 안내와 함께 경고를 보냈어요",
		description: "정책 안내와 함께 경고를 기록해요. 누적 시 이용이 제한될 수 있어요.",
		label: "경고",
		status: "warned",
	},
	{
		danger: true,
		defaultReason: "정책 위반이 확인되어 이용을 정지했어요",
		description: "즉시 이용이 정지돼요. 자동 해제는 없어요.",
		label: "정지",
		status: "suspended",
	},
];
export const USER_RESTORE_ACTIVE_REASON = "계정을 정상으로 복구했어요";
export const WARNING_REVERT_DEFAULT_REASON = "운영자가 잘못 부여된 최근 경고를 되돌렸습니다.";
export const ACCOUNT_RESTORE_DEFAULT_REASON = "본인 요청으로 탈퇴를 되돌렸어요";
export const LEGAL_ADVISOR_ASSIGN_REASON = "무료 법률 자문 답변을 맡기려고 지정했어요";
export const LEGAL_ADVISOR_RELEASE_REASON = "법률 자문 활동이 끝나 지정을 해제했어요";
export const USER_TOASTS = {
	failed: "사용자 상태를 API에 반영하지 못했어요. 다시 시도해 주세요.",
	legalAdvisorAssigned: "법률자문으로 지정했어요",
	legalAdvisorReleased: "법률자문 지정을 해제했어요",
	restored: "탈퇴를 복구했어요. 본인이 기존 아이디로 다시 로그인할 수 있어요",
	warningReverted: "최근 경고 1회를 되돌렸어요",
} as const;

// 사용자 목록 상태 필터. deleted는 탈퇴 여부, 나머지는 미탈퇴 + status 일치.
export type UserStatusFilter = "active" | "all" | "deleted" | "suspended" | "warned";
export const USER_STATUS_FILTER_LABELS: Record<UserStatusFilter, string> = {
	active: "정상",
	all: "전체",
	deleted: "탈퇴",
	suspended: "정지",
	warned: "경고",
};
export function matchesUserStatusFilter(
	user: { deletedAt: Date | null | string; status: string },
	filter: UserStatusFilter
): boolean {
	if (filter === "all") {
		return true;
	}
	if (filter === "deleted") {
		return user.deletedAt !== null;
	}
	return user.deletedAt === null && user.status === filter;
}

// 커뮤니티 글·댓글 상태별 조치.
export type CommunityContentStatus = "deleted" | "hidden" | "published";
export const CONTENT_STATUS_LABELS: Record<CommunityContentStatus, string> = {
	deleted: "삭제됨",
	hidden: "숨김",
	published: "게시중",
};
export interface CommunityAction {
	confirm: boolean;
	danger: boolean;
	label: string;
	status: CommunityContentStatus;
}
export const COMMUNITY_ACTIONS: Record<CommunityContentStatus, readonly CommunityAction[]> = {
	deleted: [{ confirm: false, danger: false, label: "복구", status: "published" }],
	hidden: [
		{ confirm: false, danger: false, label: "복구", status: "published" },
		{ confirm: true, danger: true, label: "삭제", status: "deleted" },
	],
	published: [
		{ confirm: false, danger: false, label: "숨기기", status: "hidden" },
		{ confirm: true, danger: true, label: "삭제", status: "deleted" },
	],
};
export function communityActionToast(kind: "comment" | "post", status: CommunityContentStatus): string {
	const noun = kind === "post" ? "글을" : "댓글을";
	if (status === "published") {
		return "복구했어요.";
	}
	return status === "hidden" ? `${noun} 숨겼어요.` : `${noun} 삭제했어요.`;
}
export const CHAT_ROOM_BLOCK_TOASTS = {
	blocked: "대화방을 차단했어요",
	failed: "대화방 차단 상태를 반영하지 못했어요. 다시 시도해 주세요.",
	unblocked: "대화방 차단을 해제했어요",
} as const;
```

- [ ] **Step 4: web 라벨 파일을 re-export로 교체**

```ts
// apps/web/src/lib/bambi/moderation-labels.ts
// 정본은 packages/api 서비스로 옮겨 native와 공유한다(notification-labels와 같은 경로 호환용 재수출).
// biome-ignore lint/performance/noBarrelFile: 정본(packages/api) 이전에 따른 경로 호환용 재수출.
export {
	accountStatusLabel,
	jobPostStatusLabel,
	moderationActionLabel,
	REVIEW_STATUS_LABELS,
	reviewStatusLabel,
	riskFlagLabel,
	userGenderLabel,
	userRoleLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
```

```ts
// apps/web/src/lib/bambi/report-labels.ts
export type {
	ReportReason,
	ReportTargetType,
} from "@bambi-app/api/services/bambi-moderation-labels";
// biome-ignore lint/performance/noBarrelFile: 정본(packages/api) 이전에 따른 경로 호환용 재수출.
export {
	REPORT_REASON_LABELS,
	REPORT_TARGET_TYPE_LABELS,
	reportReasonLabel,
	targetTypeLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd packages/api && pnpm vitest run test/services/bambi-moderation-labels.test.ts`
Expected: PASS
Run: `cd apps/web && pnpm vitest run src/lib/bambi/moderation-labels.test.ts`
Expected: PASS (무수정)

- [ ] **Step 6: 린트·타입체크**

Run: `pnpm exec ultracite check packages/api/src/services/bambi-moderation-labels.ts packages/api/test/services/bambi-moderation-labels.test.ts apps/web/src/lib/bambi/moderation-labels.ts apps/web/src/lib/bambi/report-labels.ts`
Run: `pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types`
Expected: 오류 0

- [ ] **Step 7: 커밋** (컨트롤러)

`refactor: 운영 라벨·판정 규칙을 packages/api 공유 모듈로 승격`

---

### Task 2: 탭 셸·헤더·쿼리 헬퍼

**Files:**
- Modify: `apps/native/app/(moderator)/_layout.tsx`
- Create: `apps/native/app/(moderator)/(tabs)/_layout.tsx`
- Create: `apps/native/src/components/moderation/moderator-header.tsx`
- Create: `apps/native/src/lib/moderation/queries.ts`
- Create(임시 골격, Task 3~5에서 교체): `apps/native/app/(moderator)/(tabs)/index.tsx`, `reports.tsx`, `users.tsx` — 기존 `(moderator)/index.tsx`, `reports.tsx`, `users.tsx`를 `git mv`로 `(tabs)/` 아래로 옮긴다(내용은 그대로, Task 3~5에서 재작성).

**Interfaces:**
- Produces:
  - `ModeratorHomeHeader(): JSX.Element`
  - `queueListOptions()`, `reportListOptions()`, `userListOptions()` — `orpc...queryOptions` 반환. 각각 입력 `{ limit: 50, status: "pending_review" }`, `{ limit: 50 }`, `{ limit: 1000 }` 고정.
  - `useInvalidateModeration(): { queue(): Promise<void>; reports(): Promise<void>; users(targetUserId?: string): Promise<void> }`

- [ ] **Step 1: 헤더 작성**

```tsx
// apps/native/src/components/moderation/moderator-header.tsx
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";
import { RoleSwitchMenu } from "@/src/components/role-switch-menu";

// 운영자 탭 셸 홈 헤더. EmployerHomeHeader와 같은 구조(안전영역·h-14·로고+워드마크·역할 전환).
export function ModeratorHomeHeader() {
	const insets = useSafeAreaInsets();
	return (
		<View className="border-border border-b bg-background" style={{ paddingTop: insets.top }}>
			<View className="h-14 flex-row items-center justify-between px-4">
				<View className="flex-row items-center gap-2">
					<BambiLogo />
					<Text className="font-extrabold text-foreground text-xl">밤비알바 운영</Text>
				</View>
				<RoleSwitchMenu currentArea="/(moderator)" />
			</View>
		</View>
	);
}
```

- [ ] **Step 2: 탭 레이아웃 작성**

`apps/native/app/(employer)/(tabs)/_layout.tsx`를 복사해 다음만 바꾼다: 컴포넌트명 `ModeratorTabsLayout`, 헤더 `ModeratorHomeHeader`, 탭 3개 `index`(`shield-checkmark`/`shield-checkmark-outline`, "검수"), `reports`(`flag`/`flag-outline`, "신고"), `users`(`people`/`people-outline`, "사용자"). `TAB_BAR_CONTENT_HEIGHT`·`tabIcon`·색 훅은 그대로.

- [ ] **Step 3: 루트 레이아웃 수정**

`apps/native/app/(moderator)/_layout.tsx`의 admin 가드는 유지하고 Stack 부분만 교체:

```tsx
	return (
		<Stack>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen name="queue/[id]" options={{ title: "공고 검수" }} />
			<Stack.Screen name="reports/[id]" options={{ title: "신고 상세" }} />
			<Stack.Screen name="users/[id]" options={{ title: "사용자 상세" }} />
		</Stack>
	);
```

`RoleSwitchMenu` import와 `headerRight`는 제거한다(헤더가 맡는다).

- [ ] **Step 4: 쿼리 헬퍼 작성**

```ts
// apps/native/src/lib/moderation/queries.ts
import { useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/src/lib/orpc";

export const QUEUE_LIST_INPUT = { limit: 50, status: "pending_review" } as const;
export const REPORT_LIST_INPUT = { limit: 50 } as const;
export const USER_LIST_INPUT = { limit: 1000 } as const;

export const queueListOptions = () =>
	orpc.bambi.moderation.listJobPosts.queryOptions({ input: QUEUE_LIST_INPUT });
export const reportListOptions = () =>
	orpc.bambi.moderation.listReports.queryOptions({ input: REPORT_LIST_INPUT });
export const userListOptions = () =>
	orpc.bambi.moderation.listUsers.queryOptions({ input: USER_LIST_INPUT });

// 상태 변경 성공 후 목록을 다시 읽는다. 사용자 변경은 해당 사용자의 제재 이력도 함께.
export function useInvalidateModeration() {
	const queryClient = useQueryClient();
	return {
		queue: () => queryClient.invalidateQueries({ queryKey: queueListOptions().queryKey }),
		reports: () => queryClient.invalidateQueries({ queryKey: reportListOptions().queryKey }),
		users: async (targetUserId?: string) => {
			await queryClient.invalidateQueries({ queryKey: userListOptions().queryKey });
			if (targetUserId) {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listUserModerationActions.key({
						input: { targetUserId },
					}),
				});
			}
		},
	};
}
```

`listUserModerationActions.key`의 정확한 시그니처는 `apps/native/src/lib/orpc.ts`와 기존 사용처(`grep -rn "\.key(" apps/native/src`)에서 확인해 맞춘다.

- [ ] **Step 5: 기존 화면 이동**

Run: `git mv "apps/native/app/(moderator)/index.tsx" "apps/native/app/(moderator)/(tabs)/index.tsx"` 등 3개. `index.tsx` 안의 `Link href="/(moderator)/reports"`·`users` 버튼과 `LogoutButton`은 제거한다(탭이 대신한다).

- [ ] **Step 6: 린트·타입체크**

Run: `pnpm exec ultracite check "apps/native/app/(moderator)" apps/native/src/components/moderation apps/native/src/lib/moderation && pnpm --filter native check-types`
Expected: 오류 0

- [ ] **Step 7: 커밋** (컨트롤러)

`feat(native): 운영자 영역을 검수·신고·사용자 3탭 셸로 재편`

---

### Task 3: 공용 다이얼로그·필터 칩

**Files:**
- Create: `apps/native/src/components/moderation/reason-dialog.tsx`
- Create: `apps/native/src/components/moderation/sanction-dialog.tsx`
- Create: `apps/native/src/components/moderation/confirm-dialog.tsx`
- Create: `apps/native/src/components/moderation/filter-chips.tsx`

**Interfaces:**
- Produces:

```ts
export interface ReasonDialogProps {
	confirmLabel: string;
	danger?: boolean;
	defaultReason: string;          // TextArea 초기값(빈 문자열 허용)
	description?: string;
	isOpen: boolean;
	onConfirm: (reason: string) => Promise<boolean>; // false면 열어둔 채 errorMessage 표시
	onOpenChange: (open: boolean) => void;
	presets?: readonly string[];    // 있으면 RadioGroup, 선택 시 TextArea에 채움
	title: string;
}
export function ReasonDialog(props: ReasonDialogProps): JSX.Element;

export interface SanctionDialogProps {
	isOpen: boolean;
	onConfirm: (status: SanctionStatus, reason: string) => Promise<boolean>;
	onOpenChange: (open: boolean) => void;
	targetName: string;
}
export function SanctionDialog(props: SanctionDialogProps): JSX.Element;

export interface ConfirmDialogProps {
	confirmLabel: string;
	danger?: boolean;
	description: string;
	isOpen: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	title: string;
}
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element;

export interface FilterChipOption<T extends string> { label: string; value: T }
export function FilterChips<T extends string>(props: {
	onChange: (value: T) => void;
	options: readonly FilterChipOption<T>[];
	value: T;
}): JSX.Element;
```

- [ ] **Step 1: ReasonDialog 작성**

`apps/native/src/components/report-dialog.tsx`의 Dialog + KeyboardAvoidingView + RadioGroup + TextArea 골격을 따른다. 핵심 로직:

```tsx
const [reason, setReason] = useState(defaultReason);
const [preset, setPreset] = useState<string | null>(null);
const [errorMessage, setErrorMessage] = useState<string | null>(null);
const [isPending, setIsPending] = useState(false);
const trimmed = reason.trim();
const isTooShort = trimmed.length < MODERATION_REASON_MIN;

const handleOpenChange = (next: boolean) => {
	if (!next) { setReason(defaultReason); setPreset(null); setErrorMessage(null); }
	onOpenChange(next);
};
const handlePreset = (value: string) => { setPreset(value); setReason(value); };
const handleChangeText = (text: string) => setReason(text.slice(0, MODERATION_REASON_MAX));
const handleConfirm = async () => {
	if (isTooShort || isPending) { return; }
	setIsPending(true);
	setErrorMessage(null);
	const ok = await onConfirm(trimmed);
	setIsPending(false);
	if (ok) { handleOpenChange(false); } else { setErrorMessage("처리하지 못했어요. 사유를 확인하고 다시 시도해 주세요."); }
};
```

렌더: 제목·설명, `presets`가 있으면 `RadioGroup value={preset}`로 항목 나열, `TextArea value={reason} placeholder="위 선택지를 고르거나 직접 작성해 주세요(2자 이상)."`, 그 아래 `Text className="text-muted text-xs"`로 `{trimmed.length}/{MODERATION_REASON_MAX}`, `errorMessage`가 있으면 `text-danger`, 버튼 행은 취소(`variant="tertiary"`)와 확정(`variant={danger ? "danger" : "primary"}`, `isDisabled={isTooShort || isPending}`). `onConfirm`이 throw하면 catch해서 `error.message`를 errorMessage로 보인다.

- [ ] **Step 2: SanctionDialog 작성**

1단계: `Dialog.Title`은 `${targetName} 제재`, `SANCTION_CHOICES`를 세로 버튼 2개로(정지는 `variant="danger"`, 경고는 `variant="secondary"`), 각 아래 `description`. 선택하면 `picked` state에 저장. 2단계: `picked`가 있으면 같은 Dialog 안에서 `ReasonDialog`와 동일한 사유 편집 UI를 렌더(간단히 하기 위해 `ReasonDialog`의 본문을 `ReasonForm`으로 분리해 두 다이얼로그가 공유한다 — `reason-dialog.tsx`에서 `export function ReasonForm(props)`). "뒤로" 버튼은 `picked`를 null로. 확정은 `onConfirm(picked.status, reason)`. 닫힘 시 `picked` 초기화.

- [ ] **Step 3: ConfirmDialog 작성**

`apps/native/app/(employer)/(tabs)/index.tsx`의 `DeleteJobDialog` 패턴. 제목·설명·취소·확정(`danger`면 `variant="danger"`).

- [ ] **Step 4: FilterChips 작성**

```tsx
import { Chip } from "heroui-native";
import { ScrollView, Pressable } from "react-native";

export function FilterChips<T extends string>({ onChange, options, value }: {...}) {
	return (
		<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 py-2">
			{options.map((option) => (
				<Pressable accessibilityRole="button" accessibilityState={{ selected: option.value === value }} key={option.value} onPress={() => onChange(option.value)}>
					<Chip color={option.value === value ? "accent" : "default"} variant={option.value === value ? "primary" : "soft"}>
						<Chip.Label>{option.label}</Chip.Label>
					</Chip>
				</Pressable>
			))}
		</ScrollView>
	);
}
```

`Chip`의 `color` 허용값은 `apps/native/src/components/chat/chat-room-list-item.tsx`의 `RoomStatusChip`과 heroui SKILL.md에서 확인해 맞춘다(`accent`가 없으면 `primary`).

- [ ] **Step 5: 린트·타입체크**

Run: `pnpm exec ultracite check apps/native/src/components/moderation && pnpm --filter native check-types`

- [ ] **Step 6: 커밋** (컨트롤러)

`feat(native): 운영 사유·제재·확인 다이얼로그와 필터 칩 추가`

---

### Task 4: 공고 검수 목록·상세

**Files:**
- Rewrite: `apps/native/app/(moderator)/(tabs)/index.tsx`
- Create: `apps/native/app/(moderator)/queue/[id].tsx`

**Interfaces:**
- Consumes: Task 1 `QUEUE_VERDICTS`, `resolveQueueRiskLevel`, `QUEUE_RISK_LABELS`, `riskFlagLabel`, `jobPostStatusLabel`; Task 2 `queueListOptions`, `useInvalidateModeration`; Task 3 `ReasonDialog`, `FilterChips`; 기존 `BambiScreen`·`Pill`·`StateCard`·`LoadingState`·`ErrorState`·`formatPay`·`formatDateTime`(`@/src/components/bambi-screen`), `JobDescriptionSection`(`@/src/components/job-description-section`), `env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL`(`@bambi-app/env/native`), `useToast`(heroui-native).
- Produces: 라우트 `/(moderator)/queue/[id]`.

- [ ] **Step 1: 목록 작성**

```tsx
type RiskFilter = "all" | QueueRiskLevel;
type SortKey = "oldest" | "recent" | "risk";
const RISK_OPTIONS = [{ label: "전체", value: "all" }, { label: "감지됨", value: "mid" }, { label: "감지 없음", value: "low" }] as const;
const SORT_OPTIONS = [{ label: "접수순", value: "oldest" }, { label: "최신순", value: "recent" }, { label: "감지 우선", value: "risk" }] as const;

const jobs = useMemo(() => {
	const rows = (queueQuery.data ?? []).map((job) => ({ job, risk: resolveQueueRiskLevel(job.detectedTerms) }));
	const filtered = risk === "all" ? rows : rows.filter((row) => row.risk === risk);
	return [...filtered].sort((a, b) => {
		if (sort === "risk" && a.risk !== b.risk) { return a.risk === "mid" ? -1 : 1; }
		const diff = new Date(a.job.createdAt).getTime() - new Date(b.job.createdAt).getTime();
		return sort === "recent" ? -diff : diff;
	});
}, [queueQuery.data, risk, sort]);
```

렌더: `BambiHeader title="공고 검수" description="검수 대기 공고를 승인, 보류, 반려 처리합니다."`, `FilterChips` 두 줄, `FlatList data={jobs} keyExtractor={(row) => row.job.id} refreshControl={<RefreshControl refreshing={queueQuery.isRefetching} onRefresh={() => queueQuery.refetch()} />}`. 행은 `Pressable onPress={() => router.push(`/(moderator)/queue/${job.id}` as Href)}` 안 `Surface variant="secondary" className="gap-2 rounded-lg p-4"`: 업소명(`text-muted text-xs`), 제목(`font-bold text-foreground text-base`), Pill 행(`Pill tone={risk === "mid" ? "warning" : "neutral"}`로 `QUEUE_RISK_LABELS[risk]`, `Pill`로 지역), 감지 문구 `detectedTerms.slice(0, 3).join(", ")` 또는 "감지된 문구 없음", 하단 `formatDateTime(createdAt) · #${id.slice(0, 8)}`. 로딩·에러·빈 상태는 기존 `LoadingState`·`ErrorState`·`StateCard`.

- [ ] **Step 2: 상세 작성**

```tsx
const { id } = useLocalSearchParams<{ id: string }>();
const queueQuery = useQuery(queueListOptions());
const item = queueQuery.data?.find((job) => job.id === id);
const detailQuery = useQuery({ ...orpc.bambi.moderation.getJobPostForAdmin.queryOptions({ input: { jobPostId: id } }), enabled: Boolean(item) });
const [verdict, setVerdict] = useState<QueueVerdict | null>(null);
const invalidate = useInvalidateModeration();
const { toast } = useToast();
const setStatus = useMutation(orpc.bambi.moderation.setJobPostStatus.mutationOptions());

const handleConfirm = async (reason: string) => {
	if (!(verdict && item)) { return false; }
	try {
		await setStatus.mutateAsync({ jobPostId: item.id, reason, status: QUEUE_VERDICTS[verdict].status });
	} catch { return false; }
	await invalidate.queue();
	toast.show({ label: QUEUE_VERDICTS[verdict].toast });
	router.back();
	return true;
};
```

렌더 순서(ScrollView, 하단 고정 바 높이만큼 `pb-24`):
1. 헤더 Surface: 업소명·제목·`Pill` 지역·`formatPay(payAmount, payUnit)`·`formatDateTime(createdAt)`·`#id8`.
2. 위험 플래그: `item.riskFlags.map(riskFlagLabel)`를 `Pill tone="danger"`로, 없으면 생략.
3. 감지 문구: `detectedTerms`가 있으면 `Surface`에 "감지된 표현" 제목 + 각 문구를 `Pill tone="warning"`으로.
4. 본문: `detailQuery.data`가 있으면 `<JobDescriptionSection description={data.description} descriptionBlocks={data.descriptionBlocks} detail={data.media.detail} gcsPublicBaseUrl={env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL} title={data.title} />` (본문 블록과 상세 이미지를 함께 그린다). 로딩 중이면 `LoadingState label="공고 본문을 불러오고 있습니다."`, 실패면 `ErrorState onRetry`.
5. 대표 이미지: `data.media.cover`가 있으면 `resolveJobCoverUri` 또는 `publicObjectUri(storageKey)`(`@/src/lib/bambi-native`)로 `Image` 렌더, 탭하면 `Dialog`로 전체 화면 확대(`Dialog.Content`에 `Image resizeMode="contain"`).
6. 안내 문구: `QUEUE_VERDICTS[verdict]?.description`는 다이얼로그에서 보이므로 여기서는 "판정은 처리 기록에 남아요." 한 줄.

하단 고정 바(`absolute bottom-0 inset-x-0 border-border border-t bg-background p-4 flex-row gap-2`, 안전영역 하단 패딩): 승인(`variant="primary"`), 보류(`secondary`), 반려(`danger`). 각각 `setVerdict("approve"|"hold"|"reject")`.

`ReasonDialog`: `isOpen={verdict !== null}`, `onOpenChange={(o) => !o && setVerdict(null)}`, `title/description/confirmLabel/danger/presets=reasons/defaultReason`을 `QUEUE_VERDICTS[verdict]`에서.

`item`이 없고 `queueQuery`가 로딩이 아니면 `StateCard title="검수 공고를 찾을 수 없어요"` + `Button onPress={() => router.back()}` "목록으로".

- [ ] **Step 3: 린트·타입체크**

Run: `pnpm exec ultracite check "apps/native/app/(moderator)/(tabs)/index.tsx" "apps/native/app/(moderator)/queue" && pnpm --filter native check-types`

- [ ] **Step 4: 커밋** (컨트롤러)

`feat(native): 공고 검수 목록 필터·정렬과 사유 다이얼로그 상세 구현`

---

### Task 5: 사용자 목록·상세

**Files:**
- Rewrite: `apps/native/app/(moderator)/(tabs)/users.tsx`
- Create: `apps/native/app/(moderator)/users/[id].tsx`

**Interfaces:**
- Consumes: Task 1 `matchesUserStatusFilter`, `USER_STATUS_FILTER_LABELS`, `UserStatusFilter`, `userRoleLabel`, `accountStatusLabel`, `moderationActionLabel`, `CONTENT_STATUS_LABELS`, `SANCTION_CHOICES`, `USER_RESTORE_ACTIVE_REASON`, `WARNING_REVERT_DEFAULT_REASON`, `ACCOUNT_RESTORE_DEFAULT_REASON`, `LEGAL_ADVISOR_*_REASON`, `USER_TOASTS`; Task 2 `userListOptions`, `useInvalidateModeration`; Task 3 `SanctionDialog`, `ReasonDialog`, `FilterChips`; 기존 `accountStatusBadge`(`@/src/lib/bambi-native`), `FieldSelect`(`@/src/components/field-select`), `SearchField`(heroui-native) + 디바운스(`apps/native/app/(seeker)/search.tsx`의 `useDebouncedValue`를 `apps/native/src/lib/use-debounced-value.ts`로 옮겨 양쪽이 import).
- Produces: 라우트 `/(moderator)/users/[id]`. 신고 상세(Task 6)가 push한다.

- [ ] **Step 1: 디바운스 훅 이동**

`search.tsx`의 `useDebouncedValue`를 `apps/native/src/lib/use-debounced-value.ts`로 옮기고 `search.tsx`는 import로 바꾼다.

- [ ] **Step 2: 목록 작성**

```tsx
const ROLE_OPTIONS = [
	{ label: "전체 역할", value: "all" }, { label: "구직자", value: "job_seeker" }, { label: "법률자문", value: "legal_advisor" },
	{ label: "구인자", value: "employer" }, { label: "운영자", value: "admin" },
] as const;
const STATUS_OPTIONS = (["all", "active", "warned", "suspended", "deleted"] as const).map((value) => ({ label: USER_STATUS_FILTER_LABELS[value], value }));

const keyword = useDebouncedValue(query, 250).trim().toLowerCase();
const users = useMemo(() => (usersQuery.data ?? [])
	.filter((user) => matchesUserStatusFilter(user, status))
	.filter((user) => role === "all" || user.role === role)
	.filter((user) => keyword.length === 0 || [user.name, user.email, user.loginId].some((v) => (v ?? "").toLowerCase().includes(keyword)))
	.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
[usersQuery.data, status, role, keyword]);
```

렌더: `BambiHeader title="사용자 관리"`, `SearchField`(placeholder "이름·이메일·아이디 검색"), `FilterChips` 상태, `FieldSelect label="역할" isLabelHidden options={ROLE_OPTIONS} value={role} onChange={setRole} placeholder="전체 역할"`, `FlatList` + `RefreshControl`. 행: 이름(또는 email), `accountStatusBadge(user.status)`의 label·tone으로 `Pill`(탈퇴는 `deletedAt`이 있으면 `Pill tone="neutral"` "탈퇴"), `userRoleLabel(user.role)`, `신고 ${reportsCount}건 · 경고 ${warningsCount}회`. `Pressable` → `/(moderator)/users/${userId}`.

- [ ] **Step 3: 상세 작성**

```tsx
const { id } = useLocalSearchParams<{ id: string }>();
const usersQuery = useQuery(userListOptions());
const user = usersQuery.data?.find((u) => u.userId === id);
const [dialog, setDialog] = useState<"legal" | "restore" | "revert" | "sanction" | null>(null);
const invalidate = useInvalidateModeration();
const { toast } = useToast();
const setUserStatus = useMutation(orpc.bambi.moderation.setUserStatus.mutationOptions());
const revertWarning = useMutation(orpc.bambi.moderation.revertLatestWarning.mutationOptions());
const setUserRole = useMutation(orpc.bambi.moderation.setUserRole.mutationOptions());
const restoreAccount = useMutation(orpc.bambi.accountRecovery.restoreWithdrawnAccount.mutationOptions());

// 공통: 성공 시 true, 실패 시 서버 메시지를 throw(ReasonDialog가 표시).
const run = async (fn: () => Promise<unknown>, successToast: string, after?: () => void) => {
	await fn();
	await invalidate.users(id);
	toast.show({ label: successToast });
	after?.();
	return true;
};
```

`accountRecovery` 라우터 경로명은 `packages/api/src/routers/index.ts`에서 확인해 맞춘다(`orpc.bambi.accountRecovery` 또는 다른 키).

렌더 순서:
1. 프로필 Surface: 이름, `Pill`(상태), `userRoleLabel(role)`, loginId, email, 전화 인증(`isPhoneVerified ? "인증됨" : "미인증"`), `formatDateTime(createdAt)`, `organizationNames.join(", ")`(있을 때).
2. 액션 Surface(버튼 세로 스택, `deletedAt`이 없을 때만):
   - "제재 적용" → `setDialog("sanction")`. `SanctionDialog onConfirm={(status, reason) => run(() => setUserStatus.mutateAsync({ targetUserId: id, status, reason }), SANCTION_CHOICES.find(c => c.status === status)!.label + " 처리했어요", () => router.back())}`.
   - `status !== "active"`면 "정상으로 복구"(`secondary`): 즉시 `run(() => setUserStatus.mutateAsync({ targetUserId: id, status: "active", reason: USER_RESTORE_ACTIVE_REASON }), USER_RESTORE_ACTIVE_REASON)`. 실패는 `toast.show({ label: USER_TOASTS.failed, variant: "danger" })`.
   - `warningsCount > 0`면 "최근 경고 1회 되돌리기" → `ReasonDialog defaultReason={WARNING_REVERT_DEFAULT_REASON} title="경고 되돌리기" confirmLabel="되돌리기"` → `revertWarning.mutateAsync({ targetUserId: id, reason })`, 토스트 `USER_TOASTS.warningReverted`.
   - `role === "job_seeker"`면 "법률자문 지정", `role === "legal_advisor"`면 "법률자문 해제" → `ReasonDialog`(기본 사유 각각 `LEGAL_ADVISOR_ASSIGN_REASON`/`LEGAL_ADVISOR_RELEASE_REASON`) → `setUserRole.mutateAsync({ targetUserId: id, role: 반대 역할, reason })`, 토스트 `USER_TOASTS.legalAdvisorAssigned`/`Released`.
3. 제재 이력 Surface: `useInfiniteQuery`가 아니라 `page` state로 `listUserModerationActions({ targetUserId: id, page, pageSize: 5 })`를 페이지별 `useQuery`하고 결과를 `items` 누적 state에 이어 붙인다(`useEffect`로 data 도착 시 append, page가 1이면 교체). 각 행: `moderationActionLabel(action)`, reason, adminName, `formatDateTime(createdAt)`. `items.length < totalCount`면 "더 보기" 버튼으로 `page + 1`.
4. 콘텐츠 이력 Surface: `FilterChips`(전체·글·댓글 → filter `all|post|comment`), `contentHistory.listAdminMemberContent({ userId: id, filter, page, pageSize: 5 })` 같은 누적 방식. 행: `kind === "post" ? "글" : "댓글"` Pill, title 또는 body 앞 60자, `CONTENT_STATUS_LABELS[status]`, 시각. `contentHistory` 라우터 키도 `routers/index.ts`에서 확인.
5. 탈퇴 패널(`deletedAt`이 있을 때만): `purgedAt`이면 `StateCard title="복구할 수 없어요" description="개인정보 파기가 완료된 계정이에요."`. 아니면 "탈퇴 복구" 버튼 → `ReasonDialog defaultReason={ACCOUNT_RESTORE_DEFAULT_REASON}` → `restoreAccount.mutateAsync({ targetUserId: id, reason })`, 토스트 `USER_TOASTS.restored`, 상세 유지(뒤로가기 없음).

`user`가 없으면 `StateCard title="사용자를 찾을 수 없어요"` + "목록으로".

- [ ] **Step 4: 린트·타입체크**

Run: `pnpm exec ultracite check "apps/native/app/(moderator)/(tabs)/users.tsx" "apps/native/app/(moderator)/users" "apps/native/app/(seeker)/search.tsx" apps/native/src/lib/use-debounced-value.ts && pnpm --filter native check-types`

- [ ] **Step 5: 커밋** (컨트롤러)

`feat(native): 사용자 관리 검색·필터 목록과 제재·이력·복구 상세 구현`

---

### Task 6: 신고 목록·상세·채팅 스레드

**Files:**
- Rewrite: `apps/native/app/(moderator)/(tabs)/reports.tsx`
- Create: `apps/native/app/(moderator)/reports/[id].tsx`
- Create: `apps/native/src/components/moderation/chat-moderation-thread.tsx`

**Interfaces:**
- Consumes: Task 1 `getReportSeverity`, `REPORT_SEVERITY_LABELS`, `OPEN_REPORT_STATUSES`, `reportStatusLabel`, `reportReasonLabel`, `targetTypeLabel`, `userRoleLabel`, `jobPostStatusLabel`, `reviewStatusLabel`, `accountStatusLabel`, `COMMUNITY_ACTIONS`, `CONTENT_STATUS_LABELS`, `communityActionToast`, `REPORT_DISMISS_DEFAULT_REASON`, `REPORT_RESOLVE_DEFAULT_REASON`, `REPORT_TOASTS`, `CHAT_ROOM_BLOCK_TOASTS`; Task 2 `reportListOptions`, `useInvalidateModeration`; Task 3 `ReasonDialog`, `SanctionDialog`, `ConfirmDialog`, `FilterChips`; Task 5 라우트 `/(moderator)/users/[id]`; 기존 `ChatMessageBubble`, `ChatSystemCard`, `ChatDateChip`(`@/src/components/chat/*`).
- Produces: `ChatModerationThread({ chatRoomId }: { chatRoomId: string }): JSX.Element`.

- [ ] **Step 1: 목록 작성**

```tsx
type Bucket = "closed" | "open";
const reports = useMemo(() => (reportsQuery.data ?? [])
	.filter((r) => OPEN_REPORT_STATUSES.has(r.status) === (bucket === "open"))
	.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
[reportsQuery.data, bucket]);
const SEVERITY_TONE = { high: "danger", low: "neutral", mid: "warning" } as const;
```

행: `Pill tone={SEVERITY_TONE[sev]}`로 `REPORT_SEVERITY_LABELS[sev]`, `Pill`로 `targetTypeLabel(targetType)`, 제목 `reportReasonLabel(reason)`, 대상·신고자 한 줄(대상명은 아래 `resolveReportTargetParty`, 신고자는 `reporter?.displayName ?? reporter?.email`), `details` 한 줄(`numberOfLines={1}`), `formatDateTime(createdAt)`, `reportStatusLabel(status)`. `Pressable` → `/(moderator)/reports/${id}`.

대상 표시명 헬퍼(파일 상단 또는 `apps/native/src/lib/moderation/report-target.ts`로 분리, 상세와 공유):

```ts
export function resolveReportTargetParty(report: ReportListItem): { name: string; role: string } {
	const idShort = `#${report.targetId.slice(0, 8)}`;
	const ctx = report.targetContext;
	if (ctx && "user" in ctx) { return { name: ctx.user.displayName ?? idShort, role: userRoleLabel(ctx.user.role) }; }
	if (ctx && "jobPost" in ctx) { return { name: ctx.jobPost.title, role: "공고" }; }
	if (ctx && "chatRoom" in ctx) { return { name: ctx.chatRoom.jobPostTitle ?? idShort, role: "채팅방" }; }
	if (ctx && "communityPost" in ctx) { return { name: ctx.communityPost.title ?? idShort, role: "커뮤니티 글" }; }
	if (ctx && "communityComment" in ctx) { return { name: idShort, role: "커뮤니티 댓글" }; }
	return { name: idShort, role: targetTypeLabel(report.targetType) };
}
```

`ReportListItem`은 `Awaited<ReturnType<typeof orpcClient.bambi.moderation.listReports>>[number]`처럼 oRPC 추론 타입에서 뽑는다(기존 `apps/native/src/lib/chat/chat-types.ts`의 방식을 따른다). `targetContext`의 각 키 필드명(`displayName`, `role`, `title`, `jobPostTitle`, `status`, `body`, `rating`, `isBlocked` 등)은 `packages/api/src/routers/bambi/moderation.ts`의 `getJobPostTargetContext`·`getReviewTargetContext`·`getUserTargetContext`·`getChatRoomTargetContext`·`getCommunityPostTargetContext`·`getCommunityCommentTargetContext` 반환값에서 확인해 맞춘다.

- [ ] **Step 2: ChatModerationThread 작성**

```tsx
export function ChatModerationThread({ chatRoomId }: { chatRoomId: string }) {
	const query = useQuery(orpc.bambi.moderation.getChatMessagesForModeration.queryOptions({ input: { chatRoomId } }));
	// 로딩·에러는 LoadingState/ErrorState. 데이터: { room, messages } 형태(핸들러 반환값 확인).
	// 메시지는 createdAt 오름차순으로 세로 나열, 날짜가 바뀌면 ChatDateChip. 발신자가 employerUserId면 오른쪽(isMine=true 대신 별도 정렬 prop 없으면 isMine으로 구인자 측을 오른쪽에), 시스템 메시지는 ChatSystemCard를 onRespondContact·onSetInterviewStatus 미전달(no-op)로 렌더.
}
```

`ChatMessageBubble`이 요구하는 `message` 타입이 `ChatRoomMessage`(채팅 라우터 출력)라 `getChatMessagesForModeration`의 메시지 형태와 다르면, 필요한 필드만 매핑하는 어댑터 함수를 이 파일 안에 둔다. 매핑이 과하면 버블을 직접 그리는 얇은 `ModerationBubble`(Surface + Text, 좌/우 정렬)로 대체해도 된다 — 읽기 전용이므로 재시도·읽음 표시는 필요 없다.

- [ ] **Step 3: 상세 작성**

```tsx
const item = reportsQuery.data?.find((r) => r.id === id);
const [dialog, setDialog] = useState<null | { kind: "block"; isBlocked: boolean } | { kind: "community"; action: CommunityAction } | { kind: "dismiss" } | { kind: "sanction" }>(null);
const [confirmAction, setConfirmAction] = useState<CommunityAction | null>(null);
const setReportStatus = useMutation(orpc.bambi.moderation.setReportStatus.mutationOptions());
const setUserStatus = useMutation(orpc.bambi.moderation.setUserStatus.mutationOptions());
const setChatRoomBlocked = useMutation(orpc.bambi.moderation.setChatRoomBlocked.mutationOptions());
const setPostStatus = useMutation(orpc.bambi.community.setPostStatusByAdmin.mutationOptions());
const setCommentStatus = useMutation(orpc.bambi.community.setCommentStatusByAdmin.mutationOptions());

const resolveReport = async (status: "dismissed" | "resolved", reason: string) => {
	await setReportStatus.mutateAsync({ reportId: id, status, reason });
	await invalidate.reports();
	toast.show({ label: REPORT_TOASTS[status] });
	router.back();
};
```

렌더 순서:
1. 헤더 Surface: 심각도 Pill, `reportReasonLabel`, `reportStatusLabel`, `formatDateTime(createdAt)`.
2. 당사자: `targetType === "chat_room"`이면 [채팅방 카드, 피신고자 카드, 신고자 카드], 아니면 [피신고자 카드, 신고자 카드]. 사용자 카드(`targetContext.user` 또는 `targetUserId`가 있을 때)는 `Pressable` → `/(moderator)/users/${targetUserId}`. `targetVerifiedIdentity?.phoneNumber`가 있으면 표시, 비회원은 "본인인증 정보 없음".
3. 대상 컨텍스트(우선순위 순):
   - `communityPost`/`communityComment`: 미리보기(제목 또는 body 앞 120자, `Pill` `CONTENT_STATUS_LABELS[status]`, 작성자, 시각) + `COMMUNITY_ACTIONS[status]` 버튼. `confirm`이면 `setConfirmAction(action)` → `ConfirmDialog` 확정 시 `setDialog({ kind: "community", action })`, 아니면 바로 `setDialog(...)`. `ReasonDialog onConfirm`: `postId`/`commentId`로 `setPostStatus`/`setCommentStatus.mutateAsync({ ..., reason, reportId: id, status: action.status })` 후 `toast.show({ label: communityActionToast(kind, action.status) })`, 이어서 `resolveReport("resolved", reason)`.
   - `jobPost`: 제목·업소·`jobPostStatusLabel`·본문 `numberOfLines={4}`·반려 사유(있으면).
   - `review`: `"★".repeat(rating)`·`reviewStatusLabel`·본문.
   - `user`: displayName·`userRoleLabel`·`accountStatusLabel`·전화 인증.
   - `chatRoom`: 제목·`Pill`(isBlocked → "차단됨" danger, 탈퇴 → "탈퇴" neutral, 그 외 "정상" success)·`<ChatModerationThread chatRoomId={targetId} />`·버튼 "대화방 차단"/"차단 해제" → `setDialog({ kind: "block", isBlocked: !current })` → `ReasonDialog` → `setChatRoomBlocked.mutateAsync({ chatRoomId: targetId, isBlocked, reason })`, `invalidate.reports()`, 토스트 `CHAT_ROOM_BLOCK_TOASTS.blocked|unblocked`.
   - 그 외(`chatMessage` 또는 컨텍스트 없음): `targetUnavailable`이면 `StateCard title="대상을 찾을 수 없어요"`, 아니면 `chatMessage.body`를 Surface에.
4. 신고 내용: `details` 전체(`selectable`), 없으면 생략.
5. 하단 고정 바(열린 신고일 때만):
   - 대상이 사용자(`targetContext && "user" in targetContext`): "기각"(`secondary`) + "제재 적용"(`danger`).
   - 그 외: "기각" + "조치 완료"(`primary`). 단 `targetType`이 `community_*`·`chat_room`·`chat_message`면 "조치 완료" 숨김.
   - 기각 → `ReasonDialog defaultReason="" title="신고 기각" confirmLabel="기각하기" danger` → `resolveReport("dismissed", reason)`.
   - 조치 완료 → 즉시 `resolveReport("resolved", REPORT_RESOLVE_DEFAULT_REASON)`, 실패는 `toast.show({ label: REPORT_TOASTS.failed, variant: "danger" })`.
   - 제재 적용 → `SanctionDialog targetName={party.name} onConfirm={async (status, reason) => { await setUserStatus.mutateAsync({ targetUserId: item.targetUserId!, status, reason }); await invalidate.users(item.targetUserId!); await resolveReport("resolved", REPORT_RESOLVE_DEFAULT_REASON); return true; }}`.
   종료된 신고는 바 대신 `StateCard title="처리된 신고예요" description={resolutionReason ?? ""}`(필드명은 `report` 테이블 스키마에서 확인).

- [ ] **Step 4: 린트·타입체크**

Run: `pnpm exec ultracite check "apps/native/app/(moderator)/(tabs)/reports.tsx" "apps/native/app/(moderator)/reports" apps/native/src/components/moderation apps/native/src/lib/moderation && pnpm --filter native check-types`

- [ ] **Step 5: 커밋** (컨트롤러)

`feat(native): 신고 목록·상세와 대상별 컨텍스트·채팅 스레드·조치 연쇄 구현`

---

### Task 7: 마무리 정리·전체 검증

**Files:**
- Delete: 남아 있으면 `apps/native/app/(moderator)/index.tsx`, `reports.tsx`, `users.tsx`(Task 2에서 이동했으므로 보통 없음)
- Modify: `apps/native/src/components/report-dialog.tsx` — 로컬 `REPORT_REASONS` 라벨 맵을 `REPORT_REASON_LABELS`(공유 모듈) 기반으로 교체("두 앱이 패키지를 공유하지 않아" 주석 삭제).

- [ ] **Step 1: 중복 라벨 제거**

```ts
import { REPORT_REASON_LABELS, type ReportReason } from "@bambi-app/api/services/bambi-moderation-labels";
const REPORT_REASONS = Object.entries(REPORT_REASON_LABELS) as [ReportReason, string][];
```

순서가 web과 같은지(`misleading_job_information`이 `harassment` 앞) 확인하고, 다르면 명시 배열로 순서를 고정한다.

- [ ] **Step 2: 전체 검증**

Run: `pnpm exec ultracite check apps/native/app apps/native/src packages/api/src/services/bambi-moderation-labels.ts apps/web/src/lib/bambi`
Run: `pnpm --filter native check-types && pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types`
Run: `cd packages/api && pnpm vitest run test/services/bambi-moderation-labels.test.ts`
Run: `cd apps/web && pnpm vitest run src/lib/bambi/moderation-labels.test.ts`
Expected: 전부 통과

- [ ] **Step 3: 커밋** (컨트롤러)

`chore(native): 신고 사유 라벨 중복 제거·운영자 영역 잔여 정리`

---

## 실기기 확인 목록 (사용자 / agent-device)

1. admin 계정 로그인 → 운영자 페이지 진입 시 3탭 표시, RoleSwitchMenu로 구직자·구인자 영역 이동·복귀.
2. 검수: 필터·정렬 전환, 상세 진입, 승인·보류·반려 각각 프리셋 선택 → 사유 편집 → 확정 → 토스트·목록 갱신. 1자 사유로 확정 버튼 비활성 확인.
3. 사용자: 검색·상태·역할 필터, 상세 제재(경고) → 목록 복귀, 정상 복구, 경고 되돌리기, 법률자문 지정·해제, 탈퇴 계정 복구.
4. 신고: 열림·종료 전환, 사용자 대상 신고 기각·제재 적용(신고 자동 종료), 공고 대상 조치 완료, 채팅방 신고 스레드 표시·차단·해제, 커뮤니티 글 숨김·삭제(확인 2단계)·복구.

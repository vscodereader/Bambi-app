# native 구인자 영역(공고관리·공고등록·업체정보) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/native`의 구인자(employer) 영역을 seeker와 같은 하단 3탭 셸로 재편하고, 공고 목록·삭제(환급 문구 포함)·등록/수정 폼(초보환영·즉시면접 스위치, 상세설명 블록, 대표/상세 이미지 업로드)·내 정보 허브·업체 정보 수정·사업자 인증(서류 업로드/미리보기/삭제·상태 규칙)을 web과 기능 동등하게 구현한다. 결제·광고·부스트·포인트·상세 슬라이싱은 범위 밖이다.

**Architecture:** 순수 로직(폼 검증 확장·블록 편집 상태 조작·업로드 payload 빌더·사업자 인증 상태 규칙·상태 라벨/집계·환급 문구)은 `apps/native/src/lib/employer/*.ts`에 두고 `apps/native/test/lib/employer/*.test.ts`로 vitest 커버한다. 화면은 얇게 유지하고 heroui-native로 그린다. 상세설명 블록 규칙은 `@bambi-app/api/services/bambi-job-description-blocks`(순수 함수, import 0)를 그대로 재사용하고, 블록 id는 `@bambi-app/api/services/bambi-chat-message-id`의 `generateChatMessageId()`(Hermes crypto 폴백)로 만든다. 서버·web·DB는 변경하지 않는다(packages/api 순수 함수 import만 허용).

**Tech Stack:** Expo SDK 56 / React Native 0.85 (Hermes) / expo-router / heroui-native 1.0.3 (uniwind) / @orpc/tanstack-query / expo-image-picker(설치됨) / expo-document-picker(설치됨) / expo-web-browser(설치됨) / vitest 4

**Spec:** `docs/superpowers/specs/2026-09-03-native-recruiter-design.md`

## Global Constraints

- 소스 수정 후 빌드·dev 서버·에뮬레이터(adb) 조작 금지. 검증은 vitest·`tsc --noEmit`·ultracite·biome까지만. 실기기 확인은 사용자가 한다.
- 신규 npm 의존성 금지. 이미 설치된 `expo-image-picker`·`expo-document-picker`·`expo-web-browser`만 쓴다.
- 서버·web·DB 변경 금지. 마이그레이션 없음. `packages/api`의 **순수 함수/타입 import는 허용**(`@bambi-app/api/services/*`, `@bambi-app/api/routers/index`). 서버 라우터 핸들러·스키마는 손대지 않는다.
- DB enum 원값을 화면에 그대로 렌더하지 않는다. 라벨 맵(`jobStatusLabels`·`verificationStatusLabels`·`biznumStatusLabels`·업종·급여단위·블록타입) 경유. 새 enum 값이 생기면 라벨 맵을 동반한다.
- **UI 작업 필수 참고(native 전용, web 작업엔 적용 금지)**: 착수 전 `.agents/skills/heroui-native/SKILL.md`를 읽고 쓸 컴포넌트는 `node .agents/skills/heroui-native/scripts/get_component_docs.mjs <Name>`(리포 루트 실행)으로 실제 export·props를 확인한다. 스타일링(className·variants·dark 모드·테마 토큰)은 Uniwind 공식문서 `https://docs.uniwind.dev/llms-full.txt`를 WebFetch로 읽고 그 지침을 따른다(native 스타일 엔진은 Tailwind v4가 아니라 Uniwind).
- 색은 heroui 테마 토큰만(`accent`·`surface`·`muted`·`danger`·`success`·`warning`·`border`·`foreground`·`background`·`link`). 테마 색은 oklch로 정의돼 있다(SKILL.md의 HSL 표기는 오류). 임의 px(`[Npx]`) 금지, Tailwind/Uniwind 스케일 클래스만 사용.
- `primary`(기본) 버튼은 화면당 주요 액션 **한 곳만**. 내비/보조 액션은 `secondary`·`tertiary`·`ghost`. 목록 화면의 primary는 "공고 등록", 등록/수정 폼은 제출, 업체정보/사업자인증은 저장/제출 한 곳.
- seeker 탭 셸 함정 3종 준수: (1) `tabBarIcon`은 `color: ColorValue` 시그니처를 받는다, (2) `tabBarStyle.height = 콘텐츠높이 + insets.bottom` + `paddingBottom: insets.bottom`로 **이중 패딩 금지**, (3) expo-router `Tabs`(deprecated 경고 있어도 그대로 유지).
- native 확정 UI 규칙: accent 텍스트는 `text-accent-soft-foreground dark:text-accent`, `Surface`는 `variant="secondary"` + `rounded-lg`, 누름 피드백은 `active:opacity-75`, Chip 대신 순수 `Pill`(Text) 사용(Android에서 `selectable` Text·Chip Pressable이 카드 터치를 삼킨다), 탭 배지는 `bambi-screen`의 `Pill` 방식. heroui `TextArea`는 base `h-32` 함정이 있어 multiline `Input`을 쓴다(기존 `native-job-form`과 동일).
- 이미지 업로드 byteSize는 `asset.fileSize`가 아니라 **blob 실측 byteSize**(`(await fetch(uri)).blob().size`)를 쓴다. GCS 서명에 content-length가 묶여 1바이트만 달라도 403이다(me-settings 프로필 사진과 동일 패턴).
- RN(Hermes) 호환: `crypto.randomUUID`·`Array.prototype.findLastIndex` 등 미지원 API 금지. 블록 id는 `generateChatMessageId()`(폴백 내장)로 만든다.
- oRPC 코드형 오류는 코드별 한국어 맵으로 노출한다(영어 기본 message 그대로 노출 금지). 서버가 한국어 message를 실은 경우만 그대로 쓴다(me-settings·chat-errors 규칙).
- 커밋 메시지는 한국어 `type(native): 제목` + `- ` 블릿 본문(블릿 사이 빈 줄 없음). **서브에이전트는 커밋하지 않는다** — 각 Task의 "커밋 단계"는 메시지 초안만 적고, 컨트롤러가 순차 커밋한다. `git stash`·push·PR 금지.
- 워크트리 루트(모든 명령·경로 기준): `C:\Users\user\projects\bambi-app\.claude\worktrees\worktree-native-recruiter`. native 패키지명은 `native`(scope 없음).

## File Map

순수 로직(`apps/native/src/lib/employer/`)
- Create `job-status.ts` — 상태 라벨/집계/표시상태/환급 문구/게이트 문구 파생(순수)
- Create `job-description-blocks.ts` — 블록 편집 상태 조작 + 타입 라벨 + 검증 래핑(순수, api 서비스 재사용)
- Create `job-media.ts` — 이미지 선택 검증·업로드 payload 빌더(순수)
- Create `job-update.ts` — 수정 시 광고 필드 패스스루 빌더(순수)
- Create `business.ts` — 사업자 인증 폼 검증·상태 규칙·국세청 문구·biznum 라벨·오류 맵(순수)
- Modify `apps/native/src/lib/bambi-native.ts` — `verificationStatusLabels`에 `changes_unsubmitted` 추가, `payUnitOptions`에 `협의` 추가, `NativeJobPostInput` 확장(협의·스위치·블록·미디어·광고 패스스루), `validateNativeJobForm` 협의 지원

테스트(`apps/native/test/lib/employer/`)
- Create `job-status.test.ts`, `job-description-blocks.test.ts`, `job-media.test.ts`, `job-update.test.ts`, `business.test.ts`
- Modify `apps/native/src/lib/bambi-native.test.ts` — 협의 케이스 추가(기존 콜로케이션 테스트 위치 유지)

컴포넌트(`apps/native/src/components/`)
- Modify `native-job-form.tsx` — 스위치·블록 편집기·이미지 섹션·광고/웹 안내 추가
- Create `employer-header.tsx` — 탭 셸 홈 헤더(seeker 셸 셸과 같은 축, 구인자 라우트)
- Create `job-description-block-editor.tsx` — 블록 편집 UI(폼에서 분리)
- Create `job-image-picker-section.tsx` — 대표/상세 이미지 선택·미리보기·제거 UI
- Create `business-document-section.tsx` — 사업자 서류 업로드/미리보기/삭제 UI

화면·레이아웃(`apps/native/app/(employer)/`)
- Rewrite `_layout.tsx` — Stack + 역할 게이트(employer/admin 아니면 replace)
- Create `(tabs)/_layout.tsx` — 하단 3탭(공고관리·채팅·내 정보)
- Move/Rewrite `index.tsx` → `(tabs)/index.tsx` — 공고관리 목록 + 삭제 Dialog
- Create `(tabs)/chats.tsx` — 채팅 플레이스홀더
- Create `(tabs)/me.tsx` — 내 정보(업체정보 허브)
- Modify `new.tsx`, `jobs/[id]/edit.tsx` — 확장 폼 배선(getEditableById 초기값·update 패스스루·헤더)
- Create `me/organization.tsx` — 업체 정보 수정
- Create `me/business.tsx` — 사업자 인증

---

### Task 1: employer 순수 로직 + 테스트

**Files:**
- Modify: `apps/native/src/lib/bambi-native.ts`
- Modify: `apps/native/src/lib/bambi-native.test.ts`
- Create: `apps/native/src/lib/employer/job-status.ts`
- Create: `apps/native/src/lib/employer/job-description-blocks.ts`
- Create: `apps/native/src/lib/employer/job-media.ts`
- Create: `apps/native/src/lib/employer/job-update.ts`
- Create: `apps/native/src/lib/employer/business.ts`
- Test: `apps/native/test/lib/employer/{job-status,job-description-blocks,job-media,job-update,business}.test.ts`

**Interfaces:**
- Consumes:
  - `@bambi-app/api/services/bambi-job-description-blocks`: `type JobDescriptionBlock { id: string; text: string; type: JobDescriptionBlockType }`, `type JobDescriptionBlockType = "paragraph" | "heading" | "bullet_list" | "callout"`, `jobDescriptionBlockTypes: readonly JobDescriptionBlockType[]`, `MAX_JOB_DESCRIPTION_BLOCKS = 12`, `MAX_JOB_DESCRIPTION_BLOCK_TEXT_LENGTH = 800`, `validateJobDescriptionBlocks(blocks): { blocks; issues: { blockId?; code; maxBlocks?; maxLength? }[]; ok; plainText }`, `normalizeJobDescriptionBlocks(blocks): JobDescriptionBlock[]` (모두 순수, import 0 — native import 가능 확정).
  - `@bambi-app/api/services/bambi-chat-message-id`: `generateChatMessageId(): string` (Hermes crypto 폴백 확정).
  - `bambi-native.ts`: `jobStatusLabels`(draft/hidden/on_hold/pending_review/published/rejected), `verificationStatusLabels`(확장 후 5키).
- Produces (bambi-native.ts 확장):
  - `verificationStatusLabels`에 `changes_unsubmitted: "변경사항 미제출"` 추가 → 5키.
  - `payUnitOptions = ["시급", "일급", "주급", "월급", "협의"] as const`.
  - `NativeJobPostInput` 확장: `payAmount: number | null`, `beginnerFriendly?: boolean`, `instantInterview?: boolean`, `descriptionBlocks?: JobDescriptionBlock[]`, `media?: { cover?: JobMediaUploadItem; detail: JobMediaUploadItem[] }`, `adProductId?: string | null`, `exposureDurationDays?: number | null`, `exposureAmount?: number | null`, `paymentMethod?: "bank_transfer" | "card" | null`.
  - `validateNativeJobForm(form, options)`: `payUnit === "협의"`면 payAmount 없이 통과(payAmount `null`), 아니면 기존 정수>0 규칙. 반환 `input.payAmount: number | null`.
- Produces (employer/job-status.ts):
  - `interface JobStatusCounts { pendingReview: number; published: number; rejected: number }`, `countJobStatuses(jobs: readonly { status: string }[]): JobStatusCounts`
  - `interface JobDisplayStatus { label: string; tone: "danger" | "neutral" | "success" | "warning" }`, `getJobDisplayStatus(job: { paymentStatus: null | string; status: string }): JobDisplayStatus`
  - `getJobStatusNote(job: { listingQueuePosition: null | number; paymentStatus: null | string; rejectionReason: null | string; status: string }): null | string`
  - `interface DeleteRefundPreview { cap?: null | number; forfeitedAmount: number; refundAmount: number; refundLocked: boolean; usedAmount: number }`, `getDeleteRefundDescription(preview: DeleteRefundPreview | null | undefined): string`
- Produces (employer/job-description-blocks.ts):
  - `jobDescriptionBlockTypeLabels: Record<JobDescriptionBlockType, string>`
  - `createJobDescriptionBlock(type?: JobDescriptionBlockType): JobDescriptionBlock`
  - `addJobBlock(blocks, block?): JobDescriptionBlock[]`, `removeJobBlock(blocks, id): JobDescriptionBlock[]`, `moveJobBlock(blocks, id, direction: "down" | "up"): JobDescriptionBlock[]`, `updateJobBlockText(blocks, id, text): JobDescriptionBlock[]`, `updateJobBlockType(blocks, id, type): JobDescriptionBlock[]`
  - `canAddJobBlock(blocks): boolean`, `jobDescriptionBlocksError(blocks): null | string`
- Produces (employer/job-media.ts):
  - `JOB_COVER_LIMIT = 1`, `JOB_DETAIL_LIMIT = 5`, `JOB_IMAGE_MAX_BYTES = 10_485_760`
  - `interface PickedJobImage { byteSize: number; fileName: string; height?: number; mimeType: string; uri: string; width?: number }`
  - `interface JobMediaUploadItem { altText: string; byteSize: number; fileName: string; height?: number; mimeType: string; storageKey: string; width?: number }`
  - `resolveJobImagePick(asset: { fileName?: null | string; height?: number; mimeType?: string; uri: string; width?: number }, byteSize: number): PickedJobImage | { error: string }`
  - `toJobMediaItem(picked: PickedJobImage, storageKey: string): JobMediaUploadItem`
- Produces (employer/job-update.ts):
  - `interface EditableAdSource { adProductId: null | string; exposureAmount: null | number; exposureDurationDays: null | number; paymentMethod: null | string }`
  - `buildJobUpdateData(input: NativeJobPostInput, editable: EditableAdSource): NativeJobPostInput` — `editable.adProductId`이 있으면 광고 4필드를 그대로 얹고, 없으면 input 그대로(standard).
- Produces (employer/business.ts):
  - `biznumStatusLabels: Record<string, string>`, `getBiznumStatusLabel(code: null | string): string`
  - `getBiznumCheckText(input: { biznumCheckEnabled: boolean; biznumCheckedAt: Date | null | string; biznumStatusCode: null | string }): string`
  - `interface BusinessForm { businessRegistrationNumber: string; businessStartDate: string; displayName: string; representativeName: string }`
  - `type BusinessSubmitInput = { businessRegistrationNumber: string; businessStartDate: string; displayName: string; representativeName: string }`
  - `validateBusinessForm(form: BusinessForm): { errors: Partial<Record<keyof BusinessForm, string>>; message: string; ok: false } | { input: BusinessSubmitInput; ok: true }`
  - `type VerificationStatus = "changes_unsubmitted" | "none" | "pending" | "rejected" | "verified"`
  - `interface BusinessScreenState { canDeleteDocuments: boolean; inputsLocked: boolean; requiresConfirmation: boolean; submitLabel: string; statusNotice: null | string }`, `resolveBusinessScreenState(status: string): BusinessScreenState`
  - `interface EmployerGateNotice { actionLabel: null | string; description: string; title: string }`, `getEmployerGateNotice(status: string, action: string): EmployerGateNotice | null`
  - `businessErrorMessage(error: unknown): string`

- [ ] **Step 1: bambi-native.ts 확장 — verificationStatusLabels·payUnitOptions·NativeJobPostInput·validateNativeJobForm**

`apps/native/src/lib/bambi-native.ts` 상단 import에 추가:
```ts
import type {
	JobDescriptionBlock,
} from "@bambi-app/api/services/bambi-job-description-blocks";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";
```
(순환 우려 없음 — job-media.ts는 bambi-native를 import하지 않는다.)

`verificationStatusLabels`에 키 추가:
```ts
export const verificationStatusLabels = {
	changes_unsubmitted: "변경사항 미제출",
	none: "미인증",
	pending: "인증 대기",
	rejected: "인증 반려",
	verified: "인증 완료",
} as const;
```

`payUnitOptions`를 교체(협의 추가):
```ts
export const payUnitOptions = ["시급", "일급", "주급", "월급", "협의"] as const;

// 급여 협의 단위 — 금액 없이 저장한다(web bambi-options.ts의 NEGOTIABLE_PAY_UNIT과 같은 값).
export const NEGOTIABLE_PAY_UNIT = "협의";
```

`NativeJobPostInput`을 교체(payAmount nullable + 확장 필드):
```ts
export interface NativeJobPostInput {
	adProductId?: null | string;
	beginnerFriendly?: boolean;
	description: string;
	descriptionBlocks?: JobDescriptionBlock[];
	exposureAmount?: null | number;
	exposureDurationDays?: null | number;
	industryCategory: NativeIndustryOption;
	instantInterview?: boolean;
	interviewNotes?: string;
	media?: { cover?: JobMediaUploadItem; detail: JobMediaUploadItem[] };
	organizationId: string;
	// "협의" 단위는 금액이 없다 — 서버 jobPostInput refine이 짝을 강제한다.
	payAmount: null | number;
	paymentMethod?: "bank_transfer" | "card" | null;
	payUnit: string;
	regionCode: string;
	teamId?: string;
	title: string;
	workSchedule: string;
}
```

`validateNativeJobForm`의 급여 분기를 협의 지원으로 교체. `payAmount`/`payUnit` 검증 블록을 다음으로 바꾼다:
```ts
	const isNegotiable = payUnit === NEGOTIABLE_PAY_UNIT;
	const payAmount = isNegotiable ? null : Number(payAmountText);

	if (!(payUnit.length > 0 && payUnit.length <= PAY_UNIT_MAX_LENGTH)) {
		errors.payUnit = "급여 단위를 선택해 주세요.";
	}

	// 협의는 금액을 받지 않는다. 그 외 단위만 1 이상 정수를 요구한다.
	if (!isNegotiable && !(Number.isInteger(payAmount) && (payAmount ?? 0) > 0)) {
		errors.payAmount = "급여 금액은 1 이상의 정수로 입력해 주세요.";
	}
```
반환 `input`의 `payAmount`를 `payAmount`(number | null)로 바꾼다:
```ts
		input: {
			description,
			industryCategory: industryCategory as NativeIndustryOption,
			interviewNotes: interviewNotes || undefined,
			organizationId,
			payAmount,
			payUnit,
			regionCode,
			teamId: teamId || undefined,
			title,
			workSchedule,
		},
```
(기존 `payAmount` 지역변수 선언 `const payAmount = Number(payAmountText);`은 위에서 재정의하므로 삭제한다.)

- [ ] **Step 2: bambi-native.test.ts에 협의 케이스 추가**

`apps/native/src/lib/bambi-native.test.ts`의 `validateNativeJobForm` describe에 추가:
```ts
	it("급여 단위가 협의면 금액 없이 통과하고 payAmount는 null이다", () => {
		const result = validateNativeJobForm(
			{
				...emptyNativeJobForm,
				description: "충분히 긴 상세 설명입니다.",
				industryCategory: "BAR",
				organizationId: "org1",
				payAmount: "",
				payUnit: "협의",
				regionCode: "1111000000",
				title: "협의 공고",
				workSchedule: "주 5일",
			},
			{}
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.input.payAmount).toBeNull();
			expect(result.input.payUnit).toBe("협의");
		}
	});
```
(파일 상단 import에 `emptyNativeJobForm`가 없으면 추가한다.)

- [ ] **Step 3: employer/job-status.ts 테스트 작성(실패 확인)**

`apps/native/test/lib/employer/job-status.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	countJobStatuses,
	getDeleteRefundDescription,
	getJobDisplayStatus,
	getJobStatusNote,
} from "@/src/lib/employer/job-status";

describe("countJobStatuses", () => {
	it("게시·검수대기·반려만 센다", () => {
		expect(
			countJobStatuses([
				{ status: "published" },
				{ status: "published" },
				{ status: "pending_review" },
				{ status: "rejected" },
				{ status: "hidden" },
			])
		).toEqual({ pendingReview: 1, published: 2, rejected: 1 });
	});
});

describe("getJobDisplayStatus", () => {
	it("게시됐지만 미결제면 미공개/warning", () => {
		expect(
			getJobDisplayStatus({ paymentStatus: "unpaid", status: "published" })
		).toEqual({ label: "미공개", tone: "warning" });
	});

	it("게시 완료는 공개/success", () => {
		expect(
			getJobDisplayStatus({ paymentStatus: "paid", status: "published" })
		).toEqual({ label: "공개", tone: "success" });
	});

	it("반려는 danger, 검수대기는 warning", () => {
		expect(
			getJobDisplayStatus({ paymentStatus: "paid", status: "rejected" }).tone
		).toBe("danger");
		expect(
			getJobDisplayStatus({ paymentStatus: "paid", status: "pending_review" })
				.tone
		).toBe("warning");
	});
});

describe("getJobStatusNote", () => {
	it("대기열이 최우선", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: 3,
				paymentStatus: "paid",
				rejectionReason: null,
				status: "published",
			})
		).toBe("자리가 나면 순서대로 자동 노출됩니다.");
	});

	it("반려 사유가 있으면 사유를 붙인다", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: null,
				paymentStatus: "paid",
				rejectionReason: "위험어 포함",
				status: "rejected",
			})
		).toBe("반려 사유: 위험어 포함");
	});

	it("반려 사유가 없으면 재검수 안내", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: null,
				paymentStatus: "paid",
				rejectionReason: null,
				status: "rejected",
			})
		).toBe("수정 후 제출하면 재검수를 거칩니다.");
	});

	it("정상 게시는 note 없음", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: null,
				paymentStatus: "paid",
				rejectionReason: null,
				status: "published",
			})
		).toBeNull();
	});
});

describe("getDeleteRefundDescription", () => {
	it("환급 잠금이 최우선", () => {
		expect(
			getDeleteRefundDescription({
				forfeitedAmount: 0,
				refundAmount: 0,
				refundLocked: true,
				usedAmount: 100,
			})
		).toBe(
			"한 번이라도 결제 완료가 되거나 공개 처리된 공고에 사용된 포인트는 환불이 어렵습니다. 삭제한 공고와 연결된 기록은 되돌릴 수 없어요."
		);
	});

	it("일부 소멸이면 캡·사용·소멸 금액을 안내한다", () => {
		expect(
			getDeleteRefundDescription({
				cap: 5000,
				forfeitedAmount: 200,
				refundAmount: 800,
				refundLocked: false,
				usedAmount: 1000,
			})
		).toBe(
			"지금 취소하시면 최대 보유 포인트는 5,000포인트까지 가능하므로 사용하신 1,000포인트 중 200포인트는 환급이 불가합니다. 그대로 하시겠습니까?"
		);
	});

	it("전액 환급이면 즉시 환급 안내", () => {
		expect(
			getDeleteRefundDescription({
				forfeitedAmount: 0,
				refundAmount: 800,
				refundLocked: false,
				usedAmount: 800,
			})
		).toBe("공고를 삭제하면 사용한 800포인트가 즉시 환급됩니다.");
	});

	it("환급 없음/미리보기 없음은 기본 문구", () => {
		expect(getDeleteRefundDescription(null)).toBe(
			"삭제한 공고와 연결된 광고·성과 기록은 되돌릴 수 없어요."
		);
	});
});
```

- [ ] **Step 4: employer/job-status.ts 구현**

`apps/native/src/lib/employer/job-status.ts`:
```ts
import { jobStatusLabels } from "@/src/lib/bambi-native";

// web /employer/page.tsx getJobStatusCounts와 같은 규칙 — 이 세 상태만 요약 타일로 센다.
export interface JobStatusCounts {
	pendingReview: number;
	published: number;
	rejected: number;
}

export const countJobStatuses = (
	jobs: readonly { status: string }[]
): JobStatusCounts => {
	const counts: JobStatusCounts = {
		pendingReview: 0,
		published: 0,
		rejected: 0,
	};

	for (const job of jobs) {
		if (job.status === "published") {
			counts.published += 1;
		} else if (job.status === "pending_review") {
			counts.pendingReview += 1;
		} else if (job.status === "rejected") {
			counts.rejected += 1;
		}
	}

	return counts;
};

export interface JobDisplayStatus {
	label: string;
	tone: "danger" | "neutral" | "success" | "warning";
}

const STATUS_TONES: Record<string, JobDisplayStatus["tone"]> = {
	draft: "neutral",
	hidden: "neutral",
	on_hold: "warning",
	pending_review: "warning",
	published: "success",
	rejected: "danger",
};

// web @/lib/bambi/exposure getJobDisplayStatus 이식 — 게시됐지만 미결제면 "미공개".
export const getJobDisplayStatus = (job: {
	paymentStatus: null | string;
	status: string;
}): JobDisplayStatus => {
	if (job.status === "published" && job.paymentStatus !== "paid") {
		return { label: "미공개", tone: "warning" };
	}

	return {
		label:
			jobStatusLabels[job.status as keyof typeof jobStatusLabels] ?? job.status,
		tone: STATUS_TONES[job.status] ?? "neutral",
	};
};

// web employer-jobs-columns.tsx getJobStatusNote 이식(우선순위 동일).
export const getJobStatusNote = (job: {
	listingQueuePosition: null | number;
	paymentStatus: null | string;
	rejectionReason: null | string;
	status: string;
}): null | string => {
	if (job.listingQueuePosition !== null) {
		return "자리가 나면 순서대로 자동 노출됩니다.";
	}

	if (job.paymentStatus !== "paid" && job.status === "published") {
		return "입금 확인 후 노출됩니다.";
	}

	if (job.paymentStatus !== "paid" && job.status === "pending_review") {
		return "검수 통과와 입금 확인을 모두 마쳐야 노출됩니다.";
	}

	if (job.status === "on_hold") {
		return "운영자가 추가 확인 중입니다. 검수가 끝나면 상태가 바뀝니다.";
	}

	if (job.status === "rejected") {
		return job.rejectionReason
			? `반려 사유: ${job.rejectionReason}`
			: "수정 후 제출하면 재검수를 거칩니다.";
	}

	return null;
};

// web /employer/page.tsx getDeletePointRefundPreview 응답 형태.
export interface DeleteRefundPreview {
	cap?: null | number;
	forfeitedAmount: number;
	refundAmount: number;
	refundLocked: boolean;
	usedAmount: number;
}

const won = (value: number): string => value.toLocaleString("ko-KR");

// web /employer/page.tsx getDeleteDescription 이식(분기 순서 동일).
export const getDeleteRefundDescription = (
	preview: DeleteRefundPreview | null | undefined
): string => {
	if (preview?.refundLocked) {
		return "한 번이라도 결제 완료가 되거나 공개 처리된 공고에 사용된 포인트는 환불이 어렵습니다. 삭제한 공고와 연결된 기록은 되돌릴 수 없어요.";
	}

	if (preview && preview.forfeitedAmount > 0) {
		return `지금 취소하시면 최대 보유 포인트는 ${won(preview.cap ?? 0)}포인트까지 가능하므로 사용하신 ${won(preview.usedAmount)}포인트 중 ${won(preview.forfeitedAmount)}포인트는 환급이 불가합니다. 그대로 하시겠습니까?`;
	}

	if (preview && preview.refundAmount > 0) {
		return `공고를 삭제하면 사용한 ${won(preview.refundAmount)}포인트가 즉시 환급됩니다.`;
	}

	return "삭제한 공고와 연결된 광고·성과 기록은 되돌릴 수 없어요.";
};
```

- [ ] **Step 5: employer/job-description-blocks.ts 테스트 작성(실패 확인)**

`apps/native/test/lib/employer/job-description-blocks.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	addJobBlock,
	canAddJobBlock,
	createJobDescriptionBlock,
	jobDescriptionBlocksError,
	jobDescriptionBlockTypeLabels,
	moveJobBlock,
	removeJobBlock,
	updateJobBlockText,
	updateJobBlockType,
} from "@/src/lib/employer/job-description-blocks";

const block = (id: string, text = "내용") =>
	({ id, text, type: "paragraph" }) as const;

describe("createJobDescriptionBlock", () => {
	it("고유 id와 빈 텍스트로 만든다", () => {
		const a = createJobDescriptionBlock();
		const b = createJobDescriptionBlock("heading");

		expect(a.id).not.toBe(b.id);
		expect(a.type).toBe("paragraph");
		expect(b.type).toBe("heading");
		expect(a.text).toBe("");
	});
});

describe("타입 라벨", () => {
	it("네 타입 모두 한국어 라벨이 있다", () => {
		expect(jobDescriptionBlockTypeLabels.paragraph).toBe("문단");
		expect(jobDescriptionBlockTypeLabels.heading).toBe("소제목");
		expect(jobDescriptionBlockTypeLabels.bullet_list).toBe("목록");
		expect(jobDescriptionBlockTypeLabels.callout).toBe("강조");
	});
});

describe("상태 조작", () => {
	it("addJobBlock은 끝에 붙인다", () => {
		expect(addJobBlock([block("a")]).length).toBe(2);
	});

	it("removeJobBlock은 해당 id만 뺀다", () => {
		expect(removeJobBlock([block("a"), block("b")], "a").map((x) => x.id)).toEqual(
			["b"]
		);
	});

	it("moveJobBlock up/down은 인접 항목과 교환한다", () => {
		const list = [block("a"), block("b"), block("c")];
		expect(moveJobBlock(list, "b", "up").map((x) => x.id)).toEqual([
			"b",
			"a",
			"c",
		]);
		expect(moveJobBlock(list, "b", "down").map((x) => x.id)).toEqual([
			"a",
			"c",
			"b",
		]);
	});

	it("맨 끝을 down하면 그대로", () => {
		const list = [block("a"), block("b")];
		expect(moveJobBlock(list, "b", "down")).toEqual(list);
	});

	it("updateJobBlockText/Type은 해당 id만 바꾼다", () => {
		const updated = updateJobBlockText([block("a")], "a", "새 텍스트");
		expect(updated[0].text).toBe("새 텍스트");
		expect(updateJobBlockType(updated, "a", "callout")[0].type).toBe("callout");
	});
});

describe("canAddJobBlock / jobDescriptionBlocksError", () => {
	it("12개 미만이면 추가 가능", () => {
		expect(canAddJobBlock([])).toBe(true);
		expect(
			canAddJobBlock(Array.from({ length: 12 }, (_, i) => block(String(i))))
		).toBe(false);
	});

	it("빈 텍스트 블록은 오류 문구를 준다", () => {
		expect(jobDescriptionBlocksError([block("a", "  ")])).toBe(
			"상세설명 블록의 내용을 입력하거나 빈 블록을 삭제해 주세요."
		);
	});

	it("정상 블록은 null", () => {
		expect(jobDescriptionBlocksError([block("a", "내용")])).toBeNull();
	});

	it("빈 배열은 null(상세설명 블록은 선택 입력)", () => {
		expect(jobDescriptionBlocksError([])).toBeNull();
	});
});
```

- [ ] **Step 6: employer/job-description-blocks.ts 구현**

`apps/native/src/lib/employer/job-description-blocks.ts`:
```ts
import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import {
	type JobDescriptionBlock,
	type JobDescriptionBlockType,
	MAX_JOB_DESCRIPTION_BLOCKS,
	validateJobDescriptionBlocks,
} from "@bambi-app/api/services/bambi-job-description-blocks";

// enum 원값 노출 금지 — 편집기 타입 선택 라벨.
export const jobDescriptionBlockTypeLabels: Record<
	JobDescriptionBlockType,
	string
> = {
	bullet_list: "목록",
	callout: "강조",
	heading: "소제목",
	paragraph: "문단",
};

// 블록 id는 crypto.randomUUID(Hermes 부재)가 아니라 폴백 내장 헬퍼로 만든다.
export const createJobDescriptionBlock = (
	type: JobDescriptionBlockType = "paragraph"
): JobDescriptionBlock => ({
	id: generateChatMessageId(),
	text: "",
	type,
});

export const addJobBlock = (
	blocks: readonly JobDescriptionBlock[],
	block: JobDescriptionBlock = createJobDescriptionBlock()
): JobDescriptionBlock[] => [...blocks, block];

export const removeJobBlock = (
	blocks: readonly JobDescriptionBlock[],
	id: string
): JobDescriptionBlock[] => blocks.filter((block) => block.id !== id);

export const moveJobBlock = (
	blocks: readonly JobDescriptionBlock[],
	id: string,
	direction: "down" | "up"
): JobDescriptionBlock[] => {
	const index = blocks.findIndex((block) => block.id === id);

	if (index === -1) {
		return [...blocks];
	}

	const target = direction === "up" ? index - 1 : index + 1;

	if (target < 0 || target >= blocks.length) {
		return [...blocks];
	}

	const next = [...blocks];
	[next[index], next[target]] = [next[target], next[index]];

	return next;
};

export const updateJobBlockText = (
	blocks: readonly JobDescriptionBlock[],
	id: string,
	text: string
): JobDescriptionBlock[] =>
	blocks.map((block) => (block.id === id ? { ...block, text } : block));

export const updateJobBlockType = (
	blocks: readonly JobDescriptionBlock[],
	id: string,
	type: JobDescriptionBlockType
): JobDescriptionBlock[] =>
	blocks.map((block) => (block.id === id ? { ...block, type } : block));

export const canAddJobBlock = (
	blocks: readonly JobDescriptionBlock[]
): boolean => blocks.length < MAX_JOB_DESCRIPTION_BLOCKS;

// 서버와 같은 규칙(validateJobDescriptionBlocks)으로 검사하고 첫 이슈를 한국어로 옮긴다.
export const jobDescriptionBlocksError = (
	blocks: readonly JobDescriptionBlock[]
): null | string => {
	const result = validateJobDescriptionBlocks([...blocks]);

	if (result.ok) {
		return null;
	}

	const [issue] = result.issues;

	switch (issue?.code) {
		case "too_many_blocks":
			return `상세설명 블록은 최대 ${MAX_JOB_DESCRIPTION_BLOCKS}개까지 추가할 수 있어요.`;
		case "block_text_too_long":
			return `상세설명 블록은 한 블록당 ${issue.maxLength ?? 800}자 이하로 입력해 주세요.`;
		default:
			return "상세설명 블록의 내용을 입력하거나 빈 블록을 삭제해 주세요.";
	}
};
```

- [ ] **Step 7: employer/job-media.ts 테스트 작성(실패 확인)**

`apps/native/test/lib/employer/job-media.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	JOB_IMAGE_MAX_BYTES,
	resolveJobImagePick,
	toJobMediaItem,
} from "@/src/lib/employer/job-media";

describe("resolveJobImagePick", () => {
	it("정상 이미지를 payload 초안으로 옮긴다(치수 포함)", () => {
		const result = resolveJobImagePick(
			{
				fileName: "cover.png",
				height: 800,
				mimeType: "image/png",
				uri: "file:///cover.png",
				width: 1200,
			},
			1024
		);

		expect(result).toEqual({
			byteSize: 1024,
			fileName: "cover.png",
			height: 800,
			mimeType: "image/png",
			uri: "file:///cover.png",
			width: 1200,
		});
	});

	it("Android generic mime는 확장자로 유도한다", () => {
		const result = resolveJobImagePick(
			{ fileName: "a.jpg", mimeType: "application/octet-stream", uri: "file:///a.jpg" },
			10
		);

		expect("error" in result).toBe(false);
		if (!("error" in result)) {
			expect(result.mimeType).toBe("image/jpeg");
		}
	});

	it("허용 밖 형식은 오류", () => {
		expect(
			resolveJobImagePick({ fileName: "a.heic", uri: "file:///a.heic" }, 10)
		).toEqual({ error: "JPG, PNG, WebP 이미지만 등록할 수 있어요." });
	});

	it("10MB 초과는 오류", () => {
		expect(
			resolveJobImagePick(
				{ fileName: "a.png", mimeType: "image/png", uri: "file:///a.png" },
				JOB_IMAGE_MAX_BYTES + 1
			)
		).toEqual({ error: "이미지는 한 장당 10MB 이하만 등록할 수 있어요." });
	});

	it("빈 파일은 오류", () => {
		expect(
			resolveJobImagePick(
				{ fileName: "a.png", mimeType: "image/png", uri: "file:///a.png" },
				0
			)
		).toEqual({ error: "이미지를 불러오지 못했어요. 다시 선택해 주세요." });
	});
});

describe("toJobMediaItem", () => {
	it("storageKey를 붙이고 altText는 빈 문자열로 채운다", () => {
		expect(
			toJobMediaItem(
				{
					byteSize: 10,
					fileName: "a.png",
					height: 800,
					mimeType: "image/png",
					uri: "file:///a.png",
					width: 1200,
				},
				"orgs/o1/x.png"
			)
		).toEqual({
			altText: "",
			byteSize: 10,
			fileName: "a.png",
			height: 800,
			mimeType: "image/png",
			storageKey: "orgs/o1/x.png",
			width: 1200,
		});
	});
});
```

- [ ] **Step 8: employer/job-media.ts 구현**

`apps/native/src/lib/employer/job-media.ts` (me-settings의 resolveProfileImageUpload와 같은 축, 서버 jobPostMediaInput·정책과 정합):
```ts
export const JOB_COVER_LIMIT = 1;
export const JOB_DETAIL_LIMIT = 5;
export const JOB_IMAGE_MAX_BYTES = 10_485_760; // 10 * 1024 * 1024, 서버 JOB_POST_IMAGE_MAX_BYTES와 동일
const JOB_IMAGE_NAME_MAX_LENGTH = 180;
const JOB_IMAGE_ALT_TEXT_MAX_LENGTH = 120; // 서버 JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH

const JOB_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_BY_EXTENSION: Record<string, string> = {
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

const lastSegment = (value: string): string =>
	value.split("?")[0].split("/").pop() ?? "";

const fileExtension = (value: string): string => {
	const segment = lastSegment(value);
	const dot = segment.lastIndexOf(".");

	return dot === -1 ? "" : segment.slice(dot + 1).toLowerCase();
};

// expo-image-picker asset. width/height는 asset이 함께 준다 — web처럼 createImageBitmap이
// 필요 없다. byteSize는 호출부가 blob.size(실측)를 넘긴다(asset.fileSize는 크롭·압축 뒤
// 어긋나 GCS 403).
export interface PickedJobImage {
	byteSize: number;
	fileName: string;
	height?: number;
	mimeType: string;
	uri: string;
	width?: number;
}

// 최종 제출 payload의 미디어 한 장(서버 jobPostMediaInput 부분집합, native가 채우는 키만).
export interface JobMediaUploadItem {
	altText: string;
	byteSize: number;
	fileName: string;
	height?: number;
	mimeType: string;
	storageKey: string;
	width?: number;
}

export const resolveJobImagePick = (
	asset: {
		fileName?: null | string;
		height?: number;
		mimeType?: string;
		uri: string;
		width?: number;
	},
	byteSize: number
): PickedJobImage | { error: string } => {
	const mimeType =
		asset.mimeType && JOB_IMAGE_MIME_TYPES.has(asset.mimeType)
			? asset.mimeType
			: MIME_BY_EXTENSION[
					fileExtension(asset.fileName ?? "") || fileExtension(asset.uri)
				];

	if (!mimeType) {
		return { error: "JPG, PNG, WebP 이미지만 등록할 수 있어요." };
	}

	if (byteSize < 1) {
		return { error: "이미지를 불러오지 못했어요. 다시 선택해 주세요." };
	}

	if (byteSize > JOB_IMAGE_MAX_BYTES) {
		return { error: "이미지는 한 장당 10MB 이하만 등록할 수 있어요." };
	}

	const fileName =
		((asset.fileName ?? "").trim() ||
			lastSegment(asset.uri) ||
			`image.${mimeType.split("/")[1]}`).slice(0, JOB_IMAGE_NAME_MAX_LENGTH);

	return {
		byteSize,
		fileName,
		height: asset.height,
		mimeType,
		uri: asset.uri,
		width: asset.width,
	};
};

export const toJobMediaItem = (
	picked: PickedJobImage,
	storageKey: string
): JobMediaUploadItem => ({
	altText: "".slice(0, JOB_IMAGE_ALT_TEXT_MAX_LENGTH),
	byteSize: picked.byteSize,
	fileName: picked.fileName,
	height: picked.height,
	mimeType: picked.mimeType,
	storageKey,
	width: picked.width,
});
```

- [ ] **Step 9: employer/job-update.ts 테스트 작성(실패 확인)**

`apps/native/test/lib/employer/job-update.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import { buildJobUpdateData } from "@/src/lib/employer/job-update";

const base: NativeJobPostInput = {
	description: "충분히 긴 상세 설명",
	industryCategory: "BAR",
	organizationId: "o1",
	payAmount: 12_000,
	payUnit: "시급",
	regionCode: "1111000000",
	title: "공고",
	workSchedule: "주 5일",
};

describe("buildJobUpdateData", () => {
	it("광고가 없는 공고(adProductId null)는 입력을 그대로 둔다", () => {
		const result = buildJobUpdateData(base, {
			adProductId: null,
			exposureAmount: null,
			exposureDurationDays: null,
			paymentMethod: null,
		});

		expect(result.adProductId).toBeUndefined();
		expect(result).toEqual(base);
	});

	it("광고가 붙은 공고는 광고 4필드를 패스스루한다", () => {
		const result = buildJobUpdateData(base, {
			adProductId: "ad1",
			exposureAmount: 50_000,
			exposureDurationDays: 30,
			paymentMethod: "card",
		});

		expect(result.adProductId).toBe("ad1");
		expect(result.exposureDurationDays).toBe(30);
		expect(result.exposureAmount).toBe(50_000);
		expect(result.paymentMethod).toBe("card");
		// 표준 필드는 보존
		expect(result.title).toBe("공고");
	});
});
```

- [ ] **Step 10: employer/job-update.ts 구현**

`apps/native/src/lib/employer/job-update.ts`:
```ts
import type { NativeJobPostInput } from "@/src/lib/bambi-native";

// getEditableById가 내려주는 공고 행에서 광고 축만 좁힌 것.
export interface EditableAdSource {
	adProductId: null | string;
	exposureAmount: null | number;
	exposureDurationDays: null | number;
	paymentMethod: null | string;
}

/**
 * 수정 payload를 만든다. native는 광고 상품을 편집하지 않지만, 서버 update는 jobPostInput
 * 전체를 받고 resolveJobPostExposure(data.adProductId)가 adProductId를 안 보내면 노출을
 * "standard"로 되돌려 유료 광고를 무료로 강등하고 결제 상태를 미결제로 리셋한다. 그래서
 * web에서 만든 광고 공고를 native에서 수정할 때는 광고 4필드(adProductId·기간·금액·결제수단)를
 * getEditableById 값 그대로 되돌려 보낸다. adBannerLayout·boostOptionTypes·detailDesignRequested는
 * 키를 생략하면 서버가 기존 값을 보존하므로 보내지 않는다.
 */
export const buildJobUpdateData = (
	input: NativeJobPostInput,
	editable: EditableAdSource
): NativeJobPostInput => {
	if (!editable.adProductId) {
		return input;
	}

	return {
		...input,
		adProductId: editable.adProductId,
		exposureAmount: editable.exposureAmount,
		exposureDurationDays: editable.exposureDurationDays,
		paymentMethod:
			editable.paymentMethod === "bank_transfer" ||
			editable.paymentMethod === "card"
				? editable.paymentMethod
				: null,
	};
};
```

- [ ] **Step 11: employer/business.ts 테스트 작성(실패 확인)**

`apps/native/test/lib/employer/business.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
	businessErrorMessage,
	getBiznumCheckText,
	getBiznumStatusLabel,
	getEmployerGateNotice,
	resolveBusinessScreenState,
	validateBusinessForm,
} from "@/src/lib/employer/business";

describe("getBiznumStatusLabel", () => {
	it("코드별 라벨과 미상 폴백", () => {
		expect(getBiznumStatusLabel("01")).toBe("계속사업자");
		expect(getBiznumStatusLabel("03")).toBe("폐업자");
		expect(getBiznumStatusLabel(null)).toBe("상태 미상");
		expect(getBiznumStatusLabel("99")).toBe("상태 미상");
	});
});

describe("getBiznumCheckText", () => {
	it("확인 전이고 기능 있으면 미확인", () => {
		expect(
			getBiznumCheckText({
				biznumCheckEnabled: true,
				biznumCheckedAt: null,
				biznumStatusCode: null,
			})
		).toBe("미확인");
	});

	it("확인 전이고 기능 없으면 준비 안내", () => {
		expect(
			getBiznumCheckText({
				biznumCheckEnabled: false,
				biznumCheckedAt: null,
				biznumStatusCode: null,
			})
		).toBe("곧 준비될 기능입니다");
	});

	it("확인 완료면 상태·시각을 붙인다", () => {
		const text = getBiznumCheckText({
			biznumCheckEnabled: true,
			biznumCheckedAt: "2026-09-01T00:00:00.000Z",
			biznumStatusCode: "01",
		});

		expect(text.startsWith("확인 완료(계속사업자) · ")).toBe(true);
	});
});

describe("validateBusinessForm", () => {
	it("정상 입력을 통과시킨다", () => {
		const result = validateBusinessForm({
			businessRegistrationNumber: "123-45-67890",
			businessStartDate: "2020-01-01",
			displayName: "밤비 라운지",
			representativeName: "홍길동",
		});

		expect(result.ok).toBe(true);
	});

	it("형식이 틀린 사업자등록번호를 막는다", () => {
		const result = validateBusinessForm({
			businessRegistrationNumber: "12345",
			businessStartDate: "2020-01-01",
			displayName: "밤비",
			representativeName: "홍길동",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.businessRegistrationNumber).toBe(
				"사업자등록번호는 000-00-00000 형식으로 입력해 주세요."
			);
		}
	});
});

describe("resolveBusinessScreenState", () => {
	it("pending은 입력·삭제 잠금", () => {
		const state = resolveBusinessScreenState("pending");
		expect(state.inputsLocked).toBe(true);
		expect(state.canDeleteDocuments).toBe(false);
	});

	it("verified/changes_unsubmitted는 변경 시 확인 필요", () => {
		expect(resolveBusinessScreenState("verified").requiresConfirmation).toBe(true);
		expect(
			resolveBusinessScreenState("changes_unsubmitted").requiresConfirmation
		).toBe(true);
	});

	it("rejected는 재제출 라벨", () => {
		expect(resolveBusinessScreenState("rejected").submitLabel).toBe(
			"업체 정보 재제출"
		);
	});

	it("none은 제출 라벨·잠금 없음", () => {
		const state = resolveBusinessScreenState("none");
		expect(state.submitLabel).toBe("업체 정보 제출");
		expect(state.inputsLocked).toBe(false);
	});
});

describe("getEmployerGateNotice", () => {
	it("verified면 null", () => {
		expect(getEmployerGateNotice("verified", "공고를 등록")).toBeNull();
	});

	it("none은 입력 유도 + action 보간", () => {
		const notice = getEmployerGateNotice("none", "공고를 등록");
		expect(notice?.title).toBe("업체 정보 등록이 필요합니다");
		expect(notice?.description).toBe(
			"공고를 등록하려면 업체명과 사업자등록번호를 입력하세요."
		);
		expect(notice?.actionLabel).toBe("업체 정보 입력");
	});

	it("pending은 버튼 없음", () => {
		expect(getEmployerGateNotice("pending", "공고를 등록")?.actionLabel).toBeNull();
	});
});

describe("businessErrorMessage", () => {
	it("서버 한국어 message는 그대로", () => {
		expect(
			businessErrorMessage(
				Object.assign(new Error("국세청에 등록된 사업자등록정보와 일치하지 않습니다."), {
					code: "BAD_REQUEST",
				})
			)
		).toBe("국세청에 등록된 사업자등록정보와 일치하지 않습니다.");
	});

	it("영어 기본 message는 코드 맵으로 대체", () => {
		expect(
			businessErrorMessage(Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" }))
		).toBe("지금은 업체 정보를 변경할 수 없어요.");
	});

	it("코드 없으면 일반 문구", () => {
		expect(businessErrorMessage(new Error("boom"))).toBe(
			"요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
		);
	});
});
```

- [ ] **Step 12: employer/business.ts 구현**

`apps/native/src/lib/employer/business.ts`:
```ts
import { formatDateTime } from "@/src/components/bambi-screen";

// web bambi-options.ts biznumStatusLabels/getBiznumStatusLabel 이식.
export const biznumStatusLabels: Record<string, string> = {
	"01": "계속사업자",
	"02": "휴업자",
	"03": "폐업자",
};

export const getBiznumStatusLabel = (code: null | string): string =>
	(code ? biznumStatusLabels[code] : undefined) ?? "상태 미상";

// web /employer/me/page.tsx getBiznumCheckText 이식.
export const getBiznumCheckText = (input: {
	biznumCheckEnabled: boolean;
	biznumCheckedAt: Date | null | string;
	biznumStatusCode: null | string;
}): string => {
	if (!input.biznumCheckedAt) {
		return input.biznumCheckEnabled ? "미확인" : "곧 준비될 기능입니다";
	}

	return `확인 완료(${getBiznumStatusLabel(input.biznumStatusCode)}) · ${formatDateTime(input.biznumCheckedAt)}`;
};

const BRN_PATTERN = /^\d{3}-\d{2}-\d{5}$/;
const START_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface BusinessForm {
	businessRegistrationNumber: string;
	businessStartDate: string;
	displayName: string;
	representativeName: string;
}

export type BusinessSubmitInput = BusinessForm;

export const validateBusinessForm = (
	form: BusinessForm
):
	| {
			errors: Partial<Record<keyof BusinessForm, string>>;
			message: string;
			ok: false;
	  }
	| { input: BusinessSubmitInput; ok: true } => {
	const errors: Partial<Record<keyof BusinessForm, string>> = {};
	const displayName = form.displayName.trim();
	const businessRegistrationNumber = form.businessRegistrationNumber.trim();
	const representativeName = form.representativeName.trim();
	const businessStartDate = form.businessStartDate.trim();

	if (!displayName) {
		errors.displayName = "업체명을 입력해 주세요.";
	}

	if (!BRN_PATTERN.test(businessRegistrationNumber)) {
		errors.businessRegistrationNumber =
			"사업자등록번호는 000-00-00000 형식으로 입력해 주세요.";
	}

	if (!representativeName) {
		errors.representativeName = "대표자 성명을 입력해 주세요.";
	}

	if (!START_DATE_PATTERN.test(businessStartDate)) {
		errors.businessStartDate = "개업일자를 YYYY-MM-DD 형식으로 입력해 주세요.";
	}

	const message = Object.values(errors).find(Boolean);

	if (message) {
		return { errors, message, ok: false };
	}

	return {
		input: {
			businessRegistrationNumber,
			businessStartDate,
			displayName,
			representativeName,
		},
		ok: true,
	};
};

export type VerificationStatus =
	| "changes_unsubmitted"
	| "none"
	| "pending"
	| "rejected"
	| "verified";

export interface BusinessScreenState {
	canDeleteDocuments: boolean;
	inputsLocked: boolean;
	requiresConfirmation: boolean;
	statusNotice: null | string;
	submitLabel: string;
}

// web /employer/me/page.tsx + business-document-uploader.tsx 상태 규칙 이식.
export const resolveBusinessScreenState = (
	status: string
): BusinessScreenState => {
	const isPending = status === "pending";
	const requiresConfirmation =
		status === "verified" || status === "changes_unsubmitted";

	let statusNotice: null | string = null;

	if (status === "verified") {
		statusNotice =
			"인증 완료 후 업체 정보나 인증 서류를 변경하면 변경사항 미제출 상태로 전환됩니다. 기존 공고와 광고는 비공개 처리되며, 재승인 전까지 공고·광고 등록과 채팅 송수신을 이용할 수 없습니다.";
	} else if (status === "changes_unsubmitted") {
		statusNotice =
			"변경사항이 아직 제출되지 않았습니다. 기존 공고와 광고가 비공개 처리되었으며 채팅 송수신이 제한됩니다. 업체 정보 제출 후 운영자 승인을 받아야 다시 이용할 수 있습니다.";
	} else if (isPending) {
		statusNotice =
			"운영자 승인 대기 중입니다. 심사 중에는 업체 정보를 수정할 수 없어요.";
	}

	return {
		canDeleteDocuments: !isPending,
		inputsLocked: isPending,
		requiresConfirmation,
		statusNotice,
		submitLabel: status === "rejected" ? "업체 정보 재제출" : "업체 정보 제출",
	};
};

export interface EmployerGateNotice {
	actionLabel: null | string;
	description: string;
	title: string;
}

// web employer-gate-banner.tsx 이식. verified면 null(배너 없음). action 예: "공고를 등록".
export const getEmployerGateNotice = (
	status: string,
	action: string
): EmployerGateNotice | null => {
	switch (status) {
		case "none":
			return {
				actionLabel: "업체 정보 입력",
				description: `${action}하려면 업체명과 사업자등록번호를 입력하세요.`,
				title: "업체 정보 등록이 필요합니다",
			};
		case "pending":
			return {
				actionLabel: null,
				description: `${action}하려면 운영자 승인이 완료되어야 합니다.`,
				title: "운영자 승인 대기 중",
			};
		case "rejected":
			return {
				actionLabel: "업체 정보 다시 제출",
				description: `반려 사유를 확인하고 업체 정보를 다시 제출해 주세요. 승인 후 ${action}할 수 있습니다.`,
				title: "업체 인증이 반려되었습니다",
			};
		case "changes_unsubmitted":
			return {
				actionLabel: "변경사항 제출",
				description: `변경한 업체 정보를 제출하고 운영자 승인을 받아야 ${action}할 수 있습니다.`,
				title: "업체 인증 변경사항을 제출해 주세요",
			};
		default:
			return null;
	}
};

// oRPC 코드형 오류 → 한국어. 서버가 한국어 message를 실은 경우(국세청 대조 등)만 그대로 쓴다.
const ENGLISH_FALLBACK_PATTERN = /^[A-Za-z .]+$/;
const BUSINESS_ERROR_MESSAGES: Record<string, string> = {
	BAD_REQUEST: "입력한 사업자 정보를 다시 확인해 주세요.",
	CONFLICT: "이미 처리 중인 요청이 있어요. 잠시 후 다시 시도해 주세요.",
	FORBIDDEN: "지금은 업체 정보를 변경할 수 없어요.",
	NOT_FOUND: "대상을 찾을 수 없어요.",
	TOO_MANY_REQUESTS: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.",
	UNAUTHORIZED: "로그인 후 다시 시도해 주세요.",
};

export const businessErrorMessage = (error: unknown): string => {
	if (
		error instanceof Error &&
		error.message &&
		!ENGLISH_FALLBACK_PATTERN.test(error.message)
	) {
		return error.message;
	}

	const code =
		typeof error === "object" && error !== null && "code" in error
			? String((error as { code: unknown }).code)
			: "";

	return (
		BUSINESS_ERROR_MESSAGES[code] ??
		"요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
	);
};
```

- [ ] **Step 13: 테스트 통과 확인**

Run (cwd 워크트리 루트):
```bash
pnpm --filter native test
```
Expected: employer 5개 파일 + 기존 파일 모두 passed(colocated me-*·bambi-native 테스트는 vitest include가 `test/**`라 이 명령으로는 chat·employer만 실행된다 — bambi-native.test.ts는 다음 단계 별도 확인).

Run bambi-native 콜로케이션 테스트 확인:
```bash
node_modules/.bin/vitest run --root apps/native --dir src/lib apps/native/src/lib/bambi-native.test.ts
```
Expected: passed(협의 케이스 포함).

- [ ] **Step 14: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/lib/employer apps/native/src/lib/bambi-native.ts apps/native/test/lib/employer
node_modules/.bin/biome check apps/native/src/lib/employer apps/native/src/lib/bambi-native.ts apps/native/test/lib/employer
```
Expected: 오류 0.

- [ ] **Step 15: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 구인자 순수 로직(상태·블록·미디어·수정 패스스루·사업자 인증) 추가
- lib/employer/job-status: 상태 집계·표시상태·상태 노트·삭제 환급 문구 4종
- lib/employer/job-description-blocks: 블록 편집 상태 조작·타입 라벨·서버 규칙 재사용 검증
- lib/employer/job-media: 이미지 선택 검증·업로드 payload 빌더(blob 실측 byteSize)
- lib/employer/job-update: 수정 시 광고 4필드 패스스루(무료 강등·결제 리셋 방지)
- lib/employer/business: 사업자 폼 검증·상태 규칙·국세청 문구·게이트 문구·오류 맵
- bambi-native: verificationStatusLabels changes_unsubmitted·payUnitOptions 협의·NativeJobPostInput 확장·validateNativeJobForm 협의 지원
- test/lib/employer 5종 + bambi-native 협의 케이스
```

---

### Task 2: 탭 셸 + 역할 게이트 + 헤더 + 채팅 플레이스홀더

**Files:**
- Rewrite: `apps/native/app/(employer)/_layout.tsx`
- Create: `apps/native/app/(employer)/(tabs)/_layout.tsx`
- Create: `apps/native/app/(employer)/(tabs)/chats.tsx`
- Create: `apps/native/src/components/employer-header.tsx`
- (index.tsx는 Task 3에서 `(tabs)/index.tsx`로 이동)

**Interfaces:**
- Consumes: `authClient.useSession()`(`@/lib/auth-client`), `orpc.bambi.onboarding.getMine`(`@/src/lib/orpc`), `getNativeHomeRoute`·`NativeProfileRole`(`@/src/lib/bambi-native`), `LoadingState`·`ErrorState`·`BambiScreen`·`StateCard`(`@/src/components/bambi-screen`), `SeekerStackHeader`(`@/src/components/seeker-header` — role 비의존이라 employer Stack에 재사용 확정).
- Produces: `EmployerHomeHeader`(`@/src/components/employer-header`) — 탭 셸 홈 헤더.

- [ ] **Step 1: employer 홈 헤더 작성**

`apps/native/src/components/employer-header.tsx` (seeker-header.tsx의 `SeekerHomeHeader` 구조를 따르되 구직자 전용 바로가기(검색·포인트몰·알림) 제거 — 구인자 셸엔 그 목적지가 없다. 로고+워드마크만):
```tsx
import { useThemeColor } from "heroui-native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";

// 구인자 탭 셸 홈 헤더. Tabs의 커스텀 header로 쓰이므로 상단 안전영역 인셋을 스스로 채운다.
// SeekerHomeHeader는 검색·포인트몰·알림(구직자 라우트)을 달고 있어 그대로 못 쓴다 —
// 구조(테두리·h-14 행·로고+워드마크)만 같은 얇은 헤더를 둔다.
export function EmployerHomeHeader() {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			<View className="h-14 flex-row items-center gap-2 px-4">
				<BambiLogo />
				<Text className="font-extrabold text-foreground text-xl" style={{ color: foreground }}>
					밤비알바 구인
				</Text>
			</View>
		</View>
	);
}
```
(`style={{ color: foreground }}`는 사족이면 제거 — className `text-foreground`로 충분하다. biome/ultracite에서 걸리면 style 프로퍼티를 지운다.)

- [ ] **Step 2: 탭 레이아웃 작성**

`apps/native/app/(employer)/(tabs)/_layout.tsx` (seeker (tabs)/_layout.tsx의 함정 3종 규칙 그대로, 배지 없음·3탭):
```tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmployerHomeHeader } from "@/src/components/employer-header";

// 웹 하단 탭(72px)에 맞춘 콘텐츠 높이. 안전영역은 별도 가산(이중 패딩 금지).
const TAB_BAR_CONTENT_HEIGHT = 64;

function tabIcon(
	active: ComponentProps<typeof Ionicons>["name"],
	inactive: ComponentProps<typeof Ionicons>["name"]
) {
	return ({
		color,
		focused,
		size,
	}: {
		color: ColorValue;
		focused: boolean;
		size: number;
	}) => (
		<Ionicons color={color} name={focused ? active : inactive} size={size} />
	);
}

export default function EmployerTabsLayout() {
	const accentColor = useThemeColor("accent");
	const mutedColor = useThemeColor("muted");
	const backgroundColor = useThemeColor("background");
	const borderColor = useThemeColor("border");
	const insets = useSafeAreaInsets();

	return (
		<Tabs
			screenOptions={{
				header: () => <EmployerHomeHeader />,
				tabBarActiveTintColor: accentColor,
				tabBarInactiveTintColor: mutedColor,
				tabBarStyle: {
					backgroundColor,
					borderTopColor: borderColor,
					height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
					paddingBottom: insets.bottom,
					paddingTop: 6,
				},
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					tabBarIcon: tabIcon("briefcase", "briefcase-outline"),
					title: "공고관리",
				}}
			/>
			<Tabs.Screen
				name="chats"
				options={{
					tabBarIcon: tabIcon(
						"chatbubble-ellipses",
						"chatbubble-ellipses-outline"
					),
					title: "채팅",
				}}
			/>
			<Tabs.Screen
				name="me"
				options={{
					tabBarIcon: tabIcon("person", "person-outline"),
					title: "내 정보",
				}}
			/>
		</Tabs>
	);
}
```

- [ ] **Step 3: 채팅 플레이스홀더 작성**

`apps/native/app/(employer)/(tabs)/chats.tsx`:
```tsx
import { BambiScreen, StateCard } from "@/src/components/bambi-screen";

// 업체 채팅은 후속 범위다(spec 7절). 탭 자리는 유지하되 준비 중 안내만 둔다.
export default function EmployerChatsScreen() {
	return (
		<BambiScreen>
			<StateCard
				description="지원자와의 1:1 채팅은 곧 앱에서도 지원할 예정이에요. 지금은 웹에서 이용해 주세요."
				title="채팅 기능을 준비하고 있어요"
			/>
		</BambiScreen>
	);
}
```

- [ ] **Step 4: (employer)/_layout.tsx 재작성 — 역할 게이트 + Stack**

`apps/native/app/(employer)/_layout.tsx` (app/index.tsx의 세션·역할 판정 패턴을 레이아웃에 옮긴다. `(tabs)`는 헤더 없음, Stack 상세는 SeekerStackHeader 재사용):
```tsx
import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect, Stack } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { ErrorState, LoadingState } from "@/src/components/bambi-screen";
import { SeekerStackHeader } from "@/src/components/seeker-header";
import {
	getNativeHomeRoute,
	type NativeProfileRole,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

export default function EmployerLayout() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	if (session.isPending || (session.data?.user && mineQuery.isPending)) {
		return <LoadingState label="구인자 정보를 확인하고 있습니다." />;
	}

	if (!session.data?.user) {
		return <Redirect href={"/login" as Href} />;
	}

	if (mineQuery.isError) {
		return <ErrorState onRetry={() => mineQuery.refetch()} />;
	}

	const role = mineQuery.data?.bambiProfile?.role as
		| NativeProfileRole
		| null
		| undefined;

	// 구인자 영역은 employer·admin만. 그 외 역할(구직자 등)은 자기 홈으로 되돌린다.
	if (role !== "admin" && role !== "employer") {
		return <Redirect href={getNativeHomeRoute(role) as Href} />;
	}

	return (
		<Stack
			screenOptions={{
				header: (props) => <SeekerStackHeader {...props} />,
			}}
		>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen name="new" options={{ title: "새 공고" }} />
			<Stack.Screen name="jobs/[id]/edit" options={{ title: "공고 편집" }} />
			<Stack.Screen name="me/organization" options={{ title: "업체 정보 수정" }} />
			<Stack.Screen name="me/business" options={{ title: "사업자 인증" }} />
		</Stack>
	);
}
```

- [ ] **Step 5: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check "apps/native/app/(employer)" apps/native/src/components/employer-header.tsx
node_modules/.bin/biome check "apps/native/app/(employer)/_layout.tsx" "apps/native/app/(employer)/(tabs)/_layout.tsx" "apps/native/app/(employer)/(tabs)/chats.tsx" apps/native/src/components/employer-header.tsx
```
Expected: 오류 0. (check-types는 index.tsx가 아직 옛 위치라 (tabs) 라우트 타입 경고가 있을 수 있다 — Task 3에서 index를 옮기면 정리된다. Href 캐스팅은 seeker와 동일 패턴.)

- [ ] **Step 6: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 구인자 하단 3탭 셸·역할 게이트·홈 헤더·채팅 플레이스홀더
- (employer)/_layout: 세션·getMine 역할 게이트(employer/admin 아니면 홈으로 replace) + Stack(SeekerStackHeader 재사용)
- (employer)/(tabs)/_layout: 공고관리·채팅·내 정보 3탭(insets 이중 패딩 금지·ColorValue 아이콘·Tabs 유지)
- employer-header: 로고+워드마크 얇은 홈 헤더(구직자 바로가기 제거)
- (tabs)/chats: 업체 채팅 준비 중 플레이스홀더
```

---

### Task 3: 공고관리 목록 탭 + 삭제 Dialog

**Files:**
- Delete: `apps/native/app/(employer)/index.tsx` (내용을 아래로 이관)
- Create: `apps/native/app/(employer)/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.onboarding.getMine`, `orpc.bambi.jobs.listMine`, `orpc.bambi.jobs.getDeletePointRefundPreview`(input `{ id }`), `orpc.bambi.jobs.delete`(input `{ id; expectedForfeitedAmount?; expectedRefundAmount? }`), `queryClient`; `countJobStatuses`·`getJobDisplayStatus`·`getJobStatusNote`·`getDeleteRefundDescription`·`DeleteRefundPreview`(`@/src/lib/employer/job-status`), `getEmployerGateNotice`(`@/src/lib/employer/business`), `verificationStatusLabels`·`formatPay`; `BambiScreen`·`BambiHeader`·`StateCard`·`Pill`·`LoadingState`·`ErrorState`(`@/src/components/bambi-screen`), heroui `Button`·`Surface`·`Dialog`.
- listMine 행 필드(서버 확정): `{ id, title, industryCategory, region, district, payAmount, payUnit, status, rejectionReason, paymentStatus, listingQueuePosition, updatedAt, employerVerificationStatus, organizationId, ... }`.
- getMine: `employerOrganizationProfiles[0]` = `{ displayName, verificationStatus, ... }`.

- [ ] **Step 1: 목록 화면 작성**

`apps/native/app/(employer)/(tabs)/index.tsx`:
```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, Link, router } from "expo-router";
import { Button, Dialog, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatPay,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { verificationStatusLabels } from "@/src/lib/bambi-native";
import { getEmployerGateNotice } from "@/src/lib/employer/business";
import {
	countJobStatuses,
	type DeleteRefundPreview,
	getDeleteRefundDescription,
	getJobDisplayStatus,
	getJobStatusNote,
} from "@/src/lib/employer/job-status";
import { orpc, queryClient } from "@/src/lib/orpc";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const BUSINESS_HREF = "/(employer)/me/business" as Href;
const NEW_HREF = "/(employer)/new" as Href;

function StatTile({ label, value }: { label: string; value: number }) {
	return (
		<View className="flex-1 gap-1">
			<Text className="text-muted text-xs">{label}</Text>
			<Text className="font-extrabold text-foreground text-lg" selectable>
				{value}
			</Text>
		</View>
	);
}

export default function EmployerJobsScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const jobsQuery = useQuery(orpc.bambi.jobs.listMine.queryOptions());
	const [deletingId, setDeletingId] = useState<null | string>(null);

	const refundQuery = useQuery({
		...orpc.bambi.jobs.getDeletePointRefundPreview.queryOptions({
			input: { id: deletingId ?? PLACEHOLDER_ID },
		}),
		enabled: deletingId !== null,
	});
	const preview = refundQuery.data as DeleteRefundPreview | undefined;

	const deleteMutation = useMutation(
		orpc.bambi.jobs.delete.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"삭제하지 못했어요",
					error.message ||
						"공고를 삭제하지 못했습니다. 삭제 권한을 확인한 뒤 다시 시도해 주세요."
				);
			},
			onSuccess: async () => {
				setDeletingId(null);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				Alert.alert("삭제했어요", "공고가 삭제되었습니다.");
			},
		})
	);

	if (mineQuery.isLoading || jobsQuery.isLoading) {
		return <LoadingState label="공고를 불러오고 있습니다." />;
	}

	if (mineQuery.isError || jobsQuery.isError) {
		return (
			<ErrorState
				onRetry={() => {
					mineQuery.refetch();
					jobsQuery.refetch();
				}}
			/>
		);
	}

	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const verificationStatus = organizationProfile?.verificationStatus ?? "none";
	const gate = getEmployerGateNotice(verificationStatus, "공고를 등록");
	const jobs = jobsQuery.data ?? [];
	const counts = countJobStatuses(jobs);
	const jobToDelete = jobs.find((job) => job.id === deletingId) ?? null;

	return (
		<BambiScreen>
			<BambiHeader
				action={
					<Link asChild href={NEW_HREF}>
						<Button size="sm">
							<Button.Label>공고 등록</Button.Label>
						</Button>
					</Link>
				}
				description="내 조직의 공고 상태를 확인하고 관리합니다."
				title="공고관리"
			/>

			{gate ? (
				<StateCard
					action={
						gate.actionLabel ? (
							<Link asChild href={BUSINESS_HREF}>
								<Button size="sm">
									<Button.Label>{gate.actionLabel}</Button.Label>
								</Button>
							</Link>
						) : undefined
					}
					description={gate.description}
					title={gate.title}
				/>
			) : null}

			{organizationProfile ? (
				<Surface className="flex-row items-center justify-between gap-2 rounded-lg p-4" variant="secondary">
					<Text className="font-semibold text-foreground" selectable>
						{organizationProfile.displayName}
					</Text>
					<Pill tone={verificationStatus === "verified" ? "success" : "neutral"}>
						{verificationStatusLabels[
							verificationStatus as keyof typeof verificationStatusLabels
						] ?? verificationStatus}
					</Pill>
				</Surface>
			) : null}

			{jobs.length > 0 ? (
				<Surface className="flex-row gap-3 rounded-lg p-4" variant="secondary">
					<StatTile label="게시" value={counts.published} />
					<StatTile label="검수 대기" value={counts.pendingReview} />
					<StatTile label="반려" value={counts.rejected} />
				</Surface>
			) : null}

			{jobs.length === 0 ? (
				<StateCard
					action={
						<Link asChild href={NEW_HREF}>
							<Button>
								<Button.Label>새 공고 등록</Button.Label>
							</Button>
						</Link>
					}
					description="조직 프로필을 선택해 첫 공고를 등록해 보세요."
					title="등록한 공고가 없어요"
				/>
			) : (
				<View className="gap-3">
					{jobs.map((job) => {
						const display = getJobDisplayStatus(job);
						const note = getJobStatusNote(job);

						return (
							<Surface
								className="gap-2 rounded-lg p-4"
								key={job.id}
								variant="secondary"
							>
								<View className="flex-row flex-wrap items-center gap-2">
									<Pill tone={display.tone}>{display.label}</Pill>
									<Pill>{job.region}</Pill>
								</View>
								<Text className="font-bold text-foreground text-lg" selectable>
									{job.title}
								</Text>
								<Text className="text-muted text-sm" selectable>
									{job.industryCategory} · {formatPay(job.payAmount, job.payUnit)}
								</Text>
								{note ? (
									<Text className="text-muted text-xs" selectable>
										{note}
									</Text>
								) : null}
								<View className="flex-row gap-2 pt-1">
									<Button
										onPress={() =>
											router.push({
												params: { id: job.id },
												pathname: "/(employer)/jobs/[id]/edit",
											} as unknown as Href)
										}
										size="sm"
										variant="secondary"
									>
										<Button.Label>수정</Button.Label>
									</Button>
									<Button
										onPress={() => setDeletingId(job.id)}
										size="sm"
										variant="danger-soft"
									>
										<Button.Label>삭제</Button.Label>
									</Button>
								</View>
							</Surface>
						);
					})}
				</View>
			)}

			<Dialog
				isOpen={deletingId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeletingId(null);
					}
				}}
			>
				<Dialog.Portal>
					<Dialog.Overlay />
					<Dialog.Content>
						<Dialog.Title>{`“${jobToDelete?.title ?? ""}” 공고를 삭제할까요?`}</Dialog.Title>
						<Dialog.Description>
							{refundQuery.isLoading
								? "환급 정보를 확인하고 있어요."
								: getDeleteRefundDescription(preview)}
						</Dialog.Description>
						<View className="flex-row justify-end gap-2 pt-2">
							<Pressable
								className="rounded-lg border border-border bg-background px-4 py-2 active:opacity-75"
								onPress={() => setDeletingId(null)}
							>
								<Text className="font-semibold text-foreground">취소</Text>
							</Pressable>
							<Button
								isDisabled={deleteMutation.isPending || refundQuery.isLoading}
								onPress={() => {
									if (!deletingId) {
										return;
									}
									deleteMutation.mutate({
										expectedForfeitedAmount: preview?.forfeitedAmount ?? 0,
										expectedRefundAmount: preview?.refundAmount ?? 0,
										id: deletingId,
									});
								}}
								variant="danger"
							>
								<Button.Label>
									{deleteMutation.isPending ? "삭제 중" : "삭제"}
								</Button.Label>
							</Button>
						</View>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog>
		</BambiScreen>
	);
}
```
(주의: `Button` variant `danger-soft`는 heroui semantic variant 목록에 있다. 없으면 `secondary`로 대체하고 라벨 색만 danger로 둔다. Dialog.Close는 확인/취소 버튼이 이미 있어 생략한다.)

- [ ] **Step 2: 옛 index.tsx 삭제**

```bash
git rm "apps/native/app/(employer)/index.tsx"
```
(라우트가 `(tabs)/index.tsx`로 이동했다. app/_layout.tsx는 `(employer)`를 headerShown:false로 이미 등록해 두었고, 그룹 내부는 (employer)/_layout이 관리하므로 추가 등록은 필요 없다.)

- [ ] **Step 3: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check "apps/native/app/(employer)/(tabs)/index.tsx"
node_modules/.bin/biome check "apps/native/app/(employer)/(tabs)/index.tsx"
```
Expected: 오류 0.

- [ ] **Step 4: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 구인자 공고관리 목록·삭제 다이얼로그
- (tabs)/index: 인증 게이트 카드·상태 요약(게시/검수 대기/반려)·상태 Pill(미공개 포함)·상태 노트·수정/삭제 액션
- 삭제 Dialog: getDeletePointRefundPreview 환급 문구 4종 표시 후 expected 금액과 함께 delete
- 옛 (employer)/index.tsx 삭제(→ (tabs)/index.tsx 이동)
```

---

### Task 4: 폼 확장 A — 스위치 + 상세설명 블록 편집기

**Files:**
- Create: `apps/native/src/components/job-description-block-editor.tsx`
- Modify: `apps/native/src/components/native-job-form.tsx`

**Interfaces:**
- Consumes: `addJobBlock`·`removeJobBlock`·`moveJobBlock`·`updateJobBlockText`·`updateJobBlockType`·`canAddJobBlock`·`jobDescriptionBlocksError`·`createJobDescriptionBlock`·`jobDescriptionBlockTypeLabels`(`@/src/lib/employer/job-description-blocks`), `type JobDescriptionBlock`·`type JobDescriptionBlockType`·`jobDescriptionBlockTypes`(`@bambi-app/api/services/bambi-job-description-blocks`), heroui `Switch`(`isSelected`·`onSelectedChange`·`isDisabled`)·`Input`·`TextField`.
- Produces: `JobDescriptionBlockEditor` 컴포넌트 `{ blocks: JobDescriptionBlock[]; error?: null | string; onChange: (next: JobDescriptionBlock[]) => void }`.
- native-job-form은 이제 상위로부터 스위치·블록·미디어 상태까지 조립해 `NativeJobPostInput`을 만든다(payAmount는 number | null).

- [ ] **Step 1: 블록 편집기 컴포넌트 작성**

`apps/native/src/components/job-description-block-editor.tsx`:
```tsx
import {
	type JobDescriptionBlock,
	type JobDescriptionBlockType,
	jobDescriptionBlockTypes,
} from "@bambi-app/api/services/bambi-job-description-blocks";
import { Input, TextField } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import {
	addJobBlock,
	canAddJobBlock,
	jobDescriptionBlockTypeLabels,
	moveJobBlock,
	removeJobBlock,
	updateJobBlockText,
	updateJobBlockType,
} from "@/src/lib/employer/job-description-blocks";

interface Props {
	blocks: JobDescriptionBlock[];
	error?: null | string;
	onChange: (next: JobDescriptionBlock[]) => void;
}

function TypeChoice({
	onSelect,
	value,
}: {
	onSelect: (type: JobDescriptionBlockType) => void;
	value: JobDescriptionBlockType;
}) {
	return (
		<View className="flex-row flex-wrap gap-2">
			{jobDescriptionBlockTypes.map((type) => {
				const isSelected = type === value;

				return (
					<Pressable
						className={`rounded-full border px-3 py-2 active:opacity-75 ${
							isSelected
								? "border-accent bg-accent"
								: "border-border bg-background"
						}`}
						key={type}
						onPress={() => onSelect(type)}
					>
						<Text
							className={
								isSelected
									? "font-semibold text-accent-foreground text-sm"
									: "font-semibold text-foreground text-sm"
							}
						>
							{jobDescriptionBlockTypeLabels[type]}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function JobDescriptionBlockEditor({ blocks, error, onChange }: Props) {
	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-foreground text-sm" selectable>
					상세설명 블록 (선택)
				</Text>
				<Text className="text-muted text-xs" selectable>
					문단·소제목·목록·강조로 상세설명을 구성할 수 있어요. 최대 12개.
				</Text>
			</View>

			{blocks.map((block, index) => (
				<View
					className="gap-2 rounded-lg border border-border p-3"
					key={block.id}
				>
					<TypeChoice
						onSelect={(type) => onChange(updateJobBlockType(blocks, block.id, type))}
						value={block.type}
					/>
					<TextField>
						<Input
							multiline
							onChangeText={(text) =>
								onChange(updateJobBlockText(blocks, block.id, text))
							}
							placeholder="블록 내용"
							value={block.text}
						/>
					</TextField>
					<View className="flex-row gap-2">
						<Pressable
							accessibilityLabel="블록 위로 이동"
							className="rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							disabled={index === 0}
							onPress={() => onChange(moveJobBlock(blocks, block.id, "up"))}
						>
							<Text className="text-foreground text-sm">위로</Text>
						</Pressable>
						<Pressable
							accessibilityLabel="블록 아래로 이동"
							className="rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							disabled={index === blocks.length - 1}
							onPress={() => onChange(moveJobBlock(blocks, block.id, "down"))}
						>
							<Text className="text-foreground text-sm">아래로</Text>
						</Pressable>
						<Pressable
							accessibilityLabel="블록 삭제"
							className="ml-auto rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() => onChange(removeJobBlock(blocks, block.id))}
						>
							<Text className="text-danger-soft-foreground text-sm dark:text-danger">
								삭제
							</Text>
						</Pressable>
					</View>
				</View>
			))}

			{error ? (
				<Text className="text-danger text-xs" selectable>
					{error}
				</Text>
			) : null}

			<Pressable
				className={`items-center rounded-lg border border-border bg-background py-3 active:opacity-75 ${
					canAddJobBlock(blocks) ? "" : "opacity-40"
				}`}
				disabled={!canAddJobBlock(blocks)}
				onPress={() => onChange(addJobBlock(blocks))}
			>
				<Text className="font-semibold text-foreground text-sm">
					블록 추가
				</Text>
			</Pressable>
		</View>
	);
}
```

- [ ] **Step 2: native-job-form.tsx에 스위치·블록 배선 추가**

`apps/native/src/components/native-job-form.tsx`를 확장한다. 상단 import 추가:
```ts
import type { JobDescriptionBlock } from "@bambi-app/api/services/bambi-job-description-blocks";
import { Switch } from "heroui-native";
import { JobDescriptionBlockEditor } from "@/src/components/job-description-block-editor";
import { jobDescriptionBlocksError } from "@/src/lib/employer/job-description-blocks";
import { normalizeJobDescriptionBlocks } from "@bambi-app/api/services/bambi-job-description-blocks";
```
`NativeJobFormProps`에 초기 확장값을 받는 필드를 추가:
```ts
interface NativeJobFormProps {
	initialValue?: NativeJobForm;
	initialBeginnerFriendly?: boolean;
	initialInstantInterview?: boolean;
	initialBlocks?: JobDescriptionBlock[];
	isSubmitting: boolean;
	onSubmit: (input: NativeJobPostInput) => void;
	postingScopes: PostingScope[];
	submitLabel: string;
}
```
컴포넌트 본문 상태에 추가:
```ts
	const [beginnerFriendly, setBeginnerFriendly] = useState(
		initialBeginnerFriendly ?? false
	);
	const [instantInterview, setInstantInterview] = useState(
		initialInstantInterview ?? false
	);
	const [blocks, setBlocks] = useState<JobDescriptionBlock[]>(
		initialBlocks ?? []
	);
	const [blocksError, setBlocksError] = useState<null | string>(null);
```
`handleSubmit`을 교체(블록 검증 + 조립):
```ts
	const handleSubmit = () => {
		const validation = validateNativeJobForm(form, {
			teamScopes: postingScopes
				.filter((scope) => scope.teamId)
				.map((scope) => ({
					organizationId: scope.organizationId,
					teamId: scope.teamId ?? "",
				})),
		});

		if (!validation.ok) {
			setErrors(validation.errors);
			setFormMessage(validation.message);
			return;
		}

		const blockError = jobDescriptionBlocksError(blocks);

		if (blockError) {
			setBlocksError(blockError);
			setFormMessage(blockError);
			return;
		}

		setErrors({});
		setBlocksError(null);
		setFormMessage(null);
		onSubmit({
			...validation.input,
			beginnerFriendly,
			descriptionBlocks: normalizeJobDescriptionBlocks(blocks),
			instantInterview,
		});
	};
```
급여 단위 ChoiceGroup 아래(면접 안내 TextField 위)에 스위치 2개를 추가:
```tsx
					<View className="flex-row items-center justify-between gap-3">
						<Text className="font-semibold text-foreground text-sm">초보 환영</Text>
						<Switch
							isSelected={beginnerFriendly}
							onSelectedChange={setBeginnerFriendly}
						/>
					</View>
					<View className="flex-row items-center justify-between gap-3">
						<Text className="font-semibold text-foreground text-sm">당일/즉시 면접</Text>
						<Switch
							isSelected={instantInterview}
							onSelectedChange={setInstantInterview}
						/>
					</View>
```
상세 설명 TextField 아래에 블록 편집기를 추가:
```tsx
					<JobDescriptionBlockEditor
						blocks={blocks}
						error={blocksError}
						onChange={setBlocks}
					/>
```

- [ ] **Step 3: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/components/job-description-block-editor.tsx apps/native/src/components/native-job-form.tsx
node_modules/.bin/biome check apps/native/src/components/job-description-block-editor.tsx apps/native/src/components/native-job-form.tsx
```
Expected: 오류 0.

- [ ] **Step 4: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 공고 폼에 초보환영·즉시면접 스위치와 상세설명 블록 편집기
- job-description-block-editor: 타입 선택(문단/소제목/목록/강조)·텍스트·위아래 이동·삭제·추가(최대 12)
- native-job-form: heroui Switch 2개·블록 편집기 배선, 제출 시 블록 검증(jobDescriptionBlocksError)·normalize 후 payload 조립
```

---

### Task 5: 폼 확장 B — 이미지 선택·업로드(cover 1·detail 5)·미리보기·제거

**Files:**
- Create: `apps/native/src/components/job-image-picker-section.tsx`
- Modify: `apps/native/src/components/native-job-form.tsx`

**Interfaces:**
- Consumes: `launchImageLibraryAsync`·`ImagePickerResult`(`expo-image-picker`), `orpc.bambi.jobs.createMediaUpload`(input `{ organizationId; teamId?; fileName; mimeType; byteSize; usage? }` → `{ byteSize; fileName; mimeType; storageKey; uploadUrl }`), `resolveJobImagePick`·`toJobMediaItem`·`JobMediaUploadItem`·`JOB_COVER_LIMIT`·`JOB_DETAIL_LIMIT`(`@/src/lib/employer/job-media`), heroui `Button`, RN `Image`·`Alert`.
- Produces: `JobImagePickerSection` `{ cover: JobMediaUploadItem | null; detail: JobMediaUploadItem[]; organizationId: string; teamId: null | string; onChange: (next: { cover: JobMediaUploadItem | null; detail: JobMediaUploadItem[] }) => void }`.
- 미디어 payload는 native-job-form에서 `media: { cover?: cover ?? undefined, detail }`로 조립해 `NativeJobPostInput.media`에 담는다.

- [ ] **Step 1: 이미지 섹션 컴포넌트 작성**

`apps/native/src/components/job-image-picker-section.tsx`:
```tsx
import {
	type ImagePickerResult,
	launchImageLibraryAsync,
} from "expo-image-picker";
import { Button } from "heroui-native";
import { useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import {
	JOB_DETAIL_LIMIT,
	type JobMediaUploadItem,
	resolveJobImagePick,
	toJobMediaItem,
} from "@/src/lib/employer/job-media";
import { orpc } from "@/src/lib/orpc";

interface Props {
	cover: JobMediaUploadItem | null;
	detail: JobMediaUploadItem[];
	onChange: (next: {
		cover: JobMediaUploadItem | null;
		detail: JobMediaUploadItem[];
	}) => void;
	organizationId: string;
	teamId: null | string;
}

// 미리보기 uri는 payload에 담지 않는다 — 화면 표시용으로만 storageKey에 매핑해 둔다.
type PreviewMap = Record<string, string>;

export function JobImagePickerSection({
	cover,
	detail,
	onChange,
	organizationId,
	teamId,
}: Props) {
	const [isBusy, setIsBusy] = useState(false);
	const [previews, setPreviews] = useState<PreviewMap>({});
	const uploadMutation = useMutationCreateMediaUpload();

	const pickAndUpload = async (
		usage: "cover" | "detail"
	): Promise<null | { item: JobMediaUploadItem; previewUri: string }> => {
		let picked: ImagePickerResult;

		try {
			picked = await launchImageLibraryAsync({
				mediaTypes: ["images"],
				quality: 0.9,
			});
		} catch {
			Alert.alert("사진을 불러오지 못했어요", "잠시 후 다시 시도해 주세요.");
			return null;
		}

		const asset = picked.canceled ? null : picked.assets[0];

		if (!asset) {
			return null;
		}

		// 서명 content-length에 blob.size가 묶인다 — asset.fileSize가 아니라 실측 바이트.
		const blob = await (await fetch(asset.uri)).blob();
		const resolved = resolveJobImagePick(
			{
				fileName: asset.fileName,
				height: asset.height,
				mimeType: asset.mimeType,
				uri: asset.uri,
				width: asset.width,
			},
			blob.size
		);

		if ("error" in resolved) {
			Alert.alert("등록할 수 없는 이미지예요", resolved.error);
			return null;
		}

		const intent = await uploadMutation.mutateAsync({
			byteSize: resolved.byteSize,
			fileName: resolved.fileName,
			mimeType: resolved.mimeType,
			organizationId,
			teamId: teamId ?? undefined,
			usage,
		});

		if (!intent.uploadUrl.startsWith("https://")) {
			Alert.alert(
				"지금은 이미지를 등록할 수 없어요",
				"잠시 후 다시 시도해 주세요."
			);
			return null;
		}

		const response = await fetch(intent.uploadUrl, {
			body: blob,
			headers: { "Content-Type": intent.mimeType },
			method: "PUT",
		});

		if (!response.ok) {
			throw new Error("upload failed");
		}

		return {
			item: toJobMediaItem(resolved, intent.storageKey),
			previewUri: asset.uri,
		};
	};

	const handleCoverPick = async () => {
		setIsBusy(true);

		try {
			const result = await pickAndUpload("cover");

			if (result) {
				setPreviews((prev) => ({
					...prev,
					[result.item.storageKey]: result.previewUri,
				}));
				onChange({ cover: result.item, detail });
			}
		} catch {
			Alert.alert("이미지 업로드에 실패했어요", "잠시 후 다시 시도해 주세요.");
		} finally {
			setIsBusy(false);
		}
	};

	const handleDetailPick = async () => {
		if (detail.length >= JOB_DETAIL_LIMIT) {
			Alert.alert(
				"상세 이미지는 최대 5장",
				"이미 5장을 등록했어요. 기존 이미지를 제거한 뒤 추가해 주세요."
			);
			return;
		}

		setIsBusy(true);

		try {
			const result = await pickAndUpload("detail");

			if (result) {
				setPreviews((prev) => ({
					...prev,
					[result.item.storageKey]: result.previewUri,
				}));
				onChange({ cover, detail: [...detail, result.item] });
			}
		} catch {
			Alert.alert("이미지 업로드에 실패했어요", "잠시 후 다시 시도해 주세요.");
		} finally {
			setIsBusy(false);
		}
	};

	const previewFor = (item: JobMediaUploadItem): string =>
		previews[item.storageKey] ?? "";

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-foreground text-sm" selectable>
					공고 이미지 (선택)
				</Text>
				<Text className="text-muted text-xs" selectable>
					대표 이미지 1장과 상세 이미지 최대 5장을 등록할 수 있어요. JPG·PNG·WebP,
					한 장당 10MB 이하.
				</Text>
			</View>

			<View className="gap-2">
				<Text className="text-muted text-xs">대표 이미지</Text>
				{cover ? (
					<View className="gap-2">
						<Image
							accessibilityLabel="대표 이미지 미리보기"
							className="h-40 w-full rounded-lg"
							source={{ uri: previewFor(cover) }}
						/>
						<Pressable
							className="self-start rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() => onChange({ cover: null, detail })}
						>
							<Text className="text-danger-soft-foreground text-sm dark:text-danger">
								대표 이미지 제거
							</Text>
						</Pressable>
					</View>
				) : (
					<Button
						isDisabled={isBusy}
						onPress={handleCoverPick}
						variant="secondary"
					>
						<Button.Label>{isBusy ? "처리 중" : "대표 이미지 선택"}</Button.Label>
					</Button>
				)}
			</View>

			<View className="gap-2">
				<Text className="text-muted text-xs">{`상세 이미지 (${detail.length}/${JOB_DETAIL_LIMIT})`}</Text>
				{detail.map((item, index) => (
					<View className="gap-2" key={item.storageKey}>
						<Image
							accessibilityLabel={`상세 이미지 ${index + 1} 미리보기`}
							className="h-40 w-full rounded-lg"
							source={{ uri: previewFor(item) }}
						/>
						<Pressable
							className="self-start rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() =>
								onChange({
									cover,
									detail: detail.filter((x) => x.storageKey !== item.storageKey),
								})
							}
						>
							<Text className="text-danger-soft-foreground text-sm dark:text-danger">
								{`상세 이미지 ${index + 1} 제거`}
							</Text>
						</Pressable>
					</View>
				))}
				{detail.length < JOB_DETAIL_LIMIT ? (
					<Button
						isDisabled={isBusy}
						onPress={handleDetailPick}
						variant="secondary"
					>
						<Button.Label>{isBusy ? "처리 중" : "상세 이미지 추가"}</Button.Label>
					</Button>
				) : null}
			</View>
		</View>
	);
}

// 훅을 컴포넌트 밖에서 정의하지 않기 위한 얇은 래퍼(컴포넌트 안 컴포넌트 정의 금지 규칙 회피).
function useMutationCreateMediaUpload() {
	return useMutationOrpc();
}
```
Ruling: 위 `useMutationCreateMediaUpload`/`useMutationOrpc` 우회는 불필요하다 — 컴포넌트 최상단에서 직접 `const uploadMutation = useMutation(orpc.bambi.jobs.createMediaUpload.mutationOptions());`를 호출하고, 파일 상단 import에 `import { useMutation } from "@tanstack/react-query";`를 추가한다. 구현 시 이 한 줄로 바꾸고 래퍼 함수 2개는 넣지 않는다(플레이스홀더 아님 — 최종 코드는 직접 호출).

- [ ] **Step 2: native-job-form.tsx에 이미지 섹션 배선**

상단 import 추가:
```ts
import { JobImagePickerSection } from "@/src/components/job-image-picker-section";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";
```
`NativeJobFormProps`에 초기 미디어를 추가:
```ts
	initialCover?: JobMediaUploadItem | null;
	initialDetail?: JobMediaUploadItem[];
```
상태 추가:
```ts
	const [cover, setCover] = useState<JobMediaUploadItem | null>(
		initialCover ?? null
	);
	const [detail, setDetail] = useState<JobMediaUploadItem[]>(
		initialDetail ?? []
	);
```
`onSubmit` 호출부에 미디어 조립을 추가(Task 4에서 만든 조립 객체에 media 병합):
```ts
		onSubmit({
			...validation.input,
			beginnerFriendly,
			descriptionBlocks: normalizeJobDescriptionBlocks(blocks),
			instantInterview,
			media: { cover: cover ?? undefined, detail },
		});
```
블록 편집기 아래(면접 안내 위 또는 아래, 배치는 폼 흐름에 맞춤)에 이미지 섹션을 추가:
```tsx
					<JobImagePickerSection
						cover={cover}
						detail={detail}
						onChange={(next) => {
							setCover(next.cover);
							setDetail(next.detail);
						}}
						organizationId={form.organizationId}
						teamId={form.teamId || null}
					/>
```
(주의: 이미지 업로드는 조직 컨텍스트가 필요하다 — `form.organizationId`가 비어 있으면(등록 범위 미선택) 섹션의 버튼을 눌러도 서버가 FORBIDDEN을 낸다. 등록 범위 선택 전에는 안내만 보이도록, `form.organizationId ? <JobImagePickerSection .../> : <Text className="text-muted text-xs">등록 범위를 먼저 선택하면 이미지를 올릴 수 있어요.</Text>`로 감싼다.)

- [ ] **Step 3: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/components/job-image-picker-section.tsx apps/native/src/components/native-job-form.tsx
node_modules/.bin/biome check apps/native/src/components/job-image-picker-section.tsx apps/native/src/components/native-job-form.tsx
```
Expected: 오류 0.

- [ ] **Step 4: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 공고 폼 대표/상세 이미지 선택·업로드·미리보기·제거
- job-image-picker-section: expo-image-picker 선택 → createMediaUpload 서명 PUT(blob 실측 byteSize) → 미리보기·제거, 대표 1·상세 5 제한
- native-job-form: 이미지 섹션 배선, 등록 범위 선택 전 안내, media payload 조립
```

---

### Task 6: 등록·수정 화면 배선

**Files:**
- Modify: `apps/native/app/(employer)/new.tsx`
- Modify: `apps/native/app/(employer)/jobs/[id]/edit.tsx`
- Modify: `apps/native/src/components/native-job-form.tsx` (웹 안내 문구 + 링크)

**Interfaces:**
- Consumes: `orpc.bambi.jobs.getEditableById`(→ 공고 행 + `media`(cover/detail/adHorizontal/adVertical) + `descriptionBlocks` + `beginnerFriendly`·`instantInterview` + 광고 축 `adProductId`·`exposureDurationDays`·`exposureAmount`·`paymentMethod`), `orpc.bambi.jobs.create`, `orpc.bambi.jobs.update`(input `{ id; data: jobPostInput }`), `buildJobUpdateData`·`EditableAdSource`(`@/src/lib/employer/job-update`). (웹 링크용 `EXPO_PUBLIC_WEB_URL`은 native env에 없어 문구만 — 아래 Step 3.)
- **update 계약(확정):** `update.input = { id, data: jobPostInput }`이고 `data`는 create와 동일한 전체 스키마다. 서버 `resolveJobPostExposure(data.adProductId)`는 `adProductId`가 없으면 노출을 `standard`로 되돌리고 결제 상태를 미결제로 리셋한다. 따라서 광고가 붙은 공고(웹에서 생성)를 수정할 때는 `adProductId`·`exposureDurationDays`·`exposureAmount`·`paymentMethod`를 getEditableById 값 그대로 되돌려 보낸다(`buildJobUpdateData`). `adBannerLayout`·`boostOptionTypes`·`detailDesignRequested`는 키를 생략하면 서버가 보존하므로 보내지 않는다. `media`는 보내면 전량 교체, 생략하면 기존 미디어 유지 — 수정 화면은 항상 현재 상태를 담아 보낸다.

- [ ] **Step 1: getEditableById → 폼 초기값 변환 확장(edit.tsx)**

`apps/native/app/(employer)/jobs/[id]/edit.tsx`의 `toNativeJobForm`은 스칼라만 다룬다. 미디어·블록·스위치·광고 축은 별도로 초기값으로 넘긴다. `toNativeJobForm` 반환에 payAmount 협의 처리는 이미 `""`이면 되고, payUnit이 "협의"면 폼이 협의로 인식한다(Task 1 검증). 컴포넌트에서 getEditableById 데이터를 다음처럼 매핑한다:
```tsx
	const editable = jobQuery.data;
	const initialCover = editable.media?.cover
		? {
				altText: editable.media.cover.altText ?? "",
				byteSize: editable.media.cover.byteSize,
				fileName: editable.media.cover.fileName,
				height: editable.media.cover.height ?? undefined,
				mimeType: editable.media.cover.mimeType,
				storageKey: editable.media.cover.storageKey,
				width: editable.media.cover.width ?? undefined,
			}
		: null;
	const initialDetail = (editable.media?.detail ?? []).map((item) => ({
		altText: item.altText ?? "",
		byteSize: item.byteSize,
		fileName: item.fileName,
		height: item.height ?? undefined,
		mimeType: item.mimeType,
		storageKey: item.storageKey,
		width: item.width ?? undefined,
	}));
	const adSource: EditableAdSource = {
		adProductId: editable.adProductId ?? null,
		exposureAmount: editable.exposureAmount ?? null,
		exposureDurationDays: editable.exposureDurationDays ?? null,
		paymentMethod: editable.paymentMethod ?? null,
	};
```
(미리보기 uri는 기존 원격 이미지라 로컬 uri가 없다 — Task 5의 preview 맵에 storageKey→공개 URL을 주입해야 미리보기가 보인다. 대표는 공개 버킷 URL(`publicObjectUri(storageKey, EXPO_PUBLIC_GCS_PUBLIC_BASE_URL)`)로, 상세는 서버가 비공개일 수 있으므로 미리보기가 안 나오면 파일명만 표기한다. Ruling: 상세 이미지 원격 미리보기는 공개 URL 조립으로 시도하되 실패 시 "등록된 이미지 N장" 텍스트로 폴백한다 — 신규 의존성 없이 처리. 구현 시 JobImagePickerSection에 `initialPreviews?: Record<string,string>` prop을 추가해 storageKey→URL을 주입하고, 없으면 파일명 텍스트를 그린다.)

`handleSubmit`을 update 패스스루로 교체:
```tsx
	const handleSubmit = (input: NativeJobPostInput) => {
		updateMutation.mutate({
			data: buildJobUpdateData(input, adSource),
			id,
		});
	};
```
`NativeJobFormScreen`에 초기 확장값을 전달:
```tsx
		<NativeJobFormScreen
			initialBeginnerFriendly={editable.beginnerFriendly ?? false}
			initialBlocks={editable.descriptionBlocks ?? []}
			initialCover={initialCover}
			initialDetail={initialDetail}
			initialInstantInterview={editable.instantInterview ?? false}
			initialValue={toNativeJobForm(jobQuery.data)}
			isSubmitting={updateMutation.isPending}
			onSubmit={handleSubmit}
			postingScopes={postingScopes}
			submitLabel="공고 저장"
		/>
```
상단 import 추가: `import { buildJobUpdateData, type EditableAdSource } from "@/src/lib/employer/job-update";`. `toNativeJobForm`의 입력 타입은 `jobQuery.data`가 전체 행이라 넓어졌으므로 `Parameters` 대신 필요한 필드만 구조적으로 받도록 유지한다(기존 타입에 없는 필드는 무시된다).

- [ ] **Step 2: create 화면은 표준만(new.tsx)**

`new.tsx`의 `handleSubmit`은 그대로 `createMutation.mutate(input)`을 쓴다(광고 필드 없음 = standard). `mineQuery.data?.employerOrganizationProfiles` 인증 미완료면 서버가 create를 FORBIDDEN("운영자 승인 후 공고를 등록할 수 있습니다.")로 막으므로, onError 안내를 추가한다:
```tsx
	const createMutation = useMutation(
		orpc.bambi.jobs.create.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"공고를 등록하지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				router.replace("/(employer)" as Href);
			},
		})
	);
```
(상단에 `import { Alert } from "react-native";` 추가.)

- [ ] **Step 3: 폼 하단 웹 안내 문구 추가(native-job-form.tsx)**

**확정:** `packages/env/src/native.ts`에 `EXPO_PUBLIC_WEB_URL`이 **없다**(스키마에 `EXPO_PUBLIC_SERVER_URL`·`EXPO_PUBLIC_GCS_PUBLIC_BASE_URL`만 존재). env 키 추가는 금지(서버·env 변경)이므로 **링크 없이 문구만** 둔다. 제출 버튼 근처에:
```tsx
					<Text className="text-muted text-xs leading-5" selectable>
						광고 노출 상품·결제는 밤비알바 웹사이트에서 진행할 수 있어요.
					</Text>
```
(expo-web-browser·env import는 이 Task에서 추가하지 않는다.)

- [ ] **Step 4: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check "apps/native/app/(employer)/new.tsx" "apps/native/app/(employer)/jobs/[id]/edit.tsx" apps/native/src/components/native-job-form.tsx apps/native/src/components/job-image-picker-section.tsx
node_modules/.bin/biome check "apps/native/app/(employer)/new.tsx" "apps/native/app/(employer)/jobs/[id]/edit.tsx" apps/native/src/components/native-job-form.tsx
```
Expected: 오류 0.

- [ ] **Step 5: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 공고 등록·수정 배선(초기값·광고 패스스루·웹 안내)
- edit: getEditableById의 미디어·블록·스위치·광고 축을 폼 초기값으로, 저장 시 buildJobUpdateData로 광고 4필드 패스스루(무료 강등 방지)
- new: create onError 안내(미인증 FORBIDDEN 등)
- native-job-form: 광고·결제는 웹에서 진행 안내 문구(native env에 웹 URL 없어 링크 없음)
```

---

### Task 7: 내 정보 허브

**Files:**
- Create: `apps/native/app/(employer)/(tabs)/me.tsx`

**Interfaces:**
- Consumes: `authClient.useSession()`, `orpc.bambi.onboarding.getMine`(→ `bambiProfile.role`, `employerOrganizationProfiles[0]` = `{ displayName, verificationStatus }`), `verificationStatusLabels`(`@/src/lib/bambi-native`), `BambiScreen`·`BambiHeader`·`CardLink`·`Pill`·`StateCard`·`Skeleton`, `LogoutButton`(`@/src/components/logout-button`), `MemberOnly`(`@/src/components/member-only`).
- seeker `me.tsx`의 ProfileCard + ListGroup 패턴을 재사용한다(같은 표면 규칙).

- [ ] **Step 1: 허브 화면 작성**

`apps/native/app/(employer)/(tabs)/me.tsx`:
```tsx
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import {
	Avatar,
	ListGroup,
	Separator,
	Skeleton,
	Surface,
	useThemeColor,
} from "heroui-native";
import { type ComponentProps, Fragment } from "react";
import { Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";
import { MemberOnly } from "@/src/components/member-only";
import { verificationStatusLabels } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const ORG_HREF = "/(employer)/me/organization" as Href;
const BUSINESS_HREF = "/(employer)/me/business" as Href;
const SETTINGS_HREF = "/(seeker)/me/settings" as Href;

interface MenuItem {
	description: string;
	href: Href;
	icon: ComponentProps<typeof Ionicons>["name"];
	label: string;
}

const MENU_ITEMS: MenuItem[] = [
	{
		description: "공고에 노출되는 업체명을 관리해요.",
		href: ORG_HREF,
		icon: "business-outline",
		label: "업체 정보",
	},
	{
		description: "사업자등록번호와 서류로 업체를 인증해요.",
		href: BUSINESS_HREF,
		icon: "shield-checkmark-outline",
		label: "사업자 인증",
	},
	{
		description: "표시 이름·본인인증을 관리해요.",
		href: SETTINGS_HREF,
		icon: "settings-outline",
		label: "계정 설정",
	},
];

function ProfileCard() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	if (session.isPending || mineQuery.isPending) {
		return <Skeleton className="h-20 rounded-lg" />;
	}

	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const displayName =
		organizationProfile?.displayName?.trim() ||
		session.data?.user?.name?.trim() ||
		"구인자 회원";
	const status = organizationProfile?.verificationStatus ?? "none";

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-center gap-3">
				<Avatar alt={`${displayName} 프로필 사진`} size="lg">
					{session.data?.user.image ? (
						<Avatar.Image source={{ uri: session.data.user.image }} />
					) : null}
					<Avatar.Fallback />
				</Avatar>
				<View className="min-w-0 flex-1 gap-1">
					<Text className="font-bold text-foreground text-lg" selectable>
						{displayName}
					</Text>
					<Pill tone={status === "verified" ? "success" : "neutral"}>
						{verificationStatusLabels[
							status as keyof typeof verificationStatusLabels
						] ?? status}
					</Pill>
				</View>
			</View>
		</Surface>
	);
}

function MeInner() {
	const foregroundColor = useThemeColor("foreground");

	return (
		<BambiScreen>
			<BambiHeader description="업체 정보와 계정을 관리합니다." title="내 정보" />
			<ProfileCard />
			<ListGroup className="rounded-lg" variant="secondary">
				{MENU_ITEMS.map((item, index) => (
					<Fragment key={item.label}>
						{index > 0 ? <Separator className="mx-4" /> : null}
						<ListGroup.Item
							accessibilityLabel={`${item.label} — ${item.description}`}
							accessibilityRole="button"
							className="active:opacity-75"
							onPress={() => router.push(item.href)}
						>
							<ListGroup.ItemPrefix>
								<Ionicons color={foregroundColor} name={item.icon} size={22} />
							</ListGroup.ItemPrefix>
							<ListGroup.ItemContent>
								<ListGroup.ItemTitle>{item.label}</ListGroup.ItemTitle>
								<ListGroup.ItemDescription>
									{item.description}
								</ListGroup.ItemDescription>
							</ListGroup.ItemContent>
							<ListGroup.ItemSuffix>{null}</ListGroup.ItemSuffix>
						</ListGroup.Item>
					</Fragment>
				))}
			</ListGroup>
			<StateCard
				description="팀 관리와 멤버 초대는 앱에서는 준비 중이에요. 웹에서 이용해 주세요."
				title="팀 관리는 웹에서"
			/>
			<View className="items-start">
				<LogoutButton />
			</View>
		</BambiScreen>
	);
}

export default function EmployerMeScreen() {
	return (
		<MemberOnly>
			<MeInner />
		</MemberOnly>
	);
}
```

- [ ] **Step 2: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check "apps/native/app/(employer)/(tabs)/me.tsx"
node_modules/.bin/biome check "apps/native/app/(employer)/(tabs)/me.tsx"
```
Expected: 오류 0.

- [ ] **Step 3: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 구인자 내 정보 허브
- (tabs)/me: 업체명·인증 배지 ProfileCard + 업체 정보/사업자 인증/계정 설정 ListGroup + 팀 관리 웹 안내 + 로그아웃
```

---

### Task 8: 업체 정보 수정 화면

**Files:**
- Create: `apps/native/app/(employer)/me/organization.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.onboarding.getMine`(→ `employerOrganizationProfiles[0]` = `{ organizationId, displayName, verificationStatus }`), `orpc.bambi.onboarding.upsertEmployerOrganizationProfile`(input `{ organizationId; displayName; businessRegistrationNumber? }`), `businessErrorMessage`(`@/src/lib/employer/business`), heroui `Input`·`TextField`·`Button`·`Surface`, `BambiScreen`·`StateCard`·`LoadingState`·`Pill`.
- **upsertEmployerOrganizationProfile 필드(확정):** `{ organizationId, displayName (1–120), businessRegistrationNumber? (1–40) }`. **업종·지역·소개 필드는 스키마에 없다** — 이 화면은 `displayName`만 편집한다(web /employer/settings와 동일). 또한 서버가 미인증 조직(admin 제외)의 이 호출을 FORBIDDEN("운영자 승인 후 조직 설정을 변경할 수 있습니다.")로 막으므로, 인증 완료가 아니면 입력을 비활성화하고 안내한다.

- [ ] **Step 1: 화면 작성**

`apps/native/app/(employer)/me/organization.tsx`:
```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiScreen,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { verificationStatusLabels } from "@/src/lib/bambi-native";
import { businessErrorMessage } from "@/src/lib/employer/business";
import { orpc, queryClient } from "@/src/lib/orpc";

export default function EmployerOrganizationScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const currentName = organizationProfile?.displayName ?? "";
	const [displayName, setDisplayName] = useState(currentName);

	useEffect(() => {
		if (currentName) {
			setDisplayName(currentName);
		}
	}, [currentName]);

	const updateMutation = useMutation(
		orpc.bambi.onboarding.upsertEmployerOrganizationProfile.mutationOptions({
			onError: (error) => {
				Alert.alert("저장하지 못했어요", businessErrorMessage(error));
			},
			onSuccess: async () => {
				Alert.alert("저장했어요", "업체명을 변경했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);

	if (mineQuery.isLoading) {
		return <LoadingState label="업체 정보를 불러오고 있어요." />;
	}

	if (!organizationProfile) {
		return (
			<BambiScreen>
				<StateCard
					description="사업자 인증에서 업체 정보를 먼저 제출하면 여기서 수정할 수 있어요."
					title="등록된 업체가 없어요"
				/>
			</BambiScreen>
		);
	}

	const status = organizationProfile.verificationStatus;
	const canEdit = status === "verified";
	const trimmed = displayName.trim();
	const nameError =
		trimmed.length === 0 ? "업체명을 입력해 주세요." : null;

	return (
		<BambiScreen>
			<Surface className="flex-row items-center justify-between gap-2 rounded-lg p-4" variant="secondary">
				<Text className="font-semibold text-foreground" selectable>
					인증 상태
				</Text>
				<Pill tone={status === "verified" ? "success" : "neutral"}>
					{verificationStatusLabels[
						status as keyof typeof verificationStatusLabels
					] ?? status}
				</Pill>
			</Surface>

			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="gap-1">
					<Text className="font-semibold text-base text-foreground">업체명</Text>
					<Text className="text-muted text-sm">
						공고와 채팅에 노출되는 업체 이름이에요.
					</Text>
				</View>
				<TextField>
					<Input
						accessibilityLabel="업체명"
						editable={canEdit}
						onChangeText={setDisplayName}
						placeholder="공고에 노출되는 업체명"
						value={displayName}
					/>
				</TextField>
				{canEdit ? null : (
					<Text className="text-muted text-xs">
						업체명 수정은 인증 완료 후에 할 수 있어요. 사업자 인증을 먼저 마쳐 주세요.
					</Text>
				)}
				{nameError && canEdit ? (
					<Text className="text-danger text-sm">{nameError}</Text>
				) : null}
				<Button
					isDisabled={
						!canEdit ||
						nameError !== null ||
						trimmed === currentName.trim() ||
						updateMutation.isPending
					}
					onPress={() =>
						updateMutation.mutate({
							displayName: trimmed,
							organizationId: organizationProfile.organizationId,
						})
					}
				>
					<Button.Label>
						{updateMutation.isPending ? "저장 중" : "저장"}
					</Button.Label>
				</Button>
			</Surface>
		</BambiScreen>
	);
}
```

- [ ] **Step 2: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check "apps/native/app/(employer)/me/organization.tsx"
node_modules/.bin/biome check "apps/native/app/(employer)/me/organization.tsx"
```
Expected: 오류 0.

- [ ] **Step 3: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 업체 정보 수정 화면(업체명)
- me/organization: upsertEmployerOrganizationProfile로 displayName 수정(스키마상 업종·지역·소개 없음), 인증 완료 조직만 편집 가능·미인증 안내
```

---

### Task 9: 사업자 인증 화면

**Files:**
- Create: `apps/native/src/components/business-document-section.tsx`
- Create: `apps/native/app/(employer)/me/business.tsx`

**Interfaces:**
- Consumes:
  - `orpc.bambi.onboarding.getMine`(→ `employerOrganizationProfiles[0]` = `{ organizationId?, displayName, businessRegistrationNumber, representativeName, businessStartDate, draftDisplayName, draftBusinessRegistrationNumber, draftRepresentativeName, draftBusinessStartDate, biznumCheckedAt, biznumStatusCode, verificationStatus, verificationNote, businessDocuments[] }`, `biznumCheckEnabled: boolean`). 문서 항목 = `{ byteSize, category: "image" | "pdf", fileName, id, mimeType, objectUrl }`(objectUrl은 앱 경로라 native에서 직접 못 연다).
  - `orpc.bambi.onboarding.prepareEmployerBusinessDocuments`(input 4필드 → `{ organizationId }`), `submitEmployerBusinessInfo`(input 4필드), `saveEmployerBusinessDraft`(input 4필드 + organizationId), `createBusinessDocumentUpload`(input `{ organizationId; byteSize; fileName; mimeType }` → intent), `addBusinessDocument`(input intent + `storageKey`), `deleteBusinessDocument`(input `{ documentId }`), `createBusinessDocumentViewUrl`(input `{ documentId; download }` → `{ url }`).
  - `validateBusinessForm`·`resolveBusinessScreenState`·`getBiznumCheckText`·`businessErrorMessage`(`@/src/lib/employer/business`), `getDocumentAsync`(`expo-document-picker`), `openBrowserAsync`(`expo-web-browser`).
- **문서 미리보기(확정):** getMine의 `objectUrl`은 앱 경로(`/bambi/business-documents/{id}`)라 native에서 직접 못 연다 → `createBusinessDocumentViewUrl({ documentId, download: false })`로 60초 서명 URL을 받아 `openBrowserAsync(url)`로 연다.
- Produces: `BusinessDocumentSection` `{ documents: BusinessDocumentItem[]; canDelete: boolean; organizationId: null | string; requiresConfirmation: boolean; onEnsureOrganizationId: () => Promise<string>; onChanged: () => Promise<void> }` — 서류 목록·업로드·미리보기·삭제 UI(상세 계약은 아래 구현).

- [ ] **Step 1: 사업자 서류 섹션 작성**

`apps/native/src/components/business-document-section.tsx`:
```tsx
import { getDocumentAsync } from "expo-document-picker";
import { openBrowserAsync } from "expo-web-browser";
import { Button } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { businessErrorMessage } from "@/src/lib/employer/business";
import { orpc } from "@/src/lib/orpc";

export interface BusinessDocumentItem {
	byteSize: number;
	category: "image" | "pdf";
	fileName: string;
	id: string;
	mimeType: string;
}

const MAX_BUSINESS_DOCUMENTS = 5;
const BUSINESS_DOC_MAX_BYTES = 10_485_760; // 10MB, 서버 CHAT_MEDIA_MAX_BYTES
const BUSINESS_DOC_MIME_TYPES = new Set([
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
]);

interface Props {
	canDelete: boolean;
	documents: BusinessDocumentItem[];
	onChanged: () => Promise<void>;
	// 조직이 아직 없으면(none 상태) 부모가 prepareEmployerBusinessDocuments로 만든 뒤 id를 준다.
	onEnsureOrganizationId: () => Promise<string>;
}

export function BusinessDocumentSection({
	canDelete,
	documents,
	onChanged,
	onEnsureOrganizationId,
}: Props) {
	const [isBusy, setIsBusy] = useState(false);
	const uploadMutation = useMutation(
		orpc.bambi.onboarding.createBusinessDocumentUpload.mutationOptions()
	);
	const addMutation = useMutation(
		orpc.bambi.onboarding.addBusinessDocument.mutationOptions()
	);
	const deleteMutation = useMutation(
		orpc.bambi.onboarding.deleteBusinessDocument.mutationOptions()
	);
	const viewMutation = useMutation(
		orpc.bambi.onboarding.createBusinessDocumentViewUrl.mutationOptions()
	);

	const handleAdd = async () => {
		if (documents.length >= MAX_BUSINESS_DOCUMENTS) {
			Alert.alert(
				"서류는 최대 5개",
				`서류는 최대 ${MAX_BUSINESS_DOCUMENTS}개까지 올릴 수 있어요.`
			);
			return;
		}

		const picked = await getDocumentAsync({
			copyToCacheDirectory: true,
			multiple: false,
			type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
		});

		const asset = picked.canceled ? null : picked.assets[0];

		if (!asset) {
			return;
		}

		setIsBusy(true);

		try {
			const blob = await (await fetch(asset.uri)).blob();
			const mimeType = asset.mimeType ?? blob.type;

			if (!BUSINESS_DOC_MIME_TYPES.has(mimeType)) {
				Alert.alert(
					"등록할 수 없는 파일",
					"JPG, PNG, WebP, PDF 파일만 올릴 수 있어요."
				);
				return;
			}

			if (blob.size < 1 || blob.size > BUSINESS_DOC_MAX_BYTES) {
				Alert.alert("등록할 수 없는 파일", "파일 크기는 10MB 이하여야 해요.");
				return;
			}

			const organizationId = await onEnsureOrganizationId();
			const intent = await uploadMutation.mutateAsync({
				byteSize: blob.size,
				fileName: asset.name,
				mimeType,
				organizationId,
			});

			if (!intent.uploadUrl.startsWith("https://")) {
				Alert.alert(
					"지금은 서류를 올릴 수 없어요",
					"잠시 후 다시 시도해 주세요."
				);
				return;
			}

			const response = await fetch(intent.uploadUrl, {
				body: blob,
				headers: { "Content-Type": intent.mimeType },
				method: "PUT",
			});

			if (!response.ok) {
				throw new Error("upload failed");
			}

			await addMutation.mutateAsync({
				byteSize: blob.size,
				fileName: asset.name,
				mimeType,
				organizationId,
				storageKey: intent.storageKey,
			});
			await onChanged();
			Alert.alert("올렸어요", "사업자 인증 서류를 올렸어요.");
		} catch (error) {
			Alert.alert("올리지 못했어요", businessErrorMessage(error));
		} finally {
			setIsBusy(false);
		}
	};

	const handleView = async (documentId: string) => {
		try {
			const { url } = await viewMutation.mutateAsync({
				documentId,
				download: false,
			});
			await openBrowserAsync(url);
		} catch (error) {
			Alert.alert("열지 못했어요", businessErrorMessage(error));
		}
	};

	const handleDelete = (documentId: string) => {
		Alert.alert("서류를 삭제할까요?", "삭제한 서류는 되돌릴 수 없어요.", [
			{ style: "cancel", text: "취소" },
			{
				onPress: async () => {
					try {
						await deleteMutation.mutateAsync({ documentId });
						await onChanged();
					} catch (error) {
						Alert.alert("삭제하지 못했어요", businessErrorMessage(error));
					}
				},
				style: "destructive",
				text: "삭제",
			},
		]);
	};

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-base text-foreground">
					사업자 인증 서류
				</Text>
				<Text className="text-muted text-xs">
					{`JPG, PNG, WebP, PDF · 파일당 10MB · 최대 ${MAX_BUSINESS_DOCUMENTS}개`}
				</Text>
			</View>

			{documents.length === 0 ? (
				<Text className="text-muted text-sm">
					등록된 사업자 인증 서류가 없어요.
				</Text>
			) : (
				documents.map((document) => (
					<View
						className="flex-row items-center gap-3 rounded-lg border border-border p-3"
						key={document.id}
					>
						<Text className="flex-1 text-foreground text-sm" numberOfLines={1}>
							{document.fileName}
						</Text>
						<Pressable
							className="rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() => handleView(document.id)}
						>
							<Text className="text-foreground text-sm">보기</Text>
						</Pressable>
						{canDelete ? (
							<Pressable
								className="rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
								onPress={() => handleDelete(document.id)}
							>
								<Text className="text-danger-soft-foreground text-sm dark:text-danger">
									삭제
								</Text>
							</Pressable>
						) : null}
					</View>
				))
			)}

			{canDelete ? null : (
				<Text className="text-muted text-xs">
					심사 중에도 서류를 추가할 수 있지만, 기존 서류는 삭제할 수 없어요.
				</Text>
			)}

			<Button
				isDisabled={isBusy || documents.length >= MAX_BUSINESS_DOCUMENTS}
				onPress={handleAdd}
				variant="secondary"
			>
				<Button.Label>{isBusy ? "업로드 중" : "이미지 또는 PDF 추가"}</Button.Label>
			</Button>
		</View>
	);
}
```
(상단 import에 `import { useMutation } from "@tanstack/react-query";`를 추가한다.)

- [ ] **Step 2: 사업자 인증 화면 작성**

`apps/native/app/(employer)/me/business.tsx`:
```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Dialog, Input, Surface, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiScreen,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import {
	type BusinessDocumentItem,
	BusinessDocumentSection,
} from "@/src/components/business-document-section";
import { verificationStatusLabels } from "@/src/lib/bambi-native";
import {
	businessErrorMessage,
	getBiznumCheckText,
	resolveBusinessScreenState,
	validateBusinessForm,
} from "@/src/lib/employer/business";
import { orpc, queryClient } from "@/src/lib/orpc";

// 서버는 개업일자를 YYYY-MM-DD 문자열로 받는다. getMine의 businessStartDate가 8자리면
// 하이픈을 넣어 초기값으로 쓴다.
const toDateInput = (value: null | string | undefined): string => {
	if (!value) {
		return "";
	}
	if (/^\d{8}$/.test(value)) {
		return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
	}
	return value.slice(0, 10);
};

export default function EmployerBusinessScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const biznumCheckEnabled = mineQuery.data?.biznumCheckEnabled ?? true;

	const [displayName, setDisplayName] = useState("");
	const [brn, setBrn] = useState("");
	const [representativeName, setRepresentativeName] = useState("");
	const [startDate, setStartDate] = useState("");
	const [confirmOpen, setConfirmOpen] = useState(false);

	useEffect(() => {
		if (!organizationProfile) {
			return;
		}
		setDisplayName(
			organizationProfile.draftDisplayName ?? organizationProfile.displayName ?? ""
		);
		setBrn(
			organizationProfile.draftBusinessRegistrationNumber ??
				organizationProfile.businessRegistrationNumber ??
				""
		);
		setRepresentativeName(
			organizationProfile.draftRepresentativeName ??
				organizationProfile.representativeName ??
				""
		);
		setStartDate(
			toDateInput(
				organizationProfile.draftBusinessStartDate ??
					organizationProfile.businessStartDate
			)
		);
	}, [organizationProfile]);

	const invalidateMine = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.onboarding.getMine.queryKey(),
		});

	const prepareMutation = useMutation(
		orpc.bambi.onboarding.prepareEmployerBusinessDocuments.mutationOptions()
	);
	const submitMutation = useMutation(
		orpc.bambi.onboarding.submitEmployerBusinessInfo.mutationOptions({
			onError: (error) => {
				Alert.alert("제출하지 못했어요", businessErrorMessage(error));
			},
			onSuccess: async () => {
				await invalidateMine();
				Alert.alert(
					"제출했어요",
					"업체 정보를 제출했어요. 운영자 승인을 기다려 주세요."
				);
			},
		})
	);

	if (mineQuery.isLoading) {
		return <LoadingState label="사업자 인증 정보를 불러오고 있어요." />;
	}

	const status = organizationProfile?.verificationStatus ?? "none";
	const screenState = resolveBusinessScreenState(status);
	const documents = (organizationProfile?.businessDocuments ??
		[]) as BusinessDocumentItem[];

	const ensureOrganizationId = async (): Promise<string> => {
		if (organizationProfile?.organizationId) {
			return organizationProfile.organizationId;
		}

		const validation = validateBusinessForm({
			businessRegistrationNumber: brn,
			businessStartDate: startDate,
			displayName,
			representativeName,
		});

		if (!validation.ok) {
			throw new Error("업체 정보를 먼저 모두 입력해 주세요.");
		}

		const { organizationId } = await prepareMutation.mutateAsync(
			validation.input
		);
		await invalidateMine();

		return organizationId;
	};

	const submit = () => {
		const validation = validateBusinessForm({
			businessRegistrationNumber: brn,
			businessStartDate: startDate,
			displayName,
			representativeName,
		});

		if (!validation.ok) {
			Alert.alert("입력을 확인해 주세요", validation.message);
			return;
		}

		submitMutation.mutate(validation.input);
	};

	const handleSubmitPress = () => {
		if (screenState.requiresConfirmation) {
			setConfirmOpen(true);
			return;
		}
		submit();
	};

	return (
		<BambiScreen>
			<Surface className="flex-row items-center justify-between gap-2 rounded-lg p-4" variant="secondary">
				<Text className="font-semibold text-foreground" selectable>
					인증 상태
				</Text>
				<Pill tone={status === "verified" ? "success" : "neutral"}>
					{verificationStatusLabels[
						status as keyof typeof verificationStatusLabels
					] ?? status}
				</Pill>
			</Surface>

			{screenState.statusNotice ? (
				<Surface className="rounded-lg p-4" variant="secondary">
					<Text className="text-muted text-sm leading-5" selectable>
						{screenState.statusNotice}
					</Text>
				</Surface>
			) : null}

			{organizationProfile?.verificationNote ? (
				<Surface className="rounded-lg p-4" variant="secondary">
					<Text className="text-muted text-xs">검수 메모</Text>
					<Text className="text-foreground text-sm leading-5" selectable>
						{organizationProfile.verificationNote}
					</Text>
				</Surface>
			) : null}

			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<TextField>
					<Input
						accessibilityLabel="업체명"
						editable={!screenState.inputsLocked}
						onChangeText={setDisplayName}
						placeholder="업체명 (예: 밤비 라운지)"
						value={displayName}
					/>
				</TextField>
				<TextField>
					<Input
						accessibilityLabel="사업자 등록 번호"
						editable={!screenState.inputsLocked}
						keyboardType="numbers-and-punctuation"
						onChangeText={setBrn}
						placeholder="000-00-00000"
						value={brn}
					/>
				</TextField>
				<TextField>
					<Input
						accessibilityLabel="대표자 성명"
						editable={!screenState.inputsLocked}
						onChangeText={setRepresentativeName}
						placeholder="대표자 성명 (예: 홍길동)"
						value={representativeName}
					/>
				</TextField>
				<TextField>
					<Input
						accessibilityLabel="개업일자"
						editable={!screenState.inputsLocked}
						onChangeText={setStartDate}
						placeholder="개업일자 YYYY-MM-DD"
						value={startDate}
					/>
				</TextField>
				<Text className="text-muted text-xs leading-5">
					{biznumCheckEnabled
						? "대표자 성명과 개업일자는 사업자등록증에 적힌 그대로 입력해야 국세청 진위확인을 통과합니다."
						: "국세청 진위확인은 곧 준비될 기능이에요. 지금은 운영자가 사업자등록증과 직접 대조해 승인하니, 사업자등록증 그대로 입력해 주세요."}
				</Text>
				<Text className="text-muted text-xs">
					{`국세청 확인 · ${getBiznumCheckText({
						biznumCheckEnabled,
						biznumCheckedAt: organizationProfile?.biznumCheckedAt ?? null,
						biznumStatusCode: organizationProfile?.biznumStatusCode ?? null,
					})}`}
				</Text>
			</Surface>

			<Surface className="gap-3 rounded-lg p-4" variant="secondary">
				<BusinessDocumentSection
					canDelete={screenState.canDeleteDocuments}
					documents={documents}
					onChanged={invalidateMine}
					onEnsureOrganizationId={ensureOrganizationId}
				/>
			</Surface>

			<Button
				isDisabled={screenState.inputsLocked || submitMutation.isPending}
				onPress={handleSubmitPress}
			>
				<Button.Label>
					{submitMutation.isPending ? "제출 중" : screenState.submitLabel}
				</Button.Label>
			</Button>

			<Dialog isOpen={confirmOpen} onOpenChange={setConfirmOpen}>
				<Dialog.Portal>
					<Dialog.Overlay />
					<Dialog.Content>
						<Dialog.Title>업체 정보를 변경하시겠습니까?</Dialog.Title>
						<Dialog.Description>
							업체 정보를 제출하면 인증 대기 상태로 전환되며, 운영자 승인 전까지 기존
							공고와 광고가 비공개 처리되고 채팅 송수신이 제한됩니다.
						</Dialog.Description>
						<View className="flex-row justify-end gap-2 pt-2">
							<Button
								onPress={() => setConfirmOpen(false)}
								variant="tertiary"
							>
								<Button.Label>취소</Button.Label>
							</Button>
							<Button
								onPress={() => {
									setConfirmOpen(false);
									submit();
								}}
							>
								<Button.Label>변경사항 제출</Button.Label>
							</Button>
						</View>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog>
		</BambiScreen>
	);
}
```
(임시 저장 `saveEmployerBusinessDraft`는 web처럼 500ms 디바운스 자동저장으로 넣을 수 있으나, 최소 구현에서는 제출 성공/prepare로 충분하다. Ruling: 자동저장은 이연한다 — 넣으려면 useEffect 디바운스 + `verified`/`changes_unsubmitted`에서만 호출하고 getMine invalidate. 이 Task 범위에서는 제출·prepare만 필수로 하고, 자동저장 추가 시 이 문단의 조건대로 구현한다.)

- [ ] **Step 3: 타입·린트**

Run (cwd 루트):
```bash
pnpm --filter native check-types
pnpm dlx ultracite check apps/native/src/components/business-document-section.tsx "apps/native/app/(employer)/me/business.tsx"
node_modules/.bin/biome check apps/native/src/components/business-document-section.tsx "apps/native/app/(employer)/me/business.tsx"
```
Expected: 오류 0.

- [ ] **Step 4: Commit (컨트롤러 — 메시지 초안)**

```
feat(native): 사업자 인증 화면(입력·서류 업로드/미리보기/삭제·상태 규칙)
- me/business: 업체명·사업자등록번호·대표자·개업일자 입력, 국세청 확인 문구, 상태별 잠금/재제출/변경 확인 Dialog
- business-document-section: expo-document-picker 업로드(blob 실측 byteSize)·createBusinessDocumentViewUrl 미리보기·삭제, pending 삭제 잠금
- none 상태는 prepareEmployerBusinessDocuments로 조직 생성 후 서류 업로드
```

---

### Task 10: 최종 검증·정리

**Files:** (전체)

- [ ] **Step 1: 전체 native 테스트**

Run (cwd 루트):
```bash
pnpm --filter native test
```
Expected: chat + employer 스위트 전부 passed(0 failed).

Run bambi-native 콜로케이션 테스트:
```bash
node_modules/.bin/vitest run --root apps/native --dir src/lib
```
Expected: 협의 케이스 포함 passed. (참고: `apps/native/vitest.config.ts`의 include가 `test/**`라 `pnpm --filter native test`는 콜로케이션 me-*·bambi-native 테스트를 실행하지 않는다 — 그 스위트는 이 `--dir src/lib` 명령으로 별도 확인한다. include 확장은 이 플랜 범위 밖.)

- [ ] **Step 2: 타입 검사**

Run (cwd 루트):
```bash
pnpm --filter native check-types
```
Expected: 오류 0.

- [ ] **Step 3: 린트(변경 파일 전수)**

Run (cwd 루트):
```bash
pnpm dlx ultracite check apps/native/src/lib/employer apps/native/src/lib/bambi-native.ts apps/native/test/lib/employer apps/native/src/components "apps/native/app/(employer)"
node_modules/.bin/biome check apps/native/src/lib/employer apps/native/src/lib/bambi-native.ts apps/native/test/lib/employer apps/native/src/components "apps/native/app/(employer)"
```
Expected: 오류 0. (biome는 `noNestedTernary`·`noUselessUndefined` 등 추가 규칙이 있어 ultracite와 함께 돌린다. 삼항 중첩·불필요한 `undefined` 반환이 걸리면 이름 붙인 함수/early-return으로 푼다.)

- [ ] **Step 4: 잔여 확인**

- app/_layout.tsx가 `(employer)`를 `headerShown: false`로 등록하고 있는지 확인(이미 있음 — 수정 불필요).
- `(employer)/index.tsx`가 삭제되고 `(tabs)/index.tsx`만 남았는지 확인.
- 임의 px(`[Npx]`) 사용이 없는지 grep: `grep -rn "\[[0-9]\+px\]" "apps/native/app/(employer)" apps/native/src/components/employer-header.tsx apps/native/src/components/job-image-picker-section.tsx apps/native/src/components/job-description-block-editor.tsx apps/native/src/components/business-document-section.tsx` → 0건.
- DB enum 원값 직접 렌더가 없는지 확인(status·verificationStatus·블록 타입·업종·급여단위 모두 라벨 맵 경유).

- [ ] **Step 5: Commit (필요 시 — 컨트롤러 메시지 초안)**

```
chore(native): 구인자 영역 최종 검증(테스트·타입·린트 0)
- native vitest(chat+employer) 통과, colocated src/lib 스위트 통과
- check-types 0, ultracite·biome 0
```

---

## Self-Review

**1. Spec coverage**
- 2절 내비 셸(하단 3탭·역할 게이트·헤더·채팅 플레이스홀더) → Task 2. Stack 화면 SeekerStackHeader 재사용 확정. 설정은 seeker `me/settings` 공유(Task 7 링크).
- 3절 공고관리 탭(인증 배지·유도 카드·등록 primary·상태 요약·목록·수정/삭제·환급 문구·빈 목록) → Task 3.
- 4절 폼(기존 필드 + 스위치 + 블록 + 이미지 + 수정 초기값 + update 계약 + 웹 안내) → Task 4·5·6. exposureType standard·광고/결제/부스트/포인트 미전송 준수; 수정 시 광고 붙은 공고만 패스스루(확정).
- 5절 내 정보(허브·업체 정보·사업자 인증·설정) → Task 7·8·9. 업체 정보는 스키마상 displayName만(확정, 스펙과 차이). 서류 미리보기 createBusinessDocumentViewUrl(확정).
- 6절 공통 규칙(순수 로직 lib+vitest·heroui·라벨 맵·검증 명령·빌드 금지·의존성 금지) → Global Constraints + Task 1 + 각 Task 검증 단계.
- 7절 범위 밖(광고·결제·슬라이싱·배너·업체 채팅·팀 관리·카메라·리사이즈) → 전 Task에서 제외, 채팅·팀은 플레이스홀더/웹 안내.

**2. Placeholder scan**: TBD/TODO 없음. Task 5의 `useMutationCreateMediaUpload` 우회와 Task 9의 자동저장은 "Ruling" 문단에서 최종 코드(직접 호출/이연)를 명시했다 — 실행 시 그 지시대로 확정 코드를 작성한다.

**3. Type consistency**: `NativeJobPostInput`(payAmount `null | number`, media/blocks/switch/광고 확장)은 Task 1에서 정의하고 Task 4·5·6이 동일 시그니처로 소비. `JobMediaUploadItem`은 job-media.ts 정의를 bambi-native·job-image-picker-section·edit.tsx가 공유. `DeleteRefundPreview`·`getJobDisplayStatus`·`getJobStatusNote`는 Task 1 정의를 Task 3이 소비. `resolveBusinessScreenState`·`validateBusinessForm`·`businessErrorMessage`·`getBiznumCheckText`는 Task 1 정의를 Task 8·9가 소비. `EditableAdSource`/`buildJobUpdateData`는 Task 1 정의를 Task 6이 소비. `verificationStatusLabels`는 5키로 확장 후 Task 3·7·8·9가 소비.

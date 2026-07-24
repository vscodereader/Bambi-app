# 운영자 콘솔 정비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 계획은 **dynamic workflow(Workflow 툴)**로 병렬 실행한다. 커밋·DB·검증은 컨트롤러가 순차 수행하고, 서브에이전트는 편집만 한다(커밋·git 금지).

**Goal:** 운영자 콘솔에서 구인자 공고 운영 관리 흐름을 정비한다 — 공고/결제 컬럼 중복 제거·RowActions 도입, 헤더 nav 6개 재편, 무통장입금 계좌 0개 결제 차단(버그), 광고 안내 가격옵션 할인 표현 재디자인.

**Architecture:** 4개 워크스트림이 **서로 겹치는 파일이 없어** 병렬 실행 가능하다(WS1: 공고/결제 콘솔 · WS2: nav · WS3: 무통장 · WS4: 광고가). WS1은 내부 순서 의존(공유 모듈 → 페이지 재배선)이 있어 한 에이전트가 순차 처리, 나머지는 독립.

**Tech Stack:** Next.js 16(App Router, RSC) · shadcn/base-ui + Tailwind v4(코럴 DS) · oRPC + drizzle · vitest(로직·소스스캔 테스트) · TanStack Query.

## Global Constraints

- **빌드/dev 서버 실행 금지.** 검증은 `pnpm check-types` + ultracite + vitest만. 시각 확인은 사용자가 IDE HMR로.
- **db:push 금지.** 이 계획은 스키마 변경이 없어 마이그레이션 불필요(무통장 검증은 기존 `bambiSiteSettings.bankAccounts` 컬럼을 읽기만 함).
- **UI 규칙(apps/web/CLAUDE.md):** shadcn 컴포넌트 우선 · 인라인 style 금지 · 시맨틱/브랜드 토큰(`text-coral-600` 등, raw hex 금지) · `cn()` · `gap-*`(space-* 금지) · base-ui는 `render` prop(asChild 아님) · `rounded-none` 금지.
- **enum 원값 노출 금지:** 라벨은 `@/lib/bambi/exposure`의 `*_LABELS` 맵 경유.
- **web 테스트 실행 경로:** apps/web엔 test 스크립트가 없다. 루트에서 `pnpm exec vitest run <파일경로>`로 직접 실행. web 테스트는 전부 `readFileSync` 소스 문자열 스캔(렌더 테스트·testing-library 없음).
- **api 테스트 실행:** `pnpm --filter @bambi-app/api exec vitest run <파일>`. 실 DB(`apps/server/.env`의 bambi_dev)에 붙으며 fixture는 try/finally로 자정리, organization 시드 시 `createdAt: new Date()` 수동 지정 필수.
- **커밋:** 컨트롤러가 워크스트림별로 파일 세트를 나눠 순차 커밋(한국어 `type:` 제목 + 촘촘한 `- ` 블릿, `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).

---

## 워크스트림 1 — 공고/결제 콘솔 (중복 제거 + RowActions) · 순차

### Task 1.1: `getExpiryTone`를 공유 모듈(exposure.ts)로 이동

**Files:**
- Modify: `apps/web/src/lib/bambi/exposure.ts` (함수 추가·export)
- Test: `apps/web/src/lib/bambi/exposure.test.ts` (없으면 생성, 있으면 describe 추가)

**Interfaces:**
- Produces: `getExpiryTone(label: string): "danger" | "default" | "good"` — `expiryLabel` 결과 문자열을 StatusBadge tone으로 매핑.

- [ ] **Step 1: 실패 테스트 작성** — `apps/web/src/lib/bambi/exposure.test.ts`에 추가(파일 없으면 이 내용으로 생성):

```ts
import { describe, expect, it } from "vitest";
import { getExpiryTone } from "./exposure";

describe("getExpiryTone", () => {
	it("진행중은 good", () => {
		expect(getExpiryTone("진행중")).toBe("good");
	});
	it("만료는 danger", () => {
		expect(getExpiryTone("만료")).toBe("danger");
	});
	it("그 외는 default", () => {
		expect(getExpiryTone("대기")).toBe("default");
	});
});
```

- [ ] **Step 2: 실패 확인** — Run(루트): `pnpm exec vitest run apps/web/src/lib/bambi/exposure.test.ts`
  Expected: FAIL — `getExpiryTone` is not exported / not a function.

- [ ] **Step 3: 구현** — `exposure.ts` 하단에 export 추가:

```ts
// 노출 마감 라벨(expiryLabel 결과)을 StatusBadge tone으로 매핑. 공고 관리·결제 관리 공용.
export const getExpiryTone = (label: string): "danger" | "default" | "good" => {
	if (label === "진행중") {
		return "good";
	}

	if (label === "만료") {
		return "danger";
	}

	return "default";
};
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest run apps/web/src/lib/bambi/exposure.test.ts` → PASS.

- [ ] **Step 5: (커밋은 컨트롤러가 WS1 완료 후 일괄)** — 편집만 마치고 다음 태스크로.

---

### Task 1.2: 공유 컬럼 팩토리 `job-table-columns.tsx` 생성

**Files:**
- Create: `apps/web/src/components/bambi/job-table-columns.tsx`

**Interfaces:**
- Consumes: `getExpiryTone`(Task 1.1), `DataColumn<T>`(data-table.tsx), `StatusBadge`, exposure.ts 라벨/헬퍼.
- Produces (모두 제네릭 컬럼 빌더, `DataColumn<T>` 반환):
  - `jobTitleColumn<T extends { title: string }>()`
  - `jobOrganizationColumn<T extends { organizationDisplayName: string }>()` — 헤더 "업소"
  - `jobStatusColumn<T extends JobStatusFields>()`
  - `exposureTypeColumn<T extends { exposureType: keyof typeof EXPOSURE_TYPE_LABELS }>()`
  - `paymentStatusColumn<T extends { paymentStatus: keyof typeof PAYMENT_STATUS_LABELS }>()`
  - `expiryColumn<T extends { exposureEndsAt: ExposureEndsAt }>(options?: { header?: string; withRemainingDays?: boolean })`

- [ ] **Step 1: 파일 생성** — 아래 전문 작성:

```tsx
import type { DataColumn } from "@/components/bambi/data-table";
import { StatusBadge } from "@/components/bambi/status-badge";
import {
	EXPOSURE_TYPE_LABELS,
	expiryLabel,
	getExpiryTone,
	getJobDisplayStatus,
	PAYMENT_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";

// 행 필드 타입을 헬퍼에서 파생해 JobRow/PaymentJob에 직접 의존하지 않는다.
type JobStatusFields = Parameters<typeof getJobDisplayStatus>[0];
type ExposureEndsAt = Parameters<typeof expiryLabel>[0];

export function jobTitleColumn<T extends { title: string }>(): DataColumn<T> {
	return {
		id: "title",
		header: "공고 제목",
		sortValue: (row) => row.title,
		cell: (row) => (
			<span className="break-keep font-medium text-foreground">
				{row.title}
			</span>
		),
	};
}

// 헤더 "업소"로 통일(결제 관리의 "업체"를 흡수).
export function jobOrganizationColumn<
	T extends { organizationDisplayName: string },
>(): DataColumn<T> {
	return {
		id: "organizationDisplayName",
		header: "업소",
		sortValue: (row) => row.organizationDisplayName,
		cell: (row) => (
			<span className="break-keep text-muted-foreground">
				{row.organizationDisplayName}
			</span>
		),
	};
}

export function jobStatusColumn<T extends JobStatusFields>(): DataColumn<T> {
	return {
		id: "status",
		header: "공고 상태",
		sortValue: (row) =>
			getJobDisplayStatus({
				paymentStatus: row.paymentStatus,
				status: row.status,
			}).label,
		cell: (row) => {
			const display = getJobDisplayStatus({
				paymentStatus: row.paymentStatus,
				status: row.status,
			});

			return <StatusBadge tone={display.tone}>{display.label}</StatusBadge>;
		},
	};
}

export function exposureTypeColumn<
	T extends { exposureType: keyof typeof EXPOSURE_TYPE_LABELS },
>(): DataColumn<T> {
	return {
		id: "exposureType",
		header: "노출 상품",
		sortValue: (row) => EXPOSURE_TYPE_LABELS[row.exposureType],
		cell: (row) => (
			<StatusBadge>{EXPOSURE_TYPE_LABELS[row.exposureType]}</StatusBadge>
		),
	};
}

export function paymentStatusColumn<
	T extends { paymentStatus: keyof typeof PAYMENT_STATUS_LABELS },
>(): DataColumn<T> {
	return {
		id: "paymentStatus",
		header: "결제 상태",
		sortValue: (row) => PAYMENT_STATUS_LABELS[row.paymentStatus],
		cell: (row) => (
			<StatusBadge tone={row.paymentStatus === "paid" ? "good" : "warning"}>
				{PAYMENT_STATUS_LABELS[row.paymentStatus]}
			</StatusBadge>
		),
	};
}

// withRemainingDays=true: 공고 관리(헤더 "노출 마감", 배지 + 남은 일수).
// false: 결제 관리(헤더 "만료 상태", 배지만).
export function expiryColumn<T extends { exposureEndsAt: ExposureEndsAt }>(
	options?: { header?: string; withRemainingDays?: boolean }
): DataColumn<T> {
	const withRemainingDays = options?.withRemainingDays ?? false;
	const header =
		options?.header ?? (withRemainingDays ? "노출 마감" : "만료 상태");

	return {
		id: "expiry",
		header,
		sortValue: (row) =>
			withRemainingDays
				? (remainingDays(row.exposureEndsAt) ?? Number.POSITIVE_INFINITY)
				: expiryLabel(row.exposureEndsAt),
		cell: (row) => {
			const label = expiryLabel(row.exposureEndsAt);

			if (!withRemainingDays) {
				return <StatusBadge tone={getExpiryTone(label)}>{label}</StatusBadge>;
			}

			const days = remainingDays(row.exposureEndsAt);

			return (
				<div className="flex items-center gap-2">
					<StatusBadge tone={getExpiryTone(label)}>{label}</StatusBadge>
					{days !== null && days > 0 ? (
						<span className="whitespace-nowrap text-muted-foreground text-xs">
							{`${days}일`}
						</span>
					) : null}
				</div>
			);
		},
	};
}
```

- [ ] **Step 2: 타입 확인** — Run: `pnpm --filter web check-types`
  Expected: 이 파일 관련 오류 없음(아직 소비처 없음).

---

### Task 1.3: 공용 `RowActions`(DropdownMenu) 컴포넌트 생성

**Files:**
- Create: `apps/web/src/components/bambi/row-actions.tsx`

**Interfaces:**
- Produces: `RowActions({ actions, ariaLabel? })` + `RowAction` 타입 `{ key; label; onSelect?; href?; variant?: "default" | "destructive"; disabled? }`. `href` 있으면 `DropdownMenuItem`을 `Link`로 render, 아니면 `onClick`.

- [ ] **Step 1: 파일 생성** — content/page.tsx의 트리거 패턴(`DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost">}`)을 따른다:

```tsx
import { Button } from "@bambi-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import type { Route } from "next";
import Link from "next/link";
import { MoreHorizontalIcon } from "lucide-react";

export interface RowAction {
	// 각 항목의 안정 키.
	key: string;
	label: string;
	// href가 있으면 링크 이동, 없으면 onSelect 실행.
	href?: Route;
	onSelect?: () => void;
	variant?: "default" | "destructive";
	disabled?: boolean;
}

// 데이터 테이블 "관리" 컬럼용 공용 행 액션 드롭다운(kebab 트리거).
export function RowActions({
	actions,
	ariaLabel = "관리 메뉴",
}: {
	actions: RowAction[];
	ariaLabel?: string;
}) {
	if (actions.length === 0) {
		return null;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						aria-label={ariaLabel}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<MoreHorizontalIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				{actions.map((action) =>
					action.href ? (
						<DropdownMenuItem
							disabled={action.disabled}
							key={action.key}
							render={<Link href={action.href} />}
							variant={action.variant}
						>
							{action.label}
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							disabled={action.disabled}
							key={action.key}
							onClick={action.onSelect}
							variant={action.variant}
						>
							{action.label}
						</DropdownMenuItem>
					)
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

- [ ] **Step 2: 타입 확인** — Run: `pnpm --filter web check-types` → 이 파일 오류 없음.

---

### Task 1.4: `jobs/page.tsx` 재배선 (공유 팩토리 + RowActions)

**Files:**
- Modify: `apps/web/src/app/moderator/jobs/page.tsx`

**Interfaces:**
- Consumes: Task 1.2 컬럼 빌더, Task 1.3 `RowActions`.

- [ ] **Step 1: import 정리** — 상단 import에서 다음을 추가:

```tsx
import {
	exposureTypeColumn,
	expiryColumn,
	jobOrganizationColumn,
	jobStatusColumn,
	jobTitleColumn,
	paymentStatusColumn,
} from "@/components/bambi/job-table-columns";
import { RowActions } from "@/components/bambi/row-actions";
```

  그리고 로컬 `getExpiryTone`(68-78) 정의를 삭제한다. 팩토리로 이동해 로컬에서 쓰지 않게 되는 import(`EXPOSURE_TYPE_LABELS`, `expiryLabel`, `getJobDisplayStatus`, `PAYMENT_STATUS_LABELS`, `remainingDays`, `StatusBadge`)는 Step 4의 ultracite fix로 정리한다.

- [ ] **Step 2: `getJobColumns` 재작성** — 공유 컬럼 + 로컬(업종·지역·급여) + RowActions 관리 컬럼으로 교체. 업종·지역·급여 컬럼 정의는 **현재 코드 그대로 유지**한다(변경 없음):

```tsx
function getJobColumns(
	onRequestStatus: (job: JobRow) => void
): DataColumn<JobRow>[] {
	return [
		jobTitleColumn<JobRow>(),
		jobOrganizationColumn<JobRow>(),
		{
			id: "industryCategory",
			header: "업종",
			sortValue: (job) => job.industryCategory,
			cell: (job) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{job.industryCategory}
				</span>
			),
		},
		{
			id: "region",
			header: "지역",
			sortValue: (job) => job.region,
			cell: (job) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{job.region}
				</span>
			),
		},
		{
			id: "pay",
			header: "급여",
			sortValue: (job) => job.payAmount ?? -1,
			cell: (job) => (
				<span className="whitespace-nowrap text-foreground">
					{formatPay(job)}
				</span>
			),
		},
		jobStatusColumn<JobRow>(),
		exposureTypeColumn<JobRow>(),
		paymentStatusColumn<JobRow>(),
		expiryColumn<JobRow>({ withRemainingDays: true }),
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (job) => (
				<RowActions
					actions={[
						...(job.status === "published"
							? [
									{
										key: "hide",
										label: "숨김",
										onSelect: () => onRequestStatus(job),
										variant: "destructive" as const,
									},
								]
							: []),
						...(job.status === "hidden"
							? [
									{
										key: "show",
										label: "재공개",
										onSelect: () => onRequestStatus(job),
									},
								]
							: []),
						{
							key: "edit",
							label: "수정",
							href: `/moderator/jobs/${job.id}/edit` as Route,
						},
					]}
					ariaLabel={`${job.title} 관리 메뉴`}
				/>
			),
		},
	];
}
```

  확인 Dialog + `setStatusMutation`(사유 입력→숨김/재공개)은 **변경하지 않는다** — `onRequestStatus`가 기존대로 `pending` 상태를 세팅해 Dialog를 연다.

- [ ] **Step 3: 타입 확인** — Run: `pnpm --filter web check-types` → 오류 없음.

- [ ] **Step 4: 린트·미사용 import 정리** — Run: `pnpm exec ultracite fix apps/web/src/app/moderator/jobs/page.tsx`
  Expected: 미사용 import 제거, 포매팅 정리. 이후 `pnpm --filter web check-types` 재확인.

---

### Task 1.5: `payments/page.tsx` 재배선 (공유 팩토리 + "업소" 통일)

**Files:**
- Modify: `apps/web/src/app/moderator/payments/page.tsx`

**Interfaces:**
- Consumes: Task 1.2 컬럼 빌더.

- [ ] **Step 1: import 추가 + 로컬 정리** — 공유 빌더 import 추가:

```tsx
import {
	exposureTypeColumn,
	expiryColumn,
	jobOrganizationColumn,
	jobStatusColumn,
	jobTitleColumn,
	paymentStatusColumn,
} from "@/components/bambi/job-table-columns";
```

  로컬 `getExpiryTone`(37-47)와 `type Tone`(35) 정의를 삭제. 미사용이 되는 import(`StatusBadge`, `EXPOSURE_TYPE_LABELS`, `expiryLabel`, `getJobDisplayStatus`, `PAYMENT_STATUS_LABELS`)는 Step 3 ultracite fix로 정리(`remainingDays`·`formatAdPrice`·`formatDateTime`·`Checkbox`는 로컬 컬럼에서 계속 사용하므로 유지).

- [ ] **Step 2: `getPaymentColumns` 재작성** — select/exposureAmount/remainingDays/createdAt 로컬 컬럼은 **현재 코드 그대로 유지**하고, 공유 셀만 팩토리로 교체:

```tsx
function getPaymentColumns({
	allSelected,
	onToggleAll,
	onToggleRow,
	selectedIds,
	someSelected,
}: PaymentColumnsOptions): DataColumn<PaymentJob>[] {
	return [
		{
			id: "select",
			headerClassName: "w-10",
			cellClassName: "w-10",
			header: (
				<Checkbox
					aria-label="전체 선택"
					checked={allSelected}
					indeterminate={someSelected && !allSelected}
					onCheckedChange={(checked) => onToggleAll(checked === true)}
				/>
			),
			cell: (job) => (
				<Checkbox
					aria-label="공고 선택"
					checked={selectedIds.has(job.id)}
					onCheckedChange={() => onToggleRow(job.id)}
				/>
			),
		},
		jobTitleColumn<PaymentJob>(),
		jobOrganizationColumn<PaymentJob>(),
		jobStatusColumn<PaymentJob>(),
		exposureTypeColumn<PaymentJob>(),
		{
			id: "exposureAmount",
			header: "결제 금액",
			sortValue: (job) => job.exposureAmount ?? 0,
			cell: (job) =>
				job.exposureAmount === null ? (
					<span className="text-muted-foreground">무료</span>
				) : (
					<span className="whitespace-nowrap font-medium text-foreground">
						{formatAdPrice(job.exposureAmount)}
					</span>
				),
		},
		paymentStatusColumn<PaymentJob>(),
		{
			id: "remainingDays",
			header: "남은 기간",
			sortValue: (job) =>
				remainingDays(job.exposureEndsAt) ?? Number.POSITIVE_INFINITY,
			cell: (job) => {
				const days = remainingDays(job.exposureEndsAt);

				if (days === null) {
					return <span className="text-muted-foreground">-</span>;
				}

				return (
					<span className="whitespace-nowrap">{`${Math.max(0, days)}일`}</span>
				);
			},
		},
		expiryColumn<PaymentJob>(),
		{
			id: "createdAt",
			header: "등록일",
			sortValue: (job) => job.createdAt.getTime(),
			cell: (job) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{formatDateTime(job.createdAt)}
				</span>
			),
		},
	];
}
```

- [ ] **Step 3: 타입 확인 + 린트** — Run: `pnpm --filter web check-types` → 오류 없음. 이어 `pnpm exec ultracite fix apps/web/src/app/moderator/payments/page.tsx` 후 재확인.

**WS1 컨트롤러 커밋:** `exposure.ts`+`exposure.test.ts`, `job-table-columns.tsx`, `row-actions.tsx`, `jobs/page.tsx`, `payments/page.tsx`.

---

## 워크스트림 2 — 헤더 nav 6개 재편 · 독립

### Task 2.1: `MODERATOR_NAV_ITEMS` 재구성

**Files:**
- Modify: `apps/web/src/app/moderator/layout.tsx` (배열만)
- Test: `apps/web/src/app/moderator/layout.test.ts` (신규)

- [ ] **Step 1: 실패 테스트 작성** — `apps/web/src/app/moderator/layout.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

describe("moderator nav 재편", () => {
	it("채용정보(/seeker) 외부 링크를 제거한다", () => {
		expect(source).not.toContain("채용정보");
		expect(source).not.toContain('"/seeker"');
	});
	it("신고·사용자를 회원 관리 그룹으로 묶는다", () => {
		expect(source).toContain('label: "회원 관리"');
	});
	it("콘텐츠·고객센터 그룹명을 콘텐츠로 정리한다", () => {
		expect(source).toContain('label: "콘텐츠"');
		expect(source).not.toContain("콘텐츠·고객센터");
	});
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest run apps/web/src/app/moderator/layout.test.ts`
  Expected: FAIL(현재 "채용정보" 존재, "회원 관리" 없음, "콘텐츠·고객센터" 존재).

- [ ] **Step 3: 배열 교체** — `MODERATOR_NAV_ITEMS`를 아래로 교체(나머지 파일 불변):

```tsx
const MODERATOR_NAV_ITEMS: NavEntry[] = [
	{ href: "/moderator", label: "검수 큐" },
	// 신규 라우트는 Next typedRoutes 생성 타입에 아직 없을 수 있어 캐스팅한다.
	{ href: "/moderator/jobs" as Route, label: "공고 관리" },
	{
		label: "회원 관리",
		items: [
			{ href: "/moderator/users", label: "사용자" },
			{ href: "/moderator/reports", label: "신고" },
			{ href: "/moderator/employers", label: "업소 승인" },
			{ href: "/moderator/team-invites", label: "팀 합류 승인" },
		],
	},
	{
		label: "광고·결제",
		items: [
			{ href: "/moderator/ad-products", label: "광고 상품" },
			{ href: "/moderator/payments", label: "결제 관리" },
		],
	},
	{
		label: "콘텐츠",
		items: [
			// 신규 라우트는 Next typedRoutes 생성 타입에 아직 없을 수 있어 캐스팅한다.
			{ href: "/moderator/content" as Route, label: "게시물" },
			{ href: "/moderator/support" as Route, label: "고객센터" },
			{ href: "/moderator/banned-words" as Route, label: "금칙어" },
			{ href: "/moderator/reviews", label: "후기 관리" },
		],
	},
	{ href: "/moderator/site-settings" as Route, label: "사이트 정보" },
];
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest run apps/web/src/app/moderator/layout.test.ts` → PASS. 이어 `pnpm --filter web check-types`.

**WS2 컨트롤러 커밋:** `layout.tsx`, `layout.test.ts`.

---

## 워크스트림 3 — 무통장입금 계좌 0개 차단 · 독립(서버/클라 파일 분리)

### Task 3.1: 서버 — `resolveJobPostExposure` 계좌 게이트 (+ api 테스트)

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` (함수 export + 검증 추가)
- Test: `packages/api/src/routers/bambi/jobs-exposure.test.ts` (신규)

**Interfaces:**
- Produces: `export const resolveJobPostExposure` — `bank_transfer` + 유료 상품일 때 `bambiSiteSettings.bankAccounts`가 비어 있으면 `ORPCError("BAD_REQUEST")`.

- [ ] **Step 1: 실패 테스트 작성** — `packages/api/src/routers/bambi/jobs-exposure.test.ts` 생성. **파일 상단의 env 로드 + 동적 import 프리앰블, `expectOrpcCode`, adPlacement/adProduct fixture는 `packages/api/src/routers/bambi/site-settings.test.ts`와 `job-payment-queue.test.ts`의 기존 패턴을 그대로 복사**한다(dotenv `../../apps/server/.env`, `await Promise.all([...])` 지연 import). adProduct는 `priceOptions: [{ amount: 50_000, days: 30 }]`, `previewTemplate`(job-payment-queue.test.ts와 동일 값)로 시드. 핵심 테스트 본문:

```ts
// 동적 import 목록에 아래를 포함:
//   import("@bambi-app/db") → { db }
//   import("@bambi-app/db/schema/bambi") → bambiSchema ({ bambiSiteSettings })
//   import("drizzle-orm") → { eq }
//   import("./jobs") → { resolveJobPostExposure }

describe("resolveJobPostExposure 무통장 계좌 게이트", () => {
	it("bank_transfer + 유료상품 + 계좌 0개면 BAD_REQUEST", async () => {
		const fixture = await createAdProductFixture(); // job-payment-queue.test.ts 패턴 재사용
		try {
			await db
				.delete(bambiSchema.bambiSiteSettings)
				.where(eq(bambiSchema.bambiSiteSettings.id, "default"));

			await expectOrpcCode(
				resolveJobPostExposure({
					adProductId: fixture.adProductId,
					exposureDurationDays: 30,
					paymentMethod: "bank_transfer",
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupAdProductFixture(fixture);
			await db
				.delete(bambiSchema.bambiSiteSettings)
				.where(eq(bambiSchema.bambiSiteSettings.id, "default"));
		}
	});

	it("계좌가 1개 이상이면 정상 resolve", async () => {
		const fixture = await createAdProductFixture();
		try {
			await db
				.insert(bambiSchema.bambiSiteSettings)
				.values({
					id: "default",
					bankAccounts: [
						{ accountNumber: "1-2-3", bank: "국민은행", holder: "밤비" },
					],
				})
				.onConflictDoUpdate({
					target: bambiSchema.bambiSiteSettings.id,
					set: {
						bankAccounts: [
							{ accountNumber: "1-2-3", bank: "국민은행", holder: "밤비" },
						],
					},
				});

			const result = await resolveJobPostExposure({
				adProductId: fixture.adProductId,
				exposureDurationDays: 30,
				paymentMethod: "bank_transfer",
			});
			expect(result.adProductId).toBe(fixture.adProductId);
			expect(result.paymentMethod).toBe("bank_transfer");
		} finally {
			await cleanupAdProductFixture(fixture);
			await db
				.delete(bambiSchema.bambiSiteSettings)
				.where(eq(bambiSchema.bambiSiteSettings.id, "default"));
		}
	});
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/jobs-exposure.test.ts`
  Expected: 첫 케이스 FAIL(현재 계좌 검증이 없어 정상 resolve됨 → rejects 안 함). `resolveJobPostExposure` export 안 돼 import 에러가 먼저 날 수도 있음(그것도 red).

- [ ] **Step 3: 구현** — `jobs.ts`에서 (1) 함수 export, (2) 계좌 검증 추가.
  `const resolveJobPostExposure = async (input: {` → `export const resolveJobPostExposure = async (input: {`로 변경.
  `priceOption` null 체크 직후(BAD_REQUEST "선택한 이용 기간..." throw 다음)에 아래 블록 삽입:

```ts
	// 무통장입금은 운영자가 입금 계좌를 1개 이상 등록해야만 결제를 진행할 수 있다.
	// (여기 도달 시 유료 상품 — adProductId 없는 무료 공고는 위에서 이미 early-return.)
	if (input.paymentMethod === "bank_transfer") {
		const [settings] = await db
			.select({ bankAccounts: bambiSiteSettings.bankAccounts })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"))
			.limit(1);

		if (!settings?.bankAccounts.length) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"무통장입금 계좌가 준비되지 않아 결제를 진행할 수 없습니다. 다른 결제수단을 선택하거나 고객센터로 문의해 주세요.",
			});
		}
	}
```
  (`bambiSiteSettings`·`eq`·`ORPCError`·`db`는 이미 이 파일에 import돼 있음 — 추가 import 불필요.)

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/jobs-exposure.test.ts` → 두 케이스 PASS. 이어 `pnpm --filter @bambi-app/api check-types`.

---

### Task 3.2: 클라이언트 — 제출 게이트 + 안내 문구

**Files:**
- Modify: `apps/web/src/app/employer/new/page.tsx`
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`
- Modify: `apps/web/src/components/bambi/bank-transfer-guide.tsx`
- Test: `apps/web/src/components/bambi/job-exposure-fields.test.ts` (기존 — 단언 추가/갱신)

**Interfaces:**
- Consumes: `orpc.bambi.siteSettings.getPaymentAccounts`.

- [ ] **Step 1: 실패 테스트 갱신** — `job-exposure-fields.test.ts`에 new/edit 페이지가 `bankTransferBlocked` 게이트를 갖는지 단언 추가(파일 기존 `readComponent` 헬퍼 재사용):

```ts
it("무통장입금 계좌 0개면 제출을 막는 게이트가 new/edit에 있다", () => {
	for (const file of [
		"../../app/employer/new/page.tsx",
		"../../app/employer/jobs/[id]/edit/page.tsx",
	]) {
		const source = readComponent(file);
		expect(source).toContain("bankTransferBlocked");
		expect(source).toContain("getPaymentAccounts");
		expect(source).toContain('form.paymentMethod === "bank_transfer"');
	}
});
```

  또한 이 파일에 **기존 fallback 문구("입금 계좌 안내는 고객센터로 문의해 주세요.")를 문자열로 단언하는 케이스가 있으면** Step 4의 새 문구로 갱신한다(없으면 생략).

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest run apps/web/src/components/bambi/job-exposure-fields.test.ts`
  Expected: 새 케이스 FAIL(`bankTransferBlocked` 없음).

- [ ] **Step 3: new/page.tsx 게이트 추가** — `cardPaymentBlocked`(529-531) 정의 근처에 계좌 쿼리 + 차단 플래그 추가:

```tsx
	const paymentAccountsQuery = useQuery(
		orpc.bambi.siteSettings.getPaymentAccounts.queryOptions()
	);
	// 유료 상품에 무통장입금을 골랐는데 운영자 입금 계좌가 0개면 제출을 막는다(card와 대칭).
	const bankTransferBlocked =
		Boolean(form.adProductId) &&
		form.paymentMethod === "bank_transfer" &&
		(paymentAccountsQuery.data?.length ?? 0) === 0;
```
  submit 버튼 `disabled`(919-933)에 `bankTransferBlocked ||` 를 `cardPaymentBlocked ||` 다음에 추가.
  (`useQuery`·`orpc`는 이미 import됨.)

- [ ] **Step 4: edit/page.tsx 동일 적용** — `cardPaymentBlocked`(498-500) 근처에 위와 동일한 `paymentAccountsQuery` + `bankTransferBlocked`를 추가하고, 이 페이지 submit 버튼 `disabled`(파일 하단, `cardPaymentBlocked` 사용처)를 찾아 `bankTransferBlocked ||`를 추가한다.

- [ ] **Step 5: bank-transfer-guide.tsx 문구 명확화** — 0개 폴백(현재 `<p className="text-muted-foreground">입금 계좌 안내는 고객센터로 문의해 주세요.</p>`)을 교체:

```tsx
			) : (
				<p className="text-destructive">
					입금 계좌가 준비되기 전이라 무통장입금으로 등록할 수 없습니다. 다른
					결제수단을 선택하거나 고객센터로 문의해 주세요.
				</p>
			)}
```

- [ ] **Step 6: 통과 확인** — Run: `pnpm exec vitest run apps/web/src/components/bambi/job-exposure-fields.test.ts` → PASS. 이어 `pnpm --filter web check-types` + `pnpm exec ultracite fix` 대상 3개 파일.

**WS3 컨트롤러 커밋:** (서버) `jobs.ts`+`jobs-exposure.test.ts` / (클라) `new/page.tsx`·`edit/page.tsx`·`bank-transfer-guide.tsx`·`job-exposure-fields.test.ts`. 서버·클라 2개 커밋으로 분리 가능.

---

## 워크스트림 4 — 광고 안내 가격옵션 재디자인 · 독립

### Task 4.1: `AdPriceTag` 할인 분기 재디자인 (빨강 배지 제거)

**Files:**
- Modify: `apps/web/src/components/bambi/ad-price-tag.tsx`
- Test: `apps/web/src/components/bambi/ad-price-tag.test.ts` (신규)

- [ ] **Step 1: 실패 테스트 작성** — `apps/web/src/components/bambi/ad-price-tag.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ad-price-tag.tsx", import.meta.url), "utf8");

describe("AdPriceTag 할인 표현", () => {
	it("빨강(destructive) 배지를 쓰지 않는다", () => {
		expect(source).not.toContain('variant="destructive"');
		expect(source).not.toContain("Badge");
	});
	it("원가 취소선과 차분한 할인율 텍스트를 유지한다", () => {
		expect(source).toContain("line-through");
		expect(source).toContain("% 할인");
	});
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm exec vitest run apps/web/src/components/bambi/ad-price-tag.test.ts`
  Expected: FAIL(현재 `Badge variant="destructive"` 존재).

- [ ] **Step 3: 재작성** — `Badge` import 줄(`import { Badge } from "@bambi-app/ui/components/badge";`)을 삭제하고, 할인 분기를 교체(최종가 먼저 → 취소선 원가 + 할인율을 nowrap 한 덩어리로):

```tsx
	if (!price.hasDiscount) {
		return <span className={cn(priceClassName)}>{formatAdPrice(amount)}</span>;
	}

	return (
		<span
			className={cn(
				"inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
				className
			)}
		>
			<span className={cn(priceClassName)}>
				{formatAdPrice(price.discountedAmount)}
			</span>
			<span className="inline-flex items-baseline gap-1 whitespace-nowrap">
				<span className="text-muted-foreground text-xs line-through">
					{formatAdPrice(price.amount)}
				</span>
				<span className="font-medium text-coral-600 text-xs">
					{price.discountPercent}% 할인
				</span>
			</span>
		</span>
	);
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm exec vitest run apps/web/src/components/bambi/ad-price-tag.test.ts` → PASS. 이어 `pnpm --filter web check-types`.

  참고: `AdPriceTag`는 `job-exposure-fields.tsx`에서도 쓰이지만 **props(amount·discountPercent·priceClassName·className)를 바꾸지 않으므로** 해당 페이지·기존 테스트(`job-exposure-fields.test.ts`)는 영향 없음.

---

### Task 4.2: `employer-ad-guide.tsx` 비용 및 기간 — 기간 리드 그리드

**Files:**
- Modify: `apps/web/src/components/bambi/screens/employer-ad-guide.tsx` (비용 및 기간 셀, 170-190)

- [ ] **Step 1: 옵션 행 교체** — "비용 및 기간" `<div className="flex flex-col gap-1">` 블록의 옵션 map을 기간 리드 그리드로 교체:

```tsx
							{/* 비용 및 기간 */}
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-foreground text-xs md:hidden">
									비용 및 기간
								</span>
								{product.priceOptions.map((option) => (
									<div
										className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5"
										key={`${product.id}-${option.days}-${option.amount}`}
									>
										<span className="whitespace-nowrap text-muted-foreground text-xs">
											{formatAdDuration(option.days)}
										</span>
										<AdPriceTag
											amount={option.amount}
											discountPercent={option.discountPercent ?? 0}
											priceClassName="font-bold text-base text-coral-600"
										/>
									</div>
								))}
							</div>
```
  기간을 좌측 키로 이동하고 후행 `({formatAdDuration(option.days)})`를 제거. `AdPriceTag`의 `amount`·`discountPercent` prop은 그대로 유지(기존 `employer-ad-guide.test.ts` 통과 조건).

- [ ] **Step 2: 기존 테스트 회귀 확인** — Run: `pnpm exec vitest run apps/web/src/components/bambi/screens/employer-ad-guide.test.ts`
  Expected: PASS(`AdPriceTag`, `amount={option.amount}`, `discountPercent={option.discountPercent ?? 0}`, `PRODUCT_ROW_GRID`, 그리드 트랙 문자열 모두 유지됨).

- [ ] **Step 3: 타입·린트** — Run: `pnpm --filter web check-types` + `pnpm exec ultracite fix apps/web/src/components/bambi/screens/employer-ad-guide.tsx`.

**WS4 컨트롤러 커밋:** `ad-price-tag.tsx`+`ad-price-tag.test.ts`, `employer-ad-guide.tsx`.

---

## 최종 통합 검증 (컨트롤러, 전 워크스트림 병합 후)

- [ ] `pnpm check-types` (모노레포 전체) → 통과.
- [ ] `pnpm exec ultracite check` (변경 파일) → 클린.
- [ ] api: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/jobs-exposure.test.ts` → 통과.
- [ ] web: `pnpm exec vitest run apps/web/src/lib/bambi/exposure.test.ts apps/web/src/app/moderator/layout.test.ts apps/web/src/components/bambi/ad-price-tag.test.ts apps/web/src/components/bambi/screens/employer-ad-guide.test.ts apps/web/src/components/bambi/job-exposure-fields.test.ts` → 전부 통과.
- [ ] 시각 확인은 사용자(IDE HMR): nav 6개 배치, 공고 관리 관리 컬럼 kebab 드롭다운, 무통장 계좌 0개 시 제출 비활성 + 안내, 광고 안내 할인 가격 정렬.

## 병렬 실행 매핑 (Workflow)

- 동시 fan-out 가능 단위: **WS1(1에이전트 순차)**, **WS2(1에이전트)**, **WS3-서버(3.1)**, **WS3-클라(3.2)**, **WS4-AdPriceTag(4.1)**, **WS4-ad-guide(4.2)** — 파일 교집합 없음 → 워크트리 격리 불필요.
- WS3의 3.1↔3.2는 파일이 분리(api vs web)돼 병렬 가능. WS4의 4.1↔4.2도 파일 분리로 병렬 가능.
- 각 에이전트는 편집만. 컨트롤러가 전 에이전트 완료 후 통합 검증 → 워크스트림별 순차 커밋.

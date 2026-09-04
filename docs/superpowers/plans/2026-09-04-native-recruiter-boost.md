# native 구인자 후속(끌어올리기 옵션·채팅 탭·계좌 복사·사업자 임시저장) 구현 플랜

> **For agentic workers:** 이 플랜은 트랙 A·B·C를 **병렬 서브에이전트**로 실행한다. 각 트랙은 파일 소유가 배타적이며, 다른 트랙의 파일을 열지 않는다. 트랙 안의 태스크는 순서대로 한다.

**Goal:** 앱 구인자 영역에서 끌어올리기 옵션을 사고, 지원자와 채팅하고, 계좌번호를 복사하고, 사업자 입력이 자동 저장되게 한다.

**Architecture:** 서버는 이미 전부 있다 — 새 프로시저도 마이그레이션도 없다. 끌어올리기는 새 Stack 화면 하나(`boost-options`)와 순수 로직 모듈 하나, 채팅은 seeker 화면을 공용 컴포넌트로 들어내고 라우트만 새로 만드는 것, 나머지 둘은 기존 화면에 배선을 더하는 것이다.

**Tech Stack:** Expo(expo-router) · heroui-native · Uniwind · oRPC + TanStack Query · vitest

**Spec:** `docs/superpowers/specs/2026-09-04-native-recruiter-boost-design.md`

## Global Constraints

- **빌드·실행 금지.** `npm run build`·dev 서버 기동 금지(`.claude/rules/no-build-or-run.md`). 검증은 타입체크·린트·테스트뿐.
- UI는 **heroui-native 컴포넌트 최대 재사용**. 작업 전 `.agents/skills/heroui-native/SKILL.md`를 직접 읽고, Uniwind 문법은 `https://docs.uniwind.dev/llms-full.txt`를 참조한다. (SKILL.md의 HSL 표기는 오류다 — 실제 테마는 oklch.)
- 임의 px 금지(`[16px]` 같은 값), Tailwind 스케일 토큰만 사용.
- DB enum 원값을 화면에 렌더하지 않는다 — 반드시 라벨 맵 경유.
- **새 의존성 추가 금지**(이번에 허가된 `expo-clipboard`는 Task 0에서 이미 설치된 상태로 시작한다).
- 서브에이전트는 **커밋하지 않는다.** `git stash`도 금지. 커밋은 컨트롤러가 순차로 한다.
- 검증 명령(각 트랙 끝에서 자기 파일에만):
  - `pnpm --filter native check-types`
  - `npx ultracite check <수정한 파일 경로들>` → 실패 시 `npx ultracite fix <경로들>`
  - `pnpm --filter native test`
- native 테스트는 `src/lib/**`에 **콜로케이션**(`*.test.ts`). 화면 렌더 테스트는 만들지 않는다.

---

## Task 0: 공유 파일 선행 작업 (컨트롤러가 수행, 트랙 시작 전 완료)

**Files:**
- Modify: `apps/native/app/(employer)/_layout.tsx`
- Modify: `apps/native/package.json` (`pnpm expo install expo-clipboard`)

`_layout.tsx`의 Stack에 두 줄을 더한다(기존 `analytics` 아래).

```tsx
<Stack.Screen name="boost-options" options={{ title: "끌어올리기 옵션" }} />
<Stack.Screen name="chats/[id]" options={{ headerShown: false }} />
```

`chats/[id]`가 `headerShown: false`인 이유는 seeker와 같다(`app/(seeker)/_layout.tsx:33`) — 채팅방은 자체 `ChatRoomHeader`를 그린다.

---

# 트랙 A — 끌어올리기 옵션 구매 + 계좌 안내 공용화

**이 트랙이 소유하는 파일(다른 트랙은 열지 않는다):**
`packages/api/src/services/bambi-job-boost.ts`, `packages/api/test/services/bambi-job-boost.test.ts`, `apps/web/src/lib/bambi/boost-options.ts`, `apps/native/src/components/bank-accounts.tsx`(신규), `apps/native/src/components/job-exposure-section.tsx`, `apps/native/src/lib/employer/boost-options.ts`(신규)+테스트, `apps/native/app/(employer)/boost-options.tsx`(신규), `apps/native/app/(employer)/promotions.tsx`, `apps/native/src/lib/employer/ad-promotions.ts`+테스트

### Task A1: 라벨·스펙 포매터를 공유 서비스로 이동

native가 웹 `apps/web/src/lib/bambi/boost-options.ts`를 import할 수 없어서 복제가 필요해지는데, 라벨이 갈라지면 두 앱의 문구가 어긋난다. `packages/api`의 서비스로 옮겨 둘이 같은 것을 쓰게 한다.

**Files:**
- Modify: `packages/api/src/services/bambi-job-boost.ts` (파일 끝에 추가)
- Modify: `apps/web/src/lib/bambi/boost-options.ts` (전체를 재수출로 대체)
- Test: `packages/api/test/services/bambi-job-boost.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Produces: `JobBoostOptionTypeKey`, `JOB_BOOST_OPTION_TYPE_LABELS`, `formatBoostOptionSpec(option)` — A3·A4가 `@bambi-app/api/services/bambi-job-boost`에서 import한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/api/test/services/bambi-job-boost.test.ts` 끝에 추가:

```ts
describe("formatBoostOptionSpec", () => {
	it("횟수권은 총 횟수만 쓴다", () => {
		expect(
			formatBoostOptionSpec({
				boostCount: 10,
				boostsPerDay: null,
				durationDays: null,
				optionType: "manual_count",
			})
		).toBe("10회 충전");
	});

	it("기간제는 하루 횟수와 기간을 이어 붙인다", () => {
		expect(
			formatBoostOptionSpec({
				boostCount: null,
				boostsPerDay: 2,
				durationDays: 30,
				optionType: "manual_period",
			})
		).toBe("하루 2회 · 30일");
	});

	it("채워지지 않은 값은 빼고 남은 것만 남긴다", () => {
		expect(
			formatBoostOptionSpec({
				boostCount: null,
				boostsPerDay: null,
				durationDays: 7,
				optionType: "auto_period",
			})
		).toBe("7일");
	});

	it("재료가 없으면 빈 문자열", () => {
		expect(
			formatBoostOptionSpec({
				boostCount: null,
				boostsPerDay: null,
				durationDays: null,
				optionType: "manual_count",
			})
		).toBe("");
	});
});
```

파일 상단 import에 `formatBoostOptionSpec`을 추가한다(같은 파일이 이미 `../../src/services/bambi-job-boost`에서 import하고 있으니 그 목록에 넣는다).

- [ ] **Step 2: 실패를 확인한다**

Run: `cd packages/api && npx vitest run test/services/bambi-job-boost.test.ts`
Expected: FAIL — `formatBoostOptionSpec is not exported`

- [ ] **Step 3: 서비스에 구현을 옮긴다**

`packages/api/src/services/bambi-job-boost.ts` 끝에 추가(웹 `apps/web/src/lib/bambi/boost-options.ts`의 내용을 그대로 옮긴다):

```ts
// 공고 끌어올리기 옵션의 화면 표시용 라벨·포매터. web과 native가 같은 문구를 쓰도록
// 서비스에 둔다(EXPOSURE_TYPE_LABELS와 같은 축). DB enum 원값은 화면에 노출하지 않는다.
export type JobBoostOptionTypeKey =
	| "auto_period"
	| "manual_count"
	| "manual_period";

export const JOB_BOOST_OPTION_TYPE_LABELS: Record<
	JobBoostOptionTypeKey,
	string
> = {
	auto_period: "자동 끌어올리기",
	manual_count: "끌어올리기 횟수권",
	manual_period: "끌어올리기",
};

/**
 * 옵션 스펙 한 줄 요약. 기간제(manual_period·auto_period)는 "하루 2회 · 30일",
 * 횟수권(manual_count)은 "10회 충전". 스냅샷/카탈로그에 아직 값이 안 채워진(null)
 * 항목은 빼고 남은 것만 이어붙인다(재료가 하나도 없으면 빈 문자열).
 */
export function formatBoostOptionSpec(option: {
	boostCount: null | number;
	boostsPerDay: null | number;
	durationDays: null | number;
	optionType: JobBoostOptionTypeKey;
}): string {
	if (option.optionType === "manual_count") {
		return option.boostCount === null ? "" : `${option.boostCount}회 충전`;
	}

	const parts: string[] = [];
	if (option.boostsPerDay !== null) {
		parts.push(`하루 ${option.boostsPerDay}회`);
	}
	if (option.durationDays !== null) {
		parts.push(`${option.durationDays}일`);
	}
	return parts.join(" · ");
}
```

- [ ] **Step 4: 웹 lib을 재수출로 바꾼다**

`apps/web/src/lib/bambi/boost-options.ts` **전체**를 아래로 대체한다. 웹 소비처(`boost-option-purchase-dialog.tsx`, `job-exposure-fields.tsx`, `moderator/payments/*`)의 import 경로는 그대로 둔다.

```ts
// 정본은 packages/api 서비스에 있다(web·native 공용). 웹 소비처의 import 경로를
// 유지하기 위한 재수출만 남긴다.
export {
	formatBoostOptionSpec,
	JOB_BOOST_OPTION_TYPE_LABELS,
	type JobBoostOptionTypeKey,
} from "@bambi-app/api/services/bambi-job-boost";
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd packages/api && npx vitest run test/services/bambi-job-boost.test.ts`
Expected: PASS

Run: `pnpm --filter web check-types`
Expected: 0 errors (재수출이 기존 import를 모두 만족하는지 확인)

### Task A2: 계좌 안내 공용 컴포넌트 + 복사 버튼

native에 계좌 안내가 이미 두 벌 있다(`promotions.tsx`의 `BankGuideDialog` 안, `job-exposure-section.tsx`의 `BankAccounts`). 구매 화면에 세 번째를 만들지 않는다.

**Files:**
- Create: `apps/native/src/components/bank-accounts.tsx`
- Modify: `apps/native/src/components/job-exposure-section.tsx` (로컬 `BankAccounts` 삭제 후 import)
- Modify: `apps/native/app/(employer)/promotions.tsx` (`BankGuideDialog` 내부의 계좌 목록을 교체)

**Interfaces:**
- Produces: `BankAccounts({ accounts, emptyMessage, isLoading })` — A4가 구매 화면에서 쓴다.
  - `accounts: { accountNumber: string; bank: string; holder: string }[]`
  - `emptyMessage: string` — 계좌가 없을 때 문구(호출처마다 다르다)
  - `isLoading?: boolean` — 로딩 중이면 "입금 계좌를 불러오고 있어요."를 대신 보여준다

- [ ] **Step 1: 공용 컴포넌트를 만든다**

`apps/native/src/components/bank-accounts.tsx`:

```tsx
import * as Clipboard from "expo-clipboard";
import { Button, useToast } from "heroui-native";
import { Text, View } from "react-native";

// 무통장입금 계좌 목록. 광고 관리 입금 안내·공고 등록 결제·끌어올리기 옵션 구매가
// 같은 것을 쓴다(사본을 늘리면 계좌 문구가 화면마다 갈라진다).
export interface PaymentAccountItem {
	accountNumber: string;
	bank: string;
	holder: string;
}

export function BankAccounts({
	accounts,
	emptyMessage,
	isLoading = false,
}: {
	accounts: PaymentAccountItem[];
	emptyMessage: string;
	isLoading?: boolean;
}) {
	const { toast } = useToast();

	if (accounts.length === 0) {
		return (
			<Text className="text-danger text-xs">
				{isLoading ? "입금 계좌를 불러오고 있어요." : emptyMessage}
			</Text>
		);
	}

	return (
		<View className="gap-2">
			{accounts.map((account) => (
				<View
					className="flex-row items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
					key={`${account.bank}-${account.accountNumber}`}
				>
					<View className="flex-1 gap-0.5">
						<Text className="font-medium text-foreground text-sm" selectable>
							{`${account.bank} ${account.accountNumber}`}
						</Text>
						<Text className="text-muted text-xs">
							{`예금주 ${account.holder}`}
						</Text>
					</View>
					<Button
						onPress={() => {
							Clipboard.setStringAsync(account.accountNumber)
								.then(() => toast({ title: "계좌번호를 복사했어요." }))
								.catch(() =>
									toast({ title: "계좌번호를 복사하지 못했어요." })
								);
						}}
						size="sm"
						variant="outline"
					>
						<Button.Label>복사</Button.Label>
					</Button>
				</View>
			))}
			<Text className="text-muted text-xs">
				입금자명은 업체명(상호)과 동일하게 입금해 주세요. 입금 확인 후 공고가
				게시됩니다.
			</Text>
		</View>
	);
}
```

`useToast`의 실제 시그니처를 `.agents/skills/heroui-native/SKILL.md`에서 확인하고 맞춘다 — 채팅방 화면(`app/(seeker)/chats/[id].tsx`)이 이미 `useToast`를 쓰고 있으니 그 호출 형태를 그대로 따른다.

- [ ] **Step 2: `job-exposure-section.tsx`의 로컬 사본을 지운다**

`function BankAccounts({ accounts }: ...)` 정의(약 305-340줄)와 그 안의 "입금 계좌" 제목 `Text`를 삭제하고, 호출부를 아래로 바꾼다. 제목 줄은 호출부에 남긴다(공용 컴포넌트는 목록만 그린다).

```tsx
<View className="gap-2">
	<Text className="font-semibold text-foreground text-sm">입금 계좌</Text>
	<BankAccounts
		accounts={accounts}
		emptyMessage="입금 계좌가 준비되기 전이라 무통장입금으로 등록할 수 없어요. 고객센터로 문의해 주세요."
	/>
</View>
```

import를 추가한다: `import { BankAccounts } from "@/src/components/bank-accounts";`
`PaymentAccount` 지역 타입이 남아 쓰이지 않으면 삭제한다.

- [ ] **Step 3: `promotions.tsx`의 `BankGuideDialog` 내부를 교체한다**

`BankGuideDialog`의 `<View className="gap-2 pt-2">` 안, 계좌 목록을 그리던 `accounts.length > 0 ? (...) : (...)` 블록 전체를 아래 한 줄로 바꾼다(닫기 버튼 줄은 그대로 둔다).

```tsx
<BankAccounts
	accounts={accounts}
	emptyMessage="입금 계좌가 준비되기 전이에요. 고객센터로 문의해 주세요."
	isLoading={accountsQuery.isLoading}
/>
```

- [ ] **Step 4: 검증**

Run: `pnpm --filter native check-types`
Expected: 0 errors

### Task A3: 끌어올리기 옵션 순수 로직

**Files:**
- Create: `apps/native/src/lib/employer/boost-options.ts`
- Test: `apps/native/src/lib/employer/boost-options.test.ts`

**Interfaces:**
- Consumes: `JobBoostOptionTypeKey`(A1)
- Produces: `canOpenBoostPurchase(exposureType)`, `getCancelableBoostPurchases(purchases)`, `canSubmitBoostPurchase(state)` — A4·A5가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";

import {
	canOpenBoostPurchase,
	canSubmitBoostPurchase,
	getCancelableBoostPurchases,
} from "./boost-options";

describe("canOpenBoostPurchase", () => {
	it("일반 공고는 연다", () => {
		expect(canOpenBoostPurchase("standard")).toBe(true);
	});

	// 배너 광고는 서버가 구매를 거부한다 — 진입 버튼 자체를 숨긴다.
	it("배너 광고는 열지 않는다", () => {
		expect(canOpenBoostPurchase("premium-top")).toBe(false);
	});
});

describe("getCancelableBoostPurchases", () => {
	const base = {
		amount: 30_000,
		id: "p1",
		optionType: "manual_period" as const,
		paymentStatus: "unpaid",
		purchaseSource: "standalone",
	};

	it("미결제 단독 구매만 남긴다", () => {
		expect(getCancelableBoostPurchases([base])).toHaveLength(1);
	});

	it("입금이 확인된 구매는 뺀다", () => {
		expect(
			getCancelableBoostPurchases([{ ...base, paymentStatus: "paid" }])
		).toHaveLength(0);
	});

	// 공고 등록과 함께 산 옵션은 서버가 취소를 거부한다(공고 결제에서 관리).
	it("공고 결제에 묶인 구매는 뺀다", () => {
		expect(
			getCancelableBoostPurchases([{ ...base, purchaseSource: "job_payment" }])
		).toHaveLength(0);
	});

	it("입력이 없으면 빈 배열", () => {
		expect(getCancelableBoostPurchases(undefined)).toEqual([]);
	});
});

describe("canSubmitBoostPurchase", () => {
	it("옵션을 고르고 무통장이면 살 수 있다", () => {
		expect(
			canSubmitBoostPurchase({
				isPending: false,
				paymentMethod: "bank_transfer",
				selectedType: "manual_period",
			})
		).toBe(true);
	});

	it("옵션을 안 고르면 못 산다", () => {
		expect(
			canSubmitBoostPurchase({
				isPending: false,
				paymentMethod: "bank_transfer",
				selectedType: null,
			})
		).toBe(false);
	});

	// 카드 결제는 아직 준비 중이라 화면에서 막는다(공고 결제와 같은 축).
	it("카드 결제는 막는다", () => {
		expect(
			canSubmitBoostPurchase({
				isPending: false,
				paymentMethod: "card",
				selectedType: "manual_period",
			})
		).toBe(false);
	});

	it("요청 중이면 중복 제출을 막는다", () => {
		expect(
			canSubmitBoostPurchase({
				isPending: true,
				paymentMethod: "bank_transfer",
				selectedType: "manual_period",
			})
		).toBe(false);
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter native test -- boost-options`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

```ts
import { AD_BANNER_EXPOSURE_TYPES } from "@bambi-app/api/services/bambi-ad-exposure";
import type { JobBoostOptionTypeKey } from "@bambi-app/api/services/bambi-job-boost";

// jobs.getEditableById가 내려주는 구매 요약의 최소 형태.
export interface BoostPurchaseSummary {
	amount: number;
	id: string;
	optionType: JobBoostOptionTypeKey;
	paymentStatus: string;
	purchaseSource: string;
}

// 배너 광고 공고는 서버가 옵션 판매 자체를 거부한다(BANNER_REJECT_MESSAGE).
// 구매 검증의 정본은 서버지만, 진입 버튼은 열어 둘 이유가 없어 여기서 감춘다.
export const canOpenBoostPurchase = (exposureType: string): boolean =>
	!(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType);

// 취소 버튼을 붙일 구매 = 미결제 + 단독 구매. 공고 등록과 함께 산 건(purchaseSource !==
// "standalone")은 서버가 취소를 거부하므로 목록에 올리지 않는다.
export const getCancelableBoostPurchases = (
	purchases: BoostPurchaseSummary[] | undefined
): BoostPurchaseSummary[] =>
	(purchases ?? []).filter(
		(purchase) =>
			purchase.paymentStatus === "unpaid" &&
			purchase.purchaseSource === "standalone"
	);

export const canSubmitBoostPurchase = ({
	isPending,
	paymentMethod,
	selectedType,
}: {
	isPending: boolean;
	paymentMethod: string;
	selectedType: JobBoostOptionTypeKey | null;
}): boolean =>
	selectedType !== null && paymentMethod === "bank_transfer" && !isPending;
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter native test -- boost-options`
Expected: PASS

### Task A4: 끌어올리기 옵션 구매 화면

**Files:**
- Create: `apps/native/app/(employer)/boost-options.tsx`

**Interfaces:**
- Consumes: A1의 라벨·포매터, A2의 `BankAccounts`, A3의 세 함수

라우트는 Task 0에서 이미 등록돼 있다(`title: "끌어올리기 옵션"`).

- [ ] **Step 1: 화면을 만든다**

구조와 규칙:

- 파라미터: `useLocalSearchParams<{ jobPostId: string; jobTitle?: string }>()`
- 쿼리 둘:
  - `useQuery(orpc.bambi.boostOptions.listOptions.queryOptions())`
  - `useQuery(orpc.bambi.jobs.getEditableById.queryOptions({ input: { id: jobPostId } }))`
  - **`listMyAds`를 쓰면 안 된다** — 구매 id를 안 내려줘 취소 대상을 만들 수 없다.
- 뮤테이션 둘: `boostOptions.purchaseOption`, `boostOptions.cancelPurchase`
  - `onError`: 서버 한국어 메시지를 그대로 쓴다 — `localErrorMessage(error)`(`@/src/lib/chat/chat-errors`, `promotions.tsx`가 이미 쓰는 것)를 거쳐 `Alert.alert`
  - `onSuccess`: 아래 둘을 무효화하고 성공 안내
    ```tsx
    await Promise.all([
    	queryClient.invalidateQueries({
    		queryKey: orpc.bambi.promotions.listMyAds.queryKey(),
    	}),
    	queryClient.invalidateQueries({
    		queryKey: orpc.bambi.jobs.getEditableById.queryKey({
    			input: { id: jobPostId },
    		}),
    	}),
    ]);
    ```
- 화면 본문(`BambiScreen`, `stickyFooter` 사용):
  1. 공고 제목 + "입금이 확인되면 바로 적용돼요." 안내
  2. 옵션 목록 — `listOptions` 결과(가격 null은 서버가 이미 걸러 준다). 각 항목은 `Surface`/`Pressable` 카드 한 장에 `JOB_BOOST_OPTION_TYPE_LABELS[optionType]` · `formatBoostOptionSpec(option)` · `formatAdPrice(option.price)`(`@/src/lib/employer/ad-exposure`). 선택 표시는 `job-exposure-section.tsx`의 `cardClassName(selected)` 규칙과 같은 형태(테두리 두께 2 고정, 색만 변경)로 맞춘다. 목록이 비면 "지금은 판매 중인 끌어올리기 옵션이 없어요." 안내 카드
  3. 결제수단 — 무통장입금 고정. 신용카드는 **`Pressable`이 아닌 비활성 표시 + "준비 중"** (`job-exposure-section.tsx`의 카드 결제 처리와 같은 규칙)
  4. 계좌 안내 — `siteSettings.getPaymentAccounts` 조회 후 `<BankAccounts accounts={...} emptyMessage="입금 계좌가 준비되기 전이에요. 고객센터로 문의해 주세요." isLoading={...} />`
  5. 입금 확인 대기 목록 — `getCancelableBoostPurchases(jobQuery.data?.boostPurchases)`. 행마다 라벨 · 금액 · `취소` 버튼. **편집 조회가 실패했으면**(`jobQuery.isError`) 빈 목록 대신 "입금 대기 내역을 불러오지 못했어요." 경고를 보여준다 — 조용한 빈 목록은 "대기 없음"과 구별되지 않는다
  6. `stickyFooter`에 "옵션 구매" `Button`, `isDisabled={!canSubmitBoostPurchase({ isPending, paymentMethod, selectedType })}`
- 로딩·에러는 `LoadingState`/`ErrorState`(`@/src/components/bambi-screen`)를 쓴다.

`stickyFooter` 계약은 `BambiScreen`에 이미 있다. 사용법은 `apps/native/src/components/native-job-form.tsx`를 참고한다.

- [ ] **Step 2: 검증**

Run: `pnpm --filter native check-types`
Expected: 0 errors

### Task A5: 광고 관리에서 구매 화면 진입

**Files:**
- Modify: `apps/native/app/(employer)/promotions.tsx`
- Modify: `apps/native/src/lib/employer/ad-promotions.ts` (한도 0 분기의 사유 문구)
- Test: `apps/native/src/lib/employer/ad-promotions.test.ts`

- [ ] **Step 1: 사유 문구 테스트를 고친다**

`ad-promotions.test.ts`에서 "웹에서 끌어올리기 옵션을 구매할 수 있어요"를 기대하는 케이스를 새 문구로 바꾼다. 없으면 추가한다:

```ts
it("쓸 수 있는 끌어올리기가 없으면 옵션 구매로 유도한다", () => {
	const state = getBoostState(makeAd({ boostCountRemaining: 0 }), NOW);
	expect(state.canBoost).toBe(false);
	expect(state.disabledReason).toBe(
		"사용할 수 있는 끌어올리기가 없어요. 끌어올리기 옵션을 구매해 보세요."
	);
});
```

- [ ] **Step 2: 문구를 바꾼다**

`ad-promotions.ts`의 해당 분기에서 주석 "옵션 구매창은 앱에 없어 웹으로 안내한다."를 지우고 문구를 위 테스트와 같게 만든다.

- [ ] **Step 3: 카드에 진입 버튼을 단다**

`AdCard`의 액션 줄(`justify-end`인 `View`)에서 "입금 안내"보다 **앞**에 넣는다. 배너 광고면 그리지 않는다.

```tsx
{canOpenBoostPurchase(ad.exposureType) ? (
	<Button
		onPress={() =>
			router.push({
				pathname: "/(employer)/boost-options",
				params: { jobPostId: ad.jobPostId, jobTitle: ad.title },
			} as unknown as Href)
		}
		size="sm"
		variant="outline"
	>
		<Button.Label>옵션 구매</Button.Label>
	</Button>
) : null}
```

`import { type Href, router } from "expo-router";`와 `canOpenBoostPurchase` import를 추가한다.

- [ ] **Step 4: 검증**

Run: `pnpm --filter native test -- ad-promotions boost-options`
Expected: PASS
Run: `pnpm --filter native check-types` → 0 errors
Run: `npx ultracite check <이 트랙에서 만진 파일들>` → 클린(아니면 `npx ultracite fix`)

---

# 트랙 B — 구인자 채팅 탭

**이 트랙이 소유하는 파일:**
`apps/native/src/components/chat/chat-rooms-screen.tsx`(신규), `apps/native/src/components/chat/chat-room-screen.tsx`(신규), `apps/native/src/lib/chat/chat-audience.ts`(신규)+테스트, `apps/native/app/(seeker)/(tabs)/chats.tsx`, `apps/native/app/(seeker)/chats/[id].tsx`, `apps/native/app/(employer)/(tabs)/chats.tsx`, `apps/native/app/(employer)/chats/[id].tsx`(신규)

**전제:** 서버 `chats.listMine`/`getById`는 `viewerIsEmployer`로 이미 역할을 분기해 상대 표시명을 뒤집어 준다. **새 프로시저·새 입력이 없다.**

### Task B1: 역할별 문구 분기(순수 함수)

**Files:**
- Create: `apps/native/src/lib/chat/chat-audience.ts`
- Test: `apps/native/src/lib/chat/chat-audience.test.ts`

**Interfaces:**
- Produces: `ChatAudience = "employer" | "seeker"`, `getChatListCopy(audience)` — B2가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";

import { getChatListCopy } from "./chat-audience";

describe("getChatListCopy", () => {
	it("구직자는 공고 탐색으로 보낸다", () => {
		const copy = getChatListCopy("seeker");
		expect(copy.description).toBe("지원한 공고의 대화를 확인합니다.");
		expect(copy.emptyCtaHref).toBe("/(seeker)");
		expect(copy.roomPathname).toBe("/(seeker)/chats/[id]");
	});

	it("구인자는 공고 관리로 보낸다", () => {
		const copy = getChatListCopy("employer");
		expect(copy.description).toBe("지원자와 나눈 대화를 확인합니다.");
		expect(copy.emptyCtaHref).toBe("/(employer)");
		expect(copy.roomPathname).toBe("/(employer)/chats/[id]");
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter native test -- chat-audience`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

```ts
// 채팅 목록·방 화면은 구직자와 구인자가 그대로 공유한다(서버가 viewerIsEmployer로 상대를
// 뒤집어 주므로 조회에 차이가 없다). 역할별로 다른 것은 안내 문구와 이동 경로뿐이다.
export type ChatAudience = "employer" | "seeker";

export interface ChatListCopy {
	description: string;
	emptyCtaHref: string;
	emptyCtaLabel: string;
	emptyDescription: string;
	roomPathname: string;
}

const CHAT_LIST_COPY: Record<ChatAudience, ChatListCopy> = {
	employer: {
		description: "지원자와 나눈 대화를 확인합니다.",
		emptyCtaHref: "/(employer)",
		emptyCtaLabel: "공고 관리로 가기",
		emptyDescription: "지원자가 1:1 채팅을 시작하면\n여기에 대화가 쌓여요.",
		roomPathname: "/(employer)/chats/[id]",
	},
	seeker: {
		description: "지원한 공고의 대화를 확인합니다.",
		emptyCtaHref: "/(seeker)",
		emptyCtaLabel: "공고 탐색하기",
		emptyDescription: "공고 상세에서 1:1 채팅을 시작하면\n여기에 대화가 쌓여요.",
		roomPathname: "/(seeker)/chats/[id]",
	},
};

export const getChatListCopy = (audience: ChatAudience): ChatListCopy =>
	CHAT_LIST_COPY[audience];
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter native test -- chat-audience`
Expected: PASS

### Task B2: 목록 화면을 공용 컴포넌트로 들어낸다

**Files:**
- Create: `apps/native/src/components/chat/chat-rooms-screen.tsx`
- Modify: `apps/native/app/(seeker)/(tabs)/chats.tsx`
- Modify: `apps/native/app/(employer)/(tabs)/chats.tsx`

- [ ] **Step 1: 컴포넌트를 옮긴다**

`app/(seeker)/(tabs)/chats.tsx`의 내용 전체(`ListSkeleton`·`EmptyChats`·`ChatRoomsBody`·`SeekerChatsInner`)를 `src/components/chat/chat-rooms-screen.tsx`로 옮기고, 아래만 바꾼다.

- export: `export function ChatRoomsScreen({ audience }: { audience: ChatAudience })` — 내부는 기존 `SeekerChatsInner`와 동일하되 `MemberOnly`로 자기 자신을 감싼다.
- `const copy = getChatListCopy(audience);`
- `BambiHeader`의 `description={copy.description}`
- `EmptyChats`는 `copy`를 prop으로 받아 `emptyDescription`·`emptyCtaLabel`·`emptyCtaHref`를 쓴다(문자열 안의 `\n`은 `Text`가 그대로 개행으로 그린다).
- 방으로 이동하는 `router.push`의 `pathname`은 `copy.roomPathname`.
- 소켓 구독(`chat:list:updated`·`connect`)과 `useFocusEffect` 재조회는 **그대로 옮긴다**. 이 둘이 빠지면 방에서 돌아왔을 때 목록이 갱신되지 않는다.

- [ ] **Step 2: 두 라우트를 얇게 만든다**

`app/(seeker)/(tabs)/chats.tsx` 전체:

```tsx
import { ChatRoomsScreen } from "@/src/components/chat/chat-rooms-screen";

export default function SeekerChatsScreen() {
	return <ChatRoomsScreen audience="seeker" />;
}
```

`app/(employer)/(tabs)/chats.tsx` 전체(기존 "준비 중" 플레이스홀더를 지운다):

```tsx
import { ChatRoomsScreen } from "@/src/components/chat/chat-rooms-screen";

export default function EmployerChatsScreen() {
	return <ChatRoomsScreen audience="employer" />;
}
```

- [ ] **Step 3: 검증**

Run: `pnpm --filter native check-types`
Expected: 0 errors

### Task B3: 채팅방 화면을 공용 컴포넌트로 들어낸다

**Files:**
- Create: `apps/native/src/components/chat/chat-room-screen.tsx`
- Modify: `apps/native/app/(seeker)/chats/[id].tsx`
- Create: `apps/native/app/(employer)/chats/[id].tsx`

방 화면(531줄)에는 **seeker 전용 경로가 없다** — 내비는 `router.back()` 네 번뿐이다(`app/(seeker)/chats/[id].tsx:256,300,314,382`). 따라서 prop 없이 통째로 옮긴다.

- [ ] **Step 1: 파일을 옮긴다**

`app/(seeker)/chats/[id].tsx`의 내용 전체를 `src/components/chat/chat-room-screen.tsx`로 옮기고, 기본 export를 `export function ChatRoomScreen()` 이름 붙은 export로 바꾼다. `MemberOnly` 래핑은 컴포넌트 안에 남긴다. import 경로(`@/src/...`)는 그대로 쓸 수 있다.

- [ ] **Step 2: 두 라우트를 만든다**

`app/(seeker)/chats/[id].tsx` 전체:

```tsx
import { ChatRoomScreen } from "@/src/components/chat/chat-room-screen";

export default function SeekerChatRoomScreen() {
	return <ChatRoomScreen />;
}
```

`app/(employer)/chats/[id].tsx` 전체:

```tsx
import { ChatRoomScreen } from "@/src/components/chat/chat-room-screen";

export default function EmployerChatRoomScreen() {
	return <ChatRoomScreen />;
}
```

- [ ] **Step 3: 검증**

Run: `pnpm --filter native check-types` → 0 errors
Run: `pnpm --filter native test` → 전건 통과
Run: `npx ultracite check <이 트랙에서 만진 파일들>` → 클린(아니면 `npx ultracite fix`)

---

# 트랙 C — 사업자 입력 임시저장

**이 트랙이 소유하는 파일:**
`apps/native/src/lib/employer/business.ts`+테스트, `apps/native/app/(employer)/me/business.tsx`

### Task C1: 자동 저장 가능 판정(순수 함수)

**Files:**
- Modify: `apps/native/src/lib/employer/business.ts` (파일 끝에 추가)
- Test: `apps/native/src/lib/employer/business.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Produces: `canAutosaveBusinessDraft({ organizationId, status })` — C2가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe("canAutosaveBusinessDraft", () => {
	it("인증 완료 조직은 임시 저장한다", () => {
		expect(
			canAutosaveBusinessDraft({ organizationId: "org1", status: "verified" })
		).toBe(true);
	});

	it("변경 미제출 상태도 임시 저장한다", () => {
		expect(
			canAutosaveBusinessDraft({
				organizationId: "org1",
				status: "changes_unsubmitted",
			})
		).toBe(true);
	});

	// 심사 중에는 서버가 draft 저장을 거부한다.
	it("심사 대기 중에는 저장하지 않는다", () => {
		expect(
			canAutosaveBusinessDraft({ organizationId: "org1", status: "pending" })
		).toBe(false);
	});

	// 조직이 만들어지기 전에는 저장할 대상 자체가 없다.
	it("조직이 없으면 저장하지 않는다", () => {
		expect(
			canAutosaveBusinessDraft({ organizationId: undefined, status: "none" })
		).toBe(false);
	});
});
```

기존 파일 상단 import 목록에 `canAutosaveBusinessDraft`를 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter native test -- business`
Expected: FAIL — export 없음

- [ ] **Step 3: 구현한다**

`apps/native/src/lib/employer/business.ts` 끝에 추가:

```ts
// 임시 저장(saveEmployerBusinessDraft)을 걸어도 되는 상태인지. 조직이 만들어지기 전에는
// 저장 대상이 없고, 심사 대기(pending) 중에는 서버가 거부한다. web /employer/me와 같은 규칙.
export const canAutosaveBusinessDraft = ({
	organizationId,
	status,
}: {
	organizationId: string | undefined;
	status: string;
}): boolean =>
	Boolean(organizationId) &&
	(status === "verified" || status === "changes_unsubmitted");
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter native test -- business`
Expected: PASS

### Task C2: 화면에 디바운스 자동 저장을 배선한다

**Files:**
- Modify: `apps/native/app/(employer)/me/business.tsx`

- [ ] **Step 1: 뮤테이션을 추가한다**

기존 `submitMutation` 아래에 둔다. **성공·실패 모두 알림을 띄우지 않는다** — 사용자가 입력 중에 돌아가는 자동 저장이라 방해가 된다.

```tsx
const draftMutation = useMutation(
	orpc.bambi.onboarding.saveEmployerBusinessDraft.mutationOptions()
);
```

- [ ] **Step 2: 디바운스 저장 effect를 추가한다**

폼 초기화 effect(`didInitFormRef`) **아래**에 둔다. 초기화 직후의 첫 렌더에서 저장이 튀지 않게, 초기화가 끝난 뒤에만 돈다.

```tsx
// 입력 4종이 바뀌면 500ms 뒤 임시 저장한다(web /employer/me와 같은 간격). 확정 제출은
// 별도 버튼(submitMutation)이 담당하고, 여기서는 실패해도 조용히 넘어간다.
useEffect(() => {
	const organizationId = organizationProfile?.organizationId;

	if (
		!(
			didInitFormRef.current &&
			organizationId &&
			canAutosaveBusinessDraft({
				organizationId,
				status: organizationProfile?.verificationStatus ?? "none",
			})
		)
	) {
		return;
	}

	const timer = setTimeout(() => {
		draftMutation.mutate({
			businessRegistrationNumber: brn,
			businessStartDate: startDate,
			displayName,
			organizationId,
			representativeName,
		});
	}, 500);

	return () => clearTimeout(timer);
	// draftMutation은 참조가 안정적이지 않아 의존성에서 뺀다(넣으면 매 렌더 재예약된다).
	// biome-ignore lint/correctness/useExhaustiveDependencies: 위 사유
}, [brn, displayName, organizationProfile, representativeName, startDate]);
```

**주의:** `saveEmployerBusinessDraft`의 실제 입력 필드명을 `packages/api/src/routers/bambi/onboarding.ts`의 `submitEmployerBusinessInfoInput`(약 213줄)에서 확인해 그대로 맞춘다. 위 필드명이 다르면 스키마 쪽이 정본이다. 개업일자 포맷은 화면 상태가 이미 `YYYY-MM-DD`다(`toDateInput`). `organizationProfile`에 `organizationId`가 없으면 `getMine` 응답에서 조직 id를 담고 있는 실제 필드명을 확인해 쓴다.

- [ ] **Step 3: 검증**

Run: `pnpm --filter native check-types` → 0 errors
Run: `pnpm --filter native test -- business` → PASS
Run: `npx ultracite check "apps/native/app/(employer)/me/business.tsx" apps/native/src/lib/employer/business.ts` → 클린

---

## 통합 검증 (컨트롤러가 트랙 병합 후 수행)

- [ ] `pnpm --filter native check-types` → 0
- [ ] `packages/api`에서 `npx vitest run test/services` → PASS
- [ ] `pnpm --filter web check-types` → 0 (A1의 재수출 확인)
- [ ] `pnpm --filter native test` → 전건 통과
- [ ] `npx ultracite check <변경된 전체 경로>` → 클린
- [ ] 트랙별로 커밋(컨트롤러가 순차로)

## 실기기 확인 (사용자)

- 옵션 구매 → 광고 관리 카드의 "옵션 입금 대기" 배지 생성, 취소하면 사라짐
- 배너형 광고 공고에서 "옵션 구매" 버튼이 보이지 않음
- 계좌번호 복사(**prebuild/재빌드 후**) — 광고 관리 입금 안내·공고 등록 결제·옵션 구매 세 곳 모두
- 구인자 채팅 목록·방 진입, 상대가 지원자로 표시, 구직자 채팅이 그대로 동작
- 사업자 입력 후 화면을 벗어났다 돌아오면 값이 남아 있음, 심사 대기 상태에서는 저장이 일어나지 않음

# 마켓플레이스 지역별·업종별 탭 축 필터링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/seeker` 마켓플레이스의 `지역별`·`업종별` discovery 탭을 실제 필터에 연결해, 탭에 따라 하단 칩 줄을 지역/업종으로 전환하고 선택 시 해당 축으로 목록을 필터한다.

**Architecture:** 탭↔필터 매핑을 `lib/bambi/marketplace.ts`의 순수 함수(`applyDiscoveryAxis`, `discoveryAxisForTab`)로 분리해 TDD로 검증한다. 칩 UI는 기존 `MarketplaceRegionChips`를 축(axis) 파라미터 기반 `MarketplaceAxisChips`로 일반화하고, 화면(`seeker-marketplace.tsx`)에서 탭 상태에 따라 칩 줄을 조건부로 렌더한다. 기존 필터 로직(`filterMarketplaceJobs`)은 변경 없이 재사용한다.

**Tech Stack:** Next.js(App Router, RSC), React, TypeScript, Tailwind v4, shadcn(base-ui), vitest, Biome/ultracite.

## Global Constraints

- UI는 shadcn 컴포넌트 + Tailwind `className`만. 인라인 `style` 금지, 새 `.css` 금지.
- 조건부 클래스는 `cn()`. `space-x/space-y` 금지, 세로/가로 스택은 `flex ... gap-*`.
- 반경은 토큰 유틸(`rounded-lg` 등), `rounded-none` 금지. 칩/배지는 `full`.
- 브라우저 API·이벤트 핸들러 쓰는 파일 최상단에 `"use client"`.
- 커밋 메시지: 한국어 `type:` 제목 + 빈 줄 + 블릿 본문. 말미에
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 줄바꿈 LF(.gitattributes). 커밋 전 워크트리에 `pnpm install` 되어 있어야 함(이미 완료).
- 개발서버·스크린샷 금지 — 검증은 타입체크 + 린트 + vitest만. 시각 확인은 사용자.
- `"전체"`는 축 미적용을 뜻하는 상수 `ALL_OPTION`로 표현(매직 스트링 금지).

---

### Task 1: 탭↔필터 축 매핑 순수 함수

**Files:**
- Modify: `apps/web/src/lib/bambi/marketplace.ts`
- Test: `apps/web/src/lib/bambi/marketplace.test.ts`

**Interfaces:**
- Consumes: 기존 `MarketplaceFilters` 인터페이스, `MARKETPLACE_REGIONS`/`MARKETPLACE_CATEGORIES`(첫 원소가 `"전체"`).
- Produces (Task 3에서 사용):
  - `export const ALL_OPTION = "전체"`
  - `export type MarketplaceDiscoveryAxis = "all" | "region" | "category"`
  - `export function applyDiscoveryAxis(filters: MarketplaceFilters, axis: MarketplaceDiscoveryAxis): MarketplaceFilters`
  - `export function discoveryAxisForTab(tabId: string): MarketplaceDiscoveryAxis`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/lib/bambi/marketplace.test.ts`의 import를 확장하고(알파벳 순) 파일 끝에 describe 두 개를 추가한다.

import 블록을 다음으로 교체:

```ts
import {
	applyDiscoveryAxis,
	DEFAULT_MARKETPLACE_FILTERS,
	discoveryAxisForTab,
	filterMarketplaceJobs,
	getSelectedMarketplaceJob,
} from "./marketplace";
```

파일 끝(마지막 `});` 다음 줄)에 추가:

```ts
describe("applyDiscoveryAxis", () => {
	const base = {
		...DEFAULT_MARKETPLACE_FILTERS,
		category: "라운지",
		minimumPay: 20_000,
		query: "청담",
		region: "강남",
	};

	it("resets both region and category for the all axis", () => {
		expect(applyDiscoveryAxis(base, "all")).toEqual({
			...base,
			category: "전체",
			region: "전체",
		});
	});

	it("keeps region but clears category for the region axis", () => {
		expect(applyDiscoveryAxis(base, "region")).toEqual({
			...base,
			category: "전체",
		});
	});

	it("keeps category but clears region for the category axis", () => {
		expect(applyDiscoveryAxis(base, "category")).toEqual({
			...base,
			region: "전체",
		});
	});

	it("preserves unrelated filters like query and minimumPay", () => {
		const result = applyDiscoveryAxis(base, "region");

		expect(result.query).toBe("청담");
		expect(result.minimumPay).toBe(20_000);
	});
});

describe("discoveryAxisForTab", () => {
	it("maps region and category tab ids to their axis", () => {
		expect(discoveryAxisForTab("region")).toBe("region");
		expect(discoveryAxisForTab("category")).toBe("category");
	});

	it("maps all and disabled tabs to the all axis", () => {
		expect(discoveryAxisForTab("all")).toBe("all");
		expect(discoveryAxisForTab("map")).toBe("all");
		expect(discoveryAxisForTab("recent")).toBe("all");
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/web && pnpm exec vitest run src/lib/bambi/marketplace.test.ts`
Expected: FAIL — `applyDiscoveryAxis`/`discoveryAxisForTab` is not exported (또는 not a function).

- [ ] **Step 3: 최소 구현**

`apps/web/src/lib/bambi/marketplace.ts`에서 `MARKETPLACE_QUICK_FILTERS` 상수 정의 블록 바로 다음(그리고 `MarketplaceFilters` interface 앞)에 `ALL_OPTION`을 추가한다:

```ts
export const ALL_OPTION = "전체";
```

이어서 `DEFAULT_MARKETPLACE_FILTERS`의 리터럴을 `ALL_OPTION`으로 교체한다(DRY):

```ts
export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
	category: ALL_OPTION,
	minimumPay: 0,
	onlyBeginnerFriendly: false,
	onlyToday: false,
	onlyVerified: false,
	query: "",
	region: ALL_OPTION,
};
```

파일 끝(마지막 export 함수 `getSelectedMarketplaceJob` 다음)에 추가한다:

```ts
export type MarketplaceDiscoveryAxis = "all" | "category" | "region";

// 탭 전환 시 비활성 축을 "전체"로 리셋한다(축 배타성) — 화면 칩과 결과가 항상 일치한다.
export function applyDiscoveryAxis(
	filters: MarketplaceFilters,
	axis: MarketplaceDiscoveryAxis
): MarketplaceFilters {
	if (axis === "region") {
		return { ...filters, category: ALL_OPTION };
	}
	if (axis === "category") {
		return { ...filters, region: ALL_OPTION };
	}
	return { ...filters, category: ALL_OPTION, region: ALL_OPTION };
}

// discovery 탭 id를 필터 축으로 매핑한다(비활성 map/recent 탭은 방어적으로 all).
export function discoveryAxisForTab(tabId: string): MarketplaceDiscoveryAxis {
	if (tabId === "region" || tabId === "category") {
		return tabId;
	}
	return "all";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/web && pnpm exec vitest run src/lib/bambi/marketplace.test.ts`
Expected: PASS — 기존 테스트 포함 전부 통과.

- [ ] **Step 5: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 오류 없음(종료 코드 0).

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/lib/bambi/marketplace.ts apps/web/src/lib/bambi/marketplace.test.ts
git commit -F - <<'EOF'
feat: 마켓플레이스 discovery 탭 축 매핑 순수 함수 추가

- applyDiscoveryAxis: 탭 전환 시 비활성 축을 "전체"로 리셋(축 배타성)
- discoveryAxisForTab: 탭 id를 all/region/category 축으로 매핑
- ALL_OPTION 상수 도입 및 DEFAULT_MARKETPLACE_FILTERS 정리

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: 지역/업종 공용 칩 컴포넌트 일반화

**Files:**
- Modify: `apps/web/src/components/bambi/marketplace.tsx` (기존 `MarketplaceRegionChips` 정의 및 `./icons` import)

**Interfaces:**
- Consumes: `MARKETPLACE_REGIONS`, `MARKETPLACE_CATEGORIES`(이미 import됨), `MapPinIcon`(이미 import됨), `BriefcaseIcon`(신규 import), `Tag`(이미 import됨), `FilterChange` 타입 별칭(파일 내 존재).
- Produces (Task 3에서 사용):
  - `export function MarketplaceAxisChips({ axis, filters, onChange }: { axis: "category" | "region"; filters: MarketplaceFilters; onChange: FilterChange }): JSX.Element`
  - `MarketplaceRegionChips`는 시그니처 유지(홈 `PublicMarketplaceScreen` 무변경) — 내부만 `MarketplaceAxisChips axis="region"` 래핑.

- [ ] **Step 1: `./icons` import에 `BriefcaseIcon` 추가**

`apps/web/src/components/bambi/marketplace.tsx` 상단 icons import를 다음으로 교체한다(Biome 알파벳 순):

```tsx
import {
	BriefcaseIcon,
	CheckIcon,
	ClockIcon,
	MapPinIcon,
	Message,
	Search2,
	StarIcon,
} from "./icons";
```

- [ ] **Step 2: `MarketplaceRegionChips` 정의를 일반화 버전 + 래퍼로 교체**

현재 정의(주석 `// 지역별 퀵칩 ...`부터 `MarketplaceRegionChips` 함수 끝 `}`까지, `MarketplaceRegionChipsProps` interface 포함)를 아래로 교체한다. `MarketplaceRegionChipsProps` interface는 그대로 두고 그 아래 본문만 교체:

교체 대상(현재 코드):

```tsx
// 지역별 퀵칩 — 밤알바 도메인에서 가장 많이 쓰는 필터를 한 줄로 노출한다.
export function MarketplaceRegionChips({
	filters,
	onChange,
}: MarketplaceRegionChipsProps) {
	return (
		<div className="flex items-center gap-2">
			<span className="inline-flex size-4 shrink-0 text-coral-600">
				<MapPinIcon />
			</span>
			<div className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]">
				{MARKETPLACE_REGIONS.map((region) => (
					<Tag
						key={region}
						onClick={() => onChange({ ...filters, region })}
						selected={filters.region === region}
					>
						{region}
					</Tag>
				))}
			</div>
		</div>
	);
}
```

교체 후:

```tsx
interface MarketplaceAxisChipsProps {
	axis: "category" | "region";
	filters: MarketplaceFilters;
	onChange: FilterChange;
}

const MARKETPLACE_AXIS_CONFIG = {
	category: { Icon: BriefcaseIcon, options: MARKETPLACE_CATEGORIES },
	region: { Icon: MapPinIcon, options: MARKETPLACE_REGIONS },
} as const;

// 지역/업종 공용 퀵칩 — 축에 따라 옵션·아이콘·대상 필드를 바꾼다.
export function MarketplaceAxisChips({
	axis,
	filters,
	onChange,
}: MarketplaceAxisChipsProps) {
	const { Icon, options } = MARKETPLACE_AXIS_CONFIG[axis];
	return (
		<div className="flex items-center gap-2">
			<span className="inline-flex size-4 shrink-0 text-coral-600">
				<Icon />
			</span>
			<div className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]">
				{options.map((option) => (
					<Tag
						key={option}
						onClick={() =>
							onChange(
								axis === "region"
									? { ...filters, region: option }
									: { ...filters, category: option }
							)
						}
						selected={filters[axis] === option}
					>
						{option}
					</Tag>
				))}
			</div>
		</div>
	);
}

// 지역 전용 사용처(홈 PublicMarketplaceScreen)를 위한 얇은 래퍼.
export function MarketplaceRegionChips({
	filters,
	onChange,
}: MarketplaceRegionChipsProps) {
	return (
		<MarketplaceAxisChips axis="region" filters={filters} onChange={onChange} />
	);
}
```

- [ ] **Step 3: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 오류 없음. (특히 `onChange(axis === "region" ? ... : ...)`와 `filters[axis]`가 타입 통과하는지 확인. 실패 시 union 좁히기가 원인 — 위 삼항 분기 형태를 그대로 유지하면 통과한다.)

- [ ] **Step 4: 린트**

Run: `pnpm exec ultracite check apps/web/src/components/bambi/marketplace.tsx`
Expected: `No fixes applied` 또는 통과. (필요 시 `pnpm exec ultracite fix <파일>`로 정렬 후 재확인.)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/bambi/marketplace.tsx
git commit -F - <<'EOF'
refactor: 마켓플레이스 지역/업종 공용 칩 컴포넌트 도입

- MarketplaceAxisChips로 지역·업종 칩을 축 파라미터 기반 일반화
- 업종 칩에 BriefcaseIcon 사용
- MarketplaceRegionChips는 얇은 래퍼로 유지해 홈 사용처 무변경

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: 탭을 필터 축에 연결

**Files:**
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`

**Interfaces:**
- Consumes: Task 1의 `applyDiscoveryAxis`, `discoveryAxisForTab`; Task 2의 `MarketplaceAxisChips`; 기존 `useSeekerFilters`의 `filters`/`setFilters`(`setFilters`는 값만 받음 — 함수형 업데이트 미지원).
- Produces: 최종 사용자 동작(탭 → 칩 줄 전환 + 축 배타 필터).

- [ ] **Step 1: import 교체**

`apps/web/src/components/bambi/screens/seeker-marketplace.tsx` 상단에서 다음 두 가지를 반영한다.

(a) 마켓플레이스 lib import 추가(파일 상단 import 그룹, `useMarketplaceJobs` import 아래):

```tsx
import { applyDiscoveryAxis, discoveryAxisForTab } from "@/lib/bambi/marketplace";
```

(b) `../marketplace` 배럴 import에서 `MarketplaceRegionChips`를 `MarketplaceAxisChips`로 교체:

```tsx
import {
	MarketplaceAxisChips,
	MarketplaceFilterSidebar,
	MarketplaceSearch,
} from "../marketplace";
```

- [ ] **Step 2: 탭 선택 핸들러 추가**

컴포넌트 본문에서 `chatJob` 정의 아래에 탭 핸들러를 추가한다:

```tsx
	// 탭 전환 시 비활성 축을 리셋해(축 배타성) 화면 칩과 결과를 일치시킨다.
	const selectDiscoveryTab = (tabId: DiscoveryTabId) => {
		setDiscoveryTabId(tabId);
		setFilters(applyDiscoveryAxis(filters, discoveryAxisForTab(tabId)));
	};
```

- [ ] **Step 3: 탭 버튼 onClick을 핸들러로 교체**

탭 `<button>`의 `onClick`을 교체:

```tsx
onClick={() => setDiscoveryTabId(tab.id)}
```
↓
```tsx
onClick={() => selectDiscoveryTab(tab.id)}
```

- [ ] **Step 4: 항상 노출되던 지역 칩을 탭 기반 조건부 칩 줄로 교체**

현재 코드:

```tsx
					<MarketplaceRegionChips filters={filters} onChange={setFilters} />
```

교체 후(전체 탭은 칩 없음, 지역별/업종별만 노출):

```tsx
					{discoveryTabId === "region" ? (
						<MarketplaceAxisChips
							axis="region"
							filters={filters}
							onChange={setFilters}
						/>
					) : null}
					{discoveryTabId === "category" ? (
						<MarketplaceAxisChips
							axis="category"
							filters={filters}
							onChange={setFilters}
						/>
					) : null}
```

- [ ] **Step 5: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 오류 없음. (`selectDiscoveryTab`의 `tabId: DiscoveryTabId`가 `discoveryAxisForTab(tabId: string)`에 할당 가능.)

- [ ] **Step 6: 린트**

Run: `pnpm exec ultracite check apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
Expected: 통과. (필요 시 `pnpm exec ultracite fix <파일>` 후 재확인.)

- [ ] **Step 7: 전체 검증(회귀 확인)**

Run: `cd apps/web && pnpm exec vitest run src/lib/bambi/marketplace.test.ts && pnpm check-types`
Expected: vitest 전부 PASS, 타입체크 0.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/src/components/bambi/screens/seeker-marketplace.tsx
git commit -F - <<'EOF'
feat: 구직자 마켓플레이스 지역별·업종별 탭 필터 연결

- 탭 전환 시 applyDiscoveryAxis로 비활성 축 리셋(축 배타성)
- 지역별/업종별 탭에 맞춰 지역칩/업종칩 줄을 조건부 노출
- 전체 탭은 축 필터 없이 전체 목록 노출

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## 완료 후

- 세 커밋을 `feat/bambi-ui-refinement`(또는 사용자가 지정한 대상)로 fast-forward 머지하고 임시 워크트리·브랜치를 정리한다. (머지/정리는 사용자 승인 후 진행.)
- 시각 확인은 사용자가 `/seeker`에서 탭 전환·칩 필터 동작을 직접 검증한다.

## Self-Review (작성자 체크)

- 스펙 커버리지: 문제(죽은 `discoveryTabId`)→Task 3, 축 배타성→Task 1+3, 칩 전환→Task 2+3, 필터 로직 재사용→변경 없음(명시), 테스트→Task 1, 검증→각 Task Step. 갭 없음.
- 플레이스홀더: 없음(모든 코드/명령/기대 출력 명시).
- 타입 일관성: `applyDiscoveryAxis`/`discoveryAxisForTab`/`MarketplaceDiscoveryAxis`/`MarketplaceAxisChips`/`ALL_OPTION` 이름이 Task 1→3에서 일치. `MarketplaceAxisChipsProps.axis` = `"category" | "region"`로 Task 2·3 일치.

# 순수 프리미엄 배너 GA4 프로모션 계측 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자체 결제 프리미엄 배너(crawled=false)의 노출·클릭을 GA4 `view_promotion`/`select_promotion` 이벤트로 계측한다 (이슈 #59).

**Architecture:** 기존 인라인 gtag(`app/layout.tsx`, 프로덕션 전용)를 재사용하는 순수 웹 변경. 파라미터 조립·전송은 `lib/bambi/ga-promotion.ts`, 뷰포트 50% 노출 판정은 `lib/bambi/use-promotion-impression.ts`, 실제 발화는 배너 공통 프레임(`AdBannerFrame`) 한 곳에서 하고, 각 지면은 rail/섹션에 `promotionSurface` 문자열만 넘긴다. `promotionSurface`를 안 넘긴 사용처는 계측이 완전히 꺼진다(옵트인).

**Tech Stack:** Next.js App Router(web), gtag(기존 인라인), IntersectionObserver, vitest.

**스펙:** `docs/superpowers/specs/2026-08-03-ga-premium-promotion-design.md` (지면 목록은 본 계획의 전수 조사 결과가 우선 — 스펙 작성 후 rail 사용처가 4곳→8파일로 확인됨)

## Global Constraints

- 신규 npm 의존성 추가 금지. 서버·DB·native 변경 금지. 빌드·dev 서버 실행 금지.
- **서브에이전트는 git commit/stash/push 금지** — 커밋은 컨트롤러가 태스크 리뷰 후 수행한다. 각 태스크의 "커밋" 단계는 "변경 파일 목록과 검증 결과를 보고하고 종료"로 대체한다.
- 주석은 한국어, 기존 파일의 주석 밀도·톤을 따른다. 줄바꿈 LF.
- 이벤트 상수: `promotion_id: "premium-banner"`, `promotion_name: "프리미엄 배너"`. creative_slot 형식: `<지면>_<순번1-base>` (예: `seeker_left_2`), items의 `index`는 0-base.
- 테스트 실행은 워크트리 루트에서: `pnpm --filter web exec vitest run <파일들>` (web은 scope 없는 패키지명).
- 린트: 워크트리 루트에서 `pnpm dlx ultracite fix <파일 경로들>` — **경로 인자 필수**(없으면 0파일 검사).

---

### Task 1: GA 프로모션 헬퍼 (`ga-promotion.ts`)

**Files:**
- Create: `apps/web/src/lib/bambi/ga-promotion.ts`
- Test: `apps/web/src/lib/bambi/ga-promotion.test.ts`

**Interfaces:**
- Consumes: 없음 (독립 모듈)
- Produces:
  - `interface PromotionBanner { crawled: boolean; id: string; title: string }`
  - `shouldTrackPromotion(item: PromotionBanner | null | undefined): item is PromotionBanner`
  - `buildPromotionParams(item: PromotionBanner, creativeSlot: string, index: number): Record<string, unknown>`
  - `trackPromotionView(item: PromotionBanner, creativeSlot: string, index: number): void`
  - `trackPromotionSelect(item: PromotionBanner, creativeSlot: string, index: number): void`

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/web/src/lib/bambi/ga-promotion.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	buildPromotionParams,
	shouldTrackPromotion,
	trackPromotionSelect,
	trackPromotionView,
} from "./ga-promotion";

const paidBanner = { crawled: false, id: "job-1", title: "강남 라운지 급구" };

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("shouldTrackPromotion", () => {
	it("자체 결제 배너는 계측 대상이다", () => {
		expect(shouldTrackPromotion(paidBanner)).toBe(true);
	});

	it("크롤링 채움 배너는 제외한다", () => {
		expect(shouldTrackPromotion({ ...paidBanner, crawled: true })).toBe(false);
	});

	it("빈 슬롯(null)은 제외한다", () => {
		expect(shouldTrackPromotion(null)).toBe(false);
	});
});

describe("buildPromotionParams", () => {
	it("이벤트 레벨 프로모션 식별자와 item 레벨 슬롯 정보를 조립한다", () => {
		expect(buildPromotionParams(paidBanner, "seeker_center_2", 1)).toEqual({
			items: [
				{
					creative_slot: "seeker_center_2",
					index: 1,
					item_id: "job-1",
					item_name: "강남 라운지 급구",
				},
			],
			promotion_id: "premium-banner",
			promotion_name: "프리미엄 배너",
		});
	});
});

describe("track 함수", () => {
	it("gtag가 있으면 view_promotion을 보낸다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });
		trackPromotionView(paidBanner, "seeker_left_1", 0);
		expect(gtag).toHaveBeenCalledWith(
			"event",
			"view_promotion",
			buildPromotionParams(paidBanner, "seeker_left_1", 0)
		);
	});

	it("gtag가 있으면 select_promotion을 보낸다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });
		trackPromotionSelect(paidBanner, "community_center_3", 2);
		expect(gtag).toHaveBeenCalledWith(
			"event",
			"select_promotion",
			buildPromotionParams(paidBanner, "community_center_3", 2)
		);
	});

	it("window(SSR)나 gtag(비프로덕션)가 없으면 조용히 무시한다", () => {
		expect(() =>
			trackPromotionView(paidBanner, "seeker_left_1", 0)
		).not.toThrow();
		vi.stubGlobal("window", {});
		expect(() =>
			trackPromotionSelect(paidBanner, "seeker_left_1", 0)
		).not.toThrow();
	});

	it("gtag가 예외를 던져도 전파하지 않는다", () => {
		vi.stubGlobal("window", {
			gtag: () => {
				throw new Error("boom");
			},
		});
		expect(() =>
			trackPromotionView(paidBanner, "seeker_left_1", 0)
		).not.toThrow();
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/ga-promotion.test.ts`
Expected: FAIL — `ga-promotion` 모듈 없음.

- [ ] **Step 3: 구현** — `apps/web/src/lib/bambi/ga-promotion.ts`

```ts
// GA4 프로모션 계측 헬퍼 — 순수(자체 결제) 프리미엄 배너의 노출/클릭을
// view_promotion / select_promotion 이벤트로 보낸다(이슈 #59).
// gtag는 프로덕션 레이아웃(app/layout.tsx)에서만 로드되므로 없으면 전부 no-op —
// 로컬·프리뷰·GA 차단 브라우저에서 앱 동작에 영향이 없다.

export interface PromotionBanner {
	crawled: boolean;
	id: string;
	title: string;
}

export const PREMIUM_PROMOTION_ID = "premium-banner";
export const PREMIUM_PROMOTION_NAME = "프리미엄 배너";

type GtagFn = (
	command: "event",
	eventName: string,
	params: Record<string, unknown>
) => void;

const getGtag = (): GtagFn | null => {
	if (typeof window === "undefined") {
		return null;
	}
	const gtag = (window as { gtag?: unknown }).gtag;
	return typeof gtag === "function" ? (gtag as GtagFn) : null;
};

// 계측 대상 판정 — 빈 슬롯(null)과 크롤링 채움 배너는 이벤트를 보내지 않는다.
export const shouldTrackPromotion = (
	item: PromotionBanner | null | undefined
): item is PromotionBanner => Boolean(item && !item.crawled);

// GA 스펙상 creative_slot 등 프로모션 파라미터는 item 레벨이 이벤트 레벨을
// 덮어쓰므로 슬롯 구분은 item 레벨에 싣는다. index는 0-base 슬롯 순번.
export const buildPromotionParams = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number
): Record<string, unknown> => ({
	items: [
		{
			creative_slot: creativeSlot,
			index,
			item_id: item.id,
			item_name: item.title,
		},
	],
	promotion_id: PREMIUM_PROMOTION_ID,
	promotion_name: PREMIUM_PROMOTION_NAME,
});

const sendPromotionEvent = (
	eventName: "select_promotion" | "view_promotion",
	item: PromotionBanner,
	creativeSlot: string,
	index: number
): void => {
	const gtag = getGtag();
	if (!gtag) {
		return;
	}
	try {
		gtag("event", eventName, buildPromotionParams(item, creativeSlot, index));
	} catch {
		// 계측 실패가 렌더·내비게이션을 깨면 안 된다.
	}
};

export const trackPromotionView = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number
): void => sendPromotionEvent("view_promotion", item, creativeSlot, index);

export const trackPromotionSelect = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number
): void => sendPromotionEvent("select_promotion", item, creativeSlot, index);
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/ga-promotion.test.ts`
Expected: PASS (8건)

- [ ] **Step 5: 린트 후 보고**

Run: `pnpm dlx ultracite fix apps/web/src/lib/bambi/ga-promotion.ts apps/web/src/lib/bambi/ga-promotion.test.ts`
변경 파일·테스트 결과를 보고하고 종료 (커밋 금지 — 컨트롤러가 수행).

---

### Task 2: 노출 옵저버 훅 (`use-promotion-impression.ts`)

**Files:**
- Create: `apps/web/src/lib/bambi/use-promotion-impression.ts`
- Test: `apps/web/src/lib/bambi/use-promotion-impression.test.ts`

**Interfaces:**
- Consumes: 없음 (독립 모듈 — Task 1과 파일이 겹치지 않아 병렬 가능)
- Produces:
  - `createImpressionObserver(onImpress: () => void): IntersectionObserver | null` — threshold 0.5, 최초 교차 시 1회 발화 후 disconnect. 환경에 IntersectionObserver가 없으면 null.
  - `usePromotionImpression(onImpress: (() => void) | null): (element: HTMLElement | null) => void` — 배너 요소에 붙일 ref 콜백. onImpress가 null이면 관측 안 함. 훅 인스턴스(=마운트)당 1회만 발화, 언마운트 시 해제.

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/web/src/lib/bambi/use-promotion-impression.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createImpressionObserver } from "./use-promotion-impression";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

class FakeIntersectionObserver {
	static lastInstance: FakeIntersectionObserver | null = null;
	callback: ObserverCallback;
	disconnected = false;
	observed: unknown[] = [];
	options: { threshold?: number } | undefined;

	constructor(callback: ObserverCallback, options?: { threshold?: number }) {
		this.callback = callback;
		this.options = options;
		FakeIntersectionObserver.lastInstance = this;
	}

	disconnect() {
		this.disconnected = true;
	}

	observe(element: unknown) {
		this.observed.push(element);
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	FakeIntersectionObserver.lastInstance = null;
});

describe("createImpressionObserver", () => {
	it("IntersectionObserver가 없는 환경이면 null을 준다", () => {
		expect(createImpressionObserver(() => undefined)).toBeNull();
	});

	it("뷰포트 50% 기준으로 옵저버를 만든다", () => {
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		createImpressionObserver(() => undefined);
		expect(FakeIntersectionObserver.lastInstance?.options?.threshold).toBe(0.5);
	});

	it("교차 진입 시 1회만 발화하고 관측을 끝낸다", () => {
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		const onImpress = vi.fn();
		createImpressionObserver(onImpress);
		const fake = FakeIntersectionObserver.lastInstance;
		fake?.callback([{ isIntersecting: false }]);
		expect(onImpress).not.toHaveBeenCalled();
		fake?.callback([{ isIntersecting: true }]);
		fake?.callback([{ isIntersecting: true }]);
		expect(onImpress).toHaveBeenCalledTimes(1);
		expect(fake?.disconnected).toBe(true);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/use-promotion-impression.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `apps/web/src/lib/bambi/use-promotion-impression.ts`

```ts
"use client";

import { useCallback, useRef } from "react";

// 뷰포트 50% 이상 진입 시 onImpress를 1회 호출하는 옵저버.
// GTM Element Visibility 트리거 기본값(가시 50%·요소당 1회)을 따른다.
// 훅과 분리해 둔 이유: React 렌더 없이 노출 판정 로직만 단위 테스트하기 위해서다.
export const createImpressionObserver = (
	onImpress: () => void
): IntersectionObserver | null => {
	if (typeof IntersectionObserver === "undefined") {
		return null;
	}
	let fired = false;
	const observer = new IntersectionObserver(
		(entries) => {
			if (fired || !entries.some((entry) => entry.isIntersecting)) {
				return;
			}
			fired = true;
			observer.disconnect();
			onImpress();
		},
		{ threshold: 0.5 }
	);
	return observer;
};

// 배너 요소에 붙이는 ref 콜백을 돌려준다. onImpress가 null이면(계측 대상 아님)
// 관측하지 않는다. 마운트당 1회만 발화하고, 언마운트(ref null 호출) 시 옵저버를 해제한다 —
// 라우트를 떠났다 돌아오면 컴포넌트가 다시 마운트되므로 노출도 다시 1회 잡힌다.
export function usePromotionImpression(
	onImpress: (() => void) | null
): (element: HTMLElement | null) => void {
	const onImpressRef = useRef(onImpress);
	onImpressRef.current = onImpress;
	const firedRef = useRef(false);
	const observerRef = useRef<IntersectionObserver | null>(null);

	return useCallback((element: HTMLElement | null) => {
		observerRef.current?.disconnect();
		observerRef.current = null;
		if (!element || firedRef.current || !onImpressRef.current) {
			return;
		}
		observerRef.current = createImpressionObserver(() => {
			firedRef.current = true;
			onImpressRef.current?.();
		});
		observerRef.current?.observe(element);
	}, []);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/bambi/use-promotion-impression.test.ts`
Expected: PASS (3건)

- [ ] **Step 5: 린트 후 보고**

Run: `pnpm dlx ultracite fix apps/web/src/lib/bambi/use-promotion-impression.ts apps/web/src/lib/bambi/use-promotion-impression.test.ts`
변경 파일·테스트 결과를 보고하고 종료 (커밋 금지).

---

### Task 3: 배너 컴포넌트 연결 + 지면 와이어링 + 전체 검증

**Files:**
- Modify: `apps/web/src/components/bambi/ad-banner.tsx` (AdBannerFrame·AdBanner·HorizontalAdBanner·양 rail)
- Modify: `apps/web/src/components/bambi/premium-ad-banner-section.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/community-home.tsx`
- Modify: `apps/web/src/app/seeker/community/layout.tsx`
- Modify: `apps/web/src/app/support/layout.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-crawled-job-detail.tsx`
- Test: `apps/web/src/components/bambi/ga-promotion-wiring.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 `shouldTrackPromotion`/`trackPromotionView`/`trackPromotionSelect`, Task 2의 `usePromotionImpression` (시그니처는 각 태스크 Produces 참조)
- Produces:
  - `AdBanner`·`HorizontalAdBanner`에 `promotion?: { index: number; slot: string }` prop
  - `AdBannerRail`·`HorizontalAdBannerRail`·`PremiumAdBannerSection`에 `promotionSurface?: string` prop — 넘기면 각 칸이 `` `${promotionSurface}_${index + 1}` `` 슬롯으로 계측되고, 안 넘기면 계측 없음

- [ ] **Step 1: 실패하는 와이어링 테스트 작성** — `apps/web/src/components/bambi/ga-promotion-wiring.test.ts`

(`seeker-ad-rails.test.ts`의 소스 문자열 단언 컨벤션을 따른다)

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 프리미엄 배너 GA4 프로모션 계측(이슈 #59)의 지면 와이어링 단언.
// 지면마다 promotionSurface 접두어가 달라 소스를 직접 읽어 구조를 확인한다.
const SRC_ROOT = path.join(import.meta.dirname, "..", "..");

const read = (relativePath: string) =>
	fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");

const SURFACES = [
	{
		expects: [
			'promotionSurface="seeker_center"',
			'promotionSurface="seeker_left"',
			'promotionSurface="seeker_right"',
		],
		label: "구직자 마켓플레이스",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-marketplace.tsx"
		),
	},
	{
		expects: ['promotionSurface="community_center"'],
		label: "수다방 홈",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"community-home.tsx"
		),
	},
	{
		expects: [
			'promotionSurface="community_left"',
			'promotionSurface="community_right"',
		],
		label: "수다방 레이아웃 rail",
		relativePath: path.join("app", "seeker", "community", "layout.tsx"),
	},
	{
		expects: [
			'promotionSurface="support_left"',
			'promotionSurface="support_right"',
		],
		label: "고객센터 레이아웃 rail",
		relativePath: path.join("app", "support", "layout.tsx"),
	},
	{
		expects: [
			'promotionSurface="chats_left"',
			'promotionSurface="chats_right"',
		],
		label: "채팅 목록 rail",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-chat-list-responsive.tsx"
		),
	},
	{
		expects: [
			'promotionSurface="job_detail_left"',
			'promotionSurface="job_detail_right"',
		],
		label: "공고 상세 rail",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-job-detail-responsive.tsx"
		),
	},
	{
		expects: [
			'promotionSurface="crawled_detail_left"',
			'promotionSurface="crawled_detail_right"',
		],
		label: "수집 공고 상세 rail",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-crawled-job-detail.tsx"
		),
	},
];

describe("GA 프로모션 지면 와이어링", () => {
	for (const surface of SURFACES) {
		it(`${surface.label}에 promotionSurface가 연결돼 있다`, () => {
			const source = read(surface.relativePath);
			for (const expected of surface.expects) {
				expect(source).toContain(expected);
			}
		});
	}

	it("배너 프레임이 크롤링 배너를 계측에서 거른다", () => {
		const source = read(path.join("components", "bambi", "ad-banner.tsx"));
		expect(source).toContain("shouldTrackPromotion");
		expect(source).toContain("trackPromotionView");
		expect(source).toContain("trackPromotionSelect");
		expect(source).toContain("usePromotionImpression");
	});

	it("프리미엄 섹션이 칸 순번으로 슬롯 이름을 만든다", () => {
		const source = read(
			path.join("components", "bambi", "premium-ad-banner-section.tsx")
		);
		expect(source).toContain("promotionSurface");
		expect(source).toContain("${promotionSurface}_${index + 1}");
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/components/bambi/ga-promotion-wiring.test.ts`
Expected: FAIL — promotionSurface 미존재.

- [ ] **Step 3: `ad-banner.tsx` 수정**

3-1. import 추가:

```ts
import {
	shouldTrackPromotion,
	trackPromotionSelect,
	trackPromotionView,
} from "@/lib/bambi/ga-promotion";
import { usePromotionImpression } from "@/lib/bambi/use-promotion-impression";
```

3-2. `AdBannerFrame`을 프로모션 인지형으로 교체 (기존 주석 유지 + 계측 주석 추가):

```tsx
// 배너 상자. 결제 광고는 우리 공고 상세로, 수집 배너는 수집 전용 상세로 간다(매퍼가 주소를
// 만든다) — 갈 곳 없는 배너는 이제 없으므로 항상 Link다.
// promotion이 넘어온 결제 배너(순수 프리미엄)만 GA4 프로모션으로 계측한다(이슈 #59) —
// 크롤링 채움 배너는 shouldTrackPromotion이 거르고, 노출은 뷰포트 50% 진입 시 1회다.
function AdBannerFrame({
	children,
	className,
	item,
	promotion,
}: {
	children: ReactNode;
	className?: string;
	item: AdBannerItem;
	promotion?: { index: number; slot: string };
}) {
	const tracked = promotion && shouldTrackPromotion(item) ? promotion : null;
	const impressionRef = usePromotionImpression(
		tracked ? () => trackPromotionView(item, tracked.slot, tracked.index) : null
	);

	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className={cn(AD_BANNER_SURFACE_CLASS, AD_BANNER_LINK_CLASS, className)}
			href={item.href as Route}
			onClick={
				tracked
					? () => trackPromotionSelect(item, tracked.slot, tracked.index)
					: undefined
			}
			ref={impressionRef}
		>
			{children}
		</Link>
	);
}
```

3-3. `AdBanner`·`HorizontalAdBanner`에 `promotion` prop 추가 후 Frame으로 전달:

```tsx
interface AdBannerProps {
	className?: string;
	item: AdBannerItem;
	promotion?: { index: number; slot: string };
}
// AdBanner 시그니처: export function AdBanner({ className, item, promotion }: AdBannerProps)
// 프레임 호출: <AdBannerFrame className="w-fit" item={item} promotion={promotion}>
```

`HorizontalAdBannerProps`도 동일하게 `promotion?: { index: number; slot: string }` 추가,
`<AdBannerFrame item={item} promotion={promotion}>`로 전달.

3-4. 양 rail에 `promotionSurface` prop 추가. `AdBannerRailProps`/`HorizontalAdBannerRailProps`에:

```ts
	// GA4 프로모션 지면 접두어(이슈 #59). 넘기면 각 칸이 `${promotionSurface}_${순번}` 슬롯으로
	// 계측되고, 안 넘기면 이 rail은 계측하지 않는다.
	promotionSurface?: string;
```

`AdBannerRail` 활성 칸 렌더를:

```tsx
					return item ? (
						<AdBanner
							item={item}
							key={item.id}
							promotion={
								promotionSurface
									? { index, slot: `${promotionSurface}_${index + 1}` }
									: undefined
							}
						/>
					) : (
```

`HorizontalAdBannerRail` 활성 칸도 동일 패턴 (기존 `className={RAIL_SLOT_ASPECT_CLASS}` 유지):

```tsx
					return item ? (
						<HorizontalAdBanner
							className={RAIL_SLOT_ASPECT_CLASS}
							item={item}
							key={item.id}
							promotion={
								promotionSurface
									? { index, slot: `${promotionSurface}_${index + 1}` }
									: undefined
							}
						/>
					) : (
```

- [ ] **Step 4: `premium-ad-banner-section.tsx` 수정**

props에 `promotionSurface?: string` 추가(주석은 rail과 동일 취지), 활성 칸 렌더를:

```tsx
						return item ? (
							<HorizontalAdBanner
								item={item}
								key={item.id}
								promotion={
									promotionSurface
										? { index, slot: `${promotionSurface}_${index + 1}` }
										: undefined
								}
							/>
						) : (
```

- [ ] **Step 5: 지면 7파일 와이어링**

각 파일의 해당 컴포넌트 호출에 prop 한 줄씩 추가 (props는 알파벳 순 정렬 유지 — Biome):

| 파일 | 추가 prop |
|---|---|
| `screens/seeker-marketplace.tsx` | `PremiumAdBannerSection`→`promotionSurface="seeker_center"`, `HorizontalAdBannerRail`→`"seeker_left"`, `AdBannerRail`→`"seeker_right"` |
| `screens/community-home.tsx` | `PremiumAdBannerSection`→`"community_center"` |
| `app/seeker/community/layout.tsx` | `HorizontalAdBannerRail`→`"community_left"`, `AdBannerRail`→`"community_right"` |
| `app/support/layout.tsx` | `HorizontalAdBannerRail`→`"support_left"`, `AdBannerRail`→`"support_right"` |
| `screens/seeker-chat-list-responsive.tsx` | `HorizontalAdBannerRail`→`"chats_left"`, `AdBannerRail`→`"chats_right"` |
| `screens/seeker-job-detail-responsive.tsx` | `HorizontalAdBannerRail`→`"job_detail_left"`, `AdBannerRail`→`"job_detail_right"` |
| `screens/seeker-crawled-job-detail.tsx` | `HorizontalAdBannerRail`→`"crawled_detail_left"`, `AdBannerRail`→`"crawled_detail_right"` |

주의: `app/seeker/community/layout.tsx`·`app/support/layout.tsx`가 서버 컴포넌트라면
rail 자체가 "use client"라 prop(문자열)만 넘기는 건 문제없다.

- [ ] **Step 6: 전체 검증**

Run:
1. `pnpm --filter web exec vitest run src/lib/bambi/ga-promotion.test.ts src/lib/bambi/use-promotion-impression.test.ts src/components/bambi/ga-promotion-wiring.test.ts src/components/bambi/seeker-ad-rails.test.ts src/components/bambi/visual-job-components.test.ts`
   Expected: 전부 PASS (기존 rail·카드 테스트 회귀 포함)
2. `pnpm --filter web check-types`
   Expected: 통과
3. `pnpm dlx ultracite fix apps/web/src/components/bambi/ad-banner.tsx apps/web/src/components/bambi/premium-ad-banner-section.tsx apps/web/src/components/bambi/ga-promotion-wiring.test.ts apps/web/src/components/bambi/screens/seeker-marketplace.tsx apps/web/src/components/bambi/screens/community-home.tsx apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx apps/web/src/components/bambi/screens/seeker-crawled-job-detail.tsx apps/web/src/app/seeker/community/layout.tsx apps/web/src/app/support/layout.tsx`
   Expected: 오류 0 (정렬 자동 수정은 허용)

- [ ] **Step 7: 보고**

변경 파일 목록·검증 결과(테스트 수, 타입체크, 린트)를 보고하고 종료 (커밋 금지).

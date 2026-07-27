# 프리미엄 광고 배너 에디터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프리미엄 광고 배너를 고정 필드 3개에서 자유 배치 에디터로 바꾸고, 편집 결과를 JSON 레이아웃으로 저장한다.

**Architecture:** `job_post`의 배너 컬럼 5개를 걷어내고 `job_ad_banner_layout` 테이블에 JSON 하나로 담는다. 구인자는 별도 에디터(데스크톱 새창 / 모바일 전체화면 다이얼로그)에서 문구를 최대 5개까지 놓고 드래그로 위치를 잡는다. 좌표와 폰트 크기를 백분율로 저장해 슬롯 폭이 272~600px로 변해도 비율이 유지된다.

**Tech Stack:** Next.js 16 (RSC), React 19, Tailwind v4, gsap 3.15.0(설치됨), drizzle + PostgreSQL, oRPC, zod, vitest

**스펙:** `docs/superpowers/specs/2026-07-27-premium-ad-banner-editor-design.md`

## Global Constraints

- **신규 npm 의존성 금지.** 연출 4종에 필요한 `SplitText`·`ScrollTrigger`는 이미 설치된 `gsap` 3.15.0 패키지 안에 있다(`import { SplitText } from "gsap/SplitText"`). `@gsap/react`는 받지 말고 기존 `gsap.context()` + `useLayoutEffect` 패턴을 쓴다
- **드래그에 라이브러리를 쓰지 않는다.** Pointer Events(`pointerdown`/`setPointerCapture`/`pointermove`)로 구현하면 터치·마우스가 같은 코드로 동작한다
- UI는 shadcn 컴포넌트 + Tailwind만. **인라인 `style={{...}}` 금지**, 새 `.css` 파일·전역 클래스 금지. keyframes는 `apps/web/src/index.css`의 `@theme`에 `--animate-*`로 정의한다
  - **예외:** 레이아웃 렌더러와 에디터 캔버스는 사용자가 정한 좌표·색·크기를 런타임에 받으므로 CSS 커스텀 프로퍼티를 인라인으로 주입한다. 이건 값이 무한한 동적 데이터라 Tailwind 클래스로 표현할 수 없다. **CSS 변수 주입에만 한정**하고 일반 스타일은 반드시 `className`으로 쓴다
- **raw hex/oklch 금지**(시맨틱 토큰·브랜드 팔레트 유틸). 단 구인자가 고른 색은 데이터이므로 예외
- 조건부 클래스는 `cn()`(`@bambi-app/ui/lib/utils`), 간격은 `gap-*`(`space-x/y-*` 금지), 임의 px 금지, `rounded-none` 금지, 가로·세로 같으면 `size-*`
- base-ui이므로 `asChild`가 아니라 `render` prop. `render`가 `<Button>`이면 `nativeButton` 생략
- 훅·브라우저 API를 쓰면 최상단 `"use client"`
- **모바일 반응형 필수**
- **서버 입력 검증은 트러스트 바운더리.** JSON 전환으로 DB 제약이 사라지므로 zod가 유일한 방어선이다. `strict()`로 알 수 없는 키까지 거부한다
- **테스트 명령 함정:** `apps/web`에 `test` 스크립트가 **없다** — `pnpm -F web test`는 아무것도 실행하지 않고 조용히 성공한다. web 테스트는 저장소 루트에서 `pnpm vitest run <경로>`(전체는 `pnpm vitest run apps/web`). api는 `pnpm -F @bambi-app/api test`가 유효하다
- **web 테스트에서 `@/` alias를 쓰지 않는다.** web용 vitest config가 없어 해석되지 않는다. 테스트와 그 테스트가 import 하는 모듈은 상대 경로를 쓴다
- **베이스라인:** web 5 failed / 273 passed, api 3 failed / 472 passed. 이 실패 8건은 브랜치 이전부터 있던 것이다. **실패가 늘거나 통과가 줄지 않았는지만** 확인한다
- **`pnpm db:push` 절대 금지.** `db:generate`/`db:migrate`는 사용자가 허용했다(2026-07-27)
- **빌드·dev 서버 기동 금지.** 검증은 `check-types`와 vitest만. 시각 확인은 사용자가 한다
- 커밋 전 `pnpm dlx ultracite fix`로 정렬. 커밋 메시지는 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음) + `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` 트레일러. 다중 행은 임시 파일 + `git commit -F`
- **push·PR 생성 금지.** 사용자가 명시적으로 지시할 때만 한다

---

## File Structure

**신규**

| 파일 | 책임 |
| --- | --- |
| `apps/web/src/lib/bambi/ad-banner-layout.ts` | 레이아웃 타입·상수·기본값·클램프·대비 계산·텍스트 추출 |
| `apps/web/src/lib/bambi/ad-banner-layout.test.ts` | 위 계약 검증 |
| `apps/web/src/components/bambi/text-animations/split-text.tsx` | 글자 분리 등장 (gsap SplitText) |
| `apps/web/src/components/bambi/text-animations/glitch-text.tsx` | 글리치 (CSS) |
| `apps/web/src/components/bambi/ad-banner-layout-renderer.tsx` | 레이아웃 → 슬롯 렌더 |
| `apps/web/src/components/bambi/ad-banner-editor/ad-banner-editor.tsx` | 에디터 본체(순수 컴포넌트) |
| `apps/web/src/components/bambi/ad-banner-editor/editor-canvas.tsx` | 캔버스 + 드래그 |
| `apps/web/src/components/bambi/ad-banner-editor/editor-block-panel.tsx` | 선택 블록 속성 패널 |
| `apps/web/src/components/bambi/ad-banner-editor/use-block-drag.ts` | Pointer Events 드래그 훅 |
| `apps/web/src/components/bambi/ad-banner-editor/editor-launcher.tsx` | 새창/다이얼로그 껍데기 + postMessage |
| `apps/web/src/app/employer/ad-banner-editor/page.tsx` | 새창 라우트 |
| `packages/api/src/services/bambi-ad-banner-layout.ts` | 서버 zod 스키마 + 텍스트 추출 |
| `packages/api/src/services/bambi-ad-banner-layout.test.ts` | 검증·추출 테스트 |
| `packages/db/src/migrations/0040_*.sql` | 새 테이블 + 구 컬럼·enum 제거 |

**수정**

| 파일 | 변경 |
| --- | --- |
| `packages/db/src/schema/bambi.ts` | `jobAdBannerLayout` 테이블 추가, 배너 컬럼 5개·enum 2종 제거 |
| `packages/api/src/routers/bambi/jobs.ts` | 레이아웃 입력·저장·조회, 검수 텍스트 합류 |
| `apps/web/src/lib/bambi/api-job-mapper.ts` | `AdBannerItem.layout` |
| `apps/web/src/lib/bambi-job-form.ts` | 폼 상태를 레이아웃 하나로 |
| `apps/web/src/components/bambi/ad-banner.tsx` | 렌더러 연결 |
| `apps/web/src/components/bambi/job-post-media-uploader.tsx` | 에디터 진입 버튼 |
| `apps/web/src/app/employer/new/page.tsx`, `.../jobs/[id]/edit/page.tsx`, `.../moderator/jobs/[id]/edit/page.tsx` | 레이아웃 상태 배선 |
| `apps/web/src/index.css` | 글리치 keyframes 추가, 쓰이지 않는 shiny·gradient 제거 |
| `packages/api/src/routers/bambi/ad-banner-catalog-parity.test.ts` | DB enum 대조 → **웹 카탈로그 ↔ 서버 zod 대조**로 전환 |

**삭제**

`ad-banner-text-fields.tsx`, `ad-banner-text-fields.test.ts`, `ad-banner-text-overlay.tsx`, `text-animations/decrypted-text.tsx`, `lib/bambi/ad-banner-animations.ts`, `lib/bambi/ad-banner-animations.test.ts`

> 스펙은 parity 테스트를 삭제한다고 했지만, DB enum이 사라져도 **웹 카탈로그와 서버 zod가 같은 4개 값을 쓰는지**는 여전히 갈릴 수 있다. 대조 대상만 바꿔 살린다.

---

## 병렬 실행 계획 (파일 충돌 기준)

- **물결 1**: Task 1
- **물결 2**: Task 2(`packages/db`) + Task 3(`text-animations/**`, `index.css`) + Task 4(`ad-banner-layout-renderer.tsx`)
- **물결 3**: Task 5(`ad-banner-editor/**`) + Task 7(`packages/api/**`, `api-job-mapper.ts`)
- **물결 4**: Task 6(`editor-launcher.tsx`, `app/employer/ad-banner-editor/`) + Task 8(`bambi-job-form.ts`, `job-post-media-uploader.tsx`, 3개 페이지)
- **물결 5**: Task 9(`ad-banner.tsx` + 구 파일 삭제)
- **물결 6**: Task 10

---

## Task 1: 레이아웃 타입·상수·유틸

모든 후속 태스크가 이 타입을 참조하므로 가장 먼저 못 박는다.

**Files:**
- Create: `apps/web/src/lib/bambi/ad-banner-layout.ts`
- Test: `apps/web/src/lib/bambi/ad-banner-layout.test.ts`

**Interfaces:**
- Produces:
  - `type AdBannerAnimation = "split" | "typing" | "glitch" | "blur"`
  - `type AdBannerTextWeight = "normal" | "bold" | "extrabold"`
  - `type AdBannerTextAlign = "left" | "center" | "right"`
  - `type AdBannerSlot = "horizontal" | "vertical"`
  - `interface AdBannerTextBlock { align; animation: AdBannerAnimation | null; color: string; content: string; fontSize: number; id: string; weight; x: number; y: number }`
  - `interface AdBannerSlotLayout { background: { type: "image" } | { color: string; type: "color" }; scrim: { enabled: boolean; opacity: number }; texts: AdBannerTextBlock[] }`
  - `interface AdBannerLayout { horizontal: AdBannerSlotLayout; version: 1; vertical: AdBannerSlotLayout }`
  - `AD_BANNER_ANIMATION_VALUES`, `AD_BANNER_ANIMATION_LABELS`, `AD_BANNER_ANIMATION_OPTIONS`
  - `AD_BANNER_MAX_BLOCKS = 5`, `AD_BANNER_TEXT_MAX_LENGTH = 40`, `AD_BANNER_FONT_SIZE_MIN = 2`, `AD_BANNER_FONT_SIZE_MAX = 20`
  - `createEmptyAdBannerLayout(): AdBannerLayout`
  - `createAdBannerTextBlock(id: string): AdBannerTextBlock`
  - `clampPercent(value: number): number`
  - `contrastRatio(hexA: string, hexB: string): number`
  - `isLowContrast(background: string, text: string): boolean`
  - `collectAdBannerLayoutTexts(layout: AdBannerLayout): string[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/src/lib/bambi/ad-banner-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	AD_BANNER_ANIMATION_LABELS,
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_ANIMATION_VALUES,
	AD_BANNER_MAX_BLOCKS,
	clampPercent,
	collectAdBannerLayoutTexts,
	contrastRatio,
	createAdBannerTextBlock,
	createEmptyAdBannerLayout,
	isLowContrast,
} from "./ad-banner-layout";

describe("ad banner layout catalog", () => {
	it("labels every animation value", () => {
		// DB enum이 사라져 라벨 맵이 유일한 표시 경로다. 값 하나라도 비면 화면에 원값이 샌다.
		for (const value of AD_BANNER_ANIMATION_VALUES) {
			expect(AD_BANNER_ANIMATION_LABELS[value]).toBeTruthy();
		}
	});

	it("offers exactly the catalog values as options", () => {
		expect(AD_BANNER_ANIMATION_OPTIONS.map((option) => option.value)).toEqual([
			...AD_BANNER_ANIMATION_VALUES,
		]);
	});
});

describe("createEmptyAdBannerLayout", () => {
	it("starts both slots with an image background and no text", () => {
		// 배너를 편집하지 않은 공고와 같은 상태여야 렌더러가 이미지만 그린다.
		const layout = createEmptyAdBannerLayout();

		expect(layout.version).toBe(1);
		expect(layout.horizontal.texts).toEqual([]);
		expect(layout.vertical.texts).toEqual([]);
		expect(layout.horizontal.background.type).toBe("image");
	});
});

describe("createAdBannerTextBlock", () => {
	it("places a new block at the center", () => {
		// 새 블록이 모서리에 생기면 구인자가 매번 끌어와야 한다.
		const block = createAdBannerTextBlock("block-1");

		expect(block.id).toBe("block-1");
		expect(block.x).toBe(50);
		expect(block.y).toBe(50);
	});
});

describe("clampPercent", () => {
	it("keeps a block inside the canvas", () => {
		expect(clampPercent(-12)).toBe(0);
		expect(clampPercent(140)).toBe(100);
		expect(clampPercent(42.5)).toBe(42.5);
	});
});

describe("contrastRatio", () => {
	it("returns the WCAG ratio for black on white", () => {
		expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
	});

	it("returns 1 for identical colors", () => {
		expect(contrastRatio("#3b82f6", "#3b82f6")).toBeCloseTo(1, 2);
	});
});

describe("isLowContrast", () => {
	it("flags a combination below the AA threshold", () => {
		// 흰 배경 위 흰 글자는 읽을 수 없다.
		expect(isLowContrast("#ffffff", "#ffffff")).toBe(true);
	});

	it("passes a combination at or above the AA threshold", () => {
		expect(isLowContrast("#ffffff", "#000000")).toBe(false);
	});
});

describe("collectAdBannerLayoutTexts", () => {
	it("collects text from both slots for moderation", () => {
		// 한 슬롯이라도 빠지면 그 문구가 금칙어 검사를 통과해 버린다.
		const layout = createEmptyAdBannerLayout();
		layout.horizontal.texts = [
			{ ...createAdBannerTextBlock("a"), content: "가로 문구" },
		];
		layout.vertical.texts = [
			{ ...createAdBannerTextBlock("b"), content: "세로 문구" },
		];

		expect(collectAdBannerLayoutTexts(layout)).toEqual([
			"가로 문구",
			"세로 문구",
		]);
	});

	it("caps blocks per slot at the documented maximum", () => {
		expect(AD_BANNER_MAX_BLOCKS).toBe(5);
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm vitest run apps/web/src/lib/bambi/ad-banner-layout.test.ts` (저장소 루트에서)
Expected: FAIL — `Cannot find module './ad-banner-layout'`

- [ ] **Step 3: 구현한다**

`apps/web/src/lib/bambi/ad-banner-layout.ts`:

```ts
// 프리미엄 광고 배너 레이아웃. 구인자가 에디터에서 만든 결과를 그대로 담는 형태이며,
// job_ad_banner_layout.layout(jsonb)에 이 구조로 저장된다. 서버 zod
// (packages/api/src/services/bambi-ad-banner-layout.ts)와 값·범위가 1:1로 일치해야 한다.

export type AdBannerAnimation = "split" | "typing" | "glitch" | "blur";
export type AdBannerTextWeight = "normal" | "bold" | "extrabold";
export type AdBannerTextAlign = "left" | "center" | "right";
export type AdBannerSlot = "horizontal" | "vertical";

export const AD_BANNER_ANIMATION_VALUES = [
	"split",
	"typing",
	"glitch",
	"blur",
] as const satisfies readonly AdBannerAnimation[];

export const AD_BANNER_ANIMATION_LABELS: Record<AdBannerAnimation, string> = {
	blur: "블러 등장",
	glitch: "글리치",
	split: "글자 분리",
	typing: "타이핑",
};

const AD_BANNER_ANIMATION_DESCRIPTIONS: Record<AdBannerAnimation, string> = {
	blur: "흐릿하게 시작해 또렷해지며 나타납니다.",
	glitch: "화면 잡음처럼 글자가 흔들립니다.",
	split: "글자가 하나씩 아래에서 올라옵니다.",
	typing: "한 글자씩 입력되듯 나타납니다.",
};

export const AD_BANNER_ANIMATION_OPTIONS = AD_BANNER_ANIMATION_VALUES.map(
	(value) => ({
		description: AD_BANNER_ANIMATION_DESCRIPTIONS[value],
		label: AD_BANNER_ANIMATION_LABELS[value],
		value,
	})
);

// 슬롯당 문구 상한. 무제한이면 검수·렌더 비용이 커진다.
export const AD_BANNER_MAX_BLOCKS = 5;
export const AD_BANNER_TEXT_MAX_LENGTH = 40;
// 폰트 크기는 컨테이너 폭 대비 백분율(cqw)이다. 고정 px는 슬롯 폭이 272~600px로 변할 때 넘친다.
export const AD_BANNER_FONT_SIZE_MIN = 2;
export const AD_BANNER_FONT_SIZE_MAX = 20;
export const AD_BANNER_DEFAULT_FONT_SIZE = 8;
export const AD_BANNER_DEFAULT_TEXT_COLOR = "#ffffff";
export const AD_BANNER_DEFAULT_BACKGROUND_COLOR = "#1f2937";
// WCAG AA 본문 기준. 에디터 경고 판정에만 쓰고 저장을 막지는 않는다.
export const AD_BANNER_CONTRAST_THRESHOLD = 4.5;

export interface AdBannerTextBlock {
	align: AdBannerTextAlign;
	// null이면 애니메이션 없이 정적으로 렌더한다.
	animation: AdBannerAnimation | null;
	color: string;
	content: string;
	// 컨테이너 폭 대비 백분율.
	fontSize: number;
	id: string;
	weight: AdBannerTextWeight;
	// 블록 중심의 위치(%). 좌상단 기준이면 폰트 크기를 바꿀 때 블록이 밀려 편집 중 위치가 흔들린다.
	x: number;
	y: number;
}

export interface AdBannerSlotLayout {
	background: { type: "image" } | { color: string; type: "color" };
	// 이미지 배경 위 가독성 보조. 색 배경에서는 의미가 없어 렌더러가 무시한다.
	scrim: { enabled: boolean; opacity: number };
	texts: AdBannerTextBlock[];
}

export interface AdBannerLayout {
	horizontal: AdBannerSlotLayout;
	// 스키마가 바뀌면 렌더러가 분기할 수 있도록 버전을 박아 둔다.
	version: 1;
	vertical: AdBannerSlotLayout;
}

const createEmptySlot = (): AdBannerSlotLayout => ({
	background: { type: "image" },
	scrim: { enabled: true, opacity: 65 },
	texts: [],
});

// 편집을 시작할 때의 상태. 문구가 없으므로 렌더러는 이미지만 그린다 — 배너를 편집하지 않은
// 공고와 같은 결과다.
export const createEmptyAdBannerLayout = (): AdBannerLayout => ({
	horizontal: createEmptySlot(),
	version: 1,
	vertical: createEmptySlot(),
});

// 새 블록은 캔버스 중앙에 놓는다. 모서리에 생기면 구인자가 매번 끌어와야 한다.
export const createAdBannerTextBlock = (id: string): AdBannerTextBlock => ({
	align: "center",
	animation: null,
	color: AD_BANNER_DEFAULT_TEXT_COLOR,
	content: "새 문구",
	fontSize: AD_BANNER_DEFAULT_FONT_SIZE,
	id,
	weight: "bold",
	x: 50,
	y: 50,
});

export const clampPercent = (value: number): number =>
	Math.min(100, Math.max(0, value));

// sRGB 상대휘도. 알파 합성은 하지 않는다 — 에디터 경고는 단색 배경일 때만 계산한다.
const relativeLuminance = (hex: string): number => {
	const value = hex.replace("#", "");
	const channels = [0, 2, 4].map((offset) => {
		const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
		return raw <= 0.039_28 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
	});

	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

export const contrastRatio = (hexA: string, hexB: string): number => {
	const a = relativeLuminance(hexA);
	const b = relativeLuminance(hexB);
	const lighter = Math.max(a, b);
	const darker = Math.min(a, b);

	return (lighter + 0.05) / (darker + 0.05);
};

export const isLowContrast = (background: string, text: string): boolean =>
	contrastRatio(background, text) < AD_BANNER_CONTRAST_THRESHOLD;

// 검수용 문구 수집. 두 슬롯을 모두 훑어야 한 쪽 문구가 금칙어 검사를 빠져나가지 않는다.
export const collectAdBannerLayoutTexts = (
	layout: AdBannerLayout
): string[] => [
	...layout.horizontal.texts.map((block) => block.content),
	...layout.vertical.texts.map((block) => block.content),
];
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `pnpm vitest run apps/web/src/lib/bambi/ad-banner-layout.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 타입 체크와 커밋**

Run: `pnpm -F web check-types` → EXIT 0

```bash
pnpm dlx ultracite fix
git add apps/web/src/lib/bambi/ad-banner-layout.ts apps/web/src/lib/bambi/ad-banner-layout.test.ts
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 광고 배너 레이아웃 타입·상수·유틸 추가
- 자유 배치 배너의 JSON 구조(슬롯별 배경·스크림·문구 블록)를 단일 소스로 정의
- 좌표·폰트 크기를 백분율로 두어 슬롯 폭이 272~600px로 변해도 비율 유지
- 블록 좌표는 중심 기준 — 좌상단이면 폰트 크기 변경 시 블록이 밀려 편집 중 위치가 흔들림
- 연출 4종(split·typing·glitch·blur) 값과 라벨 맵, 검수용 문구 수집기, WCAG 대비 계산 포함
```

---

## Task 2: DB 스키마와 마이그레이션 0040

**Files:**
- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0040_*.sql` (drizzle-kit 생성)

**Interfaces:**
- Produces: `jobAdBannerLayout` 테이블(`jobPostId` PK, `layout` jsonb, `createdAt`, `updatedAt`)

- [ ] **Step 1: 새 테이블을 추가한다**

`packages/db/src/schema/bambi.ts`의 `jobPostMedia` 정의 아래에 넣는다:

```ts
// 프리미엄 광고 배너의 자유 배치 레이아웃. 구조는
// apps/web/src/lib/bambi/ad-banner-layout.ts의 AdBannerLayout과 같고, 서버 zod가 저장 전에
// 검증한다. jobPostId가 PK라 공고당 정확히 한 행이며, 행의 존재 여부가 "배너를 편집했는가"다.
export const jobAdBannerLayout = pgTable("job_ad_banner_layout", {
	jobPostId: uuid("job_post_id")
		.primaryKey()
		.references(() => jobPost.id, { onDelete: "cascade" }),
	layout: jsonb("layout").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});
```

- [ ] **Step 2: 구 컬럼과 enum을 제거한다**

`jobPost` 테이블에서 `adBannerHeadline`·`adBannerSubline`·`adBannerVerticalText`·`adBannerAnimation`·`adBannerTheme` 5개 컬럼 정의를 지운다. 파일 상단의 `adBannerAnimation`·`adBannerTheme` pgEnum 선언도 지운다.

`bambiSiteSettings.adInquiryTel`은 **남긴다** — 자리표시 문의 번호라 배너 문구와 무관하다.

- [ ] **Step 3: 관계와 잔여 참조를 정리한다**

Run: `pnpm -F @bambi-app/db check-types`
Expected: EXIT 0

`jobPostRelations`에 배너 레이아웃 관계를 추가할 필요는 없다 — 조회는 명시적 join으로 하고, drizzle relations는 이 저장소에서 일부 테이블만 쓴다.

- [ ] **Step 4: 마이그레이션을 생성하고 검토한다**

Run: `pnpm db:generate`
Expected: `packages/db/src/migrations/0040_*.sql` 생성

생성된 SQL에 다음이 들어갔는지 확인한다:
- `CREATE TABLE "job_ad_banner_layout"` (PK + FK cascade)
- `ALTER TABLE "job_post" DROP COLUMN` × 5
- `DROP TYPE "public"."ad_banner_animation"`, `DROP TYPE "public"."ad_banner_theme"`

**이 마이그레이션은 의도적으로 파괴적이다.** 로컬 dev DB 확인 결과 배너 문구가 들어간 행이 0건이고 프로덕션에는 0039가 적용되지 않았다. SQL이 그 외의 컬럼·테이블을 건드리면 멈추고 보고한다.

- [ ] **Step 5: 적용하고 실제 스키마로 검증한다**

Run: `pnpm db:migrate`

적용 후 "적용됐다는 로그"가 아니라 스키마로 확인한다. 워크트리에 `apps/server/.env`가 없으므로 메인 체크아웃의 `DATABASE_URL`을 환경변수로 주입해 실행한다(`.env` 파일을 만들지 않는다):

```bash
set -a && eval "$(tr -d '\r' < /c/Users/user/projects/bambi-app/apps/server/.env | grep -E '^[A-Za-z_][A-Za-z0-9_]*=')" && set +a
```

검증 쿼리(임시 스크립트를 `packages/db`에 만들어 실행 후 삭제):
- `information_schema.tables`에 `job_ad_banner_layout`이 있는가
- `information_schema.columns`에 `job_post`의 `ad_banner_%` 컬럼이 **0건**인가
- `pg_type`에 `ad_banner_animation`·`ad_banner_theme`이 **없는가**

- [ ] **Step 6: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations/
git commit -F <메시지 파일>
```

메시지:

```
feat(db): 광고 배너 레이아웃 테이블 신설과 구 배너 컬럼 제거(0040)
- job_ad_banner_layout 테이블 추가 — job_post_id를 PK로 둬 공고당 한 행, cascade 삭제
- job_post의 배너 문구·연출·테마 컬럼 5개와 ad_banner_animation·ad_banner_theme enum 제거
- 데이터 이관 없음: 로컬 dev 배너 문구 0건, 프로덕션은 0039 미적용으로 컬럼 자체가 없음
- bambi_site_settings.ad_inquiry_tel은 자리표시 문의 번호라 유지
```

---

## Task 3: 애니메이션 2종 추가와 정리

**Files:**
- Create: `apps/web/src/components/bambi/text-animations/split-text.tsx`
- Create: `apps/web/src/components/bambi/text-animations/glitch-text.tsx`
- Delete: `apps/web/src/components/bambi/text-animations/decrypted-text.tsx`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/components/bambi/ad-banner-text.tsx`

**Interfaces:**
- Consumes: `AdBannerAnimation` (Task 1)
- Produces: `<AdBannerText animation={AdBannerAnimation | null} className?: string scrimColor?: string text: string />` — 값에 맞는 렌더를 고르고, 게이트가 꺼져 있으면 정적 텍스트를 그린다

- [ ] **Step 1: 글리치 keyframes를 `@theme`에 추가하고 구 keyframes를 지운다**

`apps/web/src/index.css`의 `@theme` 블록에서 `--animate-shiny`·`--animate-gradient`와 두 `@keyframes`(`ad-banner-shiny`, `ad-banner-gradient`)를 지우고 아래를 넣는다. 새 CSS 파일이나 전역 클래스를 만들지 않는다:

```css
	--animate-glitch-before: ad-banner-glitch 2s steps(12, end) 3;
	--animate-glitch-after: ad-banner-glitch 3s steps(12, end) 2;

	@keyframes ad-banner-glitch {
		0% {
			clip-path: inset(20% 0 50% 0);
		}
		20% {
			clip-path: inset(30% 0 40% 0);
		}
		40% {
			clip-path: inset(10% 0 60% 0);
		}
		60% {
			clip-path: inset(40% 0 20% 0);
		}
		80% {
			clip-path: inset(15% 0 55% 0);
		}
		100% {
			clip-path: inset(25% 0 35% 0);
		}
	}
```

반복 횟수를 `3`·`2`로 유한하게 둔 것이 핵심이다. 원본은 `infinite`인데, 광고 슬롯이 최대 8칸까지 동시에 뜨므로 무한 반복이면 마켓플레이스 홈에서 상시 리페인트가 발생한다. 2~3회(약 6초) 후 정지한다.

- [ ] **Step 2: `glitch-text.tsx`를 만든다**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";

// React Bits GlitchText를 배너용으로 옮긴 것. 원본은 ::before/::after로 텍스트를 두 벌 복제하고
// 배경색을 깔아 원본을 가린 뒤 clip-path로 잘라 어긋나게 보여준다 — 배경색이 효과의 부품이라
// 투명하게 두면 세 겹이 겹쳐 뭉개진 글자가 된다. 그래서 호출자가 배너 배경색(또는 스크림 색)을
// scrimColor로 넘겨 pseudo 배경에 주입한다.
// 원본의 무한 반복은 슬롯 8칸 상시 리페인트가 되므로 @theme에서 유한 횟수로 바꿨다.
export function GlitchText({
	className,
	scrimColor,
	text,
}: {
	className?: string;
	scrimColor: string;
	text: string;
}) {
	return (
		<span
			className={cn(
				"relative inline-block",
				"before:absolute before:top-0 before:left-[-2px] before:animate-glitch-before before:overflow-hidden before:bg-[var(--glitch-bg)] before:text-[color:var(--glitch-shadow-before)] before:content-[attr(data-text)]",
				"after:absolute after:top-0 after:left-[2px] after:animate-glitch-after after:overflow-hidden after:bg-[var(--glitch-bg)] after:text-[color:var(--glitch-shadow-after)] after:content-[attr(data-text)]",
				className
			)}
			data-text={text}
			// 구인자가 고른 배경색은 값이 무한한 런타임 데이터라 Tailwind 클래스로 표현할 수 없다.
			// CSS 변수 주입에만 한정한다(일반 스타일은 전부 className).
			style={
				{
					"--glitch-bg": scrimColor,
					"--glitch-shadow-after": "oklch(0.7 0.2 25)",
					"--glitch-shadow-before": "oklch(0.8 0.15 200)",
				} as React.CSSProperties
			}
		>
			{text}
		</span>
	);
}
```

- [ ] **Step 3: `split-text.tsx`를 만든다**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

gsap.registerPlugin(SplitText);

// React Bits SplitText를 배너용으로 줄인 것. 원본의 ScrollTrigger는 걷어냈다 — 이 프로젝트는
// 마운트 시 1회 재생 정책이고, 애니메이션 게이트(ad-banner-text.tsx)가 그 역할을 이미 한다.
// @gsap/react(useGSAP)도 쓰지 않는다: gsap.context + useLayoutEffect가 같은 스코핑·정리를 준다.
export function SplitTextAnimation({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const containerRef = useRef<HTMLSpanElement>(null);
	// 폰트 로드 전에 글자를 쪼개면 잘못된 위치로 분리된다(원본이 같은 이유로 기다린다).
	const [fontsReady, setFontsReady] = useState(false);

	useEffect(() => {
		if (document.fonts.status === "loaded") {
			setFontsReady(true);
			return;
		}

		let cancelled = false;
		document.fonts.ready.then(() => {
			if (!cancelled) {
				setFontsReady(true);
			}
		});

		return () => {
			cancelled = true;
		};
	}, []);

	// useEffect가 아니라 useLayoutEffect인 이유: 패시브 이펙트는 페인트 뒤에 돌 수 있어
	// "완성된 문구가 한 프레임 보였다가 from 상태로 되돌아가는" 역방향 깜빡임이 생긴다.
	useLayoutEffect(() => {
		if (!(fontsReady && containerRef.current)) {
			return;
		}

		const element = containerRef.current;
		const split = new SplitText(element, { type: "chars" });
		const ctx = gsap.context(() => {
			gsap.fromTo(
				split.chars,
				{ opacity: 0, y: 24 },
				{ duration: 0.6, ease: "power3.out", opacity: 1, stagger: 0.04, y: 0 }
			);
		}, containerRef);

		return () => {
			ctx.revert();
			split.revert();
		};
	}, [fontsReady]);

	return (
		<span className={cn("inline-block", className)} ref={containerRef}>
			{text}
		</span>
	);
}
```

- [ ] **Step 4: 디스패처를 4종으로 갈아끼운다**

`ad-banner-text.tsx`에서 `decrypt`·`shiny`·`gradient` 분기와 `SHINY_CLASS_NAME`·`GRADIENT_CLASS_NAME` 상수를 지우고, `split`·`glitch`를 추가한다. `useAnimationEnabled` 게이트와 `React.lazy` + `Suspense` 구조는 **그대로 둔다** — 서버 HTML에 정적 문구를 남기고 `prefers-reduced-motion`을 차단하는 장치다.

`GlitchText`는 `scrimColor`가 필요하므로 `AdBannerText`도 그 prop을 받아 넘긴다. gsap을 쓰는 `blur-text`·`split-text`는 계속 `React.lazy`로 지연 로드한다.

- [ ] **Step 5: `decrypted-text.tsx`를 삭제한다**

파일을 지우고 저장소 전체에서 참조가 남지 않았는지 확인한다:

Run: `rg "decrypted-text|DecryptedText" apps packages`
Expected: 매치 없음

- [ ] **Step 6: 검증과 커밋**

Run: `pnpm -F web check-types` → EXIT 0

이 태스크에는 자동 테스트가 없다(렌더 컴포넌트). 타입 체크가 유일한 게이트다.

```bash
pnpm dlx ultracite fix
git add apps/web/src/components/bambi/text-animations/ apps/web/src/components/bambi/ad-banner-text.tsx apps/web/src/index.css
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 배너 연출을 split·typing·glitch·blur 4종으로 재편
- gsap SplitText로 글자 분리 등장 추가 — 이미 설치된 gsap 3.15.0에 포함돼 신규 패키지 없음
- 글리치 추가: pseudo 배경색이 효과의 부품이라 배너 배경·스크림 색을 CSS 변수로 주입
- 글리치 반복을 유한 횟수로 제한 — 원본 infinite는 슬롯 8칸에서 상시 리페인트가 됨
- 해독 효과·반짝임·그라디언트 3종과 그 keyframes 제거
- ScrollTrigger는 쓰지 않음: 마운트 시 1회 재생 정책이라 게이트가 같은 역할을 함
- 폰트 로드 대기는 유지 — 로드 전에 글자를 쪼개면 잘못된 위치로 분리됨
```

---

## Task 4: 레이아웃 렌더러

**Files:**
- Create: `apps/web/src/components/bambi/ad-banner-layout-renderer.tsx`

**Interfaces:**
- Consumes: `AdBannerLayout`·`AdBannerSlot` (Task 1), `AdBannerText` (Task 3)
- Produces: `<AdBannerLayoutRenderer layout={AdBannerLayout | null} slot={AdBannerSlot} />` — 레이아웃이 없으면 `null`을 반환해 호출부가 이미지만 그리게 한다

- [ ] **Step 1: 렌더러를 구현한다**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type {
	AdBannerLayout,
	AdBannerSlot,
	AdBannerTextBlock,
} from "@/lib/bambi/ad-banner-layout";
import { AdBannerText } from "./ad-banner-text";

const WEIGHT_CLASS_NAMES = {
	bold: "font-bold",
	extrabold: "font-extrabold",
	normal: "font-normal",
} as const;

const ALIGN_CLASS_NAMES = {
	center: "text-center",
	left: "text-left",
	right: "text-right",
} as const;

// 글리치는 pseudo 요소에 배경색을 깔아야 효과가 성립한다. 색 배경이면 그 색을, 이미지 배경이면
// 스크림 색을 넘긴다(스크림이 꺼져 있어도 글리치가 뭉개지지 않도록 어두운 기본값을 준다).
const resolveScrimColor = (
	background: AdBannerLayout["horizontal"]["background"]
): string => (background.type === "color" ? background.color : "#111827");

function TextBlockView({
	block,
	scrimColor,
}: {
	block: AdBannerTextBlock;
	scrimColor: string;
}) {
	return (
		<div
			className={cn(
				"-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute max-w-full",
				ALIGN_CLASS_NAMES[block.align],
				WEIGHT_CLASS_NAMES[block.weight]
			)}
			// 좌표·크기·색은 구인자가 정한 런타임 값이라 Tailwind 클래스로 표현할 수 없다.
			// CSS 변수 주입에만 한정한다.
			style={
				{
					"--block-color": block.color,
					"--block-size": `${block.fontSize}cqw`,
					"--block-x": `${block.x}%`,
					"--block-y": `${block.y}%`,
					left: "var(--block-x)",
					top: "var(--block-y)",
				} as React.CSSProperties
			}
		>
			<AdBannerText
				animation={block.animation}
				className="text-[length:var(--block-size)] text-[color:var(--block-color)] leading-tight"
				scrimColor={scrimColor}
				text={block.content}
			/>
		</div>
	);
}

// 슬롯 위에 얹는 자유 배치 레이아웃. 레이아웃이 없거나 해당 슬롯에 문구가 없으면 null을 돌려
// 호출부가 이미지만 그리게 한다 — 배너를 편집하지 않은 공고는 종전과 완전히 같은 결과다.
export function AdBannerLayoutRenderer({
	layout,
	slot,
}: {
	layout: AdBannerLayout | null;
	slot: AdBannerSlot;
}) {
	if (!layout) {
		return null;
	}

	const slotLayout = layout[slot];

	if (slotLayout.texts.length === 0) {
		return null;
	}

	const scrimColor = resolveScrimColor(slotLayout.background);
	const showScrim =
		slotLayout.background.type === "image" && slotLayout.scrim.enabled;

	return (
		<div className="pointer-events-none absolute inset-0 @container">
			{slotLayout.background.type === "color" ? (
				<div
					className="absolute inset-0"
					style={
						{ backgroundColor: slotLayout.background.color } as React.CSSProperties
					}
				/>
			) : null}
			{showScrim ? (
				<div
					className="absolute inset-0 bg-ink-900"
					style={
						{ opacity: slotLayout.scrim.opacity / 100 } as React.CSSProperties
					}
				/>
			) : null}
			{slotLayout.texts.map((block) => (
				<TextBlockView block={block} key={block.id} scrimColor={scrimColor} />
			))}
		</div>
	);
}
```

`@container`가 `cqw` 단위의 기준이다. 이게 없으면 `cqw`가 가장 가까운 조상 컨테이너를 찾아 엉뚱한 크기가 된다.

- [ ] **Step 2: 검증과 커밋**

Run: `pnpm -F web check-types` → EXIT 0

```bash
pnpm dlx ultracite fix
git add apps/web/src/components/bambi/ad-banner-layout-renderer.tsx
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 광고 배너 자유 배치 레이아웃 렌더러 추가
- 블록 좌표·폰트 크기를 CSS 변수로 주입하고 @container + cqw로 슬롯 폭에 비례시킴
- 블록은 중심 기준 배치(translate -50%)라 폰트 크기를 바꿔도 위치가 흔들리지 않음
- 레이아웃이 없거나 해당 슬롯에 문구가 없으면 null을 돌려 호출부가 이미지만 그리게 함
- 글리치용 배경색을 슬롯 배경(색이면 그 색, 이미지면 스크림 색)에서 도출해 전달
- pointer-events-none으로 아래 공고 상세 링크 클릭을 막지 않음
```

---

## Task 5: 에디터 본체

**Files:**
- Create: `apps/web/src/components/bambi/ad-banner-editor/use-block-drag.ts`
- Create: `apps/web/src/components/bambi/ad-banner-editor/editor-canvas.tsx`
- Create: `apps/web/src/components/bambi/ad-banner-editor/editor-block-panel.tsx`
- Create: `apps/web/src/components/bambi/ad-banner-editor/ad-banner-editor.tsx`

**Interfaces:**
- Consumes: Task 1의 타입·상수·유틸, Task 4의 `AdBannerLayoutRenderer`
- Produces: `<AdBannerEditor initialLayout={AdBannerLayout} backgroundUrls={{ horizontal?: string; vertical?: string }} onSave={(layout: AdBannerLayout) => void} onCancel={() => void} />`

- [ ] **Step 1: 드래그 훅을 만든다**

라이브러리를 쓰지 않는다. Pointer Events는 터치·마우스를 같은 코드로 처리한다.

```ts
"use client";

import { type RefObject, useCallback, useRef } from "react";
import { clampPercent } from "@/lib/bambi/ad-banner-layout";

// 캔버스 기준 백분율 드래그. setPointerCapture로 포인터를 잡아 캔버스 밖으로 나가도 이벤트가
// 계속 들어오게 한다 — 이게 없으면 빠르게 끌 때 블록이 중간에 멈춘다.
export const useBlockDrag = ({
	canvasRef,
	onMove,
}: {
	canvasRef: RefObject<HTMLDivElement | null>;
	onMove: (id: string, x: number, y: number) => void;
}) => {
	const draggingIdRef = useRef<string | null>(null);

	const handlePointerDown = useCallback(
		(id: string) => (event: React.PointerEvent<HTMLElement>) => {
			draggingIdRef.current = id;
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[]
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			const id = draggingIdRef.current;
			const canvas = canvasRef.current;

			if (!(id && canvas)) {
				return;
			}

			const rect = canvas.getBoundingClientRect();
			const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
			const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
			onMove(id, x, y);
		},
		[canvasRef, onMove]
	);

	const handlePointerUp = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			draggingIdRef.current = null;
			event.currentTarget.releasePointerCapture(event.pointerId);
		},
		[]
	);

	return { handlePointerDown, handlePointerMove, handlePointerUp };
};
```

- [ ] **Step 2: 캔버스를 만든다**

`editor-canvas.tsx`는 슬롯 비율(가로 `aspect-[7/3]`, 세로 `aspect-[4/9]`)을 유지하는 상자에 배경(이미지 또는 색)을 깔고, 문구 블록을 `absolute`로 놓는다. 각 블록에 `useBlockDrag`의 핸들러를 붙이고, 선택된 블록에는 `ring-2 ring-primary`로 테두리를 준다. 좌표·크기·색은 렌더러와 같은 방식(CSS 변수)으로 주입한다.

세로 캔버스는 실제 슬롯과 같은 `h-52`를 쓰지 않는다 — 편집하려면 더 커야 한다. 대신 같은 4:9 비율을 유지해 결과가 비례로 재현되게 한다.

- [ ] **Step 3: 속성 패널을 만든다**

`editor-block-panel.tsx`는 선택된 블록의 속성을 편집한다. shadcn 컴포넌트를 쓴다:

- 문구: `Input` (`maxLength={AD_BANNER_TEXT_MAX_LENGTH}`)
- 폰트 크기: `Slider` 또는 `Input type="number"` (`AD_BANNER_FONT_SIZE_MIN`~`MAX`)
- 색: `Input type="color"`
- 굵기·정렬·연출: `ToggleGroup`
- 삭제: `Button variant="ghost"`

배경이 단색일 때 `isLowContrast(background.color, block.color)`가 참이면 `Alert variant="warning"`으로 "이 조합은 읽기 어려울 수 있습니다"를 띄운다. 이미지 배경이고 스크림이 꺼져 있으면 "사진에 따라 글자가 안 보일 수 있습니다"를 띄운다. **경고일 뿐 저장을 막지 않는다.**

**연출로 `glitch`를 고르면 스크림을 자동으로 켠다.** 글리치는 pseudo 요소 배경색이 효과의 부품이라, 이미지 배경에서 스크림이 꺼져 있으면 넘길 색이 없어 효과가 뭉개진다. 자동으로 켜면서 "글리치는 배경이 필요해 오버레이를 켰습니다"라고 알린다.

- [ ] **Step 4: 에디터 본체를 조립한다**

`ad-banner-editor.tsx`가 상태를 들고 캔버스·패널을 배치한다.

- 상단: 가로형/세로형 `ToggleGroup` 탭
- 본문: 데스크톱은 캔버스 좌측·패널 우측(`grid lg:grid-cols-[2fr_1fr]`), 모바일은 세로 스택
- 하단: 배경 선택(이미지/단색 `ToggleGroup` + 단색이면 `Input type="color"`), 스크림 토글·강도, "문구 추가" 버튼, 저장·취소

"문구 추가"는 `createAdBannerTextBlock(crypto.randomUUID())`로 만들고, 이미 `AD_BANNER_MAX_BLOCKS`개면 버튼을 비활성화한다.

**에디터 본체는 순수 컴포넌트다** — `window`나 `postMessage`를 직접 만지지 않고 props로 받은 콜백만 호출한다. 팝업과 다이얼로그 두 껍데기가 각자 방식으로 그것을 채운다.

- [ ] **Step 5: 검증과 커밋**

Run: `pnpm -F web check-types` → EXIT 0

```bash
pnpm dlx ultracite fix
git add apps/web/src/components/bambi/ad-banner-editor/
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 광고 배너 에디터 본체 추가
- Pointer Events로 드래그 구현(라이브러리 없음) — setPointerCapture로 캔버스를 벗어나도 이벤트 유지
- 캔버스는 실제 슬롯 비율(7:3·4:9)을 유지해 결과가 비례로 재현됨
- 속성 패널에서 문구·크기·색·굵기·정렬·연출 편집, 단색 배경이면 WCAG 대비 경고 표시
- 에디터 본체는 window·postMessage를 모르는 순수 컴포넌트 — 팝업·다이얼로그 껍데기가 주입
```

---

## Task 6: 에디터 껍데기 (새창 라우트 + 다이얼로그)

**Files:**
- Create: `apps/web/src/app/employer/ad-banner-editor/page.tsx`
- Create: `apps/web/src/components/bambi/ad-banner-editor/editor-launcher.tsx`

**Interfaces:**
- Consumes: `AdBannerEditor` (Task 5)
- Produces: `<AdBannerEditorLauncher layout={AdBannerLayout} files={{ horizontal?: File; vertical?: File }} backgroundUrls={{ horizontal?: string; vertical?: string }} onChange={(layout: AdBannerLayout) => void} />` — 버튼 하나를 렌더하고 데스크톱은 새창, 모바일은 전체화면 다이얼로그를 연다

- [ ] **Step 1: 메시지 계약을 정한다**

```
에디터 ──({ type: "ad-banner-editor:ready" })──────────────▶ 부모
부모  ──({ type: "ad-banner-editor:init", layout, files })─▶ 에디터
에디터 ──({ type: "ad-banner-editor:save", layout })───────▶ 부모
```

양쪽 모두 `window.location.origin`으로 대상을 한정하고 수신 시 `event.origin`을 검사한다.

**배경 이미지는 URL이 아니라 `File` 객체를 넘긴다.** 배너 이미지는 공고 제출 시점에야 GCS로 올라가고 그 전까지 폼이 가진 건 `URL.createObjectURL` 결과뿐이다. blob URL은 생성한 문서에 묶여 있어 다른 창에서 로드되는지가 브라우저마다 갈리고 부모 창이 닫히면 무효가 된다. `File`은 structured clone 대상이라 `postMessage`로 복사되므로, 에디터가 받아 자기 문서에서 `createObjectURL`을 다시 호출한다. 수정 화면처럼 이미 업로드된 이미지가 있으면 그때는 GCS URL(`imageUrls`)을 넘긴다.

- [ ] **Step 2: 새창 라우트를 만든다**

`app/employer/ad-banner-editor/page.tsx`는 `"use client"` 페이지로, 마운트 시 `window.opener`에 `ready`를 보내고 `init`을 기다린다. 받은 뒤 `AdBannerEditor`를 렌더하고, `onSave`에서 `save`를 보낸 뒤 `window.close()`한다.

`window.opener`가 없으면(직접 URL 접근) "공고 등록 화면에서 열어 주세요" 안내를 띄운다.

- [ ] **Step 3: 런처를 만든다**

`editor-launcher.tsx`가 버튼과 두 경로를 담당한다.

- 화면 폭 판정은 `window.matchMedia("(min-width: 1024px)")` — 데스크톱이면 `window.open`, 아니면 다이얼로그
- `window.open`이 `null`을 돌려주면(팝업 차단) 다이얼로그로 폴백한다. **이 폴백이 없으면 버튼이 아무 반응 없는 것처럼 보인다**
- 다이얼로그 경로는 같은 React 트리라 `postMessage` 없이 `onSave` 콜백을 직접 받는다
- 새창 경로는 `message` 리스너를 걸고 `save`를 받으면 `onChange`를 호출한 뒤 리스너를 정리한다

- [ ] **Step 4: 검증과 커밋**

Run: `pnpm -F web check-types` → EXIT 0

```bash
pnpm dlx ultracite fix
git add apps/web/src/app/employer/ad-banner-editor/ apps/web/src/components/bambi/ad-banner-editor/editor-launcher.tsx
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 배너 에디터 진입 경로 추가(데스크톱 새창·모바일 다이얼로그)
- postMessage 핸드셰이크(ready→init→save)로 부모 폼과 통신, 양쪽 모두 origin 검사
- 배경 이미지는 URL이 아니라 File을 전달 — 제출 전까지 blob URL뿐이고 다른 창에서의 동작이 브라우저마다 갈림
- 팝업이 차단되면 다이얼로그로 폴백 — 없으면 버튼이 무반응처럼 보임
- 새창 라우트를 직접 열면 opener가 없으므로 안내 문구 표시
```

---

## Task 7: 서버 검증·저장·조회

**Files:**
- Create: `packages/api/src/services/bambi-ad-banner-layout.ts`
- Create: `packages/api/src/services/bambi-ad-banner-layout.test.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Modify: `apps/web/src/lib/bambi/api-job-mapper.ts`
- Modify: `packages/api/src/routers/bambi/ad-banner-catalog-parity.test.ts`

**Interfaces:**
- Consumes: Task 2의 `jobAdBannerLayout` 테이블
- Produces:
  - `adBannerLayoutSchema` (zod)
  - `collectLayoutTexts(layout: unknown): string[]`
  - `AdBannerItem.layout: AdBannerLayout | null` (매퍼)

- [ ] **Step 1: 실패하는 서버 테스트를 쓴다**

`packages/api/src/services/bambi-ad-banner-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	adBannerLayoutSchema,
	collectLayoutTexts,
} from "./bambi-ad-banner-layout";

const validBlock = {
	align: "center",
	animation: "blur",
	color: "#ffffff",
	content: "주말 알바 급구",
	fontSize: 8,
	id: "block-1",
	weight: "bold",
	x: 50,
	y: 50,
};

const validSlot = {
	background: { type: "image" },
	scrim: { enabled: true, opacity: 65 },
	texts: [validBlock],
};

const validLayout = {
	horizontal: validSlot,
	version: 1,
	vertical: { ...validSlot, texts: [] },
};

describe("adBannerLayoutSchema", () => {
	it("accepts a well-formed layout", () => {
		expect(adBannerLayoutSchema.safeParse(validLayout).success).toBe(true);
	});

	it("rejects coordinates outside the canvas", () => {
		// 좌표는 백분율이라 범위를 벗어나면 렌더에서 슬롯 밖으로 나간다.
		const layout = {
			...validLayout,
			horizontal: { ...validSlot, texts: [{ ...validBlock, x: 140 }] },
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});

	it("rejects a malformed color", () => {
		const layout = {
			...validLayout,
			horizontal: { ...validSlot, texts: [{ ...validBlock, color: "red" }] },
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});

	it("rejects more blocks than the cap", () => {
		const texts = Array.from({ length: 6 }, (_, index) => ({
			...validBlock,
			id: `block-${index}`,
		}));

		expect(
			adBannerLayoutSchema.safeParse({
				...validLayout,
				horizontal: { ...validSlot, texts },
			}).success
		).toBe(false);
	});

	it("rejects unknown keys", () => {
		// JSON 저장이라 DB 제약이 없다. 클라이언트가 임의 필드를 실어 보내면 그대로 들어간다.
		const layout = {
			...validLayout,
			horizontal: { ...validSlot, texts: [{ ...validBlock, script: "alert(1)" }] },
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});

	it("rejects an unknown animation value", () => {
		const layout = {
			...validLayout,
			horizontal: { ...validSlot, texts: [{ ...validBlock, animation: "shiny" }] },
		};

		expect(adBannerLayoutSchema.safeParse(layout).success).toBe(false);
	});
});

describe("collectLayoutTexts", () => {
	it("collects text from both slots", () => {
		const layout = {
			...validLayout,
			vertical: {
				...validSlot,
				texts: [{ ...validBlock, content: "세로 문구", id: "block-2" }],
			},
		};

		expect(collectLayoutTexts(layout)).toEqual(["주말 알바 급구", "세로 문구"]);
	});

	it("returns an empty array for a malformed value", () => {
		// 검수 경로가 저장된 JSON을 다시 읽을 때 형태를 신뢰할 수 없다.
		expect(collectLayoutTexts(null)).toEqual([]);
		expect(collectLayoutTexts({ nope: true })).toEqual([]);
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm -F @bambi-app/api test bambi-ad-banner-layout`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 서버 스키마를 구현한다**

`packages/api/src/services/bambi-ad-banner-layout.ts`:

```ts
import z from "zod";

// 배너 레이아웃 JSON의 서버 검증. JSON으로 옮기면서 DB enum·길이 제약이 사라졌으므로 이 스키마가
// 유일한 방어선이다. 값·범위는 apps/web/src/lib/bambi/ad-banner-layout.ts와 1:1로 일치해야 한다
// (ad-banner-catalog-parity.test.ts가 대조한다).
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_BLOCKS = 5;
const MAX_TEXT_LENGTH = 40;

export const AD_BANNER_ANIMATIONS = [
	"split",
	"typing",
	"glitch",
	"blur",
] as const;

const textBlockSchema = z
	.object({
		align: z.enum(["left", "center", "right"]),
		animation: z.enum(AD_BANNER_ANIMATIONS).nullable(),
		color: z.string().regex(HEX_COLOR, "색상 형식이 올바르지 않습니다."),
		content: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
		fontSize: z.number().min(2).max(20),
		id: z.string().min(1).max(64),
		weight: z.enum(["normal", "bold", "extrabold"]),
		x: z.number().min(0).max(100),
		y: z.number().min(0).max(100),
	})
	.strict();

const slotLayoutSchema = z
	.object({
		background: z.union([
			z.object({ type: z.literal("image") }).strict(),
			z
				.object({ color: z.string().regex(HEX_COLOR), type: z.literal("color") })
				.strict(),
		]),
		scrim: z
			.object({ enabled: z.boolean(), opacity: z.number().min(0).max(100) })
			.strict(),
		texts: z.array(textBlockSchema).max(MAX_BLOCKS),
	})
	.strict();

export const adBannerLayoutSchema = z
	.object({
		horizontal: slotLayoutSchema,
		version: z.literal(1),
		vertical: slotLayoutSchema,
	})
	.strict();

export type AdBannerLayoutInput = z.infer<typeof adBannerLayoutSchema>;

// 검수용 문구 수집. 저장된 jsonb를 다시 읽는 경로에서는 형태를 신뢰할 수 없으므로 파싱에
// 실패하면 빈 배열을 돌려 호출부가 그냥 넘어가게 한다.
export const collectLayoutTexts = (layout: unknown): string[] => {
	const parsed = adBannerLayoutSchema.safeParse(layout);

	if (!parsed.success) {
		return [];
	}

	return [
		...parsed.data.horizontal.texts.map((block) => block.content),
		...parsed.data.vertical.texts.map((block) => block.content),
	];
};
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `pnpm -F @bambi-app/api test bambi-ad-banner-layout`
Expected: PASS (8 tests)

- [ ] **Step 5: `jobs.ts`를 배선한다**

- `jobPostInputShape`에서 배너 문구 5필드를 지우고 `adBannerLayout: adBannerLayoutSchema.nullish()`를 넣는다
- `normalizeAdBannerText`·`AdBannerTextInput`·`NormalizedAdBannerText`·`EMPTY_AD_BANNER_TEXT`를 지우고, 배너형 노출이 아니면 레이아웃을 `null`로 만드는 함수로 대체한다:

```ts
// 배너 슬롯을 쓰지 않는 노출 타입이면 레이아웃을 버린다. 저장해두면 나중에 상품이 배너형으로
// 바뀔 때 검수받지 않은 문구가 조용히 노출된다.
export const normalizeAdBannerLayout = (
	layout: AdBannerLayoutInput | null | undefined,
	exposureType: string
): AdBannerLayoutInput | null =>
	(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType)
		? (layout ?? null)
		: null;
```

- `hasRiskFlags`가 보는 텍스트에 `collectLayoutTexts(layout).join(" ")`을 합류시킨다
- 공고 생성·수정 시 레이아웃이 있으면 `jobAdBannerLayout`에 upsert(`onConflictDoUpdate`), `null`이면 delete 한다
- `listAdBanners`에 `jobAdBannerLayout`을 `leftJoin`해 `layout`을 함께 내린다
- 수정 폼이 읽는 단건 조회(`getEditableById`, `getJobPostForAdmin`)에도 레이아웃을 실어 준다 — **프리필이 없으면 저장 시 레이아웃이 사라진다**

- [ ] **Step 6: 매퍼를 고친다**

`api-job-mapper.ts`에서 `AdBannerTextConfig`와 `text` 필드를 지우고 `layout: AdBannerLayout | null`을 넣는다. `toAdBannerItem`은 슬롯별 판정을 하지 않는다 — 렌더러가 슬롯을 보고 결정한다.

기존 `api-job-mapper.test.ts`의 배너 텍스트 관련 케이스를 레이아웃 기준으로 고친다.

- [ ] **Step 7: parity 테스트의 대조 대상을 바꾼다**

`ad-banner-catalog-parity.test.ts`는 DB enum과 대조하고 있었는데 enum이 사라졌다. **웹 카탈로그(`AD_BANNER_ANIMATION_VALUES`)와 서버 zod(`AD_BANNER_ANIMATIONS`)가 같은 4개 값을 쓰는지** 대조하도록 바꾼다. 웹 소스는 기존처럼 텍스트로 읽는다(`packages/api`가 `composite: true`라 cross-package import가 `tsc`에서 거부된다).

길이 상한(40)과 블록 상한(5)도 함께 대조한다 — 갈리면 "폼은 통과했는데 서버가 반려"라는 사용자에게 보이는 사고가 난다.

- [ ] **Step 8: 검증과 커밋**

Run: `pnpm -F @bambi-app/api test && pnpm vitest run apps/web && pnpm check-types`
Expected: 베이스라인 대비 실패 증가 없음, check-types EXIT 0

```bash
pnpm dlx ultracite fix
git add -A
git commit -F <메시지 파일>
```

메시지:

```
feat(api): 배너 레이아웃 JSON 검증·저장·조회 배선
- adBannerLayoutSchema로 좌표·크기·색·개수·enum을 서버에서 강제, strict()로 알 수 없는 키까지 거부
- JSON 전환으로 DB 제약이 사라져 이 스키마가 유일한 방어선
- 배너형 노출이 아니면 레이아웃을 폐기 — 상품이 나중에 배너형으로 바뀔 때 미검수 문구의 조용한 노출 차단
- 레이아웃 문구를 hasRiskFlags에 합류, 저장된 jsonb 파싱 실패 시 빈 배열로 안전 처리
- 생성·수정에서 upsert/delete, listAdBanners와 수정 폼 단건 조회에 레이아웃 탑재
- parity 테스트 대조 대상을 사라진 DB enum에서 웹 카탈로그↔서버 zod로 전환하고 길이·개수 상한도 대조
```

---

## Task 8: 폼 배선

**Files:**
- Modify: `apps/web/src/lib/bambi-job-form.ts`
- Modify: `apps/web/src/components/bambi/job-post-media-uploader.tsx`
- Modify: `apps/web/src/app/employer/new/page.tsx`
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`
- Modify: `apps/web/src/app/moderator/jobs/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `AdBannerEditorLauncher` (Task 6), `AdBannerLayout` (Task 1)

- [ ] **Step 1: 폼 상태를 레이아웃 하나로 바꾼다**

`bambi-job-form.ts`의 `JobForm`에서 배너 문구 5필드를 지우고 `adBannerLayout: AdBannerLayout | null`을 넣는다. `emptyJobForm`의 기본값은 `null`이다.

`toJobAdBannerTextForm`을 `toJobAdBannerLayoutForm`으로 바꾼다. **파라미터는 optional(`?:`)이 아니라 필수 + nullable로 둔다** — optional이면 레이아웃 컬럼이 없는 객체를 넘겨도 컴파일이 통과해 조용히 빈 값을 돌려주고, 그게 바로 이 함수가 막으려는 데이터 손실이다.

`validateJobForm`의 페이로드에 `adBannerLayout`을 싣는다.

- [ ] **Step 2: 업로더에 에디터 진입 버튼을 붙인다**

`job-post-media-uploader.tsx`의 배너 슬롯 그룹 아래에 `AdBannerEditorLauncher`를 렌더한다. 조건은 배너 업로드 슬롯과 동일하게 `getAdBannerUsagesForPreviewTemplate(...)`의 결과를 쓴다.

`files`에는 `media.adHorizontal?.file`·`media.adVertical?.file`을, `backgroundUrls`에는 이미 업로드된 이미지의 URL을 넘긴다.

props(`adBannerLayout`·`onAdBannerLayoutChange`)는 **필수로 둔다** — 배선을 빠뜨리면 컴파일이 깨진다.

- [ ] **Step 3: 세 화면을 배선한다**

`employer/new`, `employer/jobs/[id]/edit`, `moderator/jobs/[id]/edit` 모두:
- 폼 초기값에 `adBannerLayout`을 넣는다(수정 화면은 서버에서 읽은 값으로)
- 업로더에 `adBannerLayout`·`onAdBannerLayoutChange`를 넘긴다

**운영자 화면을 빠뜨리지 않는다.** `moderation.adminUpdateJobPost`도 입력 전체를 교체하므로, 프리필이 없으면 운영자가 공고를 한 번 손대는 순간 구인자가 만든 배너가 사라진다.

- [ ] **Step 4: 프리필 가드 테스트를 쓴다**

기존 `ad-banner-text-fields.test.ts`를 대체하는 소스 스캔 테스트를 만든다. 세 페이지가 `toJobAdBannerLayoutForm(job)`으로 초기화하는지 확인한다. 파일을 읽지 못하면 throw 하도록 해서 경로가 틀렸을 때 조용히 통과하지 않게 한다.

- [ ] **Step 5: 검증과 커밋**

Run: `pnpm -F web check-types && pnpm vitest run apps/web`
Expected: EXIT 0, 베이스라인 대비 실패 증가 없음

```bash
pnpm dlx ultracite fix
git add -A
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 공고 폼에 배너 에디터 진입과 레이아웃 상태 배선
- 배너 문구 5필드를 레이아웃 하나로 대체, 업로더 prop을 필수로 둬 배선 누락을 컴파일 실패로 만듦
- 등록·구인자 수정·운영자 수정 세 화면 모두 서버 값으로 프리필 — 입력 전체 교체 방식이라 누락 시 배너가 지워짐
- toJobAdBannerLayoutForm 파라미터를 필수+nullable로 둬 컬럼이 빠진 객체를 타입이 잡게 함
- 세 화면의 프리필을 소스 스캔 테스트로 확인
```

---

## Task 9: 렌더 연결과 구 파일 삭제

**Files:**
- Modify: `apps/web/src/components/bambi/ad-banner.tsx`
- Delete: `ad-banner-text-fields.tsx`, `ad-banner-text-fields.test.ts`, `ad-banner-text-overlay.tsx`, `lib/bambi/ad-banner-animations.ts`, `lib/bambi/ad-banner-animations.test.ts`

- [ ] **Step 1: 렌더러를 연결한다**

`ad-banner.tsx`의 `HorizontalAdBanner`·`AdBanner`에서 `AdBannerTextOverlay`를 `AdBannerLayoutRenderer`로 바꾸고 `slot`을 각각 `"horizontal"`·`"vertical"`로 넘긴다. `item.text` 조건은 `item.layout`으로 바꾼다.

`<Link>`의 `relative`와 세로형의 `overflow-hidden`은 **그대로 둔다** — 오버레이가 `absolute inset-0`이라 부모에 `relative`가 없으면 엉뚱한 조상 기준으로 배치되고, 스크림이 `rounded-lg` 모서리를 네모나게 덮는다.

`AdSlotPlaceholder`와 `AdSlotInquiryContent`는 건드리지 않는다 — 배너 문구와 무관하다.

- [ ] **Step 2: 구 파일을 삭제한다**

```bash
rm apps/web/src/components/bambi/ad-banner-text-fields.tsx \
   apps/web/src/components/bambi/ad-banner-text-fields.test.ts \
   apps/web/src/components/bambi/ad-banner-text-overlay.tsx \
   apps/web/src/lib/bambi/ad-banner-animations.ts \
   apps/web/src/lib/bambi/ad-banner-animations.test.ts
```

`AdSlotInquiryContent`가 `ad-banner-text-overlay.tsx`에 있으므로 **삭제 전에 `ad-banner.tsx` 근처로 옮긴다.** 자리표시 콘텐츠는 스크림도 애니메이션도 쓰지 않아 "텍스트 오버레이"가 아니고, 유일한 소비자가 `AdSlotPlaceholder`다.

Run: `rg "ad-banner-text-fields|ad-banner-text-overlay|ad-banner-animations|AdBannerTextOverlay|AdBannerTextConfig" apps packages`
Expected: 매치 없음

- [ ] **Step 3: 검증과 커밋**

Run: `pnpm check-types && pnpm vitest run apps/web && pnpm -F @bambi-app/api test`
Expected: EXIT 0, 베이스라인 대비 실패 증가 없음

```bash
pnpm dlx ultracite fix
git add -A
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 배너 슬롯에 레이아웃 렌더러 연결하고 구 오버레이 제거
- 가로형·세로형이 각자 슬롯 레이아웃을 렌더, 레이아웃이 없으면 종전처럼 이미지만 표시
- 자리표시 콘텐츠를 ad-banner.tsx 쪽으로 이관 — 스크림도 애니메이션도 쓰지 않아 텍스트 오버레이가 아님
- 고정 필드 입력·오버레이·연출 카탈로그 파일 제거
```

---

## Task 10: 최종 검증과 문서 동기화

- [ ] **Step 1: 전역 검증**

Run: `pnpm check-types && pnpm test && pnpm vitest run apps/web`

`pnpm test`(turbo)는 `test` 스크립트가 있는 패키지만 돈다 — web은 스크립트가 없어 건너뛰므로 `pnpm vitest run apps/web`을 반드시 함께 돌린다.

api 테스트는 워크트리에 `apps/server/.env`가 없어 다수 파일이 import 단계에서 실패한다. 메인 체크아웃의 값을 환경변수로 주입해 실행한다(`.env` 파일을 만들지 않는다).

- [ ] **Step 2: 잔여 참조 확인**

Run: `rg "adBannerHeadline|adBannerSubline|adBannerVerticalText|AdBannerTheme|decrypt|shiny|gradient" apps packages --type ts --type tsx`
Expected: `docs/` 외에는 매치 없음(단 `bg-gradient-*` 같은 Tailwind 유틸은 무관하니 제외)

- [ ] **Step 3: 계획 체크박스 갱신과 검증 노트 기록**

이 문서 하단에 검증 결과를 남기고 커밋한다.

- [ ] **Step 4: 사용자에게 시각 확인을 요청한다**

빌드·dev 서버 기동은 하지 않는다. 확인 요청 항목:
- 에디터에서 드래그한 위치가 실제 배너와 일치하는지
- 세로 슬롯(약 92px 폭)에서 문구가 읽히는지
- 연출 4종의 체감(특히 글리치가 6초 후 멈추는지)
- 팝업이 차단된 환경에서 다이얼로그로 폴백되는지
- 모바일에서 터치 드래그가 동작하는지

- [ ] **Step 5: 로컬 병합**

검증이 끝나면 `feat/premium-ad-text-animation`으로 no-ff 병합한다. 병합 커밋 제목은 `merge: 프리미엄 광고 배너 에디터`로 하고 `(worktree-*)` 접미사를 붙이지 않는다. push·PR은 사용자가 명시적으로 지시할 때만 한다.

**병합 전 확인:** 이 브랜치를 파는 동안에도 `feat/premium-ad-text-animation`에 다른 작업이 계속 들어오고 있다(개인정보 처리방침 관련). 겹치는 파일이 있는지 `git diff --name-only`로 대조하고, 병합 후 전역 `check-types`를 다시 돌려 의미적 충돌이 없는지 확인한다.

---

## 검증 노트

브랜치 `worktree-premium-ad-editor` (BASE `9b710f2`), 구현 커밋 10개 (`1fa619e` … `3ccc81e`).
아래는 Task 10에서 실제로 돌린 명령의 원문 결과다.

### 전역 검증 결과

`pnpm check-types` — **EXIT 0**

```
 Tasks:    7 successful, 7 total
Cached:    1 cached, 7 total
  Time:    59.477s
```

`pnpm vitest run apps/web`

```
 Test Files  3 failed | 45 passed (48)
      Tests  5 failed | 282 passed (287)
```

`pnpm -F @bambi-app/api test`

```
 Test Files  2 failed | 66 passed (68)
      Tests  3 failed | 487 passed (490)
```

**베이스라인(web 5 failed / api 3 failed) 대비 실패 증가 0, 통과 감소 0.** 남은 실패 8건은 전부
이 브랜치와 무관한 기존 실패이며, 배너 관련 파일은 하나도 없다.

| 실패 | 파일 | 성격 |
| --- | --- | --- |
| web 1 | `lib/bambi-job-blocks.test.ts` — 8MB 초과 이미지 반려 | 미디어 용량 검증 |
| web 2 | `app/employer/promotions/page.test.ts` — 끌어올리기 게이팅 / 수정 링크 제거 | 프로모션 |
| web 2 | `app/moderator/payments/payments.test.ts` — 결제·노출 배지 / 공고 상태 파생 | 결제 |
| api 2 | `routers/bambi/jobs-list-boost-order.test.ts` — 부스트 정렬 | 프로모션 |
| api 1 | `routers/bambi/moderation-support.test.ts` — 상세 조회 작성자 표시명 | 고객센터 |

`bambi-job-blocks.test.ts`만 이 브랜치가 건드린 파일이라 따로 대조했다. 브랜치 diff는 `baseForm`
픽스처의 구 배너 5필드를 `adBannerLayout: null` 한 줄로 바꾼 것이 전부이고, 실패하는 단언은
이미지 용량 메시지라 무관하다.

### 잔여 참조 확인

`docs/`·`packages/db/src/migrations/`(과거 마이그레이션은 역사) 제외 스캔에서
`adBannerHeadline` `adBannerSubline` `adBannerVerticalText` `AdBannerTheme` `adBannerTheme`
`ad_banner_theme` `ad_banner_animation` `AdBannerTextOverlay` `ad-banner-animations`
`ad-banner-text-fields` `decrypt` `blur-in` 매치 **0건**.

`shiny` 1건은 `packages/api/src/services/bambi-ad-banner-layout.test.ts:112`의
"rejects an unknown animation value" — 구 연출값이 **거부되는지** 확인하는 네거티브 테스트라
정상이다. `AdBannerAnimation` 심볼은 살아 있지만 신규 4종(`split`·`typing`·`glitch`·`blur`)
타입이고 구 카탈로그와 무관하다.

삭제 확인된 파일 7개: `ad-banner-text-fields.tsx`/`.test.ts`, `ad-banner-text-overlay.tsx`,
`text-animations/decrypted-text.tsx`, `lib/bambi/ad-banner-animations.ts`/`.test.ts`,
`routers/bambi/job-ad-banner-text.test.ts`.

---

## 계획과 실제가 달랐던 점

계획서를 그대로 따르지 않은 지점만 모았다. 근거는 `.superpowers/sdd/2026-07-27-premium-ad-banner-editor/progress.md`.

**1. 마이그레이션 번호가 0040이 아니라 0041.** 계획서는 `0040_*`을 전제했으나 브랜치에
`0040_steep_menace`가 이미 있었다. 실제 생성물은 **`0041_classy_ma_gnuci.sql`**
(+ `meta/0041_snapshot.json`). SQL 내용은 계획 범위와 정확히 일치했다 — CREATE TABLE 1 +
FK cascade + DROP COLUMN 5 + DROP TYPE 2, 그 외 0건. `db:migrate` 적용 후 pg 카탈로그로 검증했다.

**2. 물결 편성이 계획과 달랐다.** 계획은 `1=[T1] / 2=[T2,T3,T4] / 3=[T5,T7] / 4=[T6,T8] / 5=[T9] / 6=[T10]`이었다.
- **T4를 물결 2에서 뺐다** — T4는 T3이 `AdBannerText`에 `scrimColor` prop을 추가해야 타입체크가
  통과한다. 물결 2를 `T2+T3`로 줄이고 T4는 T3 완료 직후로 미뤘다.
- **이후 T4·T5·T6·T7을 4개 동시 실행했다**(사용자 요청으로 병렬 최대화). T5 브리프의
  `AdBannerLayoutRenderer`는 Interfaces 줄에만 있고 실제 단계에서 쓰지 않아 T4·T5가 독립이었고,
  T6은 T5의 `AdBannerEditor` 시그니처가 브리프에 확정돼 있어 미완성 import를 감수하고 붙였다.
- 최종 실행 순서: `1=[T1] / 2=[T2,T3] / 3=[T4,T5,T6,T7] / 4=[T8] / 5=[T9] / 6=[T10]`.

**3. 중간 상태에서 전체 타입체크가 녹색일 수 없었다.** 구 모듈·컬럼을 지우는 태스크(T2·T3)와
그 소비자를 고치는 태스크(T7·T8·T9)가 갈라져 있어서다. 각 구현자 브리프에 "예상되는 정상 에러"를
명시하고 **전역 녹색 게이트를 T9 이후로** 잡았다(계획서는 이 단계를 상정하지 않았다).

**4. T2가 깨뜨린 파일이 계획보다 하나 많았다.** 계획이 지목한 `jobs.ts`·`ad-banner-catalog-parity.test.ts`
외에 `packages/api/src/routers/bambi/job-ad-banner-text.test.ts`(구 5필드 픽스처)도 깨졌고 T9에서 삭제됐다.
사라진 export는 `adBannerAnimation`·`adBannerTheme` 2개뿐이며 나머지는 `jobPost.adBannerXxx` 속성
접근이라 `jobs.ts` select 절은 **런타임에도** 실패하는 상태였다.

**5. 계획 스니펫이 제약을 어겨 구현 단계에서 고쳤다.**
- T4 스니펫이 `left`/`top`/`backgroundColor`/`opacity`를 일반 인라인 `style`로 넣고 있었다 →
  CSS 커스텀 프로퍼티 주입 + `className`으로 전환(제약의 "CSS 변수 주입에만 한정" 예외에 맞춤).
- 글리치 기본색이 raw hex `#111827`로 실제 스크림 `bg-ink-900`(#0f1620)과 어긋났다 → `var(--ink-900)`.
- 글리치 잔상 색이 raw oklch 하드코딩이었다 → `@theme`의 `--color-glitch-cyan`/`--color-glitch-red` 토큰으로 이관.

**6. T1 유틸에 조용한 오판 경로 3건이 있어 별도 커밋(`48b5ec4`)으로 막았다.** 계획에 없던 작업이다.
- `clampPercent`가 NaN을 통과시킴 → `Number.isNaN`만 50으로 접는다(`Number.isFinite`를 쓰면 ±Infinity
  동작이 바뀌므로 일부러 쓰지 않았다).
- hex 파서가 트림·형식 검증을 안 해 `" #3f3f3f"`가 NaN 없이 **틀린 휘도**를 냄 → `parseHex`로 통합.
- `scrim.opacity` 단위 미명시 → 0~100 백분율로 못박고 `AD_BANNER_SCRIM_OPACITY_MIN/MAX/DEFAULT` 추가.

**7. 웹↔서버 계약에서 빈 문구 블록 구멍이 드러나 에디터에 가드를 넣었다.** 서버가
`content: z.string().trim().min(1)`이라 빈 블록을 보내면 배너가 아니라 **공고 저장 전체가 반려**되면서
원인 불명 에러가 뜬다. 에디터에 저장 전 가드를 추가했다(빈 블록이 있는 슬롯으로 전환 + 블록 선택 +
토스트 + 저장 중단). 계획에 없던 방어다. 그 외 계약(연출 4종·id 길이·fontSize 2~20·좌표 0~100·6자리 hex·
texts max 5·version 1·strict 키 집합)은 전부 일치를 확인했다.

**8. 브리프 Files 밖 파일을 두 번 건드렸다(둘 다 정당).**
- `packages/api/src/routers/bambi/moderation.ts` 2줄 — `getJobPostForAdmin`이 거기 있고 프리필이
  없으면 운영자 저장 시 배너가 사라진다.
- `apps/web/src/lib/bambi-job-blocks.test.ts` 5줄 — `JobForm` 리터럴을 안 고치면 타입체크가 불가능하다.

**9. 계획 Task 10의 `.env` 전제가 틀렸다.** 계획은 "워크트리에 `apps/server/.env`가 없어 api 테스트가
import 단계에서 실패한다"고 적고 환경변수 주입을 지시했지만, 실제로는 워크트리에 `.env`가 존재해
`pnpm -F @bambi-app/api test`가 그대로 돌았다. 주입 없이 위 결과를 얻었다.

**10. 계획 Task 10 Step 2의 `rg` 패턴에 `gradient`가 들어 있었다.** `bg-gradient-*` Tailwind 유틸이
대량으로 걸려 무의미하므로 스캔에서 뺐다(계획서 본문도 "무관하니 제외"라고 적고 있다).

### 테스트 커버리지 관련 제약

`apps/web`용 vitest config가 없어 `@/` alias가 해석되지 않는다. 그래서 `AdBannerLayoutRenderer`와
에디터 컴포넌트는 렌더 테스트를 붙이지 못했고, 대신 `ad-banner-layout-form-wiring.test.ts`가
세 화면(구인자 등록·구인자 수정·운영자 수정)의 프리필을 **소스 스캔**으로 고정한다(경로가 틀리면
`readFileSync`가 throw). Tailwind arbitrary value는 타입체크로 잡히지 않으므로 **시각 확인이 필요하다.**

### 최종 리뷰까지 들고 가는 미해결 관찰

전부 컨트롤러가 확인했고 이번 브랜치에서 고치지 않기로 한 것들이다.

- **[UX] 팝업 새창에 구인자 내비게이션이 딸려 온다.** `app/employer/ad-banner-editor/page.tsx`가
  `app/employer/layout.tsx` 아래라 `ResponsiveAppShell`·`EmployerNav`·`AccountStatusBanner`가 붙는다.
  route group으로는 부모 레이아웃을 못 벗는다 — 라우트를 `app/` 최상위로 옮기고 `resolveEmployerAccess()`
  게이트를 서버 래퍼 페이지에 직접 걸어야 한다(현 페이지가 `"use client"`라 래퍼 분리 필요).
  팝업에서 다른 화면으로 이동하면 postMessage 흐름이 고아가 된다.
- **[UI] `Slider`·`Field` 미설치라 `Input type="number"`로 대체됐다.** 글자 크기(2~20)·오버레이 강도(0~100)는
  슬라이더가 자연스럽다. 병렬 실행 중 `shadcn add` 충돌을 피하려 미뤘다.
- **[UX] 숫자 입력을 비우면 즉시 최솟값으로 클램프된다.** `Number("")`가 0이라 `Number.isFinite` 가드를
  통과한다. blur 시점 클램프가 정석이다.
- **[미해결] 드래그 grab offset 없음.** 블록을 잡으면 중심이 포인터로 점프한다. 중심 기준 좌표계라 감수했다.
- **[설계상 수용] 저장된 jsonb를 읽을 때 재검증 없이 캐스팅한다**(쓰기 경로가 전량 zod 통과).
  스키마 v2 도입 시 이 지점에 버전 분기가 필요하다.

### 매뉴얼 동기화

`docs/manual/employer-manual.md`에 **배너 문구 편집** 절을 신설했다(목차 항목 추가, `공고 등록` 5단계와
`공고 수정` 2단계에서 연결). 구 매뉴얼은 배너 이미지 2종 등록만 설명하고 고정 문구 3필드는 아예
다루지 않았으므로, 이번 변경은 삭제가 아니라 **신규 서술**이다. `docs/manual/moderator-manual.md`에는
공고 편집 화면 절 자체가 없고, `docs/manual/seeker-manual.md`에는 프리미엄 배너 서술이 없어 손대지 않았다.

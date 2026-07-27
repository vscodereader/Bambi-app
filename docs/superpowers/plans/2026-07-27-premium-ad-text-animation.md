# 프리미엄 광고 텍스트 애니메이션 배너 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프리미엄 광고 배너에 구인자가 고른 문구·애니메이션·테마를 이미지 위에 얹고, 빈 슬롯 자리표시를 운영자가 전화번호를 설정할 수 있는 컴포넌트로 바꾼다.

**Architecture:** 기존 이미지 배너 파이프라인(업로드·검증·로테이션)은 그대로 두고, `job_post`에 nullable 컬럼 5개를 더해 이미지 위 오버레이만 추가한다. 헤드라인이 null이면 오버레이를 렌더하지 않으므로 기존 공고는 손대지 않아도 지금과 똑같이 동작한다. 자리표시는 PNG를 걷어내고 같은 오버레이 엔진을 쓰는 DOM 렌더로 바꾼다.

**Tech Stack:** Next.js 16 (RSC), React 19, Tailwind v4, shadcn(base-ui), drizzle + PostgreSQL, oRPC, zod, vitest, `motion`(신규)

**스펙:** `docs/superpowers/specs/2026-07-27-premium-ad-text-animation-design.md`

## Global Constraints

- `apps/web`의 UI는 shadcn 컴포넌트 + Tailwind만. **인라인 `style={{...}}` 금지**, 새 `.css` 파일·전역 클래스 금지. 애니메이션 keyframes는 `apps/web/src/index.css`의 `@theme`에 `--animate-*`로 정의해 유틸리티로 소비한다
- **raw hex/oklch 금지.** 시맨틱 토큰(`bg-background`, `text-foreground`) 또는 브랜드 팔레트(`bg-coral-500`, `text-ink-800`)를 쓴다
- **임의 px 금지.** Tailwind 스케일 토큰을 쓴다. 반경은 `rounded-lg`(컨트롤·카드) / `rounded-md`(타일) / `rounded-full`(칩·배지)
- 간격은 `flex`/`grid` + `gap-*`. `space-x-*`·`space-y-*` 금지
- 조건부 클래스는 `cn()` (`@bambi-app/ui/lib/utils`). 템플릿 리터럴 삼항 금지
- base-ui이므로 `asChild`가 아니라 `render` prop. `render`가 `<Button>`이면 `nativeButton` 생략, Link/Input 등 비-button 렌더에만 `nativeButton={false}`
- 훅·이벤트 핸들러·브라우저 API를 쓰는 파일은 최상단에 `"use client"`
- **DB enum 원값을 화면에 그대로 렌더하지 않는다.** 새 enum에는 `*_LABELS` 맵을 동반한다
- **`pnpm db:push` 절대 금지.** `db:generate`/`db:migrate`는 사용자가 명시적으로 지시할 때만 실행한다
- **빌드·dev 서버 기동 금지.** 검증은 `check-types`와 vitest만. 시각 확인은 사용자가 한다
- 커밋 전 `pnpm dlx ultracite fix`로 Biome 정렬
- 모바일 반응형을 항상 함께 고려한다
- 테스트 명령: `pnpm -F web test`, `pnpm -F @bambi-app/api test` (web/server는 scope 없음, db/api만 `@bambi-app/*`)
- 커밋 메시지는 한국어 `type:` 제목 + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음). 다중 행 메시지는 임시 파일 + `git commit -F`
- **push·PR 생성 금지.** 사용자가 명시적으로 지시할 때만 한다

---

## File Structure

**신규**

| 파일 | 책임 |
| --- | --- |
| `apps/web/src/lib/bambi/ad-banner-animations.ts` | 애니메이션·테마 값과 라벨의 단일 소스 |
| `apps/web/src/lib/bambi/ad-banner-animations.test.ts` | 카탈로그 계약 검증 |
| `apps/web/src/components/bambi/text-animations/blur-text.tsx` | 블러 등장 (motion) |
| `apps/web/src/components/bambi/text-animations/decrypted-text.tsx` | 해독 효과 (motion) |
| `apps/web/src/components/bambi/text-animations/typing-text.tsx` | 타이핑 (의존성 없음) |
| `apps/web/src/components/bambi/ad-banner-text.tsx` | 애니메이션 값 → 컴포넌트 디스패치 |
| `apps/web/src/components/bambi/ad-banner-text-overlay.tsx` | 슬롯 위 오버레이 (가로·세로·자리표시) |
| `apps/web/src/components/bambi/ad-banner-text-fields.tsx` | 등록 폼 입력 + 실시간 미리보기 |
| `packages/db/src/migrations/0039_*.sql` | 컬럼 6개 + enum 2개 |

`shiny`·`gradient`는 CSS만으로 되므로 별도 컴포넌트를 만들지 않고 `ad-banner-text.tsx`가 클래스로 처리한다.

**수정**

| 파일 | 변경 |
| --- | --- |
| `packages/db/src/schema/bambi.ts` | enum 2개, `job_post` 5컬럼, `bambi_site_settings.adInquiryTel` |
| `packages/api/src/routers/bambi/jobs.ts` | 입력 zod, 정규화, `hasRiskFlags`, `listAdBanners` select |
| `packages/api/src/routers/bambi/site-settings.ts` | `FOOTER_COLUMNS`·`updateFooterInput`에 `adInquiryTel` |
| `apps/web/src/lib/bambi/api-job-mapper.ts` | `AdBannerItem`에 텍스트 설정 |
| `apps/web/src/lib/bambi-job-form.ts` | 폼 상태 필드 |
| `apps/web/src/components/bambi/ad-banner.tsx` | 오버레이 배선 + `AdSlotPlaceholder` 컴포넌트화 |
| `apps/web/src/components/bambi/job-post-media-uploader.tsx` | 텍스트 필드 삽입 |
| `apps/web/src/app/moderator/site-settings/page.tsx` | 광고 문의 전화 입력칸 |
| `apps/web/src/app/employer/new/page.tsx`, `.../jobs/[id]/edit/page.tsx` | 폼 상태 배선 |
| `apps/web/src/index.css` | `--animate-shiny`, `--animate-gradient` |
| `apps/web/package.json` | `motion` |

**삭제:** `apps/web/public/bambi/placeholder/horizontal-placeholder.png`, `vertical-placeholder.png`

---

## Task 1: 카탈로그 (애니메이션·테마 값과 라벨)

다른 모든 태스크가 이 값을 쓰므로 가장 먼저 못 박는다. 서버 zod enum과 DB enum이 이 값과 1:1이어야 한다.

**Files:**
- Create: `apps/web/src/lib/bambi/ad-banner-animations.ts`
- Test: `apps/web/src/lib/bambi/ad-banner-animations.test.ts`

**Interfaces:**
- Produces:
  - `type AdBannerAnimation = "blur-in" | "decrypt" | "typing" | "shiny" | "gradient"`
  - `type AdBannerTheme = "dark" | "light" | "coral" | "none"`
  - `AD_BANNER_ANIMATION_VALUES: readonly AdBannerAnimation[]`
  - `AD_BANNER_THEME_VALUES: readonly AdBannerTheme[]`
  - `AD_BANNER_ANIMATION_LABELS: Record<AdBannerAnimation, string>`
  - `AD_BANNER_THEME_LABELS: Record<AdBannerTheme, string>`
  - `AD_BANNER_ANIMATION_OPTIONS: readonly { description: string; label: string; value: AdBannerAnimation }[]`
  - `AD_BANNER_THEME_OPTIONS: readonly { label: string; value: AdBannerTheme }[]`
  - `DEFAULT_AD_BANNER_THEME: AdBannerTheme` (= `"dark"`)
  - `AD_BANNER_HEADLINE_MAX_LENGTH = 20`, `AD_BANNER_SUBLINE_MAX_LENGTH = 30`, `AD_BANNER_VERTICAL_TEXT_MAX_LENGTH = 8`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/src/lib/bambi/ad-banner-animations.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	AD_BANNER_ANIMATION_LABELS,
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_ANIMATION_VALUES,
	AD_BANNER_THEME_LABELS,
	AD_BANNER_THEME_OPTIONS,
	AD_BANNER_THEME_VALUES,
	DEFAULT_AD_BANNER_THEME,
} from "./ad-banner-animations";

describe("ad banner animation catalog", () => {
	it("labels every animation value", () => {
		// DB enum 원값이 화면에 새면 구인자가 "blur-in" 같은 값을 그대로 본다.
		for (const value of AD_BANNER_ANIMATION_VALUES) {
			expect(AD_BANNER_ANIMATION_LABELS[value]).toBeTruthy();
		}
	});

	it("labels every theme value", () => {
		for (const value of AD_BANNER_THEME_VALUES) {
			expect(AD_BANNER_THEME_LABELS[value]).toBeTruthy();
		}
	});

	it("offers exactly the catalog values as options", () => {
		// 옵션과 값 목록이 어긋나면 고를 수 없는 값이 DB에 저장되거나 그 반대가 된다.
		expect(AD_BANNER_ANIMATION_OPTIONS.map((option) => option.value)).toEqual([
			...AD_BANNER_ANIMATION_VALUES,
		]);
		expect(AD_BANNER_THEME_OPTIONS.map((option) => option.value)).toEqual([
			...AD_BANNER_THEME_VALUES,
		]);
	});

	it("describes every animation so the employer can pick without previewing", () => {
		for (const option of AD_BANNER_ANIMATION_OPTIONS) {
			expect(option.description.length).toBeGreaterThan(0);
		}
	});

	it("defaults the theme to a value in the catalog", () => {
		expect(AD_BANNER_THEME_VALUES).toContain(DEFAULT_AD_BANNER_THEME);
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm -F web test ad-banner-animations`
Expected: FAIL — `Cannot find module './ad-banner-animations'`

- [ ] **Step 3: 카탈로그를 구현한다**

`apps/web/src/lib/bambi/ad-banner-animations.ts`:

```ts
// 프리미엄 광고 배너 문구에 적용하는 애니메이션·테마 카탈로그.
// 서버(packages/api/src/routers/bambi/jobs.ts)의 zod enum, DB enum(adBannerAnimation·adBannerTheme)과
// 값이 1:1로 일치해야 한다. 여기가 어긋나면 구인자가 고른 값이 저장 단계에서 반려된다.
export type AdBannerAnimation =
	| "blur-in"
	| "decrypt"
	| "typing"
	| "shiny"
	| "gradient";

export type AdBannerTheme = "dark" | "light" | "coral" | "none";

export const AD_BANNER_ANIMATION_VALUES = [
	"blur-in",
	"decrypt",
	"typing",
	"shiny",
	"gradient",
] as const satisfies readonly AdBannerAnimation[];

export const AD_BANNER_THEME_VALUES = [
	"dark",
	"light",
	"coral",
	"none",
] as const satisfies readonly AdBannerTheme[];

// enum 원값이 화면에 새지 않도록 라벨을 반드시 경유한다.
export const AD_BANNER_ANIMATION_LABELS: Record<AdBannerAnimation, string> = {
	"blur-in": "블러 등장",
	decrypt: "해독 효과",
	gradient: "그라디언트",
	shiny: "반짝임",
	typing: "타이핑",
};

export const AD_BANNER_THEME_LABELS: Record<AdBannerTheme, string> = {
	coral: "코럴 그라디언트",
	dark: "어두운 오버레이",
	light: "밝은 오버레이",
	none: "오버레이 없음",
};

const AD_BANNER_ANIMATION_DESCRIPTIONS: Record<AdBannerAnimation, string> = {
	"blur-in": "흐릿하게 시작해 또렷해지며 나타납니다.",
	decrypt: "무작위 글자가 하나씩 제자리를 찾아갑니다.",
	gradient: "글자 위로 색이 천천히 흘러갑니다.",
	shiny: "글자 위로 빛이 스쳐 지나갑니다.",
	typing: "한 글자씩 입력되듯 나타납니다.",
};

// 폼 ToggleGroup이 쓰는 선택지. 값 순서는 카탈로그 순서를 그대로 따른다.
export const AD_BANNER_ANIMATION_OPTIONS = AD_BANNER_ANIMATION_VALUES.map(
	(value) => ({
		description: AD_BANNER_ANIMATION_DESCRIPTIONS[value],
		label: AD_BANNER_ANIMATION_LABELS[value],
		value,
	})
);

export const AD_BANNER_THEME_OPTIONS = AD_BANNER_THEME_VALUES.map((value) => ({
	label: AD_BANNER_THEME_LABELS[value],
	value,
}));

// 테마 미지정 배너는 어두운 오버레이로 렌더한다(가장 안전한 대비).
export const DEFAULT_AD_BANNER_THEME: AdBannerTheme = "dark";

// 문구 길이 상한. 서버 zod와 같은 값을 써야 한다 — 폼에서 통과한 문구가 저장에서 반려되면 안 된다.
// 세로형은 표시 폭이 약 92px뿐이라 8자가 상한이다.
export const AD_BANNER_HEADLINE_MAX_LENGTH = 20;
export const AD_BANNER_SUBLINE_MAX_LENGTH = 30;
export const AD_BANNER_VERTICAL_TEXT_MAX_LENGTH = 8;
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `pnpm -F web test ad-banner-animations`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
pnpm dlx ultracite fix
git add apps/web/src/lib/bambi/ad-banner-animations.ts apps/web/src/lib/bambi/ad-banner-animations.test.ts
git commit -m "feat(web): 광고 배너 텍스트 애니메이션·테마 카탈로그 추가"
```

---

## Task 2: DB 스키마와 마이그레이션

**Files:**
- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0039_*.sql` (drizzle-kit 생성)

**Interfaces:**
- Consumes: Task 1의 값 목록(문자열이 일치해야 한다)
- Produces: `jobPost.adBannerHeadline`, `.adBannerSubline`, `.adBannerVerticalText`, `.adBannerAnimation`, `.adBannerTheme`, `bambiSiteSettings.adInquiryTel`, pgEnum `adBannerAnimation`·`adBannerTheme`

- [ ] **Step 1: enum 2개를 추가한다**

`packages/db/src/schema/bambi.ts`의 `jobPostMediaUsage` 선언 아래에 붙인다:

```ts
// 프리미엄 광고 배너 문구에 적용하는 애니메이션. 값은
// apps/web/src/lib/bambi/ad-banner-animations.ts의 AD_BANNER_ANIMATION_VALUES와 1:1이다.
export const adBannerAnimation = pgEnum("ad_banner_animation", [
	"blur-in",
	"decrypt",
	"typing",
	"shiny",
	"gradient",
]);

// 배너 이미지 위 텍스트 가독성을 위한 오버레이 테마. 구인자가 색을 자유 지정하면 대비가
// 무너진 배너가 나오므로 프리셋으로 고정한다.
export const adBannerTheme = pgEnum("ad_banner_theme", [
	"dark",
	"light",
	"coral",
	"none",
]);
```

- [ ] **Step 2: `job_post`에 컬럼 5개를 추가한다**

`jobPost` 테이블 정의에서 `exposureEndsAt` 등 노출 관련 컬럼 근처에 넣는다:

```ts
	// 프리미엄 광고 배너에 얹는 문구·연출. 전부 null이면 예전처럼 이미지만 렌더한다
	// (기존 공고 데이터 마이그레이션 불필요). 가로형은 headline이, 세로형은 verticalText가
	// 있을 때만 오버레이를 그린다 — 세로 슬롯은 표시 폭이 약 92px이라 헤드라인을 잘라 쓰면
	// 문구가 잘린 채 노출된다.
	adBannerHeadline: text("ad_banner_headline"),
	adBannerSubline: text("ad_banner_subline"),
	adBannerVerticalText: text("ad_banner_vertical_text"),
	// null이면 애니메이션 없이 정적으로 렌더한다.
	adBannerAnimation: adBannerAnimation("ad_banner_animation"),
	// null이면 dark로 렌더한다(DEFAULT_AD_BANNER_THEME).
	adBannerTheme: adBannerTheme("ad_banner_theme"),
```

- [ ] **Step 3: `bambi_site_settings`에 컬럼 1개를 추가한다**

`tel` 컬럼 바로 아래에 넣는다:

```ts
	// 광고 슬롯 자리표시에 노출하는 광고 등록 문의 전화. 고객센터 전화(tel)와 다를 수 있어
	// 별도 컬럼이다. null이면 tel → BAMBI_COMPANY.tel 순으로 폴백한다.
	adInquiryTel: text("ad_inquiry_tel"),
```

- [ ] **Step 4: 타입 체크로 스키마를 검증한다**

Run: `pnpm -F @bambi-app/db check-types`
Expected: EXIT 0

- [ ] **Step 5: 마이그레이션 생성을 사용자에게 요청한다**

`pnpm db:generate`는 사용자가 명시적으로 지시할 때만 실행한다. 아직 지시를 받지 않았다면 여기서 멈추고 요청한다:

> 스키마 변경이 끝났습니다. `pnpm db:generate`를 실행해 `0039` 마이그레이션을 만들까요?

생성 후에는 `packages/db/src/migrations/0039_*.sql`에 enum 2개 `CREATE TYPE`과 컬럼 6개 `ADD COLUMN`이 들어갔는지 눈으로 확인한다. 컬럼이 전부 nullable이라 기존 행에 영향이 없어야 한다.

- [ ] **Step 6: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations/
git commit -F <메시지 파일>
```

메시지:

```
feat(db): 광고 배너 문구·연출 컬럼과 광고 문의 전화 추가
- ad_banner_animation·ad_banner_theme enum 신설(웹 카탈로그 값과 1:1)
- job_post에 배너 문구 3종·애니메이션·테마 컬럼 추가(전부 nullable — 기존 공고는 이미지만 렌더)
- bambi_site_settings에 ad_inquiry_tel 추가(자리표시 문의 번호, tel→코드 상수 폴백)
```

---

## Task 3: 텍스트 애니메이션 컴포넌트

React Bits(MIT + Commons Clause) 소스를 가져와 프로젝트 규칙에 맞게 다듬는다. `shiny`·`gradient`는 CSS만으로 되므로 컴포넌트를 만들지 않는다.

**Files:**
- Modify: `apps/web/package.json` (`motion` 추가)
- Modify: `apps/web/src/index.css` (`--animate-shiny`, `--animate-gradient`)
- Create: `apps/web/src/components/bambi/text-animations/blur-text.tsx`
- Create: `apps/web/src/components/bambi/text-animations/decrypted-text.tsx`
- Create: `apps/web/src/components/bambi/text-animations/typing-text.tsx`
- Create: `apps/web/src/components/bambi/ad-banner-text.tsx`

**Interfaces:**
- Consumes: `AdBannerAnimation` (Task 1)
- Produces: `<AdBannerText animation={AdBannerAnimation | null} className?: string text: string />` — 애니메이션 값에 맞는 렌더를 고르고, `prefers-reduced-motion`이거나 `animation`이 null이면 정적 텍스트를 그린다

- [ ] **Step 1: `motion`을 설치한다**

```bash
pnpm -F web add motion
```

`apps/web/package.json` dependencies에 들어갔는지 확인한다. 이 저장소는 pnpm workspace + catalog를 쓰므로 catalog 항목이 아닌 일반 버전 지정이 된다.

- [ ] **Step 2: CSS 애니메이션 토큰을 추가한다**

`apps/web/src/index.css`의 `@theme` 블록에 넣는다. 새 CSS 파일이나 전역 클래스를 만들지 않는다:

```css
	--animate-shiny: ad-banner-shiny 3s linear infinite;
	--animate-gradient: ad-banner-gradient 4s ease infinite;

	@keyframes ad-banner-shiny {
		0% {
			background-position: 100%;
		}
		100% {
			background-position: -100%;
		}
	}

	@keyframes ad-banner-gradient {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}
```

- [ ] **Step 3: `blur-text.tsx`를 만든다**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { motion } from "motion/react";

// React Bits BlurText를 배너용으로 줄인 것. 원본의 IntersectionObserver 대신 motion의
// whileInView를 쓴다 — 화면에 최대 8칸이 동시에 뜨므로 뷰포트에 들어온 배너만, 1회만 재생한다.
export function BlurText({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const words = text.split(" ");

	return (
		<span className={cn("flex flex-wrap justify-center gap-x-1", className)}>
			{words.map((word, index) => (
				<motion.span
					animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
					initial={{ filter: "blur(10px)", opacity: 0, y: -12 }}
					// biome-ignore lint/suspicious/noArrayIndexKey: 같은 단어가 반복될 수 있어 값으로 키를 못 만든다
					key={`${word}-${index}`}
					transition={{ delay: index * 0.12, duration: 0.5 }}
				>
					{word}
				</motion.span>
			))}
		</span>
	);
}
```

- [ ] **Step 4: `typing-text.tsx`를 만든다**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useEffect, useState } from "react";

const TYPING_INTERVAL_MS = 110;

// 의존성 없는 타이핑 연출. 커서는 Tailwind animate-pulse로 대신한다.
export function TypingText({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const [visibleCount, setVisibleCount] = useState(0);

	useEffect(() => {
		setVisibleCount(0);
		const timer = setInterval(() => {
			setVisibleCount((count) => {
				if (count >= text.length) {
					clearInterval(timer);
					return count;
				}
				return count + 1;
			});
		}, TYPING_INTERVAL_MS);

		return () => clearInterval(timer);
	}, [text]);

	return (
		<span className={cn("inline-flex items-center", className)}>
			{text.slice(0, visibleCount)}
			<span aria-hidden="true" className="ml-0.5 animate-pulse">
				|
			</span>
		</span>
	);
}
```

- [ ] **Step 5: `decrypted-text.tsx`를 만든다**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useEffect, useState } from "react";

const SCRAMBLE_POOL = "가나다라마바사아자차카타파하0123456789";
const SCRAMBLE_INTERVAL_MS = 60;
// 글자 하나가 제자리를 찾기까지 거치는 스크램블 횟수.
const SCRAMBLE_STEPS_PER_CHAR = 3;

// React Bits DecryptedText를 배너용으로 줄인 것. 앞에서부터 한 글자씩 확정되고 나머지는
// 무작위 글자로 남는다. 확정된 뒤에는 타이머를 멈춰 8칸이 동시에 돌아도 부담이 없다.
export function DecryptedText({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const [tick, setTick] = useState(0);
	const totalTicks = text.length * SCRAMBLE_STEPS_PER_CHAR;

	useEffect(() => {
		setTick(0);
		const timer = setInterval(() => {
			setTick((current) => {
				if (current >= totalTicks) {
					clearInterval(timer);
					return current;
				}
				return current + 1;
			});
		}, SCRAMBLE_INTERVAL_MS);

		return () => clearInterval(timer);
	}, [totalTicks]);

	const settledCount = Math.floor(tick / SCRAMBLE_STEPS_PER_CHAR);
	const rendered = [...text]
		.map((char, index) => {
			if (index < settledCount || char === " ") {
				return char;
			}
			const poolIndex = (tick + index) % SCRAMBLE_POOL.length;
			return SCRAMBLE_POOL[poolIndex];
		})
		.join("");

	return <span className={cn("inline-block", className)}>{rendered}</span>;
}
```

- [ ] **Step 6: 디스패처 `ad-banner-text.tsx`를 만든다**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { AdBannerAnimation } from "@/lib/bambi/ad-banner-animations";
import { TypingText } from "./text-animations/typing-text";

// motion을 쓰는 연출만 지연 로드한다 — 광고가 없는 페이지에는 번들이 실리지 않는다.
const BlurText = dynamic(
	() => import("./text-animations/blur-text").then((mod) => mod.BlurText),
	{ ssr: false }
);
const DecryptedText = dynamic(
	() =>
		import("./text-animations/decrypted-text").then((mod) => mod.DecryptedText),
	{ ssr: false }
);

// CSS만으로 되는 연출. 배경을 글자에 클리핑해 흐르게 한다.
const SHINY_CLASS_NAME =
	"animate-shiny bg-[linear-gradient(110deg,transparent_35%,rgb(255_255_255/0.85)_50%,transparent_65%)] bg-[length:200%_100%] bg-clip-text text-transparent";
const GRADIENT_CLASS_NAME =
	"animate-gradient bg-[linear-gradient(90deg,var(--color-coral-300),var(--color-coral-500),var(--color-coral-300))] bg-[length:200%_auto] bg-clip-text text-transparent";

// 시스템이 모션 최소화를 요청하면 애니메이션 없이 최종 상태만 그린다(접근성).
const usePrefersReducedMotion = (): boolean => {
	const [prefersReduced, setPrefersReduced] = useState(false);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setPrefersReduced(query.matches);

		const onChange = (event: MediaQueryListEvent) => {
			setPrefersReduced(event.matches);
		};
		query.addEventListener("change", onChange);

		return () => query.removeEventListener("change", onChange);
	}, []);

	return prefersReduced;
};

// 애니메이션 값에 맞는 렌더를 고른다. animation이 null이면 정적 텍스트다.
export function AdBannerText({
	animation,
	className,
	text,
}: {
	animation: AdBannerAnimation | null;
	className?: string;
	text: string;
}) {
	const prefersReducedMotion = usePrefersReducedMotion();

	if (!animation || prefersReducedMotion) {
		return <span className={className}>{text}</span>;
	}

	if (animation === "blur-in") {
		return <BlurText className={className} text={text} />;
	}

	if (animation === "decrypt") {
		return <DecryptedText className={className} text={text} />;
	}

	if (animation === "typing") {
		return <TypingText className={className} text={text} />;
	}

	if (animation === "shiny") {
		return (
			<span className={cn(SHINY_CLASS_NAME, className)}>{text}</span>
		);
	}

	return <span className={cn(GRADIENT_CLASS_NAME, className)}>{text}</span>;
}
```

`bg-[linear-gradient(...)]`의 raw rgb 값은 흰색 하이라이트라 브랜드 색이 아니다. 코럴은 `var(--color-coral-*)` 토큰을 경유했다.

- [ ] **Step 7: 타입 체크**

Run: `pnpm -F web check-types`
Expected: EXIT 0

- [ ] **Step 8: 커밋**

```bash
pnpm dlx ultracite fix
git add apps/web/package.json apps/web/src/index.css apps/web/src/components/bambi/text-animations/ apps/web/src/components/bambi/ad-banner-text.tsx pnpm-lock.yaml
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 배너 텍스트 애니메이션 컴포넌트 5종 추가
- motion 의존성 추가, blur-in·decrypt는 next/dynamic 지연 로드로 광고 없는 페이지 번들 제외
- typing은 무의존 구현, shiny·gradient는 @theme keyframes + bg-clip-text로 CSS 처리
- prefers-reduced-motion이면 애니메이션 없이 최종 상태만 렌더
```

---

## Task 4: 오버레이 컴포넌트

**Files:**
- Create: `apps/web/src/components/bambi/ad-banner-text-overlay.tsx`

**Interfaces:**
- Consumes: `AdBannerText` (Task 3), `AdBannerTheme`·`DEFAULT_AD_BANNER_THEME` (Task 1)
- Produces:
  - `interface AdBannerTextConfig { animation: AdBannerAnimation | null; headline: string | null; subline: string | null; theme: AdBannerTheme | null; verticalText: string | null }`
  - `<AdBannerTextOverlay config={AdBannerTextConfig} variant="horizontal" | "vertical" />` — 그릴 문구가 없으면 `null` 반환
  - `<AdSlotInquiryContent tel={string} variant="horizontal" | "vertical" />` — 자리표시 내용

- [ ] **Step 1: 오버레이를 구현한다**

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Megaphone } from "lucide-react";
import {
	type AdBannerAnimation,
	type AdBannerTheme,
	DEFAULT_AD_BANNER_THEME,
} from "@/lib/bambi/ad-banner-animations";
import { AdBannerText } from "./ad-banner-text";

export interface AdBannerTextConfig {
	animation: AdBannerAnimation | null;
	headline: string | null;
	subline: string | null;
	theme: AdBannerTheme | null;
	verticalText: string | null;
}

// 이미지 위에 글자를 얹으므로 가독성 확보용 스크림이 필요하다. 강도는 프리셋마다 고정한다 —
// 구인자가 색을 자유 지정하면 대비가 무너진 배너가 나온다.
const THEME_SCRIM_CLASS_NAMES: Record<AdBannerTheme, string> = {
	coral: "bg-gradient-to-t from-coral-600/85 via-coral-500/45 to-transparent",
	dark: "bg-gradient-to-t from-ink-900/85 via-ink-900/40 to-transparent",
	light: "bg-gradient-to-t from-white/90 via-white/50 to-transparent",
	none: "",
};

const THEME_TEXT_CLASS_NAMES: Record<AdBannerTheme, string> = {
	coral: "text-white",
	dark: "text-white",
	light: "text-ink-900",
	// 스크림이 없으면 배경이 무엇이든 읽히도록 그림자로 버틴다.
	none: "text-white drop-shadow-md",
};

// 그릴 문구가 슬롯별로 다르다. 가로형은 headline, 세로형은 verticalText가 기준이며
// 헤드라인을 잘라 세로에 쓰지 않는다(20자를 8자 폭에 넣으면 잘린 문구가 노출된다).
export function AdBannerTextOverlay({
	config,
	variant,
}: {
	config: AdBannerTextConfig;
	variant: "horizontal" | "vertical";
}) {
	const theme = config.theme ?? DEFAULT_AD_BANNER_THEME;
	const scrim = THEME_SCRIM_CLASS_NAMES[theme];
	const textTone = THEME_TEXT_CLASS_NAMES[theme];

	if (variant === "vertical") {
		if (!config.verticalText) {
			return null;
		}

		return (
			<div
				className={cn(
					"pointer-events-none absolute inset-0 flex items-center justify-center p-2",
					scrim
				)}
			>
				<AdBannerText
					animation={config.animation}
					className={cn(
						"[writing-mode:vertical-rl] font-extrabold text-base tracking-tight",
						textTone
					)}
					text={config.verticalText}
				/>
			</div>
		);
	}

	if (!config.headline) {
		return null;
	}

	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-1 p-3 text-center",
				scrim
			)}
		>
			<AdBannerText
				animation={config.animation}
				className={cn(
					"font-extrabold text-base leading-tight sm:text-lg",
					textTone
				)}
				text={config.headline}
			/>
			{config.subline ? (
				<span className={cn("text-xs opacity-90", textTone)}>
					{config.subline}
				</span>
			) : null}
		</div>
	);
}

// 빈 광고 슬롯에 들어가는 "광고 등록 문의" 내용. 예전엔 전화번호가 박힌 PNG였고, 번호를
// 바꾸려면 이미지를 다시 만들어야 했다. 이제 운영자 설정값을 그대로 렌더한다.
export function AdSlotInquiryContent({
	tel,
	variant,
}: {
	tel: string;
	variant: "horizontal" | "vertical";
}) {
	if (variant === "vertical") {
		return (
			<div className="flex size-full flex-col items-center justify-center gap-2 bg-coral-500 p-2 text-center text-white">
				<Megaphone className="size-4" />
				<span className="font-bold text-xs leading-tight">광고 등록 문의</span>
				<span className="font-extrabold text-sm leading-tight tracking-tight">
					{tel}
				</span>
			</div>
		);
	}

	return (
		<div className="flex size-full flex-col items-center justify-center gap-1 bg-coral-500 p-3 text-center text-white">
			<span className="flex items-center gap-1.5 font-bold text-sm">
				<Megaphone className="size-4" />
				광고 등록 문의
			</span>
			<span className="font-extrabold text-xl tracking-tight">{tel}</span>
		</div>
	);
}
```

세로형 자리표시는 폭이 약 92px이라 세로쓰기 대신 줄바꿈으로 흘린다 — 번호가 세로로 서면 읽기 어렵다.

- [ ] **Step 2: 타입 체크**

Run: `pnpm -F web check-types`
Expected: EXIT 0

- [ ] **Step 3: 커밋**

```bash
pnpm dlx ultracite fix
git add apps/web/src/components/bambi/ad-banner-text-overlay.tsx
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 광고 배너 텍스트 오버레이 컴포넌트 추가
- 테마 프리셋 4종의 스크림·글자색을 고정 매핑으로 제공(구인자 색 자유 지정 배제)
- 가로형은 headline, 세로형은 verticalText 기준으로 렌더 판정(헤드라인 잘라 쓰지 않음)
- pointer-events-none으로 아래 공고 상세 링크 클릭을 막지 않음
- 자리표시용 광고 문의 콘텐츠 함께 제공
```

---

## Task 5: 광고 문의 전화 설정과 자리표시 컴포넌트화

이 태스크는 Task 6·7과 독립이다. 서버 컬럼은 Task 2에서 이미 추가돼 있다.

**Files:**
- Modify: `packages/api/src/routers/bambi/site-settings.ts`
- Modify: `apps/web/src/app/moderator/site-settings/page.tsx`
- Modify: `apps/web/src/components/bambi/ad-banner.tsx` (`AdSlotPlaceholder`)
- Create: `apps/web/src/components/bambi/ad-banner.test.ts`
- Delete: `apps/web/public/bambi/placeholder/horizontal-placeholder.png`, `vertical-placeholder.png`

**Interfaces:**
- Consumes: `AdSlotInquiryContent` (Task 4)
- Produces: `resolveAdInquiryTel({ adInquiryTel, tel }): string` — 자리표시가 쓸 번호를 폴백 체인으로 확정한다

- [ ] **Step 1: 실패하는 폴백 테스트를 쓴다**

`apps/web/src/components/bambi/ad-banner.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { BAMBI_COMPANY } from "@/lib/bambi/company";
import { resolveAdInquiryTel } from "./ad-banner";

describe("resolveAdInquiryTel", () => {
	it("uses the ad inquiry number when the operator set one", () => {
		expect(
			resolveAdInquiryTel({ adInquiryTel: "070-1111-2222", tel: "02-333-4444" })
		).toBe("070-1111-2222");
	});

	it("falls back to the customer center number", () => {
		// 광고 문의 번호를 따로 두지 않은 운영자는 고객센터 번호로 문의를 받는다.
		expect(
			resolveAdInquiryTel({ adInquiryTel: null, tel: "02-333-4444" })
		).toBe("02-333-4444");
	});

	it("falls back to the code constant when nothing is set", () => {
		// 사이트 설정 행이 아예 없는 초기 상태에서도 자리표시에 번호가 비지 않아야 한다.
		expect(resolveAdInquiryTel({ adInquiryTel: null, tel: null })).toBe(
			BAMBI_COMPANY.tel
		);
	});

	it("treats a blank string as unset", () => {
		expect(
			resolveAdInquiryTel({ adInquiryTel: "   ", tel: "02-333-4444" })
		).toBe("02-333-4444");
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm -F web test ad-banner`
Expected: FAIL — `resolveAdInquiryTel is not exported`

- [ ] **Step 3: 서버에 `adInquiryTel`을 싣는다**

`packages/api/src/routers/bambi/site-settings.ts`:

```ts
const FOOTER_COLUMNS = {
	footerIntro: bambiSiteSettings.footerIntro,
	operator: bambiSiteSettings.operator,
	ceo: bambiSiteSettings.ceo,
	bizRegNo: bambiSiteSettings.bizRegNo,
	address: bambiSiteSettings.address,
	email: bambiSiteSettings.email,
	tel: bambiSiteSettings.tel,
	// 광고 슬롯 자리표시가 읽는 문의 번호. 푸터 전용은 아니지만 이미 공개 조회이고
	// 푸터가 모든 페이지에 있어 캐시를 공유하므로 별도 라우터를 만들지 않는다.
	adInquiryTel: bambiSiteSettings.adInquiryTel,
} as const;
```

`updateFooterInput`에도 추가한다:

```ts
	tel: optionalText(60),
	adInquiryTel: optionalText(60),
```

- [ ] **Step 4: 운영자 폼에 입력칸을 추가한다**

`apps/web/src/app/moderator/site-settings/page.tsx`의 "고객센터 전화" 필드 바로 아래에 넣는다. 폼 상태 초기화(`tel: data.tel ?? ""` 근처)에도 `adInquiryTel: data.adInquiryTel ?? ""`를 함께 추가한다:

```tsx
								<div className="flex flex-col gap-2">
									<Label htmlFor="adInquiryTel">광고 등록 문의 전화</Label>
									<Input
										id="adInquiryTel"
										onChange={update("adInquiryTel")}
										placeholder={form.tel || BAMBI_COMPANY.tel}
										type="tel"
										value={form.adInquiryTel}
									/>
									<p className="m-0 text-muted-foreground text-xs">
										광고 슬롯의 "광고 등록 문의"에 노출됩니다. 비워두면 고객센터
										전화가 표시됩니다.
									</p>
								</div>
```

- [ ] **Step 5: `AdSlotPlaceholder`를 컴포넌트 렌더로 바꾼다**

`apps/web/src/components/bambi/ad-banner.tsx`에서 `PLACEHOLDER_HORIZONTAL_SRC`·`PLACEHOLDER_VERTICAL_SRC` 상수와 `AdSlotPlaceholder`의 `<Image>`를 걷어내고 아래로 교체한다. `next/image` import가 `AdBanner`·`HorizontalAdBanner`에서 계속 쓰이므로 지우지 않는다:

```tsx
// 광고 문의 번호 폴백 체인. 운영자가 광고 전용 번호를 두지 않았으면 고객센터 번호를,
// 사이트 설정 행 자체가 없으면 코드 상수를 쓴다 — 자리표시에 번호가 비면 안 된다.
export const resolveAdInquiryTel = ({
	adInquiryTel,
	tel,
}: {
	adInquiryTel: string | null | undefined;
	tel: string | null | undefined;
}): string =>
	adInquiryTel?.trim() || tel?.trim() || BAMBI_COMPANY.tel;

// 빈 광고/카드 슬롯 자리표시 — 실제 배너와 같은 비율/크기로 "광고 등록 문의"를 그리는
// 클릭 불가 장식(aria-hidden). 8칸이 같은 문구를 반복하므로 스크린리더에는 읽히지 않게 두고,
// 빈 슬롯이 클릭되면 실제 광고와 혼동되므로 링크도 걸지 않는다.
// 비율/크기(aspect·h·w)는 호출부가 className으로 넘긴다 — display 클래스도 함께 넘겨야 한다.
export function AdSlotPlaceholder({
	className,
	variant = "horizontal",
}: {
	className?: string;
	variant?: "horizontal" | "vertical";
}) {
	const { data } = useQuery(orpc.bambi.siteSettings.getFooter.queryOptions());
	const tel = resolveAdInquiryTel({
		adInquiryTel: data?.adInquiryTel,
		tel: data?.tel,
	});

	return (
		<div
			aria-hidden="true"
			className={cn("relative overflow-hidden rounded-lg", className)}
		>
			<AdSlotInquiryContent tel={tel} variant={variant} />
		</div>
	);
}
```

필요한 import를 추가한다:

```tsx
import { useQuery } from "@tanstack/react-query";
import { AdSlotInquiryContent } from "./ad-banner-text-overlay";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import { orpc } from "@/utils/orpc";
```

`BAMBI_COMPANY`의 정확한 export 경로는 `apps/web/src/components/bambi/site-footer.tsx`의 import 문을 확인해 그대로 따른다.

- [ ] **Step 6: 테스트를 돌려 통과를 확인한다**

Run: `pnpm -F web test ad-banner`
Expected: PASS (4 tests)

- [ ] **Step 7: PNG를 삭제한다**

```bash
git rm apps/web/public/bambi/placeholder/horizontal-placeholder.png apps/web/public/bambi/placeholder/vertical-placeholder.png
```

삭제 전에 저장소 전체에서 참조가 남아 있지 않은지 확인한다:

Run: `rg "placeholder/(horizontal|vertical)-placeholder" apps packages`
Expected: 매치 없음

- [ ] **Step 8: 타입 체크와 전체 web 테스트**

Run: `pnpm -F web check-types && pnpm -F web test`
Expected: EXIT 0, 전체 PASS

- [ ] **Step 9: 커밋**

```bash
pnpm dlx ultracite fix
git add -A
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 광고 슬롯 자리표시를 컴포넌트화하고 문의 번호를 운영자 설정으로 전환
- 전화번호가 박힌 PNG 2종 삭제 — 번호 변경에 이미지 재제작이 필요했던 문제 해소
- siteSettings.getFooter에 adInquiryTel 합류(이미 공개 조회·푸터와 캐시 공유로 추가 요청 없음)
- 운영자 사이트 정보에 "광고 등록 문의 전화" 입력칸 추가, 미설정 시 고객센터 번호 폴백
- 첫 화면 최상단에 깔리던 eager 자리표시 이미지 2종이 사라져 LCP 부담 제거
- 세로형은 4:9 이미지가 92px 폭에 눌려 번호가 잘리던 문제도 함께 해소
```

---

## Task 6: 서버 입력·저장·조회

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Modify: `apps/web/src/lib/bambi/api-job-mapper.ts`
- Create: `packages/api/src/routers/bambi/job-ad-banner-text.test.ts`

**Interfaces:**
- Consumes: Task 2의 컬럼, Task 1의 값 목록
- Produces:
  - `jobPostInput`이 `adBannerHeadline`·`adBannerSubline`·`adBannerVerticalText`·`adBannerAnimation`·`adBannerTheme`를 받는다
  - `normalizeAdBannerText(input, exposureType)` — 배너형 노출이 아니면 전부 null로 만든다
  - `AdBannerItem`에 `text: AdBannerTextConfig | null`

- [ ] **Step 1: 실패하는 정규화 테스트를 쓴다**

`packages/api/src/routers/bambi/job-ad-banner-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { normalizeAdBannerText } from "./jobs";

const filled = {
	adBannerAnimation: "blur-in" as const,
	adBannerHeadline: "주말 알바 급구",
	adBannerSubline: "당일 지급",
	adBannerTheme: "dark" as const,
	adBannerVerticalText: "급구",
};

describe("normalizeAdBannerText", () => {
	it("keeps the banner text for premium exposure", () => {
		expect(normalizeAdBannerText(filled, "premium-banner")).toEqual(filled);
	});

	it("keeps the banner text for legacy side-banner exposure", () => {
		// 레거시 left/right-banner 공고도 프리미엄 풀에서 함께 노출되므로 문구를 유지한다.
		expect(normalizeAdBannerText(filled, "left-banner")).toEqual(filled);
		expect(normalizeAdBannerText(filled, "right-banner")).toEqual(filled);
	});

	it("drops the banner text for non-banner exposure", () => {
		// 리스팅 상품·무료 공고는 배너 슬롯을 쓰지 않는다. 문구를 저장해두면 나중에
		// 배너 상품으로 바뀔 때 검수받지 않은 문구가 조용히 노출된다.
		expect(normalizeAdBannerText(filled, "special")).toEqual({
			adBannerAnimation: null,
			adBannerHeadline: null,
			adBannerSubline: null,
			adBannerTheme: null,
			adBannerVerticalText: null,
		});
		expect(normalizeAdBannerText(filled, "standard")).toEqual({
			adBannerAnimation: null,
			adBannerHeadline: null,
			adBannerSubline: null,
			adBannerTheme: null,
			adBannerVerticalText: null,
		});
	});

	it("treats blank text as unset", () => {
		const blank = normalizeAdBannerText(
			{ ...filled, adBannerHeadline: "   ", adBannerVerticalText: "" },
			"premium-banner"
		);

		expect(blank.adBannerHeadline).toBeNull();
		expect(blank.adBannerVerticalText).toBeNull();
	});
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm -F @bambi-app/api test job-ad-banner-text`
Expected: FAIL — `normalizeAdBannerText is not exported`

- [ ] **Step 3: 입력 스키마에 필드를 추가한다**

`packages/api/src/routers/bambi/jobs.ts`의 `jobPostInputShape`에서 `media` 바로 위에 넣는다:

```ts
	// 프리미엄 배너에 얹는 문구·연출. 폼 상한(apps/web/src/lib/bambi/ad-banner-animations.ts)과
	// 같은 값을 서버에서도 강제한다 — 트러스트 바운더리다.
	adBannerHeadline: z.string().max(20).nullish(),
	adBannerSubline: z.string().max(30).nullish(),
	adBannerVerticalText: z.string().max(8).nullish(),
	adBannerAnimation: z.enum(adBannerAnimation.enumValues).nullish(),
	adBannerTheme: z.enum(adBannerTheme.enumValues).nullish(),
```

`adBannerAnimation`·`adBannerTheme` pgEnum을 `@bambi-app/db/schema/bambi`에서 import 한다. `industryCategorySchema`가 `jobIndustryCategory.enumValues`를 쓰는 방식과 같다.

- [ ] **Step 4: 정규화 함수를 구현한다**

`hasRiskFlags` 근처에 둔다:

```ts
export interface AdBannerTextInput {
	adBannerAnimation?: (typeof adBannerAnimation.enumValues)[number] | null;
	adBannerHeadline?: string | null;
	adBannerSubline?: string | null;
	adBannerTheme?: (typeof adBannerTheme.enumValues)[number] | null;
	adBannerVerticalText?: string | null;
}

// 정규화 결과는 항상 5개 키가 다 있고 값은 확정값이거나 null이다 — 저장 경로가 그대로
// insert/update 값에 펼쳐 넣는다.
export interface NormalizedAdBannerText {
	adBannerAnimation: (typeof adBannerAnimation.enumValues)[number] | null;
	adBannerHeadline: string | null;
	adBannerSubline: string | null;
	adBannerTheme: (typeof adBannerTheme.enumValues)[number] | null;
	adBannerVerticalText: string | null;
}

const EMPTY_AD_BANNER_TEXT: NormalizedAdBannerText = {
	adBannerAnimation: null,
	adBannerHeadline: null,
	adBannerSubline: null,
	adBannerTheme: null,
	adBannerVerticalText: null,
};

// 공백만 입력한 문구는 미설정으로 본다(오버레이가 빈 스크림만 덮지 않도록).
const trimmedOrNull = (value: string | null | undefined): string | null =>
	value?.trim() ? value.trim() : null;

// 배너 슬롯을 쓰지 않는 노출 타입이면 문구를 통째로 버린다. 저장해두면 나중에 상품이
// 배너형으로 바뀔 때 검수받지 않은 문구가 조용히 노출된다.
export const normalizeAdBannerText = (
	input: AdBannerTextInput,
	exposureType: string
): NormalizedAdBannerText => {
	if (!(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType)) {
		return EMPTY_AD_BANNER_TEXT;
	}

	return {
		adBannerAnimation: input.adBannerAnimation ?? null,
		adBannerHeadline: trimmedOrNull(input.adBannerHeadline),
		adBannerSubline: trimmedOrNull(input.adBannerSubline),
		adBannerTheme: input.adBannerTheme ?? null,
		adBannerVerticalText: trimmedOrNull(input.adBannerVerticalText),
	};
};
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `pnpm -F @bambi-app/api test job-ad-banner-text`
Expected: PASS (4 tests)

- [ ] **Step 6: 검수 플래그에 배너 문구를 합류시킨다**

`hasRiskFlags`가 보는 텍스트에 배너 문구를 더한다. 배너 문구도 구직자에게 노출되는 문구이므로 금칙어·위험어 검사를 똑같이 받아야 한다:

```ts
const hasRiskFlags = ({
	adBannerText,
	blockRiskTerms,
	description,
	interviewNotes,
	title,
}: {
	adBannerText: string;
	blockRiskTerms: string[];
	description: string;
	interviewNotes?: string;
	title: string;
}): boolean => {
	const text = `${title} ${description} ${interviewNotes ?? ""} ${adBannerText}`;

	return (
		blockRiskTerms.length > 0 || RISKY_TERMS.some((term) => text.includes(term))
	);
};
```

호출부에서 정규화된 배너 문구 3종을 공백으로 이어 넘긴다.

- [ ] **Step 7: 저장·조회 경로를 잇는다**

- 공고 생성·수정 핸들러에서 `normalizeAdBannerText(input, exposure.exposureType)` 결과를 `jobPost` insert/update 값에 펼쳐 넣는다
- `listAdBanners`(약 970행)의 select에 5개 컬럼을 추가한다:

```ts
				adBannerAnimation: jobPost.adBannerAnimation,
				adBannerHeadline: jobPost.adBannerHeadline,
				adBannerSubline: jobPost.adBannerSubline,
				adBannerTheme: jobPost.adBannerTheme,
				adBannerVerticalText: jobPost.adBannerVerticalText,
```

- 공고 단건 조회(수정 폼이 읽는 경로)에도 같은 5개 컬럼을 더한다

- [ ] **Step 8: 매퍼에 텍스트 설정을 싣는다**

`apps/web/src/lib/bambi/api-job-mapper.ts`:

```ts
export interface ApiAdBannerJob {
	adBannerAnimation?: AdBannerAnimation | null;
	adBannerHeadline?: string | null;
	adBannerSubline?: string | null;
	adBannerTheme?: AdBannerTheme | null;
	adBannerVerticalText?: string | null;
	adHorizontal?: ApiJobMedia | null;
	adVertical?: ApiJobMedia | null;
	coverImage?: ApiJobMedia | null;
	employerDisplayName?: string | null;
	id: string;
	teamDisplayName?: string | null;
	title: string;
}

export interface AdBannerItem {
	company: string;
	id: string;
	// 커버가 아니라 슬롯 배너가 우선이라 coverUrl이 아닌 imageUrl이다.
	imageUrl: string;
	// 이미지 위에 얹을 문구·연출. 문구가 없는 공고(기존 공고 포함)는 null이라 이미지만 나온다.
	text: AdBannerTextConfig | null;
	title: string;
}
```

`toAdBannerItem`에서 config를 만든다. 가로형은 headline, 세로형은 verticalText가 있을 때만 config를 싣는다:

```ts
	const hasText =
		usage === "ad_vertical"
			? Boolean(job.adBannerVerticalText)
			: Boolean(job.adBannerHeadline);

	return {
		company,
		id: job.id,
		imageUrl: media.url,
		text: hasText
			? {
					animation: job.adBannerAnimation ?? null,
					headline: job.adBannerHeadline ?? null,
					subline: job.adBannerSubline ?? null,
					theme: job.adBannerTheme ?? null,
					verticalText: job.adBannerVerticalText ?? null,
				}
			: null,
		title: job.title,
	};
```

- [ ] **Step 9: 매퍼 테스트를 보강한다**

`apps/web/src/lib/bambi/api-job-mapper.test.ts`에 추가한다:

```ts
	it("carries the banner text config for the horizontal slot", () => {
		const item = toAdBannerItem(
			{
				adBannerAnimation: "blur-in",
				adBannerHeadline: "주말 알바 급구",
				adBannerSubline: "당일 지급",
				adBannerTheme: "coral",
				adBannerVerticalText: "급구",
				id: "job-1",
				title: "홀서빙",
			},
			"ad_horizontal"
		);

		expect(item.text?.headline).toBe("주말 알바 급구");
		expect(item.text?.animation).toBe("blur-in");
	});

	it("carries no text when the vertical slot has no vertical copy", () => {
		// 세로 슬롯은 헤드라인을 잘라 쓰지 않는다 — 20자를 92px 폭에 넣으면 잘린 문구가 노출된다.
		const item = toAdBannerItem(
			{
				adBannerHeadline: "주말 알바 급구",
				adBannerVerticalText: null,
				id: "job-1",
				title: "홀서빙",
			},
			"ad_vertical"
		);

		expect(item.text).toBeNull();
	});

	it("carries no text for legacy jobs without banner copy", () => {
		// 기존 프리미엄 공고는 전부 null이라 예전처럼 이미지만 나와야 한다.
		const item = toAdBannerItem({ id: "job-1", title: "홀서빙" }, "ad_horizontal");

		expect(item.text).toBeNull();
	});
```

- [ ] **Step 10: 전체 테스트와 타입 체크**

Run: `pnpm -F @bambi-app/api test && pnpm -F web test && pnpm check-types`
Expected: 전부 PASS, EXIT 0

- [ ] **Step 11: 커밋**

```bash
pnpm dlx ultracite fix
git add -A
git commit -F <메시지 파일>
```

메시지:

```
feat(api): 광고 배너 문구·연출 입력과 조회 배선
- jobPostInput에 배너 문구 3종·애니메이션·테마 추가(길이·enum 서버 검증)
- 배너형 노출이 아니면 문구를 정규화 단계에서 폐기(미검수 문구의 조용한 노출 차단)
- 배너 문구를 hasRiskFlags 검사 대상에 합류 — 금칙어·위험어가 검수 플래그로 잡힘
- listAdBanners·단건 조회에 컬럼 추가, AdBannerItem에 텍스트 설정 탑재
```

---

## Task 7: 등록 폼 입력과 실시간 미리보기

**Files:**
- Create: `apps/web/src/components/bambi/ad-banner-text-fields.tsx`
- Modify: `apps/web/src/lib/bambi-job-form.ts`
- Modify: `apps/web/src/components/bambi/job-post-media-uploader.tsx`
- Modify: `apps/web/src/app/employer/new/page.tsx`
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `AdBannerTextOverlay`·`AdBannerTextConfig` (Task 4), 카탈로그 옵션 (Task 1)
- Produces: `<AdBannerTextFields onChange={(value: AdBannerTextConfig) => void} previewImageUrl={{ horizontal?: string; vertical?: string }} value={AdBannerTextConfig} />`

- [ ] **Step 1: 폼 상태 타입을 넓힌다**

`apps/web/src/lib/bambi-job-form.ts`의 `JobForm`에 추가한다:

```ts
	adBannerAnimation: AdBannerAnimation | null;
	adBannerHeadline: string;
	adBannerSubline: string;
	adBannerTheme: AdBannerTheme | null;
	adBannerVerticalText: string;
```

초기값(`paymentMethod: null` 근처의 기본 폼 상수)에 빈 문자열과 null을 넣는다. 제출 페이로드를 만드는 곳에서 빈 문자열은 보내지 않고 그대로 넘긴다 — 서버가 공백을 null로 정규화한다.

- [ ] **Step 2: 입력 컴포넌트를 만든다**

```tsx
"use client";

import { Input } from "@bambi-app/ui/components/input";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { FieldLabel } from "@/components/bambi/form-message";
import {
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_HEADLINE_MAX_LENGTH,
	AD_BANNER_SUBLINE_MAX_LENGTH,
	AD_BANNER_THEME_OPTIONS,
	AD_BANNER_VERTICAL_TEXT_MAX_LENGTH,
	type AdBannerAnimation,
	type AdBannerTheme,
} from "@/lib/bambi/ad-banner-animations";
import {
	type AdBannerTextConfig,
	AdBannerTextOverlay,
} from "./ad-banner-text-overlay";

const toggleItemClassName =
	"h-full min-h-14 w-full min-w-0 flex-col items-start justify-start gap-1 whitespace-normal px-3 py-2 text-left";

// 배너 문구·연출 입력. 프리미엄 상품을 골랐을 때만 렌더되며(호출부가 판단), 오른쪽에
// 실제 렌더 컴포넌트를 그대로 쓴 미리보기를 붙여 구인자가 저장 전에 결과를 본다.
export function AdBannerTextFields({
	onChange,
	previewImageUrl,
	value,
}: {
	onChange: (value: AdBannerTextConfig) => void;
	previewImageUrl: { horizontal?: string; vertical?: string };
	value: AdBannerTextConfig;
}) {
	const update = (patch: Partial<AdBannerTextConfig>) => {
		onChange({ ...value, ...patch });
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="adBannerHeadline">배너 메인 문구</FieldLabel>
				<Input
					id="adBannerHeadline"
					maxLength={AD_BANNER_HEADLINE_MAX_LENGTH}
					onChange={(event) => update({ headline: event.target.value })}
					placeholder="주말 알바 급구"
					value={value.headline ?? ""}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					가로형 배너에 크게 노출됩니다. 비워두면 이미지만 표시됩니다.
					{AD_BANNER_HEADLINE_MAX_LENGTH}자 이내.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="adBannerSubline">배너 보조 문구</FieldLabel>
				<Input
					id="adBannerSubline"
					maxLength={AD_BANNER_SUBLINE_MAX_LENGTH}
					onChange={(event) => update({ subline: event.target.value })}
					placeholder="당일 지급 · 초보 환영"
					value={value.subline ?? ""}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="adBannerVerticalText">
					세로형 배너 문구
				</FieldLabel>
				<Input
					id="adBannerVerticalText"
					maxLength={AD_BANNER_VERTICAL_TEXT_MAX_LENGTH}
					onChange={(event) => update({ verticalText: event.target.value })}
					placeholder="주말 급구"
					value={value.verticalText ?? ""}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					우측 세로 배너는 폭이 좁아 별도 문구를 씁니다.
					{AD_BANNER_VERTICAL_TEXT_MAX_LENGTH}자 이내.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="adBannerAnimation">문구 연출</FieldLabel>
				<ToggleGroup
					aria-label="문구 연출"
					className="grid w-full grid-cols-1 items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-3"
					onValueChange={(next) => {
						const picked = next.at(-1);
						update({ animation: (picked ?? null) as AdBannerAnimation | null });
					}}
					value={value.animation ? [value.animation] : []}
					variant="outline"
				>
					{AD_BANNER_ANIMATION_OPTIONS.map((option) => (
						<ToggleGroupItem
							className={toggleItemClassName}
							key={option.value}
							value={option.value}
						>
							<span className="w-full break-words font-medium text-sm">
								{option.label}
							</span>
							<span className="w-full break-words text-muted-foreground text-xs">
								{option.description}
							</span>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="adBannerTheme">배너 테마</FieldLabel>
				<ToggleGroup
					aria-label="배너 테마"
					className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
					onValueChange={(next) => {
						const picked = next.at(-1);
						update({ theme: (picked ?? null) as AdBannerTheme | null });
					}}
					value={value.theme ? [value.theme] : []}
					variant="outline"
				>
					{AD_BANNER_THEME_OPTIONS.map((option) => (
						<ToggleGroupItem key={option.value} value={option.value}>
							{option.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="adBannerPreview">미리보기</FieldLabel>
				<div className="flex flex-col items-start gap-4 sm:flex-row">
					<div className="relative aspect-[7/3] w-full max-w-80 overflow-hidden rounded-lg border border-border bg-muted">
						{previewImageUrl.horizontal ? (
							// biome-ignore lint/performance/noImgElement: blob: 미리보기라 next/image 최적화 대상이 아니다
							<img
								alt=""
								className="size-full object-cover"
								src={previewImageUrl.horizontal}
							/>
						) : null}
						<AdBannerTextOverlay config={value} variant="horizontal" />
					</div>
					<div className="relative aspect-[4/9] h-52 overflow-hidden rounded-lg border border-border bg-muted">
						{previewImageUrl.vertical ? (
							// biome-ignore lint/performance/noImgElement: blob: 미리보기라 next/image 최적화 대상이 아니다
							<img
								alt=""
								className="size-full object-cover"
								src={previewImageUrl.vertical}
							/>
						) : null}
						<AdBannerTextOverlay config={value} variant="vertical" />
					</div>
				</div>
			</div>
		</div>
	);
}
```

미리보기는 모바일에서 세로로 쌓이고(`flex-col sm:flex-row`), 세로형 미리보기는 실제 슬롯과 같은 `h-52`·4:9라 폭 제약이 그대로 재현된다.

- [ ] **Step 3: 업로더에 붙인다**

`job-post-media-uploader.tsx`의 광고 배너 슬롯 그룹 아래에 렌더한다. 배너 슬롯이 열리는 조건(`getAdBannerUsagesForPreviewTemplate(...).length > 0`)을 그대로 쓴다. props로 `adBannerText`·`onAdBannerTextChange`를 받아 상위 폼 상태와 잇고, `previewImageUrl`은 `media.adHorizontal?.previewUrl`·`media.adVertical?.previewUrl`을 넘긴다.

- [ ] **Step 4: 등록·수정 페이지를 배선한다**

`employer/new/page.tsx`와 `employer/jobs/[id]/edit/page.tsx`에서:
- 폼 상태에 5개 필드를 추가한다
- 업로더에 `adBannerText`·`onAdBannerTextChange`를 넘긴다
- 제출 페이로드에 5개 필드를 싣는다
- 수정 페이지는 서버에서 읽은 기존 값으로 초기화한다

- [ ] **Step 5: 타입 체크와 테스트**

Run: `pnpm -F web check-types && pnpm -F web test`
Expected: EXIT 0, 전체 PASS

- [ ] **Step 6: 커밋**

```bash
pnpm dlx ultracite fix
git add -A
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 공고 등록·수정에 배너 문구·연출 입력과 실시간 미리보기 추가
- 프리미엄 상품 선택 시에만 노출(배너 업로드 슬롯과 동일 조건)
- 문구 3종 입력 + 연출·테마 ToggleGroup, 실제 렌더 컴포넌트를 그대로 쓴 가로·세로 미리보기
- 업로드 이미지의 previewUrl을 배경으로 깔아 저장 전에 실제 결과를 확인
- 미리보기는 모바일에서 세로 스택, 세로형은 실제와 같은 h-52·4:9로 폭 제약 재현
```

---

## Task 8: 배너 렌더 배선

**Files:**
- Modify: `apps/web/src/components/bambi/ad-banner.tsx`

**Interfaces:**
- Consumes: `AdBannerTextOverlay` (Task 4), `AdBannerItem.text` (Task 6)

- [ ] **Step 1: 가로형 배너에 오버레이를 얹는다**

`HorizontalAdBanner`의 `<Link>` 안에서 `<Image>`를 `relative` 래퍼로 감싸고 오버레이를 더한다:

```tsx
			<div className="relative overflow-hidden rounded-lg">
				<Image
					alt={`${item.company} ${item.title} 광고 배너`}
					className={cn(
						"aspect-[7/3] w-full rounded-lg border border-border object-cover",
						className
					)}
					height={600}
					sizes="272px"
					src={item.imageUrl}
					unoptimized
					width={1400}
				/>
				{item.text ? (
					<AdBannerTextOverlay config={item.text} variant="horizontal" />
				) : null}
			</div>
```

- [ ] **Step 2: 세로형 배너에 오버레이를 얹는다**

`AdBanner`도 같은 방식으로 감싸고 `variant="vertical"`을 넘긴다.

- [ ] **Step 3: 타입 체크와 전체 테스트**

Run: `pnpm check-types && pnpm -F web test && pnpm -F @bambi-app/api test`
Expected: EXIT 0, 전체 PASS

- [ ] **Step 4: 커밋**

```bash
pnpm dlx ultracite fix
git add apps/web/src/components/bambi/ad-banner.tsx
git commit -F <메시지 파일>
```

메시지:

```
feat(web): 프리미엄 배너 슬롯에 텍스트 오버레이 렌더 연결
- 가로형·세로형 모두 이미지 위 absolute 오버레이로 문구 노출
- 문구가 없는 공고는 오버레이를 렌더하지 않아 기존 배너와 동일하게 동작
```

---

## Task 9: 문서 동기화와 최종 검증

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-premium-ad-text-animation.md` (체크박스)
- Modify: 광고 관련 매뉴얼 문서가 있으면 함께 갱신

- [ ] **Step 1: 전역 검증을 돌린다**

Run: `pnpm check-types && pnpm test`
Expected: 전역 check-types EXIT 0, 전체 테스트 PASS

실패가 있으면 그 자리에서 고친다. 통과 결과를 이 계획 문서 하단에 검증 노트로 남긴다.

- [ ] **Step 2: 잔여 참조를 확인한다**

Run: `rg "horizontal-placeholder|vertical-placeholder" apps packages docs`
Expected: docs의 과거 계획 문서 외에는 매치 없음

- [ ] **Step 3: 계획 체크박스를 갱신하고 커밋한다**

```bash
git add docs/
git commit -m "docs: 프리미엄 광고 텍스트 애니메이션 계획 진행 상황 반영"
```

- [ ] **Step 4: 사용자에게 시각 확인을 요청한다**

빌드·dev 서버 기동은 하지 않는다. 사용자에게 확인을 요청할 항목:
- 마켓플레이스 상단 프리미엄 2칸·좌측 3칸·우측 3칸의 문구 노출과 가독성
- 세로형 8자 세로쓰기가 92px 폭에서 읽히는지
- 자리표시 "광고 등록 문의" + 전화번호가 운영자 설정을 따르는지
- 모바일 폭에서 오버레이 문구가 넘치지 않는지
- 등록 폼 미리보기가 실제 배너와 같아 보이는지

- [ ] **Step 5: 로컬 병합**

검증이 끝나면 `feat/premium-ad-text-animation`으로 no-ff 병합한다. push·PR은 사용자가 명시적으로 지시할 때만 한다.

```bash
git switch feat/premium-ad-text-animation
git merge --no-ff worktree-premium-ad-text-animation -F <메시지 파일>
```

병합 커밋 제목은 `merge: 프리미엄 광고 텍스트 애니메이션 배너`로 하고 `(worktree-*)` 접미사를 붙이지 않는다.

---

## 검증 노트

(구현 중 각 태스크의 테스트·타입체크 결과를 여기에 기록한다)

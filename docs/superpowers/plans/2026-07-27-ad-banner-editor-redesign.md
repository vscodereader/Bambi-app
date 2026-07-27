# 배너 에디터 리디자인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 배너 이미지 업로드를 공고 폼에서 에디터로 옮기고, 에디터를 헤더·푸터 없는 전용 화면으로 리디자인하며, 문구 블록에 너비 조정을 추가한다.

**Architecture:** 에디터는 **입력 표면**이고 폼은 여전히 **상태 소유자**다. 에디터가 이미지를 받아 `JobFormMediaItem` 모양으로 postMessage `save`에 실어 돌려주면, 폼이 `media.adHorizontal/adVertical`에 넣는다. 그래야 기존 제출 파이프라인(`resolveJobPostMediaForSubmit`의 `storageKey` vs `file` 분기)과 등록 버튼 잠금(`useRequiredBannerGate`)이 **한 줄도 바뀌지 않고** 그대로 산다.

**Tech Stack:** Next.js 16 (RSC), React 19, Tailwind v4, gsap, drizzle + PostgreSQL, oRPC, zod, vitest

**선행 작업:** `docs/superpowers/plans/2026-07-27-premium-ad-banner-editor.md` (병합 완료, 커밋 `20497e4`)

## Global Constraints

- **신규 npm 의존성 금지.** 드래그·리사이즈는 Pointer Events로 직접 구현한다(`setPointerCapture`).
- UI는 shadcn 컴포넌트(`@bambi-app/ui/components`) + Tailwind만. **인라인 `style={{...}}`는 CSS 커스텀 프로퍼티 주입에만** 허용(구인자가 정한 좌표·색·크기·너비는 값이 무한한 런타임 데이터). 일반 스타일은 전부 `className`.
- **raw hex/oklch 금지**(구인자가 고른 색은 데이터라 예외). 조건부 클래스는 `cn()`, 간격은 `gap-*`(`space-x/y-*` 금지), 임의 px 금지, `rounded-none` 금지, 가로·세로 같으면 `size-*`.
- base-ui이므로 `asChild`가 아니라 `render` prop. `render`가 `<Button>`이면 `nativeButton` 생략.
- 훅·브라우저 API를 쓰면 최상단 `"use client"`.
- **모바일 반응형 필수.**
- **서버 zod가 유일한 트러스트 바운더리.** 모든 object에 `.strict()`.
- **테스트 명령:** web은 저장소 루트에서 `pnpm vitest run <경로>` (`pnpm -F web test`는 아무것도 안 돌린다). api는 `pnpm -F @bambi-app/api test`.
- **web 테스트에서 `@/` alias 금지**(web용 vitest config 없음). 상대 경로를 쓴다.
- **베이스라인:** web 5 failed / 283 passed, api 3 failed / 496 passed. **실패가 늘거나 통과가 줄지 않았는지만** 확인한다.
- **빌드·dev 서버 기동 금지.** 검증은 `check-types`와 vitest만. 시각 확인은 사용자가 한다.
- **`pnpm db:push` 절대 금지.** 이 작업은 **마이그레이션이 필요 없다**(레이아웃이 jsonb라 `width` 추가에 DDL이 없다).
- 커밋 전 `pnpm dlx ultracite fix`. 커밋 메시지는 한국어 `type:` 제목 + 촘촘한 `- ` 블릿 + `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **push·PR 생성 금지.**

### 디자인 기준 (Vercel Web Interface Guidelines에서 이 작업에 해당하는 것만)

영문 카피 규칙(Title Case·curly quotes·second person)은 한국어 UI에 맞지 않으므로 제외한다. 아래는 적용한다:

- 아이콘 전용 버튼에 `aria-label`. 장식 아이콘에 `aria-hidden="true"`.
- 모든 인터랙티브 요소에 보이는 포커스: `focus-visible:ring-*`. `outline-none`을 대체 없이 쓰지 않는다.
- 동작은 `<button>`, 이동은 `<a>`/`<Link>`. `<div onClick>` 금지.
- 파일 입력은 `<label htmlFor>`로 클릭 영역을 넓힌다.
- 비동기 갱신(토스트·검증 메시지)은 `aria-live="polite"`.
- 에러는 해당 필드 옆에 인라인으로, 제출 시 첫 에러로 포커스 이동.
- 애니메이션은 `transform`/`opacity`만, `transition: all` 금지, `prefers-reduced-motion` 존중.
- **드래그 중에는 텍스트 선택을 막는다**(`select-none`), `touch-action: manipulation`.
- 모달·시트에 `overscroll-behavior: contain`.
- 긴 문자열은 `truncate`/`break-words`, flex 자식에 `min-w-0`.
- 이미지에 명시적 크기 또는 `fill` + 컨테이너 비율(CLS 방지).
- 빈 상태를 반드시 처리한다.
- 로딩 문구는 `…`로 끝낸다(`...` 아님).

---

## File Structure

**신규**

| 파일 | 책임 |
| --- | --- |
| `apps/web/src/lib/bambi/job-media-item.ts` | `createMediaItemFromFile` 등 파일→`JobFormMediaItem` 변환(업로더에서 승격) |
| `apps/web/src/lib/bambi/job-media-item.test.ts` | 위 계약 검증 |
| `apps/web/src/app/ad-banner-editor/page.tsx` | 헤더·푸터 없는 에디터 라우트(서버 컴포넌트, 인증 게이트) |
| `apps/web/src/app/ad-banner-editor/ad-banner-editor-window.tsx` | 기존 팝업 클라이언트 본문 이전 |
| `apps/web/src/app/ad-banner-editor/layout.tsx` | 앱 셸을 벗은 최소 레이아웃 |
| `apps/web/src/components/bambi/ad-banner-editor/editor-image-slot.tsx` | 에디터 안의 배너 이미지 업로드 슬롯 |
| `apps/web/src/components/bambi/ad-banner-editor/use-block-resize.ts` | 좌우 핸들 너비 조정 훅 |

**수정**

| 파일 | 변경 |
| --- | --- |
| `apps/web/src/lib/bambi/ad-banner-layout.ts` | `AdBannerTextBlock.width` + 상수 + 기본값 |
| `apps/web/src/components/bambi/ad-banner-layout-renderer.tsx` | 너비 적용 + 줄바꿈 + 정렬 실동작 |
| `apps/web/src/components/bambi/ad-banner-editor/*` | 리디자인, 이미지 슬롯, 리사이즈 핸들 |
| `apps/web/src/components/bambi/ad-banner-editor/editor-launcher.tsx` | `save`에 미디어 포함, `init`에 `adProductId` 포함, 경로 변경 |
| `apps/web/src/components/bambi/job-post-media-uploader.tsx` | 배너 업로드 슬롯 제거, 에디터 진입만 남김 |
| `apps/web/src/lib/bambi-job-form.ts` | 죽은 필드 `uploadUrl` 제거, objectURL 누수 정리 |
| `packages/api/src/services/bambi-ad-banner-layout.ts` | `width` zod |
| `packages/api/src/routers/bambi/ad-banner-catalog-parity.test.ts` | `width` 범위 대조 |

**삭제**

`apps/web/src/app/employer/ad-banner-editor/page.tsx` (라우트 이전)

---

## 병렬 실행 계획 (파일 충돌 기준)

- **물결 1**: Task 1
- **물결 2**: Task 2(`packages/api/**`) + Task 3(`ad-banner-layout-renderer.tsx`) + Task 4(`app/ad-banner-editor/**`)
- **물결 3**: Task 5(`ad-banner-editor/{editor-canvas,editor-block-panel,ad-banner-editor,use-block-resize,editor-image-slot}`) + Task 6(`editor-launcher.tsx`, `job-post-media-uploader.tsx`, `bambi-job-form.ts`, 페이지 3개)
- **물결 4**: Task 7

---

## Task 1: 미디어 헬퍼 승격과 레이아웃 너비 추가

**Files:**
- Create: `apps/web/src/lib/bambi/job-media-item.ts`, `apps/web/src/lib/bambi/job-media-item.test.ts`
- Modify: `apps/web/src/lib/bambi/ad-banner-layout.ts`, `apps/web/src/lib/bambi/ad-banner-layout.test.ts`
- Modify: `apps/web/src/components/bambi/job-post-media-uploader.tsx` (로컬 함수 제거 후 import만)

**Interfaces:**
- Produces: `createMediaItemFromFile(file: File, altText?: string): Promise<JobFormMediaItem | null>`
- Produces: `AdBannerTextBlock.width: number`, `AD_BANNER_WIDTH_MIN`, `AD_BANNER_WIDTH_MAX`, `AD_BANNER_DEFAULT_WIDTH`

- [ ] **Step 1: `createMediaItemFromFile`을 공용 모듈로 승격한다**

`job-post-media-uploader.tsx`의 로컬 함수를 `apps/web/src/lib/bambi/job-media-item.ts`로 그대로 옮긴다. **세 단계를 하나도 빠뜨리지 마라** — 이 중 하나라도 빠지면 배너 검증이 통째로 무너진다:

1. `detectImageSignature`/`isSignatureMismatch`(`lib/bambi/image-signature.ts`) — 매직넘버가 `File.type`과 다르면 toast 후 `null` 반환
2. `previewUrl: URL.createObjectURL(file)`
3. `readImageDimensions(file)`(`lib/bambi/job-ad-banner-spec.ts`)로 `width`/`height` 부착 — **이게 빠지면 모든 배너가 "크기를 확인하지 못했습니다"로 반려된다**

toast 의존을 모듈 밖으로 빼라: 함수는 실패 사유를 돌려주고 호출부가 toast를 띄운다. 그래야 테스트가 가능하다.

```ts
export type MediaItemFailure = "signature-mismatch";

export const createMediaItemFromFile = async (
	file: File,
	altText = ""
): Promise<{ item: JobFormMediaItem } | { reason: MediaItemFailure }> => { /* ... */ };
```

`job-post-media-uploader.tsx`는 로컬 정의를 지우고 이 모듈을 import 한 뒤, `reason`이 오면 기존과 **같은 문구로** toast를 띄운다.

- [ ] **Step 2: objectURL 누수를 막는다**

현재 `createMediaItemFromFile`이 만든 blob URL은 어디서도 `revokeObjectURL` 되지 않는다. 슬롯의 이미지를 교체하면 이전 URL이 영원히 남는다. 교체·삭제 시점에 이전 `previewUrl`이 `blob:`으로 시작하면 revoke 하는 헬퍼를 같은 모듈에 두고 호출부에서 쓴다.

```ts
export const revokeMediaItemPreview = (item: JobFormMediaItem | null): void => {
	if (item?.previewUrl?.startsWith("blob:")) {
		URL.revokeObjectURL(item.previewUrl);
	}
};
```

`storageKey`가 있는 항목의 `previewUrl`은 공개 GCS URL이므로 revoke 하면 안 된다 — `blob:` 접두사 검사가 그 가드다.

- [ ] **Step 3: 죽은 필드를 지운다**

`JobFormMediaItem.uploadUrl?`은 선언만 있고 채우는 곳이 없다. 제거한다(`bambi-job-form.ts`). 타입체크가 잔여 참조를 잡는다.

- [ ] **Step 4: 테스트를 쓴다**

`apps/web/src/lib/bambi/job-media-item.test.ts` — **상대 경로 import**를 쓴다. 최소 3건:
- 시그니처가 어긋난 파일이면 `{ reason: "signature-mismatch" }`를 돌려준다
- 정상 파일이면 `previewUrl`이 `blob:`으로 시작하고 `width`/`height`가 붙는다
- `revokeMediaItemPreview`가 `blob:` 아닌 URL(공개 GCS URL)은 건드리지 않는다

`createImageBitmap`·`URL.createObjectURL`은 vitest 환경에 없으므로 `vi.stubGlobal`로 대체한다.

- [ ] **Step 5: 레이아웃 타입에 `width`를 넣는다**

`apps/web/src/lib/bambi/ad-banner-layout.ts`:

```ts
// 문구 블록의 너비(컨테이너 폭 대비 %). 이 너비 안에서 줄바꿈되고 정렬이 적용된다.
// 너비가 없으면 블록이 글자에 딱 맞게 줄어들어 정렬 설정이 화면에 아무 영향을 주지 않는다.
export const AD_BANNER_WIDTH_MIN = 10;
export const AD_BANNER_WIDTH_MAX = 100;
export const AD_BANNER_DEFAULT_WIDTH = 60;
```

`AdBannerTextBlock`에 `width: number;`를 추가하고(알파벳 순서상 `weight` 앞), `createAdBannerTextBlock`의 기본값에 `width: AD_BANNER_DEFAULT_WIDTH`를 넣는다.

**기존 저장분에는 `width`가 없다.** 서버 zod는 `.strict()`이고 `width`를 필수로 받으므로, 기존 레이아웃은 읽을 때 `parseStoredAdBannerLayout`에서 반려돼 배너가 사라진다. → **`width`를 `.default(AD_BANNER_DEFAULT_WIDTH)`로 두어 없으면 채운다**(Task 2). 웹 타입은 필수로 두고, 서버가 채워 내려보낸다.

- [ ] **Step 6: 클램프 헬퍼를 추가한다**

```ts
// 너비는 0이 될 수 없다 — 0이면 블록이 사라져 다시 잡을 수 없다.
export const clampBlockWidth = (value: number): number =>
	Number.isNaN(value)
		? AD_BANNER_DEFAULT_WIDTH
		: Math.min(AD_BANNER_WIDTH_MAX, Math.max(AD_BANNER_WIDTH_MIN, value));
```

`ad-banner-layout.test.ts`에 하한·상한·NaN 3건을 추가한다.

- [ ] **Step 7: 검증**

Run: `pnpm vitest run apps/web/src/lib/bambi/ad-banner-layout.test.ts apps/web/src/lib/bambi/job-media-item.test.ts`
Run: `pnpm -F web check-types` — **`width` 필수화로 여러 파일이 깨진다. 그건 후속 태스크가 고친다.** 네가 만든 파일에서 에러가 0인지만 확인하고 깨진 파일 목록을 리포트에 남겨라.

---

## Task 2: 서버 zod와 parity

**Files:**
- Modify: `packages/api/src/services/bambi-ad-banner-layout.ts`, `.test.ts`
- Modify: `packages/api/src/routers/bambi/ad-banner-catalog-parity.test.ts`

**Interfaces:**
- Consumes: Task 1의 `AD_BANNER_WIDTH_*`

- [ ] **Step 1: `width`를 스키마에 넣는다**

```ts
const WIDTH_MIN = 10;
const WIDTH_MAX = 100;
const WIDTH_DEFAULT = 60;
```

`textBlockSchema`에 추가한다. **반드시 `.default()`를 쓴다:**

```ts
	// 기존 저장분에는 width가 없다. strict 스키마에서 필수로 두면 이미 저장된 레이아웃이
	// parseStoredAdBannerLayout에서 전부 반려돼 배너가 통째로 사라진다.
	width: z.number().min(WIDTH_MIN).max(WIDTH_MAX).default(WIDTH_DEFAULT),
```

- [ ] **Step 2: 마이그레이션 회귀 테스트를 쓴다**

`bambi-ad-banner-layout.test.ts`에 **가장 중요한 테스트**를 넣는다:

```ts
it("width가 없는 기존 레이아웃을 기본값으로 채워 통과시킨다", () => {
	// 이 스키마 변경 이전에 저장된 모든 레이아웃이 이 모양이다. 반려하면 운영 중인
	// 프리미엄 배너가 전부 사라진다.
	const stored = createLayoutWithoutWidth();
	const parsed = parseStoredAdBannerLayout(stored);

	expect(parsed).not.toBeNull();
	expect(parsed?.horizontal.texts[0]?.width).toBe(60);
});
```

경계값(10 통과 / 9 반려 / 100 통과 / 101 반려)도 함께 넣는다.

- [ ] **Step 3: parity에 너비 범위를 추가한다**

`ad-banner-catalog-parity.test.ts`의 기존 헬퍼(`numberAfter`) 패턴을 그대로 써서 `AD_BANNER_WIDTH_MIN`·`AD_BANNER_WIDTH_MAX`·`AD_BANNER_DEFAULT_WIDTH`를 웹 소스에서 뽑아 서버와 대조한다. **마커를 못 찾으면 throw** 하는 기존 동작을 유지한다.

- [ ] **Step 4: 검증**

Run: `pnpm -F @bambi-app/api test` — 베이스라인 3 failed / 496 passed. 실패가 늘지 않았는지만.
Run: `pnpm -F @bambi-app/api check-types` — EXIT 0.

---

## Task 3: 렌더러 너비·줄바꿈·정렬

**Files:**
- Modify: `apps/web/src/components/bambi/ad-banner-layout-renderer.tsx`

**Interfaces:**
- Consumes: Task 1의 `AdBannerTextBlock.width`

- [ ] **Step 1: 블록에 너비를 적용한다**

현재 `TextBlockView`는 `max-w-full`만 있어 블록이 글자에 딱 맞게 줄어든다(shrink-to-fit). 그래서 **정렬 설정이 화면에 아무 영향을 주지 않는다.** `--block-width` CSS 변수를 주입하고 `w-[var(--block-width)]`로 폭을 고정한다.

```tsx
style={
	{
		"--block-color": block.color,
		"--block-size": `${block.fontSize}cqw`,
		"--block-width": `${block.width}%`,
		"--block-x": `${block.x}%`,
		"--block-y": `${block.y}%`,
	} as React.CSSProperties
}
```

className에 `w-[var(--block-width)]`를 넣고 `max-w-full`은 유지한다(x가 가장자리일 때 슬롯을 넘지 않도록).

- [ ] **Step 2: 줄바꿈이 실제로 되게 한다**

`break-words`를 넣어 긴 단어가 너비를 넘지 않게 한다. `whitespace-nowrap` 계열이 어디에도 없어야 한다.

**연출 컴포넌트가 줄바꿈을 막지 않는지 확인해라.** 선행 작업에서 `typing-text`의 `inline-flex` nowrap과 `blur-text`의 `justify-center`를 고쳤다 — 그 수정이 살아 있는지 실제로 열어 확인하고, 너비가 생긴 뒤에도 정렬이 먹는지 따져라. 문제가 있으면 리포트에 적어라(그 파일은 네 범위 밖이다).

- [ ] **Step 3: 검증**

Run: `pnpm -F web check-types` — 이 시점엔 다른 태스크 때문에 다른 파일이 깨져 있을 수 있다. **네 파일 에러 0**만 확인해라.

---

## Task 4: 헤더·푸터 없는 에디터 라우트

**Files:**
- Create: `apps/web/src/app/ad-banner-editor/layout.tsx`, `page.tsx`, `ad-banner-editor-window.tsx`
- Delete: `apps/web/src/app/employer/ad-banner-editor/page.tsx`

- [ ] **Step 1: 왜 라우트를 옮기는지 이해한다**

현재 팝업 라우트가 `app/employer/` 아래라 `app/employer/layout.tsx`의 `ResponsiveAppShell`·`EmployerNav`·`AccountStatusBanner`가 전부 붙는다. **route group으로는 부모 레이아웃을 벗을 수 없다** — 라우트를 `app/` 최상위로 옮기는 것이 유일한 방법이다.

- [ ] **Step 2: 인증 게이트를 직접 건다**

`app/employer/layout.tsx`가 하던 `resolveEmployerAccess()`가 사라지므로 **새 라우트가 직접 호출해야 한다.** 이걸 빠뜨리면 누구나 이 화면을 열 수 있다(화면 자체는 서버 데이터를 담지 않지만 게이트는 유지해야 한다).

`page.tsx`는 **서버 컴포넌트**로 두고 게이트만 호출한 뒤 클라이언트 본문을 렌더한다:

```tsx
import { resolveEmployerAccess } from "@/lib/bambi/require-role";
import { AdBannerEditorWindow } from "./ad-banner-editor-window";

// 공고 등록 폼이 window.open으로 여는 배너 에디터 창. 앱 셸(헤더·내비·푸터)을 벗기려고
// app/employer/ 밖에 둔다 — route group으로는 부모 레이아웃을 벗을 수 없다.
// 대신 employer 레이아웃이 하던 역할 게이트를 여기서 직접 건다.
export default async function AdBannerEditorPage() {
	await resolveEmployerAccess();

	return <AdBannerEditorWindow />;
}
```

- [ ] **Step 3: 최소 레이아웃을 만든다**

`app/ad-banner-editor/layout.tsx`는 헤더·푸터·내비 없이 본문만 감싼다. 배경·폰트는 루트 레이아웃에서 오므로 여기서는 편집 화면에 맞는 폭·패딩만 준다. `min-h-dvh`로 창 높이를 채우고, 모바일 노치 대응으로 안전 영역 패딩을 준다.

- [ ] **Step 4: 클라이언트 본문을 옮긴다**

기존 `app/employer/ad-banner-editor/page.tsx`의 내용을 `ad-banner-editor-window.tsx`로 옮긴다. `"use client"` 유지. **`PageShell`을 쓰지 마라** — 그게 제목·설명 등 앱 화면용 크롬을 붙인다. 편집 창에 맞는 최소 헤더(제목 + 닫기)만 둔다.

기존 로직은 그대로 보존한다: opener 없을 때의 안내, init 대기 상태, `event.origin`·`event.source` 검사, 리스너를 먼저 걸고 `ready`를 보내는 순서.

- [ ] **Step 5: 경로 상수를 고친다**

`editor-launcher.tsx`의 `AD_BANNER_EDITOR_PATH`가 `/employer/ad-banner-editor`다. 이건 Task 6이 고친다 — **너는 건드리지 마라.** 대신 새 경로 `/ad-banner-editor`를 리포트에 명시해라.

- [ ] **Step 6: 검증**

Run: `pnpm -F web check-types` — 네 파일 에러 0. 구 라우트 참조가 남아 깨지면 Task 6 몫이니 리포트에 적어라.
Run: `rg "employer/ad-banner-editor" apps/web/src` — 남은 참조를 목록으로 리포트에 남겨라.

---

## Task 5: 에디터 리디자인·이미지 슬롯·너비 핸들

**Files:**
- Create: `apps/web/src/components/bambi/ad-banner-editor/editor-image-slot.tsx`, `use-block-resize.ts`
- Modify: `apps/web/src/components/bambi/ad-banner-editor/{ad-banner-editor,editor-canvas,editor-block-panel}.tsx`

**Interfaces:**
- Consumes: Task 1의 `createMediaItemFromFile`·`revokeMediaItemPreview`·`clampBlockWidth`·`AD_BANNER_WIDTH_*`
- Produces: `<AdBannerEditor initialLayout initialMedia={{adHorizontal, adVertical}} requiredUsages={JobPostMediaUsage[]} onSave={(result: { layout, media }) => void} onCancel />`

- [ ] **Step 1: 이미지 슬롯을 만든다**

`editor-image-slot.tsx` — 에디터 안에서 배너 이미지를 받는다. `AdBannerSlot`(업로더)이 하던 것을 그대로 가져오되 에디터 맥락에 맞춘다:

- `<label htmlFor>`로 감싼 파일 입력(클릭 영역을 넓히고 접근성 규칙을 만족한다). `accept`는 `getFileAcceptForUsage(usage)`.
- 선택 즉시 `createMediaItemFromFile` → 실패(`signature-mismatch`)면 기존과 **같은 문구로** toast.
- **비율 즉시 경고를 반드시 옮겨라.** `isAllowedJobAdBannerAspect({height, usage, width})`가 false면 destructive `Alert`를 띄운다. 옮기지 않으면 구인자는 공고를 제출할 때까지 반려 사유를 모른다. 허용 오차는 `JOB_AD_BANNER_ASPECT_TOLERANCE = 0.15`이고 **경고가 아니라 실제 반려 사유**다.
- 교체·삭제 시 이전 항목에 `revokeMediaItemPreview`를 호출한다.
- 슬롯별 권장 크기를 안내한다(가로형 1400×600, 세로형 400×900 이상).
- 이미 올라간 이미지(`storageKey` 있음)는 공개 URL로 미리보기를 보여주고, 새로 고르면 그게 우선한다.

- [ ] **Step 2: 너비 조정 훅을 만든다**

`use-block-resize.ts` — `use-block-drag.ts`와 같은 Pointer Events 패턴을 쓴다. 좌우 핸들 각각에 대해:

```ts
// 왼쪽 핸들은 오른쪽 모서리를, 오른쪽 핸들은 왼쪽 모서리를 고정한 채 너비를 바꾼다.
// 블록 좌표가 '중심' 기준이라 너비만 바꾸면 양쪽이 같이 벌어져 잡고 있던 모서리가 움직인다.
// 그래서 너비 변화량의 절반만큼 x를 함께 옮겨야 잡은 쪽이 제자리에 남는다.
```

이게 이 태스크에서 가장 틀리기 쉬운 부분이다. `edge === "left"`면 `x`를 오른쪽으로, `"right"`면 왼쪽으로 `delta / 2`만큼 민다. 모든 결과는 `clampBlockWidth`·`clampPercent`를 통과시킨다.

- [ ] **Step 3: 캔버스에 핸들을 붙인다**

선택된 블록에만 좌우 핸들을 렌더한다. 각 핸들은:
- `<button type="button">`(동작이므로), `aria-label`에 어느 쪽인지와 현재 너비를 담는다
- 터치 대상이 충분히 크도록 시각 크기보다 넓은 히트 영역을 준다
- `touch-none`으로 스크롤과 충돌하지 않게 한다
- 드래그 중에는 `select-none`으로 텍스트 선택을 막는다
- **키보드 대안:** 핸들에 포커스한 채 방향키로 너비를 1%씩, Shift로 5%씩 바꾼다

블록 자체도 `w-[var(--block-width)]` + `break-words`로 바꿔 **캔버스와 렌더러가 같은 방식으로 그리게** 한다. 이게 어긋나면 "에디터에서 맞춰 놨는데 실제 배너는 다름"이 된다.

- [ ] **Step 4: 속성 패널에 너비를 넣는다**

핸들과 별개로 숫자 입력도 둔다(핸들만으로는 정확한 값을 못 맞춘다). 기존 글자 크기 입력과 같은 형태(`%` 접미사 + `aria-describedby` 힌트).

- [ ] **Step 5: 에디터를 리디자인한다**

지금은 세로로 길게 쌓인 폼에 가깝다. 편집 화면답게 바꾼다:

- **캔버스를 주인공으로.** 데스크톱은 캔버스가 넓게 차지하고 속성은 옆 패널에, 모바일은 캔버스 아래로 접힌다.
- **슬롯 전환·문구 추가·저장/취소를 명확히 구분한다.** 저장·취소는 항상 보이는 자리(하단 고정 바 또는 상단 우측)에 둔다 — 지금은 스크롤 끝에 있어 긴 화면에서 사라진다.
- **선택된 블록이 무엇인지 한눈에.** 지금은 `ring` 하나뿐이다.
- 이미지 슬롯·배경·오버레이·문구 목록을 논리적으로 묶는다. 문구가 여러 개면 **목록에서 고를 수 있게** 한다(캔버스에서 겹친 블록을 클릭으로만 고르는 건 어렵다).
- 빈 상태(이미지 없음 / 문구 없음)를 각각 처리한다.
- shadcn 컴포넌트를 최대한 재사용한다. 필요한 컴포넌트가 없으면 `pnpm dlx shadcn@latest search`로 찾아 `add` 한다 — **`Slider`가 글자 크기·너비·오버레이 강도에 적합하니 우선 검토해라.**
- 위 "디자인 기준" 항목을 전부 지킨다.

- [ ] **Step 6: 저장 계약을 넓힌다**

`onSave`가 레이아웃만이 아니라 미디어도 돌려준다:

```ts
onSave: (result: {
	layout: AdBannerLayout;
	media: { adHorizontal: JobFormMediaItem | null; adVertical: JobFormMediaItem | null };
}) => void;
```

저장 전 가드에 **필수 이미지 검사**를 추가한다: `requiredUsages`에 있는 슬롯의 이미지가 없으면 저장을 막고 그 슬롯으로 이동시킨다. 기존 빈 문구 가드(`findBlankBlock`)는 유지한다.

- [ ] **Step 7: 검증**

Run: `pnpm -F web check-types` — 네 파일 에러 0.
Run: `pnpm dlx ultracite fix <네가 만진 파일들>`

---

## Task 6: postMessage 계약과 폼 배선

**Files:**
- Modify: `apps/web/src/components/bambi/ad-banner-editor/editor-launcher.tsx`
- Modify: `apps/web/src/components/bambi/job-post-media-uploader.tsx`
- Modify: `apps/web/src/lib/bambi-job-form.ts`
- Modify: `apps/web/src/app/employer/new/page.tsx`, `.../employer/jobs/[id]/edit/page.tsx`, `.../moderator/jobs/[id]/edit/page.tsx`

- [ ] **Step 1: 메시지 계약을 넓힌다**

경로 상수를 `/ad-banner-editor`로 바꾼다(Task 4가 라우트를 옮겼다).

`init`에 **`adProductId`**를 싣는다 — 에디터가 어떤 슬롯을 보여줄지는 `getAdBannerUsagesForPreviewTemplate`이 상품의 `previewTemplate`으로 정하는데, 에디터 창은 opener에게서만 데이터를 받는다. 상품 카탈로그 조회를 에디터에서 또 하지 말고 **이미 계산된 `requiredUsages`를 넘겨라**(부모가 이미 갖고 있다).

`save`에 미디어를 싣는다:

```ts
| { layout: AdBannerLayout; media: AdBannerEditorMedia; type: typeof AD_BANNER_EDITOR_MESSAGE.save }
```

**⚠️ `previewUrl`은 창을 넘기지 마라.** blob URL은 만든 문서에 묶여 있어 다른 창에서 열리지 않는다. `File`은 structured clone 되므로 그대로 넘기고, **받는 쪽에서 `previewUrl`을 다시 만든다.** 이미 올라간 이미지(`storageKey` 있음)는 공개 URL이라 그대로 넘겨도 된다.

- [ ] **Step 2: 런처가 미디어를 폼에 돌려준다**

`onChange`를 레이아웃 전용에서 `{layout, media}`로 넓힌다. 다이얼로그 경로와 새창 경로 **둘 다** 같은 값을 돌려줘야 한다.

- [ ] **Step 3: 업로더에서 배너 업로드 슬롯을 없앤다**

`job-post-media-uploader.tsx`에서 `AdBannerSlot` 두 개를 지운다. 대신 **에디터에서 정한 배너의 현재 상태를 보여준다** — 이미지가 있는지, 문구가 몇 개인지, 썸네일. 그래야 폼에서 에디터를 열지 않고도 상태를 알 수 있다(지금은 설명과 버튼뿐이라 아무것도 안 보인다).

`allowUpload={false}`(운영자) 처리는 유지한다.

- [ ] **Step 4: 폼이 미디어를 받는다**

세 화면 모두 런처의 `onChange`에서 `media.adHorizontal`·`adVertical`을 폼 `media` 상태에 반영한다. **이게 이 태스크의 핵심이다** — 여기가 이어지면 `useRequiredBannerGate`의 등록 버튼 잠금, `validateJobForm`의 필수 검증, `resolveJobPostMediaForSubmit`의 업로드가 **한 줄도 바뀌지 않고 그대로 동작한다.**

`requiredUsages`(부모가 이미 계산해 갖고 있다)를 런처에 넘긴다.

- [ ] **Step 5: 프리필 가드 테스트를 갱신한다**

`ad-banner-layout-form-wiring.test.ts`가 세 화면의 `toJobAdBannerLayoutForm(job)` 프리필을 소스 스캔으로 고정하고 있다. **미디어 배선도 같은 방식으로 고정해라** — 세 화면이 런처의 미디어를 폼 상태에 반영하는지. 경로가 틀리면 `readFileSync`가 throw 하는 기존 동작을 유지한다.

- [ ] **Step 6: 검증**

Run: `pnpm -F web check-types` — **EXIT 0이어야 한다**(이 태스크가 마지막 배선이다).
Run: `pnpm vitest run apps/web` — 베이스라인 5 failed / 283 passed.

---

## Task 7: 최종 검증과 가이드라인 리뷰

- [ ] **Step 1: 전역 검증**

Run: `pnpm check-types` — EXIT 0
Run: `pnpm vitest run apps/web` — 베이스라인 5 failed 유지, 통과 감소 없음
Run: `pnpm -F @bambi-app/api test` — 베이스라인 3 failed 유지

- [ ] **Step 2: 잔여 참조**

Run: `rg "employer/ad-banner-editor|AdBannerSlot|uploadUrl" apps/web/src`
구 라우트·제거한 컴포넌트·죽은 필드가 남아 있지 않은지. `docs/` 밖에서 매치가 나오면 보고한다.

- [ ] **Step 3: 매뉴얼 동기화**

`docs/manual/employer-manual.md`의 "배너 문구 편집" 절을 갱신한다: 이미지 업로드가 에디터로 옮겨진 것, 문구 너비 조정, 공고 등록 화면에서 배너 이미지 칸이 사라진 것. 공고 등록 절의 배너 이미지 안내도 함께 고친다.

- [ ] **Step 4: 계획 검증 노트**

이 문서 하단에 결과와 계획 대비 달라진 점을 기록한다.

---

## 검증 노트

(구현 중 기록한다)

# native 공고 소재·폼 마감 구현 플랜

> **For agentic workers:** 트랙 A·B·C를 **병렬 서브에이전트**로 실행한다. 각 트랙은 파일 소유가 배타적이며 다른 트랙의 파일을 열지 않는다. 트랙 안의 태스크는 순서대로 한다.

**Goal:** 앱 공고 등록·수정에서 상세 디자인을 신청하고, 배너 슬롯을 단색 배경으로 두고, 긴 상세 이미지를 조각내 올리고, 폼의 거친 부분 다섯 곳을 다듬는다.

**Architecture:** 서버·DB 변경이 없다. 상세 디자인과 배너 레이아웃은 이미 있는 `jobs.create/update` 입력 필드를 앱이 처음으로 채우는 일이고, 슬라이싱은 웹의 분할 계획 함수를 `packages/api`로 올려 공유하고 조각 생성만 `expo-image-manipulator`로 구현하는 일이다.

**Tech Stack:** Expo(expo-router) · heroui-native · Uniwind · oRPC + TanStack Query · expo-image-manipulator · vitest

**Spec:** `docs/superpowers/specs/2026-09-04-native-job-media-polish-design.md`

## Global Constraints

- **빌드·실행 금지**(`.claude/rules/no-build-or-run.md`). 검증은 타입체크·린트·테스트뿐.
- UI 작업 전 `.agents/skills/heroui-native/SKILL.md`를 **직접 Read로** 읽어라(Skill 툴이 아니다). Uniwind 문법은 `https://docs.uniwind.dev/llms-full.txt`. 이 문서들은 **native 전용**이다.
- 임의 px 금지, Tailwind 스케일 토큰만. DB enum 원값 렌더 금지.
- **새 의존성 추가 금지.** 이번에 허가된 `expo-image-manipulator`는 이미 설치돼 있다(`~56.0.26`).
- **`@react-navigation/native`를 직접 import하지 마라** — native의 직접 의존성이 아니라 pnpm에서 해석되지 않는다. `expo-router`가 재수출하는 것을 써라.
- 서브에이전트는 **커밋하지 않는다. `git stash`도 금지.** 커밋은 컨트롤러가 순차로 한다.
- 검증(각 트랙 끝에서 자기 파일에만): `pnpm --filter native check-types` · `npx ultracite check <경로들>`(실패 시 `npx ultracite fix`) · `pnpm --filter native test`
- native 테스트는 `src/lib/**` 콜로케이션(`*.test.ts`). 화면 렌더 테스트는 만들지 않는다.

---

# 트랙 A — 상세 디자인 신청 + 배너 단색 배경

**소유 파일:** `apps/native/src/lib/employer/ad-exposure.ts`(+`.test.ts`), `apps/native/src/lib/employer/ad-banner-layout.ts`(신규)+테스트, `apps/native/src/components/job-exposure-section.tsx`, `apps/native/src/components/job-banner-picker-section.tsx`, `apps/native/src/lib/employer/job-draft-store.ts`, `apps/native/src/lib/employer/job-update.ts`(+테스트), `apps/native/app/(employer)/new-exposure.tsx`, `apps/native/app/(employer)/jobs/[id]/edit.tsx`

### Task A1: 배너 레이아웃 순수 로직

**Files:**
- Create: `apps/native/src/lib/employer/ad-banner-layout.ts`
- Test: `apps/native/src/lib/employer/ad-banner-layout.test.ts`

**Interfaces:**
- Produces: `NativeBannerBackground`, `createEmptyBannerLayout()`, `withSlotBackground(layout, usage, background)`, `getSlotBackground(layout, usage)`, `isBannerImageRequired(layout, usage)` — A2·A3이 쓴다.

레이아웃 타입은 서버 스키마에서 가져온다: `import type { AdBannerLayoutInput } from "@bambi-app/api/services/bambi-ad-banner-layout";`(실제 export 이름은 그 파일을 읽고 맞춰라).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";

import {
	createEmptyBannerLayout,
	getSlotBackground,
	isBannerImageRequired,
	withSlotBackground,
} from "./ad-banner-layout";

describe("createEmptyBannerLayout", () => {
	// 서버 스키마가 strict라 슬롯마다 background·scrim·texts가 모두 있어야 한다.
	it("두 슬롯을 웹 기본값으로 만든다", () => {
		const layout = createEmptyBannerLayout();

		expect(layout.version).toBe(1);
		expect(layout.horizontal.background).toEqual({ type: "image" });
		expect(layout.horizontal.scrim).toEqual({ enabled: true, opacity: 65 });
		expect(layout.horizontal.texts).toEqual([]);
		expect(layout.vertical.texts).toEqual([]);
	});
});

describe("withSlotBackground", () => {
	it("고른 슬롯의 배경만 바꾼다", () => {
		const next = withSlotBackground(createEmptyBannerLayout(), "ad_horizontal", {
			color: "#ff0000",
			type: "color",
		});

		expect(next.horizontal.background).toEqual({
			color: "#ff0000",
			type: "color",
		});
		expect(next.vertical.background).toEqual({ type: "image" });
	});

	// 앱에는 문구 편집기가 없다. 통째로 새 레이아웃을 보내면 웹에서 만든 문구가 사라진다.
	it("웹에서 만든 문구 블록을 보존한다", () => {
		const base = createEmptyBannerLayout();
		const withText = {
			...base,
			horizontal: {
				...base.horizontal,
				texts: [
					{
						align: "center" as const,
						animation: null,
						color: "#ffffff",
						content: "오픈 이벤트",
						fontSize: 8,
						id: "t1",
						weight: "bold" as const,
						width: 60,
						x: 50,
						y: 50,
					},
				],
			},
		};

		const next = withSlotBackground(withText, "ad_horizontal", {
			color: "#1f2937",
			type: "color",
		});

		expect(next.horizontal.texts).toHaveLength(1);
		expect(next.horizontal.texts[0].content).toBe("오픈 이벤트");
	});

	it("레이아웃이 없던 공고는 기본값에서 시작한다", () => {
		const next = withSlotBackground(null, "ad_vertical", {
			color: "#1f2937",
			type: "color",
		});

		expect(next.vertical.background).toEqual({
			color: "#1f2937",
			type: "color",
		});
		expect(next.horizontal.background).toEqual({ type: "image" });
	});
});

describe("isBannerImageRequired", () => {
	it("이미지 배경이면 업로드가 필요하다", () => {
		expect(isBannerImageRequired(null, "ad_horizontal")).toBe(true);
	});

	// 단색으로 덮으면 업로드한 이미지가 보이지 않으므로 필수가 아니다(web과 같은 규칙).
	it("단색 배경이면 업로드가 필요 없다", () => {
		const layout = withSlotBackground(null, "ad_horizontal", {
			color: "#1f2937",
			type: "color",
		});

		expect(isBannerImageRequired(layout, "ad_horizontal")).toBe(false);
		expect(isBannerImageRequired(layout, "ad_vertical")).toBe(true);
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter native test -- ad-banner-layout`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

기본값 상수는 웹 `apps/web/src/lib/bambi/ad-banner-layout.ts`의 값과 같아야 한다(읽고 맞춰라): 기본 배경색 `#1f2937`, 스크림 `{ enabled: true, opacity: 65 }`. 슬롯 키는 `ad_horizontal` → `horizontal`, `ad_vertical` → `vertical`이다(`JobAdBannerUsage`와 레이아웃 키가 다르다 — 매핑을 이 파일 안에 둔다).

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter native test -- ad-banner-layout`
Expected: PASS

### Task A2: 필수 배너 게이트가 레이아웃을 보게 한다

**Files:**
- Modify: `apps/native/src/lib/employer/ad-exposure.ts` (`getMissingBannerUsages`, 58-66줄 주변)
- Test: `apps/native/src/lib/employer/ad-exposure.test.ts`

- [ ] **Step 1: 테스트를 더한다**

```ts
it("단색 배경 슬롯은 이미지가 없어도 통과한다", () => {
	const layout = withSlotBackground(null, "ad_horizontal", {
		color: "#1f2937",
		type: "color",
	});

	expect(
		getMissingBannerUsages({ adVertical: {} }, ["ad_horizontal", "ad_vertical"], layout)
	).toEqual([]);
});
```

- [ ] **Step 2: 시그니처를 넓힌다**

세 번째 인자 `layout`을 **선택적**으로 받고, `isBannerImageRequired(layout, usage)`가 false면 필수에서 뺀다. 기존 호출부(인자 2개)는 그대로 동작해야 한다. 파일 상단 주석의 "native는 레이아웃 편집기가 없어 항상 이미지가 필요하다"를 새 사실로 고쳐라.

- [ ] **Step 3: 검증** — `pnpm --filter native test -- ad-exposure`

### Task A3: 배너 섹션에 배경 선택 UI

**Files:**
- Modify: `apps/native/src/components/job-banner-picker-section.tsx`

- [ ] **Step 1: UI를 더한다**

슬롯(가로형·세로형)마다:
- `이미지 / 단색` 2지 선택. 단색이면 색 선택을 편다
- 색 선택은 **프리셋 팔레트 8색 + hex 직접 입력**(6자리 `#rrggbb`만 허용 — 서버 정규식과 같다. 8자리를 받으면 웹의 대비 경고가 조용히 꺼진다). 새 라이브러리 금지
- 단색이면 그 슬롯의 이미지 업로드 UI는 "필수 아님"으로 낮추되 업로드 자체는 계속 가능하게 둔다
- 웹에서 만든 문구 블록이 있으면 **읽기 전용 요약** 한 줄: "문구 N개는 웹에서 편집할 수 있어요."

부모에서 레이아웃과 변경 콜백을 prop으로 받는다(`layout: AdBannerLayoutInput | null`, `onLayoutChange: (layout) => void`).

- [ ] **Step 2: 검증** — `pnpm --filter native check-types`

### Task A4: 상세 디자인 신청 옵션

**Files:**
- Modify: `apps/native/src/lib/employer/ad-exposure.ts` (`NativeExposureState`에 필드 추가)
- Modify: `apps/native/src/components/job-exposure-section.tsx`
- Modify: `apps/native/src/lib/employer/job-draft-store.ts` (`buildDraftSubmission`)
- Test: `apps/native/src/lib/employer/ad-exposure.test.ts`

**Interfaces:**
- `NativeExposureState`에 `detailDesignRequested: boolean` 추가. 상품 선택이 바뀌어 옵션이 사라지면 `false`로 되돌린다.

- [ ] **Step 1: 테스트를 더한다**

```ts
describe("resolveDetailDesignSelection", () => {
	it("상품이 옵션을 팔면 선택을 유지한다", () => {
		expect(
			resolveDetailDesignSelection({ detailDesignPrice: 50_000, requested: true })
		).toEqual({ amount: 50_000, requested: true });
	});

	// 옵션을 안 파는 상품으로 바꾸면 선택이 남아 있으면 안 된다(서버도 스냅샷을 정리한다).
	it("옵션이 없으면 선택을 해제한다", () => {
		expect(
			resolveDetailDesignSelection({ detailDesignPrice: null, requested: true })
		).toEqual({ amount: null, requested: false });
	});
});
```

- [ ] **Step 2: 구현한다**

`resolveDetailDesignSelection({ detailDesignPrice, requested })`를 `ad-exposure.ts`에 만들고, 노출 화면이 상품을 바꿀 때마다 통과시킨다.

- [ ] **Step 3: 화면에 붙인다**

`job-exposure-section.tsx`:
- 선택한 상품에 `detailDesignPrice`가 있을 때만 신청 스위치 + 가격을 그린다(값의 출처는 광고 상품 카탈로그 조회 — 이미 이 화면이 쓰고 있다)
- 결제 예정 총액을 `sumJobPaymentAmount(exposureAmount, detailDesignAmount)`(`@bambi-app/api/services/bambi-job-detail-design`)로 바꾼다. 포인트 차감·실입금액 계산은 이 총액을 기준으로 한다

`job-draft-store.ts`의 `buildDraftSubmission`이 유료 분기에서 `detailDesignRequested`와 `detailDesignAmount`를 함께 싣는다.

- [ ] **Step 4: 검증** — `pnpm --filter native test -- ad-exposure` · `pnpm --filter native check-types`

### Task A5: 수정 화면에서 신청·해제

지금 `job-update.ts`는 `detailDesignRequested`를 **항상 생략**해서 기존 신청이 보존만 되고 신청·해제가 불가능하다.

**Files:**
- Modify: `apps/native/src/lib/employer/job-update.ts`
- Test: `apps/native/src/lib/employer/job-update.test.ts`
- Modify: `apps/native/app/(employer)/jobs/[id]/edit.tsx`

- [ ] **Step 1: 테스트를 더한다**

```ts
it("상세 디자인을 안 건드렸으면 키를 보내지 않는다", () => {
	const data = buildJobUpdateData(input, editable, undefined, {
		detailDesignPrice: 50_000,
		nextRequested: true,
		previousRequested: true,
	});

	expect("detailDesignRequested" in data).toBe(false);
});

it("신청을 켰으면 값과 가격을 함께 보낸다", () => {
	const data = buildJobUpdateData(input, editable, undefined, {
		detailDesignPrice: 50_000,
		nextRequested: true,
		previousRequested: false,
	});

	expect(data.detailDesignRequested).toBe(true);
	expect(data.detailDesignAmount).toBe(50_000);
});

it("신청을 껐으면 false를 보낸다", () => {
	const data = buildJobUpdateData(input, editable, undefined, {
		detailDesignPrice: 50_000,
		nextRequested: false,
		previousRequested: true,
	});

	expect(data.detailDesignRequested).toBe(false);
});
```

인자 형태는 실제 시그니처에 맞춰 조정하되 **"바뀐 경우에만 키를 싣는다"** 규칙은 유지한다.

- [ ] **Step 2: 구현한다**

`buildJobUpdateData`에 상세 디자인 인자를 더하고, `nextRequested !== previousRequested`일 때만 두 키를 싣는다. 파일 상단 주석의 "detailDesignRequested는 보내지 않는다"를 새 규칙으로 고쳐라.

- [ ] **Step 3: 수정 화면에 붙인다**

`edit.tsx`가 `getEditableById`에서 현재 신청 상태와 `adBannerLayout`을 읽어 폼에 시딩하고, 저장 시 위 인자와 `adBannerLayout`(바뀐 경우에만)을 넘긴다. **`completed` 상태는 잠긴 것으로 표시하고 끄지 못하게 한다**(서버가 어차피 거부한다).

- [ ] **Step 4: 검증** — `pnpm --filter native test -- job-update ad-exposure ad-banner-layout` · `pnpm --filter native check-types` · `npx ultracite check <트랙 A 파일들>`

---

# 트랙 B — 상세 이미지 슬라이싱

**소유 파일:** `packages/api/src/services/bambi-job-media-policy.ts`, `packages/api/test/services/bambi-job-media-policy.test.ts`, `apps/web/src/lib/bambi/detail-image-slicing.ts`, `apps/native/src/lib/employer/detail-image-slicing.ts`(신규)+테스트, `apps/native/src/lib/employer/job-image-upload.ts`, `apps/native/src/components/job-image-picker-section.tsx`

**주의:** `job-image-picker-section.tsx`의 **prop 계약(`cover`/`detail`/`onChange`)을 바꾸지 마라** — 트랙 C가 `native-job-form.tsx`에서 이 컴포넌트를 렌더한다. 내부 업로드 경로만 바꾼다.

### Task B1: 분할 계획 함수를 서비스로 이동

`planDetailSlices`와 `groupDetailMediaBySlice`는 순수 함수이고 이미 `DETAIL_SLICE_MAX_HEIGHT`를 `bambi-job-media-policy`에서 가져온다. 정본을 그 파일로 옮기면 native가 그대로 쓸 수 있다.

**Files:**
- Modify: `packages/api/src/services/bambi-job-media-policy.ts` (두 함수와 `DetailSlicePlan` 타입 추가)
- Modify: `apps/web/src/lib/bambi/detail-image-slicing.ts` (두 함수를 재수출로 교체, canvas 코드는 그대로)
- Test: `packages/api/test/services/bambi-job-media-policy.test.ts`

- [ ] **Step 1: 테스트를 더한다**

```ts
describe("planDetailSlices", () => {
	it("임계값 이하면 자르지 않는다", () => {
		expect(planDetailSlices(3000, 3500)).toEqual([]);
	});

	it("균등 분할하고 합이 원본 높이와 같다", () => {
		const plans = planDetailSlices(8000, 3500);

		expect(plans).toHaveLength(3);
		expect(plans.reduce((sum, plan) => sum + plan.height, 0)).toBe(8000);
		expect(plans[0].offsetY).toBe(0);
		expect(plans[1].offsetY).toBe(plans[0].height);
		for (const plan of plans) {
			expect(plan.height).toBeLessThanOrEqual(3500);
		}
	});

	it("유한하지 않은 높이는 자르지 않는다", () => {
		expect(planDetailSlices(Number.NaN, 3500)).toEqual([]);
	});
});
```

- [ ] **Step 2: 실패 확인** — `cd packages/api && npx vitest run test/services/bambi-job-media-policy.test.ts` → FAIL(미export)

- [ ] **Step 3: 옮긴다**

`apps/web/src/lib/bambi/detail-image-slicing.ts`의 `DetailSlicePlan`·`planDetailSlices`·`groupDetailMediaBySlice`를 **주석까지 그대로** 서비스로 옮기고, 웹 파일에는 재수출을 남긴다.

```ts
export {
	type DetailSlicePlan,
	groupDetailMediaBySlice,
	planDetailSlices,
} from "@bambi-app/api/services/bambi-job-media-policy";
```

- [ ] **Step 4: 통과 확인** — 위 vitest + `pnpm --filter web check-types`(이 워크트리에서는 `.next` 부재로 인한 PNG import 오류 12건이 기저로 뜬다. **그 12건 외에** 새 오류가 없으면 통과다)

### Task B2: native 조각 생성

**Files:**
- Create: `apps/native/src/lib/employer/detail-image-slicing.ts`
- Test: `apps/native/src/lib/employer/detail-image-slicing.test.ts`

**Interfaces:**
- Produces: `sliceDetailImage({ height, uri, width })` → `Promise<null | { height: number; sliceIndex: number; uri: string; width: number }[]>` — B3이 쓴다. 자를 필요가 없으면 `null`.

- [ ] **Step 1: 테스트를 쓴다**

이미지 조작 자체는 네이티브 모듈이라 테스트하지 않는다. **계획을 조각 목록으로 옮기는 순수 변환만** 테스트한다.

```ts
import { describe, expect, it } from "vitest";

import { toSliceCropRegions } from "./detail-image-slicing";

describe("toSliceCropRegions", () => {
	it("계획을 crop 사각형으로 옮긴다", () => {
		const regions = toSliceCropRegions(1000, 8000, 3500);

		expect(regions).toHaveLength(3);
		expect(regions[0]).toEqual({
			height: regions[0].height,
			originX: 0,
			originY: 0,
			sliceIndex: 0,
			width: 1000,
		});
		expect(regions[1].originY).toBe(regions[0].height);
		expect(regions[2].sliceIndex).toBe(2);
	});

	it("자를 필요가 없으면 빈 배열", () => {
		expect(toSliceCropRegions(1000, 2000, 3500)).toEqual([]);
	});
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter native test -- detail-image-slicing`

- [ ] **Step 3: 구현한다**

- `toSliceCropRegions(width, height, maxHeight?)`: `planDetailSlices`(`@bambi-app/api/services/bambi-job-media-policy`)를 호출해 `{ height, originX: 0, originY: plan.offsetY, sliceIndex: plan.index, width }` 목록으로 옮긴다.
- `sliceDetailImage`: 위 목록이 비면 `null`. 아니면 `expo-image-manipulator`로 각 구간을 crop해 새 uri를 만든다. **버전에 맞는 API를 문서로 확인하고 써라** — SDK 56의 `expo-image-manipulator`는 `ImageManipulator.manipulate(uri)` 계열의 새 API를 쓸 수 있다(구식 `manipulateAsync`가 없을 수 있다). `node_modules/expo-image-manipulator`의 타입 정의를 직접 읽고 맞춰라.
- 실패하면 `null`을 돌려 **원본 한 장 업로드로 폴백**한다. 조각내기 실패가 업로드 자체를 막으면 안 된다.

- [ ] **Step 4: 통과 확인** — `pnpm --filter native test -- detail-image-slicing`

### Task B3: 업로드 경로에 연결

**Files:**
- Modify: `apps/native/src/lib/employer/job-image-upload.ts`
- Modify: `apps/native/src/components/job-image-picker-section.tsx`

- [ ] **Step 1: 상세 업로드를 조각 단위로 바꾼다**

- 상세(`usage: "detail"`) 픽에 한해 `sliceDetailImage`를 통과시킨다. 조각이 나오면 **각 조각을 개별 업로드**하고, 같은 `sliceGroupId`(새 UUID — 기존에 쓰는 id 생성 함수를 재사용하라. `crypto.randomUUID`가 RN에 없으면 이미 쓰는 `generateChatMessageId` 계열을 찾아라)와 0부터의 `sliceIndex`를 실어 `JobMediaUploadItem`을 만든다.
- 조각이 `null`이면 지금 경로 그대로 한 장 올린다.
- `PickedJobImage`·`JobMediaUploadItem` 주석의 "native는 슬라이싱을 하지 않는다"를 새 사실로 고쳐라.

- [ ] **Step 2: 개수 제한을 원본 기준으로 확인한다**

`job-image-picker-section.tsx`는 이미 `isOriginalDetail`(= `sliceIndex`가 0이거나 없음)로 5장을 세고 그룹 단위로 지운다. **그 규칙을 깨지 마라.** 새로 만든 그룹도 같은 규칙에 걸리는지 확인하고, 업로드 중 진행 표시가 조각 수만큼 반복되지 않게 한 픽을 하나의 진행 단위로 묶어라.

- [ ] **Step 3: 검증** — `pnpm --filter native check-types` · `pnpm --filter native test` · `npx ultracite check <트랙 B 파일들>`

---

# 트랙 C — 공고 폼 UX 5건

**소유 파일:** `apps/native/src/components/native-job-form.tsx`, `apps/native/src/lib/employer/job-form-ux.ts`(신규)+테스트, `apps/native/components/container.tsx`

**주의:** `job-image-picker-section.tsx`·`job-exposure-section.tsx`·`job-banner-picker-section.tsx`는 **열지 마라**(다른 트랙 소유). `native-job-form.tsx`에서 이들을 렌더하는 부분은 **prop을 바꾸지 말고 그대로 둬라.**

### Task C1: 순수 로직 세 개

**Files:**
- Create: `apps/native/src/lib/employer/job-form-ux.ts`
- Test: `apps/native/src/lib/employer/job-form-ux.test.ts`

- [ ] **Step 1: 테스트를 쓴다**

```ts
import { describe, expect, it } from "vitest";

import {
	formatPayAmountInput,
	getFirstErrorField,
	shouldWarnOnLeave,
} from "./job-form-ux";

describe("formatPayAmountInput", () => {
	it("천단위로 끊어 보여 준다", () => {
		expect(formatPayAmountInput("1500000")).toBe("1,500,000");
	});

	// 저장값은 순수 숫자다 — 표시 포맷이 state로 새어 들어가면 서버로 콤마가 간다.
	it("숫자가 아닌 문자는 버린다", () => {
		expect(formatPayAmountInput("1,2a3")).toBe("123");
	});

	it("빈 값은 빈 문자열", () => {
		expect(formatPayAmountInput("")).toBe("");
	});
});

describe("getFirstErrorField", () => {
	// 화면에 그려진 순서대로 첫 오류를 고른다 — 객체 키 순서에 기대면 안 된다.
	it("폼 순서상 가장 먼저 나오는 오류를 고른다", () => {
		expect(getFirstErrorField({ payAmount: "필수", title: "필수" })).toBe(
			"title"
		);
	});

	it("오류가 없으면 null", () => {
		expect(getFirstErrorField({})).toBeNull();
	});
});

describe("shouldWarnOnLeave", () => {
	it("작성한 내용이 있으면 경고한다", () => {
		expect(shouldWarnOnLeave({ isDirty: true, isSubmitting: false })).toBe(true);
	});

	// 빈 폼에서 뒤로가기마다 확인창이 뜨면 방해만 된다.
	it("건드리지 않은 폼은 그냥 나간다", () => {
		expect(shouldWarnOnLeave({ isDirty: false, isSubmitting: false })).toBe(
			false
		);
	});

	// 제출이 성공해 화면을 떠나는 것까지 막으면 안 된다.
	it("제출 중에는 경고하지 않는다", () => {
		expect(shouldWarnOnLeave({ isDirty: true, isSubmitting: true })).toBe(false);
	});
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter native test -- job-form-ux`

- [ ] **Step 3: 구현한다**

`getFirstErrorField`는 **폼에 그려지는 순서를 담은 상수 배열**(`FORM_FIELD_ORDER`)을 두고 그 순서로 첫 오류 키를 고른다. 필드 이름은 `native-job-form.tsx`의 `fieldErrors` 키와 정확히 맞춰라.

- [ ] **Step 4: 통과 확인** — `pnpm --filter native test -- job-form-ux`

### Task C2: 첫 오류로 스크롤

**Files:**
- Modify: `apps/native/components/container.tsx` (ScrollView ref 전달 가능하게)
- Modify: `apps/native/src/components/native-job-form.tsx`

- [ ] **Step 1: ref 경로를 연다**

`Container`가 `scrollViewProps`를 이미 패스스루한다. `ref`가 실제로 `KeyboardAwareScrollView`에 닿는지 확인하고, 닿지 않으면 `scrollViewRef` prop을 따로 받아 넘겨라. **기존 호출부의 렌더 결과가 달라지면 안 된다.**

- [ ] **Step 2: 폼에 붙인다**

- 각 필드 래퍼에 `onLayout`으로 y 좌표를 기록한다(`Record<string, number>` ref).
- `handleSubmit`에서 `buildValidInput()`이 null이면 `getFirstErrorField(fieldErrors)`로 필드를 고르고 그 y로 `scrollTo({ animated: true, y })`. 좌표가 없으면 스크롤하지 않는다(맨 위로 튀지 않게).
- 기존 `formMessage` 요약은 그대로 둔다.

- [ ] **Step 3: 검증** — `pnpm --filter native check-types`

### Task C3: 뒤로가기 경고

**Files:**
- Modify: `apps/native/src/components/native-job-form.tsx`

- [ ] **Step 1: 이탈 가드를 단다**

- `expo-router`가 재수출하는 `useNavigation()`을 쓰고 `navigation.addListener("beforeRemove", handler)`로 막는다. **`@react-navigation/native`를 직접 import하지 마라**(해석되지 않는다). `expo-router`에 `useNavigation`이 없으면 안드로이드 하드웨어 백은 `BackHandler`(react-native), 헤더 백은 별도 처리로 나눠라 — 실제 export를 확인하고 결정하라.
- `shouldWarnOnLeave({ isDirty, isSubmitting })`가 true일 때만 막고, `Alert.alert`로 "작성 중인 내용이 있어요 / 나가면 사라져요"와 [계속 작성, 나가기]를 띄운다. "나가기"면 `event.data.action`을 그대로 `navigation.dispatch`한다.
- `isDirty`는 사용자가 필드를 한 번이라도 바꿨는지로 둔다(초기 시딩은 dirty가 아니다). 제출 성공 경로에서는 `isSubmitting`을 세워 가드를 끈다.

- [ ] **Step 2: 검증** — `pnpm --filter native check-types`

### Task C4: 급여 표기 · TextArea · 섹션 분리

**Files:**
- Modify: `apps/native/src/components/native-job-form.tsx`

- [ ] **Step 1: 급여 입력**

state에는 **숫자만** 유지하고 `value`에만 `formatPayAmountInput`을 적용한다. `onChangeText`는 숫자만 추출해 state에 넣는다. 라벨 또는 보조 문구에 "원"을 붙인다(입력칸 안에 넣지 마라 — 커서 위치가 흔들린다). "협의" 선택 시 비활성·값 비우기 동작은 그대로 둔다.

- [ ] **Step 2: 상세 설명을 TextArea로**

heroui `TextArea`로 교체한다. anatomy와 props는 `.agents/skills/heroui-native/SKILL.md`(없으면 `node_modules/heroui-native`의 해당 컴포넌트 문서)를 읽고 맞춰라. 라벨·오류 표시는 지금과 같은 `TextField` 구조를 유지한다.

- [ ] **Step 3: 섹션 분리**

지금 하나의 `Surface`에 15개가 평면으로 쌓여 있다. **순서와 로직은 그대로 두고** 네 그룹으로 나눈다.

1. **기본 정보** — 등록 범위 · 제목 · 업종 · 지역 · 세부지역
2. **근무 조건** — 급여 · 급여 단위 · 근무 일정 · 초보 환영 · 당일/즉시 면접 · 면접 안내
3. **상세 소개** — 상세 설명 · 설명 블록 편집기
4. **이미지** — 대표·상세 이미지

그룹마다 제목(`Label` 또는 `font-semibold` 텍스트)을 두고 `Surface`를 나눈다. 미리보기 카드와 노출 안내 문구는 지금 위치를 유지한다.

- [ ] **Step 4: 검증** — `pnpm --filter native check-types` · `pnpm --filter native test` · `npx ultracite check apps/native/src/components/native-job-form.tsx apps/native/src/lib/employer/job-form-ux.ts apps/native/src/lib/employer/job-form-ux.test.ts apps/native/components/container.tsx`

---

## 통합 검증 (컨트롤러)

- [ ] `pnpm --filter native check-types` → 0
- [ ] `pnpm --filter native test` → 전건 통과
- [ ] `packages/api`에서 `npx vitest run test/services` → `bambi-job-media-policy` 통과(env 없는 워크트리라 DB 의존 파일들의 실패는 기저)
- [ ] `pnpm --filter web check-types` → `.next` 부재 기저 12건 외 신규 0
- [ ] `npx ultracite check <변경된 전체 경로>` → 클린
- [ ] 트랙별 커밋

## 실기기 확인 (사용자)

- 상세 디자인 옵션이 있는 상품에서 신청 → 총액 합산, 수정 화면에서 해제가 반영되는지, `completed` 건이 잠겨 있는지
- 단색 배경 슬롯이 이미지 없이 제출되는지, 웹에서 문구를 넣어 둔 공고를 앱에서 저장해도 문구가 남는지
- 3500px 넘는 상세 이미지가 조각으로 갈라지고 상세 화면에서 이어져 보이는지, 삭제가 그룹 단위인지 (**재빌드 후**)
- 필수 항목을 비우고 제출 시 첫 오류로 스크롤되는지, 작성 중 뒤로가기에 경고가 뜨고 빈 폼에서는 안 뜨는지
- 급여 입력의 천단위 표기와 커서, 상세 설명 TextArea의 높이·키보드 겹침

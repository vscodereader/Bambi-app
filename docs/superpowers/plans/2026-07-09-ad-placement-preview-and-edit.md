# 광고 위치 미리보기 · 상품 수정 · 운영자 폭 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자 콘솔에 광고 위치·상품 수정 기능을 더하고, `/seeker` 실제 슬롯을 재현한 위치 미리보기 템플릿을 안내 페이지에 노출하며(레퍼런스형 표 UI), 운영자 페이지 폭·여백을 헤더와 통일한다.

**Architecture:** 기존 광고 카탈로그(`adPlacement`/`adProduct` + `bambi.adProducts` oRPC 라우터 + `/moderator/ad-products` 콘솔 + `/employer/ad-guide` 안내) 위 증분. 미리보기는 이미지 업로드 없이 `/seeker` 컴포넌트를 축소 재현한 정적 템플릿으로 해결. 데이터 모델은 `adPlacement`에 `previewTemplate` enum 1컬럼만 추가.

**Tech Stack:** Next.js RSC, Drizzle+Postgres, oRPC+zod, TanStack Query, shadcn(base-ui)+Tailwind v4.

## Global Constraints

- **빌드·실행·dev서버·스크린샷 금지.** 검증은 타입체크 + string-snapshot(vitest) + Biome. 시각 확인은 사용자.
- **`db:*` 실행 금지·`db:push` 절대 금지.** 스키마 변경 후 마이그레이션은 사용자가 `db:generate`(0010) → 검토 → 커밋 → `db:migrate`. 구현자는 스키마 코드만 수정.
- **UI 규칙(apps/web/CLAUDE.md):** shadcn 우선, 인라인 `style` 금지, raw hex/oklch 금지·시맨틱/브랜드 토큰(coral·muted·border) 사용, `rounded-none` 금지, `space-x/y-*` 금지(`gap-*`), `size-*`, `cn()`, base-ui는 `render` prop(asChild 아님).
- **폭 컨벤션:** `max-w-[1180px]`·임의 raw px(`max-w-[Npx]`) 금지, `layout.ts`의 `APP_CONTENT_WIDTH`/`APP_CONTENT_MAX_W`(=`min(92%,1120px)`) 재사용.
- **커밋:** 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). 커밋 전 `pnpm install` 사전조건, 줄바꿈 LF. 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **primary 버튼 위계:** 내비 링크에 primary 금지. 안내 페이지 "신청" 버튼은 주요 액션이므로 coral 강조 허용(섹션당 일관).
- **모바일 반응형 필수.** 데스크톱·모바일 모두 고려.
- **미리보기 타입 단일 소스:** 템플릿 ID enum은 스키마(pgEnum)에서 정의하고, 웹은 그 리터럴 배열을 재사용(중복 정의 금지).

## 템플릿 ID (공유)

```
"premium-top" | "special-list" | "urgent-list" | "recommended-list" | "side-vertical" | "side-horizontal" | "none"
```

표시명 매핑: premium-top=상단 프리미엄 배너 / special-list=스페셜 채용 노출 / urgent-list=급구 채용 노출 / recommended-list=추천 채용 노출 / side-vertical=우측 세로 배너 / side-horizontal=좌측 가로 배너 / none=미리보기 없음.

---

### Task 1: 스키마 + API — previewTemplate 컬럼·입력

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (adPlacement 테이블, enum 추가)
- Modify: `packages/api/src/routers/bambi/ad-products.ts` (create/update 입력)
- Modify: `packages/api/src/routers/bambi/ad-products.test.ts` (enum 검증·기본값)

**Interfaces:**
- Produces: `adPreviewTemplate` pgEnum, `adPlacement.previewTemplate` 컬럼(default `'none'` notNull). `createPlacementInput`/`updatePlacementInput`에 `previewTemplate` 필드. `getCatalog`/`listCatalogAdmin` 반환 placement에 `previewTemplate: string` 포함(컬럼 전체 반환이라 자동).

- [ ] **Step 1: enum 추가** — `bambi.ts`의 `adPlacementKind` 정의 아래에 추가:
```ts
export const adPreviewTemplate = pgEnum("ad_preview_template", [
	"premium-top",
	"special-list",
	"urgent-list",
	"recommended-list",
	"side-vertical",
	"side-horizontal",
	"none",
]);
```

- [ ] **Step 2: 컬럼 추가** — `adPlacement` 테이블 `kind` 아래에:
```ts
previewTemplate: adPreviewTemplate("preview_template").default("none").notNull(),
```

- [ ] **Step 3: 배럴 확인** — `packages/db/src/index.ts`가 `./schema/bambi`에서 테이블/enum을 스타 또는 명시 재export하는지 확인. 명시 목록 방식이면 `adPreviewTemplate` 추가(테이블은 이미 export됨). `schema` 객체에 enum은 넣지 않음(기존 `adPlacementKind` 전례 따름).

- [ ] **Step 4: API 입력 확장** — `ad-products.ts` 상단에 스키마 추가하고 create/update input에 반영:
```ts
const previewTemplateSchema = z.enum([
	"premium-top", "special-list", "urgent-list",
	"recommended-list", "side-vertical", "side-horizontal", "none",
]);
```
`createPlacementInput`에 `previewTemplate: previewTemplateSchema.default("none")`, `updatePlacementInput`에 `previewTemplate: previewTemplateSchema.optional()` 추가. 핸들러(createPlacement/updatePlacement)는 `input`을 그대로 insert/set 하므로 로직 변경 불필요.

- [ ] **Step 5: 테스트** — `ad-products.test.ts`에 케이스 추가: (a) `createPlacement`에 `previewTemplate: "premium-top"` 지정 시 반환/조회에 반영. (b) 미지정 시 기본 `"none"`. (c) `previewTemplate`에 잘못된 값이면 zod가 거부(입력 파싱 레벨). 기존 픽스처 스타일(user+bambiProfile admin 시드, finally cleanup) 유지.

- [ ] **Step 6: 타입체크** — `pnpm --filter @bambi-app/db typecheck && pnpm --filter @bambi-app/api typecheck`. Expected: PASS. (DB 미마이그레이션이라 실DB 테스트는 실행하지 않음 — 사용자 몫.)

- [ ] **Step 7: Commit** — `feat: 광고 위치 미리보기 템플릿 필드(previewTemplate) 추가`

---

### Task 2: AdPlacementPreview 미리보기 컴포넌트

**Files:**
- Create: `apps/web/src/components/bambi/ad-placement-preview.tsx`
- Create/Modify: string-snapshot 어서션은 Task 5 테스트에 포함(별도 테스트 파일 불필요)

**Interfaces:**
- Consumes: 템플릿 ID(Task 1 enum 값). `HorizontalAdBanner`(`ad-banner.tsx`, props `{adKey, className}`), `AdBanner`(props `{seed, src, className}`, `SAMPLE_BANNERS` 재사용).
- Produces: `export type PreviewTemplate`(7 리터럴), `export function AdPlacementPreview({ template }: { template: PreviewTemplate })`, `export const PREVIEW_TEMPLATE_LABELS: Record<PreviewTemplate, string>`(표시명), `export const PREVIEW_TEMPLATE_OPTIONS`(select용 `{value,label}[]`).

- [ ] **Step 1: 타입·라벨 정의** — `PreviewTemplate` 리터럴 유니온, `PREVIEW_TEMPLATE_LABELS`, `PREVIEW_TEMPLATE_OPTIONS`를 정의(스키마 값과 동일 순서·값).

- [ ] **Step 2: 배너 템플릿** — `"use client"`. `premium-top`은 `HorizontalAdBanner adKey=...`를 2~4개 작은 그리드로, `side-horizontal`은 `HorizontalAdBanner` 세로 스택 2개, `side-vertical`은 `AdBanner seed src`(SAMPLE_BANNERS[0..1]) 세로 스택. 미리보기 컨테이너는 `rounded-lg border border-border bg-muted/30 p-3` + 상단 캡션 라벨(coral). `side-*`는 캡션에 "넓은 화면에서 노출" 보조문구.

- [ ] **Step 3: 리스트 템플릿(경량 카드)** — `special-list`/`urgent-list`/`recommended-list`는 실제 `VisualJobCard`(Job+핸들러 필요) 대신, 슬롯 실루엣을 재현한 로컬 경량 카드로:
  - 액센트 바 헤더: 좌측 색 바(special=`bg-coral-500`, urgent=`bg-amber-500`, recommended=`bg-sky-400`) + 섹션명 + "이 자리" coral 라벨.
  - 그 아래 `grid grid-cols-2 gap-2`로 미니 카드 2~3개(각 `rounded-lg border p-2` + 커버 자리 `bg-muted` 박스 + 텍스트 라인 `bg-muted` 바 2개 + 가격 배지 실루엣). tone별 테두리색(`toneClassName` 상수 로컬 정의). 강조 대상 1개엔 `ring-2 ring-coral-200`.
  - 인라인 style 금지, 전부 Tailwind.

- [ ] **Step 4: none 처리** — `template === "none"`이면 `null` 반환.

- [ ] **Step 5: 타입체크** — `pnpm --filter web typecheck`. Expected: PASS.

- [ ] **Step 6: Commit** — `feat: 광고 위치 미리보기 템플릿 컴포넌트(AdPlacementPreview) 추가`

---

### Task 3: 폼 확장 — AdProductForm(초기값) + AdPlacementForm(신설)

**Files:**
- Modify: `apps/web/src/components/bambi/ad-product-form.tsx`
- Create: `apps/web/src/components/bambi/ad-placement-form.tsx`

**Interfaces:**
- Consumes: `PreviewTemplate`/`PREVIEW_TEMPLATE_OPTIONS`(Task 2). shadcn `Select`(`@bambi-app/ui/components/select`).
- Produces:
  - `AdProductForm`에 옵셔널 `initialValue?: AdProductDraft`, `submitLabel?: string` 추가(하위호환).
  - `export interface AdPlacementDraft { name; description; kind: "listing"|"banner"; previewTemplate: PreviewTemplate }`, `export function AdPlacementForm({ initialValue?, onSubmit, pending, submitLabel? })`.

- [ ] **Step 1: AdProductForm 초기값** — props에 `initialValue?: AdProductDraft`, `submitLabel = "저장"` 추가. state 초기화를 initialValue 기반으로:
```ts
const [name, setName] = useState(initialValue?.name ?? "");
const [tagline, setTagline] = useState(initialValue?.tagline ?? "");
const [benefits, setBenefits] = useState<BenefitField[]>(() =>
	(initialValue?.benefits.length ? initialValue.benefits : [""]).map((value) => ({ id: makeId(), value }))
);
const [priceOptions, setPriceOptions] = useState<PriceOptionField[]>(() =>
	(initialValue?.priceOptions.length ? initialValue.priceOptions : [{ amount: 0, days: 30 }])
		.map((o) => ({ id: makeId(), ...o }))
);
```
저장 버튼 라벨을 `{submitLabel}`로. 기존 미제공 경로(생성)는 동작 불변.

- [ ] **Step 2: AdPlacementForm 추출** — 현재 `/moderator/ad-products/new/page.tsx`의 인라인 폼(name·description·kind Select)을 컴포넌트로 추출하고 **previewTemplate Select 추가**(`PREVIEW_TEMPLATE_OPTIONS` 사용, 기본 `"none"`). `onSubmit(draft: AdPlacementDraft)` 호출. `initialValue` 있으면 시드, `submitLabel`로 버튼 라벨.

- [ ] **Step 3: 타입체크** — `pnpm --filter web typecheck`. Expected: PASS.

- [ ] **Step 4: Commit** — `feat: 광고 위치·상품 폼 초기값 지원 및 위치 폼 컴포넌트 추출`

---

### Task 4: 편집 라우트 + 콘솔 수정 링크 + 위치 생성 폼 교체

**Files:**
- Modify: `apps/web/src/app/moderator/ad-products/new/page.tsx` (AdPlacementForm으로 교체 + previewTemplate 전달)
- Create: `apps/web/src/app/moderator/ad-products/[placementId]/edit/page.tsx`
- Create: `apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/page.tsx` (수정 링크)
- Modify/Create: string-snapshot 어서션 → `apps/web/src/components/bambi/visual-job-components.test.ts`에 추가

**Interfaces:**
- Consumes: `AdPlacementForm`/`AdProductForm`(Task 3), `orpc.bambi.adProducts.{listCatalogAdmin,updatePlacement,updateProduct,createPlacement}`.

- [ ] **Step 1: 위치 생성 페이지 교체** — `/new/page.tsx`를 `AdPlacementForm`으로 교체하고 `createPlacement.mutate({ name, description: description||undefined, kind, previewTemplate })` 호출. 성공 시 토스트 + `/moderator/ad-products` 이동(기존 유지).

- [ ] **Step 2: 위치 수정 페이지** — `[placementId]/edit/page.tsx`(`"use client"`): `useParams`로 placementId, `listCatalogAdmin` 쿼리에서 해당 위치 find. 로딩 Skeleton, 없으면 안내. 찾으면 `AdPlacementForm initialValue={{name,description:description??"",kind,previewTemplate}} submitLabel="수정 저장"` 렌더, `onSubmit`에서 `updatePlacement.mutate({ id, ...draft, description: draft.description||undefined })`. 성공 시 invalidate + 이동.

- [ ] **Step 3: 상품 수정 페이지** — `[placementId]/[productId]/edit/page.tsx`: `listCatalogAdmin`에서 placement→product find. `AdProductForm initialValue={{name,tagline:tagline??"",benefits,priceOptions}} submitLabel="수정 저장"`, `onSubmit`에서 `updateProduct.mutate({ id: productId, name, tagline: tagline||undefined, benefits, priceOptions })`. 성공 시 invalidate + 이동.

- [ ] **Step 4: 콘솔 수정 링크** — `page.tsx` 위치 카드 헤더(삭제 버튼 옆)에 "수정" `Link`(→ `/moderator/ad-products/${placement.id}/edit`), 각 상품 행에 "수정" `Link`(→ `/moderator/ad-products/${placement.id}/${product.id}/edit`). `buttonVariants({size:"sm",variant:"ghost"})` + `Route` 캐스팅(기존 패턴).

- [ ] **Step 5: 테스트** — `visual-job-components.test.ts`에 어서션 추가: 콘솔 소스가 `/edit`(위치)·`${product.id}/edit`(상품) 링크를 포함, 편집 페이지 소스가 `updatePlacement`/`updateProduct` 및 `AdPlacementForm`/`AdProductForm`·`initialValue`를 포함.

- [ ] **Step 6: 타입체크 + 스냅샷** — `pnpm --filter web typecheck` + `pnpm --filter web test`(해당 스냅샷). Expected: PASS.

- [ ] **Step 7: Commit** — `feat: 광고 위치·상품 수정 UI 및 편집 라우트 추가`

---

### Task 5: 안내 페이지 레퍼런스형 재구성 + 미리보기 통합

**Files:**
- Modify: `apps/web/src/components/bambi/screens/employer-ad-guide.tsx`
- Modify: `apps/web/src/lib/bambi/ad-catalog.ts` (필요 시 previewTemplate 타입 노출 — `AdCatalogPlacement`에 자동 포함되므로 대개 불필요)
- Modify: string-snapshot 테스트

**Interfaces:**
- Consumes: `AdPlacementPreview`/`PreviewTemplate`(Task 2), `AdCatalogPlacement`(previewTemplate 포함), `formatAdPrice`/`formatAdDuration`.

- [ ] **Step 1: 행(row) 레이아웃** — `PlacementSection`을 레퍼런스 표 구조로 재작성. 각 상품 = 카드 내부 grid 행, 열: **광고위치 · 서비스내용 · 비용 · 신청**.
  - 데스크톱: `md:grid md:grid-cols-[minmax(0,220px)_1fr_auto_auto]` 형태(또는 유사) 컬럼. 상단에 컬럼 헤더 라벨("광고위치/서비스내용/비용/신청") 1회.
  - 광고위치 열: `AdPlacementPreview template={placement.previewTemplate}`(위치 단위라 섹션당 1회 렌더하고 rowSpan 대신 위치 헤더 영역에 배치, 또는 각 상품 행 좌측에 표시 — 위치당 상품이 보통 소수이므로 **위치 헤더에 미리보기 1회 + 그 아래 상품 행들**이 더 자연스러움). `none`이면 위치 열 생략(표는 3열로).
  - 서비스내용: 불릿 목록(기존 Check 리스트 재사용).
  - 비용: 기간별 가격 세로 나열 `formatAdPrice(amount)` 강조 + `(formatAdDuration(days))` 보조.
  - 신청: coral 버튼(`buttonVariants({variant:"default"})`) → `APPLY_HREF`.
- [ ] **Step 2: 모바일 스택** — `md` 미만에서 열을 세로 스택(미리보기→서비스내용→비용→신청). `flex flex-col gap-*` 기반, `md:` 접두사로 그리드 전환.
- [ ] **Step 3: 토큰·컴포넌트 준수** — shadcn `Card`/`Separator`/`Badge`/`Button`, 시맨틱/coral 토큰, 인라인 style·raw px 금지. 상단 "광고 등록 문의" 카드(기존)는 유지.
- [ ] **Step 4: 테스트** — string-snapshot: 안내 페이지가 `AdPlacementPreview`를 렌더하고 컬럼 라벨(광고위치/서비스내용/비용/신청)·`formatAdPrice`를 포함하는지.
- [ ] **Step 5: 타입체크 + 스냅샷** — `pnpm --filter web typecheck` + 스냅샷. Expected: PASS.
- [ ] **Step 6: Commit** — `feat: 광고 상품 안내 페이지 레퍼런스형 표 UI·위치 미리보기 적용`

---

### Task 6: 운영자 페이지 폭·여백 헤더 통일

**Files:**
- Modify: `apps/web/src/app/moderator/ad-products/page.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/new/page.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/[placementId]/edit/page.tsx`(Task 4 산출)
- Modify: `apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx`(Task 4 산출)
- Modify: `apps/web/src/app/moderator/employers/page.tsx`

**Interfaces:**
- Consumes: `APP_CONTENT_WIDTH`(`@/lib/bambi/layout`).

- [ ] **Step 1: 컨테이너 통일** — 위 페이지들의 최상위 컨테이너 className `mx-auto flex w-full max-w-3xl ... px-6 py-6`(및 `max-w-2xl`)를 헤더와 동일 폭·여백으로:
```tsx
className={cn("mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6", APP_CONTENT_WIDTH)}
```
(`cn`은 `@bambi-app/ui/lib/utils`). `max-w-2xl`/`max-w-3xl` 제거, `APP_CONTENT_WIDTH`로 대체. gap은 페이지별 기존값 유지.

- [ ] **Step 2: 상세 플레이스홀더 제외 확인** — `users/[id]`·`queue/[id]`·`reports/[id]`는 중앙정렬 안내 화면이라 대상 아님(변경 금지).

- [ ] **Step 3: 테스트** — string-snapshot: 대상 페이지가 `APP_CONTENT_WIDTH`를 사용하고 `max-w-3xl`/`max-w-2xl`를 더는 쓰지 않는지.

- [ ] **Step 4: 타입체크 + 스냅샷** — Expected: PASS.

- [ ] **Step 5: Commit** — `refactor: 운영자 페이지 콘텐츠 폭·여백 헤더와 통일`

---

## 실행 후 (사용자 안내)
- 스키마 변경(Task 1) 반영: 사용자가 `pnpm --filter @bambi-app/db db:generate`로 `0010_*.sql` 생성 → enum 추가 + `preview_template` 컬럼(default 'none') 확인 → 커밋 → `pnpm --filter @bambi-app/db db:migrate`. `db:push` 금지.
- 시각 확인(안내 페이지 표 UI·미리보기·운영자 폭)은 사용자가 dev에서 확인.

## Self-Review 메모
- 템플릿 enum 값은 스키마·API·컴포넌트 3곳에서 동일 리터럴 사용(Task1 pgEnum이 원천, Task2가 웹 표시명 매핑). 값 오타 없도록 동일 순서 유지.
- previewTemplate은 placement 단위(위치=게시 장소)라 상품이 아닌 위치 폼/스키마에만 존재.
- 편집 페이지는 `listCatalogAdmin`(전체 반환) 재사용으로 별도 단건 조회 API 불필요.

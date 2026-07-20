# 광고 위치 미리보기 · 상품 수정 · 운영자 폭 통일 설계

**작성일:** 2026-07-09
**선행:** `2026-07-09-ad-product-catalog-design.md`(광고 상품 카탈로그) 위에 얹는 증분 작업.

## 목표

1. **수정(edit) 기능**: 운영자 콘솔에서 광고 위치·상품을 생성·삭제만 가능하던 것을 **수정도 가능**하게 한다.
2. **위치 미리보기**: 구인자가 광고 상품을 신청하면 사이트 어디에 게시되는지, `/seeker` 실제 광고 슬롯을 축소 재현한 **템플릿**으로 안내 페이지에서 미리 보여준다. admin은 위치를 만들 때 어느 템플릿(게시 위치)에 노출되는지 선택한다.
3. **운영자 페이지 폭·여백 통일**: 운영자 페이지 콘텐츠 영역 폭·여백을 헤더 고정폭과 동일하게 맞춘다.

## 비목표(범위 밖)

- 실제 이미지 업로드/스토리지(presign) 배선 — 미리보기는 코드 템플릿 재사용으로 해결한다.
- 광고 결제/노출 실집행 로직 — 카탈로그·안내 성격 유지(신청 = 공고 등록 화면 이동).
- 정렬(reorder) UI — API는 있으나 이번 범위 아님.

---

## 작업 A — 위치·상품 수정(edit)

### 현황
- API `packages/api/src/routers/bambi/ad-products.ts`에 `updatePlacement`(name·description·kind·sortOrder·isActive)·`updateProduct`(name·tagline·benefits·priceOptions·sortOrder·isActive) 전체 필드 수정이 이미 존재. **API 변경 불필요.**
- 콘솔 `apps/web/src/app/moderator/ad-products/page.tsx`엔 생성·활성토글(Switch)·삭제만 있음.
- `AdProductForm`(`apps/web/src/components/bambi/ad-product-form.tsx`)은 생성 전용(초기값·저장 라벨 미지원).

### 설계
- **`AdProductForm` 확장**: `initialValue?: AdProductDraft`, `submitLabel?: string`를 옵셔널로 받아 생성·수정 공용. 미제공 시 기존 동작(빈 폼, "저장") 유지. 초기값이 주어지면 name/tagline/benefits/priceOptions state를 그 값으로 시드한다(빈 배열이면 기존처럼 빈 슬롯 1개).
- **위치 수정 폼 컴포넌트 신설** `apps/web/src/components/bambi/ad-placement-form.tsx`: name·description·kind·(작업 B의)previewTemplate 입력. 생성 페이지(`/new`)와 수정 페이지가 공용으로 사용(현재 `/new`의 인라인 폼을 이 컴포넌트로 추출).
- **라우트 추가**:
  - `apps/web/src/app/moderator/ad-products/[placementId]/edit/page.tsx` — 위치 수정.
  - `apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx` — 상품 수정.
- **콘솔 배선**: 각 위치 카드 헤더에 "수정" 링크(→ `[placementId]/edit`), 각 상품 행에 "수정" 링크(→ `[placementId]/[productId]/edit`). 기존 삭제/토글은 유지.
- **데이터 프리필**: 수정 페이지는 `listCatalogAdmin`(전체 반환)에서 해당 위치/상품을 찾아 폼 초기값으로 넘긴다. 로딩 중 Skeleton, 대상 없음 시 안내.

### 검증
- string-snapshot(`visual-job-components.test.ts` 패턴): 콘솔에 "수정" 링크가 두 편집 라우트로 걸리는지, 편집 페이지가 `updatePlacement`/`updateProduct` mutation과 `AdProductForm`/`AdPlacementForm`을 사용하는지 `.toContain` 어서션.

---

## 작업 B — 위치 미리보기 템플릿

### 템플릿 세트
`/seeker` 실제 광고 슬롯(Explore 매핑)을 축소 재현. admin이 위치 생성/수정 시 하나 선택:

| 템플릿 ID | 표시명 | 나타내는 `/seeker` 슬롯 | 재사용 컴포넌트 | 노출 비고 |
|---|---|---|---|---|
| `premium-top` | 상단 프리미엄 배너 | 중앙 컬럼 최상단 4열 가로배너(`PremiumAdBannerSection`) | `HorizontalAdBanner` | 전 폭, 가장 눈에 띔 |
| `special-list` | 스페셜 채용 노출 | 스페셜 섹션(coral 액센트) | `VisualJobCard` + 액센트 헤더 | 목록 최상단 |
| `urgent-list` | 급구 채용 노출 | 급구 섹션(amber, 부스트 파생) | `VisualJobCard` + 액센트 헤더 | 목록 2번째 |
| `recommended-list` | 추천 채용 노출 | 추천 섹션(sky 액센트) | `VisualJobCard` + 액센트 헤더 | 목록 3번째 |
| `side-vertical` | 우측 세로 배너 | 우측 rail 세로 80×180 | `AdBanner` | 초광폭(≥1720px) 전용 |
| `side-horizontal` | 좌측 가로 배너 | 좌측 rail 가로 200×89 | `HorizontalAdBanner` | 초광폭(≥1720px) 전용 |
| `none` | 미리보기 없음 | — | — | 기본값 |

- 초광폭 전용(`side-*`) 템플릿은 미리보기 캡션에 "넓은 화면에서 노출"임을 명시한다.

### 데이터 모델
- `packages/db/src/schema/bambi.ts` `adPlacement`에 컬럼 추가:
  - `previewTemplate` — pgEnum `ad_preview_template`(위 7개 값) 또는 text. **pgEnum 채택**(카탈로그의 `adPlacementKind` 전례와 일치, 값 제약). 기본값 `'none'`, notNull.
- **마이그레이션**: drizzle-kit generate로 `0010_*.sql` 생성(enum 추가 + 컬럼 추가). Claude는 `db:*` 실행 금지 — 사용자가 `db:generate` → 검토 → 커밋 → `db:migrate`(`db:push` 금지).
- API: `createPlacementInput`/`updatePlacementInput`에 `previewTemplate: z.enum([...]).optional()`(create는 `.default('none')`) 추가. `getCatalog`/`listCatalogAdmin`는 select에 자동 포함(컬럼 전체 반환)이므로 핸들러 변경 최소.

### 미리보기 컴포넌트
- 신설 `apps/web/src/components/bambi/ad-placement-preview.tsx`:
  - `AdPlacementPreview({ template }: { template: PreviewTemplate })` — 템플릿 ID로 분기해 해당 미니 목업 렌더.
  - 각 목업은 실제 `/seeker` 컴포넌트(`HorizontalAdBanner`/`AdBanner`/`VisualJobCard`)를 재사용하되, "이 자리" 강조(coral 링/라벨)로 광고 위치를 표시(레퍼런스의 빨간 박스에 해당). `none`이면 렌더 안 함.
  - 목업 데이터는 정적 샘플(결정적) 사용 — 실 데이터 fetch 없음.

### 안내 페이지 재구성 (레퍼런스 스타일)
레퍼런스 이미지의 "광고위치 · 서비스내용 · 비용 · 신청" 표 구조를 밤비 톤으로 재현한다(그대로 복제 금지 — 색은 브랜드 토큰, 오렌지/빨강 raw hex 금지, coral/muted 시맨틱 사용).

- `apps/web/src/components/bambi/screens/employer-ad-guide.tsx`의 `PlacementSection`을 레퍼런스 행 구조로:
  - 데스크톱: 상품 1개 = 한 **행(row)**, 열은 **광고위치(`AdPlacementPreview`) · 서비스내용 · 비용 · 신청**. 레퍼런스처럼 컬럼 헤더("광고위치 / 서비스내용 / 비용 / 신청")를 얹은 표형 레이아웃(카드 내부 grid). 한 위치에 상품이 여러 개면 행이 여러 개.
  - **서비스내용**: 불릿 목록(레퍼런스의 `·` 리스트) — 기존 `Check` 아이콘 리스트를 유지하되 레퍼런스처럼 촘촘한 텍스트 리스트로.
  - **비용**: 기간별 가격을 세로로 나열(예: `330,000원 (30일)` / `620,000원 (60일)`) — 금액을 강조(coral/font-bold), 기간은 보조 텍스트. `formatAdPrice`/`formatAdDuration` 재사용.
  - **신청**: coral 계열 버튼(레퍼런스의 "신청" 버튼 자리), `APPLY_HREF`로 이동.
  - `previewTemplate === 'none'`이면 광고위치 열은 비우거나 축소(표 구조는 유지).
  - 모바일: 표 열을 세로 스택(미리보기 → 서비스내용 → 비용 → 신청)으로 접기. 모바일 반응형 필수 준수.
  - 폭 컨벤션 준수(`max-w-[Npx]`·raw px 임의값 금지, 토큰/계산형). 인라인 style 금지, shadcn `Card`/`Separator`/`Badge`/`Button` 재사용.

### 검증
- 타입체크(web+api). string-snapshot: 각 템플릿 ID가 `AdPlacementPreview`에서 분기되는지, 안내 페이지가 미리보기 컴포넌트를 렌더하는지.
- API 테스트: `previewTemplate` 유효성(enum) + 기본값 `none` 케이스 추가.

---

## 작업 C — 운영자 페이지 폭·여백 통일

### 현황
- 헤더(`ResponsiveAppShell`)는 `APP_CONTENT_MAX_W = max-w-[min(92%,1120px)]` 고정폭.
- 운영자 본문은 페이지마다 `max-w-3xl`/`max-w-2xl` + `px-6 py-6`로 제각각(`moderator/ad-products/*`, `moderator/employers/page.tsx` 등).

### 설계
- 운영자 목록/폼 페이지 컨테이너를 **헤더와 동일 폭·여백**으로 통일:
  - 폭: `APP_CONTENT_WIDTH`(`md:max-w-[min(92%,1120px)]`, 모바일 전체폭).
  - 여백: PageShell과 동일 `px-5 py-6 md:px-6`.
  - `mx-auto flex w-full flex-col gap-*` 유지.
- 적용 대상(콘텐츠 컨테이너를 가진 운영자 페이지): `ad-products/page.tsx`, `ad-products/new/page.tsx`, `ad-products/[placementId]/new/page.tsx`, 신규 편집 페이지들, `employers/page.tsx`. 상세 플레이스홀더(`users/[id]`·`queue/[id]`·`reports/[id]`)는 화면 중앙 정렬 유지(대상 아님).
- `max-w-[Npx]` 임의값 금지 — 기존 `layout.ts` 상수 재사용.

### 검증
- string-snapshot: 대상 페이지가 `APP_CONTENT_WIDTH`(또는 공유 상수)를 사용하는지 확인. 타입체크.

---

## 커밋·마이그레이션 운영
- 커밋: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿. 작업 A/B/C 분리 커밋.
- 마이그레이션은 Claude가 생성/적용하지 않음 — 스키마 변경 후 사용자가 `db:generate`(0010) → 검토 → 커밋 → `db:migrate`. `db:push` 절대 금지.
- 빌드/실행/스크린샷 금지 — 린트+타입체크+string-snapshot만, 시각 확인은 사용자.

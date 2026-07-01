# 구직자 마켓플레이스 discovery 탭 축 필터링 설계

- 날짜: 2026-07-01
- 대상 화면: `/seeker` (`SeekerMarketplaceScreen`)
- 관련 파일: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`,
  `apps/web/src/components/bambi/marketplace.tsx`,
  `apps/web/src/lib/bambi/marketplace.ts`

## 문제

`/seeker` 마켓플레이스 상단의 discovery 탭(`전체`/`지역별`/`업종별`/`지도`/`오늘 본 공고`)
중 `지역별`·`업종별` 탭이 눌러도 아무 동작을 하지 않는다. 원인은 `discoveryTabId`
상태가 설정만 될 뿐 필터링(`filterMarketplaceJobs`)이나 목록 구성에 전혀 연결돼 있지
않기 때문이다. (`지도`·`오늘 본 공고`는 의도적으로 `disabled` 상태이므로 범위 밖.)

좌측 사이드바의 지역/업종 드롭다운과 항상 노출되는 지역 칩은 `filters.region`/
`filters.category`로 이미 정상 작동한다. 필터 로직 자체는 문제가 없다.

## 목표

`지역별`·`업종별` 탭을 실제 필터링에 연결한다. 선택한 탭에 따라 하단 칩 줄을
지역 칩 또는 업종 칩으로 전환하고, 칩을 고르면 해당 축으로 목록을 필터한다.

## 비목표 (YAGNI)

- `지도`·`오늘 본 공고` 탭 구현.
- 홈(`/`, `PublicMarketplaceScreen`) 변경 — 탭이 없으므로 그대로 둔다.
- 필터 로직(`filterMarketplaceJobs`, `jobMatchesRegion`, `jobMatchesCategory`) 변경 —
  이미 정상이므로 재사용만 한다.
- 좌측 사이드바(`MarketplaceFilterSidebar`) 구조 변경.

## 동작 정의

세 탭은 각각 **하나의 축**만 제어한다. 탭 전환 시 비활성 축은 `"전체"`로 리셋해
화면에 보이는 칩과 실제 결과가 항상 일치하도록 한다(숨은 필터 방지 = 축 배타성).

| 탭 | 노출되는 칩 줄 | 탭 전환 시 필터 변화 |
| --- | --- | --- |
| 전체 | 없음(검색 + 퀵필터만) | `region="전체"`, `category="전체"` |
| 지역별 | 지역 칩 | `category="전체"` (지역은 칩으로 제어) |
| 업종별 | 업종 칩 | `region="전체"` (업종은 칩으로 제어) |

- 칩 선택: `지역별`에서 지역 칩 → `filters.region`, `업종별`에서 업종 칩 →
  `filters.category`.
- 축 배타성은 **탭을 전환하는 순간** 적용한다(탭 클릭 시 비활성 축 리셋).
- 좌측 사이드바 드롭다운은 `filters`를 공유하므로 그대로 동작한다. 사이드바에서 축을
  바꿔도 탭 UI와 충돌하지 않는다(탭은 칩 노출과 전환 시 리셋만 담당).

## 구현

### 1. 순수 함수: 탭 전환 시 필터 매핑 (`lib/bambi/marketplace.ts`)

탭↔필터 매핑을 테스트 가능한 순수 함수로 분리한다.

```ts
export type MarketplaceDiscoveryAxis = "all" | "region" | "category";

// 탭 전환 시 비활성 축을 "전체"로 리셋한 다음 필터를 반환한다(축 배타성).
export function applyDiscoveryAxis(
  filters: MarketplaceFilters,
  axis: MarketplaceDiscoveryAxis
): MarketplaceFilters;
```

- `all` → `{ ...filters, region: "전체", category: "전체" }`
- `region` → `{ ...filters, category: "전체" }`
- `category` → `{ ...filters, region: "전체" }`

`"전체"`는 기존 상수(`MARKETPLACE_REGIONS[0]` / `MARKETPLACE_CATEGORIES[0]`)와
동일한 리터럴을 사용한다. 매직 스트링을 피하기 위해 `ALL_OPTION = "전체"` 상수를 두고
`DEFAULT_MARKETPLACE_FILTERS`와 이 함수에서 공유한다.

### 2. 칩 컴포넌트 일반화 (`components/bambi/marketplace.tsx`)

현재 `MarketplaceRegionChips`(지역 전용)를 축을 받는 범용 컴포넌트로 일반화한다.

```tsx
interface MarketplaceAxisChipsProps {
  axis: "region" | "category";
  filters: MarketplaceFilters;
  onChange: (next: MarketplaceFilters) => void;
}
export function MarketplaceAxisChips({ axis, filters, onChange }: ...): JSX.Element;
```

- `axis="region"`: `MARKETPLACE_REGIONS`, `MapPinIcon`, `filters.region` 갱신.
- `axis="category"`: `MARKETPLACE_CATEGORIES`, 업종 아이콘, `filters.category` 갱신.
- 아이콘은 `./icons`에 이미 있는 것을 사용(업종용은 적절한 lucide 파생 아이콘 선택).
- 기존 `MarketplaceRegionChips` 사용처(홈 `PublicMarketplaceScreen`,
  `seeker-marketplace`)를 새 컴포넌트로 교체하거나, 홈은 `MarketplaceRegionChips`를
  얇은 래퍼로 유지해 회귀를 막는다. **선택: `MarketplaceRegionChips`는
  `MarketplaceAxisChips axis="region"`을 감싸는 래퍼로 남겨 홈 코드 무변경.**

### 3. 탭 연결 (`screens/seeker-marketplace.tsx`)

- `discoveryTabId`를 실제로 사용한다. 탭 클릭 핸들러에서:
  1. `setDiscoveryTabId(tab.id)`
  2. `setFilters(applyDiscoveryAxis(filters, axisOf(tab.id)))`
  - `axisOf`: `all→"all"`, `region→"region"`, `category→"category"`.
    비활성 탭(`map`/`recent`)은 여기 도달하지 않음(disabled).
- 항상 노출하던 `MarketplaceRegionChips` 자리를 탭 기반 조건부 칩 줄로 교체:
  - `discoveryTabId==="region"` → `MarketplaceAxisChips axis="region"`
  - `discoveryTabId==="category"` → `MarketplaceAxisChips axis="category"`
  - `discoveryTabId==="all"` → 칩 줄 없음
- 결과 목록은 기존과 동일하게 `VisualJobExposureSections`(노출 등급 섹션)로 렌더.
  탭은 어떤 축으로 거를지만 바꾸고, 노출 등급 정렬/섹션 구조는 유지한다.

## 데이터 흐름

```
탭 클릭
  └─ setDiscoveryTabId + setFilters(applyDiscoveryAxis(filters, axis))
        └─ filters 변경 → useMarketplaceJobs(filters)
              └─ filterMarketplaceJobs(jobs, filters)  (기존 로직)
                    └─ VisualJobExposureSections 재렌더
칩 선택
  └─ onChange({ ...filters, [axis]: value })  → 위와 동일 경로
```

## 에러/엣지 케이스

- 필터 결과 0건: `VisualJobExposureSections`의 기존 빈 상태 카드가 그대로 처리.
- 탭 왕복(지역별→업종별→지역별): 각 전환마다 비활성 축이 리셋되므로 이전 축 선택은
  남지 않는다. 사용자가 명시적으로 고른 현재 축 값만 유지.
- `전체` 탭 재클릭: 멱등(이미 두 축이 "전체"면 변화 없음).

## 테스트

- `apps/web/src/lib/bambi/marketplace.ts`의 `applyDiscoveryAxis` 유닛 테스트
  (기존 `visual-job-components.test.ts`와 동일한 vitest 패턴):
  - `all` → region·category 모두 "전체".
  - `region` → category만 "전체"로, region·기타 필터 유지.
  - `category` → region만 "전체"로, category·기타 필터 유지.
  - `query`/`minimumPay` 등 무관 필드는 보존.
- 필요 시 탭→축 매핑(`axisOf`)도 순수 함수로 두어 테스트.

## 검증

워크트리에서 `pnpm install` 후(커밋 사전조건):

- `pnpm --filter web check-types` (tsc --noEmit)
- `pnpm exec ultracite check <변경 파일들>` — Biome 린트/정렬
- `pnpm exec vitest run apps/web/src/lib/bambi/marketplace.test.ts` — 신규 유닛 테스트
  포함(web엔 `test` 스크립트·vitest 설정이 없어 vitest 자동 검색으로 직접 실행)
- 개발서버·스크린샷 없음(프로젝트 관례). 시각 확인은 사용자가 수행.

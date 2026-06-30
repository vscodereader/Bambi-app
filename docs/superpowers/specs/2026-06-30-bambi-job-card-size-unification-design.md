# Bambi Job Card Size Unification Design

작성일: 2026-06-30

## 1. 배경

공개 홈 `/`(그리고 동일 컴포넌트를 쓰는 구직자 탐색)에서 노출되는 채용 카드들이 섹션마다
크기가 제각각이다.

- `스페셜 채용`: `grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4` — 큰 화면에서 4열이라 카드 폭이 더 좁아진다.
- `급구 채용` / `추천 채용`: `grid grid-cols-2 md:grid-cols-3` — 최대 3열.
- `전체 공고`: `DenseJobRow`(가로 리스트 행)로, 카드가 아닌 완전히 다른 레이아웃.

결과적으로 같은 화면에서 스페셜 카드만 큰 화면에서 좁아지고, 전체 공고는 다른 컴포넌트라
시각적으로 통일감이 없다.

또한 `public-marketplace.tsx` 본문 컨테이너와 공유 헤더(`responsive-shell.tsx`)에
`max-w-[1180px]` 같은 임의 고정값이 박혀 있다. 프로젝트 표준(Tailwind 표준 스케일)에 맞춰
`max-w-7xl` 같은 유연한 유틸로 바꾸려 한다.

참고로 사용자가 제공한 외부 카드 예시(가로 커버 + 회사명 + 지역 배지 + 급여/프로모션 배지)는
"카드가 이런 식으로 구성된다"는 맥락 참고용이며, 내부 레이아웃을 그대로 복제하지 않는다.

## 2. 목표

- 4개 섹션(`스페셜`/`급구`/`추천`/`전체 공고`)의 카드 크기·폭·높이를 통일한다.
- 카드 그리드를 한 곳에서 관리해 향후 섹션별 드리프트를 방지한다.
- `전체 공고`를 카드 레이아웃으로 전환해 4섹션 모두 동일 카드 컴포넌트를 쓰게 한다.
- 고정 `max-w-[1180px]`를 Tailwind 표준 스케일 `max-w-7xl`(1280px)로 바꾼다.

## 3. 비목표

- 카드 내부 디자인(가로 커버 등) 리뉴얼 — 별도 범위로 보류.
- DB 마이그레이션, 새 promotion tier, API 변경.
- `1180px`를 쓰는 다른 화면 전체 일괄 변경 (seeker-marketplace, seeker-chat-room 등은 범위 밖).
- 새 시각 효과/애니메이션 추가.

## 4. 설계

### 4.1 카드 그리드 통일 (`visual-job-exposure-sections.tsx`)

4개 섹션이 동일한 그리드 클래스를 공유하도록 단일 상수로 추출한다.

```
grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4
```

- 스페셜의 `2xl:grid-cols-4` 단독 분기를 제거하고, 모든 섹션이 동일 그리드를 쓰게 한다.
  → 모든 섹션의 카드 폭이 동일 breakpoint에서 같아진다.
- `전체 공고`(organic)를 `DenseJobRow` 대신 `VisualJobCard`로 렌더한다.
- 그리드 클래스를 컴포넌트 내 상수 한 곳에서 정의해 재사용한다.

### 4.2 VisualJobCard organic 톤 + 선택 상태 (`visual-job-card.tsx`)

- `tone` 유니온에 `"organic"`을 추가한다: `tone: "organic" | "recommended" | "special" | "urgent"`.
- `toneClassName.organic = "border-border bg-card"` (중립 톤).
- `toneLabel.organic = "최신"` (전체 공고 = 최신순). 배지 라인은 기존
  `job.promotionLabel ?? toneLabel[tone]` 구조를 그대로 유지한다.
- `전체 공고`가 잃게 되는 "선택된 공고 하이라이트"를 보존하기 위해 optional `active?: boolean`
  prop을 추가한다. active일 때 `DenseJobRow`와 동일한 코럴 ring
  (`border-coral-400 ring-2 ring-coral-100`)을 적용한다.
- 카드 골격(`min-h-[148px]`, 패딩, 정보 배치)은 변경하지 않아 높이도 전 섹션 일치한다.

### 4.3 DenseJobRow 제거

`전체 공고`가 카드로 전환되면 `DenseJobRow`는 미사용이 된다. `dense-job-row.tsx`를 삭제하고
관련 테스트 블록도 제거한다. (`grep` 결과 사용처는 `visual-job-exposure-sections.tsx`와
테스트뿐이다.)

### 4.4 유연한 max-w

- `public-marketplace.tsx`의 본문 컨테이너 `max-w-[1180px]` → `max-w-7xl`.
- `responsive-shell.tsx`의 데스크톱 헤더 `max-w-[1180px]`는 **public 변형일 때만** `max-w-7xl`로,
  그 외(seeker/employer/moderator)는 `max-w-[1180px]`를 유지한다. (variant 기반 분기)
  → public 홈에서 헤더와 본문이 1280px로 정렬되고, 다른 화면 정렬은 깨지지 않는다.
- `dvh`는 높이 단위라 너비에는 적용하지 않는다.

## 5. 영향 파일

- `apps/web/src/components/bambi/visual-job-exposure-sections.tsx` (수정)
- `apps/web/src/components/bambi/visual-job-card.tsx` (수정)
- `apps/web/src/components/bambi/screens/public-marketplace.tsx` (수정)
- `apps/web/src/components/bambi/responsive-shell.tsx` (수정)
- `apps/web/src/components/bambi/dense-job-row.tsx` (삭제)
- `apps/web/src/components/bambi/visual-job-components.test.ts` (수정)

## 6. 검증

- `pnpm --filter web test` (또는 vitest) — 갱신된 source-level 테스트 통과.
- `pnpm run check-types`.
- `pnpm run check` (ultracite/biome).
- `pnpm --filter web build`.
- 브라우저 확인: `/`에서 4개 섹션 카드 폭/높이가 동일한지, 큰 화면(xl/2xl)에서 스페셜이
  다른 섹션과 같은 열 수인지, 헤더와 본문이 1280px로 정렬되는지, 선택 카드 하이라이트가
  유지되는지, cover image 없는 fallback이 깨지지 않는지.

## 7. 승인 기준

- 4개 섹션 카드의 폭·높이가 모든 breakpoint에서 통일된다.
- 그리드 클래스가 단일 출처에서 관리된다.
- 고정 `max-w-[1180px]`가 public 홈 경로에서 `max-w-7xl`로 바뀌고 다른 화면 정렬은 그대로다.
- 데드코드(`DenseJobRow`)가 남지 않는다.
- 모든 검증 명령이 통과한다.

## 8. 후속 개선 (2026-06-30 추가) — 가로형 카드 + 유동 폭

초기 구현(4섹션 동일 콤팩트 카드 + `max-w-7xl`) 적용 후, 좁은 구간에서 카드가 짜부되어
제목이 잘리고 `whitespace-nowrap`인 Badge가 카드 밖으로 삐져나오는 문제가 확인됐다.

근본 원인: 고정 `grid-cols-N`이 가용 폭 대비 카드를 ~150–165px로 강제. 특히
(a) 폰(<640px)의 `grid-cols-2`, (b) xl(≥1280px)에서 필터 사이드바(236px)+선택 패널(292px)이
중앙 열을 ~664px로 압축한 상태의 `grid-cols-4`.

사용자 결정에 따라 두 가지로 해결한다.

### 8.1 콘텐츠 폭 기반 auto-fill 그리드

`CARD_GRID_CLASS`를 고정 열 수에서 콘텐츠 폭 기반으로 변경한다.

```
grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3
```

→ 카드는 항상 ≥340px가 보장되고, 가용 폭만큼만 열이 생긴다(좁으면 1열, 넓으면 2–3열).
모든 섹션이 동일 규칙으로 유연하게 채워진다.

### 8.2 가로형(landscape) 카드

`VisualJobCard`를 세로형 콤팩트 카드에서 **가로형 카드**로 재설계한다.
- 좌측: 커버 이미지(80px, `size-20`) 또는 이니셜 fallback.
- 중앙: 배지 행 + 제목(`line-clamp-2`) + 급여 + (위치 · 연락처 보호) — `flex flex-col`, `min-w-0`.
- 우측: `채팅` 버튼(`shrink-0`, 세로 중앙).
- `min-h-[148px]` 제거(콘텐츠가 높이를 결정). 톤/배지/검수/연락처 보호 신호는 유지.

### 8.3 유동 컨테이너 폭

`max-w-7xl`(1280px 고정)을 뷰포트 비례 유동 폭으로 변경한다.
(`dvh`는 높이 단위라 부적합 → 너비용 `dvw` 사용.)

```
max-w-[min(92dvw,1600px)]
```

- `public-marketplace.tsx` 본문 컨테이너, `responsive-shell.tsx` 헤더(public 변형만)에 적용.
- 큰 모니터에서 화면을 더 쓰되 1600px 상한으로 울트라와이드 과확장을 막는다.

### 8.4 검증 (8장 기준)

`pnpm exec vitest run .../visual-job-components.test.ts`(auto-fill 그리드·유동 폭 회귀 가드 추가),
`pnpm --filter web check-types`, `pnpm --filter web build` 모두 통과. 브라우저에서 카드 잘림·삐져나옴
해소 및 헤더/본문 정렬 확인.

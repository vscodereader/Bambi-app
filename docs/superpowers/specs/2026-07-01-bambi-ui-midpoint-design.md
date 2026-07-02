# 밤비 UI 중간지점 리파인 — 디자인 스펙

- **일자:** 2026-07-01
- **목표:** 이번 주 금요일 발주자(30~40대 남성) 데모. seeker·employer·온보딩 풀 데모(C).
- **중간지점 방향:** **B (밀도·등급 이식)** — 밤비의 깔끔한 코럴/라운드 골격은 유지하되,
  레퍼런스 `queenalba.net`의 "장사 되는 DNA"(공고 밀도↑, 유료 등급 시각화, HOT/신규/당일 마커,
  일급/시급 가격 강조, 지역 필터)를 세련된 형태로 이식.
- **폴백 경로:** 발주자가 B를 과하다고 느끼면 **A (밤비 유지 + 신뢰도만 강화)**로 전환.
  A 전환 시: 마커 제거(HOT/오늘면접/신규), 가격 강조 톤다운, 등급 섹션 액센트 바 제거,
  카드 밀도 원복. 아래 각 변경은 **추가(additive)·되돌리기 쉬운** 형태로 구현해 A 복귀가 저렴하도록 한다.

## 핵심 인사이트

밤비는 이미 등급 시스템(`promotionTier: premium/recommended/standard`)과 4개 노출 섹션
(스페셜/급구/추천/전체)을 갖고 있다 — 구조는 그대로 두고 **시각 다이얼만** queenalba 쪽으로 돌린다.
데이터 모델·섹션 로직은 건드리지 않는다(마커·가격 강조는 기존 필드에서 파생). → 저위험·고가역성.

## 변경 범위 (우선순위)

### P0 — 마켓플레이스 카드 (발주자 "장사 되는 느낌"의 80%)
- **파일:** `apps/web/src/components/bambi/visual-job-card.tsx`
- **가격 강조:** `pay` 문자열을 단위(시급/일급/급여/월급)와 금액으로 분리 렌더.
  금액을 카드의 시각적 앵커로 — extrabold + 코럴/ink 강조, 단위는 작게 muted.
  (`"시급 18,000원"` → `시급`(2xs muted) + `18,000원`(base extrabold coral-600))
- **마커(기존 필드 파생, 스키마 변경 없음):**
  - `tone === "urgent"` → **HOT** (danger/빨강)
  - `tags`에 "오늘 면접" 포함 → **오늘면접** (success/초록)
  - `featured === true` → **신규** (primary/코럴)
  - 티어 라벨 배지(스페셜/급구/추천/최신)는 유지 — 마커는 그 위 긴급/혜택 레이어.
- **밀도:** 카드 간격·패딩 소폭 타이트. 초광폭에서 `2xl:grid-cols-4` 추가.

### P0 — 등급 섹션 헤더 (유료 등급 사다리 가독화)
- **파일:** `apps/web/src/components/bambi/visual-job-exposure-sections.tsx`
- 각 섹션(스페셜/급구/추천/전체) 제목 앞에 색 액센트 바 + 아이콘으로
  queenalba의 우대/프리미엄/스페셜 밴드 느낌을 클린하게 재현.
  스페셜=코럴, 급구=amber, 추천=sky, 전체=gray.

### P1 — 필터·디스커버리 지역 강조 (여유되면)
- **파일:** `apps/web/src/components/bambi/marketplace.tsx`
- 지역을 가로 퀵칩 행으로 노출(queenalba 지역별채용). 현재 Select 드롭다운 보조.

### P2 — 온보딩·인증·구인자 톤 일관성 (여유되면)
- 풀 데모 일관성 위해 안전/검증 문구·톤만 정합. 구조 변경 없음.

## 준수 규칙
- `apps/web/CLAUDE.md`: shadcn 컴포넌트 + Tailwind 전용, 인라인 style 금지,
  시맨틱/브랜드 토큰(`bg-coral-500`·`text-muted-foreground` 등), Badge는 `ds.tsx`의 `Badge`,
  반경 언어(배지=full, 카드·컨트롤=lg). 커밋 전 `pnpm dlx ultracite fix`.

## 검증
- `pnpm --filter web build` 또는 dev 서버 기동 + 마켓플레이스 스크린샷으로 육안 확인.

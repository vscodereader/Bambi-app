# 채용 페이지 고정폭 전환 + 양 사이드/상단 광고 배너 (목업)

- 이슈: #19 `feat: 채용 페이지 고정폭 전환 및 양 사이드 광고 배너, 필터 버튼 위에 프리미엄 광고 섹션(목업) 추가`
- 날짜: 2026-07-08
- 브랜치: `worktree-issue-19-seeker-fixed-width-banners`

## 배경

채용 목록·상세·헤더가 현재 뷰포트 비례 유동폭(`md:max-w-[80%]`)을 쓴다. 이를
계산형 고정폭으로 전환하고, 확보된 좌우 여백에 세로 광고 배너를, 목록 상단에
가로 프리미엄 광고 섹션을 목업으로 추가한다. 폭 컨벤션이 테스트로 강제되므로
관련 기대값도 함께 갱신한다.

### 현재 구조 (확인 완료)

- 목록: `screens/seeker-marketplace.tsx` — 컨테이너 `md:max-w-[80%]`, 좌측 `aside w-[236px]`(필터) + 본문 `flex-1`
- 상세: `screens/seeker-job-detail-responsive.tsx` — 컨테이너 `md:max-w-[80%]`, 본문 + 우측 320px CTA `aside`
- 헤더: `responsive-shell.tsx` `ResponsiveAppShell` — 헤더 폭 `max-w-[80%]` **하드코딩**, employer/moderator/public/seeker 전역 공용
- shell 체인: `/seeker/*` 전 라우트가 `SeekerLayout → SeekerAppShell → ResponsiveAppShell` 단일 헤더 공유
- 카드: `visual-job-card.tsx` — **가로형**(커버 `w-32 h-16` 좌 + 텍스트 우), 하단 급여 pill + 채팅
- 그리드: `visual-job-exposure-sections.tsx` — `grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4`
- 폭 강제 테스트: `visual-job-components.test.ts`
  - line 48: `seeker-marketplace`가 `max-w-[80%]` 포함 assert → **갱신 대상**
  - line 73/85: `public-marketplace`/`page-shell`의 `max-w-[80%]` → 범위 밖, 그대로 유지
  - line 38/39: `lg:grid-cols-3` 포함 + `2xl:grid-cols-4` 부재 → 유지해야 통과

## 확정된 결정 (사용자 승인)

1. **콘텐츠 고정폭**: `md:max-w-[min(92%,1120px)]` (배너 우선 — 일반 데스크톱에서도 여백 확보)
2. **헤더 폭**: 공통 폭 토큰/컨테이너로 일원화, 채용 경로에만 적용 (범위 안전)
3. **배너 목업**: 단순 플레이스홀더, shadcn `Card` 기반, 정적(이미지 없음)
4. **카드 4열**: 데스크톱 기본 한 행 4개. 필터 사이드바(236) 유지 + 우측 카드 영역(~864px) 4열 → 카드 ~207px
5. **카드 레이아웃**: **가로형 유지**(무조건), 커버 이미지 축소, **shortDesc(설명 줄) 제거**

## 설계

### 1. 공통 폭 토큰 — `lib/bambi/layout.ts` (신규)

```ts
// 채용(seeker) 페이지 공통 콘텐츠 폭. 헤더·목록·상세가 이 상수를 공유해 폭 기준을 정렬한다.
// 임의 단독 px 금지 컨벤션 준수 — min() 계산형.
export const SEEKER_CONTENT_WIDTH = "md:max-w-[min(92%,1120px)]";
```

헤더·목록·상세가 이 한 상수를 참조 → 폭 자동 정렬.

### 2. 헤더 폭 주입 — `responsive-shell.tsx` / `seeker-app-shell.tsx`

- `ResponsiveAppShell`에 `contentWidthClassName?: string` prop 추가, **기본값 `max-w-[80%]`**.
  데스크톱 헤더 `<div className="... max-w-[80%] ...">` 및 `<main>`의 폭을 이 prop로 대체.
- `SeekerAppShell`에서 pathname이 `/seeker`(목록) 또는 `/seeker/jobs/`로 시작(상세)일 때만
  `SEEKER_CONTENT_WIDTH`(의 `max-w` 부분)를 전달. 그 외(seeker 채팅·내정보, public/employer/moderator)는 기본 80% 유지.
- **효과**: 채용 목록·상세만 헤더=본문 정렬. 나머지는 기존 80% 그대로 → 헤더-본문 어긋남 없음.
  `public-marketplace`·`page-shell` 테스트도 그대로 통과.

### 3. 카드 재디자인 — `visual-job-card.tsx`

가로형 유지, ~207px 폭에 맞춘 컴팩트화.

- 커버 이미지 `w-32 h-16`(128×64) → **정사각 축소**(예: `size-14`), 폴백 블록도 동일 축소
- **shortDesc 제거**: `<p>{shortDesc}</p>` 줄 삭제 + `truncateDesc`/`DESC_MAX_LENGTH`/`shortDesc` 관련 코드 제거
- 남는 정보: 회사명(truncate) · 위치·업종(truncate) · 하단 급여 pill + 채팅 버튼
- HIT 리본, tone 테두리, active 링, 급여 split, 배지 톤 로직은 유지
- 좁은 폭에서 하단 급여 pill + 채팅 버튼이 겹치지 않게 여백/사이즈 재조정 (필요 시 버튼 아이콘만/축소)

### 4. 카드 그리드 — `visual-job-exposure-sections.tsx`

- `lg:grid-cols-3 xl:grid-cols-4` 유지 (테스트 호환 + 1120px xl 뷰포트에서 4열)
- gap: 좁아진 카드에 맞춰 `gap-3` 유지(필요 시 `gap-2.5` 미세조정)
- 실제 렌더에서 3열/4열 깨짐이 없는지 사용자 시각 확인 필요

### 5. 목록 화면 — `screens/seeker-marketplace.tsx`

레이아웃(위→아래, 좌→우):

```
[ 상단 프리미엄 가로 배너 섹션 ]        ← 필터/탭 위, 데스크톱·모바일 모두
1120px 콘텐츠:
  [필터 사이드바 236]   [카드 그리드 4열 (~864px)]
  [필터 아래 세로 배너]
1120px 바깥 우측 여백:
  [세로 배너 rail]  ← sticky, 뷰포트 여유 있을 때만(xl+), hidden 이하
```

- 컨테이너 폭 `md:max-w-[80%]` → `SEEKER_CONTENT_WIDTH`
- 최상단에 `<PremiumAdBannerSection />` 삽입 (line 50~51, 필터 영역 앞)
- 좌측 `aside`(필터) 하단에 `<AdBannerRail side="left" />` 추가
- 우측 세로 배너는 1120px **콘텐츠 바깥 여백**에 배치(콘텐츠를 좁히지 않기 위해).
  구현: 컨테이너를 감싸는 relative wrapper + 우측 여백에 `absolute`/여백 컬럼 `sticky`,
  `hidden xl:block`. (좁은 화면은 숨김) — 정확한 앵커 방식은 구현 단계에서 확정.

### 6. 상세 화면 — `screens/seeker-job-detail-responsive.tsx`

- 컨테이너 폭 `md:max-w-[80%]` → `SEEKER_CONTENT_WIDTH`
- 기존 `lg:grid-cols-[minmax(0,1fr)_320px]`(본문+CTA) 유지
- 좌·우 콘텐츠 바깥 여백에 세로 배너 `sticky`, `hidden xl:block`

### 7. 신규 배너 컴포넌트 (shadcn `Card` 기반, 정적 플레이스홀더)

- **`components/bambi/ad-banner.tsx`**
  - `AdBanner` — 세로형 단일 배너 카드(공고 카드 유사 사이즈, 폭 `w-[236px]`). "광고" 배지 +
    회사 로고 자리(플레이스홀더 블록) + 카피 텍스트. 이미지 없음.
  - `AdBannerRail` — 배너 2개 세로 스택, `sticky top-20`, `hidden lg:block`/`xl:block`.
    props로 개수/노출 브레이크포인트 조절.
- **`components/bambi/premium-ad-banner-section.tsx`**
  - `PremiumAdBannerSection` — 상단 가로 프리미엄 섹션. 가로 카드 **3개 고정 나열**
    (캐러셀 미도입 — shadcn carousel 추가 회피). 데스크톱·모바일 모두 노출(모바일은 1~2열/스택),
    "프리미엄" 강조 톤(coral).

### 8. 테스트 갱신 — `visual-job-components.test.ts`

- line 48: `seeker-marketplace`의 `max-w-[80%]` 기대 → 새 폭 문자열(`max-w-[min(92%,1120px)]`)로 갱신
- 카드에서 shortDesc 제거가 기존 assert를 깨지 않는지 확인
  (line 12~25는 `VisualJobCard`/tone/promotionLabel/Message/toneBadge 관련 — shortDesc 직접 assert 없음)
- `lg:grid-cols-3` 유지 / `2xl:grid-cols-4` 부재 유지 확인

## 배너 목업 규격 (기본값)

- 세로 배너: 좌 2개 / 우 2개, 폭 `w-[236px]`, `sticky top-20`
- 상단 프리미엄: 가로 3개 고정 나열
- 반응형: 세로 배너 데스크톱(xl+) 전용 / 상단 프리미엄 전 뷰포트

## 범위 밖 (후속)

- public/employer/moderator/seeker 채팅·내정보의 폭 정렬 — 이슈 범위 밖, 기존 80% 유지
- 실제 premium 캠페인 데이터 연동 — 지금은 목업

## 미해결 / 구현 중 확정

- 우측 세로 배너의 정확한 앵커 방식(absolute vs 여백 그리드 컬럼) — 콘텐츠 1120px를 좁히지 않는 선에서 구현 단계 확정
- 카드 하단 급여 pill+채팅 버튼의 ~207px 폭 내 정확한 사이즈/줄바꿈 처리 — 실제 렌더 확인(사용자 시각 검증)

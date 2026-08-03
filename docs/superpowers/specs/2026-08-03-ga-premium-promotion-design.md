# 순수 프리미엄 광고 배너 GA4 프로모션 계측 설계

2026-08-03 · 대상 브랜치: feat/region-biznum-role-ux · 작업 워크트리: ga-premium-promotion

## 목적

자체 가입 구인자가 프리미엄 광고 배너 상품을 구입해 등록한 공고(= 순수 프리미엄)의 배너
노출·클릭을 GA4 이커머스 프로모션 이벤트(`view_promotion` / `select_promotion`)로 계측해,
GA4 「보고서 > 수익 창출 > 프로모션」에서 슬롯별 조회수·클릭수·CTR을 볼 수 있게 한다.
크롤링으로 수집해 빈 칸을 채운 배너는 계측하지 않는다.

## 배경 (조사 결과 요약)

- GA4 프로모션은 공식 정의상 "internal promotions, such as banners" — 사이트 내부 배너
  슬롯 계측용으로 이 케이스에 정확히 부합한다. 내부 배너에 UTM을 붙이는 것은 금지 관행.
- GA4는 이미 연동돼 있다: `apps/web/src/app/layout.tsx`에 측정 ID `G-HNVZKKB0NX` 인라인
  gtag, `VERCEL_ENV === "production"`에서만 로드. 커스텀 이벤트 전송 코드는 현재 0건.
- 클라이언트 `AdBannerItem`(`apps/web/src/lib/bambi/api-job-mapper.ts`)에 `crawled: boolean`
  플래그가 이미 있어 순수/크롤링 구분에 서버 변경이 필요 없다.
- 프로모션 클릭→구매 전환 연결은 GA4가 자동으로 해 주지 않으며, 우리 구조(배너를 보는
  구직자는 구매 주체가 아님)에서는 해당 없음 — 노출·클릭 계측이 자연스러운 전체 범위다.

## 범위

### 계측 대상 슬롯

`useAdBannerJobs()`가 내려주는 배너 슬롯 중 **`crawled === false`인 실제 결제 공고 칸만**.
크롤링 채움 칸·빈 칸(자리표시)은 이벤트 자체를 보내지 않는다.

| 지면 | 컴포넌트 | 슬롯 |
|---|---|---|
| 채용정보 마켓플레이스(`/seeker`) | `PremiumAdBannerSection` (중앙 가로 3칸) | `seeker_center_1..3` |
| 〃 | `HorizontalAdBannerRail` (좌 rail 3칸, ≥1720px) | `seeker_left_1..3` |
| 〃 | `AdBannerRail` (우 rail 세로 3칸, ≥1720px) | `seeker_right_1..3` |
| 커뮤니티 홈 | `PremiumAdBannerSection` (중앙 가로 3칸) | `community_center_1..3` |

### 하지 않는 것

- 구매/전환 연결(add_to_cart·purchase 축) — 해당 없음
- 리스팅 섹션(스페셜·급구·추천) 계측 — 요청 범위 밖
- 서버 사이드 `job_performance_event` 파이프와의 통합 — 별개 축 유지
- GA 측정 ID의 env 이관, `@next/third-parties`/GTM 도입 — 범위 밖(기존 인라인 gtag 재사용)
- native 앱 화면 — 미반영(웹 전용)

## 이벤트 설계

- 이벤트 레벨(공통): `promotion_id: "premium-banner"`, `promotion_name: "프리미엄 배너"`
- item 레벨(카드별): `item_id`(공고 ID), `item_name`(공고 제목),
  `creative_slot`(`지면_레일_순번`, 예: `seeker_left_2`), `index`(슬롯 순번 0-base).
  GA 스펙상 item 레벨 값이 이벤트 레벨을 덮어쓰므로 슬롯 구분은 item 레벨에 싣는다.
- `view_promotion`: 카드가 뷰포트에 50% 이상 들어온 시점에 그 카드 1개를 items로 전송.
  마운트당 공고 ID 기준 1회(dedupe), 라우트 이동 후 재방문 시 다시 1회. 페이지당 최대
  12칸이라 배칭 없이 카드 단위 전송으로 충분하다.
- `select_promotion`: 카드 클릭 시 해당 카드 1개를 items로 전송 후 기존 내비게이션 진행
  (gtag는 내부 큐잉이라 전송 대기 없이 즉시 이동해도 된다).

## 구현 구성 (웹 전용, 서버·DB 무변경)

1. **GA 헬퍼** `apps/web/src/lib/bambi/ga.ts` (신규)
   - `trackPromotionView(item)` / `trackPromotionSelect(item)` — `window.gtag`가 없으면
     no-op(프로덕션 외 환경·GA 차단 브라우저 자동 무시). 파라미터 조립을 한곳에 모은다.
2. **노출 훅** — IntersectionObserver `threshold: 0.5`, 관측 즉시 `unobserve` + 공고 ID
   Set으로 마운트당 1회 보장. reduced-API 환경(observer 부재)에서는 조용히 건너뛴다.
3. **배너 컴포넌트 연결** — `ad-banner.tsx`의 가로/세로 배너 카드에 슬롯 라벨을 내려주는
   prop을 추가하고, 위 4개 컨테이너(마켓플레이스 3곳·커뮤니티 홈 1곳)에서 지면·레일
   접두어를 전달. `crawled` 카드와 자리표시는 prop을 주지 않아 계측이 꺼진다.

## 오류 처리

- gtag 부재·초기화 이전 호출: 헬퍼가 no-op — 앱 동작에 영향 0.
- 계측 코드는 렌더·내비게이션 경로에 예외를 전파하지 않는다(전송 실패는 무시).

## 테스트 / 완료 기준

- vitest: GA 헬퍼(파라미터 shape, gtag 부재 시 no-op), crawled/빈 슬롯 제외 판정.
- `check-types` + ultracite 통과. 시각·실전송 확인은 배포 후 GA4 DebugView/실시간
  보고서에서 사용자가 확인(프로덕션에서만 gtag가 로드되므로 로컬 실전송 검증은 범위 밖).

# 광고등록 안내(구인자 광고 상품 안내) 페이지 설계

**작성일**: 2026-07-08
**브랜치**: `feat/ad-registration-guide` (base: `feat/seeker-page-fixed-width-ad-banners`)
**레퍼런스**: 여우알바(foxalba) 광고등록 안내 페이지 — 3단계 광고 상품(박스/HOT/줄광고)을
[노출위치 | 서비스내용 | 비용 | 신청] 표로 안내.

## 목표

구인자(광고주)가 공고를 더 많은 여성 구직자에게 노출하기 위한 **유료 광고 상품(프로모션 등급)을
안내**하는 페이지를 신설한다. 레퍼런스의 정보 구조를 밤비 shadcn·코럴 디자인으로 재해석한다.

## 핵심 결정(사용자 확정)

1. **레이아웃**: 레퍼런스형 가로 행. 등급별 섹션을 세로로 쌓고, 각 섹션은
   `[노출 위치 미리보기 | 서비스(혜택) | 기간별 가격 | 신청]` 4영역으로 구성. 모바일은 세로 스택.
2. **노출 위치 미리보기**: 간단한 다이어그램(마켓플레이스 목록을 축약한 막대 스택 + 해당 등급 슬롯
   강조) + 설명 텍스트. 실제 목업 재사용 아님(경량).
3. **가격**: 30/60/90일 기간별 가격표. 코드에 광고비 데이터가 없으므로 **페이지 상수로 신규 정의**
   (레퍼런스 금액을 초기 플레이스홀더로 사용, 추후 실값 교체).

## 등급 매핑

백엔드 `promotionTier`(`packages/api/src/services/bambi-promotions.ts`): `premium/recommended/standard`
= 라벨 `프리미엄/추천/일반`. 레퍼런스 3상품과 1:1 대응.

| 상품(밤비)   | tier         | 레퍼런스 대응   | accent   |
| ------------ | ------------ | --------------- | -------- |
| 프리미엄 광고 | premium      | 박스광고        | coral    |
| 추천 광고     | recommended  | HOT광고         | sky      |
| 일반 광고     | standard     | 일반 줄광고     | gray/muted |

노출 톤은 마켓플레이스 시각화(`visual-job-exposure-sections.tsx`)와 정합: premium=coral-500,
recommended=sky-400, standard=gray-300.

## 콘텐츠(밤비 카피 — 여우알바 고유 용어 제거)

밤비의 실제 노출·끌어올림(boost) 개념으로 치환. 점프/으뜸알바 등 여우알바 용어는 쓰지 않는다.

### 프리미엄 광고 (premium) — coral
- 태그라인: "가장 빠른 노출, 메인 최상단 고정"
- 노출 위치: 메인 최상단 · 스페셜 채용 슬롯(다이어그램 최상단 강조)
- 혜택: 메인 상단 프리미엄 슬롯 고정 노출 / 스페셜 채용 배지 / 지역·직종 상단 추천 노출 /
  자동 끌어올림 1일 8회 / 수동 끌어올림 1일 20회 / 구직자 열람 우선 노출
- 가격: 30일 330,000원 · 60일 620,000원 · 90일 890,000원

### 추천 광고 (recommended) — sky
- 태그라인: "합리적 비용, 두 배 노출 효과"
- 노출 위치: 메인 중단 · 추천 채용 슬롯(다이어그램 중단 강조)
- 혜택: 메인 중단 추천 슬롯 노출 / 추천 채용 배지 / 지역·직종 상단 추천 노출 /
  자동 끌어올림 1일 6회 / 수동 끌어올림 1일 10회 / 구직자 열람 노출
- 가격: 30일 230,000원 · 60일 430,000원 · 90일 620,000원

### 일반 광고 (standard) — muted
- 태그라인: "가장 저렴한 기본 노출"
- 노출 위치: 전체 공고 · 최신순 노출(다이어그램 하단 강조)
- 혜택: 전체 공고 목록 노출(최신순) / 구인정보 리스트 노출 / 수동 끌어올림 1일 5회 /
  구직자 열람 노출
- 가격: 30일 66,000원 · 60일 125,000원 · 90일 178,000원

## 페이지 구조

`PageShell`(title="광고 상품 안내", description="공고를 더 많은 여성 구직자에게 노출하는
유료 광고 상품을 안내해요.") 안에:

1. **문의 안내 Card** — 상단 안내(광고 등록 문의). 고객센터 안내 문구 + 등록 CTA(공고 등록으로 이동).
2. **광고 상품 섹션 3개** — 등급별로 Card 하나씩. 각 Card:
   - 헤더: 등급 Badge + 상품명 + 태그라인
   - 본문 4영역 그리드(`md:grid-cols-[...]`, 모바일 세로 스택):
     - 노출 위치: `AdPlacementDiagram`(막대 스택 + 강조) + 캡션
     - 서비스: 혜택 목록(lucide `Check` + 등급 accent), 넓은 화면 2열
     - 가격: 30/60/90일 금액 리스트
     - 신청: `Button` → `/employer/new`(공고 등록)로 이동

## 파일

- **신규** `apps/web/src/lib/bambi/ad-products.ts` — `AdProduct` 타입 + `AD_PRODUCTS` 상수(등급·카피·혜택·가격·다이어그램 파라미터).
- **신규** `apps/web/src/components/bambi/ad-placement-diagram.tsx` — 노출 위치 미니 다이어그램(막대 N개 중 하나 강조, 등급 톤).
- **신규** `apps/web/src/components/bambi/screens/employer-ad-guide.tsx` — 화면 본체("use client", 상품 섹션 렌더 + 신청 라우팅).
- **신규** `apps/web/src/app/employer/ad-guide/page.tsx` — 라우트, `PageShell` 래핑.
- **수정** `apps/web/src/app/employer/layout.tsx` — `EMPLOYER_NAV_ITEMS`에 "광고 안내" 추가.
- **수정** `apps/web/src/app/employer/page.tsx` — 대시보드 `quickLinks`에 "광고 상품 안내" 타일 추가.
- **테스트** `apps/web/src/components/bambi/visual-job-components.test.ts`(또는 신규) — 상품명·가격·신청 버튼·다이어그램·nav 항목 소스 검증.

## 디자인 규칙 준수

- shadcn 컴포넌트 직접 사용(employer 실서비스 관행), 인라인 style 금지.
- 시맨틱/브랜드 토큰만(coral·sky·muted), 임의 px 금지 — Tailwind 스케일.
- primary 버튼은 각 상품의 "신청" 한 곳(주요 액션)에만. 내비/보조는 secondary.
- 데스크톱·모바일 반응형 필수.

## 범위 밖(YAGNI)

- 실제 결제·프로모션 생성 연동(신청 버튼은 공고 등록 라우트로만 이동).
- 광고비 백엔드 모델/DB 필드(가격은 프런트 상수).
- 포털 로고(NAVER/Google 등)·마스코트 등 레퍼런스 장식 요소.

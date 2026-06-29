# Bambi Visual Job Exposure UI/UX Design

작성일: 2026-06-29

## 1. 배경

Bambi Web은 2026-06-29 기준으로 1차 MVP, Post-MVP Web 확장, Foxalba-informed Web 반영, Web 최종 QA를 완료했다. 이후 작업은 기존 미완료분이 아니라 새 Web 추가 기능과 UI/UX 개선으로 분리한다.

사용자가 제공한 Queenalba PC 웹 캡처는 고객이 원하는 채용정보 노출 방향을 보여준다. 핵심은 정돈된 일반 리스트보다 `채용 광고가 많이 보이고 강하게 노출되는 화면`이다.

## 2. 목표

구직자 탐색 화면과 공개 홈에서 채용정보가 더 많이, 더 강하게, 더 상품화된 형태로 보이도록 개선한다.

목표는 다음과 같다.

- 한 화면에서 공고가 더 많아 보이게 한다.
- 대표 이미지/텍스트 로고가 있는 공고를 더 적극적으로 노출한다.
- `프리미엄`, `스페셜`, `급구`, `추천`, `전체` 같은 섹션 차이를 명확히 만든다.
- 기존 안전/검수/연락처 보호 신뢰 신호는 유지한다.
- Queenalba의 광고형 구조는 참고하되, 과도한 네온 배너 UI는 복제하지 않는다.

## 3. 비목표

이번 개선에서 제외한다.

- 새로운 결제 provider 연동
- 새로운 promotion tier DB enum 추가
- 사이드 고정 배너 광고
- 깜빡임, 자동 재생, 과도한 시각 효과
- HTML 자유 편집 확대
- Native App 화면 반영

## 4. UX 방향

현재 Bambi marketplace는 `premium`, `recommended`, `organic` 섹션을 리스트 중심으로 표시한다. 이번 개선은 이 데이터를 더 시각적인 노출 그룹으로 재배치한다.

권장 정보 구조:

1. `스페셜 채용`
   - `premium` 공고 중 cover image가 있거나 최근 boost된 공고를 4~5열 compact grid로 표시한다.
   - PC에서는 화면 상단에서 광고 상품처럼 보이게 한다.
   - 모바일에서는 2열 grid 또는 가로 스크롤 row로 표시한다.

2. `급구 채용`
   - `lastBoostedAt`이 최근인 promoted 공고를 표시한다.
   - 별도 DB 상태가 없으므로 1차에서는 최근 boost를 급구 신호로 해석한다.
   - 라벨은 `방금 끌어올림`, `급구`처럼 사용자에게 이해 가능한 문구를 사용한다.

3. `추천 채용`
   - `recommended` 공고를 compact card 또는 dense row로 표시한다.
   - 기존 추천 섹션보다 이미지와 급여를 더 앞에 둔다.

4. `전체 공고`
   - organic 공고는 현재 dense list를 유지하되 카드 높이와 정보 배치를 조금 더 압축한다.
   - 안전 배지와 검수 라벨은 유지한다.

## 5. 화면별 설계

### 공개 홈 `/`

공개 홈은 첫인상 화면이다. 상단에서 바로 채용정보가 보이도록 `스페셜 채용` compact grid를 배치한다. 검색과 빠른 필터는 유지하되, 마케팅 문구보다 공고 노출을 우선한다.

### 구직자 탐색 `/seeker`

구직자 탐색은 실제 탐색 화면이다. 검색/탭 아래에 `스페셜 채용`, `급구 채용`, `추천 채용`, `전체 공고` 순서로 표시한다.

PC 레이아웃:

- 좌측 필터 sidebar 유지
- 중앙 main column에 visual exposure sections 배치
- 우측 selected job panel 유지
- compact grid는 4열을 기본으로 하되 container 폭에 따라 3열로 줄인다.

모바일 레이아웃:

- 필터 버튼과 검색 유지
- `스페셜 채용`은 2열 card grid
- `급구 채용`과 `추천 채용`은 가로 스크롤 row 또는 2열 grid
- `전체 공고`는 dense row list

### 구인자 공고 등록/수정

구인자에게는 대표 이미지가 목록에서 어떻게 보이는지 미리보기를 제공한다. 기존 이미지 업로드와 블록형 상세 편집기는 유지하고, 목록 노출 preview만 추가한다.

## 6. 컴포넌트 설계

새 UI는 기존 `apps/web/src/components/bambi/marketplace.tsx`가 너무 커지지 않도록 하위 컴포넌트로 분리한다.

권장 컴포넌트:

- `VisualJobExposureSections`
  - marketplace section 데이터를 받아 `스페셜`, `급구`, `추천`, `전체` 표시 순서를 결정한다.
- `VisualJobCard`
  - Queenalba식 광고형 노출을 밤비 톤으로 번역한 compact card다.
  - cover image, company, title, location, pay, promotion label, verification label을 표시한다.
- `DenseJobRow`
  - 기존 `ResponsiveJobCard`의 정보를 더 압축한 row다.
- `EmployerListingPreview`
  - 공고 등록/수정 화면에서 대표 이미지와 제목이 목록에 어떻게 보이는지 보여준다.

## 7. 데이터 설계

1차에서는 DB 마이그레이션 없이 기존 데이터를 사용한다.

사용 데이터:

- `sections.premium`
- `sections.recommended`
- `sections.organic`
- `coverImage`
- `promotionTier`
- `promotionLabel`
- `lastBoostedAt`
- `verified`
- `pay`
- `location`

파생 그룹:

- `special`: `premium` 공고 전체
- `urgent`: `premium`과 `recommended` 중 `lastBoostedAt`이 있는 공고를 최신순으로 최대 6개
- `recommended`: 기존 `recommended`
- `organic`: 기존 `organic`

`urgent`는 실제 급구 상품이 아니라 boost 기반의 시각 노출 그룹이다. UI 문구는 이 점을 감안해 `급구/끌어올림`으로 표시한다.

## 8. 접근성과 안전성

- 모든 이미지에는 의미 있는 `alt`를 사용한다.
- 카드 전체는 버튼 또는 링크로 접근 가능해야 한다.
- promotion label은 색상만으로 구분하지 않고 텍스트를 함께 표시한다.
- 연락처 보호, 검수 완료, 인증 완료 신호는 compact card에서도 유지한다.
- 모바일에서 가장 긴 지역명, 업체명, 급여 문구가 겹치지 않아야 한다.

## 9. 테스트와 검증

필수 검증:

- 파생 섹션 helper 테스트
- `VisualJobCard` 렌더링 테스트 또는 source-level regression test
- `pnpm run check-types`
- `pnpm run check`
- `pnpm --filter web build`
- Playwright 또는 브라우저 smoke로 `/`와 `/seeker` desktop/mobile 확인

브라우저 확인 포인트:

- PC 첫 화면에 기존보다 더 많은 공고가 보이는지
- 모바일 2열 card에서 텍스트 겹침이 없는지
- cover image 없는 공고 fallback이 깨지지 않는지
- promotion label과 verification label이 동시에 보이는지
- 선택된 공고 panel과 새 섹션 클릭 동작이 충돌하지 않는지

## 10. 승인 기준

이 디자인은 다음 기준을 만족하면 통과로 본다.

- Queenalba의 `광고형 채용 노출` 요구를 Bambi 톤으로 번역했다.
- 기존 promotion API와 job media 데이터를 재사용한다.
- 새 DB migration 없이 1차 UI 개선이 가능하다.
- Native App은 범위 밖으로 유지한다.
- 구현 전 plan에서 파일, 테스트, 브라우저 검증이 명확히 정의된다.

# Native 구직자 공고 탐색, 광고, 포인트 기능 설계

## 기준과 목표

브랜치: feat/native-seeker-marketplace-points
최초 기준: origin/mobile 64c11018

현재 mobile에는 스페셜, 급구, 추천, 전체 공고, 업종 필터, 검색, 페이지네이션과 누적 광고 기간 배지가 있다. 최신 develop과 비교해 빠진 광고 배너, HIT, 상세 필터, 포인트 공고 보상, 보유 혜택 사용을 독립 구현한다.

## 네이티브 기술 원칙

최신 develop 웹 공고 탐색과 포인트 화면의 기능, 표시 정보, 순서, 문구, 권한, 상태 전이와 예외 처리를 그대로 유지한다. 웹의 넓은 화면 전용 컨트롤은 기능을 제거하지 않고 native에서 접근 가능한 HeroUI Native BottomSheet로 옮긴다.

- Expo SDK 56, expo-router, HeroUI Native와 Uniwind만으로 화면을 구현한다.
- apps/web의 banner, marketplace, point component와 Tailwind CSS를 native에서 import하거나 복사하지 않는다.
- 기존 native의 ad-banner-slot-canvas, BambiScreen, JobListCard와 HeroUI Native BottomSheet를 우선 재사용한다.
- develop web은 서버 필드, 상태 전이, 슬롯 순서와 문구 비교에만 사용한다.
- 공유이 필요한 순수 규칙만 packages/api로 이동한다.

기존 포인트몰 상품 조회, 구매, 주문 취소와 포인트 내역은 유지하고 확장한다.

## 기존 구현과 재사용

- seeker home의 jobs.list infinite query와 섹션 병합
- JobListCard와 bambi-native 공고 매핑
- ad-banner-slot-canvas와 공유 ad banner layout
- regions.list와 native 지역 선택 패턴
- point-shop 화면, point-shop 순수 규칙, attendance 포인트 내역
- packages/api의 ad preview, job hit, pointJobRewards, pointShop 규칙

필터 값, 광고 슬롯, HIT 기준, 보상 포인트, 쿨다운, 혜택 적용 정책을 화면에 하드코딩하지 않는다.

## 구현 범위

### 모바일 광고 영역

- 서버의 고정 3칸 premium banner 배열을 공고 목록 상단에 표시
- 이미지 배경, 단색 배경, scrim과 문구 블록 렌더
- 소재 누락 시 공유 서비스의 cover 또는 빈 상태 폴백 사용
- 자체 공고와 수집 공고의 상세 경로 구분
- develop web의 모바일 배치와 같이 16:9 슬롯 3개를 세로 1열로 표시하고, null 슬롯도 운영 문의 placeholder로 유지
- 광고 노출과 클릭 계측은 기존 계약이 있을 때만 연결

### HIT 표시

- develop의 HIT 순수 판정을 공유 가능 위치에서 재사용
- 스페셜, 급구, 추천 섹션에만 표시
- organic, 수집 공고, 성과 데이터가 없는 공고에는 표시하지 않음
- detail view와 impressions 및 CTR 경계를 web과 일치

### 상세 필터

- 필터 버튼과 기본값에서 달라진 활성 조건 수 표시
- 기존 HeroUI Native BottomSheet 패턴의 필터 컨테이너에서 지역, 세부지역, 업종, 최소 시급 선택
- 인증 완료, 당일면접, 초보 가능 토글
- 현재 jobs.list 입력에는 regionCode, districtCode, minPayAmount와 industryCategory만 있고 세 boolean 필터는 없다.
- 페이지네이션된 첫 페이지 결과를 native에서 사후 필터링하지 않는다. 그러면 totalCount와 다음 페이지가 틀어지므로 jobs.list 입력과 자체 및 수집 공고 서버 필터에 onlyVerified, onlyToday, onlyBeginnerFriendly를 추가한다.
- web marketplace의 동일 필터도 공유 입력을 사용하도록 회귀 확인한다.
- 시도 변경 시 세부지역 초기화
- 적용 또는 초기화 시 첫 페이지로 이동
- filter query key 변경 중 기존 목록 유지와 로딩 표시
- 검색어 화면과 홈 상세 필터의 상태를 섞지 않음

### 포인트 공고

- pointJobRewards.getCurrent 조회
- 선택된 공고, 출처, 보상 포인트, 수령 가능 여부, 쿨다운 표시
- 자체 및 수집 공고 상세 이동
- claim 성공 후 현재 보상, 포인트 잔액, 출석 및 포인트 내역 갱신
- 이미 수령, 대상 교체, 비대상, 쿨다운 오류를 서버 코드로 구분
- 오래된 대상을 누른 경우 정본 재조회

### 보유 혜택 사용

- develop과 동일하게 이 기능은 구인자 역할에만 노출한다. job_seeker는 서버 resolvePurchase가 사용형 혜택 구매를 차단하므로 사용 UI도 표시하지 않는다.
- 현재 native의 공용 포인트 내역 화면을 구인자도 사용하므로 역할별 web 동작을 보존하는 범위로 포함한다.
- owned 사용형 혜택에 사용하기 제공
- listUsableJobPosts로 적용 가능한 공고 조회
- 공고 선택과 되돌릴 수 없음 확인
- useBenefit 호출
- 성공 후 pointShop, attendance, promotions와 jobs query 갱신
- 만료, 이미 사용, 공고 상태 변경, 권한 변경, 중복 제출 처리
- 기존 cancelMyOrder와 canCancelOrder 동작 보존

## 예정 파일

- 수정: apps/native/app/(seeker)/(tabs)/index.tsx
- 수정: apps/native/app/(seeker)/me/attendance.tsx
- 수정: apps/native/app/(seeker)/point-shop.tsx
- 추가: apps/native/src/components/seeker/marketplace-filter-sheet.tsx
- 추가: apps/native/src/components/seeker/premium-banner-rail.tsx
- 추가: apps/native/src/components/seeker/point-job-card.tsx
- 추가: apps/native/src/components/seeker/use-benefit-dialog.tsx
- 추가: apps/native/src/lib/seeker/marketplace-filters.ts
- 추가: apps/native/src/lib/seeker/job-hit.ts
- 추가: apps/native/src/lib/seeker/point-job.ts
- 공유 규칙 변경은 web과 native 중복 제거가 필요한 경우에만 packages/api에 추가

## 테스트

- marketplace-filters.test.ts
  - query 입력, 지역 변경, 초기화, 페이지 초기화, 알 수 없는 값, boolean 서버 입력
- packages/api jobs 목록 테스트
  - 인증, 당일면접, 초보 가능 각각과 복합 조건, 자체 및 수집 공고, totalCount와 다음 페이지
- job-hit.test.ts
  - detailViews 경계, impressions와 CTR 경계, 섹션 제한, 성과 없음
- ad-banner.test.ts
  - 슬롯 순서, 이미지, 단색, cover 폴백, 자체 및 수집 링크
- point-job.test.ts
  - 수령 가능, 이미 수령, 쿨다운, 대상 교체, query 갱신 대상
- point-shop.test.ts 확장
  - 사용 가능 혜택, 만료, 적용 공고 없음, 중복 실행
- bambi-native.test.ts 확장
  - 필터 뒤 섹션 병합과 중복 제거

실측:

- 필터 조합과 초기화
- banner 이미지 및 단색 소재와 상세 이동
- HIT 공고와 일반 공고
- 자체 및 수집 포인트 공고 수령
- 혜택 사용, 취소, 만료, 적용 대상 없음

## UI와 접근성

- 기존 공고 목록 구조와 스크롤 성능 유지
- 필터 선택 상태를 색과 체크 표시로 함께 표현
- 광고 문구가 길어도 CTA와 페이지 표시 보존
- 이미지 오류가 전체 목록 오류로 번지지 않게 격리
- 모든 터치 대상 44dp 이상

## 검증

- native와 API 타입 검사
- 관련 native, API, web 회귀 테스트
- 변경 파일 Ultracite와 git diff --check
- Android 목록 스크롤, 이미지 메모리, 필터 컨테이너 실측
- 최신 mobile 반영 후 광고 및 포인트 계약 재확인

## 2026-09-10 구현 및 검증 기록

- jobs.list와 crawled feed에 지역, 세부지역, 최소 시급, 인증, 당일면접과 초보 가능 서버 필터 계약을 추가했다.
- HeroUI Native BottomSheet 필터와 지역 master 기반 세부지역 선택, 적용 및 초기화를 연결했다.
- premium banner 고정 3칸, 이미지 및 단색 layout, 빈 문의 슬롯과 자체 및 수집 상세 이동을 구현했다.
- 공유 HIT 경계 판정과 유료 섹션 리본을 추가했다.
- 자체 및 수집 포인트 공고 표시, 클릭 시 claim과 포인트 query 갱신을 연결했다.
- 구인자 역할의 owned 혜택에 적용 공고 조회, 최종 확인과 useBenefit을 추가했고 구직자에게는 노출하지 않는다.
- native check-types 통과.
- native marketplace 및 point 관련 2 files, 8 tests 통과.
- API HIT와 point shop 순수 테스트를 포함해 2 files, 50 tests 통과.
- 변경 파일 Ultracite와 git diff --check 통과.
- API 전체 check-types에는 이 브랜치 비변경 기존 bambi-job-media-policy 테스트의 undefined 오류 3건이 남아 있다.
- DB job feed 테스트는 현재 dev DB fixture 상태와 최신 schema drift로 15건 중 5건 실패했다. 최신 mobile 동기화 뒤 격리 DB에서 재검증한다.
## Android Studio AVD 검증 (2026-09-10)

- 프리미엄 배너의 실제 소재와 빈 슬롯 문의 폴백, 고급 필터 전 항목, 최소 시급·인증·당일면접·초보 조건 적용과 초기화를 확인했다.
- 실제 데이터에서 필터 적용 결과가 57개에서 2개로 줄고 초기화 후 57개로 복원됐다.
- 포인트몰 0P 잔액과 50,000P 상품의 잔액 부족 상세를 확인했다. 개발 DB에 HIT·공고 보상 대상 데이터가 없어 해당 경계는 자동 테스트로 검증했다.
- `pnpm --filter native test`: 39 files / 384 tests 통과. native 타입 검사, Ultracite, `git diff --check` 통과.

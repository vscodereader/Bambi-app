# Native 구직자 공고 상세, 후기, 채팅 진입 설계

## 기준과 목표

브랜치: feat/native-seeker-job-detail
최초 기준: origin/mobile 64c11018

현재 자체 공고 상세는 기본 정보, 설명 블록, 상세 이미지, 신고와 즉시 채팅 시작을 제공한다. 최신 develop과 비교해 후기 열람, 구인자 인증 연락처, 상세 안전 정보, 차단 상태 안내, 채팅 시작 전 안전 확인이 빠져 있다. 이 브랜치에서 공고 상세부터 채팅방 생성 직전까지 독립 완성한다.

## 네이티브 기술 원칙

최신 develop 웹 공고 상세와 채팅 preflight의 기능, 표시 정보, 순서, 문구, 권한, 상태 전이와 예외 처리를 그대로 구현하고 UI 기술만 native로 변환한다.

- Expo SDK 56, expo-router, HeroUI Native와 Uniwind를 사용한다.
- apps/web의 job detail, review, preflight 컴포넌트와 CSS는 native에서 import하거나 복사하지 않는다.
- 기존 native의 BambiScreen, InfoTile, JobDescriptionSection, Dialog와 identity verification을 재사용한다.
- develop web은 API 계약, 권한, 상태 전이와 문구 확인에만 사용한다.
- Next route는 expo-router Stack, anchor와 tel link는 Expo Linking, shadcn dialog는 HeroUI Native Dialog로 치환한다.

채팅방 내부 UI는 chat parity 브랜치 범위이며 이 브랜치가 의존하지 않는다.

## 기존 구현과 재사용

- apps/native/app/(seeker)/jobs/[id].tsx
- JobDescriptionSection과 상세 이미지 URL 처리
- JobReportDialog
- MemberOnly과 identity verification hook
- chats.startFromJobPost와 chat 오류 매핑
- reviews.create와 me interviews의 후기 입력 규칙
- packages/api reviews.listByJobPost, reviews.unlock
- develop web의 seeker job detail과 review section은 동작 비교에만 사용

## 구현 범위

### 상세 정보

- 검수 통과와 연락처 보호 상태 표시
- 제목, 지역, 세부지역, 업종 또는 고용형태
- 업소명과 등록자 표시명
- 급여와 최저시급, 근무시간, 후기 평균과 개수
- 인증된 구인자 연락처가 있을 때만 전화번호 표시 및 tel 연결
- 미인증, 번호 없음, 탈퇴한 구인자에서 거짓 번호나 빈 타일을 표시하지 않음
- 설명, 구조화 블록과 상세 이미지는 기존 renderer 유지
- 연락처 보호, 검수, 신고 가능 안전 안내

서버 getById 응답에 필요한 필드가 없으면 develop 계약을 선별 반영한다. 번호와 개인정보는 서버가 공개 가능하다고 판정한 값만 표시한다.

### 후기 목록과 포인트 열람

- reviews.listByJobPost를 5개 단위 infinite query로 조회
- 평균, 개수, 별점, 날짜, 익명 또는 마스킹 작성자 표시
- 내 후기는 무료로 본문 표시
- 타인 후기의 잠금 상태 표시
- 잠긴 후기를 누르면 운영 설정의 review view point 금액으로 확인
- 사용자 확인 후 reviews.unlock 호출
- 잔액 부족, 정지 계정, 중복 요청, 사라진 후기 처리
- unlock 결과는 현재 화면 메모리에만 반영하고 서버 계약보다 오래 보존하지 않음
- 후기 조회로 포인트가 변하면 attendance와 point history query 갱신

### 차단 상태

- 내가 차단한 구인자 공고에서는 채팅 CTA 대신 차단 안내와 차단 관리 진입 제공
- 상대가 나를 차단했거나 공고가 채팅 불가 상태일 때 서버 사유를 임의 추정하지 않음
- 신고 CTA는 서버 권한 정책에 맞게 유지

### 채팅 시작 전 안전 확인

- CTA를 누르면 즉시 방을 만들지 않고 preflight를 연다.
- 구직자 프로필 존재, 휴대폰 본인인증, 공고 공개 및 검수 상태, 차단 여부를 확인
- 비회원은 기존 로그인 및 회원가입 흐름으로 연결
- 미인증 회원은 기존 앱 내 PortOne 본인인증 사용
- PortOne 환경이 없으면 현재 web 안내 폴백 사용
- 정상 상태에서만 startFromJobPost 호출
- 생성 중 중복 요청 방지, 성공 시 기존 chat room route 이동
- 이미 존재하는 방이면 같은 방을 여는 서버 계약 유지

## 독립성

- chat parity 브랜치의 availability badge나 정보 패널을 import하지 않는다.
- marketplace 브랜치의 필터, HIT, banner 컴포넌트를 import하지 않는다.
- 현재 jobs 목록과 chat room 경로만으로 전체 흐름을 검증한다.
- notification route는 기존 review 착지를 유지하되 상세 route 변경이 생긴 경우 이 브랜치에서 갱신한다.

## 예정 파일

- 수정: apps/native/app/(seeker)/jobs/[id].tsx
- 수정: apps/native/app/(seeker)/_layout.tsx
- 추가: apps/native/app/(seeker)/jobs/[id]/chat.tsx
- 추가: apps/native/src/components/seeker/job-review-section.tsx
- 추가: apps/native/src/components/seeker/job-safety-section.tsx
- 추가: apps/native/src/components/seeker/chat-preflight.tsx
- 추가: apps/native/src/lib/seeker/job-detail.ts
- 추가: apps/native/src/lib/seeker/job-reviews.ts
- 수정: packages/api는 getById 응답이 develop보다 부족한 경우에만

preflight는 develop의 별도 route와 현재 native Stack 상세 패턴을 따라 독립 화면으로 구현한다. 공고 상세로 돌아가기, 직접 딥링크, 로그인과 본인인증 뒤 복귀를 route params로 처리한다.

## 테스트

- job-detail.test.ts
  - 연락처 공개 가능, 미인증, 번호 없음, 차단과 공고 상태
- job-reviews.test.ts
  - 페이지 병합 및 중복 제거, 익명 표시, 내 후기, 잠금 후기, 금액
- review-unlock.test.ts
  - 확인, 취소, 잔액 부족, 중복 요청, 성공 후 query 갱신
- chat-preflight.test.ts
  - 프로필 없음, 미인증, 비공개, 차단, 정상 통과
- 기존 chat-errors와 me-interviews 후기 테스트 회귀
- packages/api reviews와 chats start 관련 테스트

실측:

- 인증 연락처 전화 연결
- 후기 더 보기와 포인트 차감
- 차단한 구인자 공고
- 미인증 사용자 본인인증 후 채팅
- 정상 채팅 생성과 기존 방 재진입

## UI와 접근성

- 후기와 연락처는 스크린리더가 상태와 비용을 함께 읽도록 라벨 제공
- 포인트 사용과 연락처 공개성 변화는 확인 없이 실행하지 않음
- 하단 CTA는 safe area를 포함하고 키보드나 큰 글자에서 잘리지 않음
- 긴 제목과 설명, 이미지 실패를 독립 처리

## 검증

- 변경 파일 Ultracite
- native와 필요한 API 타입 검사
- 관련 native와 packages/api Vitest
- git diff --check
- Android 실측
- PR 준비 직전 최신 origin/mobile 재반영

## 2026-09-10 구현 및 검증 기록

- 자체 공고 상세에 검수와 연락처 보호 정보, 등록자, 후기 평균과 개수, 인증 전화번호와 tel 연결을 추가했다.
- 후기 5개 단위 페이지, 중복 제거, 익명 및 마스킹 작성자, 잠금 본문과 포인트 unlock을 구현했다.
- unlock 성공 시 포인트 잔액과 내역 query를 갱신하며 본문은 현재 화면 상태에서만 연다.
- 연락처 보호, 검수와 신고 가능 안전 안내를 추가했다.
- 내가 차단한 구인자 공고는 채팅 CTA 대신 차단 관리 이동을 표시한다.
- 별도 Expo Router Stack preflight에서 로그인, 구직자 profile, 휴대폰 인증, 차단과 공고 상태를 확인한 뒤 기존 startFromJobPost를 호출한다.
- native check-types 통과.
- 후기, chat error와 면접 관련 native 3 files, 32 tests 통과.
- native 전체 Vitest 38 files, 382 tests 통과.
- 변경 파일 Ultracite와 git diff --check 통과.
- API reviews DB suite는 공유 dev DB의 기존 면접 및 후기 fixture 잔존으로 5건 중 4건 실패했다. native 신규 로직과 무관한 fixture 상태이며 격리 DB에서 재실행한다.
## Android Studio AVD 검증 (2026-09-10)

- 인증 구인자 연락처 노출과 Android 전화 앱 연결, 공고 메타데이터, 안전 확인, 채팅 사전 확인 4단계와 채팅방 생성을 확인했다.
- 후기 목록의 익명 마스킹, 별점, 10P 확인창, 잔액 부족, 열람 성공과 앱 재실행 뒤 중복 열람을 확인했다.
- 잔액 부족이 500으로 노출되던 문제를 BAD_REQUEST와 기존 포인트 부족 문구로 변환했다.
- 후기 차감에 사용자·후기별 external key를 추가하고 음수 원장 거래를 멱등 처리해 재요청 시 재차감되지 않도록 수정했다. 실제 첫 열람 뒤 0P, 재실행 후 같은 후기 재열람 뒤에도 0P를 확인했다.
- `pnpm --filter native test`: 39 files / 384 tests 통과. native 타입 검사, 대상 Ultracite, `git diff --check` 통과.
- API 후기 DB 테스트는 공유 개발 DB 픽스처 잔존으로 5개 중 1개 통과했다. 실패는 면접 상태, 후기 unique 잔존, 공고 인증 상태 충돌이며 실제 수정 경로는 AVD API 왕복으로 재검증했다.
## 2026-09-11 최신 develop 재감사

- 채팅 생성 실패 문구가 서버 원문을 직접 표시하던 차이를 수정하고 기존 공통 `startChatErrorMessage`를 재사용했다.
- NOT_FOUND, FORBIDDEN, rate limit과 알 수 없는 오류가 기존 native 채팅 정책과 같은 한국어 문구로 표시된다.

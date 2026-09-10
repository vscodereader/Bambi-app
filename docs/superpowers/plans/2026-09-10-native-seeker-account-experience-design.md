# Native 구직자 계정 상태, 이용 안내, 메인 팝업 설계

## 기준과 목표

브랜치: feat/native-seeker-account-experience
최초 기준: origin/mobile 64c11018

현재 mobile 계정 설정은 표시 이름, 프로필 사진, 성별, 생년월일, 조건부 앱 내 본인인증과 탈퇴를 지원한다. 최신 develop의 계정 경고 및 정지 안내, 가입 후 이용 안내, 다시 보기와 사용자용 메인 팝업은 없다. 이 브랜치에서 앱 전역 계정 경험을 독립 구현한다.

## 네이티브 기술 원칙

최신 develop 웹의 계정 배너, 이용 안내와 메인 팝업에 있는 기능, 표시 순서, 문구, 역할, 저장 key 의미와 상태 전이를 그대로 유지하고 플랫폼 기술만 native로 변환한다.

- Expo SDK 56, expo-router, HeroUI Native와 Uniwind를 사용한다.
- apps/web의 Alert, onboarding slide, coachmark, popup DOM과 CSS를 native에서 import하거나 복사하지 않는다.
- 기존 native root provider, BambiScreen, HeroUI Native Dialog와 SecureStore를 사용해 네이티브 UI로 구현한다.
- develop web에서는 상태 key, 단계 순서, 팝업 대상과 닫기 정책만 확인한다.
- web용 Lucide icon이나 HTML mockup은 사용하지 않고 현재 native Ionicons와 React Native View로 구성한다.
- localStorage와 sessionStorage의 의미는 사용자와 역할을 포함한 SecureStore key와 메모리 session state로 치환하고 Next navigation은 expo-router로 변환한다.

## 기존 구현과 재사용

- onboarding.getMine의 profile role과 status
- auth session, signup과 onboarding 완료 흐름
- accountStatusBadge 순수 라벨
- app theme, root layout과 seeker tab layout
- account settings와 BambiScreen
- develop web의 account status banner, onboarding content와 route
- main popup API와 공유 page mapping
- 운영자 PR 368의 popup page 공유 서비스는 병합된 경우 재사용

역할, 상태, 경고 사유, 팝업 대상, 화면 key와 기간은 서버 결과를 사용하며 앱에서 별도 정책을 만들지 않는다.

## 구현 범위

### 경고와 정지

- 로그인한 profile의 active, warned, suspended 상태 표시
- warned는 운영자 사유와 이의 신청 안내를 표시하고 닫을 수 있음
- 닫은 경고는 해당 경고 식별자 기준으로 로컬 저장
- 새 경고가 오면 다시 표시
- suspended는 닫을 수 없고 허용되지 않은 작업 전에 상태를 안내
- 서버가 계속 최종 권한을 판정하며 UI 숨김만으로 권한을 구현하지 않음
- 고객센터 브랜치가 없어도 깨지지 않는 현재 안정 경로와 안내 사용

경고 식별자나 닫기 저장 계약이 API에 없으면 임의 timestamp를 만들지 않고 develop 구현과 schema를 확인해 필요한 최소 계약을 추가한다.

### 가입 후 이용 안내

- 신규 구직자 가입 및 onboarding 완료 후 develop과 동일한 구직자 5단계 안내
- 공고 탐색, 채팅, 면접과 연락처, 후기와 안전, 포인트몰 내용
- 이전, 다음, 건너뛰기, 시작하기
- 안내 뒤 홈에서 검색, 채팅, 내 정보 위치를 순차 강조
- 기기별 완료 상태 저장
- 저장 실패가 로그인이나 앱 사용을 막지 않음
- 계정 설정에서 구직자 안내와 공통 안내 다시 보기
- 법률자문가와 구인자, 운영자는 역할에 맞는 콘텐츠만 표시

### 사용자용 메인 팝업

- mainPopups.listPublic으로 현재 사용자, 역할, 화면과 시간을 만족하는 팝업 조회
- develop과 같이 로그인 화면의 common popup도 지원하고 로그인 전 target path를 기기 세션에 보관
- 로그인 성공 뒤 보관한 target이 현재 native에서 지원되는 경로이면 이동하고 지원되지 않으면 seeker 홈으로 이동
- 서버 정렬 순서대로 모바일에서는 한 번에 하나씩 표시
- 텍스트, 이미지, 링크와 버튼 렌더
- 화면 닫기와 다음 팝업 이동
- 창닫기는 현재 화면 세션에서만 숨기고 오늘 하루 보지 않기는 popup id와 revision을 묶어 24시간 저장
- revision이 바뀌거나 24시간이 지나면 다시 표시
- 만료 또는 비활성 팝업 미표시
- 외부 링크는 http와 https만 시스템 브라우저로 열기
- 내부 web 경로는 native route mapping이 존재할 때만 앱 화면으로 변환
- 알 수 없는 화면이나 링크는 안전하게 비활성
- 이미지 로드 실패 시 텍스트와 닫기 동작 유지

## 독립성

- support 브랜치의 route를 import하지 않는다.
- community, marketplace, job detail 브랜치의 새 화면을 popup target으로 가정하지 않는다.
- 현재 존재하는 native route만 내부 링크 대상으로 사용하고 나머지는 링크 없음 처리
- 다른 구직자 PR이 병합된 뒤 route가 늘어나면 최신 mobile 동기화 시 mapping을 확장

## 예정 파일

- 수정: apps/native/app/_layout.tsx
- 추가: apps/native/app/feature-guide.tsx
- 수정: apps/native/app/_layout.tsx에 feature-guide 등록
- 수정: apps/native/src/lib/use-signup.tsx의 profile 생성 완료 routing
- 수정: apps/native/app/(seeker)/(tabs)/_layout.tsx
- 수정: apps/native/app/(seeker)/me/settings.tsx
- 추가: apps/native/src/components/account-status-banner.tsx
- 추가: apps/native/src/components/onboarding/seeker-guide.tsx
- 추가: apps/native/src/components/onboarding/feature-coachmark.tsx
- 추가: apps/native/src/components/main-popup-layer.tsx
- 추가: apps/native/src/lib/account-status.ts
- 추가: apps/native/src/lib/onboarding-guide.ts
- 추가: apps/native/src/lib/main-popup.ts
- 완료, coachmark intent, 경고 닫기와 팝업 24시간 숨김은 기존 expo-secure-store에 사용자와 역할, popup revision을 포함한 별도 key로 저장

## 테스트

- account-status.test.ts
  - active, warned, suspended, 알 수 없는 상태, 닫기, 새 경고
- onboarding-guide.test.ts
  - 구직자 5단계, 최초 표시, 완료, 건너뛰기, 다시 보기, 사용자와 역할별 저장 key
- onboarding-route 기존 테스트 확장
  - 가입 완료 후 안내와 최종 홈 이동
- main-popup.test.ts
  - 역할, 화면, 시작과 종료 시각, 정렬, 창닫기, 24시간 숨김, revision 변경, 내부 및 외부 링크, 이미지 실패
- storage 실패와 손상된 저장값 폴백

실측:

- 경고 닫기와 앱 재시작
- 새 경고 및 정지 상태
- 신규 가입 후 안내 전체와 건너뛰기
- 설정에서 다시 보기
- 다중 팝업, 이미지 오류, 내부 및 외부 링크

## UI와 접근성

- 경고와 정지는 색뿐 아니라 아이콘, 제목, 상태 문구로 구분
- suspended 배너가 화면 핵심 콘텐츠와 뒤로가기를 가리지 않음
- coachmark는 대상이 화면에 없으면 다음 단계로 안전하게 진행
- 팝업은 focus 순서, 닫기 라벨, Android back 처리 제공
- reduced motion에서 불필요한 전환 애니메이션 제거

## 검증

- native와 필요한 API 타입 검사
- 관련 Vitest
- 변경 파일 Ultracite와 git diff --check
- Android 재시작, 큰 글자, screen reader 실측
- 최신 origin/mobile 재반영 후 popup API와 route mapping 재검토

## 2026-09-10 구현 및 검증 기록

- seeker Stack 상단에 warned 및 suspended 배너를 추가하고 최신 제재 사유를 표시했다.
- warned 닫기는 user id와 sanction createdAt별 SecureStore key로 저장하며 suspended는 닫을 수 없다.
- 신규 구직자 가입 성공 뒤 develop과 같은 5단계 안내로 이동하고 이전, 다음, 건너뛰기와 시작하기를 구현했다.
- 안내 카드는 좌우 swipe와 이전 및 다음 버튼을 함께 지원한다.
- 시작 뒤 검색, 채팅, 내 정보 3단계 coachmark를 표시하고 계정 설정에서 안내를 다시 열 수 있다.
- mainPopups.listPublic 결과를 현재 native 화면 id에 매핑하고 모바일 한 건 표시, 링크, 창닫기, revision별 24시간 숨김을 구현했다.
- 로그인 팝업의 내부 target은 앱 메모리 세션에 보관하고 로그인 성공 뒤 지원되는 native 화면으로 복원한다.
- 로그인, 공고 상세, 채팅, 내 정보와 포인트 내역의 지원되는 내부 링크만 Expo Router로 변환하고 외부 http 및 https는 Linking으로 연다.
- native check-types 통과.
- account storage, popup route와 onboarding 관련 2 files, 8 tests 통과.
- native 전체 Vitest 39 files, 388 tests 통과.
- 변경 파일 Ultracite와 git diff --check 통과.
## Android Studio AVD 검증 (2026-09-10)

- 메인 팝업 두 건의 순서 노출과 각 항목 24시간 숨김, 재실행 후 미노출을 확인했다.
- 경고 배너 닫기·재실행 후 미노출과 정지 배너의 닫기 없는 지속 노출을 확인했다.
- 설정에서 5단계 이용 안내 재실행, 이전·다음·스와이프·건너뛰기·완료와 완료 뒤 3단계 코치마크를 확인했다.
- SecureStore 키에 허용되지 않는 `:`가 들어가 팝업 숨김, 경고 닫기, 안내 완료 저장이 실패하던 문제를 수정했다. 키를 허용 문자로 바꾸고 팝업 저장을 비동기 조회·완료 대기 방식으로 변경했으며 키 유효성 회귀 테스트를 추가했다.
- `pnpm --filter native test`: 39 files / 388 tests 통과. native 타입 검사, Ultracite, `git diff --check` 통과.

# Native 구직자 고객센터 및 문의 채팅 설계

## 기준과 목표

브랜치: feat/native-seeker-support
최초 기준: origin/mobile 64c11018

현재 native에는 구직자 고객센터 라우트와 support, supportChat API 호출이 없다. 최신 develop의 web 고객센터와 공유 API를 기준으로 FAQ, 회원 문의, 회원 및 비회원 상담 채팅, 이용 가이드를 독립적으로 완성한다.

## 네이티브 기술 원칙

최신 develop 웹 고객센터의 기능, 화면 정보, 순서, 문구, 권한, 상태 전이와 예외 처리를 그대로 구현하고 실행 방법만 native로 바꾼다.

- Expo SDK 56, expo-router, HeroUI Native, Uniwind를 사용한다.
- apps/web의 CommunityPostEditor, shadcn, Next.js 컴포넌트와 CSS는 import하거나 복사하지 않는다.
- Tiptap JSON은 서버 데이터 형식일 뿐이며 편집 UI는 React Native TextInput과 HeroUI Native 제어로 구현한다.
- web 화면에서는 API 계약, 검증, 상태 전이와 문구만 확인한다.
- 공용화는 packages/api의 순수 타입과 정책에 한정한다.
- Next navigation은 expo-router, cookie 저장은 서명 token과 SecureStore, browser link는 Expo Linking 또는 WebBrowser로 치환한다.

운영자 PR 364와 365가 아직 병합되지 않아도 기존 server와 web 운영 화면을 이용해 왕복 검증할 수 있어야 한다. 구현 직전 최신 mobile의 실제 support 계약을 다시 읽는다.

## 기존 구현과 재사용

- BambiScreen, StateCard, LoadingState, ErrorState
- MessageBody와 안전한 링크 파서
- chat 메시지 시간 표기와 일부 메시지 렌더러
- guest-store와 guest token
- notification list, route와 query 갱신 패턴
- 운영자 PR의 native content document editor가 최신 mobile에 병합돼 있으면 native 컴포넌트만 재사용

일반 구직자 채팅과 상담 채팅은 권한과 메시지 계약이 다르므로 전체 화면을 억지로 공유하지 않고 순수 본문, 시간, 첨부 렌더러만 공유한다.

## 구현 범위

### 고객센터 홈

- 내 정보 메뉴에 고객센터 진입점 추가
- 공개 FAQ 조회와 유형별 접기, 펼치기
- 운영자가 설정한 안내 문구 표시
- 내 문의, 새 문의, 상담 채팅, 이용 가이드 진입
- 안내 문구와 FAQ가 비어 있을 때 독립 빈 상태 제공

### 회원 문의

- 문의 유형, 제목, 본문을 입력하여 생성
- API 스키마의 유형과 길이 제한 사용
- 최신 계약이 리치 문서를 받으면 Tiptap 호환 문서 편집기 재사용
- 내 문의 목록에 접수됨, 답변완료, 종료와 마지막 갱신 시각 표시
- 상세에서 최초 문의와 추가 메시지를 시간순으로 표시
- 종료 상태의 입력 제한을 서버 정책과 일치
- 전송 실패 시 작성 내용 유지, 중복 전송 방지

### 회원 및 비회원 상담 채팅

- 회원은 세션, 비회원은 서버가 발급한 guest context 사용
- 임의 기기 ID, 고정 guest ID, 로컬 전용 사용자 ID 생성 금지
- web의 POST /api/support-chat은 cookie만 설정해 native가 token을 읽을 수 없으므로 그대로 호출하지 않는다.
- server에 동일한 IP 발급 제한과 HMAC 서비스를 재사용하는 native용 token 발급 endpoint를 추가하고 token을 응답 본문으로 전달한다.
- native는 support 전용 token을 SecureStore에 저장하고 x-bambi-support-chat 헤더에만 싣는다. 본인인증 guest token과 저장 key 및 header를 공유하지 않는다.
- 상담 홈, 방 목록, 새 상담, 메시지, 미읽음, 종료와 발신 잠금 지원
- 화면 focus와 AppState foreground 복귀 시 정본 재조회
- 정지 계정도 서버가 허용한 기존 상담과 이의 신청 경로 사용 가능

### 알림과 가이드

- 일반 문의 답변은 문의 상세로 이동
- 상담 답변은 해당 상담방으로 이동
- 삭제된 대상은 고객센터 홈으로 폴백
- seeker manual을 Expo asset으로 번들하고 목차, 내부 앵커, 표, 외부 링크 지원

## 독립성

- account experience 브랜치의 경고 배너나 메인 팝업을 import하지 않는다.
- 다른 구직자 브랜치가 없어도 내 정보에서 고객센터에 진입 가능해야 한다.
- 운영자 native 화면이 없어도 web 운영자 화면과 서버를 통해 답변 검증 가능해야 한다.
- notification-route 변경은 이 브랜치가 직접 포함한다.

## 예정 파일

- 수정: apps/native/app/(seeker)/(tabs)/me.tsx
- 추가: apps/native/app/(seeker)/support/index.tsx
- 추가: apps/native/app/(seeker)/support/inquiries/index.tsx
- 추가: apps/native/app/(seeker)/support/inquiries/new.tsx
- 추가: apps/native/app/(seeker)/support/inquiries/[id].tsx
- 추가: apps/native/app/(seeker)/support/chat/index.tsx
- 추가: apps/native/app/(seeker)/support/chat/[id].tsx
- 추가: apps/native/app/(seeker)/support/manual.tsx
- 수정: apps/native/app/(seeker)/_layout.tsx
- 추가: apps/native/src/components/support/*
- 추가: apps/native/src/lib/support/*
- 수정: apps/native/src/lib/orpc.ts
- 추가: apps/server/src/plugins/support-chat-session.ts
- 수정: apps/native/src/lib/notification-route.ts
- 수정: apps/native/metro.config.js에 PR 370과 같은 md assetExts 설정

## 테스트

- support-inquiry.test.ts: 입력 검증, 상태 라벨, 전송 가능 상태, 페이지 병합
- support-message.test.ts: 발신자, 본문 파싱, 안전한 링크, 시간 정렬
- support-chat.test.ts: 회원 및 guest context, 종료, 잠금, 미읽음, 전송 가드
- support-navigation.test.ts: 문의 및 상담 알림 착지와 삭제 대상 폴백
- manual-parse 테스트: 제목, 목차, 앵커, 표, 링크
- packages/api의 support, support-chat 테스트

실측:

- FAQ 열기와 이용 가이드
- 회원 문의 생성, web 운영자 답변, 앱 확인과 추가 답변
- 비회원 상담 생성과 앱 재진입
- 종료 및 잠금 방 입력 차단
- 알림 딥링크와 읽음 처리

## UI와 접근성

- HeroUI Native와 Uniwind 토큰 사용
- FAQ trigger, 문의 행, 상담방 행에 44dp 이상 터치 영역
- 운영자와 사용자의 메시지를 색만으로 구분하지 않고 발신자 라벨 제공
- 긴 본문, 이미지, 링크, 키보드, 큰 글자 크기 처리
- 초기 로딩, 빈 상태, 오류, 부분 갱신 실패, 전송 중 상태 분리

## 검증

- 변경 파일 Ultracite
- native와 API 타입 검사
- 관련 native와 packages/api Vitest
- git diff --check
- Android 키보드, 링크, 뒤로가기, guest 재진입 실측
- PR 준비 직전 최신 origin/mobile 재반영

## 2026-09-10 구현 기록

- 고객센터 홈, 공개 FAQ 질문과 회원 FAQ 답변, 운영 안내를 연결했다.
- 회원 문의 목록, 페이지, 리치 문의 작성과 이미지, 문의 상세와 추가 답변을 구현했다.
- 회원 및 비회원 상담방 목록, 새 상담, 상세, 읽음, 종료와 발신 잠금을 구현했다.
- web cookie와 분리된 native support token 발급 endpoint, IP 제한, HMAC, SecureStore와 전용 header를 연결했다.
- 구직자 이용 가이드를 md asset으로 번들하고 목차, 표, 내부 및 외부 링크를 지원했다.
- 내 정보 진입점과 support inquiry 및 support chat 알림 착지를 추가했다.
- native 및 server check-types 통과.
- support 및 notification 관련 native 3 files, 19 tests 통과.
- native 전체 Vitest 39 files, 393 tests 통과.
- 변경 파일 Ultracite와 git diff --check 통과.
- API support 순수 및 router 검증에서 2 files, 26 tests가 통과했다. support router suite의 종료 정리는 공유 dev DB에 남은 기존 bambi_notification FK 때문에 실패했으며 기능 assertion 실패는 없었다. 격리 DB에서 재실행한다.
## Android Studio AVD 검증 (2026-09-10)

- 회원 문의 작성·목록·상세·추가 답변, 회원 상담방 생성·추가 메시지·목록 상태와 비회원 상담 세션·메시지 전송을 실제 API 왕복으로 확인했다.
- 개발 DB에 공개 FAQ가 없어 FAQ는 빈 상태를 확인했고, FAQ 변환·표시 규칙은 자동 테스트로 확인했다.
- `pnpm --filter native test`: 39 files / 393 tests 통과. native 타입 검사, Ultracite, `git diff --check` 통과.
## 2026-09-11 독립성 재감사

- 이용 가이드는 고객센터 홈의 별도 버튼과 별도 route다. FAQ, 문의, 회원·비회원 상담 query와 mutation은 manual module을 import하지 않는다.
- 매뉴얼 asset을 읽지 못하면 manual 화면만 오류 상태를 표시하며 고객센터의 다른 기능은 계속 실행된다.
- asset 원문 `docs/manual/seeker-manual.md`는 기준 `origin/mobile`에 이미 존재하므로 다른 운영자·매뉴얼 PR을 먼저 병합할 필요가 없다.
## 2026-09-11 브랜치 리뷰 반영

- 고객센터 홈의 본문 제목·소제목 블록을 제거했다. 화면 제목은 Stack 헤더가 전담한다.
- 회원의 "문의 글 등록하기"(primary)·"내 문의 내역"(secondary)은 공고 상세의 "1:1 채팅 시작"과 같은 하단 고정 영역(stickyFooter)으로 옮겼다. 비회원에겐 같은 자리에 "1:1 상담" 하나만 둔다.
- "1:1 상담"·"이용 가이드" 본문 버튼은 제거했다. 이용 가이드 route와 코드는 유지하되 진입점을 두지 않는다.
- 회원의 1:1 상담 진입은 구직자 홈 탭 우하단 스피드다이얼 FAB(`SpeedDialFab`)로 옮겼다. actions 배열에 항목을 추가하면 펼침 메뉴 항목이 늘어난다.
## 2026-09-11 1:1 상담 시트·채팅 UI 개편

- support/chat은 자체 Stack(`_layout.tsx`, anchor index)을 가진 그룹으로 묶고 부모 (seeker) Stack에서 `presentation: "formSheet"`(detent 0.94, 모서리 24, 그래버)로 띄운다. Android `modal`은 상단 슬라이드 풀스크린이라 쓰지 않는다. 시트 닫기는 `router.back()`(중첩 Stack에 index 하나뿐이라 dismiss는 시트를 못 내린다).
- 목록 시트(index): 자체 헤더 "대화"+X, 운영팀 아바타·상대시간·미리보기 2줄·미읽음/종료 칩 행, 하단 중앙 플로팅 "새 문의하기" → `/support/chat/new`. 목록의 새 상담 입력창은 제거했다.
- 대화방([id]): 헤더 "1:1 상담", inverted FlatList + 공유 `annotateChatMessages`로 날짜 칩·그룹 경계, `SupportChatBubble`(내 것 오른쪽 accent, 운영팀 왼쪽 surface-secondary+헤드셋 아바타), `SupportChatComposer`(멀티라인·원형 전송·withSpring 눌림). `id === "new"`는 인사 말풍선만 두고 첫 전송이 방을 만든 뒤 실제 id로 replace한다. 비회원은 첫 전송 직전 토큰을 보장한다.
- Reanimated: 마운트 이후 도착한 메시지만 FadeInRight/FadeInLeft 등장, 전송 버튼 스프링, 새 메시지 pill 재사용. 3초 폴링·markRead는 현행 유지.
- 실기기 확인 잔여: 시트 안 상단 안전영역 값, Android formSheet 렌더, 플로팅 버튼 배치·그림자, 키보드와 컴포저 겹침.
## 2026-09-11 문의 글 등록 UI 재설계(B안)

- 본문 큰 제목 제거(헤더 전담). 문의 유형은 칩에서 FieldSelect(바텀시트)로, 라벨 맵 경유. 제목은 TextField isRequired + "2~100자" 안내 + trim 기준 카운터.
- 제출 CTA는 stickyFooter 고정. 같은 바에 비활성 사유 한 줄(`inquirySubmitBlocker`: 제목 2자 미만 → 100자 초과 → 본문 5자 미만·이미지 없음). `canSubmitInquiry`는 blocker === null로 위임.
- 에디터는 문단·이미지를 문서 순서 그대로 한 목록(순번·위로/아래로/삭제)으로 그리고 미리보기 박스를 없앴다. 서식 도구·링크·selection·history는 전면 제거(markRange/toggleMarkRange/wrapBlock/editableBlocks 삭제). 저장 포맷은 계속 Tiptap 부분집합이며 `editBlockText`의 미지 마크 보존으로 웹 작성 글 왕복이 안전하다.
- `onChange` payload에 hasImage 추가(documentImages 기반), 화면의 JSON 문자열 스니핑 제거.
- 별건: 웹에서 작성된 취소선(strike)을 native 파서·MessageBody가 렌더하도록 보강. 링크+취소선 겹침은 밑줄만 적용(RN 단일 속성 한계).
- 미조치: 서버 필드 단위 오류 매핑(채널 없음), 수정 화면용 hasImage 프리필(편집 진입점 없음), FieldSelect 바텀시트 45%·블록 카드 룩 실기기 확인.
## 2026-09-11 고객센터 FAQ 아코디언 정리

- 운영자 공지(notice) 블록을 native 고객센터에서 제거했다(웹 위젯 홈에는 그대로). "자주 묻는 질문" 제목 아래 서브타이틀 한 줄 추가.
- FAQ 항목 오른쪽에 chevron-forward를 두고, 펼침 시 Reanimated withTiming으로 90도 회전(`FaqAccordionItem`). 답변 본문은 조건부 렌더 유지(높이 애니메이션 없음).

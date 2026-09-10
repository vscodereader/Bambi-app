# Native 구직자 수다방 전체 구현 설계

## 기준과 목표

브랜치: feat/native-seeker-community
최초 기준: origin/mobile 64c11018

현재 native 수다방 탭은 MemberOnly allowCommunityGuest 뒤에 준비 중 카드만 표시하며 community API를 호출하지 않는다. 최신 develop의 web 수다방과 community, communityBoards API를 동작 정본으로 삼아 수다방 전체를 독립 구현한다.

## 네이티브 기술 원칙

최신 develop 웹 화면의 기능, 표시 정보, 순서, 문구, 권한, 상태 전이와 예외 처리를 제품 정본으로 삼는다. 기능을 축소하거나 새 UX를 임의로 만들지 않고 플랫폼 API만 아래처럼 치환한다.

- Expo SDK 56과 expo-router를 사용한다.
- UI는 heroui-native 컴포넌트와 Uniwind className으로 작성한다.
- apps/web의 React, Next.js, shadcn 컴포넌트와 CSS를 native에서 import하거나 복사하지 않는다.
- develop web은 API 호출 순서, 권한, 상태 전이, 사용자 문구를 확인하는 비교 자료로만 사용한다.
- 플랫폼 공용 순수 타입과 정책은 packages/api에서만 공유한다.
- Next navigation은 expo-router, HTML 입력은 React Native 입력과 HeroUI Native form, web Tailwind class는 동일 토큰의 Uniwind className으로 변환한다.

이 브랜치는 다른 구직자 브랜치의 파일이나 커밋에 의존하지 않는다. 구현 시작과 PR 준비 전에 최신 origin/mobile을 반영하고 운영자 PR의 community router, board router, 수집 정책 변경을 다시 비교한다.

## 기존 구현과 재사용

- MemberOnly와 guest token 판정: 회원과 여성 인증 게스트 구분
- report-dialog: 회원 신고 UI와 moderation.createReport
- me/content: 내가 쓴 글과 좋아요 글 목록
- BambiScreen, StateCard, Pill: 로딩, 오류, 빈 상태와 상태 표시
- develop web의 community 화면은 동작과 API 계약 비교에만 사용
- packages/api의 community access, authz, board layout, post policy, crawled community 정책

게시판 key, 권한, 글자 수, 이미지 제한, 포인트, 비밀글 정책은 화면에 복제하거나 하드코딩하지 않고 API와 공유 서비스에서 가져온다.

## 구현 범위

### 홈과 목록

- 운영자 설정의 활성 게시판과 홈 배치를 서버 순서대로 표시
- 공지, 베스트, 일반 게시판, DB 동적 게시판 지원
- 홈 공지 및 일반 게시판 미리보기를 공고 홈에 추가
- 게시판별 목록, 검색, 광고 글, 업소 글, 내 글 필터
- 페이지 이동과 새로고침
- 검색, 필터, 페이지를 route params에 보존하여 상세 복귀 시 문맥 유지
- 일반 글과 수집 글을 구분하여 전용 상세 경로로 이동

### 상세와 작성

- 제목, 작성자 역할, 등급, 성별, 작성일, 조회, 추천, 댓글, 이미지, 본문 표시
- 숨김, 삭제, 존재하지 않음, 권한 거부를 별도 상태로 처리
- 이전 글과 다음 글 이동
- 회원 글 생성, 수정, 삭제와 이미지 업로드
- 댓글 및 답글 생성, 수정, 삭제
- 추천과 글, 댓글 신고
- mutation 성공 시 목록, 상세, 홈 미리보기, 내 글과 좋아요 query 갱신
- 실패 시 입력 보존 및 중복 제출 차단

### 게스트와 비밀글

- 여성 인증 게스트가 서버 허용 게시판에서 비밀번호 기반 글, 댓글, 답글 작성
- 게스트 수정과 삭제 시 비밀번호 검증
- 게스트의 이미지 업로드와 신고는 서버 정책대로 감춤
- 비밀글은 본인, 운영자, 법률자문가 또는 올바른 비밀번호일 때만 공개
- 연락처는 서버가 허용한 사용자에게만 표시

### 법률자문가와 남성 구직자

- 법률자문가는 무료 법률자문과 비밀게시판을 허용하고 다른 게시판 직접 URL은 안내 후 legal 목록으로 이동
- 남성 구직자는 공지사항과 비밀게시판만 허용하고 다른 게시판 직접 URL은 비밀게시판으로 이동
- 법률자문 글을 서버 정책대로 비밀글로 고정
- 법률자문가 댓글 배지와 연락처 열람
- 출석처럼 서버가 법률자문가에게 허용하지 않은 구직자 UI를 역할에 맞게 숨김

### 알림

- 일반 게시글과 댓글 알림을 해당 상세로 연결
- 수집 글 댓글 알림을 수집 상세로 연결
- 삭제되거나 비활성인 대상은 수다방 홈으로 복귀

## 예정 파일

- 교체: apps/native/app/(seeker)/(tabs)/community.tsx
- 추가: apps/native/app/(seeker)/community/[board]/index.tsx
- 추가: apps/native/app/(seeker)/community/[board]/write.tsx
- 추가: apps/native/app/(seeker)/community/[board]/[postId].tsx
- 추가: apps/native/app/(seeker)/community/[board]/[postId]/edit.tsx
- 추가: apps/native/app/(seeker)/community/crawled/[id].tsx
- 수정: apps/native/app/(seeker)/_layout.tsx
- 추가: apps/native/src/components/community/*
- 추가: apps/native/src/lib/community/*
- 수정: apps/native/src/lib/notification-route.ts
- 수정: apps/native/app/(seeker)/(tabs)/index.tsx
- 추가: apps/native/src/components/community/home-community-section.tsx

최신 mobile에 같은 목적의 파일이 추가되면 새 구현을 만들지 않고 기존 파일을 확장한다.

## 테스트

- community-access.test.ts: 회원, 여성 게스트, 남성 게스트, 법률자문가, 정지 계정
- community-board.test.ts: 동적 게시판, 순서, 비활성 게시판, built-in 폴백
- community-list.test.ts: 검색, 필터, 페이지 params, 중복 제거
- community-navigation.test.ts: 일반 및 수집 상세, 이전과 다음, 알림 착지
- community-editor.test.ts: 입력 정규화, 비밀번호, 연락처, 이미지 제한, 변경 감지
- community-comments.test.ts: 댓글과 답글 구조, 수정 및 삭제 권한, 실패 롤백
- packages/api community access, authz, board layout, crawled policy 회귀 테스트

## 화면 및 접근성

- 44dp 이상 터치 영역과 명시적 접근성 라벨 제공
- 선택, 비활성, 로딩 상태를 색 외의 방법으로도 표시
- 긴 게시판명, 제목, 닉네임과 큰 글자 크기에서 액션 보존
- 초기 로딩, 캐시가 있는 갱신 실패, 빈 상태, 다음 페이지 실패 구분
- 삭제 전 확인, 비밀글 오답 시 입력 유지
- 작성 화면에서 키보드가 제출 버튼과 오류를 가리지 않도록 구성

## 검증

- 변경 파일 Ultracite
- pnpm --filter native check-types
- native와 packages/api community 관련 Vitest
- git diff --check
- Android 회원 및 게스트 실측
- 최신 origin/mobile 재반영 후 충돌과 API 계약 재검토

## 2026-09-10 구현 및 검증 기록

- 수다방 홈, 동적 게시판 목록, 검색, 필터, 페이지, 일반 및 수집 상세, 이전 및 다음 글을 구현했다.
- 회원 및 guest 글과 댓글, 답글, 수정, 삭제, 추천, 신고와 비밀글 비밀번호 흐름을 연결했다.
- HeroUI Native와 Uniwind 기반 리치 문서 편집, 링크, 목록, 이미지 선택 및 업로드, 순서와 삭제를 구현했다.
- 홈 미리보기와 community notification route를 연결했다.
- native check-types 통과.
- native 전체 Vitest 39 files, 395 tests 통과.
- community 및 notification 관련 3 files, 21 tests 통과.
- 변경 파일 Ultracite 통과, git diff --check 통과.
- packages/api 순수 community 테스트 3 files, 37 tests 통과.
- DB router community 테스트는 현재 dev DB에 운영자 PR의 board_key 제약이 먼저 적용된 schema drift 때문에 49건 중 10건 실패했다. 최신 mobile에 0115 및 0116이 반영된 뒤 fixture와 router를 동기화하고 재실행한다.

# Bambi — 웹·네이티브 앱 개발 기록

## 1. 프로젝트 개요

Bambi는 구직자와 구인 업체를 연결하고 운영자가 공고·회원·콘텐츠·광고·포인트를 관리하는 채용·커뮤니티 서비스임. Next.js 웹과 React Native·Expo 앱을 별도로 개발하며 Fastify·oRPC·PostgreSQL 기반 서버와 데이터 모델을 공유함.

본 문서는 2026-09-10 수집한 원격 Git 이력·PR, Windows 로컬 브랜치와 worktree, 관련 Codex 대화를 기준으로 작성함. 본인 PR 작성 계정은 `vscodereader`임. 통합 브랜치에 존재하는 팀 기능과 본인 PR을 구분함.

## 2. 웹과 앱의 브랜치 운영

1. 웹은 `develop`을 기준으로 별도 브랜치·worktree를 만들고 `develop` 대상 PR을 작성한 뒤 `main`에 통합하는 흐름임.
2. 앱은 `mobile`을 기준으로 별도 브랜치·worktree를 만들고 `mobile`에서 검증한 후 `develop`, `main`으로 통합하는 흐름임.
3. `mobile`에 없는 진행 중 기능은 작업 브랜치·미커밋 파일에만 있을 수 있으므로 별도 목록으로 보존함.
4. 원격 브랜치는 원래 이름을 유지하고 로컬 브랜치는 `local-snapshot/`, 미커밋 작업은 `wip-snapshot/`에서 구별하도록 아카이브함.
5. 웹·앱이 같은 DB를 사용해도 코드와 개발용 로컬 이미지 디렉터리는 자동 공유되지 않음. 서로 다른 worktree가 같은 포트를 쓰면 실행 충돌이 발생하므로 실행 환경을 맞춰 확인함.

## 3. 사용 기술과 실제 적용 위치

### TypeScript·pnpm workspace·Turborepo

- `apps/web`, `apps/native`, `apps/server`와 `packages/api`, `auth`, `db`, `env`, `ui`로 역할을 나눔.
- TypeScript로 입력·응답·도메인 타입을 공유하고 workspace 의존성으로 연결함.
- pnpm은 패키지·lockfile 관리, Turborepo는 패키지별 작업과 의존 순서·캐시 관리에 사용함.

### React·Next.js App Router — 웹

- `apps/web/src/app/`과 `apps/web/src/components/bambi/`에 공개 공고·커뮤니티와 역할별 화면을 구현함.
- 구직자는 공고 탐색·상세·채팅·면접·포인트, 구인자는 공고 등록·광고·사업자 인증, 운영자는 회원·검수·신고·설정을 관리함.
- Tailwind CSS와 `packages/ui` 공용 컴포넌트를 이용하여 반응형 화면을 구성함. 기존 디자인 토큰을 재사용하며 임의 픽셀·색상 반복을 줄임.
- Tiptap은 공고·콘텐츠 리치 편집, Next.js 메타데이터는 공개 페이지 SEO, GA4 이벤트는 프로모션과 핵심 사용자 행동 계측에 사용함.

### React Native·Expo·Expo Router — 앱

- `apps/native/app/`은 역할별 라우팅, `apps/native/src/`은 화면 구성·공용 UI·통신 코드를 담당함.
- Expo Router, Safe Area, 키보드 제어, Reanimated·gesture-handler와 bottom sheet로 모바일 탐색과 입력 UX를 구성함.
- HeroUI Native·Uniwind는 앱의 공용 UI·스타일 구성에 사용함. 웹의 DOM·CSS를 그대로 앱에 붙이는 방식이 아니라 네이티브 화면에 맞게 구성함.
- 이미지 선택·가공, 문서 선택, WebView, 딥링크와 SecureStore를 필요한 기능에서 사용함.
- 운영자 기반 PR #333은 공통 셸·다이얼로그와 SAF 파일 저장 기반을 추가한 검토 대기 작업임.

### oRPC·TanStack Query·Zod

- `packages/api/src/routers/bambi/`는 공고·회원·포인트·운영 API를 제공함.
- `apps/native/src/lib/orpc.ts`는 타입 안전 클라이언트와 QueryClient를 생성하고 네이티브 세션 쿠키 또는 게스트 토큰을 요청에 연결함.
- TanStack Query로 조회·캐시·mutation 이후 무효화를 관리하고 Zod로 요청 값을 검증함.
- 웹·앱은 같은 서버 계약을 사용하되 로그인 쿠키 전송과 게스트 처리 방식은 실행 환경에 맞게 분기함.

### Fastify·Socket.IO·SSE

- `apps/server/src/index.ts`, `plugins/`가 HTTP 서버·인증 브리지·정기 작업을 구성함.
- `apps/server/src/bambi-realtime.ts`가 실시간 채팅 연결을 담당함. 메시지, 읽음 상태, 입력 중 표시, 접속 상태를 화면 캐시와 연결함.
- PR #291은 사용자 presence, #301은 채팅 상대 접속·평균 응답 시간과 공고 메타데이터 표시를 다룸.
- 재연결·만료 후 서버의 정본 데이터를 다시 조회하고 차단·퇴장 등 권한 상태에 맞게 정보 노출을 제한하는 보완을 수행함.

### PostgreSQL·Drizzle ORM

- `packages/db/src/schema/bambi.ts`와 `packages/db/src/migrations/`로 회원·업체·공고·채팅·포인트·신고 등의 관계와 변경 이력을 관리함.
- 포인트 차감·보상·등급·결제는 서로 다른 정책이므로 잔액 변화만으로 등급이 잘못 바뀌지 않도록 수정함(PR #210·#270).
- migration 번호·journal·snapshot을 함께 관리하고 기능 브랜치 통합 시 중복과 충돌을 확인함.

### Better Auth·PortOne·GCS

- Better Auth는 웹·앱 세션과 역할별 인증에 사용함. PortOne은 본인인증 연동에 사용하며 결제 SDK 설치만으로 모든 결제가 PG 연동이라고 단정하지 않음.
- PR #308은 비회원 본인인증 결과를 회원가입에서 재사용하는 작업임.
- GCS는 이미지·서류·첨부 저장에 사용함. 개발 환경의 로컬 이미지 조회 경로는 별도로 존재함.
- PR #304는 이미 승인된 업소의 재승인 문제와 사업자 서류 행 UI를 개선함. 파일명·미리보기·다운로드·삭제와 심사 상태가 일치하도록 처리함.

### Vitest·Biome/Ultracite·GitHub Actions·Docker·Cloud Run

- 타입 검사와 Vitest로 공용 로직·API·화면 데이터 처리를 검증함. Biome/Ultracite로 포맷·린트를 검사함.
- `.github/workflows/deploy-server.yml`은 Docker 이미지 빌드와 Cloud Run 서버 배포를 구성함.
- Vercel 팀 접근 권한 때문에 차단된 preview와 실제 코드 빌드 실패는 구분해서 기록함.
- 문서에 옮긴 과거 테스트 결과는 당시 PR·대화의 검증 기록이며 이번 아카이브에서 앱 전체를 다시 실행한 결과는 아님.

## 4. 웹에서 수행한 주요 작업

1. 수집 공고 이미지 편집: PR #82. 대형 이미지 직렬화와 서버 body 한도로 발생하는 413/Failed to fetch를 다루고 편집·저장 흐름을 정리함.
2. 팝업·광고·계측: PR #98·#111·#123·#135·#268. 대상·기간·노출, 이미지 크기, GA4 이벤트, SEO와 광고 배치를 개선함.
3. 채팅·면접·접속: PR #71·#121·#149·#154·#289·#291·#301. 첨부 표시, 동시 전송 순서, 확인창과 상대 상태·응답 시간을 개선함.
4. 인증·검수·제재: PR #100·#152·#168·#172·#180·#183·#188·#197·#206·#275·#304. 사업자 서류·재심사, 사용자·신고 조치와 테스트 계정 기능을 다룸.
5. 포인트·커뮤니티: PR #210·#218·#221·#227·#233·#246·#270·#294. 포인트 내역, 비밀글·후기, 다중 게시판 공지, 배치·탐색, 수집 게시판 관리를 구현함.
6. 진행 중 웹 PR: #235 포인트몰 동적 진열·뽑기·보상, #250 전역 다크모드, #308 본인인증 재사용은 수집 시점 Open임. 병합 완료 목록에 합치지 않음.

## 5. 네이티브 운영자 기능의 현재 상태

공통 기반 #333은 `mobile` 대상이며 다음 기능 PR은 `feat/native-admin-foundation`을 대상으로 작성됨. 공통 기반 검토 후 기능별 통합을 진행하는 구조임.

- #353 공고 검수 상세·감지 문구 강조
- #354 신고 상세·대상 후속 조치
- #355 사용자 상세·접속 상태·계정 조치
- #356 운영자 쪽지 리치 편집·대상 발송
- #357 공고 수정·노출 기간·삭제 관리
- #358 채팅 열람·차단·첨부 저장
- #359 업소·팀 합류·면접 관리
- #360 출석·등급·포인트 정책 관리
- #361 광고 상품·결제·포인트몰 관리
- #362 게시물·댓글 일괄 조치
- #363 게시판 CRUD·배치 관리
- #364 FAQ 리치 편집·공개 관리
- #365 문의 채팅 답변·잠금·종료
- #366 금칙어 검색·CSV 일괄 관리
- #367 후기 검수
- #368 팝업 리치 편집·이미지 가공·순서 미리보기
- #369 사이트 설정 섹션별 저장
- #370 운영자 매뉴얼 목차·표·링크 열람
- #371 크롤링·수집 콘텐츠·이미지 편집

이전 PR #334~#352는 닫힌 기록이며 대체 PR #353~#371과 중복된 독립 완료 기능으로 세지 않음. 사용자 작업 대화에서 커밋 본문 형식 수정 후 새 PR로 재작성한 경위를 확인함.

구직자 관련 로컬 브랜치인 `native-seeker-account-experience`, `native-seeker-chat-parity`, `native-seeker-community`, `native-seeker-job-detail`, `native-seeker-marketplace-points`, `native-seeker-support`와 `native-push-notifications`, 이미지 복구 작업은 worktree별 실제 변경과 함께 부록에 기록함. 이름만 존재하고 변경이 없는 브랜치는 완료 기능으로 세지 않음.

## 6. 개발·리뷰·재검증 과정

### 진행 중 7개 브랜치의 실제 파일 상태

2026-09-10 로컬 worktree 스냅샷 기준임. 아래 파일 수는 미커밋 변경·추가 목록의 크기이며 기능 수나 테스트 통과 수가 아님.

1. `feat/native-push-notifications`: 설계 문서 1개. 앱 권한·토큰 등록·서버 발송·수신 이동·badge를 설계했으며 구현 완료로 분류하지 않음.
2. `feat/native-seeker-account-experience`: 14개 파일. 계정 경고·정지 배너, 가입 후 이용 안내, 사용자 메인 팝업과 설정 흐름의 코드가 있음.
3. `feat/native-seeker-chat-parity`: 59개 파일. presence·평균 응답 시간, 채팅 목록·방 정보, 면접 확정 확인을 웹의 최신 계약에 맞추는 코드가 있음.
4. `feat/native-seeker-community`: 83개 파일. 수다방 홈·목록·상세·작성, 게스트·비밀글 접근, 역할별 정책과 알림 경로를 다룸.
5. `feat/native-seeker-job-detail`: 9개 파일. 공고 상세·후기와 포인트 열람, 차단 상태, 채팅 시작 전 안전 확인을 다룸.
6. `feat/native-seeker-marketplace-points`: 31개 파일. 광고 노출·HIT 표시·상세 필터·포인트 공고·보유 혜택 사용을 다룸.
7. `feat/native-seeker-support`: 47개 파일. 고객센터·회원 문의·회원/비회원 상담 채팅과 알림·가이드를 다룸. 계획서에는 API 검증 26개 assertion 통과와 별개로 공유 개발 DB의 기존 FK 때문에 종료 정리가 실패했다는 기록이 있어 전체 테스트 성공으로 표현하지 않음.

각 브랜치의 원래 HEAD, 변경 경로 전체와 복원용 `wip-snapshot/` 브랜치는 `WORK-IN-PROGRESS.md`에 기록함. 진행 중 코드의 보존은 검토·병합·배포 완료를 뜻하지 않음.

### 진행 중 기능의 검증 기록과 남은 항목

아래는 각 worktree 설계서 마지막의 2026-09-10 기록임. 이번 문서화에서 재실행한 수치가 아니며 DB 실패 원인은 해당 작업자가 기록한 진단으로 구분함.

- 계정: native 타입 검사, 관련 8개 테스트, 전체 native 388개 테스트 통과 기록이 있음.
- 채팅: native·server 타입 검사, native 채팅 22개·전체 383개, API 관련 25개 테스트 통과 기록이 있음. API 전체 타입 검사에는 기존 undefined 오류 3개가 남아 있음.
- 커뮤니티: native 전체 395개, 관련 21개, API 순수 테스트 37개 통과 기록이 있음. DB router는 49개 중 10개 실패하며 계획서는 board_key 제약과 schema drift를 원인으로 기록함.
- 공고 상세: native 전체 382개와 관련 32개 통과 기록이 있음. API reviews DB suite는 5개 중 4개 실패하며 공유 DB fixture 잔존으로 진단되어 격리 DB 재검증이 필요함.
- 공고 탐색·포인트: 관련 native 8개·API 순수 50개 통과 기록이 있음. API 타입 오류 3개와 DB job feed 15개 중 5개 실패가 남아 있음.
- 문의: native 전체 393개·관련 19개 통과 기록이 있음. API 기능 assertion 26개 통과와 종료 정리 실패를 구분함.
- 푸시: 설계 상태이므로 토큰 발급·실제 기기 수신·badge 통과 결과를 기재하지 않음.

Android 실제 기기, 접근성·큰 글자·뒤로가기·키보드 및 격리 DB 검증은 각 계획서의 남은 확인 항목에 맞춰 진행해야 함.

1. 기능에 맞는 기준 브랜치를 확인하고 worktree를 분리함.
2. 기존 컴포넌트·훅·서버 서비스·DB 정책과 `docs/superpowers/plans/`를 읽고 변경 계획을 작성함.
3. API·DB·웹·앱 변경을 계약에 맞게 구현하고 오류·빈 상태·권한·재연결을 포함함.
4. 변경 패키지 타입 검사·관련 테스트·Biome·diff 검사를 수행하고 수동 확인이 남은 항목을 따로 기록함.
5. PR에 문제·변경·검증·migration·연결 이슈를 적고 기준 브랜치 최신화·충돌을 확인함.

## 7. 사용 스킬과 개인 작업 방식

`skills-lock.json`의 외부 스킬에는 인증, Expo UI·배포·개발 클라이언트, native-data-fetching, Next.js, shadcn, HeroUI Native, Turborepo, Ultracite, React·React Native 성능, 로그 분석과 기기 검증 관련 스킬이 존재함. 설치 사실만으로 모든 기능에서 해당 스킬을 호출했다고 주장하지 않음.

설계서·대화에서는 계획 작성, 디버깅, 기존 구현 재사용, 코드 리뷰와 완료 전 검증을 반복 적용한 사실을 확인함. 별도 대화에서 개인 `ui-ux-visual-quality` 스킬과 Bambi 프로필·다크모드 감사 문서를 저장소 밖에 보관한 기록도 확인함. 개인 규칙 원문은 프로젝트 Git에 넣지 않기로 한 기존 결정을 존중하고 적용 사실만 정리함.

토큰 절감률은 계측 데이터가 없으므로 새 수치를 만들지 않음. 계획서 재사용, 관련 파일만 제공, 공용 컴포넌트 재사용, 패키지별 검사로 반복 탐색과 재작업을 줄인 방식을 기술함.

## 8. 전체 증거 자료

개인 저장소의 `portfolio/PR-INDEX.md`, `portfolio/prs/`, `portfolio/COMMITS.md`, `portfolio/BRANCHES.md`, `portfolio/WORK-IN-PROGRESS.md`에서 모든 수집 PR과 개인 기여 PR의 상세 내용, Git 이력과 진행 중 변경을 확인하도록 구성함. 기존 문서·계획서와 원본 PR URL도 함께 보존함.

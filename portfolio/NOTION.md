## 프로젝트 개요
Bambi는 **구직자·구인자·운영자를 연결하는 채용·커뮤니티 플랫폼**임. 웹과 네이티브 앱을 개발하고, 공고·채팅·인증·광고·포인트·운영 기능을 공용 서버와 DB로 연결함.

## 핵심 기능
- **구직자**: 공고 탐색·후기·채팅·면접·커뮤니티·포인트·문의
- **구인자**: 공고 등록·광고·사업자 인증·지원자 및 면접 관리
- **운영자**: 회원·공고 검수·신고·콘텐츠·광고 상품·포인트 정책 관리

## 본인이 수행한 핵심 작업
1. **웹 서비스 기능 확장** — 이미지 편집, 사업자 인증·검수, 신고·제재, 커뮤니티와 광고·포인트 흐름을 구현·보완함.
2. **실시간 채팅 안정화** — 첨부·전송 순서·면접 확인, 사용자 접속 상태와 평균 응답 시간 표시를 개선함.
3. **네이티브 운영자 기능 확장** — 공통 기반과 19개 기능 PR을 작성함. 현재 검토 대기 상태임.
4. **네이티브 구직자 기능 확장** — 신규 PR #379~#384로 구직자 기능 6개를 제출함. #385는 원격 푸시 구현 보류 문서이며, 7개 모두 mobile 대상 검토 대기임.

## 기술 구성
- **웹**: React·Next.js·TypeScript·Tailwind CSS·공용 UI
- **앱**: React Native·Expo·Expo Router·HeroUI Native·Uniwind
- **서버·통신**: Fastify·oRPC·TanStack Query·Socket.IO
- **DB·인증**: PostgreSQL·Drizzle ORM·Better Auth·PortOne 본인인증
- **배포·검증**: GCS·Cloud Run·Docker·GitHub Actions·Vitest·Biome/Ultracite

## 구현 구조
1. **웹 화면 — apps/web**
	공개 채용·커뮤니티와 구직자·구인자·운영자 화면을 구성함.
2. **네이티브 앱 — apps/native**
	역할별 모바일 화면과 키보드·안전 영역·첨부·딥링크를 처리함.
3. **서버 — apps/server**
	API·인증·실시간 채팅·정기 작업을 실행함.
4. **공유 코드 — packages**
	API 계약·인증·DB 스키마·환경 검증·공용 UI를 재사용함.

## 사용 기술 — 어디에, 왜 사용했는지
<details>
<summary>TypeScript·pnpm workspace·Turborepo</summary>
	- `apps/web`, `apps/native`, `apps/server`와 `packages/api`, `auth`, `db`, `env`, `ui`로 역할을 나눔.
	- TypeScript로 입력·응답·도메인 타입을 공유하고 workspace 의존성으로 연결함.
	- pnpm은 패키지·lockfile 관리, Turborepo는 패키지별 작업과 의존 순서·캐시 관리에 사용함.
</details>
<details>
<summary>React·Next.js App Router — 웹</summary>
	- `apps/web/src/app/`과 `apps/web/src/components/bambi/`에 공개 공고·커뮤니티와 역할별 화면을 구현함.
	- 구직자는 공고 탐색·상세·채팅·면접·포인트, 구인자는 공고 등록·광고·사업자 인증, 운영자는 회원·검수·신고·설정을 관리함.
	- Tailwind CSS와 `packages/ui` 공용 컴포넌트를 이용하여 반응형 화면을 구성함. 기존 디자인 토큰을 재사용하며 임의 픽셀·색상 반복을 줄임.
	- Tiptap은 공고·콘텐츠 리치 편집, Next.js 메타데이터는 공개 페이지 SEO, GA4 이벤트는 프로모션과 핵심 사용자 행동 계측에 사용함.
</details>
<details>
<summary>React Native·Expo·Expo Router — 앱</summary>
	- `apps/native/app/`은 역할별 라우팅, `apps/native/src/`은 화면 구성·공용 UI·통신 코드를 담당함.
	- Expo Router, Safe Area, 키보드 제어, Reanimated·gesture-handler와 bottom sheet로 모바일 탐색과 입력 UX를 구성함.
	- HeroUI Native·Uniwind는 앱의 공용 UI·스타일 구성에 사용함. 웹의 DOM·CSS를 그대로 앱에 붙이는 방식이 아니라 네이티브 화면에 맞게 구성함.
	- 이미지 선택·가공, 문서 선택, WebView, 딥링크와 SecureStore를 필요한 기능에서 사용함.
	- 운영자 기반 PR #333은 공통 셸·다이얼로그와 SAF 파일 저장 기반을 추가한 검토 대기 작업임.
</details>
<details>
<summary>oRPC·TanStack Query·Zod</summary>
	- `packages/api/src/routers/bambi/`는 공고·회원·포인트·운영 API를 제공함.
	- `apps/native/src/lib/orpc.ts`는 타입 안전 클라이언트와 QueryClient를 생성하고 네이티브 세션 쿠키 또는 게스트 토큰을 요청에 연결함.
	- TanStack Query로 조회·캐시·mutation 이후 무효화를 관리하고 Zod로 요청 값을 검증함.
	- 웹·앱은 같은 서버 계약을 사용하되 로그인 쿠키 전송과 게스트 처리 방식은 실행 환경에 맞게 분기함.
</details>
<details>
<summary>Fastify·Socket.IO·SSE</summary>
	- `apps/server/src/index.ts`, `plugins/`가 HTTP 서버·인증 브리지·정기 작업을 구성함.
	- `apps/server/src/bambi-realtime.ts`가 실시간 채팅 연결을 담당함. 메시지, 읽음 상태, 입력 중 표시, 접속 상태를 화면 캐시와 연결함.
	- PR #291은 사용자 presence, #301은 채팅 상대 접속·평균 응답 시간과 공고 메타데이터 표시를 다룸.
	- 재연결·만료 후 서버의 정본 데이터를 다시 조회하고 차단·퇴장 등 권한 상태에 맞게 정보 노출을 제한하는 보완을 수행함.
</details>
<details>
<summary>PostgreSQL·Drizzle ORM</summary>
	- `packages/db/src/schema/bambi.ts`와 `packages/db/src/migrations/`로 회원·업체·공고·채팅·포인트·신고 등의 관계와 변경 이력을 관리함.
	- 포인트 차감·보상·등급·결제는 서로 다른 정책이므로 잔액 변화만으로 등급이 잘못 바뀌지 않도록 수정함(PR #210·#270).
	- migration 번호·journal·snapshot을 함께 관리하고 기능 브랜치 통합 시 중복과 충돌을 확인함.
</details>
<details>
<summary>Better Auth·PortOne·GCS</summary>
	- Better Auth는 웹·앱 세션과 역할별 인증에 사용함. PortOne은 본인인증 연동에 사용하며 결제 SDK 설치만으로 모든 결제가 PG 연동이라고 단정하지 않음.
	- PR #308은 비회원 본인인증 결과를 회원가입에서 재사용하는 작업임.
	- GCS는 이미지·서류·첨부 저장에 사용함. 개발 환경의 로컬 이미지 조회 경로는 별도로 존재함.
	- PR #304는 이미 승인된 업소의 재승인 문제와 사업자 서류 행 UI를 개선함. 파일명·미리보기·다운로드·삭제와 심사 상태가 일치하도록 처리함.
</details>
<details>
<summary>Vitest·Biome/Ultracite·GitHub Actions·Docker·Cloud Run</summary>
	- 타입 검사와 Vitest로 공용 로직·API·화면 데이터 처리를 검증함. Biome/Ultracite로 포맷·린트를 검사함.
	- `.github/workflows/deploy-server.yml`은 Docker 이미지 빌드와 Cloud Run 서버 배포를 구성함.
	- Vercel 팀 접근 권한 때문에 차단된 preview와 실제 코드 빌드 실패는 구분해서 기록함.
	- 문서에 옮긴 과거 테스트 결과는 당시 PR·대화의 검증 기록이며 이번 아카이브에서 앱 전체를 다시 실행한 결과는 아님.
</details>

## 웹 개발 내용
<details>
<summary>웹 기능별 구현·수정과 연결 PR</summary>
	1. 수집 공고 이미지 편집: PR #82. 대형 이미지 직렬화와 서버 body 한도로 발생하는 413/Failed to fetch를 다루고 편집·저장 흐름을 정리함.
	2. 팝업·광고·계측: PR #98·#111·#123·#135·#268. 대상·기간·노출, 이미지 크기, GA4 이벤트, SEO와 광고 배치를 개선함.
	3. 채팅·면접·접속: PR #71·#121·#149·#154·#289·#291·#301. 첨부 표시, 동시 전송 순서, 확인창과 상대 상태·응답 시간을 개선함.
	4. 인증·검수·제재: PR #100·#152·#168·#172·#180·#183·#188·#197·#206·#275·#304. 사업자 서류·재심사, 사용자·신고 조치와 테스트 계정 기능을 다룸.
	5. 포인트·커뮤니티: PR #210·#218·#221·#227·#233·#246·#270·#294. 포인트 내역, 비밀글·후기, 다중 게시판 공지, 배치·탐색, 수집 게시판 관리를 구현함.
	6. 진행 중 웹 PR: #235 포인트몰 동적 진열·뽑기·보상, #250 전역 다크모드, #308 본인인증 재사용은 수집 시점 Open임. 병합 완료 목록에 합치지 않음.
</details>

## 앱 개발 내용과 현재 상태
**운영자 앱**: 공통 기반 #333과 기능 PR #353~#371은 Open임. 구현·검토 단계이며 배포 완료로 표시하지 않음.
<details>
<summary>운영자 앱 — 공통 기반과 19개 기능 PR</summary>
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
</details>
<details>
<summary>구직자 앱 — 신규 PR #379~#385와 검증 결과</summary>
	**최신 상태**: 2026-09-10, 모두 mobile 대상 Open임. #379~#384는 기능 구현·검토 대기, #385는 구현 보류 조건을 정리한 문서 PR임.
	**검증 구분**: 아래는 PR 작성자가 기록한 Android AVD·자동 테스트 결과이며 이번 문서화에서 재실행한 결과가 아님.
	<details>
	<summary>#379 feat(native): 구직자 수다방 전체 기능 연결</summary>
		[원본 PR](https://github.com/beyondsoft-kr/bambi-app/pull/379) · **OPEN** · `feat/native-seeker-community` → `mobile`
		Closes #372

		### 요약

		mobile의 수다방 준비 화면을 게시판 탐색·글·댓글 상호작용과 게스트·법률자문·수집 게시글을 지원하는 Expo SDK 56 화면으로 교체합니다.

		- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-community-design.md`

		### 주요 변경

		- 홈 수다방 미리보기와 게시판 허브·검색·필터·페이지네이션 구현
		- 게시글 문서 편집·이미지 업로드와 생성·상세·수정·삭제 연결
		- 댓글·답글 CRUD, 추천·신고, 비밀글·익명·게스트 작성 지원
		- 법률자문·남성·미인증·정지 계정의 게시판 권한 적용
		- 수집 게시글 상세와 커뮤니티 알림 착지 경로 추가
		- 일반 구직자의 공지 작성 노출과 미인증 계정 범용 오류를 Android AVD QA에서 수정

		### 검증

		- Android Studio AVD / Expo Go: 홈 미리보기, 게시판, 검색, 글 CRUD, 추천, 댓글·답글, 신고, 남성·미인증 권한 확인
		- `pnpm --filter native test`: 39 files / 395 tests 통과
		- `pnpm --filter native check-types` 통과
		- `pnpm check` 통과
		- `git diff --check` 통과

		### 주의사항

		- DB migration과 신규 native 의존성은 없습니다.
		- 공유 개발 DB 기반 community 통합 테스트 일부는 기존 `board_key`·픽스처 잔존과 충돌하며 상세 결과를 설계서에 기록했습니다.
		- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.
	</details>
	<details>
	<summary>#380 feat(native): 구직자 고객센터와 상담 채팅 연결</summary>
		[원본 PR](https://github.com/beyondsoft-kr/bambi-app/pull/380) · **OPEN** · `feat/native-seeker-support` → `mobile`
		Closes #373

		### 요약

		구직자 mobile에 FAQ, 문의 글과 추가 답변, 회원·비회원 1:1 상담 채팅을 추가합니다. 최신 develop의 support 계약과 문구를 공유하고 UI만 Expo SDK 56, HeroUI Native, Uniwind로 구현했습니다.

		- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-support-design.md`

		### 주요 변경

		- 고객센터 홈과 FAQ 목록·펼침 구현
		- 문의 작성·목록·상세·추가 답변과 상태 표시 연결
		- 회원 상담방 목록·상세·메시지·읽음 처리 구현
		- 비회원 HMAC 상담 세션 endpoint와 SecureStore 토큰 수명주기 추가
		- 문의 문서 편집·이미지 업로드와 markdown 이용 가이드 지원
		- 문의·문의 채팅 알림의 native 착지 경로 추가

		### 검증

		- Android Studio AVD / Expo Go: 문의 작성·목록·상세·추가 답변, 회원 상담, 비회원 상담 메시지 왕복 확인
		- `pnpm --filter native test`: 39 files / 393 tests 통과
		- `pnpm --filter native check-types` 통과
		- `pnpm check` 통과
		- `git diff --check` 통과

		### 주의사항

		- `expo-asset`, `expo-file-system` SDK 56 호환 의존성과 lockfile 변경이 포함됩니다.
		- DB migration은 없습니다.
		- 개발 DB에 공개 FAQ가 없어 AVD에서는 빈 상태를 확인했고 FAQ 변환·표시 규칙은 자동 테스트로 검증했습니다.
		- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.
	</details>
	<details>
	<summary>#381 feat(native): 구직자 공고 탐색과 포인트 기능 확장</summary>
		[원본 PR](https://github.com/beyondsoft-kr/bambi-app/pull/381) · **OPEN** · `feat/native-seeker-marketplace-points` → `mobile`
		Closes #374

		### 요약

		구직자 mobile 홈에 최신 develop의 프리미엄 배너, 고급 공고 필터, HIT와 포인트 공고 보상 흐름을 연결합니다.

		- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-marketplace-points-design.md`

		### 주요 변경

		- 프리미엄 배너 3개 슬롯과 실제 소재·문의 폴백·링크 처리
		- 지역·세부지역·업종·최소 시급·인증·당일면접·초보 필터와 초기화 구현
		- 순수·수집 공고 API에 선택 boolean 필터 연결
		- 유료 공고 성과 기준 HIT 표시와 대상 제외 정책 적용
		- 포인트 공고 보상 상태·수령·중복·쿨다운 처리
		- 보유 혜택의 적용 가능 공고 선택과 최종 확인 흐름 연결

		### 검증

		- Android Studio AVD / Expo Go: 배너 실제 소재·빈 슬롯 폴백 확인
		- 고급 필터 적용 결과 57→2건, 초기화 후 2→57건 확인
		- 포인트몰 0P와 50,000P 상품의 잔액 부족 상태 확인
		- `pnpm --filter native test`: 39 files / 384 tests 통과
		- `pnpm --filter native check-types` 통과
		- `pnpm check` 통과
		- `git diff --check` 통과

		### 주의사항

		- DB migration과 신규 의존성은 없습니다.
		- 개발 DB에 HIT·공고 보상 대상 데이터가 없어 해당 경계·중복 수령·쿨다운은 자동 테스트로 검증했습니다.
		- 공고 조회 API 입력이 확장되지만 기존 호출은 기본값으로 동일하게 동작합니다.
		- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.
	</details>
	<details>
	<summary>#382 feat(native): 구직자 공고 상세와 후기 열람 안전 흐름 연결</summary>
		[원본 PR](https://github.com/beyondsoft-kr/bambi-app/pull/382) · **OPEN** · `feat/native-seeker-job-detail` → `mobile`
		Closes #375

		### 요약

		구직자 공고 상세에 인증 연락처, 채팅 사전 안전 확인, 후기 목록과 포인트 열람을 추가하고 후기 차감의 잔액 부족·중복 요청을 안전하게 처리합니다.

		- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-job-detail-design.md`

		### 주요 변경

		- 공고 메타데이터·등록자·후기 평균과 건수 표시
		- 인증 구인자 전화번호 노출과 Android 전화 앱 연결
		- 로그인·구직자 프로필·휴대폰 인증·공고 상태의 채팅 사전 확인 화면 추가
		- 후기 목록·페이지네이션·익명 표시와 내 후기 무료 열람 구현
		- 타인 후기 포인트 확인창과 본문 잠금 해제 연결
		- 원장 잔액 부족을 사용자 BAD_REQUEST 문구로 변환
		- 사용자·후기별 external key와 음수 거래 중복 검사로 재차감 방지

		### 검증

		- Android Studio AVD / Expo Go: 인증 연락처·전화 앱, 사전 확인 4단계, 채팅방 생성 확인
		- 익명 후기·별점·10P 확인창과 0P 잔액 부족 문구 확인
		- 첫 열람 후 0P, 앱 재실행 뒤 같은 후기 재열람 후에도 0P 유지 확인
		- `pnpm --filter native test`: 39 files / 384 tests 통과
		- `pnpm --filter native check-types` 통과
		- 변경 파일 Ultracite와 `git diff --check` 통과

		### 주의사항

		- DB migration과 신규 의존성은 없습니다.
		- API 후기 DB 테스트는 공유 개발 DB의 면접 상태·후기 unique 잔존·공고 인증 시드 충돌로 5건 중 1건 통과했습니다. 수정된 잔액 부족과 중복 열람 경로는 AVD에서 실제 API 왕복으로 재검증했습니다.
		- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.
	</details>
	<details>
	<summary>#383 feat(native): 구직자 채팅 상태와 면접 정보 동등성 구현</summary>
		[원본 PR](https://github.com/beyondsoft-kr/bambi-app/pull/383) · **OPEN** · `feat/native-seeker-chat-parity` → `mobile`
		Closes #376

		### 요약

		구직자 mobile 채팅에 최신 develop의 상대 접속 상태·평균 응답시간, 면접 확인 정책과 공고·면접 정보 패널을 연결합니다.

		- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-chat-parity-design.md`

		### 주요 변경

		- 사용자 presence lifecycle과 server SSE·Socket.IO 상태 전파 구현
		- 온라인·오프라인·실시간 연결·평균 응답시간 표시
		- 차단·탈퇴·나간 방에서 presence와 응답 정보 차단
		- 면접 및 연락처 공개에 공통 확인창 적용
		- 확인·거절·우상단 닫기·Android back과 중복 실행 방지 정책 반영
		- 공고·면접 정보 패널과 공고 이동·인증 연락처 구현
		- 사용자 presence, 수집 게시판 편집 정본, 채팅 응답 활동 migrations 0115~0117 포함

		### 검증

		- Android Studio AVD / Expo Go: 빈 방 숨김, 메시지 송신, 읽지 않음, 오프라인·대화 가능·실시간 연결 확인
		- 정보 패널의 공고·면접·연락처와 면접 거절·확정 확인
		- `pnpm --filter native test`: 38 files / 384 tests 통과
		- presence·응답시간 서비스: 2 files / 13 tests 통과
		- `pnpm --filter native check-types` 통과
		- `pnpm --filter @bambi-app/db exec drizzle-kit check` 통과
		- `pnpm check`, `git diff --check` 통과

		### 주의사항

		- 운영 DB에 Drizzle migration 0115, 0116, 0117을 순서대로 적용해야 합니다. `db:push`는 사용하지 않습니다.
		- server realtime/presence와 lockfile 변경이 포함됩니다.
		- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.
	</details>
	<details>
	<summary>#384 feat(native): 구직자 계정 상태와 이용 안내 경험 구현</summary>
		[원본 PR](https://github.com/beyondsoft-kr/bambi-app/pull/384) · **OPEN** · `feat/native-seeker-account-experience` → `mobile`
		Closes #377

		### 요약

		구직자 mobile에 계정 경고·정지 안내, 5단계 이용 안내와 3단계 코치마크, 사용자용 메인 팝업을 추가합니다.

		- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-account-experience-design.md`

		### 주요 변경

		- 경고 배너 닫기·제재별 재노출과 정지 사유·이의 신청 안내 구현
		- 닫을 수 없는 정지 배너와 제한 상태 우선 표시
		- 5단계 이용 안내의 이전·다음·스와이프·건너뛰기·완료 구현
		- 완료 뒤 3단계 기능 코치마크와 설정의 다시 보기 연결
		- 메인 팝업 역할·화면·기간·순서·닫기·링크·24시간 숨김 구현
		- SecureStore 허용 문자 키와 비동기 저장·조회 적용
		- 키 형식 회귀 테스트 추가

		### 검증

		- Android Studio AVD / Expo Go: 팝업 2건 순서 노출과 각각의 24시간 숨김·재실행 미노출 확인
		- 경고 닫기 영속성과 정지 배너 지속 노출 확인
		- 5단계 안내와 3단계 코치마크 전체 조작 및 완료 저장 확인
		- `pnpm --filter native test`: 39 files / 388 tests 통과
		- `pnpm --filter native check-types` 통과
		- `pnpm check`, `git diff --check` 통과

		### 주의사항

		- DB migration과 신규 의존성은 없습니다.
		- 기존 잘못된 `:` SecureStore 키는 저장 단계에서 거부됐으므로 별도 데이터 migration은 필요하지 않습니다.
		- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.
	</details>
	<details>
	<summary>#385 docs(native): 원격 푸시 알림 구현 보류 조건 정리</summary>
		[원본 PR](https://github.com/beyondsoft-kr/bambi-app/pull/385) · **OPEN** · `feat/native-push-notifications` → `mobile`
		Closes #378

		### 요약

		Expo 계정·프로젝트와 Android FCM·iOS APNs 자격이 준비되지 않아 보류한 원격 푸시 알림의 구현 범위, 재개 조건과 검증 계획을 문서로 고정합니다.

		- 보류 설계: `docs/superpowers/plans/2026-09-10-native-push-notifications-design.md`

		### 주요 변경

		- 현재 foreground SSE 알림과 원격 푸시 전달 계층의 경계 정리
		- Expo SDK 56·expo-notifications 기반 권한·토큰 수명주기 계획
		- 서버 토큰 저장·발송 실패 격리·invalid token 처리 계획
		- foreground·background·cold start 딥링크와 badge 동기화 계획
		- Drizzle migration과 Expo·FCM·APNs secret 관리 원칙 정리
		- 다른 구직자 브랜치에 의존하지 않는 재개 방식 명시

		### 검증

		- 설계 문서 외 코드·의존성·DB·API·server 변경 없음 확인
		- 최신 `origin/mobile` 기준 독립 브랜치와 원격 동기화 확인

		### 주의사항

		- 이 PR은 기능을 활성화하지 않는 보류 문서 PR입니다.
		- Expo projectId, FCM, APNs 자격과 build profile이 준비되기 전에는 구현하지 않습니다.
		- DB migration 및 배포 영향은 없습니다.
	</details>
</details>

## 개발 전 준비
1. 웹은 최신 develop, 앱은 최신 mobile을 기준으로 작업 브랜치와 worktree를 분리함.
2. 기존 컴포넌트·훅·API·DB 정책과 관련 계획서를 조사함.
3. docs/superpowers/plans에 요구사항·변경 파일·예외·검증 방법을 작성함.
4. DB 변경은 migration·journal·snapshot을 함께 관리함.
5. worktree별 실행 포트와 로컬 이미지 저장 위치를 확인함.

## 코드 생성과 리뷰
1. 설계서의 완료 조건에 맞춰 API·DB·웹·앱 변경을 구현함.
2. 공용 컴포넌트·상수·서비스를 재사용하고 역할별 권한과 오류 상태를 확인함.
3. 변경 패키지 타입 검사·Vitest·Biome·diff 검사를 수행함.
4. 화면은 키보드·스크롤·빈 상태·재연결·뒤로가기를 검토함.
5. PR에 원인·변경·migration·검증·남은 확인·Closes 이슈를 기록함.

## 사용한 스킬과 토큰 절감
<details>
<summary>스킬 적용 방식과 확인 범위</summary>
	`skills-lock.json`의 외부 스킬에는 인증, Expo UI·배포·개발 클라이언트, native-data-fetching, Next.js, shadcn, HeroUI Native, Turborepo, Ultracite, React·React Native 성능, 로그 분석과 기기 검증 관련 스킬이 존재함. 설치 사실만으로 모든 기능에서 해당 스킬을 호출했다고 주장하지 않음.

	설계서·대화에서는 계획 작성, 디버깅, 기존 구현 재사용, 코드 리뷰와 완료 전 검증을 반복 적용한 사실을 확인함. 별도 대화에서 개인 `ui-ux-visual-quality` 스킬과 Bambi 프로필·다크모드 감사 문서를 저장소 밖에 보관한 기록도 확인함. 개인 규칙 원문은 프로젝트 Git에 넣지 않기로 한 기존 결정을 존중하고 적용 사실만 정리함.

	토큰 절감률은 계측 데이터가 없으므로 새 수치를 만들지 않음. 계획서 재사용, 관련 파일만 제공, 공용 컴포넌트 재사용, 패키지별 검사로 반복 탐색과 재작업을 줄인 방식을 기술함.
</details>

## 트러블슈팅
1. **대형 이미지 저장 실패 — PR #82**
	- 증상: Failed to fetch·HTTP 413으로 저장 실패함.
	- 원인: Base64 이미지 요청이 서버 body 한도에서 차단됨.
	- 조치: 서버 수신 한도와 검증 상한을 맞추고 직렬화·리사이즈 흐름을 보완함.
2. **채팅 상태와 화면 표시 불일치 — PR #291·#301**
	- 확인: presence 만료·재연결, 차단·퇴장, 메시지 응답 활동을 대조함.
	- 조치: 서버 집계 기준과 캐시 재조회·갱신 경로를 연결함.
3. **사업자 인증과 서류 UI 불일치 — PR #304**
	- 조치: 승인된 업소의 불필요한 재승인을 막고 서류 행의 미리보기·다운로드·삭제 표시를 통일함.
4. **진행 중 앱의 DB 검증 실패**
	- 커뮤니티·후기·공고 탐색·문의의 일부 DB 검증에 실패 또는 종료 정리 오류가 남아 있음.
	- native 테스트 통과와 전체 기능 검증 완료를 구분하고 격리 DB 재검증을 남김.
5. **Vercel preview 차단**
	- 팀 접근 권한으로 막힌 배포와 코드 빌드 실패를 구분하여 기록함.

## 날짜별 작업 일지
PR 작성일 기준이며, 현재 상태를 함께 표시함. 닫힌 대체 PR은 독립 완료 기능으로 중복 집계하지 않음.
<details>
<summary>2026-08 작업 이력</summary>
	- **08-04 · 병합** — [#71 fix: 수다방 내비게이션·이름 정책·채팅 안 읽음 집계 정비](https://github.com/beyondsoft-kr/bambi-app/pull/71)
	- **08-05 · 병합** — [#82 feat: 운영자 수집 공고 상세 이미지 편집 추가](https://github.com/beyondsoft-kr/bambi-app/pull/82)
	- **08-05 · 닫힘** — [#86 fix: 구직자 면접·모바일 배포 검수 오류 수정](https://github.com/beyondsoft-kr/bambi-app/pull/86)
	- **08-06 · 병합** — [#98 feat: 팝업 대상 노출·이벤트 공지·기간 할인 운영 확장 (#97)](https://github.com/beyondsoft-kr/bambi-app/pull/98)
	- **08-07 · 병합** — [#100 fix: 모바일 배포 QA 보완 및 사업자 인증 서류·SEO 확장 (#99)](https://github.com/beyondsoft-kr/bambi-app/pull/100)
	- **08-07 · 병합** — [#111 fix: 모바일 팝업 이미지 크기 조절 — 실제 이미지·선택 영역 실시간 반영](https://github.com/beyondsoft-kr/bambi-app/pull/111)
	- **08-10 · 병합** — [#121 fix: 모바일 채팅 첨부 레이아웃·구인 관리 카드 UX 개선](https://github.com/beyondsoft-kr/bambi-app/pull/121)
	- **08-10 · 병합** — [#123 feat: GA4 프로모션·핵심 행동 계측 확장 + 배너 편집 UX 개선](https://github.com/beyondsoft-kr/bambi-app/pull/123)
	- **08-11 · 병합** — [#130 fix: 전체공고 48건 배치·끌어올리기 현황 UX 개선](https://github.com/beyondsoft-kr/bambi-app/pull/130)
	- **08-11 · 병합** — [#135 feat: 기존 공개 영역 SEO·공공 구직정보 보강](https://github.com/beyondsoft-kr/bambi-app/pull/135)
	- **08-11 · 병합** — [#140 fix: 성과 분석 게재 구분 뱃지 가독성 개선](https://github.com/beyondsoft-kr/bambi-app/pull/140)
	- **08-12 · 병합** — [#147 fix: 테스트 사이트 공고·결제관리 QA 결함 개선](https://github.com/beyondsoft-kr/bambi-app/pull/147)
	- **08-12 · 병합** — [#149 fix: 채팅 첨부 UI와 동시 전송 순서 개선](https://github.com/beyondsoft-kr/bambi-app/pull/149)
	- **08-12 · 병합** — [#152 feat: 사업자 인증 변경사항 미제출 및 재심사 흐름 개선](https://github.com/beyondsoft-kr/bambi-app/pull/152)
	- **08-12 · 병합** — [#154 fix: 모바일 면접·사업자 인증·스크롤 QA 개선](https://github.com/beyondsoft-kr/bambi-app/pull/154)
	- **08-12 · 병합** — [#156 fix: 구직자 공고 카드 정보 순서 개선](https://github.com/beyondsoft-kr/bambi-app/pull/156)
	- **08-13 · 병합** — [#168 feat: 회원 프로필·신고 처리·커뮤니티 익명·팝업 관리 통합](https://github.com/beyondsoft-kr/bambi-app/pull/168)
	- **08-13 · 병합** — [#172 fix: 운영자 채팅·커뮤니티 QA 문제 개선](https://github.com/beyondsoft-kr/bambi-app/pull/172)
	- **08-14 · 병합** — [#175 fix: 댓글 제한 빈 영역 및 로그인 전 팝업 노출 개선](https://github.com/beyondsoft-kr/bambi-app/pull/175)
	- **08-14 · 병합** — [#180 fix: 신고 처리 사유와 팝업 노출 흐름 개선](https://github.com/beyondsoft-kr/bambi-app/pull/180)
	- **08-14 · 병합** — [#183 fix: 최초 사업자 인증 심사 중 서류 첨부 허용](https://github.com/beyondsoft-kr/bambi-app/pull/183)
	- **08-14 · 병합** — [#188 fix: 프로필·신고 조치와 사업자 인증 흐름 개선](https://github.com/beyondsoft-kr/bambi-app/pull/188)
	- **08-18 · 병합** — [#195 feat: 운영자 수집 공고 페이지 복귀·일괄 삭제 UX 개선](https://github.com/beyondsoft-kr/bambi-app/pull/195)
	- **08-18 · 병합** — [#197 feat: 신고·경고 운영 흐름과 페이지네이션 개선](https://github.com/beyondsoft-kr/bambi-app/pull/197)
	- **08-19 · 병합** — [#206 fix: 계정 제재와 운영자 QA 동작 개선](https://github.com/beyondsoft-kr/bambi-app/pull/206)
	- **08-19 · 병합** — [#210 feat: 포인트 관리·공고 결제 사용과 회원 포인트 내역 개선](https://github.com/beyondsoft-kr/bambi-app/pull/210)
	- **08-20 · 병합** — [#218 feat: 비밀글·후기 포인트·콘텐츠 이력 통합](https://github.com/beyondsoft-kr/bambi-app/pull/218)
	- **08-20 · 병합** — [#221 fix: 게시판 홈 배치 Biome 예외 주석 제거](https://github.com/beyondsoft-kr/bambi-app/pull/221)
	- **08-20 · 병합** — [#227 fix: 비밀글 열람·공고 결제·글 관리 UI 안정화](https://github.com/beyondsoft-kr/bambi-app/pull/227)
	- **08-21 · 병합** — [#233 feat: 공지 다중 게시판 노출·유형별 포인트 광고 보상 통합](https://github.com/beyondsoft-kr/bambi-app/pull/233)
	- **08-21 · 검토 대기** — [#235 feat: 포인트몰 동적 진열·랜덤 뽑기·아이템 보상 통합](https://github.com/beyondsoft-kr/bambi-app/pull/235)
	- **08-25 · 병합** — [#246 feat: 메인·수다방 게시판 배치 분리 및 글 상세 이전·다음 탐색](https://github.com/beyondsoft-kr/bambi-app/pull/246)
	- **08-26 · 검토 대기** — [#250 feat: 웹 전역 수동 다크모드와 UI 대비 정리](https://github.com/beyondsoft-kr/bambi-app/pull/250)
	- **08-26 · 병합** — [#254 fix: 공고 상세설명 보존·운영자 본문 이미지 검수 개선](https://github.com/beyondsoft-kr/bambi-app/pull/254)
	- **08-26 · 병합** — [#260 fix: 사용자 선택 열·검색 버튼·신고창·검수 카드 비색상 레이아웃 정리](https://github.com/beyondsoft-kr/bambi-app/pull/260)
	- **08-28 · 병합** — [#268 feat: 공개 채용·커뮤니티 광고 rail·큐레이션 UI 개선](https://github.com/beyondsoft-kr/bambi-app/pull/268)
	- **08-28 · 병합** — [#270 fix: 공고 결제 포인트 사용 시 회원 등급 유지](https://github.com/beyondsoft-kr/bambi-app/pull/270)
	- **08-28 · 병합** — [#272 fix: 회원 등급 뱃지 아이콘 잘림 해소](https://github.com/beyondsoft-kr/bambi-app/pull/272)
	- **08-31 · 병합** — [#275 feat: 운영자 가계정 생성·역할별 기능 검증 및 로컬 미디어 정합성](https://github.com/beyondsoft-kr/bambi-app/pull/275)
</details>
<details>
<summary>2026-09 작업 이력</summary>
	- **09-02 · 병합** — [#279 feat(web): 역할별 반응형 온보딩·코치마크·코드 미리보기](https://github.com/beyondsoft-kr/bambi-app/pull/279)
	- **09-03 · 병합** — [#289 feat(web): 연락처 공개·면접 확정 전 확인창 추가](https://github.com/beyondsoft-kr/bambi-app/pull/289)
	- **09-04 · 병합** — [#291 feat: 사용자 온라인 접속 상태·실시간 운영자 표시](https://github.com/beyondsoft-kr/bambi-app/pull/291)
	- **09-04 · 병합** — [#294 feat: 수집 커뮤니티 게시판별 저장·관리자 글·댓글 편집](https://github.com/beyondsoft-kr/bambi-app/pull/294)
	- **09-04 · 병합** — [#301 fix: 채팅 상대 접속·평균 응답시간 및 공고 메타데이터 뱃지](https://github.com/beyondsoft-kr/bambi-app/pull/301)
	- **09-07 · 병합** — [#304 fix(web): 승인 완료 업소 재승인 방지·사업자 서류 행 통일](https://github.com/beyondsoft-kr/bambi-app/pull/304)
	- **09-08 · 검토 대기** — [#308 fix(web): 비회원 본인인증을 회원가입에서 재사용](https://github.com/beyondsoft-kr/bambi-app/pull/308)
	- **09-09 · 검토 대기** — [#333 feat(native): 운영자 콘솔 공통 셸·다이얼로그·SAF 파일 저장 기반](https://github.com/beyondsoft-kr/bambi-app/pull/333)
	- **09-09 · 닫힘** — [#334 feat(native): 운영자 공고 검수 상세·감지 문구 강조](https://github.com/beyondsoft-kr/bambi-app/pull/334)
	- **09-09 · 닫힘** — [#335 feat(native): 운영자 신고 상세·대상 후속 조치 구현](https://github.com/beyondsoft-kr/bambi-app/pull/335)
	- **09-09 · 닫힘** — [#336 feat(native): 운영자 사용자 상세·접속 상태·계정 조치 확장](https://github.com/beyondsoft-kr/bambi-app/pull/336)
	- **09-09 · 닫힘** — [#337 feat(native): 운영자 쪽지 리치 편집·대상 발송 구현](https://github.com/beyondsoft-kr/bambi-app/pull/337)
	- **09-09 · 닫힘** — [#338 feat(native): 운영자 공고 수정·노출 기간·삭제 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/338)
	- **09-09 · 닫힘** — [#339 feat(native): 운영자 채팅 열람·차단·첨부 저장 구현](https://github.com/beyondsoft-kr/bambi-app/pull/339)
	- **09-09 · 닫힘** — [#340 feat(native): 운영자 업소·팀 합류·면접 관리 화면 추가](https://github.com/beyondsoft-kr/bambi-app/pull/340)
	- **09-09 · 닫힘** — [#341 feat(native): 운영자 출석·회원 등급·포인트 정책 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/341)
	- **09-09 · 닫힘** — [#342 feat(native): 운영자 광고 상품·결제·포인트몰 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/342)
	- **09-09 · 닫힘** — [#343 feat(native): 운영자 게시물·댓글 일괄 조치 구현](https://github.com/beyondsoft-kr/bambi-app/pull/343)
	- **09-09 · 닫힘** — [#344 feat(native): 운영자 수다방 게시판 CRUD·배치 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/344)
	- **09-09 · 닫힘** — [#345 feat(native): 운영자 FAQ 리치 편집·공개 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/345)
	- **09-09 · 닫힘** — [#346 feat(native): 운영자 문의 채팅 답변·잠금·종료 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/346)
	- **09-09 · 닫힘** — [#347 feat(native): 운영자 금칙어 검색·CSV 일괄 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/347)
	- **09-09 · 닫힘** — [#348 feat(native): 운영자 후기 상태 검수 화면 추가](https://github.com/beyondsoft-kr/bambi-app/pull/348)
	- **09-09 · 닫힘** — [#349 feat(native): 운영자 팝업 리치 편집·이미지 가공·순서 미리보기 구현](https://github.com/beyondsoft-kr/bambi-app/pull/349)
	- **09-09 · 닫힘** — [#350 feat(native): 운영자 사이트 설정 섹션별 저장 구현](https://github.com/beyondsoft-kr/bambi-app/pull/350)
	- **09-09 · 닫힘** — [#351 feat(native): 운영자 매뉴얼 목차·표·링크 열람 구현](https://github.com/beyondsoft-kr/bambi-app/pull/351)
	- **09-09 · 닫힘** — [#352 feat(native): 운영자 크롤링·수집 콘텐츠·이미지 편집 구현](https://github.com/beyondsoft-kr/bambi-app/pull/352)
	- **09-09 · 검토 대기** — [#353 feat(native): 운영자 공고 검수 상세·감지 문구 강조](https://github.com/beyondsoft-kr/bambi-app/pull/353)
	- **09-09 · 검토 대기** — [#354 feat(native): 운영자 신고 상세·대상 후속 조치 구현](https://github.com/beyondsoft-kr/bambi-app/pull/354)
	- **09-09 · 검토 대기** — [#355 feat(native): 운영자 사용자 상세·접속 상태·계정 조치 확장](https://github.com/beyondsoft-kr/bambi-app/pull/355)
	- **09-09 · 검토 대기** — [#356 feat(native): 운영자 쪽지 리치 편집·대상 발송 구현](https://github.com/beyondsoft-kr/bambi-app/pull/356)
	- **09-09 · 검토 대기** — [#357 feat(native): 운영자 공고 수정·노출 기간·삭제 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/357)
	- **09-09 · 검토 대기** — [#358 feat(native): 운영자 채팅 열람·차단·첨부 저장 구현](https://github.com/beyondsoft-kr/bambi-app/pull/358)
	- **09-09 · 검토 대기** — [#359 feat(native): 운영자 업소·팀 합류·면접 관리 화면 추가](https://github.com/beyondsoft-kr/bambi-app/pull/359)
	- **09-09 · 검토 대기** — [#360 feat(native): 운영자 출석·회원 등급·포인트 정책 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/360)
	- **09-09 · 검토 대기** — [#361 feat(native): 운영자 광고 상품·결제·포인트몰 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/361)
	- **09-09 · 검토 대기** — [#362 feat(native): 운영자 게시물·댓글 일괄 조치 구현](https://github.com/beyondsoft-kr/bambi-app/pull/362)
	- **09-09 · 검토 대기** — [#363 feat(native): 운영자 수다방 게시판 CRUD·배치 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/363)
	- **09-09 · 검토 대기** — [#364 feat(native): 운영자 FAQ 리치 편집·공개 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/364)
	- **09-09 · 검토 대기** — [#365 feat(native): 운영자 문의 채팅 답변·잠금·종료 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/365)
	- **09-09 · 검토 대기** — [#366 feat(native): 운영자 금칙어 검색·CSV 일괄 관리 구현](https://github.com/beyondsoft-kr/bambi-app/pull/366)
	- **09-09 · 검토 대기** — [#367 feat(native): 운영자 후기 상태 검수 화면 추가](https://github.com/beyondsoft-kr/bambi-app/pull/367)
	- **09-09 · 검토 대기** — [#368 feat(native): 운영자 팝업 리치 편집·이미지 가공·순서 미리보기 구현](https://github.com/beyondsoft-kr/bambi-app/pull/368)
	- **09-09 · 검토 대기** — [#369 feat(native): 운영자 사이트 설정 섹션별 저장 구현](https://github.com/beyondsoft-kr/bambi-app/pull/369)
	- **09-09 · 검토 대기** — [#370 feat(native): 운영자 매뉴얼 목차·표·링크 열람 구현](https://github.com/beyondsoft-kr/bambi-app/pull/370)
	- **09-09 · 검토 대기** — [#371 feat(native): 운영자 크롤링·수집 콘텐츠·이미지 편집 구현](https://github.com/beyondsoft-kr/bambi-app/pull/371)
	- **09-10 · 검토 대기** — [#379 feat(native): 구직자 수다방 전체 기능 연결](https://github.com/beyondsoft-kr/bambi-app/pull/379)
	- **09-10 · 검토 대기** — [#380 feat(native): 구직자 고객센터와 상담 채팅 연결](https://github.com/beyondsoft-kr/bambi-app/pull/380)
	- **09-10 · 검토 대기** — [#381 feat(native): 구직자 공고 탐색과 포인트 기능 확장](https://github.com/beyondsoft-kr/bambi-app/pull/381)
	- **09-10 · 검토 대기** — [#382 feat(native): 구직자 공고 상세와 후기 열람 안전 흐름 연결](https://github.com/beyondsoft-kr/bambi-app/pull/382)
	- **09-10 · 검토 대기** — [#383 feat(native): 구직자 채팅 상태와 면접 정보 동등성 구현](https://github.com/beyondsoft-kr/bambi-app/pull/383)
	- **09-10 · 검토 대기** — [#384 feat(native): 구직자 계정 상태와 이용 안내 경험 구현](https://github.com/beyondsoft-kr/bambi-app/pull/384)
	- **09-10 · 검토 대기** — [#385 docs(native): 원격 푸시 알림 구현 보류 조건 정리](https://github.com/beyondsoft-kr/bambi-app/pull/385)
</details>

## 전체 자료와 보존 기록
- [개인 저장소 — Bambi-app](https://github.com/vscodereader/Bambi-app)
- [PR 본문·파일·커밋·리뷰 색인](https://github.com/vscodereader/Bambi-app/blob/portfolio/portfolio/PR-INDEX.md)
- [진행 중 작업·변경 파일 전체](https://github.com/vscodereader/Bambi-app/blob/portfolio/portfolio/WORK-IN-PROGRESS.md)
- **기여 기준**: vscodereader와 대응 Git author 이력을 사용함. 팀 전체 기능을 단독 기여로 표시하지 않음.
- **자료 기준**: 2026-09-10 Git·PR·로컬 작업·대화 기록. 과거 테스트 수치는 당시 기록이며 이번 문서화에서 재실행한 결과가 아님.

<details>
<summary>이전 정리 원문 — 기존 내용 보존</summary>
	**1. 어떤 프로젝트인지**<br>bambi는 구직자와 구인 업체를 연결하는 채용·커뮤니티 플랫폼입니다. 공고 검색과 지원, 실시간 채팅과 면접 일정, 사업자 인증, 운영자 검수, 신고·경고, 커뮤니티, 광고·프로모션, 포인트·등급, 수집 공고 관리까지 통합했습니다.<br>Next.js 웹, React Native·Expo, Fastify, oRPC, Drizzle·PostgreSQL, Better Auth, shadcn UI, Turborepo로 이루어진 TypeScript 모노레포입니다. 이 문서에서는 최성원과 vscodereader의 활동만 본인 작업으로 분류했습니다.
	**<br>2. 어떻게 구현했는지**<br>apps/web·native·server와 packages/api·auth·db·ui로 책임을 분리했습니다. 화면에서 직접 DB를 다루지 않고 oRPC router와 service를 통과시키고 Drizzle schema와 순차 migration으로 데이터 모델을 관리했습니다. 운영 기능과 실제 서비스 흐름을 확장하면서 커뮤니티·채팅, 수집 공고 이미지 편집, 인증·검수, 신고·제재, 광고·GA4, 포인트, 온보딩, 접속 상태를 설계서 단위로 구현했습니다.**<br>**
	**3. 사용한 스킬**<br>ai-sdk, analyze-logs, better-auth-best-practices, building-native-ui, Expo CI/CD·deployment·dev-client·Tailwind, frontend-ui-engineering, HeroUI Native, native-data-fetching, Next.js best practices·cache components, review-logging-patterns, shadcn, turborepo, ultracite, Vercel composition·React·React Native best practices, web-design-guidelines를 사용했습니다.<br>brainstorming, writing-plans, TDD, systematic-debugging, browser QA, code review, verification-before-completion을 함께 적용했습니다.**<br>**
	**4. 만들기 전 진행한 과정**<br>최신 develop에서 별도 worktree와 type/작업명 브랜치를 만들었습니다. docs/superpowers/plans에 완료 조건, 변경 파일, 데이터 구조, API 계약, 화면 상태, 오류 처리, 테스트를 먼저 적었습니다. 관련 변경은 하나의 통합 설계와 PR로 묶고 커밋은 논리 단위로 나눴습니다.<br>worktree에 기존 server.env와 web.env를 복사하고 서버와 웹을 분리해 실행했습니다. 웹은 WATCHPACK_POLLING=true와 별도 포트를 사용했습니다. DB 변경은 db:push 대신 migration을 생성·적용하고 journal·snapshot 충돌을 확인했습니다.**<br>**
	**5. 코드 생성과 코드 리뷰**<br>설계서를 Claude가 직접 구현할 수 있을 정도로 파일 경로와 단계까지 구체화했습니다. Write/Edit 훅으로 Ultracite 수정을 실행하고 변경 패키지의 타입 검사·Vitest·API 테스트·git diff --check를 수행했습니다. UI는 데스크톱·모바일 상태, 키보드, 스크롤, 로딩·빈 상태까지 수동 QA했습니다.<br>PR은 CMU02 방식에 맞춰 변경 사항, migration, 검증, 남은 수동 확인, Closes 태그를 기록했습니다. 커밋 본문에는 원인, 구현, 영향, 검증을 남겼습니다. 최신 develop을 재반영하고 사용자가 직접 push했으며 최종 merge는 동료가 수행했습니다.**<br>**
	**6. 토큰을 줄인 방법**<br>AGENTS, Claude 설정, 프로젝트 스킬과 설계서를 장기 문맥으로 사용했습니다. 전체 저장소 대신 계획서, 관련 package, 기존 서비스·컴포넌트, 인접 테스트를 우선 제공했습니다. 작업을 API·DB·웹 상태·UI 단위로 나누고 Turborepo filter로 변경 패키지만 검사했습니다. 기존 UI·hook·service를 재사용해 생성 코드와 검토 범위를 줄였습니다.**<br>**
	**7. 에러와 트러블슈팅**<br>수집 공고 이미지 편집 PR #82에서 리뷰 중 대형 이미지 저장이 Failed to fetch와 413으로 실패했습니다. Base64 전체를 JSON으로 보내는 요청이 Fastify 기본 1MiB 제한에 애플리케이션 검증 전에 차단된 것이 원인이었습니다. 서버 수신 한도와 문서 검증 상한을 맞추고 대용량 입력을 재현했으며, 클라이언트의 다중 이미지 리사이즈 중 전체 직렬화를 줄였습니다.<br>Native 전체 타입 검사가 기존 지역 코드·nullable 필드 오류로 실패했을 때 변경 파일의 신규 오류와 기존 기준선 오류를 분리해 기록했습니다. Vercel preview의 팀 권한 부족도 코드 실패와 분리했습니다. 채팅·면접·presence 문제는 서버 집계 기준을 만들고 mutation 뒤 query 무효화, reconnect와 만료 테스트로 해결했습니다. 모바일 문제는 동적 viewport, 스크롤, 키보드 노출 조건으로 재현했습니다.<br>[GitHub PR 기록](https://github.com/beyondsoft-kr/bambi-app/pulls?q=is%3Apr+author%3Avscodereader)
	**3-A. 스킬 상세 분석**<br>**추정 기준**: 실제 토큰 계측값이 아니라 해당 종류의 작업 한 건에서 줄어든 입력·재탐색·재작업의 추정 범위입니다. 중복 적용되므로 합산하지 않았습니다.<br>• **analyze-logs**서버·API·채팅 오류에서 관련 이벤트만 필터링했습니다. 전체 로그를 읽는 대신 요청·시간·오류 범위를 좁혀 작업당 약 **30\~60%**를 절감했습니다.<br>• **better-auth-best-practices**회원가입, 본인인증 복귀, 세션, 역할별 접근을 구현·리뷰했습니다. 인증 설정·보안 규칙을 반복 조사하지 않아 인증 작업당 약 **20\~40%**를 절감했습니다.<br>• **building-native-ui**모바일 채팅, 키보드, 스크롤, 첨부 UI와 역할별 온보딩에 사용했습니다. 안전 영역·viewport·터치 규칙을 재설명하지 않아 화면 작업당 약 **15\~30%**를 절감했습니다.<br>• **expo-cicd-workflows**EAS 빌드·배포 워크플로를 검토할 때 사용했습니다. YAML 구조와 작업 디렉터리 규칙을 필요한 부분만 조회해 CI 작업당 약 **20\~40%**를 절감했습니다.<br>• **expo-deployment**모바일 배포 QA와 스토어·서버 배포 단계를 점검했습니다. 플랫폼별 전체 문서 대신 대상 단계만 확인해 배포 작업당 약 **15\~30%**를 절감했습니다.<br>• **expo-dev-client**네이티브 동작을 실제 기기에서 검증할 조건을 정했습니다. Expo Go 가능 여부와 재빌드 필요 여부를 먼저 판별해 작업당 약 **10\~25%**를 절감했습니다.<br>• **expo-tailwind-setup**Expo 스타일 구성의 참조 기준으로 설치했습니다. Metro·CSS·NativeWind 호환 조합의 시행착오를 줄여 설정 작업당 약 **15\~30%**를 절감했습니다.<br>• **native-data-fetching**채팅, 면접, 알림, presence와 mutation 후 갱신에 사용했습니다. 요청·캐시·오류·재연결 패턴을 재설계하지 않아 데이터 작업당 약 **20\~40%**를 절감했습니다.<br>• **next-best-practices**공개 채용·커뮤니티·운영자 화면의 App Router, 서버·클라이언트 경계, SEO를 검토했습니다. Next.js 전체 문서 대신 관련 규칙만 대조해 화면 작업당 약 **15\~30%**를 절감했습니다.<br>• **next-cache-components**목록·공개 페이지의 캐시와 재검증 판단 기준으로 사용했습니다. 버전별 캐시 API를 넓게 재검색하지 않아 캐시 작업당 약 **20\~40%**를 절감했습니다.<br>• **review-logging-patterns**채팅·인증·운영자 기능이 남겨야 할 구조화 로그를 검토했습니다. 정해진 필드 체크리스트로 누락만 확인해 로깅 리뷰당 약 **20\~40%**를 절감했습니다.<br>• **shadcn**기존 공용 버튼·폼·카드·대화상자를 검색하고 조합했습니다. 새 컴포넌트를 처음부터 만들지 않아 UI 작업당 약 **15\~30%**를 절감했습니다.<br>• **turborepo**web·native·server와 api·auth·db·ui의 영향 범위를 나누고 filter로 검사했습니다. 저장소 전체를 매번 읽고 실행하지 않아 모노레포 작업당 약 **20\~50%**를 절감했습니다.<br>• **ultracite**Write/Edit 직후 Biome 포맷·린트·접근성 문제를 자동 수정했습니다. 기계적 오류를 모델에게 설명하고 다시 고치는 왕복을 줄여 리뷰당 약 **10\~25%**를 절감했습니다.<br>• **vercel-composition-patterns**복잡한 운영 화면과 카드 UI를 조합 가능한 컴포넌트로 나눴습니다. 검증된 compound component·context 패턴에서 선택해 설계당 약 **10\~25%**를 절감했습니다.<br>• **vercel-react-best-practices**React 렌더링, 데이터 요청과 번들 성능을 검토했습니다. 변경 파일을 알려진 병목 항목과 대조해 성능 리뷰당 약 **10\~30%**를 절감했습니다.<br>• **vercel-react-native-skills**모바일 리스트·키보드·애니메이션·채팅 렌더링을 검토했습니다. 병목 유형별 체크리스트를 사용해 모바일 성능 작업당 약 **15\~35%**를 절감했습니다.<br>• **web-design-guidelines**다크모드, 대비, 반응형, 접근성, 정보 계층을 QA했습니다. 화면을 공통 체크리스트에 대조해 UI 감사당 약 **10\~25%**를 절감했습니다.<br>• **ai-sdk**AI 생성·스트리밍 기능을 만들 때 쓰는 외부 스킬로 설치했습니다. 현재 본인 기여 이력에서 직접 만든 AI SDK 기능은 확인되지 않았습니다. 적용 시 공급자별 코드를 직접 조합하지 않아 AI 작업당 약 **20\~40%**를 절감합니다.<br>• **heroui-native**HeroUI Native·Uniwind 구성용 외부 스킬입니다. 현재 본인 기여 이력에서 독립 적용 결과는 확인되지 않았습니다. 적용 시 제공 컴포넌트와 테마를 조합해 UI 도입 작업당 약 **10\~25%**를 절감합니다.**<br>직접 생성·추가 구분**<br>이 문서의 본인 범위인 최성원·vscodereader가 내용을 직접 집필한 프로젝트 전용 스킬은 확인되지 않았습니다. **frontend-ui-engineering**은 저장소 내부의 맞춤 스킬이지만 최초 작성자는 HyeonJun이므로 본인이 만든 스킬로 분류하지 않았습니다. 이 스킬은 Bambi의 색상 토큰, 폰트, 반경, 레이아웃, 이미지·아이콘과 접근성 기준을 한 번에 제공해 UI 작업당 약 **20\~40%**를 절감했습니다. Better-T-Stack, Context7, shadcn, Next DevTools, Better Auth, Expo MCP는 공식 문서 전체를 복사하지 않고 필요한 API와 예제만 조회해 문서 확인 작업당 약 **20\~50%**를 절감했습니다.**8. 날짜별 작업 일지**<br>GitHub 작성자 vscodereader와 커밋 작성자 최성원만 본인 활동으로 포함했습니다.<br>• **2026-08-04** — 수집 공고 이미지 편집기의 설계·저장 구조·편집 화면·공개 상세 반영을 구현했습니다. 수다방 내비게이션, 이름 정책, 비밀글과 안 읽음 집계를 이슈·PR #68\~#71로 정비했습니다.<br>• **2026-08-05** — PR #82·#86으로 긴 이미지 자르기, 축별 리사이즈, 저장 용량 오류와 413 문제를 수정하고 면접 목록 갱신·인증 문구·모바일 배포 QA를 보완했습니다.<br>• **2026-08-06** — PR #98로 팝업의 대상별 노출, 이벤트 공지, 기간 할인 운영을 확장했습니다. 최신 develop 충돌 해결 계획을 작성하고 이미지 편집 migration 순서를 정리했습니다.<br>• **2026-08-07** — PR #100·#111로 사업자 서류 원본 저장·미리보기·다운로드, 채팅 미읽음, 모바일 인증 복귀, 운영자 메뉴, 팝업 크기 실시간 동기화를 수정했습니다.<br>• **2026-08-10** — PR #121·#123으로 모바일 채팅 첨부와 구인 관리 카드 UX를 개선하고 GA4 프로모션·핵심 행동 계측과 배너 편집 UX를 확장했습니다.<br>• **2026-08-11** — PR #130·#135·#140으로 전체공고 48건 배치·끌어올리기 현황, 공개 SEO·공공 구직정보, 성과 분석 뱃지 가독성을 개선했습니다.<br>• **2026-08-12** — PR #147·#149·#152·#154·#156으로 결제관리, 채팅 첨부 동시 전송 순서, 사업자 재심사, 모바일 면접·스크롤, 공고 카드 정보 순서를 연속 QA했습니다. develop과 migration 이력 충돌도 해결했습니다.<br>• **2026-08-13** — PR #168·#172로 회원 프로필, 신고 처리, 커뮤니티 익명, 팝업 관리와 운영자 채팅 QA를 통합했습니다. 게시판 권한과 팝업 위치의 하드코딩을 제거했습니다.<br>• **2026-08-14** — PR #175·#180·#183·#188로 로그인 전 팝업, 댓글 제한 빈 상태, 신고 사유·조치, 사업자 인증 서류 첨부, 프로필 업로드 흐름을 보완했습니다.<br>• **2026-08-18** — PR #195·#197로 수집 공고 관리 페이지 복귀·일괄 삭제, 신고·경고 운영과 목록 페이지네이션을 구현했습니다.<br>• **2026-08-19** — PR #206·#210으로 계정 제재와 운영자 채팅 QA를 고치고 포인트 관리, 공고 결제 사용, 회원 포인트 내역과 게시판 접근 정책을 구현했습니다. 포인트 화면의 하드코딩 스타일도 제거했습니다.<br>• **2026-08-20** — PR #218·#221·#227로 비밀글, 후기 포인트, 콘텐츠 이력, 동적 게시판 관리, 공고 결제와 글 관리 UI를 통합했습니다. 설계서를 먼저 작성하고 migration 이력을 재정렬했습니다.<br>• **2026-08-21** — PR #233·#235로 공지의 다중 게시판 노출, 유형별 광고 보상, 포인트몰 동적 진열·랜덤 뽑기·아이템 보상을 구현했습니다.<br>• **2026-08-25** — PR #246으로 메인과 수다방의 게시판 배치를 분리하고 글 상세의 이전·다음 탐색을 API와 UI에 추가했습니다.<br>• **2026-08-26** — PR #250·#254·#260으로 웹 전역 수동 다크모드, 공고 상세설명 보존과 운영자 이미지 검수, 사용자 선택 열·검색·신고창·검수 카드의 레이아웃을 개선했습니다.<br>• **2026-08-27** — 공고 검수 화면의 폰트 스케일과 임의 px 값을 제거하고 안전 UI의 14px 반경 하드코딩을 디자인 토큰으로 바꿨습니다.<br>• **2026-08-28** — PR #268·#270·#272로 공개 채용·커뮤니티 광고 rail과 큐레이션, 포인트 결제 후 등급 유지, 회원 등급 뱃지 잘림을 수정했습니다.<br>• **2026-08-31** — PR #275로 운영자 가계정 생성, 역할별 기능 검증, 인증 정책, 수동 등급 기준과 로컬 미디어 정합성을 구현했습니다.<br>• **2026-09-02** — PR #279로 역할별 반응형 온보딩, 코치마크, 코드 미리보기와 포인트몰 구매 시뮬레이션을 추가했습니다.<br>• **2026-09-03** — PR #289로 연락처 공개와 면접 확정 전에 확인 단계를 추가했습니다.<br>• **2026-09-04** — PR #291·#294·#301로 사용자 온라인·운영자 실시간 표시, 수집 커뮤니티의 게시판별 저장과 관리자 편집, 채팅 상대 접속·평균 응답시간과 공고 메타데이터 뱃지를 구현했습니다.
</details>

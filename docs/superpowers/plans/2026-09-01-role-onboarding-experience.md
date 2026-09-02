# 역할별 웹 온보딩·코치마크 Implementation Plan

> **For agentic workers:** 이 문서는 구현의 정본이다. 아래 범위·콘텐츠·상태 전이·이미지 명세·검증 항목을 임의로 줄이거나 바꾸지 않는다. 구현 중 코드와 문서가 어긋나면 문서를 먼저 갱신하고, 사용자 판단이 필요한 변화는 구현 전에 질문한다. 체크박스는 구현과 검증이 실제로 끝난 뒤에만 완료 처리한다.

**Goal:** 모바일 웹에서 성인 본인인증과 회원가입을 끝낸 신규 구직자·구인자에게 각 역할에 맞는 4페이지 전체 화면 온보딩을 한 번 보여주고, 끝까지 본 사용자가 `시작하기`를 누르면 역할 메인으로 이동해 실제 화면의 핵심 조작점을 코치마크로 안내한다. 공통 기능 4페이지 온보딩은 자동 노출하지 않고 계정 설정의 `온보딩 다시 보기`에서 제공한다.

**Base / Branch:** 최신 `origin/develop`의 `ad3533b4325af5f23ab19913bcbb5c9548d8e699`에서 `feat/role-onboarding-experience` 브랜치와 `C:\Users\user\bambi.worktrees\role-onboarding-experience` worktree를 생성했다. 구현 완료 전 최신 `develop`을 다시 반영하고 충돌과 마이그레이션 이력을 재확인한다.

**Scope:** 이번 PR은 `apps/web`만 구현한다. `apps/native`는 별도 Expo Router 애플리케이션이므로 웹 구현이 자동 적용되지 않는다. 네이티브 경로 `/(seeker)`, `/(employer)`는 향후 이식 시의 목적지만 문서화하고 이번 코드·테스트 범위에는 포함하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, Better Auth, TanStack Query, shadcn/base-ui, Tailwind CSS v4, browser `localStorage`/`sessionStorage`, Next Image, Vitest, 실제 밤비 웹 화면 캡처.

---

## 1. 확정 요구사항

1. 기존 성인 본인인증과 회원가입 기능은 변경하지 않는다. 가입이 완전히 성공해 Better Auth 사용자와 `bambi_profile` 역할이 만들어진 뒤에만 온보딩으로 진입시킨다.
2. 일반 로그인, 계정 복구, 비회원 인증, 기존 회원의 역할 라우팅은 현재 동작을 유지한다.
3. 신규 구직자 가입 흐름은 `구직자 온보딩 4장 → 시작하기 → /seeker → 구직자 코치마크`다.
4. 신규 구인자 가입 흐름은 `구인자 온보딩 4장 → 시작하기 → /employer → 구인자 코치마크`다. 업체 정보가 없는 신규 구인자도 `/employer`로 이동하며 기존 업체 정보 등록 게이트를 재사용한다.
5. 공통 온보딩은 4장으로 만들지만 신규 가입 직후 자동으로 보여주지 않는다. 계정 설정의 `온보딩 다시 보기`에서만 연다.
6. 운영자와 법률자문가는 자동 온보딩 대상이 아니다.
7. 온보딩 화면은 모바일 웹에서 전체 화면으로 표시하고 태블릿·데스크톱에서는 같은 정보를 반응형으로 재배치한다.
8. 각 슬라이드는 실제 밤비 화면을 휴대폰 프레임에 넣은 목업과 기존 밤비 로고·코럴 디자인 토큰·기존 아이콘을 조합한다. 브랜드 근거가 없는 신규 마스코트나 캐릭터를 만들지 않는다.
9. 구직자·구인자·공통 온보딩은 각각 정확히 4장이다.
10. 좌우 스와이프와 `이전`/`다음` 버튼을 모두 지원한다. 첫 장의 이전 버튼은 자리를 유지한 채 disabled 처리해 CTA 정렬이 흔들리지 않게 하고, 마지막 장의 다음 버튼은 `시작하기`로 바꾼다.
11. 페이지 점은 현재 위치만 표시하며 클릭 이동 기능을 제공하지 않는다.
12. 모든 자동 온보딩 페이지에 `건너뛰기`를 제공한다. 건너뛰기는 남은 역할 슬라이드와 코치마크를 모두 생략하고 역할 메인으로 이동한다.
13. 사용자가 자동 온보딩 첫 화면에 실제로 진입한 순간 해당 사용자·역할의 자동 온보딩을 완료 처리한다. 첫 장만 보고 탭·브라우저·앱을 종료해도 다음 실행에서 다시 자동 노출하지 않는다.
14. 완료 여부는 DB가 아니라 브라우저 `localStorage`에 사용자 ID별로 저장한다. 같은 기기의 다른 신규 계정은 각자 한 번씩 볼 수 있어야 한다.
15. 브라우저 데이터 삭제, 시크릿 모드, 다른 브라우저·기기, 앱 재설치 후 다시 나타날 수 있는 것은 허용한다.
16. 이미 가입된 사용자에게 배포 후 자동 노출하지 않는다. 온보딩 내용이 바뀌어도 기존 사용자에게 강제 재노출하지 않는다.
17. 설정의 다시 보기는 완료 기록을 만들거나 지우지 않는다. 다시 보기 중 종료해도 다음 로그인 자동 노출 상태에는 영향이 없다.
18. 역할별 다시 보기에서는 마지막 `시작하기` 뒤 해당 역할 메인으로 이동하고 역할 코치마크도 다시 보여준다. 공통 다시 보기에는 코치마크가 없다.
19. 온보딩 첫 화면에서 브라우저를 종료한 경우에는 코치마크도 다시 나타나지 않는다. 코치마크 실행 의도는 사용자가 마지막 `시작하기`를 눌렀을 때만 현재 탭의 `sessionStorage`에 만든다.
20. 신규 가입자가 `건너뛰기`를 누르면 코치마크 실행 의도도 만들지 않는다.
21. 공통 온보딩은 자동 진입·공통 코치마크가 없고, 설정에서만 다시 볼 수 있는 예비·도움말 콘텐츠다.
22. 사용자가 직접 커밋·푸시한다. 구현자는 커밋·푸시·머지를 하지 않으며 `--force` 명령을 제공하지 않는다.
23. 하드코딩은 절대 허용하지 않는다. 신규 온보딩 코드뿐 아니라 이번 작업에서 재사용·수정하는 기존 코드에 온보딩과 관련된 역할, 경로, 저장소 키, TTL, 페이지 수, audience, CTA, 코치마크 target ID, 이미지 경로, 문구가 중복 문자열·숫자·조건문으로 흩어져 있으면 그대로 복제하지 않고 이름 있는 공용 상수·타입·콘텐츠 registry·순수 함수의 단일 정본으로 정리한다.
24. 기존 코드의 관련 하드코딩을 발견하면 “기존 코드라서 유지”하지 않는다. 이번 기능이 소비하는 범위 안에서는 기존 호출부도 같은 정본을 사용하도록 함께 바꾸고 회귀 테스트로 잠근다. 단, 온보딩과 무관한 저장소 전체를 일괄 리팩터링해 PR 범위를 무제한 확장하지 않는다. 관련 여부가 불명확하면 구현 전에 사용자에게 질문한다.

---

## 2. 현재 코드와 재사용할 정본

### 2.1 가입 완료와 역할

- `apps/web/src/components/bambi/auth/auth-panel.tsx`
  - `finishSignup`이 `createEmployerProfile` 또는 `createJobSeekerProfile`을 완료한 뒤 현재 `/seeker`로 하드 내비게이션한다.
  - 새 흐름은 이 성공 지점만 수정한다. 가입 시작 전에 온보딩 의도를 만들면 계정·프로필 생성 실패에도 잘못된 온보딩이 남으므로 금지한다.
  - 하드 내비게이션을 유지해 가입 전 Router Cache를 우회한다. 가입 폼이 브라우저 뒤로가기에 다시 남지 않도록 성공 시 `window.location.replace("/onboarding")`를 사용하며 단순 `router.push`로 바꾸지 않는다.
- `apps/web/src/components/bambi/auth-client-provider.tsx`
  - Better Auth 사용자 ID와 `bambi_profile.role`의 클라이언트 정본이다.
  - localStorage 키는 이메일·닉네임이 아니라 불변 사용자 ID를 사용한다.
- `packages/api/src/routers/bambi/onboarding.ts`
  - `getMine`, `getMyRouting`의 역할 판정을 그대로 사용한다.
  - 이번 작업은 서버·DB 상태를 추가하지 않으므로 API와 Drizzle 스키마를 변경하지 않는다.
- `apps/web/src/lib/bambi/require-role.ts`
  - 현재 내부 `getRouting`은 역할을 반환하지만 export되지 않는다. 새 `/onboarding` 서버 페이지가 같은 세션·프로필 판정을 재사용할 수 있도록 역할을 안전하게 반환하는 좁은 helper를 추가한다.
- `apps/web/src/lib/bambi/resolve-gate.ts`, `apps/web/src/proxy.ts`
  - 새 비공개 최상위 경로 `/onboarding`을 `GATED_ROOTS`에 추가한다. 이 목록을 빠뜨리면 proxy는 비로그인 직접 접근을 Next 페이지까지 통과시키므로 서버 가드와 기존 proxy 게이트를 함께 유지한다.

### 2.2 역할 메인과 기존 게이트

- 구직자 메인: `apps/web/src/app/seeker/page.tsx`, `SeekerMarketplaceScreen`
- 구인자 메인: `apps/web/src/app/employer/page.tsx`
- 구인자 업체 정보: `/employer/me`
- 구인자 공고 등록: `/employer/new`
- 구직자·구인자 공용 모바일 탭: `MobileTabBar`, `PersonaNav`
- 구인자 모바일 탭: `EmployerNav` 안의 `BottomNav` in `persona-nav.tsx`
- 구인자 승인 안내: `EmployerGateBanner`

온보딩을 위해 기존 메인 화면이나 업체 승인 정책을 복제하지 않는다. 코치마크 대상에 안정적인 식별자·ref 전달만 추가한다.

현재 구인자 `/employer` 셸에는 채팅 진입점이 없다. `ResponsiveAppShell`도 `variant="employer"`에서는 desktop chat action을 숨기고 모바일 header에는 chat action 자체를 렌더하지 않는다. 기존 `EmployerNav` 하단 탭은 이미 5개라 여섯 번째 탭을 추가하면 좁은 화면을 악화시킨다. 따라서 기존 채팅 목록 `/seeker/chats`를 가리키는 공용 `ChatNavButton`을 구인자 desktop header와 mobile header에 노출하고, 이를 `지원자 채팅` 코치마크 대상으로 사용한다. 새 채팅 기능·라우트·하단 탭을 만들지 않고 기존 목록·권한·안 읽음 정본을 재사용한다. 이 진입점 없이 보이지 않는 요소나 임의 위치를 강조하는 구현은 금지한다.

### 2.3 전체 화면 방해 요소

- `apps/web/src/app/layout.tsx`는 모든 경로에 `MainPopupLayer`와 `SupportChatWidget`을 렌더한다.
- 온보딩 도중 메인 팝업이나 고객센터 플로팅 버튼이 슬라이드·CTA·코치마크를 가리면 안 된다.
- 기존 컴포넌트에 `/onboarding` 경로 제외 판정을 추가하고 그 판정을 공용 순수 함수와 테스트로 고정한다. 다른 경로의 팝업·고객센터 노출은 바꾸지 않는다.

### 2.4 설정의 다시 보기

- 공용 계정 설정 UI: `apps/web/src/components/bambi/screens/account-settings-screen.tsx`
- 라우트: `/seeker/me/settings`
- 구인자도 개인 계정 화면은 `/seeker/me` 계열을 재사용한다.

기존 프로필·본인인증·프로필 사진·탈퇴 카드 사이에 shadcn `Card` 기반 `이용 안내` 섹션을 추가한다. 역할별 버튼 하나와 공통 버튼 하나만 보여준다.

### 2.5 디자인 시스템

- `apps/web/CLAUDE.md`의 shadcn + Tailwind 전용 규칙을 따른다.
- `@bambi-app/ui/components`의 `Button`, `Card`, `Dialog`/base-ui primitives와 기존 `Logo`를 우선 재사용한다.
- 색상은 `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-coral-50`, `text-ink-*` 등 기존 토큰만 사용한다.
- 인라인 `style`, 신규 CSS 파일, raw hex/oklch, 수동 overlay z-index를 추가하지 않는다.
- 동적 코치마크 spotlight 좌표는 CSS style 문자열이 아니라 SVG의 `x`, `y`, `width`, `height`, `rx` 속성으로 표현하고, overlay stack과 focus trap은 한 `Coachmark` 컴포넌트가 관리한다.

### 2.6 하드코딩 금지와 단일 정본

다음 값은 JSX·effect·event handler·테스트에 직접 반복해서 쓰지 않는다.

| 값 | 단일 정본 |
| --- | --- |
| 역할과 audience | `OnboardingRole`, `OnboardingAudience` 타입과 parser |
| 역할별 메인 경로 | 기존 `homePathForRole`을 재사용하고 온보딩용 중복 map을 만들지 않음 |
| `/onboarding` 경로와 query key | `apps/web/src/lib/bambi/onboarding-route.ts`의 상수·builder·parser |
| local/session storage key | `apps/web/src/lib/bambi/onboarding.ts`의 key builder |
| intent TTL·swipe threshold·target wait timeout | 의미가 드러나는 이름 있는 상수 |
| 4장 구성과 제목·설명·이미지 | `onboarding-content.ts`의 readonly registry |
| 페이지 수 | registry 배열 길이에서 파생하며 숫자 `4`로 navigation 경계를 다시 쓰지 않음 |
| `다음`, `시작하기`, `건너뛰기` 상태 | 현재 index와 registry length에서 파생하는 순수 함수 |
| coachmark target ID·단계·fallback | `coachmark.ts`의 readonly 역할별 registry |
| 구직자·구인자 채팅 경로 | 기존 route 상수 또는 새 공용 route 상수 하나를 기존 호출부와 공유 |
| 이미지 public 경로 | 콘텐츠 registry에서만 선언하고 컴포넌트에 문자열을 반복하지 않음 |

- 테스트도 운영 코드의 상수를 그대로 가져와 자기 자신을 검증하는 허술한 방식만 사용하지 않는다. 사용자 관점의 기대 결과와 registry 불변 조건을 함께 검사한다.
- 정적인 사용자 문구와 이미지 경로를 중앙 콘텐츠 registry에 선언하는 것은 의도된 콘텐츠 구성이지 산재한 하드코딩으로 취급하지 않는다. 같은 값을 컴포넌트 여러 곳에 재입력하는 것이 금지 대상이다.
- 기존 `auth-panel.tsx`의 `/seeker`, `responsive-shell.tsx`의 `/seeker/chats`, 설정의 onboarding URL 등 이번 작업이 직접 만지는 중복 경로는 관련 공용 builder/상수를 사용하도록 정리한다.
- 기존 공용 상수가 이미 있으면 새 상수를 만들지 않는다. 예를 들어 역할별 홈은 `homePathForRole`, 계정 설정 경로는 기존 `MY_PAGE_HUB_HREF` 계열 정본을 먼저 확인한다.
- 새 abstraction이 오히려 한 번만 쓰는 단순값을 숨기거나 순환 import를 만들면 억지로 추출하지 않는다. 판단 기준은 “정책·계약 값인가, 여러 호출부가 맞춰야 하는가”이며 불명확하면 구현 전에 질문한다.

---

## 3. 온보딩 콘텐츠 정본

문구는 이미지에 굽지 않고 React 텍스트로 렌더링한다. 구현 중 표현을 임의로 늘리거나 다른 기능을 추가하지 않는다.

### 3.1 구직자 전용 4장

| 장 | 제목 | 설명 | 실제 화면 목업 | 보조 시각 요소 |
| --- | --- | --- | --- | --- |
| 1 | `내게 맞는 일자리, 밤비에서 찾아보세요` | `지역과 업종, 근무 조건을 살펴보고 원하는 공고를 빠르게 찾을 수 있어요.` | `/seeker` 공고 목록과 필터 | 기존 검색·위치 아이콘과 코럴 포인트 |
| 2 | `궁금한 내용은 채팅으로 바로 확인하세요` | `마음에 드는 공고에서 구인자와 대화하고 이미지나 PDF도 주고받을 수 있어요.` | 공고 상세의 채팅 진입과 실제 채팅방 | 기존 말풍선·첨부 아이콘 |
| 3 | `면접과 연락처를 안전하게 관리해요` | `채팅에서 면접 일정을 확인하고 필요한 경우에만 연락처를 공개할 수 있어요.` | 면접 제안 카드와 연락처 공개 요청 | 기존 달력·방패 아이콘 |
| 4 | `경험을 나누고 더 안심하고 지원하세요` | `면접 후 후기를 남기고 불편한 상대는 신고하거나 차단할 수 있어요.` | 예정된 면접·후기 작성 및 신고/차단 UI | 기존 별점·신고·차단 아이콘 |

마지막 CTA: `시작하기` → `/seeker`.

### 3.2 구인자 전용 4장

| 장 | 제목 | 설명 | 실제 화면 목업 | 보조 시각 요소 |
| --- | --- | --- | --- | --- |
| 1 | `안전한 채용을 위해 업체 정보를 등록해요` | `업체와 사업자 정보를 제출하면 운영자 확인 후 밤비의 구인 기능을 이용할 수 있어요.` | `/employer/me` 업체 정보·서류 제출 | 기존 사업자 서류·확인 배지 아이콘 |
| 2 | `우리 업체의 공고를 쉽고 자세하게` | `급여와 지역, 업종, 상세 내용과 이미지를 입력해 이해하기 쉬운 공고를 만들 수 있어요.` | `/employer/new` 공고 등록 폼 | 기존 공고·체크리스트 아이콘 |
| 3 | `지원자와 바로 대화하세요` | `채팅에서 문의에 답하고 이미지나 PDF를 주고받으며 지원자를 응대할 수 있어요.` | 구인자 시점 채팅방과 첨부 | 기존 말풍선·첨부 아이콘 |
| 4 | `면접 제안부터 지원자 관리까지` | `면접 일정을 제안하고 연락처 공개를 요청해 채용 과정을 이어갈 수 있어요.` | 면접 제안·연락처 요청 카드 | 기존 달력·연락처 아이콘 |

마지막 CTA: `시작하기` → `/employer`. 업체 정보가 없으면 기존 `EmployerGateBanner`와 업체 정보 탭이 다음 행동을 안내한다.

### 3.3 공통 기능 4장

| 장 | 제목 | 설명 | 실제 화면 목업 | 보조 시각 요소 |
| --- | --- | --- | --- | --- |
| 1 | `채팅과 첨부로 편하게 이야기해요` | `구직자와 구인자는 채팅에서 대화하고 이미지와 PDF를 안전하게 주고받을 수 있어요.` | 공용 채팅방과 첨부 미리보기 | 기존 말풍선·첨부 아이콘 |
| 2 | `면접과 연락처는 필요한 순간에` | `면접 일정을 함께 확인하고 동의한 경우에만 연락처를 공개할 수 있어요.` | 면접·연락처 공개 카드 | 기존 달력·잠금 아이콘 |
| 3 | `알림과 쪽지로 중요한 소식을 확인해요` | `채팅과 면접, 서비스 소식은 알림으로 확인하고 필요한 안내는 쪽지함에서 다시 볼 수 있어요.` | 알림 화면과 쪽지함 | 기존 알림 종·편지 아이콘 |
| 4 | `불편한 상황에서는 밤비가 도와드려요` | `신고와 차단 기능을 이용하고 필요한 경우 고객센터에 문의할 수 있어요.` | 신고·차단·고객센터 UI | 기존 방패·고객센터 아이콘 |

공통 다시 보기의 마지막 CTA: 현재 역할이 `employer`면 `/employer`, `job_seeker`면 `/seeker`로 이동한다. 공통 흐름은 코치마크 실행 의도를 만들지 않는다.

---

## 4. 실제 밤비 화면 목업 제작 계획

### 4.1 원칙

1. 브랜드 근거가 없는 신규 마스코트·캐릭터를 만들지 않는다. 온보딩의 정체성은 기존 밤비 로고, 코럴·잉크 토큰, 실제 제품 화면으로 표현한다.
2. 참고로 제공된 카카오페이·윌라·토스·포스타입 사례는 여백, 휴대폰 목업, 한 화면 한 메시지, 코치마크 구조의 참고일 뿐 편집·복제 대상이 아니다.
3. 실제 UI는 최신 develop을 실행해 seed/검수용 계정으로 캡처한다. 개인정보·실전화번호·실업체명·민감한 채팅은 포함하지 않는다.
4. 제목·설명·버튼·페이지 점은 이미지에 굽지 않고 코드로 렌더링한다.
5. 휴대폰 프레임은 코드로 한 번만 만들고 실제 캡처 이미지를 `next/image`로 끼운다. UI를 AI 이미지로 재생성하지 않아 화면이 실제 코드와 달라지는 문제를 막는다.
6. 보조 시각 요소는 저장소에 이미 있는 밤비 로고와 lucide/기존 `icons.tsx` 아이콘만 재사용한다. 같은 아이콘을 PNG로 다시 만들지 않는다.
7. 온보딩 캡처는 사용자 업로드나 운영 중 교체되는 미디어가 아니라 코드 버전과 함께 배포되는 고정 UI 자산이므로 `apps/web/public`에 둔다. `GCS_PUBLIC_BUCKET`·`GCS_PRIVATE_BUCKET`의 서명 업로드·삭제·공개 URL 흐름에 넣지 않는다.
8. 기존 GCS 계약은 변경하지 않는다. 공개 공고·본문·채팅 미디어는 `GCS_PUBLIC_BUCKET`, 사업자 서류는 `GCS_PRIVATE_BUCKET`, 개발 환경은 기존 로컬 미디어 라우트, 웹 원격 이미지는 `NEXT_PUBLIC_GCS_PUBLIC_BASE_URL`과 `next.config.ts`의 `remotePatterns`를 계속 사용한다.
9. 실제 화면을 캡처할 때 GCS 원격 이미지가 보이더라도 결과 PNG에는 렌더된 픽셀만 포함되고 storage key·서명 URL·버킷 권한은 포함하지 않는다. 캡처 자산 때문에 GCS URL이나 자격 증명을 코드에 하드코딩하지 않는다.

### 4.2 자산 구조

```text
apps/web/public/bambi/onboarding/screens/
├── seeker-marketplace.png
├── seeker-chat.png
├── seeker-interview-contact.png
├── seeker-review-safety.png
├── employer-business-info.png
├── employer-job-create.png
├── employer-chat.png
├── employer-interview-contact.png
├── common-chat-attachment.png
├── common-interview-contact.png
├── common-notification-message.png
└── common-safety-support.png
```

동일 화면을 두 콘텐츠에서 쓰더라도 파일을 복제하지 않는다. 실제 캡처가 같으면 한 파일을 콘텐츠 registry가 공동 참조한다. 위 목록은 최대 산출물 이름이며 최종 중복 제거 결과를 계획서와 registry에 함께 반영한다.

### 4.3 실제 화면 캡처

- [ ] 최신 develop과 사용자 제공 env로 웹·서버를 실행한다.
- [ ] 390×844 기준 모바일 뷰포트에서 각 화면을 캡처한다.
- [ ] seed 또는 전용 QA 데이터만 사용하고 이름·전화번호·업체·대화는 가상 값으로 통일한다.
- [ ] 이미지/PDF, 면접, 연락처, 신고·차단 등 필요한 상태가 없으면 기존 테스트/seed 경로로 생성하며 운영 데이터는 사용하지 않는다.
- [ ] 캡처는 화면 자체만 보존하고 브라우저 주소창·개발 도구·OS 상태바는 제거한다.
- [ ] Next Image가 처리할 수 있는 PNG로 저장하고 실제 크기·비율을 콘텐츠 메타데이터와 일치시킨다.

---

## 5. 상태와 저장소 계약

### 5.1 상수와 타입

`apps/web/src/lib/bambi/onboarding.ts`를 새 단일 정본으로 둔다.

```ts
type OnboardingAudience = "common" | "employer" | "job_seeker";
type OnboardingRole = "employer" | "job_seeker";
type OnboardingLaunchSource = "replay" | "signup";

const ONBOARDING_CONTENT_VERSION = "2026-09-01";
const SIGNUP_ONBOARDING_INTENT_KEY = "bambi:onboarding:signup-intent";
const COACHMARK_INTENT_KEY = "bambi:onboarding:coachmark-intent";
```

이 파일에 다음 순수 함수를 둔다.

- `getOnboardingCompletionKey(userId, role)`
- `writeSignupOnboardingIntent(role)` / `readSignupOnboardingIntent()` / `clearSignupOnboardingIntent()`
- `markAutomaticOnboardingSeen(userId, role)` / `hasSeenAutomaticOnboarding(userId, role)`
- `writeCoachmarkIntent(userId, role)` / `consumeCoachmarkIntent(userId, role)`
- `getRoleHomePath(role)`
- audience·role·source 검증 및 콘텐츠 선택

coachmark intent도 signup intent와 같은 방식으로 `{ userId, role, createdAt }`를 저장하고 이름 있는 TTL을 적용한다. 다른 계정·역할·오래된 탭의 intent를 실행하지 않는다.

### 5.2 localStorage 완료 키

```text
bambi:onboarding:seen:<version>:<userId>:<role> = "1"
```

- 사용자 ID와 역할을 모두 포함한다.
- 현재 역할 값은 서버 `getMine` 결과와 일치해야 한다.
- DB·쿠키·분석 이벤트에 사용자 ID를 새로 전송하지 않는다.
- localStorage 접근은 `typeof window !== "undefined"` 이후 try/catch로 감싼다. 저장소가 차단돼도 화면이 깨지지 않고 현재 세션에서는 계속 진행할 수 있어야 한다.
- 버전은 키 충돌·향후 포맷 변경을 위한 네임스페이스일 뿐, 버전을 올려 기존 사용자에게 자동 재노출하는 기능으로 사용하지 않는다. 자동 진입에는 아래 sessionStorage 가입 의도가 반드시 필요하다.
- 완료 키 기록이 브라우저 정책으로 실패해도 signup intent 제거는 `finally` 성격으로 반드시 수행한다. 저장 오류 때문에 다음 실행에서 자동 온보딩이 반복되면 “중간 종료 시 완료” 요구를 위반한다.

### 5.3 가입 의도

회원가입 성공 직후 `finishSignup`에서 역할 프로필 생성과 법적 동의 기록이 끝난 다음에만 다음 값을 `sessionStorage`에 기록한다.

```ts
{
  userId: string,
  role: "employer" | "job_seeker",
  createdAt: number,
}
```

- `createEmployerProfile`/`createJobSeekerProfile`의 기존 반환 프로필에서 `userId`를 받아 intent에 넣는다. 새 API를 만들거나 세션 갱신 타이밍을 추측하지 않는다.
- TTL은 현재 탭 안에서 오래된 실패 잔여값을 막기 위한 짧은 상수로 둔다(예: 10분). 정확한 값은 이름 있는 상수로 관리한다.
- 그 뒤 `window.location.replace("/onboarding")`으로 하드 이동한다.
- `/onboarding`은 세션 사용자와 서버 역할을 로드하고 signup intent의 `userId`와 역할이 모두 일치할 때만 자동 흐름을 연다.
- intent가 없거나 만료·오염·역할 불일치면 기존 사용자로 보고 역할 메인으로 즉시 이동한다. localStorage 완료 키가 없다는 이유만으로 기존 사용자를 자동 온보딩에 넣지 않는다.
- 유효한 intent가 있어도 해당 userId·role 완료 키가 이미 있으면 뒤로가기·중복 이동으로 보고 역할 메인으로 보낸 뒤 intent를 제거한다.
- 자동 온보딩 client flow의 `useLayoutEffect`에서 첫 paint 전에 완료 키를 기록하고 signup intent를 제거한다. 사용자가 첫 화면을 실제로 볼 수 있는 시점에는 두 처리가 끝나 있어야 하며, 따라서 중간 종료 후 재실행하지 않는다. Strict Mode의 effect 재실행에도 멱등해야 한다.

### 5.4 시작·건너뛰기·다시 보기

| 진입 | 동작 | 완료 키 | 코치마크 intent | 종료 경로 |
| --- | --- | --- | --- | --- |
| 신규 가입 자동 | 첫 렌더 즉시 완료 처리 | 기록 | 마지막 `시작하기`에만 기록 | 역할 메인 |
| 신규 가입 건너뛰기 | 전체 생략 | 이미 기록됨 | 기록하지 않음 | 역할 메인 |
| 역할별 다시 보기 | 슬라이드 재생 | 변경 없음 | `시작하기`에 기록 | 역할 메인 |
| 역할별 다시 보기 건너뛰기 | 재생 종료 | 변경 없음 | 기록하지 않음 | 역할 메인 |
| 공통 다시 보기 | 공통 4장 | 변경 없음 | 기록하지 않음 | 현재 역할 메인 |

역할 메인 이동은 `router.replace` 또는 hard `location.replace`를 사용해 브라우저 뒤로가기가 완료된 온보딩으로 돌아오지 않게 한다.

---

## 6. 라우트와 컴포넌트 설계

### 6.1 온보딩 라우트

새 라우트:

```text
apps/web/src/app/onboarding/page.tsx
```

- 서버 페이지는 인증 없는 직접 접근을 `/seeker?auth=login`으로 돌리는 기존 `require-role` 계약을 재사용한다.
- `resolve-gate.ts`에도 `onboarding` gated root와 회귀 테스트를 추가해 비로그인 직접 접근을 proxy 단계에서 막는다.
- 운영자·법률자문가·role null은 각 기존 홈/로그인 흐름으로 돌리고 콘텐츠를 보여주지 않는다.
- 자동 진입은 query string이 아니라 검증된 signup intent와 서버 역할로 audience를 결정한다.
- 다시 보기는 `/onboarding?audience=job_seeker&source=replay` 또는 `common|employer`를 사용하되, 현재 역할과 맞지 않는 역할별 audience는 거부하고 자기 역할 메인으로 이동한다.
- query 값을 그대로 타입 단언하지 않고 순수 파서로 검증한다.

### 6.2 콘텐츠 데이터

새 파일:

```text
apps/web/src/lib/bambi/onboarding-content.ts
```

- 3개 audience와 각 4개 slide를 readonly 데이터로 관리한다.
- slide ID, 제목, 설명, 화면 캡처 경로, 캡처 alt, 기존 보조 아이콘을 포함한다.
- CTA, 홈 경로, 저장소 키를 slide별로 하드코딩하지 않는다.
- 테스트에서 audience마다 정확히 4장, ID·이미지 경로 중복·빈 문구 없음, 마지막 CTA 계약을 검사한다.

### 6.3 슬라이드 UI

새 컴포넌트:

```text
apps/web/src/components/bambi/onboarding/onboarding-flow.tsx
apps/web/src/components/bambi/onboarding/onboarding-slide.tsx
apps/web/src/components/bambi/onboarding/phone-screen-mockup.tsx
apps/web/src/components/bambi/onboarding/page-indicator.tsx
```

구조:

1. 상단: 밤비 로고, 자동·다시 보기 모두 `건너뛰기`
2. 중앙: 실제 화면을 넣은 휴대폰 프레임 + 기존 밤비 아이콘·코럴 포인트
3. 문구: 제목 1~2줄, 설명 1~2문장
4. 현재 페이지 점
5. 하단: `이전`, `다음`; 마지막은 `시작하기`

반응형:

- 모바일 `< md`: `100dvh`, safe-area 패딩, 세로 구성, CTA가 화면 하단에서 접근 가능해야 한다.
- 높이가 낮은 모바일: 중앙 비주얼만 줄이고 제목·CTA를 화면 밖으로 밀지 않는다. 필요하면 전체 본문을 내부 스크롤하되 버튼이 가려지지 않게 한다.
- 태블릿: 세로 구성을 유지하며 최대 폭을 넓힌다.
- 데스크톱 `lg+`: 전체 배경 안의 제한 폭 컨테이너에서 비주얼과 문구를 좌우 2열로 배치한다. 온보딩 전체를 휴대폰 카드에 가두지 않는다.
- 휴대폰 프레임은 캡처의 고정 aspect ratio를 유지하고 `overflow-hidden`, 기존 radius 토큰을 사용한다.

스와이프:

- 외부 carousel 패키지를 새로 설치하지 않는다.
- `pointerdown`/`pointerup` 또는 React pointer event로 수평 이동 거리와 수직 이동을 비교한다.
- 이름 있는 최소 거리 상수를 사용하고 세로 스크롤을 수평 스와이프로 오인하지 않는다.
- 첫 장에서 오른쪽 스와이프, 마지막 장에서 왼쪽 스와이프는 이동하지 않는다.
- 버튼·링크에서 시작한 pointer event는 스와이프로 처리하지 않는다.
- 키보드 `ArrowLeft`, `ArrowRight`를 지원하고 입력 포커스가 있는 경우 가로채지 않는다.

접근성:

- 현재 슬라이드는 `aria-live="polite"`로 제목 변화를 알린다.
- 페이지 점은 장식이 아니라 `현재 2/4 페이지`를 읽을 수 있는 상태 텍스트를 제공한다.
- 이미지 alt는 보이는 실제 UI를 간단히 설명하고, 장식 아이콘이 같은 정보를 반복하면 `aria-hidden`으로 처리한다.
- 포커스 순서는 건너뛰기 → 콘텐츠 → 이전/다음이다.
- `prefers-reduced-motion`에서는 slide/opacity 전환을 끈다.

### 6.4 설정의 다시 보기

`AccountSettingsScreen`에 `이용 안내` Card를 추가한다.

- job_seeker: `구직자 이용 안내 다시 보기`, `공통 기능 안내 다시 보기`
- employer: `구인자 이용 안내 다시 보기`, `공통 기능 안내 다시 보기`
- admin/legal_advisor: 카드 미노출
- 버튼은 검증된 `/onboarding?...&source=replay` 링크를 사용한다.
- 다시 보기 진입은 localStorage 완료 키를 삭제하지 않는다.

---

## 7. 역할별 코치마크 설계

### 7.1 실행 조건

- 온보딩 마지막 `시작하기`에서만 `sessionStorage` coachmark intent를 만든다.
- 역할 메인 마운트 후 user ID·role이 intent와 일치하는지 먼저 읽되, 첫 번째 visible target이 준비되기 전에는 consume하지 않는다.
- 새로고침, 다른 탭, 중간 종료 후 자동 재실행하지 않는다.
- `건너뛰기`는 coachmark intent를 만들지 않는다.
- 공통 온보딩은 coachmark intent를 만들지 않는다.

### 7.2 구직자 코치마크 3단계

| 단계 | 실제 대상 | 문구 | 모바일/데스크톱 대응 |
| --- | --- | --- | --- |
| 1 | `SeekerMarketplaceScreen`의 검색·`MarketplaceFilterControls` 영역 | `지역과 업종을 선택해 원하는 공고를 빠르게 찾아보세요.` | 같은 기능 영역에 공통 `data-onboarding-target="seeker-search-filter"` |
| 2 | 채팅 내비게이션 | `구인자와 나눈 대화는 채팅에서 확인할 수 있어요.` | 모바일 `MobileTabBar` 채팅, 데스크톱 header chat action에 동일 target ID |
| 3 | 내 정보 내비게이션 | `면접 일정, 후기, 신고와 계정 설정은 내 정보에서 확인하세요.` | 모바일 내 정보 탭, 데스크톱 내 정보 action에 동일 target ID |

### 7.3 구인자 코치마크 3단계

| 단계 | 실제 대상 | 문구 | 모바일/데스크톱 대응 |
| --- | --- | --- | --- |
| 1 | 업체 정보 진입점 또는 `EmployerGateBanner`의 업체 정보 CTA | `먼저 업체 정보를 등록하면 운영자 확인이 시작돼요.` | 미등록 상태에서는 banner CTA 우선, 그 외 모바일 업체 정보 탭/데스크톱 nav |
| 2 | `새 공고 등록` 또는 구인자 공고 등록 nav | `승인이 완료되면 여기에서 새로운 공고를 등록할 수 있어요.` | 버튼이 disabled/미노출이면 nav의 공고 등록 항목을 target으로 사용 |
| 3 | 새로 노출한 공용 `ChatNavButton` | `지원자와 대화하고 면접 일정을 관리해 보세요.` | 구인자 모바일·데스크톱 header의 같은 채팅 action |

구인자 신규 계정에는 조직·업체 정보가 없으므로 특정 상태에서 사라지는 버튼만 target으로 삼지 않는다. 대상 우선순위를 두고 첫 번째 존재하는 DOM target을 사용한다.

### 7.4 Coachmark 컴포넌트

새 파일:

```text
apps/web/src/components/bambi/onboarding/coachmark.tsx
apps/web/src/components/bambi/onboarding/role-coachmark-runner.tsx
apps/web/src/lib/bambi/coachmark.ts
```

- 대상은 `data-onboarding-target`과 ref를 사용하며 화면 문구나 DOM 순서로 찾지 않는다.
- 모바일·데스크톱용 동일 target이 DOM에 함께 있을 수 있으므로 `getClientRects().length > 0`, 양수 width/height, `visibility`/`display`를 확인해 실제로 보이는 요소만 선택한다. 단순 `querySelector`의 첫 결과를 사용하지 않는다.
- 현재 대상이 없으면 정해진 fallback target을 찾고, 모두 없으면 해당 단계만 건너뛴다. 무한 대기하거나 화면을 막지 않는다.
- 첫 target은 React Query·responsive shell hydration 뒤 나타날 수 있으므로 이름 있는 짧은 timeout 동안 `MutationObserver`와 `requestAnimationFrame`으로 기다린다. target이 준비돼 overlay를 열기 직전에 intent를 consume한다. timeout까지 아무 visible target이 없으면 intent를 제거하고 화면을 막지 않는다.
- overlay/focus lock을 열기 전에 대상을 `scrollIntoView({ block: "center" })`하고, 스크롤이 반영된 다음 frame에 `getBoundingClientRect()`로 측정한다.
- resize, orientation change, scroll에 맞춰 측정값을 갱신한다.
- spotlight는 전체 화면 SVG mask로 만들고 좌표는 SVG 속성으로 전달한다. raw 색상·인라인 style을 쓰지 않는다.
- 안내 패널은 모바일 하단, 데스크톱에서는 spotlight와 겹치지 않는 쪽에 놓는다. 동적 픽셀 위치를 style로 넣지 않고 제한된 레이아웃 variant로 선택한다.
- overlay 포털·focus trap·Escape·backdrop 스택은 base-ui Dialog 패턴을 재사용하거나 shared coachmark primitive 내부에서 관리한다.
- 버튼: `건너뛰기`, `이전`, `다음`, 마지막 `완료`.
- 코치마크 건너뛰기는 현재 코치마크 묶음 전체를 종료한다. 슬라이드 완료 기록에는 영향이 없다.
- spotlight로 강조된 실제 컨트롤은 설명 중 클릭되지 않게 하고, 안내 패널의 버튼만 조작 가능하게 한다.
- Escape는 건너뛰기와 동일하게 전체 종료하며 스크린리더에 단계 제목·설명을 제공한다.

### 7.5 삽입 위치

- 구직자: `SeekerMarketplaceScreen` 또는 그 클라이언트 셸에 `RoleCoachmarkRunner role="job_seeker"`를 한 번만 둔다.
- 구인자: `/employer` 페이지의 인증·로딩·오류·역할 분기가 끝난 실제 dashboard root에 `RoleCoachmarkRunner role="employer"`를 둔다.
- 공통 header/mobile nav 대상에는 target 속성만 확장하고 coachmark 상태 로직을 중복 삽입하지 않는다.

---

## 8. 구현 작업 순서

### Task 1: 상태·콘텐츠 순수 계약과 회귀 테스트

**Files:**

- Create: `apps/web/src/lib/bambi/onboarding.ts`
- Create: `apps/web/src/lib/bambi/onboarding.test.ts`
- Create: `apps/web/src/lib/bambi/onboarding-content.ts`
- Create: `apps/web/src/lib/bambi/onboarding-content.test.ts`
- Modify: `docs/test-flows/seeker-test-flow.md`
- Modify: `docs/test-flows/employer-test-flow.md`

- [ ] 사용자 ID·역할별 완료 키, signup intent TTL/역할 검증, coachmark consume 순수 테스트를 먼저 작성한다.
- [ ] localStorage/sessionStorage 부재·예외에서도 안전한 테스트를 추가한다.
- [ ] 3개 audience × 정확히 4장과 콘텐츠·이미지 경로 계약을 테스트한다.
- [ ] 기존 `homePathForRole`·route 상수·표시 타입을 먼저 조사하고 역할·경로·키·TTL·페이지 수를 중복 선언하지 않았는지 검사한다.
- [ ] DB·API·migration이 필요 없음을 최신 develop 기준으로 재확인한다.
- [ ] `feat: 역할별 온보딩 상태와 콘텐츠 정본 추가` 커밋 단위로 준비한다(사용자가 직접 커밋).

### Task 2: 실제 화면 목업 자산

**Files:**

- Create: `apps/web/public/bambi/onboarding/screens/*.png`
- Create: 필요 시 `docs/superpowers/assets/`의 사용자 검수용 미리보기만 추가
- Update: 이 계획서의 실제 파일 목록·프롬프트·검수 결과

- [ ] 최신 develop 실제 화면을 가상 데이터로 캡처한다.
- [ ] 모든 캡처의 파일 크기, 비율, 개인정보, 테스트 데이터, 실제 UI 일치 여부를 검사한다.
- [ ] GCS 공개·비공개 버킷과 로컬 폴백 관련 기존 테스트를 실행해 온보딩 정적 자산 추가가 런타임 스토리지 정책을 바꾸지 않았음을 확인한다.
- [ ] 중복 캡처는 제거하고 콘텐츠 데이터 경로와 계획서를 동기화한다.
- [ ] `feat: 밤비 온보딩 화면 목업 자산 추가` 커밋 단위로 준비한다.

### Task 3: 반응형 슬라이드 UI와 가입 직후 진입

**Files:**

- Modify: `apps/web/src/components/bambi/auth/auth-panel.tsx`
- Modify: `apps/web/src/lib/bambi/require-role.ts`
- Modify: `apps/web/src/lib/bambi/resolve-gate.ts`
- Modify: `apps/web/test/lib/bambi/resolve-gate.test.ts`
- Create: `apps/web/src/lib/bambi/onboarding-route.ts`
- Create: `apps/web/src/lib/bambi/onboarding-route.test.ts`
- Modify: `apps/web/src/components/bambi/main-popup/main-popup-layer.tsx`
- Modify: `apps/web/src/components/bambi/support-chat/support-chat-widget.tsx`
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/components/bambi/onboarding/onboarding-flow.tsx`
- Create: `apps/web/src/components/bambi/onboarding/onboarding-slide.tsx`
- Create: `apps/web/src/components/bambi/onboarding/phone-screen-mockup.tsx`
- Create: `apps/web/src/components/bambi/onboarding/page-indicator.tsx`
- Create/Modify: 관련 Vitest

- [ ] 가입 성공 뒤에만 signup intent가 생기고 로그인·비회원 흐름은 기존 경로를 유지하는 테스트를 추가한다.
- [ ] signup intent가 생성된 user ID·role과 현재 세션이 모두 일치해야만 자동 진입하는 테스트를 추가한다.
- [ ] `/onboarding` 비로그인 proxy 게이트와 운영자·법률자문가 역할 우회 테스트를 추가한다.
- [ ] `/onboarding`에서 메인 팝업·고객센터 위젯이 숨고 다른 경로에서는 기존대로 보이는 테스트를 추가한다.
- [ ] 첫 렌더 즉시 완료, 중간 종료 재노출 없음, 건너뛰기, 마지막 시작하기 상태 전이를 구현·검증한다.
- [ ] 스와이프 경계·세로 스크롤 오인 방지·키보드 이동 테스트를 추가한다.
- [ ] 모바일·태블릿·데스크톱 반응형과 safe-area·낮은 높이를 구현한다.
- [ ] 운영자·법률자문가·직접 URL·오염 query 차단을 검증한다.
- [ ] `feat: 가입 후 역할별 반응형 온보딩 연결` 커밋 단위로 준비한다.

### Task 4: 설정의 역할별·공통 다시 보기

**Files:**

- Modify: `apps/web/src/components/bambi/screens/account-settings-screen.tsx`
- Modify/Create: 계정 설정 역할별 테스트
- Modify: `docs/manual/seeker-manual.md`
- Modify: `docs/manual/employer-manual.md`

- [ ] 구직자에는 구직자·공통, 구인자에는 구인자·공통 버튼만 노출한다.
- [ ] 다시 보기가 완료 키를 변경하지 않는 테스트를 추가한다.
- [ ] 역할별 다시 보기 `시작하기`만 coachmark intent를 만들고 공통은 만들지 않는 테스트를 추가한다.
- [ ] 접근 경로와 다시 보기 동작을 양쪽 매뉴얼에 기록한다.
- [ ] `feat: 계정 설정에 온보딩 다시 보기 추가` 커밋 단위로 준비한다.

### Task 5: 역할별 실제 화면 코치마크

**Files:**

- Create: `apps/web/src/lib/bambi/coachmark.ts`
- Create: `apps/web/src/components/bambi/onboarding/coachmark.tsx`
- Create: `apps/web/src/components/bambi/onboarding/role-coachmark-runner.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
- Modify: `apps/web/src/components/bambi/mobile-tab-bar.tsx`
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx`
- Modify: `apps/web/src/components/bambi/persona-nav.tsx`
- Modify: `apps/web/src/app/employer/layout.tsx`
- Modify: `apps/web/src/components/bambi/employer-gate-banner.tsx`
- Modify: `apps/web/src/app/employer/page.tsx`
- Create/Modify: 관련 코치마크 Vitest
- Modify: `docs/test-flows/seeker-test-flow.md`
- Modify: `docs/test-flows/employer-test-flow.md`

- [ ] coachmark intent 1회 consume, 새로고침·중간 종료 재실행 없음 테스트를 추가한다.
- [ ] 구직자 3단계와 구인자 3단계 target 우선순위·누락 fallback 테스트를 추가한다.
- [ ] 모바일·데스크톱 target이 동일 의미의 ID를 제공하도록 기존 내비게이션 인터페이스를 최소 확장한다.
- [ ] 기존 내비게이션의 `/seeker/chats`·역할 조건이 이번 변경 지점에 하드코딩돼 있으면 공용 route/role 정본으로 옮기고 기존 호출부도 함께 사용하게 한다.
- [ ] 구인자 셸의 모바일·데스크톱 header에 기존 `ChatNavButton`을 노출하고 `/seeker/chats`, 안 읽음 배지, 기존 역할 권한이 그대로 동작하는지 검증한다. `EmployerNav` 하단 탭은 5개를 유지한다.
- [ ] spotlight 측정, resize/scroll 재측정, scrollIntoView, Escape·건너뛰기·완료를 구현한다.
- [ ] hidden duplicate target 제외와 첫 visible target 준비 전 intent 미소비, target timeout 안전 종료를 테스트한다.
- [ ] focus trap, 키보드, 스크린리더 제목·설명, reduced-motion을 검증한다.
- [ ] 역할별 테스트 플로우에 슬라이드 이후 코치마크 검수 절차를 기록한다.
- [ ] `feat: 역할별 메인 화면 코치마크 추가` 커밋 단위로 준비한다.

### Task 6: 통합 검증과 문서 동기화

- [ ] 가입 성공→온보딩→시작하기→코치마크→메인의 전체 흐름을 구직자·구인자 각각 검증한다.
- [ ] 가입 성공→첫 화면→브라우저 종료→재로그인 시 미노출을 검증한다.
- [ ] 가입 성공→건너뛰기→메인에서 코치마크 미노출을 검증한다.
- [ ] 같은 브라우저에서 서로 다른 신규 사용자 ID가 각자 한 번씩 노출되는지 검증한다.
- [ ] 기존 회원 로그인에는 자동 노출되지 않는지 검증한다.
- [ ] 오래된 signup intent의 사용자 ID·역할이 현재 세션과 다르면 자동 진입이 차단되는지 검증한다.
- [ ] 설정에서 역할별·공통 다시 보기와 완료 기록 불변을 검증한다.
- [ ] mobile 320/360/390/430px, tablet, desktop에서 레이아웃과 코치마크 위치를 확인한다.
- [ ] 실제 iOS Safari·Android Chrome 또는 동등한 브라우저에서 swipe, safe-area, `100dvh`, 뒤로가기, 새로고침을 확인한다.
- [ ] 실제 화면 캡처의 깨짐·CLS·alt·개인정보를 확인한다.
- [ ] web Vitest, `pnpm --filter web check-types`, 변경 파일 Ultracite, `git diff --check`를 통과한다.
- [ ] 변경 파일에서 중복 문자열·magic number·중복 역할 분기·중복 경로를 검색하고 관련 기존 하드코딩까지 공용 정본으로 전환했는지 코드 리뷰한다.
- [ ] 실제 검증 결과와 미검증 항목을 이 계획서에 기록한다.
- [ ] PR 직전 최신 `develop`을 반영하고 충돌을 해결한다. DB 변경이 없더라도 최신 migration 이력을 재확인한다.

---

## 9. 테스트 매트릭스

| 시나리오 | 기대 결과 |
| --- | --- |
| 신규 구직자 가입 성공 | `/onboarding`, 구직자 4장, seen 키 즉시 기록 |
| 신규 구인자 가입 성공 | `/onboarding`, 구인자 4장, seen 키 즉시 기록 |
| 다른 사용자 ID의 오래된 signup intent | 자동 온보딩 거부, 현재 역할 메인 이동 |
| 프로필 생성 실패 | signup intent·seen 키 없음, 가입 폼 오류 유지 |
| 일반 로그인 | 온보딩 우회, 기존 역할 라우팅 유지 |
| 첫 장에서 종료 | 다음 로그인 자동 미노출, 코치마크도 미노출 |
| 2장 건너뛰기 | 역할 메인 이동, 코치마크 미노출 |
| 마지막 시작하기 | 역할 메인 이동, 해당 역할 코치마크 1회 실행 |
| 메인 새로고침 | 코치마크 재실행 없음 |
| 사용자 A 완료 후 사용자 B 신규 가입 | B에게 자기 역할 온보딩 노출 |
| localStorage 차단 | 화면 오류 없이 현재 온보딩 진행 가능 |
| 기존 사용자·seen 키 없음 | signup intent가 없으므로 자동 미노출 |
| 설정 역할별 다시 보기 | 4장 재생, 시작 시 역할 코치마크, seen 키 불변 |
| 설정 공통 다시 보기 | 공통 4장, 역할 메인 이동, 코치마크 없음 |
| 구직자가 employer replay URL 직접 입력 | 거부 후 `/seeker` |
| 구인자가 job_seeker replay URL 직접 입력 | 거부 후 `/employer` |
| admin/legal_advisor 직접 접근 | 온보딩 미노출 |
| 비로그인 `/onboarding` 직접 접근 | proxy에서 로그인 게이트로 이동 |
| 온보딩 화면 | 메인 팝업·고객센터 플로팅 위젯 미노출 |
| target DOM 누락 | fallback 사용 또는 해당 단계 건너뜀, 화면 잠김 없음 |
| hidden mobile/desktop target 중복 | 현재 뷰포트에서 visible target만 spotlight |
| 구인자 메인 header 채팅 | `/seeker/chats` 이동과 기존 안 읽음 배지 유지, 하단 탭은 5개 유지 |
| reduced-motion | slide·coachmark 이동 애니메이션 제거 |

---

## 10. 범위 밖

- Expo `apps/native` 구현과 네이티브 성인인증·회원가입 연결
- 서버/DB 기반 온보딩 완료 동기화
- 다른 기기·브라우저 간 완료 상태 공유
- 기존 사용자에 대한 강제 재노출
- 운영자·법률자문가 온보딩
- 공통 온보딩 자동 노출 또는 공통 코치마크
- 사용자별 추천 공고 조건 저장, 신규 프로필 필드
- 이미지 안의 한글·버튼·UI를 AI로 생성
- 참고 서비스 이미지·로고·캐릭터 복제
- 온보딩 분석 이벤트 신설(별도 요구가 없으므로 범위 밖; 기존 GA를 임의 확장하지 않음)
- 앱 푸시 알림 권한, 위치 권한 등 브라우저 권한 요청

---

## 11. 최종 검수 체크리스트

- [ ] 성인인증과 회원가입 기존 회귀 없음
- [ ] 신규 가입 성공 뒤에만 자동 온보딩 노출
- [ ] 구직자·구인자·공통 각각 4장
- [ ] 구직자 `/seeker`, 구인자 `/employer` 이동
- [ ] 첫 화면 진입 즉시 사용자 ID별 완료 처리
- [ ] 중간 종료·건너뛰기 후 자동 재노출 없음
- [ ] 마지막 시작하기에만 역할 코치마크 실행
- [ ] 공통은 설정 다시 보기에서만 접근하고 코치마크 없음
- [ ] 실제 밤비 캡처 + 기존 로고·아이콘 + 코드 텍스트 구조
- [ ] 이미지에 텍스트·타 브랜드·워터마크·개인정보 없음
- [ ] 스와이프·이전/다음·페이지 점·건너뛰기·시작하기 동작
- [ ] 모바일·태블릿·데스크톱 반응형
- [ ] 구직자·구인자 각 3단계 코치마크와 target fallback
- [ ] 구인자 모바일·데스크톱 header의 실제 지원자 채팅 진입점과 기존 안 읽음 배지
- [ ] `/onboarding` proxy 게이트와 전역 메인 팝업·고객센터 위젯 제외
- [ ] 키보드·포커스·스크린리더·reduced-motion·safe-area 검증
- [ ] 신규·재사용 코드의 관련 하드코딩 제거와 역할·경로·키·TTL·콘텐츠·target 단일 정본 검증
- [ ] 관련 문서·테스트·타입·Ultracite·diff check 통과
- [ ] 최신 develop 재반영 및 바로 머지 가능한 상태 준비

---

## 12. PR 작성 기준

PR base는 `develop`, 브랜치는 `feat/role-onboarding-experience`로 유지한다. 이슈와 PR을 만들기 직전에 CMU02가 작성한 최신 이슈·PR 형식과 문체를 다시 확인해 동일한 구조로 작성한다.

PR 본문에는 최소한 다음을 기록한다.

- 가입 직후 역할별 온보딩을 추가한 목적
- 구직자·구인자·공통 4장 콘텐츠와 이미지 제작 방식
- 사용자별 기기 저장 및 “첫 진입 즉시 완료” 정책
- 시작하기·건너뛰기·중간 종료의 상태 전이
- 설정의 다시 보기
- 역할별 코치마크와 반응형·접근성 처리
- 자동·수동 검증 결과와 미검증 항목
- DB migration이 불필요한 이유
- `Closes #<issue-number>`

커밋 메시지는 한 줄 제목만 쓰지 않고 제목과 상세 본문을 함께 작성한다. 사용자가 PowerShell에서 직접 실행할 때 한글이 `??`로 깨지지 않도록 UTF-8 커밋 메시지 파일을 만드는 명령을 제공하고 `git commit -F <파일>`을 사용한다. 구현자는 커밋·푸시·머지하지 않는다.

---

## 13. 2026-09-01 구현·검증 기록

- 공통 4장도 보이는 캡처를 제거했다. 1·2장은 구직자 코드 채팅·면접 변형을 그대로 공유한다. 3장은 실제 `NotificationsScreen`의 헤더·모두 확인/비우기·브라우저 알림 안내·새 알림 카드 구조로 `새 채팅 메시지 → 면접 일정 제안 → 연락처 공개 요청 → 면접 일정 확정`을 1초 간격으로 추가한다. 4장은 구직자 채팅의 줄 3개 버튼 눌림 모션 후 실제 모바일 Sheet처럼 우측에서 채팅 정보가 열리고 공고 조건·면접 일정·공개 연락처·신고·차단을 표시한다.
- 구직자도 보이는 캡처 기반 화면을 제거했다. 1장은 최신 `SeekerMarketplaceScreen`·`PremiumAdBannerSection`·`VisualJobExposureSections`·`VisualJobCard`의 실제 모바일 구조를 따라 검색·업체·알림 헤더, 16:9 프리미엄 배너 3칸, 추천 공고 헤더, 스페셜·추천·전체 공고 섹션, 가로 썸네일/업체/지역/급여 카드, `탐색·채팅·수다방·내 정보` 4탭을 코드로 렌더링하고 기존 1초 간격 반 화면 자동 스크롤을 유지한다. 스페셜 제목은 테스트 문자열을 제거한 자연스러운 가상 공고 3개를 사용하고 전체 공고는 서로 다른 가상 제목·급여·샘플 썸네일 10개를 렌더링한다. 광고와 공고 이미지는 저장소의 sample-thumbnails만 사용한다. 2장은 구인자 채팅 구조·모션을 공유하되 `루나 라운지 강남점` 상대와 구직자 발신 질문·업체 답변·PDF 순서를 사용한다. 3장은 구인자 공고 조건·면접 일정 구조·우측 진입 모션을 공유하되 구인자 전용 요청 버튼·제안 폼 대신 `010-0000-0000` 공개 연락처를 표시한다. 4장은 기존 코드 후기 타이핑·별점·등록 반복을 유지한다.
- 구인자 2장은 `OO바`, `주말 라운지 모집`, `룸싸롱`, `서울`, `강남구`, `일급`, `2,000,000원`, `금·토 20:00–02:00`을 순차 입력하고 실제 상세 영역으로 이동해 가상 상세 설명과 면접 안내를 타이핑한다. 이어 실제 미디어 영역에서 `공고_썸네일_예시.png`와 `실제_내용_예시.png`를 표시하고 노출 영역에서 가격 없이 `60일 기간권`·`무통장입금`을 선택한 뒤 공고 등록 버튼 활성화·클릭, 맨 위 빈 폼 초기화를 무한 반복한다. 각 이동은 실제 섹션 DOM 위치와 구직자 1페이지의 공통 1초 스크롤 상수를 사용한다.
- 구인자 1장은 신규 업체 등록 상태에서 `밤비`, `111-11-11111`, `홍길동`, `2000-01-01`을 실제 타이핑처럼 순차 입력한다. 입력 완료 후 실제 서류 영역과 제출 영역의 DOM 위치를 기준으로 자동 스크롤하고 `사업자등록증.pdf` 첨부, 제출 버튼 활성화·클릭 모션을 보여준 뒤 맨 위 빈 폼으로 초기화해 무한 반복한다. 구직자 1장의 1초 스크롤·대기 상수와 구직자 4장의 150ms 타이핑·버튼 클릭 상수를 공유하며 기기 좌표를 계산하지 않는다.
- 구인자 3장은 실제 코드 채팅 헤더·안전 바·입력창을 고정한 채 `구인자 발신 → 지원자 수신 → PDF`를 1초 간격으로 아래에서 순차 표시한다. 구인자 4장은 공고 조건·면접 일정 외곽·면접 일정 제안 카드를 고정하고 `확정 일정 → 제안 일정 → 연락처 공개 요청`을 1초 간격으로 우측에서 진입시킨다. 두 장 모두 슬라이드 재진입 시 빈 상태부터 다시 시작하고 구직자의 기존 모션 토큰을 공유한다.
- 구인자 4장은 기존 390×844 캡처를 보이는 콘텐츠로 사용하지 않고, 최신 `origin/develop`의 실제 업체 정보·공고 등록·지원자 채팅·면접/연락처 구현에서 shadcn 구조와 필드 순서를 가져온 코드 미리보기로 렌더링한다. 업체 정보의 개업일자·국세청 안내·사업자 서류·제출·인증 카드, 공고 등록의 지역·급여·근무 일정·상세·미디어·노출·검수, 구인자 연락처 공개 요청까지 포함한다. 실제 `Logo`·하단 탭 아이콘·`Card`·`Input`·`Textarea`·`Checkbox`·`Badge`·`Alert`·`Button`을 사용한다. 이미지 자산은 공통 휴대폰 프레임의 종횡비 계산에만 invisible 상태로 남기며, 미리보기는 `inert`·`pointer-events-none`·`aria-hidden`으로 실제 API 요청·라우팅·입력·제출 없이 고정된다. 구직자 화면 방식은 변경하지 않는다.
- 구직자와 구인자는 역할별 화면 이미지·문구만 콘텐츠 registry에서 다르게 유지하고, 휴대폰 프레임·카메라·제목/설명·보조 아이콘·페이지 점·하단 CTA·모바일/데스크톱 반응형은 단일 `OnboardingSlide`와 `PhoneScreenMockup` 경로를 공유한다. 375×667 모바일 실측에서 첫 장 프레임·제목·이전/다음 버튼의 좌표와 크기가 양 역할에서 모두 일치함을 확인했다.
- 구직자 4장은 실제 `ReviewForm`의 선택 별 색상·flex/grid 구조·등록 버튼 상태를 코드로 재사용해 `5점 + 여기 괜찮은거 같아요 → 등록 클릭 → 초기화 → 1점 + 여기 완전 최악이에요 → 등록 클릭 → 초기화`를 고정 순서로 무한 반복한다. 본문은 한 글자씩 입력되고 온보딩 시연에서만 지정된 짧은 문장이 완성되면 등록 버튼이 활성화되며, 실제 후기 폼의 20자 검증 정책은 변경하지 않는다. 보이는 캡처 위에 좌표 기반 SVG를 합성하지 않고 컨테이너 비율 단위와 정상 문서 흐름으로 렌더링해 모바일·데스크톱에서 별과 버튼 위치를 공유한다.
- 구직자 3장은 공고 조건과 빈 면접 일정 컨테이너를 먼저 표시하고 `확정 일정 → 제안 일정 → 공개 연락처`를 1초 간격으로 우측 바깥에서 제자리까지 순차 진입시킨다. 휴대폰 프레임과 기존 카드 배치는 움직이지 않으며, 슬라이드 재진입 시 빈 일정부터 다시 시작한다.
- 구직자 2장은 기존 채팅 UI를 고정한 채 빈 대화창에서 시작해 `발신 말풍선 → 수신 말풍선 → PDF 첨부`를 1초 간격으로 순차 표시한다. 각 항목만 기존 `--dur-slow`·`--ease-out` 토큰을 사용해 아래에서 올라오며, 슬라이드를 나갔다 돌아오면 빈 화면부터 다시 시작하고 reduced-motion에서는 위치 이동을 생략한다.
- 구직자 첫 장은 동일한 휴대폰 프레임 안에서 상단 광고부터 여러 가상 공고까지 이어진 긴 화면을 실제 내부 스크롤로 천천히 자동 이동한다. 사용자가 데스크톱 휠이나 모바일 터치를 사용하면 자동 이동을 멈추고 직접 스크롤할 수 있으며, 끝에서는 되감지 않고 멈춘다. 좌우 슬라이드 동작은 유지하고 reduced-motion 환경에서는 자동 이동을 생략한다.
- 자동 시연의 cadence는 사용자가 지정한 대로 `1초 정지 → 1초 동안 반 화면 높이만큼 ease-out 스와이프 → 1초 정지`를 끝까지 반복한다. 다른 슬라이드에서 첫 장으로 돌아오면 내부 위치를 0으로 초기화하고 같은 cadence를 다시 시작한다.
- 모바일 레이아웃은 기준 화면의 세로 흐름을 복원하고 Chrome iPhone SE `375×667`에서 검증했다. 데스크톱은 `1280×720`에서 휴대폰 왼쪽·설명 오른쪽·조작부 하단 중앙 배치와 무스크롤을 확인했다.
- 원형 전면 카메라를 휴대폰 프레임의 별도 상단 행으로 분리했다. 카메라 영역은 유지하되 실제 화면 캡처나 앱 헤더가 해당 영역을 침범하지 않는다.
- 스와이프 임계값, 코치마크 반경, 완료 마커는 컴포넌트 리터럴로 두지 않고 각 도메인 설정의 단일 정본에서 사용한다.
- 구직자 3·4장이 같은 화면을 사용하지 않도록 4장을 실제 `ReviewForm`으로 렌더링한 빈 후기 작성 화면으로 교체하고, 두 자산이 동일하지 않음을 자동 테스트한다. 실제 계정의 업체명·대화·후기 내용은 온보딩 정적 자산에 포함하지 않는다.
- 채팅·면접·후기 자산은 실제 계정 캡처 대신 밤비 UI로 렌더링한 온보딩 전용 가상 업체·지원자·일정·연락처·대화를 사용한다. 구직자와 구인자 채팅 자산은 역할에 맞춰 서로 다른 대화 관점으로 만든다.
- 구현 완료: 신규 가입 성공 의도, 사용자 ID·역할별 localStorage 완료, 역할별·공통 4장, 스와이프·이전/다음·건너뛰기·시작하기, 설정 다시 보기, 역할별 3단계 코치마크, 구인자 header 채팅 진입점, 전역 팝업·고객센터 온보딩 제외.
- 자산 완료: 실제 development seed의 구직자·구인자 계정으로 390×844 화면 12장을 캡처했다. 개발 표시가 없는 production 렌더에서 공고·업체 정보·공고 등록·채팅·면접·연락처·알림 화면을 다시 확인했으며, 개인정보나 GCS 자격 증명은 포함하지 않는다.
- GCS 정합성: 온보딩 이미지는 빌드 고정 자산이라 `apps/web/public`에 두었고 기존 공개·비공개 GCS 코드는 변경하지 않았다. API GCS/사업자 문서 테스트 21건과 web GCS URL/이미지 매퍼 테스트 25건을 통과했다.
- 자동 테스트: web Vitest 114개 파일, 875개 테스트 전체 통과.
- 타입 검사: `web`과 `server` 통과. 루트 `native`는 이번 범위 밖 기존 오류 6건(`regionCode`, `displayName`, nullable `payUnit`)으로 실패하며 이번 변경에서 native 파일은 수정하지 않았다. `@bambi-app/env` 단독 `tsc`는 기존 tsconfig의 DOM lib 부재로 `src/web.ts`의 `window`에서 실패하지만, 실제 소비자인 web/server 타입 검사와 production build는 통과했다.
- 정적 검사: 변경 TS/TSX/JSON Ultracite 통과, `git diff --check` 통과.
- production build: `/onboarding`을 포함한 Next production build 통과. 기존 `local-grade-icons` 동적 filesystem trace에 대한 Turbopack warning 1건은 남아 있으며 이번 변경과 무관하다.
- 수동 검증: 390×844에서 구인자 4장 이동, `시작하기` 후 `/employer`, 업체 정보→공고 등록→지원자 채팅 코치마크 3단계와 완료 후 dialog 제거를 확인했다. 구직자·공통 화면의 문구·페이지 수·정적 자산 렌더를 확인했다.
- 모바일 한 화면 보완: 기존 `min-h-[42rem]`과 폭 기준 휴대폰 목업 때문에 CTA가 viewport 아래로 밀리던 문제를 제거했다. 390×844 실측에서 `innerHeight`, `clientHeight`, `scrollHeight`가 모두 844px이고 이전·다음 버튼 하단이 816px이라 스크롤 없이 한 화면에서 조작할 수 있음을 확인했다. 320~430px 회귀를 정적 레이아웃 테스트로 고정했다.
- develop 확인: 최종 fetch 결과 `origin/develop`은 기준 커밋 `ad3533b4325af5f23ab19913bcbb5c9548d8e699`과 동일해 추가 반영이나 충돌 해결이 필요하지 않았다.
- 아직 하지 않음: 실제 신규 성인인증을 다시 수행하는 외부 PortOne 실인증, 실제 iOS/Android 기기 검수, 이슈·PR 작성, 커밋·푸시. 사용자 직접 커밋·푸시 원칙을 유지한다.

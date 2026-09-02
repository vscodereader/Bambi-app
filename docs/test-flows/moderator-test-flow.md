# 운영자(Moderator) 테스트 흐름

## 사업자 인증 서류 추가 검수

- 회원 관리의 업소 관리 카드에서 제출된 사업자 인증 서류 개수와 파일 목록을 확인한다.
- 이미지 서류는 썸네일과 원본 열기를, PDF 서류는 새 창 열기를 확인한다.
- 각 서류의 다운로드 버튼으로 원본 파일을 받을 수 있는지 확인한다.
- 서류가 없는 기존 승인·심사 중 업체는 기존 상태와 심사 흐름이 그대로 유지되는지 확인한다.

> 이 문서는 `bambi-app` 리포의 **현재 코드**만을 근거로 작성했다. `docs/manual/moderator-manual.md`는
> 근거로 쓰지 않았고, 마지막 부록에서 대조 결과만 정리한다.
>
> 경로 표기: 웹 라우트는 `apps/web/src/app/...`, tRPC(oRPC) 프로시저는 `packages/api/src/routers/bambi/...`.

---

## 0. 사전 조건

### 0.1 역할 모델 (코드 확인)

- 계정 역할 enum은 `job_seeker` / `employer` / `admin` / `legal_advisor`이다
  (`packages/db/src/schema/bambi.ts` `bambiUserRole`. `guest`도 같은 enum에 있지만 계정 없는 비회원
  작성자 스냅샷 전용이라 회원 목록에는 나오지 않는다).
  **`moderator`라는 별도 역할·등급은 코드에 존재하지 않는다.** 화면 이름만 "운영자 콘솔"(`/moderator`)이고
  실제 권한 값은 `admin` 하나다. 따라서 **운영자 등급별 차등 권한 테스트는 대상이 없다**(부록 참조).
- `legal_advisor`는 **운영자만 지정**하는 역할이며(§4.6), 콘솔 권한은 전혀 없다 — 수다방
  `무료 법률 자문` 게시판의 잠긴 글을 열람·답변할 수 있을 뿐이다.
- 계정 상태 enum: `active` / `warned` / `suspended` (`accountStatus`).

### 0.2 권한 게이트 2중 구조

| 계층 | 구현 | 파일 |
| --- | --- | --- |
| 화면(서버 컴포넌트) | `enforceModeratorAccess()` — `bambi.onboarding.getMyRouting()` 호출 → `role !== "admin"`이면 역할별 홈으로 `redirect` | `apps/web/src/app/moderator/layout.tsx`, `apps/web/src/lib/bambi/require-role.ts` |
| API | `requireAdminProfile(session)` — 로그인 + 밤비 프로필 존재 + `status !== "suspended"` + `role === "admin"` | `packages/api/src/services/bambi-authz.ts` |
| API(신규 방식) | `adminProcedure` = `protectedProcedure.use(requireAdmin)` 미들웨어 | `packages/api/src/index.ts` |

- **미들웨어(`adminProcedure`)로 이관된 프로시저와, 핸들러 첫 줄에서 `requireAdminProfile`을 직접 부르는
  프로시저가 섞여 있다.** 코드 주석이 "한 줄만 빠뜨리면 그대로 뚫린다"고 명시한 상태다. 시나리오별로
  어느 방식인지 표기했다.
- **Next 미들웨어(`middleware.ts`)는 리포에 존재하지 않는다.** 라우트 보호는 오직 `/moderator/layout.tsx`의
  서버 가드뿐이다.
- `getMyRouting`은 **계정 상태(`suspended`)를 보지 않는다**(`packages/api/src/routers/bambi/onboarding.ts` L564~).
  → 정지된 admin은 **콘솔 화면은 열리지만 모든 조작 API가 403**이 된다(권한 경계 테스트 §16.4).

### 0.3 테스트 계정 · 시드

- 시드 스크립트: `apps/server/src/seeds/bambi-dev.ts` (`pnpm db:seed:bambi`).
- 운영자 계정: **`admin@bambi.dev` / 비밀번호 `Bambi1234!`** (`devUsers`의 `key: "admin"`, `role: "admin"`).
  로그인 아이디(`login_id`)는 dev 유저 key 소문자 = `admin`, 시드가 `isPhoneVerified: true`로 채운다.
- 함께 생기는 데이터: 승인 완료 조직(`ids.lunaOrganization`), 승인 대기 조직(`ids.pendingOrganization`),
  구인자·구직자 다수, 공고/채팅방/후기/신고/커뮤니티 글.
- 광고 카탈로그 시드: `packages/db/scripts/seed-ad-catalog.ts`.
- 지역 시드: `pnpm db:seed:regions`.

> ⚠ **주의**: `packages/api/src/routers/bambi` 테스트 스위트는 dev DB를 지운다. QA 중 절대 실행하지 말 것.

### 0.4 env 의존성 (시나리오별 상세는 각 절)

- 크롤러: 사이트별 수집 자격(§10). 특히 `queenalba`는 성인인증 게이트 뒤라 브라우저 쿠키 주입이 필요.
- 사업자 진위확인: 국세청 서비스키(`NTS_SERVICE_KEY` 계열). 미설정이면 모든 제출이 "국세청 미확인"으로 접수(§5).
- 미디어(GCS): 공고 하드삭제 시 GCS 객체 삭제를 수행하므로 스토리지 자격 필요(§3.4).

### 0.5 콘솔 네비게이션 (코드 확인)

`apps/web/src/lib/bambi/moderator-navigation.ts`의 `MODERATOR_NAV_ITEMS`:

- 검수 큐 `/moderator`
- 공고 관리 `/moderator/jobs`
- 회원 관리: 사용자 `/moderator/users` · 채팅 `/moderator/chats` · 면접 일정 `/moderator/interviews` ·
  신고 `/moderator/reports` · 업소 승인 `/moderator/employers` · 팀 합류 승인 `/moderator/team-invites` ·
  출석 관리 `/moderator/attendance`
- 광고·결제: 광고 상품 `/moderator/ad-products` · 결제 관리 `/moderator/payments`
- 콘텐츠: 게시물 `/moderator/content` · **게시판 관리 `/moderator/community-boards`** · 고객센터 `/moderator/support` ·
  금칙어 `/moderator/banned-words` · 후기 관리 `/moderator/reviews` · 크롤링 `/moderator/crawler` ·
  팝업 `/moderator/popups`
- 사이트 정보 `/moderator/site-settings`

모바일 하단 탭(`ModeratorShell`, `apps/web/src/components/bambi/persona-nav.tsx`)은
검수/신고/사용자/후기/광고 상품 5개만 노출하고 나머지는 **더보기** 시트(`MODERATOR_MORE_GROUPS`)로 접힌다. 데스크톱과 모바일은 같은 공통 메뉴 정의를 사용한다.

### 0.6 모바일 더보기 회귀 테스트

- 모바일 운영자 화면에서 **더보기**를 열고 공고 관리, 업소 승인, 팀 합류 승인, 광고 상품, 결제 관리, 게시물, 고객센터, 금칙어, 크롤링뿐 아니라 **채팅, 후기 관리, 사이트 정보**까지 모두 표시되는지 확인한다.
- 시트를 아래에서 위로 스와이프해 마지막 사이트 정보 항목까지 스크롤할 수 있어야 한다.
- 각 항목을 누르면 해당 경로로 이동하며 현재 경로가 활성 스타일로 표시되어야 한다.

---

## 1. 운영자 접근·권한

### 1.1 운영자 로그인 후 콘솔 진입

- **경로**: `/moderator` (파일: `apps/web/src/app/moderator/layout.tsx`, `apps/web/src/app/moderator/page.tsx`)
- **선행 조건**: 시드 완료, `admin@bambi.dev` 계정 존재.
- **절차**:
  1. 로그아웃 상태에서 `/moderator` 접근 → `/seeker?auth=login`으로 리다이렉트되는지 확인.
  2. `admin@bambi.dev` / `Bambi1234!`로 로그인.
  3. `/moderator` 재진입.
- **기대 결과**: 검수 큐 목록이 렌더된다. 상단에 "운영자 콘솔" 제목과 요약 3종
  (검수 대기 / 신고 대기 / 경고 사용자)이 표시된다(`ConsoleTop`, `moderator.tsx` L240~).
  - 검수 대기 = `listJobPosts({status:"pending_review", limit:50})` 건수
  - 신고 대기 = 신고 중 `status ∈ (open, reviewing)` 건수
  - 경고 사용자 = 계정 목록 중 `status === "warned"` 건수
- **엣지 케이스 / 실패 케이스**:
  - 프로필이 없는(온보딩 전) 계정 → `role === null` → `/seeker?auth=login`.
  - `getMyRouting` 자체가 실패해도 `/seeker?auth=login`.
- **관련 API**: `bambi.onboarding.getMyRouting` (`packages/api/src/routers/bambi/onboarding.ts`),
  `bambi.moderation.listJobPosts` / `listReports` / `listUsers` (`packages/api/src/routers/bambi/moderation.ts`)

### 1.2 라우트 간 상태 공유 확인

- **경로**: `/moderator` ↔ `/moderator/reports` ↔ `/moderator/users`
  (파일: `apps/web/src/components/bambi/screens/moderator-context.tsx`)
- **절차**: 큐에서 항목 몇 개를 체크 → 다른 탭으로 이동 → 되돌아온다.
- **기대 결과**: `ModeratorShell`의 `useEffect`가 **경로가 바뀌면 선택을 비운다**
  (`persona-nav.tsx` L161~168). 즉 탭 이동 시 선택이 유지되지 않는 것이 정상 동작이다.
- **관련 API**: 없음(클라이언트 상태).

---

## 2. 심사 큐 — 공고 승인/반려

공고 상태 전이(`jobPostStatus`): `draft → pending_review → published | hidden | rejected`.
**모든 공고는 예외 없이 `pending_review`로 생성된다**(`packages/api/src/routers/bambi/jobs.ts` L1664~1665,
"업소 인증 여부로 건너뛰지 않는다"). 공개 노출 게이트는 `status = published` **AND** `paymentStatus = paid`.
무료 공고(유료 노출상품 미선택)는 생성 시 `paymentStatus = "paid"`로 들어가므로 승인만으로 노출된다.

### 2.1 검수 큐 목록 조회·필터·정렬

- **경로**: `/moderator` (파일: `apps/web/src/app/moderator/page.tsx` → `QueueList`,
  `apps/web/src/components/bambi/screens/moderator.tsx` L487~)
- **선행 조건**: `pending_review` 상태 공고 1건 이상.
- **절차**:
  1. `/moderator` 진입.
  2. 상태 필터 Select: 전체 상태 / 높은 위험 / 중간 위험 / 낮은 위험.
  3. 정렬 Select: 회신순 / 최신순 / 위험도순.
- **기대 결과**:
  - 목록은 `listJobPosts({status:"pending_review", limit:50})` 결과다.
  - 위험도는 서버가 저장 시 판정한 `detectedTerms`가 **비어 있지 않으면 `mid`(감지), 비어 있으면 `low`**로
    파생된다(`moderator-context.tsx` `toApiQueueItem`). 즉 **`high`는 큐에서 나오지 않는다** —
    "높은 위험" 필터는 항상 0건이다(부록 확인 필요 항목).
  - 각 행에 업소명·업종·지역·급여·접수시각·`#앞8자` 참조 ID, 감지 문구 배지가 뜬다.
- **엣지 케이스**: 상한 50건 고정(UI에 limit 조절 없음). 51건째부터 큐에서 보이지 않는다.
- **관련 API**: `bambi.moderation.listJobPosts` (`moderation.ts` L983, `protectedProcedure` +
  핸들러 내 `requireAdminProfile`)

### 2.2 단건 승인

- **경로**: `/moderator/queue/[id]` (파일: `apps/web/src/app/moderator/queue/[id]/page.tsx`,
  상세 UI `moderator.tsx` `QueueDetail` L675~)
- **선행 조건**: 큐 목록에 해당 공고가 있어야 한다(상세는 컨텍스트의 큐 배열에서 찾는다).
- **절차**:
  1. 큐 목록에서 행 클릭 → 상세 진입.
  2. "자동 필터가 감지한 신호 N건" 영역과 본문의 하이라이트(감지 표현)를 확인.
  3. 이미지 영역(`QueueMediaSection`) — `getJobPostForAdmin`으로 별도 조회한 cover/detail 미디어.
  4. 데스크톱 판정 도크(또는 모바일 하단 바)의 **승인** 클릭.
     (무료 공고는 승인 즉시 게시되고, 유료 상품 공고는 입금 확인 후 게시된다.)
  5. **승인 사유 작성** 시트에서 선택지를 고르거나(입력칸에 프리필) 직접 작성 → **승인하기** 클릭.
     (선택지: 운영 검수 기준 충족 / 감지 표현이 오해 소지 수준 / 업소 정보 확인 완료 /
     보완 요청 반영 확인 / 기타 승인 사유. 2자 미만이면 확정 버튼 비활성.)
- **기대 결과**:
  - `setJobPostStatus({status:"published", reason: 작성한 사유})` 호출
    (미입력 불가 — 빈 값이면 `resolveQueue`가 기본 문구 "운영자가 공고를 승인했습니다."로 대체).
  - 서버가 `publishedAt`을 최초 승인 시각으로 채우고 `rejectionReason`을 `null`로 지운다
    (`getJobPostModerationStatusPatch`, `moderation.ts` L654~682).
  - `admin_moderation_action`에 `set_status:published` 감사 로그가 남는다.
  - 큐 목록으로 되돌아가고 해당 항목이 사라진다. 토스트 "공고를 승인했어요".
- **엣지 케이스 / 실패 케이스**:
  - 목록에 없는 id로 직접 URL 진입 → "검수 공고를 찾을 수 없어요." 화면.
  - API 실패 시 토스트 "공고 상태를 API에 반영하지 못했어요."가 뜨지만 **화면은 이미 목록으로 이동한 뒤**다
    (`resolveQueue`는 mutate 직후 곧바로 `router.push`).
  - 유료 노출상품이 붙은 공고는 승인해도 `paymentStatus = unpaid`면 노출되지 않는다 → §11에서 결제 처리 필요.
- **관련 API**: `bambi.moderation.setJobPostStatus` (`moderation.ts` L1407),
  `bambi.moderation.getJobPostForAdmin` (L1038, `adminProcedure`)

### 2.3 단건 반려 / 보류 (사유 직접 작성)

- **경로**: `/moderator/queue/[id]` (판정 시트: `moderator.tsx` `VerdictReasonSheet`,
  문구·선택지는 `VERDICT_SHEETS`)
- **절차**:
  1. 상세에서 **반려**(또는 **보류**) 클릭.
  2. "반려/보류 사유 작성" 시트에서 선택지를 누르면 **아래 입력칸에 그 문구가 프리필**된다.
     반려 선택지: 성적 서비스 암시 표현 / 강요·착취 의심 조건 / 외부 연락 유도 / 허위·과장 정보 / 기타 정책 위반.
     보류 선택지: 업소 정보 추가 확인 필요 / 사업자 인증 확인 필요 / 공고 내용 보완 요청 예정 /
     내부 논의 필요 / 기타 확인 필요.
  3. 입력칸에서 문구를 **직접 고쳐 쓰거나 새로 작성**한다(목록 일괄 처리 `ReasonConfirmSheet`와 동일 흐름).
  4. **반려하기 / 보류하기** 클릭.
- **기대 결과**:
  - 반려: `setJobPostStatus({status:"rejected", reason: 작성한 사유})` →
    서버가 `jobPost.rejectionReason = reason`으로 저장. 감사 로그 `set_status:rejected`.
  - 보류: `setJobPostStatus({status:"on_hold", reason: 작성한 사유})` → 감사 로그 `set_status:on_hold`.
    `rejectionReason`·`publishedAt`은 그대로 유지된다(`getJobPostModerationStatusPatch`).
  - 세 판정(승인·보류·반려) 모두 시트를 거치므로 상세와 목록 일괄 처리의 기록 방식이 같다.
- **엣지 케이스 / 실패 케이스**:
  - 사유 2자 미만(공백 제외)이면 확정 버튼이 비활성이다(`VERDICT_REASON_MIN_LENGTH = 2`,
    서버 입력 스키마 `z.string().min(2)`와 동일).
  - **보류한 공고는 검수 큐에 다시 나타나지 않는다**(큐는 `pending_review`만 조회).
    `/moderator/jobs`의 **검수 보류** 탭에서 찾아 마무리한다(§3.2).
- **관련 API**: `bambi.moderation.setJobPostStatus`

### 2.4 큐 일괄 처리(승인/반려/보류)

- **경로**: `/moderator` (액션 바: `moderator.tsx` `QueueActionBar` L2651~, `BULK_ACTIONS` L2563~)
- **절차**:
  1. 목록 행의 체크박스로 2건 이상 선택 → 하단(모바일 고정 / 데스크톱 sticky) 액션 바 노출.
  2. **반려 / 보류 / 승인** 중 하나 클릭 → 사유 시트(기본 문구 프리필) → 2자 이상 입력 → 적용.
- **기대 결과**:
  - 승인 → `published`, 반려 → `rejected`, **보류 → `on_hold`** (`applyQueueBulkAction`).
    보류는 운영자 강제 숨김(`hidden`)과 다른 상태이며, 구인자 목록에는 "검수 보류"로 표시된다.
  - 결과 토스트: `"<액션> · 성공 N건 · 실패 M건 · 실패 ID xxxxxxxx, ..."` (최대 3개 ID).
  - 각 건마다 감사 로그(`metadata: { bulk: true }`).
- **엣지 케이스 / 실패 케이스**:
  - 대상 0건이면 `BAD_REQUEST`, **51건 이상이면 `BAD_REQUEST`**
    (`BULK_MODERATION_TARGET_LIMIT = 50`, `packages/api/src/services/bambi-moderation-bulk.ts`).
  - UUID가 아닌 id는 클라이언트에서 걸러진다(`isUuid` 필터).
  - 전체가 단일 트랜잭션이라 PG 레벨 오류가 나면 이후 항목이 연쇄 실패할 수 있다.
- **관련 API**: `bambi.moderation.bulkSetJobPostStatus` (`moderation.ts` L1620)

### 2.5 검수 상세에서 결제 상태 전환

- **경로**: `/moderator/queue/[id]` 하단 결제 패널
  (파일: `apps/web/src/components/bambi/moderator-payment-panel.tsx`)
- **선행 조건**: 해당 공고의 `exposureType !== "standard"` (유료 노출). standard면 패널 자체가 렌더되지 않는다.
- **절차**: 패널의 **결제완료 처리** / **미결제로 되돌리기** 클릭.
- **기대 결과**: `setJobPostPayment` 호출. `paid` 전환 시
  `exposureEndsAt = now + exposureDurationDays`가 새로 계산되고, `unpaid` 전환 시 `exposureEndsAt = null`.
  조직 광고 자격 캐시(`syncAdvertiserFlagForOrganization`) 재동기화.
- **엣지 케이스 / 실패 케이스**:
  - 배너형(`premium-banner`/`left-banner`/`right-banner`) 승인은 **프리미엄 정원(10자리) 게이트**를 탄다.
    만석이면 `CONFLICT` + "프리미엄 광고 정원(10자리)이 가득 차 승인할 수 없어요." 토스트.
  - > ⚠ `paid → unpaid`로 되돌리면 `exposureEndsAt`이 `null`로 지워진다. 다시 결제완료 처리하면
    > **광고 기간이 그 시점부터 새로 시작**되어 원래 만료일이 소실된다. 되돌리기 어려운 조작.
- **관련 API**: `bambi.moderation.setJobPostPayment` (`moderation.ts` L1451),
  정원 게이트 `packages/api/src/services/bambi-premium-capacity.ts`

---

## 3. 공고 관리(전체 상태)

### 3.1 목록 조회·필터·검색

- **경로**: `/moderator/jobs` (파일: `apps/web/src/app/moderator/jobs/page.tsx`)
- **절차**:
  1. 상태 탭: 전체 / 검수 대기 / 검수 보류 / 공개 / 숨김 / 반려
     (`draft`는 필터 선택지에 없음 — 전체 조회에는 포함될 수 있음).
  2. 검색 입력: 공고 제목·업소명(클라이언트 필터).
- **기대 결과**: DataTable 컬럼 = 제목 / 업소 / 업종 / 지역 / 급여 / 상태 / 노출 종류 / 결제 상태 /
  만료(남은 기간) / 관리. 페이지 크기 10.
- **제목 링크(공개 상세 이동)**: 제목이 `/seeker/jobs/[id]` 링크가 되는 건 **`status === "published"`
  이고 `paymentStatus === "paid"`인 행뿐이다**(`isPubliclyViewable`). 공개 상세가 그 게이트를
  통과한 공고만 열어 주므로, 그 외 상태에서 링크를 걸면 404가 난다. 링크가 아닌 행은 제목이
  일반 텍스트로 뜨고 아래에 `비공개 공고 · 상세 보기 불가(<표시 상태>)`가 붙는다
  (표시 상태는 `getJobDisplayStatus` 라벨 — enum 원값 노출 없음, published+미결제는 "미공개").
  운영자 편집(`수정` 액션 → `/moderator/jobs/[id]/edit`)은 상태와 무관하게 항상 열린다.
- **엣지 케이스**: 서버 조회 상한 `LIST_LIMIT = 100`(서버 max도 100). 검색·정렬은 이 100건 안에서만 동작.
- **관련 API**: `bambi.moderation.listJobPosts`

### 3.2 강제 숨김 / 재공개 / 검수 보류 공고 마무리

- **경로**: `/moderator/jobs` 행 액션 (`STATUS_ACTIONS`가 현재 상태에 맞는 항목만 낸다)
  - `published` → "숨김"
  - `hidden` → "재공개"
  - `on_hold` → "승인" / "반려"
  - 그 밖(`pending_review`·`rejected`) → 상태 변경 항목 없음(광고 연장·단축·수정·삭제만)
- **절차**: 행 메뉴 → 항목 선택 → 다이얼로그에서 사유(2자 이상, 기본 문구 프리필) → 확정.
- **기대 결과**: `setJobPostStatus`로 `hidden`/`published`/`rejected` 전환. 재공개·승인 시
  `rejectionReason`이 `null`이 되고 `publishedAt`은 기존 값 유지(최초 게시 시각 보존).
  토스트 후 모든 상태 필터 캐시 무효화.
- **엣지 케이스**:
  - 사유 2자 미만이면 확정 버튼 비활성.
  - **보류 공고에는 "재공개"가 없다** — 검수 결론을 건너뛴 게시를 막기 위해 승인/반려만 제공한다.
  - 검수 큐는 `pending_review`만 조회하므로, 보류 공고를 다시 찾는 경로는 이 화면의 **검수 보류** 탭뿐이다.
  - 구인자가 보류 공고를 수정해 다시 제출하면 `getUpdatedJobPostStatus`가 `pending_review`로 되돌려
    큐에 다시 올라온다.
- **관련 API**: `bambi.moderation.setJobPostStatus`

### 3.3 광고 기간 연장 / 단축

- **경로**: `/moderator/jobs` 행 액션 → "광고 연장" / "광고 단축"
- **절차**: 일수 입력(1~365 정수, 기본 7) + 사유(2자 이상) → 확정. 다이얼로그가 적용 후 종료일을 미리 보여준다.
- **기대 결과**: `exposureEndsAt = (기존 exposureEndsAt ?? now) + (±days)`.
  감사 로그 `adjust_job_post_exposure:+N` / `:-N` (metadata에 이전·이후 종료일).
  이후 `syncAdvertiserFlagForOrganization`.
- **엣지 케이스 / 실패 케이스**:
  - 서버 입력 검증: `days`는 `-365 ~ 365` 정수이고 **0은 거부**("조정할 일수를 입력하세요.").
  - > ⚠ 종료일이 없던(미결제·무기한) 공고에 적용하면 **지금 기준으로 종료일이 새로 생겨 무기한 → 기한부로 바뀐다.**
  - > ⚠ 음수(단축)로 과거까지 내릴 수 있다 = 즉시 만료 조치. 결제 상태·노출 종류는 그대로라 정원 게이트를 타지 않으므로,
    > 만료시키면 프리미엄 정원 자리가 즉시 반환된다.
- **관련 API**: `bambi.moderation.adjustJobPostExposure` (`moderation.ts` L1518, **`adminProcedure`**)

### 3.4 공고 하드삭제

- **경로**: `/moderator/jobs` 행 액션 → "삭제"
- **절차**: 삭제 다이얼로그에서 사유(2자 이상) 입력 → **삭제 확정**.
- **기대 결과**: `adminDeleteJobPost` 호출. `job_post` 행 삭제 + FK cascade로 미디어·프로모션·성과·채팅방(→메시지)
  까지 삭제, GCS 미디어 객체는 키를 미리 확보해 직접 삭제(`deletePublicObjects`).
  감사 로그 `hard_delete`(targetType `job_post`).
- **엣지 케이스 / 실패 케이스**: 존재하지 않는 id → `NOT_FOUND`.
- > ⚠ **되돌릴 수 없다.** 연결된 채팅방·메시지·이미지가 모두 사라진다. QA에서는 삭제 전용으로 만든
  > 더미 공고에만 수행할 것.
- **관련 API**: `bambi.moderation.adminDeleteJobPost` (`moderation.ts` L1100, `adminProcedure`)

### 3.5 운영자 공고 직접 편집

- **경로**: `/moderator/jobs/[id]/edit` (파일: `apps/web/src/app/moderator/jobs/[id]/edit/page.tsx`)
- **선행 조건**: 대상 공고 존재. 운영자는 해당 조직 멤버가 아니어도 된다.
- **절차**:
  1. 행 액션 → "수정" → 편집 화면 진입(프리필은 `getJobPostForAdmin`: 전체 필드 + 미디어 세트 + 배너 레이아웃).
  2. 제목·본문 블록·급여·지역·노출 옵션 등 수정.
  3. 저장.
- **기대 결과**:
  - `adminUpdateJobPost` 호출 → 구인자 편집과 동일한 `applyJobPostUpdate` 로직을 재사용하되
    **`moderatorEdit: true`** 라 **검수 상태·결제 상태·광고 종료일이 전부 유지**된다
    (게시 중 공고를 고쳐도 내려가지 않고, 승인 직전 공고가 큐로 되돌아오지 않으며,
    노출 상품·기간을 바꿔도 미결제로 떨어지지 않고 즉시 반영된다).
  - 감사 로그 `edit_job_post`("운영자 공고 수정").
  - 성공 토스트 후 `/moderator/jobs`로 이동.
- **엣지 케이스 / 실패 케이스**:
  - **신규 이미지 업로드 불가** — 업로드 인텐트가 조직 스코프라 운영자는 못 받는다.
    `JobPostMediaUploader`가 `allowUpload=false`이고, 파일이 남아 있으면
    `rejectAdminUpload()`가 "운영자 편집에서는 새 이미지를 올릴 수 없습니다."로 명시적 실패시킨다.
    기존 이미지 삭제·설명 수정만 가능.
  - 존재하지 않는 공고 id → `NOT_FOUND`.
- **관련 API**: `bambi.moderation.getJobPostForAdmin`, `bambi.moderation.adminUpdateJobPost`
  (`moderation.ts` L1038 / L1062, 둘 다 `adminProcedure`)

---

## 4. 사용자 관리·제재

### 4.0 운영자 가계정 생성

- **경로**: `/moderator/users/create` (`회원 관리 → 계정 생성`).
- 이름은 필수 입력이지만 API payload와 DB에 남지 않고, 닉네임은 `user.name`에 저장된다.
- 생년월일은 유효한 만 19세 이상 날짜, 가번호는 `010-0000-0000`, 역할은 구직자·구인자만 허용한다.
- 성공 시 `user` + Better Auth `credential account` + 인증 완료 `bambi_profile` + `create_test_account` 감사 로그가 함께 생성되고, 입력한 ID/PW로 실제 로그인된다.
- CI·DI는 계정별 가상 원문을 해시해 저장하며 기존 회원 CI·DI, 실제 인증 티켓, 인증 로그를 변경하지 않는다.
- 여성 구직자는 일반 수다방, 남성 구직자는 공지사항·비밀게시판 범위, 구인자는 업체 제출·승인 전 공고 등록 거부를 확인한다.
- 같은 ID, 금지 닉네임, 미성년, 잘못된 날짜·가번호, 비운영자 호출은 거부되고 반쪽 계정이 남지 않는다.
- 구인자 가계정에는 조직·멤버십·업체 프로필을 자동 생성하지 않는다.

### 4.1 계정 목록 조회·필터·검색

- **경로**: `/moderator/users` (파일: `apps/web/src/app/moderator/users/page.tsx`,
  테이블 `apps/web/src/components/bambi/moderator-users-table.tsx`)
- **절차**:
  1. 상태 탭: 전체 / 정상 / 경고 / 정지 / **탈퇴**(= `deletedAt !== null`, enum이 아니라 별도 축).
  2. 역할 Select(전체/구직자/**법률자문**/구인자/운영자), 휴대폰 인증 Select(전체/인증/미인증).
  3. 누적 신고 Select(0/1/3/5/10건 이상), 경고 횟수 Select(0/1/3/5회 이상).
  4. 검색: 이름·이메일·로그인 아이디.
- **기대 결과**:
  - 기준 테이블은 `user`이고 `bambi_profile`은 좌측 조인 → **온보딩 전(프로필 없는) 계정도 목록에 나온다**
    (역할은 `job_seeker`, 상태는 `active`로 coalesce).
  - 컬럼 파생값: 누적 신고 = 대상이 그 사용자이고 `status <> 'dismissed'`인 신고 수,
    경고 횟수 = 감사 로그 `set_status:warned` 수, 차단당한 횟수 = `user_block` 수, 소속 업소 표시명 배열.
  - 탈퇴 계정은 제재 상태 필터(정상/경고/정지)에서 제외된다.
- **엣지 케이스**: `limit: 1000` 고정 조회 후 클라이언트 페이징. 계정이 1000을 넘으면 서버 페이징 필요.
  조회 실패 시 "불러오기 실패" 빈 상태.
- **관련 API**: `bambi.moderation.listUsers` (`moderation.ts` L1138)

### 4.2 단건 제재(경고 / 이용 정지)

- **경로**: `/moderator/users/[id]` (파일: `apps/web/src/app/moderator/users/[id]/page.tsx`,
  UI `moderator.tsx` `UserDetail` L2266~ / `ReasonConfirmSheet` L2048~)
- **선행 조건**: 대상이 목록(컨텍스트)에 있어야 한다. 대상은 **밤비 프로필이 있는 계정**이어야 한다.
- **절차**:
  1. 목록 행 클릭 → 상세.
  2. 상단에서 누적 신고 / 경고 횟수 / 차단당한 횟수, 계정 정보(이메일·로그인 아이디·소속 업소·탈퇴 시각) 확인.
  3. "신고 내역 보기" 링크 → `/moderator/reports?user=<id>`로 필터 진입(§6.1).
  4. "제재 적용" 영역에서 경고 / 이용 정지 선택 → 사유 시트(기본 문구 프리필, 2자 이상) → 확정.
- **기대 결과**:
  - `setUserStatus({status: "warned" | "suspended", reason})` → `bambi_profile.status` 갱신 +
    감사 로그 `set_status:warned` / `set_status:suspended`.
  - **성공했을 때만** 목록으로 되돌아간다(실패하면 상세에 남아 토스트로 오류 확인).
- **엣지 케이스 / 실패 케이스**:
  - **온보딩 전 계정(프로필 없음)** → `BAD_REQUEST` "아직 온보딩을 마치지 않은 계정이라 제재할 수 없어요."
  - 사유 2자 미만이면 확정 비활성.
  - 정지된 계정은 이후 모든 `requireActiveBambiProfile` 경유 API가 FORBIDDEN이 된다.
- **관련 API**: `bambi.moderation.setUserStatus` (`moderation.ts` L1740)

### 4.3 제재 이력 확인

- **경로**: `/moderator/users/[id]` "제재 이력" 섹션 (`moderator.tsx` `UserModerationHistory` L2208~)
- **기대 결과**: 해당 사용자를 대상으로 한 감사 로그를 **최신순, 페이지당 10건**으로 표시한다(액션 라벨 / 사유 / 처리자 이름 / 시각).
  11건 이상이면 목록 아래에 `< 페이지 입력 / 총 페이지 수 >`가 나타나며 이전·다음 버튼과 숫자 직접 입력으로 모든 과거 이력을 조회할 수 있다.
  액션 코드는 라벨 맵으로만 노출되며, 매핑에 없는 코드는 "기타 조치"로 표시된다
  (`apps/web/src/lib/bambi/moderation-labels.ts` — 현재 `set_status:active|warned|suspended`,
  `set_role:legal_advisor`(법률자문 지정)·`set_role:job_seeker`(법률자문 해제)만 매핑).
- **관련 API**: `bambi.moderation.listUserModerationActions` (`adminProcedure`, `page`·`pageSize` 기반 서버 페이지네이션)

### 4.4 정상 복구(제재 해제)

- **경로**: `/moderator/users/[id]` "계정 상태 복구" 영역
- **선행 조건**: 대상 계정 상태가 `active`가 **아닐 때만** 이 영역이 보인다(경고·정지 모두).
- **절차**: **정상으로 복구** 클릭.
- **기대 결과**: `setUserStatus({status:"active", reason:"계정을 정상으로 복구했어요"})`.
  감사 로그 `set_status:active`. 누적 경고 횟수는 감사 로그 집계라 **줄어들지 않는다.**
- **엣지 케이스**: 이 버튼은 **사유 시트 없이 즉시 적용**된다(고정 문구).
- **관련 API**: `bambi.moderation.setUserStatus`

### 4.5 사용자 일괄 제재

- **경로**: `/moderator/users` 목록 체크 → 하단 액션 바(경고 / 정지)
- **절차**: 헤더 전체선택(현재 필터 결과 기준) 또는 개별 체크 → 액션 → 사유(2자 이상) → 적용.
- **기대 결과**: `bulkSetUserStatus`. 결과 토스트에 성공/실패 건수와 실패 ID 최대 3개.
- **엣지 케이스**: 프로필 없는 계정이 섞이면 **그 건만 실패**로 집계되고 나머지는 적용된다.
  0건 또는 51건 이상이면 `BAD_REQUEST`.
- **관련 API**: `bambi.moderation.bulkSetUserStatus` (`moderation.ts` L1772)

### 4.6 법률자문 지정·해제

- **경로**: `/moderator/users` 목록에서 대상 **1명** 체크 → 목록 위 역할 수정 줄
  (UI `users/page.tsx` `roleTarget`, 시트 `moderator.tsx` `ReasonConfirmSheet`·`legalAdvisorChoice`,
  컨텍스트 `moderator-context.tsx` `setLegalAdvisor`)
- **선행 조건**: 대상이 **밤비 프로필이 있는** `job_seeker` 또는 `legal_advisor` 계정.
- **절차**:
  1. 목록에서 역할 Select로 `구직자`/`법률자문`을 걸러 대상을 찾고 행 왼쪽 선택 칸 체크(정확히 1명).
  2. 목록 위에 뜬 역할 수정 줄의 버튼(구직자면 **법률자문 지정**, 법률자문이면 **법률자문 해제**) 클릭.
  3. 사유 시트(기본 문구 프리필, 2자 이상) → 확정.
- **기대 결과**:
  - `setUserRole({role, reason, targetUserId})` → `bambi_profile.role` 갱신 +
    감사 로그 `set_role:legal_advisor` / `set_role:job_seeker`(대상 유형 `user`).
  - 적용 후 목록 캐시가 무효화되어 목록(·상세)의 역할 표기가 바뀌고, 시트가 닫히며 선택이 해제된다.
    실패하면 시트에 남아 사유를 고쳐 재시도할 수 있다(서버 거절 사유 토스트).
  - 지정된 계정은 수다방에 성별·광고와 무관하게 입장하고, `legal` 게시판의 잠긴 글을 비번 없이 열람·답변한다
    (구직자 테스트 흐름 §11.9). 해제하면 곧바로 권한이 사라진다.
  - **그 외 권한은 구직자 그대로다.** 구인 기능(공고 `listMine`·조직·팀·광고·분석·업소 인증 제출)은
    `isEmployerLikeRole`(`employer`·`admin` 허용 목록)이 막아 `FORBIDDEN`이고, 홈도 `/seeker`다.
    채팅은 `job_seeker` 전용이라 지정 중에는 이용할 수 없다(해제하면 복구).
- **엣지 케이스 / 실패 케이스**:
  - `employer`·`admin`·탈퇴 계정을 선택하거나 **2명 이상** 선택 → 역할 수정 줄 미노출
    (일괄 제재 바만 뜬다). API 직접 호출 시 `BAD_REQUEST`
    "법률자문 지정·해제는 구직자 계정에만 할 수 있어요(업소·운영자 계정은 전환할 수 없습니다)."
  - 온보딩 전 계정 → `BAD_REQUEST` "아직 온보딩을 마치지 않은 계정이라 역할을 지정할 수 없어요."
  - 사유 2자 미만이면 확정 비활성.
- **관련 API**: `bambi.moderation.setUserRole` (`adminProcedure`)

### 4.7 탈퇴 계정 잔여 식별값 파기 (배치)

- **경로**: 서버 스케줄러가 **자동 실행(매일 1회, 운영자 설정 시각)** + `/moderator/site-settings` 실행 버튼(즉시 실행용, §13)
- **자동 실행**: `apps/server/src/plugins/withdrawal-purge.ts` — 10분 간격 틱(crawl 플러그인과 동일)마다
  `runScheduledWithdrawalPurge()`가 DB에서 실행 시각(`bambi_site_settings.withdrawal_purge_hour`,
  기본 `DEFAULT_WITHDRAWAL_PURGE_HOUR = 4`, **KST**)과 마지막 실행 시각(`withdrawal_purge_last_run_at`)을 읽어
  **"오늘 설정 시각이 지났는데 그 이후로 아직 안 돌았다"** 면 실행한다(순수 판정 `isWithdrawalPurgeDue`).
  판정 근거가 전부 DB라 재시작 후 캐치업·다중 인스턴스 중복 방지가 메모리 상태 없이 이뤄진다.
  실행 시점마다 `resolveWithdrawalRetentionDays()`로 보존기간을 다시 읽으므로 설정 변경은 다음 실행부터 반영된다.
  결과는 `withdrawal purge completed` 로그(파기 0건이면 로그 없음), 실패는 `withdrawal purge failed`.
  마지막 실행 시각은 대상 0건·실패와 무관하게 배치 진입 시 찍히므로(장애 중 매 틱 재시도 방지) 실패한 날은
  다음 날 예약 실행이 이어받는다.
- > ⚠ **되돌릴 수 없다.** 보존기간(운영자 설정, 기본 30일)이 지난 탈퇴 계정의 세션·자격증명(비밀번호)·
  > 연락처·CI/DI 해시를 지우고, 이메일을 `withdrawn-<id>@invalid.bambi`, `login_id`를 null,
  > 이름을 "탈퇴한 회원"으로 치환한다.
  > `user` 행 자체는 삭제하지 않는다(상대방 데이터가 RESTRICT FK로 물려 있음).
- > **탈퇴 시점에는 아무것도 파기되지 않는다.** 탈퇴(`onboarding.withdrawMyAccount`)는 `deletedAt`·표시명
  > 익명화·세션 삭제까지만 하는 소프트 삭제다. 이메일·아이디·연락처는 이 배치가 보존기간 경과 후 지운다.
- **기대 결과**: `{ purgedCount: N }` 반환. 대상 0건이면 즉시 `{ purgedCount: 0 }`.
- **관련 API**: `bambi.moderation.purgeWithdrawnAccounts`(`adminProcedure`) — 자동 실행과 동일한
  서비스 `purgeWithdrawnAccountsBatch`(`packages/api/src/services/bambi-withdrawal-purge.ts`)를 호출한다.

### 4.8 출석 관리 · 포인트 지급·차감 · 등급 기준 변경

- **경로**: `/moderator/attendance` (파일: `apps/web/src/app/moderator/attendance/page.tsx`)
- **목록**: `bambi.attendance.adminList`(`adminProcedure`) — `useInfiniteQuery`, `limit=20`, offset 커서(`nextCursor = cursor + limit`).
  검색(닉네임·아이디 `ilike`, **250ms 디바운스**)·역할(`전체`/`구직자`/`구인자`)·정렬이 **전부 서버 입력**이고,
  요약 카드(오늘 출석자 / 출석 대상 회원)도 **같은 where**를 쓴다 — 필터를 걸면 요약 숫자도 좁아진다(의도).
  대상은 `bambi_profile.role ∈ {job_seeker, employer}` + `user.deleted_at IS NULL`(프로필 없는 온보딩 전 계정 제외).
- **열 9개**: 회원(닉네임+아이디, 오늘 출석이면 `오늘 출석` 뱃지) · 역할 · 총 출석 · 이번 달 · 마지막 출석 · 미출석 · **포인트** · 관리([지급·차감]).
  정렬 가능한 헤더는 총 출석·이번 달·마지막 출석·미출석 4개뿐이고 **방향은 축마다 고정**(`aria-sort="descending"`),
  **포인트 열은 정렬 불가**(서버 `sort` enum이 `recent|idle|total|month` 4개 고정 — 확장하지 않았다).
- **포인트 잔액**: `items[].pointBalance` = 그 유저 `bambi_point_transaction.amount` **합계**(상관 서브쿼리, coalesce 0).
  잔액 컬럼이 따로 없으므로 출석 적립(`reason='attendance'`, 1회 10P)과 운영자 조정이 모두 섞인 값이다. 표기는 `1,200P`(ko-KR 천단위).
- **지급·차감 절차**: 행 [지급·차감] → Dialog(`PointAdjustForm`) → ToggleGroup `지급|차감` + 포인트(양수) + 사유 → **[적용]**.
  - 입력은 **항상 양수**로 받고 부호는 토글이 정한다(차감에 음수를 넣어 되레 지급되는 부호 뒤집힘 방지) — 회귀 포인트.
  - 사유 칸 아래에 **조정 후 예상 잔액**이 실시간으로 보인다. 유효하지 않으면 "1 이상 100,000 이하의 정수를 입력해 주세요."
  - 성공: 토스트 "포인트를 조정했어요. 현재 잔액 1,270P"(서버가 돌려준 조정 후 잔액) + `adminList` 쿼리 무효화로 표의 포인트 열 갱신, 다이얼로그 닫힘.
- **`bambi.attendance.adminAdjustPoints`(`adminProcedure`) 계약**:
  - 입력 `{ userId: string(≥1), amount: int, reason: string }`. `amount`는 **−100,000 ~ 100,000, 0 금지**, `reason`은 trim 후 **1~200자**.
  - 출력 `{ userId, pointBalance }` — **조정 후 새 잔액**.
  - 원장 기록은 `amount` 그대로(±) + `reason`에 **`운영자 지급: {사유}` / `운영자 차감: {사유}`** 프리픽스. 출석 적립(`reason='attendance'`)과 문자열로 구분된다.
  - 합산→검증→insert가 **한 트랜잭션** 안에서 돈다.
- **실패 케이스**:
  | 상황 | 기대 |
  |---|---|
  | 차감 후 잔액이 음수 | `BAD_REQUEST` "잔액보다 많이 차감할 수 없습니다." — 원장 행이 **남지 않아야** 한다 |
  | 대상 계정 없음 / 탈퇴(`deleted_at`) | `NOT_FOUND` "대상 회원을 찾을 수 없습니다." |
  | 대상이 운영자·법률자문 | `BAD_REQUEST` "구직자·업소 회원에게만 포인트를 조정할 수 있습니다." |
  | `amount = 0` | `BAD_REQUEST` "0 포인트는 조정할 수 없습니다." |
  | `amount` 절댓값 > 100,000 / 사유 공백 또는 200자 초과 | zod 400 |
- **권장 QA 시나리오**: 잔액 0인 구직자에게 **+100 지급** → 잔액 100P → **−30 차감** → 잔액 70P →
  **−200 차감 시도** → 400 "잔액보다 많이 차감할 수 없습니다."(잔액 70P 유지, 원장 행은 2건 그대로) →
  운영자 계정 대상 호출 → 400. 마지막으로 그 회원의 출석체크 화면에서 잔액이 **70P로 같게** 보이는지 확인
  (구직자·업주 출석 패널은 `attendance.getMine.pointBalance`로 같은 원장을 합산한다).
- **엣지 케이스**:
  - 확인 모달이 **없다** — [적용]이 곧 실행이고 되돌리기 버튼도 없다. 되돌리려면 반대 방향으로 재조정해야 하며 그 행도 원장에 남는다.
  - 잔액 집계 select에 `FOR UPDATE`를 걸 수 없어 **두 운영자가 동시에 차감하면 둘 다 통과해 음수가 될 수 있다**(코드에 `ponytail:` 주석으로 명시된 알려진 한계, 승급 경로는 advisory lock). 동시 조작 QA는 범위 밖.
  - 페이지 사이에 출석이 끼어들어 오프셋이 밀릴 수 있어 화면이 `userId`로 중복을 걸러낸다.
- **등급 변경**: 행 점 3개 → `등급 변경` → 등급+사유 → `adminSetGradeAnchor`. 포인트 원장은 추가·수정하지 않고 프로필에 변경 당시 등급기준 누적·선택 등급 minPoints 스냅샷을 저장한다. 이후 유효 등급 포인트는 `선택 minPoints + (현재 누적 - 변경 당시 누적)`이며 다음 기준 도달 시 자동 승급한다.
- **관련 API**: `bambi.attendance.adminList` / `bambi.attendance.adminAdjustPoints` / `bambi.attendance.adminSetGradeAnchor` (`adminProcedure`) — `packages/api/src/routers/bambi/attendance.ts`
- > ⚠ **회원용 출석 기록 자체는 운영자가 손댈 수 없다.** 출석일 추가·삭제 프로시저가 없고, 이 화면이 바꿀 수 있는 것은 포인트 잔액뿐이다.

---

## 5. 구인자(업소)·사업자 검증

상태 전이(`employerVerificationStatus`): `none → pending → verified | rejected`.
**`verified`/`rejected`에서 `none`/`pending`으로 되돌리는 운영자 경로는 없다**
(입력 스키마가 `verified|rejected`만 허용). 재제출로만 `pending`으로 돌아간다.

### 5.1 업소 승인 목록 조회

- **경로**: `/moderator/employers` (파일: `apps/web/src/app/moderator/employers/page.tsx`)
- **절차**: 상태 탭 5종 — 전체 / **대기(기본값)** / 승인 / 반려 / 미제출.
- **기대 결과**: 카드에 업소명 + 상태 배지, `ownerEmail · 사업자 <번호>`,
  `대표자 · 개업일자`, **국세청 진위확인 결과 줄**, (있으면) "반려 사유: …".
  - `biznumCheckedAt`이 있으면 배지 "국세청 확인 완료" + 상태 라벨
    (`01`→계속사업자 / `02`→휴업자 / `03`→폐업자 / 그 외·null→상태 미상) + 확인 일시.
  - 없으면 "국세청 미확인" + "사업자등록증을 수동으로 확인해 주세요." 안내.
- **엣지 케이스**:
  - `limit: 50` 고정, 페이지네이션 없음 → 51건째부터 접근 불가.
  - `innerJoin member(role='owner')` → **owner 멤버가 없는 조직은 목록에서 통째로 누락**된다.
  - `businessRegistrationNumber`가 null인 구버전 조직은 사업자번호 줄이 통째로 빠진다.
- **관련 API**: `bambi.moderation.listEmployers` (`moderation.ts` L1842)

### 5.2 사전 조건 만들기 — 구인자 사업자 정보 제출

- **경로(구인자 측)**: `bambi.onboarding.submitEmployerBusinessInfo`
  (`packages/api/src/routers/bambi/onboarding.ts` L1020), 진위확인 `checkBiznum` (L163),
  서비스 `packages/api/src/services/nts-biznum.ts`
- **절차**: 구인자 계정으로 업소명 / 사업자등록번호(`000-00-00000`) / 대표자명 / 개업일자(YYYY-MM-DD) 제출.
- **기대 결과**: `verificationStatus = "pending"`으로 저장되고 운영자 대기 탭에 뜬다.
- **엣지 케이스 / 실패 케이스**:
  - 사용자당 **시간당 10회** 레이트리밋 → 초과 시 `TOO_MANY_REQUESTS`.
  - `NTS_SERVICE_KEY` 미설정 / 국세청 호출 예외·타임아웃 → **미확인(두 컬럼 모두 null)으로 통과**.
    → 운영자 화면은 "국세청 미확인"으로 표시되고 **사업자등록증 수동 대조가 필수**가 된다.
  - 국세청 응답 `matched=false` → `BAD_REQUEST`(불일치 안내), `statusCode !== "01"` → `BAD_REQUEST`
    "국세청에 휴업/폐업 상태로 등록된 사업자등록번호입니다."
    → 결과적으로 **DB에 저장되는 `biznumStatusCode`는 사실상 `01`뿐**이고,
    운영자 화면의 실질 분기는 "확인 완료 vs 미확인(null)"이다.
  - **재제출**: owner 조직이 이미 있으면 갱신 + `pending`으로 강등. 단 `verified` 상태에서
    4개 필드가 **완전히 동일**하면 강등하지 않고 verified 유지(국세청 재호출도 없음).
- **관련 API**: `bambi.onboarding.submitEmployerBusinessInfo`, `bambi.onboarding.checkBiznum`

### 5.3 업소 승인

- **경로**: `/moderator/employers` 카드의 **승인** 버튼
- **절차**: 대기 탭에서 대상 카드 확인 → **승인** 클릭.
- **기대 결과**:
  - `verificationStatus = "verified"`, **`verificationNote = null`**(이전 반려 사유 삭제), `updatedAt` 갱신.
  - 감사 로그: `targetType: "user"`, `targetId: 조직 owner userId`(없으면 organizationId 폴백),
    `action: set_employer_verification:verified`, `metadata: { organizationId }`.
  - 토스트 "처리했어요." + 목록 갱신(대기 탭이면 카드가 사라짐).
- **승인 후 구인자에게 열리는 것** (`isEmployerOrganizationVerified` 게이트):
  | 기능 | 파일 | 미승인 시 메시지 |
  | --- | --- | --- |
  | 공고 등록 | `packages/api/src/routers/bambi/jobs.ts` L1621 | "운영자 승인 후 공고를 등록할 수 있습니다." |
  | 조직 설정 변경 | `organizations.ts` L180 / `onboarding.ts` L899 | "운영자 승인 후 조직 설정을 변경할 수 있습니다." |
  | 팀 관리(생성·수정·삭제·멤버) | `teams.ts` L104 `assertOrganizationVerified` | "운영자 승인 후 팀을 관리할 수 있습니다." |
  | 팀 설정 변경 | `onboarding.ts` L935 | "운영자 승인 후 팀 설정을 변경할 수 있습니다." |
- **엣지 케이스 / 실패 케이스**:
  - > ⚠ **승인은 확인 모달 없이 1클릭이다.** 오조작 시 `pending`으로 되돌릴 경로가 UI·API 모두 없고,
    > 되돌리려면 "반려"로 처리해야 해서 `verificationNote`에 사유가 남는다.
  - 승인 사유는 코드에 하드코딩된 `"서류 확인 완료"` 고정 → 감사 로그에 실제 판단 근거가 남지 않는다.
  - 존재하지 않는 organizationId → `NOT_FOUND`.
- **관련 API**: `bambi.moderation.setEmployerVerificationStatus` (`moderation.ts` L2180)

### 5.4 업소 반려

- **절차**: 카드의 "반려 사유(반려 시 필수)" Input에 **2자 이상** 입력 → **반려** 클릭.
- **기대 결과**: `verificationStatus = "rejected"`,
  **`employer_organization_profile.verification_note`에 입력 사유 저장** → 카드에 "반려 사유: …"로 표시.
  감사 로그 `set_employer_verification:rejected`.
- **엣지 케이스**: 사유 2자 미만이면 버튼 비활성. 사유 Input state는 처리 후에도 지워지지 않는다.
- **관련 API**: `bambi.moderation.setEmployerVerificationStatus`

### 5.5 (참고) 대기 목록 전용 프로시저

- `bambi.moderation.listPendingEmployers` (`moderation.ts` L1809)는 `pending`만 반환하는 별도 프로시저다.
  현재 업소 승인 화면은 `listEmployers`(상태 필터 포함)를 쓴다.

---

## 6. 신고 처리

신고 상태(`reportStatus`): `open` / `reviewing` / `resolved` / `dismissed`.
신고 사유(`reportReasonSchema`): `illegal_or_prohibited_content`, `coercion_or_safety`,
`underage_concern`, `scam_or_fraud`, `harassment`, `misleading_job_information`, `other`.
신고 대상(`targetTypeSchema`): `job_post`, `chat_room`, `chat_message`, `review`, `user`,
`community_post`, `community_comment`.

### 6.1 신고 목록 조회 · 사용자별 필터

- **경로**: `/moderator/reports` (파일: `apps/web/src/app/moderator/reports/page.tsx`,
  목록 UI `moderator.tsx` `ReportList` L1085~)
- **선행 조건**: 신고 데이터가 있어야 한다. 사용자 측 `bambi.moderation.createReport`
  (`protectedProcedure`)로 만든다.
- **절차**:
  1. `/moderator/reports` 진입 — 데스크톱은 DataTable(심각도/사유/피신고 대상/신고자/신고 내용/접수/상태),
     모바일은 카드 목록. **미처리(open) 먼저, 처리 완료 뒤** 순서로 정렬된다.
  2. 컬럼 헤더로 정렬, 체크박스로 선택.
  3. `/moderator/users/[id]` → "신고 내역 보기" → `/moderator/reports?user=<id>` 진입 시
     **"특정 사용자 대상 신고만 보는 중"** 배지 + "필터 해제" 버튼이 뜬다.
- **기대 결과**:
  - 심각도(`SevPill`)는 사유+상태로 파생 —
    처리 완료(`resolved`/`dismissed`)면 `low`,
    미처리인데 사유가 `illegal_or_prohibited_content` / `coercion_or_safety` / `underage_concern`이면 `high`,
    그 외 미처리는 `mid` (`moderator-context.tsx` `getReportSeverity`).
  - 화면 상태는 2단계로 접힌다 — `open|reviewing` → "대기", `resolved|dismissed` → "완료".
    **`reviewing` 상태를 UI에서 만들거나 구분할 방법은 없다**(서버 스키마에는 존재).
  - `?user=<id>` 필터는 **클라이언트 필터**로 `targetType === "user" && targetId === id`만 남긴다.
- **엣지 케이스**: `limit: 50` 고정. 신고 사유 중복 접수는 서버가 멱등 처리(같은 신고자·대상이면 기존 행 반환).
- **관련 API**: `bambi.moderation.listReports` (`moderation.ts` L942),
  `bambi.moderation.createReport` (L886, 사용자용)

### 6.2 신고 상세 — 기각 / 조치 완료

- **경로**: `/moderator/reports/[id]` (파일: `apps/web/src/app/moderator/reports/[id]/page.tsx`,
  UI `moderator.tsx` `ReportDetail` L1759~)
- **절차**:
  1. 목록에서 행 클릭 → 상세.
  2. 좌측(데스크톱)에 대상 맥락 카드, 우측에 사유·신고자/피신고자·조치 버튼.
  3. **기각** 또는 **조치 완료** 클릭.
- **기대 결과**:
  - 기각 → `setReportStatus({status:"dismissed", reason:"운영자가 신고를 기각했습니다."})`
  - 조치 완료 → `setReportStatus({status:"resolved", reason:"운영자가 신고 조치를 완료했습니다."})`
  - 감사 로그는 **신고 대상 기준**으로 남는다(`targetType`/`targetId`는 신고 대상, `action`은
    `set_report_status:<status>`, `metadata: { reportId }`).
  - 목록으로 복귀. 이미 처리된 신고는 조치 버튼 대신 "처리 완료" 안내가 뜬다.
- **엣지 케이스 / 실패 케이스**:
  - 사유가 **고정 문자열**이라 운영자가 입력할 수 없다(일괄 처리는 입력 가능 — §6.6).
  - 대상이 사용자 계정이 아니면 "이 신고는 사용자 계정이 대상이 아니에요…" 안내가 뜬다.
  - 목록에 없는 신고 id → "신고 내역을 찾을 수 없어요."
  - 채팅방·메시지 신고는 `open`·`reviewing`·`resolved` 동안 양쪽 참여자의 목록·열람·전송·읽음·실시간 동작과 안 읽음 집계에서 제외된다. **기각(`dismissed`)** 시에만 양쪽에 즉시 복구되며 `chat:list:updated`로 화면과 전역 핀이 함께 갱신되어야 한다.
- **관련 API**: `bambi.moderation.setReportStatus` (`moderation.ts` L1343)

### 6.3 신고 상세 — 사용자 제재(대상이 계정일 때)

- **선행 조건**: `targetType === "user"`이고 `targetId`가 있어야 **제재 적용** 버튼이 뜬다.
- **절차**: **제재 적용** → 1단계 시트에서 경고 / 이용 정지 선택 → 2단계 사유 시트(기본 문구 프리필, 2자 이상)
  → 확정.
- **기대 결과**: `setUserStatus` 적용 **후 이어서** `setReportStatus({status:"resolved"})`가 자동 호출된다
  (`onPick` → `onSanction` + `onResolve(item.id, "act")`).
- **엣지 케이스**: 대상이 온보딩 전 계정이면 제재가 `BAD_REQUEST`로 실패하지만
  **신고는 그대로 resolved로 마감된다**(두 호출이 독립).
- **관련 API**: `bambi.moderation.setUserStatus`, `bambi.moderation.setReportStatus`

### 6.4 신고 상세 — 대화방 차단 / 차단 해제

- **선행 조건**: `targetType === "chat_room"`이고 대상 맥락이 내려와야 한다
  (UI `moderator.tsx` `ChatRoomContext` L1286~).
- **절차**: "신고된 대화방" 카드에서 최근 메시지 확인 → 차단(또는 해제) 사유를 **2자 이상** 입력 →
  **방 차단** / **차단 해제** 클릭.
- **기대 결과**: `setChatRoomBlocked({chatRoomId, isBlocked, reason})` → `chat_room.isBlocked` 갱신 +
  감사 로그 `set_blocked:true|false`. 토스트 "대화방을 차단했어요" / "대화방 차단을 해제했어요".
- **엣지 케이스**: UUID가 아닌(목업) id면 "실데이터 대화방에만 차단을 적용할 수 있어요."로 중단.
  **차단 토글은 `/moderator/chats`에는 없고 신고 상세에서만 가능하다.**
- **관련 API**: `bambi.moderation.setChatRoomBlocked` (`moderation.ts` L1950)

### 6.5 신고 상세 — 커뮤니티 글/댓글 조치

- **선행 조건**: `targetType === "community_post"` 또는 `"community_comment"`
  (UI `moderator.tsx` `CommunityTargetPanel` L1511~).
- **절차**:
  1. 신고된 글/댓글 카드(게시판 배지, 상태 배지, 본문 미리보기, 작성자) 확인.
  2. "조치 사유"에 **2자 이상** 입력(입력 전엔 액션 버튼 전부 비활성).
  3. 현재 상태별 액션 —
     `published`: 숨기기 / 삭제 · `hidden`: 복구 / 삭제 · `deleted`: 복구.
  4. **삭제**를 고르면 별도 확인 시트("…을 삭제할까요?")가 한 번 더 뜬다.
- **기대 결과**: `community.setPostStatusByAdmin` 또는 `setCommentStatusByAdmin` 호출
  (입력에 `reportId`도 함께 전달). 토스트 "글을 숨겼어요." / "댓글을 삭제했어요." / "복구했어요."
  성공 시 신고 목록이 무효화되어 상태 배지가 갱신된다.
  **콘텐츠 조치와 신고 상태 변경은 별개**다 — 조치했다고 신고가 자동으로 resolved가 되지 않는다.
- **엣지 케이스**: 대상 컨텍스트가 유실되면 "대상 콘텐츠를 찾을 수 없어요."만 뜨고 조치 불가.
- **관련 API**: `bambi.community.setPostStatusByAdmin` (`community.ts` L1076),
  `bambi.community.setCommentStatusByAdmin` (L1112) — 둘 다 `protectedProcedure` + `requireAdminProfile`

### 6.6 신고 일괄 처리

- **경로**: `/moderator/reports` 목록 선택 → 하단 액션 바(기각 / 해결)
- **절차**: 체크박스 선택 → 액션 → 사유 시트(기본 문구, 2자 이상) → 적용.
- **기대 결과**: `bulkSetReportStatus`. 결과 토스트에 성공/실패 건수와 실패 ID 최대 3개.
- **엣지 케이스**: 0건 / 51건 이상이면 `BAD_REQUEST`.
- **관련 API**: `bambi.moderation.bulkSetReportStatus` (`moderation.ts` L1372)

---

## 7. 후기 관리

상태 전이(`reviewStatus`): `published` / `pending_review` / `hidden` (DB default `published`).
`pending_review`는 후기 작성 시 `validateReviewInput`이 위험 신호(전화번호·외부 메신저·협박·개인정보)를
감지했을 때 붙는다(`packages/api/src/services/bambi-review-policy.ts`).

### 7.1 후기 목록·필터

- **경로**: `/moderator/reviews` (파일: `apps/web/src/app/moderator/reviews/page.tsx`)
- **절차**: 상태 탭 4종 — 전체 / 게시됨 / 검수 대기 / 숨김.
- **기대 결과**: 카드에 별점, 상태 배지, 작성일시, 공고 제목, `업소명 · 작성자(익명이면 "익명")`, 본문 전문.
- **엣지 케이스**:
  - `limit: 50` 고정, **페이지네이션 없음** → 51건째부터 조회 불가.
  - `innerJoin jobPost` + `innerJoin employerOrganizationProfile` → 공고나 업소 프로필이 없으면
    **후기가 목록에서 통째로 누락**된다.
  - 서버가 `riskFlags`를 내려주지만 화면이 렌더하지 않아 **검수 대기 사유를 화면에서 알 수 없다**.
- **관련 API**: `bambi.moderation.listReviews` (`moderation.ts` L1243)

### 7.2 후기 게시 / 게시 복원 / 숨김

- **절차**:
  1. 카드 하단 버튼 — `published`가 아니면 "게시"(pending_review) 또는 "게시 복원"(hidden),
     `hidden`이 아니면 "숨김"(destructive).
  2. 클릭하면 같은 카드 안에 사유 입력 패널이 펼쳐진다 → **2자 이상** 입력 → "…확정".
- **기대 결과**: `setReviewStatus` → `review.status` 갱신 + 감사 로그(`targetType: "review"`,
  `action: set_status:<status>`). 토스트 "후기 상태를 변경했어요."
  공개 노출은 `reviews.listByJobPost`가 `published`만 반환하므로 즉시 반영된다.
- **엣지 케이스 / 실패 케이스**:
  - **UI에서 `pending_review`로 되돌리는 경로가 없다.** 한 번 published/hidden으로 보내면 복귀 불가
    (서버 스키마는 허용).
  - 사유 패널은 한 번에 하나만 열린다 — 다른 카드 버튼을 누르면 이전 입력이 버려진다.
  - 존재하지 않는 reviewId → `NOT_FOUND`(메시지 없음) → 빈 토스트가 뜰 수 있다.
- **관련 API**: `bambi.moderation.setReviewStatus` (`moderation.ts` L1280)

### 7.3 후기 일괄 처리 — **UI 미구현**

- `bambi.moderation.bulkSetReviewStatus`(`moderation.ts` L1308)는 서버에 있으나
  **후기 화면이 호출하지 않는다.** 일괄 처리 QA는 API 직접 호출로만 가능하다.

---

## 8. 커뮤니티 콘텐츠 관리 · 금칙어

### 8.1 게시물 조치 목록(글/댓글/문의 통합)

- **경로**: `/moderator/content` (파일: `apps/web/src/app/moderator/content/page.tsx`)
- **절차**:
  1. 탭 3종 — 커뮤니티 글(`community_post`) / 커뮤니티 댓글(`community_comment`) /
     고객센터 문의(`support_inquiry`). 탭 전환 시 page=1 리셋 + 펼친 행 접힘.
  2. 이전/다음 페이지네이션(서버 고정 20건, `MODERATABLE_PAGE_SIZE`).
  3. 행 좌측 chevron으로 펼쳐 전체 본문 확인(펼친 행만 상세 조회).
  4. **커뮤니티 글 탭 한정** — 탭 아래 **게시판** Select(기본 `전체`)로 목록을 좁힌다.
     선택 시 page=1 리셋 + 펼친 행 접힘 + 선택 해제. 탭을 바꾸면 필터도 `전체`로 돌아간다.
- **기대 결과**: 제목·발췌(목록 셀은 15자 절단, 서버 발췌 120자)·작성자·상태·작성일.
  커뮤니티 본문은 Tiptap JSON을 서버에서 평문화해 내려준다.
  - **선택 열**은 세 탭 모두에 붙고(일괄 조치 대상), **게시판 열**만 커뮤니티 글 탭 전용이다
    (펼친 행 colSpan은 기본 `7`, 글 탭에서 `8`).
    표시는 `communityBoards.list`(화면에 쿼리 하나, 목록 열·필터·펼친 행이 공유) 라벨 →
    빌트인 `COMMUNITY_BOARD_LABELS` → 저장 원값 순 폴백이고, 값이 없으면 `—`.
    운영자가 게시판 라벨을 바꾸면 열·필터·상세 배지가 함께 따라간다.
  - 서버 응답은 유형과 무관하게 `board` 키를 갖는다(글은 `community_post.board` 원값,
    댓글·문의는 `null`) — 화면이 유형별 좁히기 없이 한 형태만 렌더한다.
  - 게시판 필터는 커뮤니티 글 탭에서만 전송된다(`board` 입력, 다른 탭은 `undefined`).
    없는 key를 API로 직접 보내면 오류가 아니라 **빈 목록**이다(존재 검사 없음, 의도).
- **엣지 케이스**:
  - **상태 필터 UI가 없다.** 서버 `listModeratableContent`는 `status` 입력을 받지만 화면이 보내지 않아
    항상 전체 조회다 → `hidden`/`deleted`만 골라 보는 방법이 화면에 없다.
    (게시판 필터는 화면에 있으므로 "특정 게시판 글 전수 점검"은 가능하다.)
  - 작성자 표기 주의: 커뮤니티 글은 **글별 익명 표시명**, **댓글은 원글 작성자 표시명**(댓글 작성자가 아님),
    문의는 `user.name`(없으면 "(표시명 없음)").
  - `support_inquiry_message`(문의 스레드 메시지)는 이 목록에 없다.
- **관련 API**: `bambi.moderation.listModeratableContent` (`moderation.ts` L2298, `adminProcedure`),
  `bambi.moderation.getModeratableContentDetail` (L2436, `adminProcedure`)

### 8.2 숨김 / 복구 / 삭제 조치

- **절차**: 행 우측 `…` → 숨김 / 복구 / 삭제(현재 상태와 같은 항목은 메뉴에서 제외) →
  사유 Dialog에 **2자 이상** 입력 → "확인".
- **기대 결과** (`communityContentStatus`: published / hidden / deleted — **셋 다 소프트 상태**):
  - 커뮤니티 글: `communityPost.status` + `updatedAt` 갱신.
  - 커뮤니티 댓글: `communityComment.status` 갱신, **`communityPost.commentCount`는 노출성이
    바뀔 때만 ±1**(published ↔ 비published). hidden→deleted 같은 전이는 카운트 불변.
  - 고객센터 문의: `supportInquiry.status` 갱신 — **`inquiryStatus`(open/answered/closed)와는 별개 축**.
  - 감사 로그: `set_community_post_status:<status>` / `set_community_comment_status:<status>` /
    `set_status:<status>`.
  - 사용자 화면에서는 `published`만 노출되므로 숨김/삭제 즉시 비노출, 복구하면 다시 보인다.
- **엣지 케이스 / 실패 케이스**:
  - **사유 최소 길이 불일치** — 커뮤니티 글·댓글은 **서버가 1자부터 통과**하지만 UI는 2자를 강제.
    문의만 서버도 2자. API 직접 호출 시 기대값이 다르다.
  - 없는 id → `NOT_FOUND`("글을 찾을 수 없습니다." 등)가 토스트로 그대로 노출.
  - `deleted` 처리된 문의는 **운영자도 `/moderator/support`에서 상세 조회 불가**(NOT_FOUND).
    복구하려면 이 화면에서 찾아야 하는데 상태 필터가 없어 페이지를 넘겨 가며 찾아야 한다.
- **관련 API**: `bambi.community.setPostStatusByAdmin`, `bambi.community.setCommentStatusByAdmin`,
  `bambi.moderation.setInquiryStatusByAdmin` (`moderation.ts` L2226, `adminProcedure`)

### 8.2-1 커뮤니티 글 영구 삭제(하드 삭제)

- **사전 조건**: 대상 글이 **이미 `deleted`(삭제 조치) 상태**여야 한다. 화면도 그때만 메뉴를 붙이고,
  서버도 같은 조건으로 거절한다(2단계 실수 방지).
- **절차**: 커뮤니티 글 탭 → (선택) 게시판 필터로 좁힘 → 상태가 **삭제됨**인 행의 `…` →
  **영구 삭제하기**(destructive, 소프트 삭제 항목 아래) → AlertDialog("「제목」 글을 영구 삭제할까요?" /
  "되돌릴 수 없습니다…") → **영구 삭제하기**. **사유 입력은 없다**(선행 삭제 조치의 사유가 기록이다).
- **기대 결과**:
  - `community_post` 행이 **물리 삭제**되고 토스트 "영구 삭제했어요.", 목록 무효화로 행이 사라진다.
  - FK cascade로 `community_comment`·`community_post_like`가 함께 사라진다(선삭제 코드 없음 — DB가 한다).
  - 감사 로그 `admin_moderation_action`: `action = "hard_delete"`, `targetType = "community_post"`,
    `reason = "영구 삭제"`, `metadata = { title, board, authorName, createdAt }`
    — `targetId`는 FK가 아니라 남지만 가리킬 행이 없으므로 **스냅샷이 유일한 맥락**이다.
  - 작성자 알림은 보내지 않는다(선행 삭제 조치에서 이미 통지됐다).
- **엣지 케이스 / 실패 케이스**:
  - `published`/`hidden` 상태 글 → 409 "삭제 처리한 글만 영구 삭제할 수 있습니다. 먼저 삭제 조치를 해 주세요."
    (화면에서는 메뉴가 안 보이므로 API 직접 호출·낡은 캐시로만 재현된다.)
  - 없는 id → `NOT_FOUND` "글을 찾을 수 없습니다."
  - 그 글을 가리키던 **신고**(`report.targetId`)·**알림**(`bambi_notification.targetId`)은 FK가 아니라 남는다.
    신고 목록은 `targetContext: null`로 그려지고(기존 동작), 알림 딥링크는 없는 글로 향한다 — 의도된 잔존이다.
  - 본문 이미지(Tiptap 안 URL)는 스토리지 회수 대상이 아니다(글 첨부 테이블이 없어 키 원장이 없다).
  - 댓글·문의에는 영구 삭제가 없다(글을 지우면 댓글은 cascade로 함께 사라진다).
- **QA 시나리오(게시판 비우기 → 게시판 삭제)**:
  1. 새 게시판 생성(8.8) → 글 여러 건 작성 → 게시판 삭제 시도 → 409 "글이 있는 게시판은 삭제할 수 없습니다…".
  2. 게시물 조치에서 게시판 필터로 그 게시판 선택 → 머리글 전체선택 → **선택 삭제 (N)**(사유 2자 이상).
  3. 게시판 삭제 재시도 → **여전히 409**(소프트 삭제라 행이 남아 있다 — D5 소견의 재현 지점).
  4. 다시 머리글 전체선택 → **선택 영구 삭제 (N)** → 확인 → 페이지가 통째로 비워진다
     (한 건만이면 그 행의 `…` → **영구 삭제하기**도 동일 결과).
  5. 게시판 삭제 재시도 → **성공**("게시판을 삭제했어요.").
     20건 초과면 2~4를 페이지마다 반복한다(선택은 현재 페이지 한정).
- **관련 API**: `bambi.moderation.hardDeleteCommunityPost` (`moderation.ts`, `adminProcedure`,
  입력 `{ postId: uuid }`, 반환 `{ ok: true }`)

### 8.2-2 선택(체크박스) 일괄 조치 — 세 탭 공통

- **절차**: 행 체크(또는 머리글 전체선택 — **상태를 가리지 않고 현재 페이지 전 행**이 대상) →
  표 위 "N개 선택됨" 막대 → **선택 삭제 (N)** 또는 **선택 영구 삭제 (N)**.
  선택 삭제는 사유 Dialog(2자 이상) → "확인", 선택 영구 삭제는 사유 없이 AlertDialog
  ("선택한 N건을 영구 삭제할까요?" / "되돌릴 수 없습니다…") → "영구 삭제하기".
- **기대 결과**:
  - 서버에 묶음 프로시저가 **없다.** 화면이 단건 프로시저(8.2·8.2-1과 동일한 것)를
    `Promise.allSettled`로 모아 보내고, 토스트·목록 무효화는 **한 번만** 낸다.
  - 버튼 라벨의 괄호 숫자 = **실제 대상 건수**. 선택 삭제는 고른 것 중 `status !== "deleted"`,
    선택 영구 삭제는 `status === "deleted"`만 센다. 대상 0건이면 그 버튼은 `disabled`.
  - **선택 영구 삭제는 커뮤니티 글 탭에만** 나온다(댓글·문의에는 하드 삭제 경로가 없다).
  - 전건 성공 시 "N건 조치했어요." / "N건 영구 삭제했어요."(1건이면 "조치했어요." /
    "영구 삭제했어요."), 부분 실패 시 "X건 처리, Y건 실패했어요.",
    **단건 실패면 서버 문구를 그대로** 노출한다(409·404 원문).
  - 처리 후 선택은 해제되고 Dialog가 닫힌다.
- **엣지 케이스**:
  - 탭·페이지·게시판 필터를 바꾸면 선택이 초기화된다(선택은 항상 현재 페이지 한정).
  - **삭제됨 행도 체크된다**(예전에는 `disabled`였다) — 그래야 선택 영구 삭제 대상이 된다.
    대신 선택 삭제는 그 행을 세지 않아 서버 중복 삭제 거절이 화면에서 발생하지 않는다.
  - 게시중·숨김만 골라 선택 영구 삭제를 누를 수는 없다(대상 0건 → `disabled`).
- **관련 API**: 8.2·8.2-1의 단건 프로시저 반복 호출(신설 프로시저 없음).

### 8.3 공지사항 작성(운영자 전용 게시판)

- **경로**: 커뮤니티(수다방) 글쓰기 화면 — 운영자 콘솔 안이 아니다.
- **기대 결과**: `board === "notice"`는 **`role === "admin"`만** 작성 가능
  (`community.ts` L717, 아니면 `FORBIDDEN` "공지사항은 운영자만 작성할 수 있습니다.").
  운영자는 성별·광고 자격과 무관하게 수다방 입장이 허용된다
  (`packages/api/src/services/bambi-community-access.ts` — `role === "admin"`이면 통과).
- **엣지 케이스**: `isPromotion`(광고글 표시)은 employer 전용이라 운영자는 `BAD_REQUEST`.
- **관련 API**: `bambi.community.createPost` (`community.ts` L709)

### 8.4 금칙어 등록(단건)

- **경로**: `/moderator/banned-words` (파일: `apps/web/src/app/moderator/banned-words/page.tsx`)
- **절차**: "추가할 금칙어" Input(maxLength 100)에 입력 → **추가**.
- **기대 결과**: 토스트 "금칙어를 등록했어요." 표에 원문(`term`)과 **정규화형**(`normalizedTerm`) 두 컬럼 표시.
  `isActive`는 DB default `true`.
  - 정규화 규칙(매칭의 단일 진실원, `packages/api/src/services/bambi-banned-words.ts`):
    `text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "")` — 소문자화 + 공백·구두점·기호 제거.
    매칭은 정규화 후 **부분문자열 포함(includes)**이며 정규식이 아니다.
- **엣지 케이스 / 실패 케이스**:
  - 공백·특수문자만(`"!!!"`) → 400 "금칙어는 공백·특수문자만으로 등록할 수 없습니다."
  - **정규화형 중복** → 409 "이미 등록된 금칙어입니다."
    (`"성매매"` 등록 후 `"성 매매"`·`"성-매매"`·`"Cash"` vs `"cash"` 모두 중복)
  - 101자 → 400(Input maxLength 때문에 UI로는 재현 불가, API 직접 호출 필요)
  - **의도된 오탐**: 공백을 지우므로 인접 단어가 붙어 금칙어를 이룰 수 있다(`"미성" + "년"` → `미성년`).
- **관련 API**: `bambi.bannedWords.create` (`banned-words.ts` L66, `adminProcedure` + 핸들러 `requireAdminProfile`)

### 8.5 금칙어 CSV 일괄 추가

- **절차**: **CSV로 추가** → `.csv` 파일 선택.
- **기대 결과**: 클라이언트가 개행/쉼표로 분리 → trim → 빈 항목 제거 → 원문 기준 중복 제거 후 전송.
  서버가 정규화 길이 0(`empty`) / 중복(`duplicate`)을 건너뛰고 나머지만 bulk insert.
  토스트 `추가 {added}건 · 제외 {skipped}건`.
- **엣지 케이스**:
  - 파싱 결과 0건이면 요청 없이 "CSV에서 추가할 단어를 찾지 못했어요."
  - **501개 이상이면 서버 400**(클라이언트 분할 없음). 101자 항목이 하나만 있어도 **배열 전체가 400**(부분 성공 아님).
  - **헤더 행 처리가 없다** — CSV 첫 줄(`term` 등)도 금칙어로 등록된다.
  - `skipped` 사유(어떤 단어가 왜 제외됐는지)는 서버가 반환하지만 **화면은 건수만 표시**한다.
- **관련 API**: `bambi.bannedWords.createMany` (`banned-words.ts` L110, `adminProcedure`)

### 8.6 금칙어 목록·검색·사용 토글·삭제

- **절차**:
  1. 목록은 `includeInactive: true`로 비활성 포함 조회, `term ASC`, DataTable 20건 페이징.
  2. "금칙어·정규화형 검색" — **클라이언트 필터**.
  3. 행의 **사용 스위치** 토글.
  4. 삭제 — 행 단건 / 선택 N건 / **전체 삭제**.
- **기대 결과**:
  - 스위치 OFF → `isActive = false` → **검사에서 제외**(`getActiveBannedWords`는 활성만 조회).
  - 단건/선택 삭제는 **확인 모달 없이 즉시** 실행되고 토스트 "금칙어 N건을 삭제했어요."
  - 전체 삭제만 AlertDialog가 뜬다("등록된 N건이 모두 사라집니다. 되돌릴 수 없고, 삭제하면
    커뮤니티·고객센터 글에서 금칙어 검사가 사실상 꺼집니다.").
- **엣지 케이스 / 실패 케이스**:
  - **검색어는 정규화되지 않는다** → `"성 매매"`로 검색하면 정규화형 `성매매`와 매치되지 않는다.
  - 존재하지 않는 id로 `setActive`/`remove` → 오류 없이 `{ ok: true }` (성공 토스트만 뜨고 아무 변화 없음).
  - `remove`에 빈 배열 → 400(의도적 — "빈 배열 = 전체"를 막기 위해 `removeAll`을 분리).
  - 검색 상태에서 전체 선택 후 검색어를 바꾸면 선택 id가 유지되어 버튼의 "선택 N건"과 보이는 행이 어긋난다.
  - > ⚠ **전체 삭제는 되돌릴 수 없고**, 커뮤니티·고객센터 글쓰기 차단이 사실상 무력화된다.
- **관련 API**: `bambi.bannedWords.list` / `setActive` / `remove` / `removeAll`
  (`banned-words.ts` L51 / L155 / L168 / L183, 전부 `adminProcedure`)

### 8.7 금칙어 반영 경로 확인 (엔드투엔드)

- **차단형** — `assertNoBannedWords`가 첫 히트에서 400
  (`게시할 수 없는 단어가 포함되어 있습니다: '{term}'`):
  커뮤니티 글 작성/수정, 커뮤니티 댓글, 1:1 문의 등록, **문의 메시지(운영자 답변 포함)**.
- **감지형** — `detectBannedTerms` → `job_post.detectedTerms` + `riskFlags: ["banned_word"]`
  (`packages/api/src/routers/bambi/jobs.ts` `prepareJobPostContent`).
  스캔 대상은 제목 / 본문(블록 조립본) / 면접 메모 / 배너 레이아웃 텍스트 전체.
  **공고는 차단되지 않고 검수 큐로 넘어가** 운영자가 판단한다.
- **반영되지 않는 곳**: **FAQ 등록(`createFaq`)에는 금칙어 검사가 없다.**
  후기의 `riskFlags`는 금칙어가 아니라 별개 정책(전화번호/외부 메신저/협박/개인정보).
- **권장 QA 시나리오**:
  1. 금칙어 `성매매` 등록 → 커뮤니티 글 제목에 `"성 매매"` → 400 + 원문 노출.
  2. 같은 문구로 공고 등록 → **저장 성공**, 검수 큐에 감지 배지 + `성매매` 표시.
  3. 해당 금칙어 사용 스위치 OFF → 재작성 → 통과.
  4. `"!!!"` 등록 시도 → 400. `"성-매매"` 등록 시도 → 409.
- > ⚠ **캐시 타이밍 함정**: 활성 금칙어는 모듈 전역 메모리 캐시(TTL 60초)다. 변경 프로시저가
  > `invalidateBannedWordCache()`를 호출해 **같은 인스턴스는 즉시 반영**되지만,
  > **다중 인스턴스면 다른 인스턴스는 최대 60초 지연**된다. "추가했는데 글이 써진다"면 60초 대기 후 재확인.

### 8.8 게시판 관리(수다방 게시판 추가·수정·아이콘·노출·삭제)

- **경로**: `/moderator/community-boards` (파일: `apps/web/src/app/moderator/community-boards/page.tsx`)
- **사전 조건**: 마이그레이션 `0075_dynamic-community-board`가 적용돼 `community_board` 테이블과
  시드 5행(`notice`/0 · `free`/20 · `work_talk`(slug `work-talk`)/30 · `market`/40 · `legal`/50)이 있어야 한다.
  미적용이면 수다방 전 경로가 `NOT_FOUND` "게시판을 찾을 수 없습니다."로 죽는다.
  아이콘 열은 `0076_community-board-icon`(`community_board.icon text NULL`)까지 적용돼야 한다 —
  **시드 5행의 `icon`은 NULL**이라 마이그레이션 직후 화면 모습은 이전과 동일해야 한다(회귀 기준).
- **목록**: `communityBoards.list`(adminProcedure, **비활성 포함**, `sort_order ASC`).
  열 8개 — 아이콘 · 게시판(label) · 주소(`/seeker/community/{slug}` 배지) · 설명 · 순서 · 글쓰기(Switch) · 노출(Switch) · 관리([수정] + 빌트인이 아니면 [삭제]).
  아이콘 열은 지정 없거나 웹이 모르는 이름이면 `—`.
- **추가 절차**: 이름(≤30) · 주소(2~30) · 아이콘(선택, 기본 `없음`) · 설명(≤200, 선택) 입력 → **[게시판 추가]**.
  - 기대: 토스트 "게시판을 만들었어요.", `key = slug`, `sortOrder = max(sort_order) + 10`(목록 맨 끝), 아이콘 미선택이면 `icon = NULL`.
  - 실패: 패턴 위반 → 400 "주소는 영소문자·숫자·하이픈·밑줄 2~30자로 입력해 주세요." /
    `best`·`crawled`·`write` → 400 "이미 쓰이고 있는 주소입니다. 다른 주소를 입력해 주세요." /
    기존 slug 중복 → 409 "이미 등록된 게시판 주소입니다."
- **수정**: [수정] → 다이얼로그(이름·설명·아이콘·정렬 순서 0~10000) → **[저장]**, 토스트 "게시판을 수정했어요."
  **`key`·`slug`는 수정 불가**(입력칸 없음). 선택 필드를 전부 생략하면 zod `refine`이 거부한다(`icon`도 그 refine에 편입).
- **아이콘 케이스**:
  - 선택지는 **12종 고정**(서버 `COMMUNITY_BOARD_ICONS` zod enum = `MessageCircle`·`Briefcase`·`ShoppingBag`·`Scale`·`Megaphone`·`Sparkles`·`Coffee`·`Music`·`Heart`·`Star`·`Users`·`Newspaper`).
    화면은 lucide 원값이 아니라 **한글 라벨**(말풍선·서류가방·쇼핑백·저울·확성기·반짝임·커피·음표·하트·별·사람들·신문)로 노출하고, 목록 항목엔 실제 아이콘을 함께 그린다.
  - 12종 밖의 문자열을 API로 직접 보내면 zod enum이 **400**으로 거부한다.
  - 수정에서 `없음` 저장 → `icon: null`이 실려 **아이콘 제거**. 아이콘 필드를 아예 빼면(`undefined`) 기존 값 유지 — 이 둘의 구분이 회귀 포인트다.
  - DB에 웹 맵에 없는 이름이 들어 있으면(수기 UPDATE 등) 화면은 **조용히 무시**하고 아이콘 없음처럼 그리며, 수정 창의 선택값도 `없음`으로 시작한다(그릴 수 없는 값을 고른 것처럼 보이지 않게).
  - 노출 위치: `communityBoards.listActive`·`community.overview.boards[]`에 `icon`이 실려
    **수다방 홈/구직자 홈 카드 제목 앞**(`BoardTitleMark`)과 **게시판 목록 화면 상단 제목 앞**에 `text-coral-500` 크기 `size-4`로 붙는다.
    우선순위는 **지정 아이콘 > `notice`의 확성기 폴백 > 기존 액센트 색 막대**. `overview`의 가상 `best` 항목은 항상 `icon: null`.
- **스위치**: 글쓰기(`update.isWritable`) · 노출(`setActive`) 모두 **확인 모달 없이 즉시** 적용.
  미존재 key면 `NOT_FOUND` "게시판을 찾을 수 없습니다."
- **삭제(`communityBoards.remove`, adminProcedure)**: [삭제] → AlertDialog("○○ 게시판을 삭제할까요?" / "되돌릴 수 없습니다…") → **[삭제]**.
  - 성공: 토스트 "게시판을 삭제했어요.", 행이 목록에서 사라진다. 되돌리는 경로는 없다(같은 slug로 재생성만 가능).
  - 빌트인 5종(`notice`·`free`·`work_talk`·`market`·`legal`) → **버튼 자체가 없다**(웹 `isBuiltinBoardKey`).
    API 직접 호출 시 400 "기본 게시판은 삭제할 수 없습니다."
  - 글이 **1건이라도** 있는 게시판(`community_post.board = key`, 숨김·삭제 상태 글 포함) → 409
    "글이 있는 게시판은 삭제할 수 없습니다. 노출을 끄는 방식을 사용해 주세요." — 화면은 이 서버 문구를 그대로 토스트한다.
    **조치 삭제는 소프트 삭제라 행이 남아 이 409를 풀어 주지 않는다.** 게시판을 실제로 비우려면
    [8.2-1 영구 삭제](#82-1-커뮤니티-글-영구-삭제하드-삭제)로 글을 하나씩 물리 삭제해야 한다.
  - 미존재 key → `NOT_FOUND` "게시판을 찾을 수 없습니다."
  - **QA 시나리오**: 새 게시판 생성 → 글 0건 상태에서 삭제 성공 → 재생성 후 글 1건 작성 → 삭제 시도 409 확인 →
    노출 OFF로 대체 처리, 또는 게시물 조치에서 **삭제 → 영구 삭제하기**로 글을 비운 뒤 삭제 성공(8.2-1).
    글 수를 화면이 세지 않으므로 **버튼은 항상 보이고 거절은 서버에서만** 난다(의도).
- **소비 경로 확인(엔드투엔드)**:
  - 웹은 `communityBoards.listActive`(**publicProcedure**, 활성만)를 `useCommunityBoards`로 받고 **staleTime 5분** — 방금 만든 게시판·아이콘 변경이 안 보이면 5분 또는 새로고침.
  - `community.overview.boards[]`는 `best`(가상, 선두) → 활성 게시판 `sort_order ASC`. 홈·수다방 홈이 같은 배열을 쓴다.
  - 노출 OFF → 수다방 목록·홈에서 사라지고 `/seeker/community/{slug}`는 404, 서버 `assertBoard`도 `NOT_FOUND`. **글은 보존**되며 다시 켜면 복귀.
  - 글쓰기 OFF → 목록의 [글쓰기] 버튼 사라짐, `/seeker/community/{slug}/write` 404, `createPost`는 400 "이 게시판에는 글을 쓸 수 없습니다."
- **신규 게시판의 표준 동작**: 회원 열람·작성, 비밀글 가능, 목록 필터 노출(`best`·`notice`·`legal`만 필터 숨김),
  `베스트글` 집계 포함(제외는 `notice`·`legal`), **게스트 쓰기 불가**(`free`·`work_talk`·`legal` 고정),
  **공개 `/board` 미노출**(`PUBLIC_COMMUNITY_BOARDS` 3종 고정), 연락처 칸·자동 잠금 없음.
- **관련 API**: `bambi.communityBoards.list` / `create` / `update` / `setActive` / `remove` (adminProcedure), `listActive` (publicProcedure) — `packages/api/src/routers/bambi/community-boards.ts`
- > ⚠ **아이콘 목록이 서버·웹 두 벌이다.** 서버는 zod enum(`COMMUNITY_BOARD_ICONS`, 라우터), 웹은 이름→lucide 컴포넌트 Record
  > (`apps/web/src/lib/bambi/community-board-icons.ts`). 웹이 서버를 import하지 않으므로(번들에 `db`가 딸려 오는 것을 피함)
  > **드리프트를 타입 검사가 잡지 못한다.** 아이콘을 추가할 때는 두 파일을 함께 고치고, 12종 전부가 운영자 화면 Select에
  > 보이는지 눈으로 확인할 것. 서버에만 있는 이름은 화면에서 무시되고, 웹에만 있는 이름은 저장 시 400이 난다.

---

## 9. 채팅 모니터링

### 9.1 채팅 관리 목록

- **경로**: `/moderator/chats` (파일: `apps/web/src/app/moderator/chats/page.tsx`)
- **선행 조건**: 목록에 뜨려면 아래 4개 조건 중 **하나 이상**을 만족해야 한다(OR).
  플래그 없는 정상 방은 **절대 안 뜬다** — QA 전에 조건을 먼저 만들어야 한다.
  1. `chatRoom.isBlocked = true` (운영자 차단 — §6.4에서 생성)
  2. `chatRoom.seekerDeletedAt IS NOT NULL` (구직자가 방 나감)
  3. `chatRoom.employerDeletedAt IS NOT NULL` (구인자가 방 나감)
  4. 신고된 방 — `report.targetType='chat_room'`의 `targetId` ∪
     `report.targetType='chat_message'`인 메시지가 속한 방
- **기대 결과**: 정렬 `chatRoom.updatedAt DESC`, 클라이언트 DataTable(10건). 상태 배지는 복수 동시 표시 가능 —
  신고됨 / 차단됨 / 삭제됨, 없으면 "정상". 컬럼 정렬은 공고 제목·구인자·구직자·최근 메시지에서 가능.
- **엣지 케이스**:
  - 한쪽만 나가도 "삭제됨" 배지가 붙는다.
  - **사용자 간 차단(`user_block`)은 `chatRoom.isBlocked`를 세우지 않는다** → 이 목록에 뜨지 않는다.
  - 메시지 0건이면 "메시지 없음".
- **관련 API**: `bambi.moderation.listChatsForModeration` (`moderation.ts` L1980, `adminProcedure`)

### 9.2 채팅 내역 열람

- **절차**: 행 액션 → **채팅 내역** → 모달(열릴 때만 조회).
- **기대 결과**: 전체 메시지를 시간순으로 표시. 발신자 배지(구인자/구직자),
  `kind === "contact_request"`면 "연락처 요청" 배지, **첨부는 파일명만**(storageKey 비노출).
  최대 높이 60vh 스크롤. 메시지가 없으면 "아직 메시지가 없어요."
- **엣지 케이스**: 없는 방 → `NOT_FOUND`.
- **관련 API**: `bambi.moderation.getChatMessagesForModeration` (`moderation.ts` L2038, `adminProcedure`)

### 9.3 채팅방 하드삭제

- **절차**: 행 액션 → **삭제** → 사유(2자 이상) → **삭제 확정**.
- **기대 결과**: 트랜잭션으로 `chatMessageReadReceipt` → `chatAttachment` → `chatMessage` →
  `interviewSchedule` → `chatRoom` 순 물리 삭제 + 감사 로그 `hard_delete`(`targetType: "chat_room"`).
  토스트 "채팅방을 삭제했어요."
- > ⚠ **되돌릴 수 없다.** 게다가 `chatRoom.id`를 참조하는 **모든 테이블이 `onDelete: cascade`**라
  > **그 방에서 작성된 후기(`review.chatRoomId`), 사용자 차단 기록, 알림, 연락처 공개 동의까지 함께 사라진다.**
  > 다이얼로그 문구("메시지·첨부가 모두 지워지며")에는 후기 소멸이 고지되지 않는다.
  > 후기 관리 QA와 순서가 겹치면 데이터가 없어지므로 **후기 시나리오를 먼저 수행**할 것.
- **엣지 케이스 / 실패 케이스**:
  - **첨부의 GCS 실제 객체는 삭제하지 않는다**(`deletePublicObjects` 미호출) → 스토리지 고아 파일이 남는다.
  - `report` 행은 `targetId`가 text·FK 없음 → 방을 지워도 신고는 남고, 그 방은 목록에서 사라져
    신고 처리 동선이 끊긴다.
  - 실패 시 화면은 서버 메시지를 무시하고 고정 문구를 띄운다.
- **관련 API**: `bambi.moderation.hardDeleteChatRoom` (`moderation.ts` L2110, `adminProcedure`)

### 9.4 차단 토글은 이 화면에 없음

- `bambi.moderation.setChatRoomBlocked`는 **신고 상세(`/moderator/reports/[id]`)에서만** 호출된다(§6.4).
  채팅 관리 화면에는 차단/해제 버튼이 없다.

---

## 10. 크롤러 운영

> 사이트 상수: 화면의 "수집 대상"은 조작 불가하며 `SOURCE_SITE = "queenalba"`로 하드코딩돼 있다
> (`apps/web/src/app/moderator/crawler/page.tsx`). 저장할 때마다 DB의 `crawl_source_site`가
> `queenalba`로 덮인다. `foxalba`는 enum·파서·라벨만 남아 있고 사용 대상 목록에서 빠져 있다.

### 10.0 사전 조건 (크롤러 전용)

- **env `QUEENALBA_COOKIE`** (`packages/env/src/server.ts` L41, optional):
  퀸알바는 전 페이지가 KCB 성인인증 게이트 뒤에 있어 **브라우저 Cookie 헤더 한 줄 전체**가 필요하다
  (`PHPSESSID`만으로는 안 열리고 `adultcode`·`adultname`·`adulbrith`·`adulphone`이 함께 있어야 함).
  미설정이면 코드 내 자리표시자를 쓰고 **반드시 게이트에 막혀 회차가 `failed`**가 된다. 쿠키는 만료되므로
  QA 착수 전 갱신 여부 확인이 첫 단계다.
- **`apps/server` 프로세스**가 떠 있어야 스케줄러(10분 틱)가 돈다. "즉시 수집"은 API 프로세스에서 실행된다.
- `pnpm db:seed:regions` 필수 — 지역 마스터가 없으면 `region_code`/`district_code`가 안 채워져
  수집 공고가 지역 필터에 잡히지 않는다.
- `bambi_site_settings` 행은 없어도 된다(전부 폴백 + upsert).
- 수집 데이터가 없는 초기 상태에서는 대부분의 카드가 EmptyState다 → **§10.3(즉시 수집)을 먼저 한 회차** 돌려야
  나머지 시나리오를 밟을 수 있다.

### 10.1 수집 설정 저장(스케줄러 ON/OFF·주기)

- **경로**: `/moderator/crawler` 「외부 공고 수집」 카드
  (파일: `apps/web/src/app/moderator/crawler/page.tsx`)
- **절차**: 수집 데이터 ToggleGroup(공고/커뮤니티) → 스케줄러 Switch → 수집 주기(시간) → **저장**.
- **기대 결과**: 토스트 "수집 설정을 저장했어요." `bambi_site_settings`(id=`default`) upsert.
  주기 빈칸 = `null` = 기본 3시간(`DEFAULT_CRAWL_INTERVAL_HOURS`).
  스케줄러 ON이면 서버 10분 틱마다 `runCrawlTick`이 돌고 `isCrawlDue`를 만족한 틱에서만 회차가 열린다.
- **엣지 케이스 / 실패 케이스**:
  - `1.5` / `abc` → 클라이언트가 먼저 차단("수집 주기는 시간 단위 정수로 입력해 주세요.", 요청 안 감).
  - `0` / `721` → 클라이언트 검증에 없어 서버 400(1~720 범위 메시지).
  - **스케줄러 Switch는 저장 버튼과 묶여 있다** — 토글만 하고 나가면 반영되지 않는다
    (노출 스위치는 즉시 저장이라 동작이 달라 혼동 지점).
- **관련 API**: `bambi.crawler.getSettings` / `bambi.crawler.updateSettings`
  (`packages/api/src/routers/bambi/crawler.ts` L278 / L308, 둘 다 `adminProcedure`)

### 10.2 소스 등록 — **화면에 없음(코드 작업)**

- 소스 추가는 UI가 아니라 4단계 코드 작업이다(`docs/crawler-adding-a-source.md`):
  ① 파서 `bambi-crawl-<site>.ts` ② `bambi-crawl-ingest.ts`의 `JOB_ADAPTERS` 등록
  ③ 게이트가 있으면 `crawlRequestHeaders(site)`에 쿠키 분기
  ④ `bambi-crawl-policy.ts`의 `IMPLEMENTED_CRAWL_TARGETS`에 조합 추가 —
  이 줄이 콘솔의 "준비 중"을 풀고 스케줄러를 여는 **유일한 스위치**.
- 현재 `AVAILABLE` = `IMPLEMENTED` = { queenalba×job_post, queenalba×community }.

### 10.3 즉시 수집(수동 실행)

- **절차**: 수집 데이터 선택 → **즉시 수집**.
- **기대 결과**: 즉시 토스트 "수집을 시작했어요…"(응답은 시작만 시키고 반환).
  「최근 수집 회차」에 `퀸알바/공고 · 진행 중` 행이 생기고 수 분 뒤 `성공`으로 바뀐다.
  `crawl_last_run_at` 갱신.
  **`crawlEnabled`를 보지 않는다 — 스케줄러 OFF여도 실행된다**(주기 판정만 건너뜀).
- > ⚠ **부작용이 크다.**
  > ① 실제 퀸알바에 요청이 나간다(요청 간격 1.5초, 상세 최대 300건/회차, 최대 ~10분).
  > **운영자 본인 명의의 실명 인증 쿠키로 접속하는 것**이 된다.
  > ② 수율이 신뢰되면 `expireStale`이 돌아 3일 이상 안 보인 `active`/`needs_review` 행이 `expired`가 된다.
  > ③ 메인 파싱이 1건 이상이면 `resetStaleListingLabels`가 메인에 없는 공고의 `listing_type`·배너 이미지를
  > **null로 지운다** → 광고 배너 노출이 즉시 줄어든다.
- **엣지 케이스 / 실패 케이스**:
  - 진행 중 회차가 있고 30분 미만이면 `{reason:"already_running"}` → "이미 수집이 진행 중이에요…"
    (사이트 구분 없이 `status='running'` 아무 행이나 잡는다).
  - 30분 초과 방치 회차는 `reapStaleRuns`가 `failed`로 정리한 뒤 새 회차가 열린다.
  - 미구현 조합이면 `{reason:"not_implemented"}` → "이 데이터의 수집기는 아직 준비 중이에요."
    (판정은 **DB에 저장된 `crawlSourceSite`** 기준이라, 레거시 `foxalba`가 남아 있으면
    화면엔 "준비 중"이 없는데 즉시 수집만 튕긴다 → 「저장」 한 번으로 해소).
  - 공고 회차와 커뮤니티 회차는 **동시에 못 돈다**(사이트 단위 부분 유니크 인덱스).
- **관련 API**: `bambi.crawler.runNow` (`crawler.ts` L340, `adminProcedure`)

### 10.4 수집 콘텐츠 노출 스위치 3종

- **경로**: `/moderator/crawler` 「수집 콘텐츠 노출」 카드
- **절차**: 광고 배너 슬롯 노출 / 공고 목록 노출 / 수집 커뮤니티 글 노출 스위치 토글.
- **기대 결과**: **토글 즉시 저장**(저장 버튼·확인창 없음), 토스트 "수집 콘텐츠 노출 설정을 저장했어요."
  기본값은 전부 `false`.
  공고 목록 노출 조건(`packages/api/src/services/bambi-job-feed.ts` L242~260):
  스위치 ON + `status='active'` + `industryCategory`·`region`·`shopName` 전부 NOT NULL +
  이미 전환된 원본이 아닐 것.
- > ⚠ **확인창 없이 즉시 공개 노출에 영향을 준다.** 특히 커뮤니티 노출은 외부 사이트 게시글이
  > 우리 게시판에 서게 되는 조작이다.
- **엣지 케이스 / 실패 케이스**:
  - **공고 상세는 스위치와 무관하게 열린다** — `bambi.crawledJobs.getById`는 **publicProcedure**이고
    `status='active'`만 본다. 노출 스위치를 꺼도 `/seeker/jobs/crawled/{id}` 직접 URL은 비로그인에게도 열린다.
  - **커뮤니티 상세는 반대** — 스위치 OFF면 `getCrawledTopic`이 `NOT_FOUND`를 던진다.
    운영자 카드의 「상세 보기」도 404가 되므로, 커뮤니티 글 본문을 확인하려면 스위치를 켜야 한다.
  - 세 스위치는 한 요청에 세 값을 모두 보낸다 → 창 두 개에서 각각 토글하면 나중 요청이 앞 요청을 덮는다.
  - 화면 안내문 "급여·근무시간이 빠진 공고는 목록에서 제외"는 **코드 조건과 불일치**
    (코드는 업종·지역·업소명만 요구).
- **관련 API**: `bambi.siteSettings.getCrawledExposure` / `updateCrawledExposure`
  (`site-settings.ts` L405 / L422, `adminProcedure`)

### 10.5 수집 상한 저장

- **경로**: `/moderator/crawler` 「수집 상한」 카드
- **절차**: 배너/특별/급구/추천 상한(각 0~60), 커뮤니티 상한(1~150) 입력 → **저장**.
- **기대 결과**: "수집 상한을 저장했어요." 공고 3종·배너는 **수집 시와 노출 시 모두** 자르는 값,
  커뮤니티는 **한 회차에 담을 글 수**(기본 150 = 5페이지×30).
- **엣지 케이스**: 범위 밖 값은 클라이언트가 먼저 토스트로 차단(요청 안 감).
  커뮤니티 상한을 낮춰도 이미 저장된 행은 지워지지 않는다(커뮤니티엔 만료 스윕이 없다).
- **관련 API**: `bambi.siteSettings.getCrawledLimits` / `updateCrawledLimits`
  (`site-settings.ts` L442 / L461, `adminProcedure`)

### 10.6 업종 검토 대기(needs_review) 처리

- **경로**: `/moderator/crawler` 「업종 검토 대기」 카드
- **선행 조건**: 원본 업종이 우리 enum 9종에 매핑되지 않은 수집 공고가 있어야 한다.
- **절차**: 행의 업종 Select에서 값 선택.
- **기대 결과**: **선택 즉시 저장(확인창 없음)**, 토스트 "업종을 지정했어요. 검토 대기에서 빠집니다."
  상태 `needs_review → active`, 「수집 현황」의 카운트가 이동한다.
- **엣지 케이스 / 실패 케이스**:
  - 최근 30건만 보여 준다(전체 건수는 문단에 표기).
  - > ⚠ **되돌릴 UI가 없다.** 잘못 지정해도 다른 업종으로 다시 고를 수만 있고 `needs_review`로 복귀 불가.
  - `expired`/`removed` 상태에서 업종을 지정하면 **업종만 바뀌고 상태는 유지**된다(이 카드에선 미발생).
  - **회귀 테스트 포인트**: 다음 회차 재수집이 운영자 지정 업종을 덮지 않아야 한다
    (`coalesce(excluded.industry_category, 기존값)`).
- **관련 API**: `bambi.crawler.list` / `bambi.crawler.setIndustryCategory`
  (`crawler.ts` L127 / L174, `adminProcedure`)

### 10.7 수집 공고 삭제 / 복구 (톰스톤)

- **경로**: `/moderator/crawler` 「수집 공고 관리」 카드
  (파일: `apps/web/src/app/moderator/crawler/crawled-content-cards.tsx`)
- **절차**: 상태 필터(전체/수집됨/업종 검토 대기/만료/삭제됨) → 단건은 행 `…` → **삭제**(AlertDialog 확인) /
  **복구**(확인창 없이 즉시). 여러 건은 제목 왼쪽 선택 칸 또는 머리글 전체 선택으로 현재 페이지에서 최대 10개 선택 →
  상태 필터 옆 빨간 **선택 삭제 (N)** → 확인 창 한 번 → 모두 `removed`.
- **기대 결과**: 삭제 → `removed`, "공고를 삭제했어요. 목록·배너에서 바로 빠집니다."
  복구 → 업종이 있으면 `active`, 없으면 `needs_review`.
- **엣지 케이스 / 실패 케이스**:
  - **핵심 회귀 테스트**: `removed`는 **재수집 upsert·만료 스윕이 절대 덮지 않는다**.
  - 삭제됨 행은 선택할 수 없고 삭제됨 필터에는 선택 칸·일괄 삭제 버튼이 없다. 페이지·상태 필터 변경 시 선택은 초기화된다.
  - 일괄 삭제 뒤 뒤 공고가 있으면 같은 페이지가 다시 최대 10건으로 채워진다. 마지막 페이지가 사라진 경우에만 새 마지막 페이지로 이동한다.
  - 수집됨 5페이지에서 이미지 편집을 저장·취소·변경 버리기 하면 수집됨 5페이지로 돌아온다.
    삭제 후 즉시 수집을 한 번 더 돌려도 삭제 상태가 유지되는지 확인할 것.
  - 이미 삭제된 행(목록이 낡음)에 복구를 다시 걸면 `NOT_FOUND` "대상을 찾을 수 없습니다."
  - 삭제된 공고는 상세 재수집 대상에서도 빠진다.
- **관련 API**: `bambi.crawler.removePost` / `removePosts` / `restorePost`

### 10.8 수집 커뮤니티 글 삭제 / 복구

- **경로**: `/moderator/crawler` 「수집 커뮤니티 글 관리」 카드
- **절차**: 필터(전체/수집됨/삭제됨) → 삭제(확인 후) / 복구(즉시).
- **기대 결과**: `removed_at` 기록/해제. 커뮤니티 글은 status enum이 없고 `removedAt` 시각 하나로 관리된다.
- **엣지 케이스**: 삭제된 글은 다음 회차의 **상세 백필 대상에서도 제외**된다(본문·댓글 미수신).
  복구하면 다음 회차가 이어받는다. 조회수 `—`는 정상(상세에만 있고 없을 수도 있음).
  「상세 보기」는 커뮤니티 노출 스위치 ON일 때만 열린다(§10.4).
- **관련 API**: `bambi.crawler.listTopics` / `removeTopic` / `restoreTopic`
  (`crawler.ts` L231 / L255 / L266)

### 10.9 회차 기록 확인 / 비우기

- **경로**: `/moderator/crawler` 「최근 수집 회차」 카드 (최근 20건 고정, 필터·페이지 없음)
- **기대 결과(상태 판독)**: `성공` / `진행 중` / `실패` / **`수율 미달 중단`**.
  `aborted_low_yield`는 장애가 아니라 **상대 사이트 마크업 변경 신호**이며,
  그 회차에서는 `markSeen`·`expireStale`·`resetStaleListingLabels`가 **전부 생략**되어 데이터가 보호된다.
- **주요 error 문구**:
  | 상황 | status | error |
  | --- | --- | --- |
  | 쿠키 자리표시자/만료 | failed | "퀸알바 성인인증 게이트에 막혔다 — …QUEENALBA_COOKIE를 갱신" |
  | 쿠키에 비ASCII 문자 | failed | "퀸알바 쿠키에 ASCII가 아닌 문자가 있다 …" |
  | robots.txt 금지/수신 실패 | failed | "robots.txt가 목록(게시판) 수집을 허용하지 않는다" |
  | 목록 파싱 0건 | aborted_low_yield | "목록 파싱 0건 — 셀렉터 파손으로 보고 중단" |
  | 상세 실패율 >50% | aborted_low_yield | "상세 파싱 실패율 초과 — 만료 처리 생략" |
  | 프로세스 중단 잔해 | failed | "진행 중 상태로 방치돼 정리됨(프로세스 중단 추정)" |
- **비우기 절차**: **비우기** → AlertDialog 확인.
- > ⚠ **`running`이 아닌 전 사이트·전 종류 회차를 물리 삭제한다. 톰스톤 없음, 복구 불가.**
  > 파서 파손 이력(수율 추이)이 사라진다. 진행 중 회차는 남긴다.
- **관련 API**: `bambi.crawler.listRuns` / `clearRuns` / `getSummary`
  (`crawler.ts` L395 / L413 / L423)

### 10.10 job_post 전환(converted) — **코드에 없음**

- `job_post.source = 'converted'` / `crawledFromId`를 **쓰는 프로시저·화면·스크립트가 없다**
  (읽는 곳만 3곳: `getSummary` 카운트, 공고 피드 제외 조건, 배너 슬롯 제외 조건).
- **기대 결과: 「수집 현황」의 "전환됨"은 항상 0.** 전환 절차는 현재 존재하지 않는다(부록 "확인 필요").

### 10.11 (참고) UI가 없는 프로시저

- `bambi.crawler.getLead` (`crawler.ts` L148, 수집 공고의 연락처·주소·사업자명 열람) —
  리포 전체에서 호출부가 없다. 화면 QA 대상이 아니다.

---

## 11. 결제·정산

### 11.1 결제 관리 목록·필터

- **경로**: `/moderator/payments` (파일: `apps/web/src/app/moderator/payments/page.tsx`)
- **절차**: 진입 → 우상단 **"미결제만 보기"** 스위치.
- **기대 결과**:
  - 대상 = `status ∈ (pending_review, published)` **AND** `adProductId IS NOT NULL`.
    초안·무료 공고는 제외된다. **유료 여부의 단일 원천은 `adProductId`**(exposureType이 아니다).
  - 컬럼: 선택 / 제목 / 업체 / 상태 / 노출 종류 / 결제 금액(`exposureAmount` null이면 "무료") /
    결제 상태 / 남은 기간 / 만료 / 등록일. `createdAt DESC`, 클라이언트 페이징 10건.
- **엣지 케이스**:
  - 화면이 `limit`을 넘기지 않아 **서버 기본 50건에서 잘린다**. 51건째부터 화면에서 조회 불가.
  - 필터 토글 시 선택이 자동 해제된다.
- **관련 API**: `bambi.moderation.listJobsForPayment` (`moderation.ts` L1581)

### 11.2 일괄 결제 상태 전환

- **절차**: 행 체크(또는 헤더 전체선택) → 상단 "N개 선택됨" 배너 →
  **결제완료 처리** / **미결제로 되돌리기** / 선택 해제.
- **기대 결과**:
  - 성공 토스트 "N건 결제완료 처리했어요" / "N건 미결제 전환 처리했어요".
  - 부분 실패 시 "N건 … 처리, M건 실패 (첫 실패 사유)" — 정원 초과 메시지가 여기 노출된다.
  - `paid` 전환 시 `exposureEndsAt = now + exposureDurationDays`(duration이 null이면 `null`).
  - 전환된 조직마다 `syncAdvertiserFlagForOrganization` 호출.
- **엣지 케이스 / 실패 케이스**:
  - 0건 / **51건 이상**이면 `BAD_REQUEST`(`BULK_MODERATION_TARGET_LIMIT = 50`).
    화면이 최대 50건만 로드하므로 "전체 선택"이 한계에 딱 걸린다.
  - 배너형 승인은 정원 게이트를 타므로, 배너 10건을 한 번에 승인하면 **정원 내 앞 항목만 성공**하고
    나머지는 `CONFLICT`(같은 트랜잭션에서 앞선 승인이 active를 늘리기 때문).
  - > ⚠ 이미 `paid`인 건을 다시 "결제완료 처리"하면 정원 게이트는 안 타지만
    > **`exposureEndsAt`이 now 기준으로 재계산되어 기간이 슬쩍 연장**된다.
  - > ⚠ `paid → unpaid` 되돌리기는 `exposureEndsAt`을 `null`로 지운다(§2.5와 동일).
- **관련 API**: `bambi.moderation.bulkSetJobPostPayment` (`moderation.ts` L1669)

### 11.3 프리미엄 정원(10자리) 게이트 확인

- **파일**: `packages/api/src/services/bambi-premium-capacity.ts`
  (`PREMIUM_AD_CAPACITY = 10`, advisory lock으로 직렬화)
- **CONFLICT 조건 — 셋 다 참일 때만**:
  1. `unpaid → paid` (승인 방향일 때만)
  2. 대상 공고의 `exposureType`이 `premium-banner` / `left-banner` / `right-banner`
  3. 트랜잭션 안에서 재카운트한 **전역 active 배너 수 ≥ 10**
     (active = `published` + `paid` + 배너 3종 + `exposureEndsAt`이 null이거나 미래)
- **막지 않는 것**: `paid → unpaid`, 리스팅형/`none` 상품, **대기열 순번**(뒤 순번을 먼저 승인해도 통과),
  pending(미결제 대기)은 게이트 카운트에 들어가지 않는다.
- **엣지 케이스**: 운영자 결제 관리 화면에는 **정원·대기 정보 표시가 없어** `CONFLICT`가 나기 전까지
  만석 여부를 알 수 없다. `bambi.adProducts.premiumCapacity`는 구인자 화면에서만 소비된다.
- **참조 테스트**: `packages/api/test/routers/bambi/premium-capacity-gate.test.ts` (실행하지 말 것)

### 11.4 결제 수단·입금 대사 — **화면에 없음**

- 결제 관리 화면에 결제수단 컬럼도, 무통장 입금 대사 기능도 없다.
  `paymentMethod`는 공고 등록 시 저장만 되고, 무통장 선택 시 **운영자 등록 계좌 존재 여부만** 검증한다
  (`jobs.ts` L627~640). 계좌 관리는 §13.3.

---

## 12. 광고 상품 · 게재 위치

### 12.1 카탈로그 목록

- **경로**: `/moderator/ad-products` (파일: `apps/web/src/app/moderator/ad-products/page.tsx`)
- **기대 결과**: 위치(placement) 카드 안에 상품(product) 목록이 중첩된다.
  **비활성 위치·상품도 모두 보인다**(운영자 뷰는 `isActive` 필터 없음).
  배지 "배너"/"리스팅"은 `placement.kind`. 정렬은 `sortOrder ASC, createdAt ASC`.
- **엣지 케이스**: `sortOrder`를 넣는 UI가 없어 전부 0 → 사실상 생성순.
- **관련 API**: `bambi.adProducts.listCatalogAdmin` (`ad-products.ts` L147)

### 12.2 게재 위치 생성 / 수정 / 활성 토글

- **경로**: 생성 `/moderator/ad-products/new`, 수정 `/moderator/ad-products/[placementId]/edit`
  (폼 `apps/web/src/components/bambi/ad-placement-form.tsx`)
- **절차**: 위치명(1~120) / 안내 문구(≤500) / 유형(리스팅 노출·배너 광고) → 저장.
  목록 카드 헤더의 Switch로 활성/비활성.
- **기대 결과**: 생성 시 "노출 위치를 만들었어요.", 수정 시 "노출 위치를 수정했어요."
  `isActive` 기본 true. 비활성화하면 구인자 카탈로그(`getCatalog`, `isActive=true`만)에서
  위치와 하위 상품이 전부 사라지지만, **이미 그 상품을 산 공고의 노출은 유지**된다.
- **엣지 케이스 / 실패 케이스**:
  - 이름 중복 제약이 없다 → 같은 이름 위치를 무한히 만들 수 있다.
  - 수정 화면은 자체 조회 없이 `listCatalogAdmin` 캐시에서 찾는다 → URL 직접 진입 시 캐시가 없으면
    "노출 위치를 찾을 수 없어요."
  - `kind`를 배너↔리스팅으로 바꿔도 하위 상품의 `previewTemplate`은 그대로라 정합성이 깨질 수 있다(서버 검증 없음).
- **관련 API**: `bambi.adProducts.createPlacement` / `updatePlacement` (`ad-products.ts` L159 / L170)

### 12.3 게재 위치 삭제

- **절차**: 카드 헤더 "삭제" → "삭제 확인"(인라인 2단 확인, 다이얼로그 아님).
- > ⚠ **되돌릴 수 없다.** `ad_product.placement_id`가 `onDelete: cascade`라
  > **하위 상품이 전부 함께 삭제**되고, 이어서 `job_post.ad_product_id`가 `onDelete: set null`이라
  > **그 상품을 산 모든 공고의 `adProductId`가 NULL이 된다.** 사용 중 검사·경고 문구가 없다.
- **관련 API**: `bambi.adProducts.deletePlacement` (`ad-products.ts` L186)

### 12.4 상품 생성 / 수정 / 활성 토글

- **경로**: 생성 `/moderator/ad-products/[placementId]/new`,
  수정 `/moderator/ad-products/[placementId]/[productId]/edit`
  (폼 `apps/web/src/components/bambi/ad-product-form.tsx`)
- **절차**: 상품명(1~120) / 한 줄 소개(≤200) / **노출 영역(previewTemplate)** / 서비스 내용(benefits) /
  가격 옵션(일수·금액·할인%) / 끌어올리기 수동·자동 / 미리보기 이미지 → 저장.
- **기대 결과**: "광고 상품을 만들었어요." / "광고 상품을 수정했어요."
  - `priceOptions`는 **최소 1개 필수**, 각 `{ amount ≥0, days ≥1, discountPercent 0~100 }`.
  - `previewTemplate` enum 7종이지만 **신규 선택지는 5개**
    (`side-horizontal`/`side-vertical`은 레거시 값이 이미 있는 상품 편집 시에만 "(구) …"로 노출).
  - 미리보기 이미지는 **1.5MB 초과 시 클라이언트 차단**, data URL로 인라인 저장(GCS 업로드 아님).
  - 같은 일수의 가격 옵션 중복 시 클라이언트 거부("같은 이용 기간이 중복됩니다.").
- **엣지 케이스 / 실패 케이스**:
  - **배너–끌어올리기 상호배제**(`assertBannerHasNoBoost`): 배너 템플릿인데 boost > 0이면 `BAD_REQUEST`.
    폼이 배너 선택 시 입력칸을 숨기고 0으로 리셋하므로 **API 직접 호출로만 재현 가능**.
    수정은 부분 패치라 기존 행을 먼저 읽어 최종 상태로 재검증한다(템플릿만 배너로 바꾸는 케이스도 차단).
  - **가격·기간·할인·끌어올리기 변경은 이미 구매한 공고에 소급되지 않는다**
    (공고가 구매 시점 값을 컬럼으로 스냅샷).
  - 반면 **`previewTemplate` 변경은 신규 구매의 `exposureType`을 바꾼다** →
    리스팅 상품을 배너로 바꾸면 그 뒤 구매분부터 프리미엄 정원을 소비하기 시작한다.
  - **활성 토글 구멍**: `resolveJobPostExposure`가 상품을 id로만 찾고 **`isActive`를 검사하지 않는다**
    → 카탈로그를 이미 렌더해 둔 탭에서 비활성 상품 id로 계속 구매할 수 있다(회귀 테스트 대상).
  - 레거시 `side-*` 상품을 다른 템플릿으로 한 번 저장하면 선택지에 없어 되돌릴 수 없다.
- **관련 API**: `bambi.adProducts.createProduct` / `updateProduct` (`ad-products.ts` L215 / L232)

### 12.5 상품 삭제

- **절차**: 상품 행 "삭제" → "삭제 확인".
- > ⚠ **사용 중 검사가 없다.** 삭제하면 그 상품을 산 공고의 `adProductId`가 NULL이 되어
  > **결제 관리 목록에서 사라지고**(유료 판정 기준), 프리미엄 pending 카운트·끌어올리기 자격·
  > 구인자 "내 광고" 목록·수다방 광고주 자격에서 전부 빠지지만 **노출은 계속된다**
  > (배너 active 판정은 `adProductId`를 보지 않음). 되돌리려면 같은 UUID로 상품을 다시 넣거나 DB 직접 수정이 필요하다.
- **권장 QA 시나리오**: ① 상품 A로 공고 구매(미결제) → ② 결제 관리에 보이는지 확인 →
  ③ 상품 A 삭제 → ④ 결제 관리 목록에서 사라지는지 확인(현재 동작 = 사라짐).
- **관련 API**: `bambi.adProducts.deleteProduct` (`ad-products.ts` L262)

### 12.6 순서 변경 — **UI 미구현**

- `bambi.adProducts.reorderPlacements` / `reorderProducts`(`ad-products.ts` L200 / L276)는
  서버에 구현돼 있으나 **웹에서 호출하는 코드가 없다**. QA 항목에서는 "UI 미구현"으로 표기.

---

## 13. 사이트 설정

> **경로 공통**: `/moderator/site-settings`
> (파일: `apps/web/src/app/moderator/site-settings/page.tsx`,
> 라우터 `packages/api/src/routers/bambi/site-settings.ts`,
> 스키마 `packages/db/src/schema/bambi.ts` L939~ `bambiSiteSettings`)
>
> 탭이 없고 카드 6개가 세로로 나열되며 **카드마다 독립 폼 + 독립 저장 버튼**이다
> (한 카드 저장이 다른 카드 값을 덮지 않는다 — 각 update가 자기 컬럼만 upsert).
> `bambi_site_settings`는 `id = "default"` 단일 행이며, **첫 저장이 곧 행 생성**이다.
> 시드가 이 행을 만들지 않으므로 초기 상태에서는 모든 조회가 폴백값을 반환한다.

### 13.1 푸터 사업자 정보

- **절차**: 서비스 소개 문구 / 상호 / 대표자 / 사업자등록번호 / 고객문의 이메일 / 고객센터 전화 /
  광고 등록 문의 전화 / 사업장 주소 입력 → **저장**.
- **기대 결과**: 토스트 "사이트 정보를 저장했어요." → 전 페이지 푸터(`site-footer.tsx`)에 반영.
  `adInquiryTel`은 광고 슬롯의 "광고 등록 문의"(`ad-banner.tsx`)에 노출된다.
- **입력 검증**: 전부 trim, 빈 값이면 `null` 저장(→ `apps/web/src/lib/bambi/company.ts`의 폴백 표시).
  footerIntro ≤500 / operator·ceo ≤120 / bizRegNo·tel·adInquiryTel ≤60 / address ≤200 /
  email ≤200 + 이메일 형식.
- **엣지 케이스**: 공백만 입력 → `null`(미설정) → 폴백 문구 노출("저장했는데 안 바뀜"이 아니라 정상 동작).
  길이 초과 → 400 "{max}자 이내로 입력해 주세요." / 잘못된 이메일 → 400.
- **관련 API**: `bambi.siteSettings.getFooter`(**publicProcedure**) / `updateFooter`(`adminProcedure`, L251)

### 13.2 개인정보 처리방침 연락처

- **절차**: 본인인증 대행사(수탁사명) / 보호책임자 성명 / 관리부서 전화 / 관리부서 메일 → **저장**.
- **기대 결과**: "개인정보 처리방침 연락처를 저장했어요." → 처리방침 페이지(`privacy-contacts.tsx`)에 반영.
- **입력 검증**: 120 / 60 / 60 / 이메일 형식+200.
- **엣지 케이스**: DB에 `privacy_sms_provider` 컬럼이 있으나 **읽지도 쓰지도 않는다**(화면에 없는 것이 정상).
- **관련 API**: `bambi.siteSettings.getPrivacyContacts`(public) / `updatePrivacyContacts`(L277)

### 13.3 무통장입금 계좌

- **절차**: **계좌 추가** → 은행명 / 계좌번호 / 예금주 입력(행 단위) → 필요 시 행 삭제 → **계좌 저장**.
- **기대 결과**: "무통장입금 계좌를 저장했어요." 저장 배열이 `bank_accounts` jsonb를 **통째로 치환**.
  공고 등록·수정의 결제 안내(`bank-transfer-guide.tsx` 등)에 반영. 0건이면 "고객센터 문의" 문구로 폴백.
- **입력 검증**: 배열 최대 10개, 각 필드 trim 1~60.
- **엣지 케이스 / 실패 케이스**:
  - 세 칸 모두 빈 행은 **클라이언트가 전송 전에 제외**한다(에러 없이 사라짐).
  - 부분 입력(은행명만) → 400 "계좌번호를 입력해 주세요." 등.
  - 11번째 행 추가 후 저장 → 400(클라이언트에 개수 제한이 없어 실제로 재현된다).
  - 중복 계좌 방지 없음.
- **관련 API**: `bambi.siteSettings.getPaymentAccounts`(public) / `updatePaymentAccounts`(L303)

### 13.4 회원 정책 — 탈퇴 개인정보 보존기간 · 파기 배치 실행 시각

- **절차**: 「탈퇴 개인정보 보존기간(일)」·「파기 배치 실행 시각(0~23시)」 입력 → **저장**(한 폼·한 번의 저장).
- **기대 결과**: "회원 정책을 저장했어요." 보존기간은 ① 탈퇴 안내 문구 ② 개인정보 처리방침
  ③ **파기 배치의 cutoff 계산**(`resolveWithdrawalRetentionDays`)에 동시 반영된다.
  기본값 `DEFAULT_WITHDRAWAL_RETENTION_DAYS = 30`.
  실행 시각은 **다음 틱(≤10분)부터** 파기 배치의 도래 판정에 반영된다(§4.7).
  기본값 `DEFAULT_WITHDRAWAL_PURGE_HOUR = 4`(KST 새벽 4시).
- **입력 검증**: 보존기간 정수 1~365 / 실행 시각 정수 0~23, 둘 다 `null` 허용(=기본값 복귀).
- **엣지 케이스**: `12.5`/`abc` → 클라이언트 차단 / 보존기간 `0`·`366`, 실행 시각 `-1`·`24` → 서버 400.
  실행 시각을 그날 자동 실행이 끝난 뒤 더 늦은 시각으로 바꾸면 같은 날 한 번 더 돈다(멱등이라 결과 동일).
- **관련 API**: `bambi.siteSettings.getMemberPolicy`(public — `purgeLastRunAt`은 조회 전용) /
  `updateMemberPolicy`(admin)

### 13.5 "지금 파기 실행" (탈퇴 계정 잔여 정보 파기)

- **절차**: 「회원 정책」 카드 하단 **지금 파기 실행** 클릭. 같은 배치를 서버가 매일 설정 시각에
  자동 실행하므로(§4.7) 이 버튼은 다음 자동 실행 전에 즉시 정리할 때만 쓴다.
  버튼 위에 **마지막 실행** 시각이 표시된다(미실행이면 "아직 없음", 실행 후 자동 갱신).
- > ⚠ **확인 다이얼로그 없이 즉시 실행되며 되돌릴 수 없다.**
  > 대상: `deletedAt IS NOT NULL AND deletedAt <= (now - 보존기간) AND purgedAt IS NULL`.
  > 세션·자격증명(비밀번호) 삭제, 연락처·성별·생년월일·CI/DI 해시 파기,
  > 이메일을 `withdrawn-{id}@invalid.bambi`로, 이름을 "탈퇴한 회원"으로 치환하고 `purgedAt` 기록.
  > **개발 DB에서만, 대상 건수를 SQL로 먼저 확인한 뒤 실행할 것.**
- **기대 결과**: 대상 0건 → "보존기간이 지난 탈퇴 계정이 없어요." /
  N건 → "탈퇴 계정 N건의 잔여 정보를 파기했어요."
- **엣지 케이스**: 멱등하다(`purgedAt IS NULL` 조건) → 연속 2회 클릭 시 두 번째는 0건.
  자동 실행과 겹쳐도 같은 이유로 두 번 처리되지 않는다.
  수동 실행도 `withdrawal_purge_last_run_at`을 갱신하므로(자동·수동 공용 함수) **그날 설정 시각 이후에**
  수동 실행하면 그날의 자동 실행은 건너뛴다 — crawl의 「즉시 수집」이 주기를 미는 것과 같은 동작이다.
- **관련 API**: `bambi.moderation.purgeWithdrawnAccounts` (`adminProcedure`) →
  `purgeWithdrawnAccountsBatch`(`packages/api/src/services/bambi-withdrawal-purge.ts`)

### 13.6 최저시급 표기

- **절차**: 기준 연도 / 시급(원) → **저장**.
- **기대 결과**: "최저시급을 저장했어요." → `getFooter` 캐시를 무효화(별도 조회 없음) →
  공고 상세 급여 옆 `"{연도}년 최저시급 {시급}원"` 갱신. 기본값 `{ year: 2026, hourly: 10320 }`.
- **입력 검증**: hourly 정수 1~1,000,000 / year 정수 2000~2100, 둘 다 nullable.
- **엣지 케이스**: 한쪽만 입력하면 다른 쪽이 기본값 폴백이 되어 **연도/시급 출처가 섞인다** — 함께 바꿀 것.
- **관련 API**: `bambi.siteSettings.updateMinimumWage` (L384)

### 13.7 광고 배너 로테이션

- **절차**: 로테이션 주기(분) → **저장**.
- **기대 결과**: "광고 배너 로테이션 주기를 저장했어요." → 프리미엄 배너가 이 주기마다 한 칸 전진
  (`jobs.ts` L1328~1334). 기본값 `DEFAULT_AD_ROTATION_MINUTES = 60`.
- **입력 검증**: 정수 1~10080(7일), nullable.
- **엣지 케이스**: 주기 변경 직후 위치가 한 번 점프할 수 있다(화면 안내문에 명시됨).
- **관련 API**: `bambi.siteSettings.getAdRotation`(public) / `updateAdRotation`(L365)

### 13.8 크롤러 관련 설정은 이 화면에 없음

- `crawl_*` / `crawled_*` 컬럼(스케줄러·노출 스위치·상한)은 **`/moderator/crawler`**에서 관리한다(§10).
- **`bambi_site_settings`에 "프리미엄 정원" 설정은 없다.** 정원 10은
  `packages/api/src/services/bambi-premium-capacity.ts`의 코드 상수다(§11.3).

---

## 14. 고객문의(고객센터)

두 상태 축을 혼동하지 말 것:
`inquiryStatus`(open/answered/closed) = **진행 상태**,
`status`(published/hidden/deleted) = **운영 조치 상태**. 둘은 독립(answered이면서 hidden 가능).
운영 조치는 이 화면이 아니라 **`/moderator/content`**에서 한다(§8.2).

### 14.1 문의 목록

- **경로**: `/moderator/support` 「문의 답변」 탭 (파일: `apps/web/src/app/moderator/support/page.tsx`)
- **기대 결과**: `status = published`인 문의를 `lastMessageAt DESC`로 카드 나열.
  카테고리 배지 + 진행상태 배지 + 최근 메시지 시각 + 제목 + 본문 3줄. 0건이면 "접수된 문의가 없어요".
- **엣지 케이스**:
  - **페이지네이션 UI가 없다.** 서버 `PAGE_SIZE = 20`인데 화면은 page=1만 호출 →
    **21건째부터 화면에서 접근 불가.**
  - **상태 필터 UI도 없다**(서버 입력은 지원) → `closed` 문의도 계속 목록에 남는다.
  - `hidden`/`deleted` 처리된 문의는 목록에서 사라진다.
- **관련 API**: `bambi.support.listInquiriesByAdmin` (`support.ts` L317, `adminProcedure`)

### 14.2 스레드 열람

- **절차**: 카드의 **대화 열기**(다시 누르면 접기).
- **기대 결과**: 메시지가 `createdAt ASC`로 표시되고 각 메시지에 `운영자`/`회원` 배지 + 시각.
- **엣지 케이스**:
  - 메시지 조회 상한 `MESSAGES_CAP = 100` → 101번째부터 안 보인다.
  - `hidden`/`deleted` 메시지는 **운영자에겐 원문 그대로**, 작성자에게는
    "운영자가 숨긴 메시지입니다."로 치환된다.
  - `status === "deleted"`인 문의는 **운영자에게도** `NOT_FOUND`("문의를 찾을 수 없습니다.").
- **관련 API**: `bambi.support.getInquiry` (`protectedProcedure` + `loadAccessibleInquiry`)

### 14.3 답변 등록 · 상태 자동 전이

- **절차**: 스레드 하단 Textarea에 답변 입력(공백만이면 버튼 비활성) → **답변 보내기**.
- **기대 결과**: 토스트 "답변을 보냈어요." 트랜잭션으로 메시지 insert(`isStaff = true`) +
  문의 `inquiryStatus = "answered"`, `lastMessageAt/updatedAt = now` →
  해당 카드가 목록 맨 위로 올라온다. 회원이 재질문하면 같은 프로시저가 `open`으로 되돌린다.
- **입력 검증**: `body` trim 1~5000.
- **엣지 케이스 / 실패 케이스**:
  - > ⚠ **운영자 답변도 금칙어 검사를 받는다**(`assertNoBannedWords`, `support.ts` L238).
    > 신고 관련 문의에 금칙어를 인용하며 답하면 400 "게시할 수 없는 단어가 포함되어 있습니다: 'X'"로 막힌다.
  - `closed` 문의는 UI가 폼을 숨기고 "종료된 문의라 답변을 남길 수 없어요."를 표시한다
    (직접 호출 시 서버 400).
- **관련 API**: `bambi.support.createInquiryMessage` (`support.ts`, `protectedProcedure` + `loadAccessibleInquiry`)

### 14.4 문의 종료(closed) — **운영자 전용**

- **절차**: 답변을 보내 상태가 **답변완료(`answered`)**가 된 뒤 스레드 하단 **문의 종료**를 누른다.
- **기대 결과**: 토스트 "문의를 종료했어요." → 배지 "종료" + 답변 폼 대신
  "종료된 문의라 답변을 남길 수 없어요." 회원 화면도 같은 문의가 종료 상태로 보인다.
- **엣지 케이스 / 실패 케이스**:
  - **`open`(접수됨) 상태에서는 버튼이 뜨지 않는다.** 직접 호출하면 서버 400
    "답변을 보낸 뒤에 문의를 종료할 수 있습니다."
  - **회원 화면에는 종료 버튼이 없다.** 회원이 직접 호출하면 `FORBIDDEN`
    (`closeInquiry`가 `adminProcedure`). 회원이 닫아버리면 운영자 답변까지 막히던
    문제 때문에 종료 권한을 운영자로 옮겼다.
  - **확인 다이얼로그가 없고 재개(reopen) 프로시저도 없다.** 종료한 문의는 되돌릴 수 없으므로
    회원이 다시 문의를 등록해야 한다.
- **관련 API**: `bambi.support.closeInquiry` (`support.ts`, `adminProcedure`)

### 14.5 FAQ 등록

- **경로**: `/moderator/support` 「FAQ 관리」 탭 → 「새 FAQ 등록」 카드
- **절차**: 카테고리 ToggleGroup(계정·로그인 / 공고·지원 / 결제·광고 / 신고·제재 / 기타, 기본 `account`)
  → 질문 Input(maxLength 300) → 답변 리치 에디터(Tiptap) → **FAQ 등록**.
- **기대 결과**: "FAQ를 등록했어요." 질문·답변 초기화, 목록 갱신.
  `isPublished`는 DB default `true` → **등록 즉시 고객센터 공개 목록에 노출**된다.
- **입력 검증**: question trim 2~300 / answer 1~30,000 + `assertTiptapDoc`(JSON 파싱 실패나
  `type !== "doc"`이면 400) / category enum 5종.
- **엣지 케이스**:
  - **FAQ에는 금칙어 검사가 없다.**
  - 이미지만 넣고 텍스트가 없는 답변도 유효하다.
  - 중복 질문 방지가 없다.
- **관련 API**: `bambi.support.createFaq` (`support.ts` L348, `adminProcedure`)

### 14.6 FAQ 공개 토글 / 삭제

- **절차**: 아코디언에서 질문을 펼쳐 답변 확인 → **공개 중/숨김** Switch, **삭제** 버튼.
- **기대 결과**: Switch → "공개 상태를 바꿨어요."(비공개면 접힌 상태에서도 "비공개" 배지).
  삭제 → "FAQ를 삭제했어요." — **하드 삭제(`db.delete`)라 복구 불가**.
- **엣지 케이스 / 실패 케이스**:
  - > ⚠ **FAQ 삭제에 확인 다이얼로그가 없다.** 클릭 즉시 하드 삭제된다.
  - **FAQ 수정 UI가 없다.** `bambi.support.updateFaq`(`support.ts` L370)는 서버에만 있고 호출부가 없다
    → 오타 수정은 **삭제 후 재등록**이 유일한 경로.
  - **순서(sortOrder) 조작 UI도 없다** — 전부 0이라 실질 등록순 정렬.
  - 존재하지 않는 `faqId`로 `setFaqPublished`/`removeFaq` → 오류 없이 `{ ok: true }`
    (성공 토스트만 뜨고 실제 변화 없음).
  - 운영자 목록은 `includeUnpublished: true`로 비공개 초안까지 본다(일반 회원이 이 값을 보내도
    핸들러가 `role === "admin"`으로 다시 막는다).
  - 공개 측 `/support` FAQ도 `listFaq`가 `protectedProcedure`라 **비로그인은 FAQ조차 볼 수 없다.**
- **관련 API**: `bambi.support.listFaq` / `setFaqPublished`(L387) / `removeFaq`(L399)

### 14.7 문의 메시지 단위 숨김/삭제 — **UI 진입점 없음**

- `bambi.moderation.setInquiryMessageStatusByAdmin`(`moderation.ts` L2261, `adminProcedure`)은
  구현·감사 로그까지 있으나 **웹에서 호출하는 화면이 없다**(리포 grep 0건).
  `getInquiry`의 마스킹 로직은 이 값을 전제로 동작하므로, 검증하려면 DB에서
  `support_inquiry_message.status`를 직접 바꿔 회원 화면을 확인해야 한다.

---

## 15. 팀 합류 승인(팀 초대)

상태 전이(`invitation.status`): `pending → accepted | rejected`.

### 15.1 대기 초대 목록

- **경로**: `/moderator/team-invites` (파일: `apps/web/src/app/moderator/team-invites/page.tsx`)
- **기대 결과**: `status = "pending"`인 초대만 `createdAt DESC`로 **전량** 조회.
  카드에 `업소명(없으면 "이름 없는 업소") · 팀명(없으면 "조직 전체")`,
  초대 대상 이름 · 이메일 · 역할 라벨 · 초대자 · (만료 시) "만료됨".
  팀명 우선순위 = `employerTeamProfile.displayName` → `team.name` → null.
- **엣지 케이스**: 필터·탭·페이지네이션이 전부 없어 pending이 많으면 화면이 길어진다.
- **관련 API**: `bambi.moderation.listPendingTeamInvitations` (`moderation.ts` L1888)

### 15.2 초대 승인

- **선행 조건**: 초대 이메일에 해당하는 **구인자(`bambiProfile.role = "employer"`) 계정이 존재**해야 한다.
  만료되지 않아야 한다(만료면 승인 버튼이 disabled).
- **절차**: **승인** 클릭.
- **기대 결과**(트랜잭션, `SELECT … FOR UPDATE`로 초대 행 잠금):
  1. 만료 검사 통과
  2. `invite.email.toLowerCase()` + `bambiProfile.role = "employer"`로 대상 계정 조회
  3. `member`가 없으면 insert (`role = normalize(invite.role) ?? "staff"`, `status = "active"`,
     `acceptedUserId`)
  4. `invite.teamId`가 있고 `teamMember`가 없으면 insert
  5. `invitation.status = "accepted"`, `acceptedUserId`, `updatedAt`
  6. 감사 로그 `set_team_invitation:accepted`(metadata: organizationId·teamId·invitedEmail·joinedUserId)
- **엣지 케이스 / 실패 케이스**:
  | 조건 | 결과 |
  | --- | --- |
  | 초대 없음 | `NOT_FOUND` |
  | 이미 처리됨(`status !== "pending"`) | **`CONFLICT` "이미 처리된 초대입니다."** |
  | `expiresAt < now` | **`CONFLICT` "만료된 초대입니다."** |
  | 대상이 구직자로 가입했거나 미가입 | `NOT_FOUND` "초대 대상 구인자 계정을 찾을 수 없습니다." |
  - 이미 member인 사용자를 승인하면 중복 생성하지 않고 초대만 마감된다(멱등).
  - 이메일 매칭은 소문자 정확 일치라 `user.email`에 대문자가 있으면 실패한다.
  - 화면이 승인 시 `reason`을 보내지 않아 **감사 로그 사유는 항상 "승인"** 고정.
  - > ⚠ 승인하면 `member`/`teamMember`가 실제로 생성되며 **운영자 화면에 취소 경로가 없다**
    > (멤버 제거는 구인자의 팀 관리 화면에서만 가능).
- **관련 API**: `bambi.moderation.setTeamInvitationStatus` (`moderation.ts` L2152)

### 15.3 초대 반려

- **절차**: 반려 사유 Input에 입력 → **반려**(사유가 비어 있어도 버튼은 활성).
- **기대 결과**: `invitation.status = "rejected"`, **`invitation.rejectionReason`에 사유 저장**.
  감사 로그 `set_team_invitation:rejected`.
- **엣지 케이스**:
  - 사유 미입력 시 화면이 **`"정보 확인 불가"`로 자동 대체**해 전송한다 →
    서버 refine("반려 사유를 입력하세요.", 2자 이상)은 **화면에서는 절대 트리거되지 않는다**
    (API 직접 호출로만 재현).
  - 만료된 초대도 반려는 가능하다.
- **관련 API**: `bambi.moderation.setTeamInvitationStatus`

---


## 16. 권한 경계 테스트

### 16.1 비로그인 접근

- **경로**: `/moderator` 및 하위 전체
- **절차**: 시크릿 창에서 `/moderator`, `/moderator/jobs`, `/moderator/site-settings` 등에 직접 접근.
- **기대 결과**: `enforceModeratorAccess` → `getMyRouting` 실패 → **`/seeker?auth=login`으로 리다이렉트**.
- **관련 API**: `bambi.onboarding.getMyRouting`

### 16.2 구직자(job_seeker) 계정으로 접근

- **절차**: `seeker@bambi.dev` 로그인 후 `/moderator` 접근.
- **기대 결과**: `homePathForRole("job_seeker")` = **`/seeker`로 리다이렉트**
  (`apps/web/src/lib/bambi/home-path.ts`). 인증 오버레이가 아니라 홈으로 보내는 것이 정상.
- **추가 확인**: API를 직접 호출(예: devtools에서 `bambi.moderation.listUsers`)하면
  `requireAdminProfile`이 `FORBIDDEN`("Admin Bambi profile is required for this action.").

### 16.3 구인자(employer) 계정으로 접근

- **절차**: `owner@bambi.dev` 로그인 후 `/moderator` 및 `/moderator/ad-products` 접근.
- **기대 결과**: **`/employer`로 리다이렉트**. 미승인 구인자도 동일하게 `/employer`로 간다.
- **추가 확인**: 운영자 전용 프로시저 직접 호출 시 `FORBIDDEN`.

### 16.4 정지(suspended)된 운영자 계정

- **절차**: admin 계정의 `bambi_profile.status`를 `suspended`로 만든 뒤 `/moderator` 접근.
- **기대 결과**:
  - **화면은 열린다** — `getMyRouting`이 상태를 보지 않고 `role`만 반환하기 때문
    (`onboarding.ts` L564~599).
  - 그러나 목록 조회를 포함한 **모든 운영자 API가 `FORBIDDEN`**("Suspended Bambi accounts cannot
    perform this action.", `requireActiveBambiProfile`) → 빈 화면/에러 상태만 보인다.
- **판정**: 코드상 의도된 이중 방어이지만 UX상 혼란 지점 → 부록 "확인 필요"에 기록.

### 16.5 운영자 등급별 차등

- **결과**: **코드에 존재하지 않는다.** `bambiUserRole`은 `job_seeker|employer|admin` 3종뿐이고,
  `member.role`(`owner`/`admin`/`staff`)은 **조직(업소) 내부 역할**이지 플랫폼 운영자 등급이 아니다
  (`packages/api/src/services/bambi-authz.ts` `ORGANIZATION_ADMIN_ROLES`).
  운영자 콘솔의 모든 기능은 `admin` 하나로 전부 열린다. 등급 경계 테스트는 대상 없음.

### 16.6 게이트 방식이 섞여 있는 구간(회귀 위험)

- `adminProcedure` 미들웨어를 쓰는 프로시저: `getJobPostForAdmin`, `adminUpdateJobPost`,
  `adminDeleteJobPost`, `listUserModerationActions`, `adjustJobPostExposure`,
  `listChatsForModeration`, `getChatMessagesForModeration`, `hardDeleteChatRoom`,
  `setInquiryStatusByAdmin`, `setInquiryMessageStatusByAdmin`, `listModeratableContent`,
  `getModeratableContentDetail`, `purgeWithdrawnAccounts`, `bambi.bannedWords.*`,
  `bambi.crawler.*`, `bambi.siteSettings.update*`, `bambi.support.listInquiriesByAdmin`/FAQ 관리.
- **핸들러 첫 줄에서 `requireAdminProfile`을 직접 부르는** 프로시저: `listReports`, `listJobPosts`,
  `listUsers`, `listReviews`, `setReviewStatus`, `bulkSetReviewStatus`, `setReportStatus`,
  `bulkSetReportStatus`, `setJobPostStatus`, `setJobPostPayment`, `listJobsForPayment`,
  `bulkSetJobPostStatus`, `bulkSetJobPostPayment`, `setUserStatus`, `bulkSetUserStatus`,
  `listPendingEmployers`, `listEmployers`, `listPendingTeamInvitations`, `setChatRoomBlocked`,
  `setTeamInvitationStatus`, `setEmployerVerificationStatus`, `bambi.adProducts.*`(11개 전부),
  `bambi.community.setPostStatusByAdmin` / `setCommentStatusByAdmin`.
- **테스트 의도**: 위 목록의 **모든** 프로시저를 seeker/employer 세션으로 한 번씩 직접 호출해
  403이 나오는지 확인한다(한 줄 누락 시 그대로 뚫리는 구조라 회귀 테스트 가치가 높다).

---

## 부록: 매뉴얼 갱신 필요 항목 / 확인 필요 사항

### A. `docs/manual/moderator-manual.md`가 **누락**한 화면 (코드에는 있음)

매뉴얼 3장은 검수 큐 / 신고 처리 / 업소 승인 / 후기 관리 / 사용자 관리 / 사이트 정보 /
광고 상품 관리 / 공고 관리 8개만 다룬다. 아래는 코드에 존재하는데 매뉴얼에 **한 절도 없는** 화면이다.

| 화면 | 경로 |
| --- | --- |
| 팀 합류 승인 | `/moderator/team-invites` |
| 채팅 관리 | `/moderator/chats` |
| 게시물(커뮤니티 글·댓글·문의 조치) | `/moderator/content` |
| 고객센터(문의 답변·FAQ 관리) | `/moderator/support` |
| 금칙어 | `/moderator/banned-words` |
| 크롤링 | `/moderator/crawler` |
| 결제 관리 | `/moderator/payments` |

### B. 매뉴얼과 코드가 **어긋나는** 지점

1. ~~**[중요] 반려 사유가 전달되지 않는다.**~~ **해소됨.**
   상세 판정 시트(`VerdictReasonSheet`)가 작성한 사유를 `onResolve(item.id, verdict, reason)`로
   그대로 넘기고, `resolveQueue`가 그 값을 `setJobPostStatus`에 싣는다. 승인·보류·반려 세 판정 모두
   선택지 프리필 + 직접 작성이 가능하다(§2.2·§2.3). 다만 구인자 화면에는 여전히
   **공통 반려 안내 문구**가 보인다 — 저장된 사유 원문 노출 여부는 별도 정책 사안이다.
2. **"이용 정지 (7일)"** — 매뉴얼 3.5의 표기. 코드의 `SANCTION_CHOICES`는
   제목 "이용 정지", 설명 "정상으로 복구할 때까지 공고·채팅을 막아요"이고
   **자동 해제 기간이 없다**(주석에 명시). 매뉴얼의 "(7일)"은 사실과 다르다.
3. **"계정 상태 복구는 정지 상태에만 표시"** — 매뉴얼 3.5. 코드는
   `item.status === "active"`가 아니면 표시하므로 **경고 상태에서도 나타난다**
   (`moderator.tsx` L2340).
4. **네비게이션 목록이 낡았다** — 매뉴얼 2장은 "채용정보" 메뉴를 운영자 메뉴로 소개하지만
   현재 `MODERATOR_NAV_ITEMS`에 없다. 더보기 시트 항목도 코드(`MOD_MORE_GROUPS`)와 다르다
   (실제: 공고 관리 / 업소 승인 / 팀 합류 승인 / 광고 상품 / 결제 관리 / 게시물 / 고객센터 /
   금칙어 / 크롤링 / 사이트 정보).
5. **비로그인 리다이렉트 위치** — 매뉴얼 2장은 "시작(환영) 화면으로 이동"이라 하지만
   코드는 `/seeker?auth=login`(구직자 화면 위 인증 오버레이)이다.
6. **검수 큐 위험도 필터** — 매뉴얼 3.1은 "위험: 높음/중간/낮음"을 소개하지만,
   큐 파생 로직은 감지 여부만 보고 `mid`/`low`만 만든다 → **"높은 위험" 필터는 항상 0건**이다.
7. **사이트 정보 항목 누락** — 매뉴얼 3.6은 푸터/처리방침 연락처/무통장 계좌 3개만 다룬다.
   실제 화면에는 **회원 정책(탈퇴 보존기간 + "지금 파기 실행" 버튼)**, **최저시급 표기**,
   **광고 배너 로테이션** 카드가 더 있다. 특히 되돌릴 수 없는 파기 버튼이 매뉴얼에 없다.
8. **광고 상품 관리에 삭제 영향 안내가 없다** — 매뉴얼 3.7은 삭제 버튼의 존재만 적고,
   위치 삭제 시 하위 상품 cascade 삭제 + 공고 `adProductId` NULL화라는 파급을 다루지 않는다.
9. **크롤링 화면 안내문 자체가 코드와 불일치** — "급여·근무시간이 빠진 공고는 목록에서 제외"라고
   쓰여 있으나 실제 노출 조건은 업종·지역·업소명만 요구한다
   (`packages/api/src/services/bambi-job-feed.ts`). 화면 문구 수정 대상.

### C. 확인 필요 사항 (코드만으로 판단 불가)

1. **운영자 등급 구분** — 코드에는 `admin` 단일 역할뿐이다. 등급별 차등 권한 요구가 있다면 미구현이다.
2. **수집 공고의 `job_post` 전환(converted)** — 스키마(`jobPostSource`, `crawledFromId`)는 있지만
   전환을 수행하는 프로시저·화면·스크립트가 없다. 「수집 현황」의 "전환됨"은 항상 0.
   운영자 수기 DB 작업인지 미구현 기능인지 확인 필요.
3. **UI 진입점이 없는 서버 프로시저** (QA 대상 여부 확인 필요)
   - `bambi.support.updateFaq` — FAQ 수정. 현재 오타 수정은 삭제 후 재등록뿐.
   - `bambi.moderation.setInquiryMessageStatusByAdmin` — 문의 스레드 메시지 단위 조치.
     주석은 "문의 상세 화면에서 한다"고 하나 그 화면이 없다.
   - `bambi.moderation.bulkSetReviewStatus` — 후기 일괄 처리.
   - `bambi.adProducts.reorderPlacements` / `reorderProducts` — 카탈로그 순서 변경.
   - `bambi.crawler.getLead` — 수집 공고의 연락처·주소·사업자명 열람.
   - `bambi.moderation.listPendingEmployers` — 업소 승인 화면은 `listEmployers`를 쓴다.
4. **`reviewing` 신고 상태** — 서버 enum·입력 스키마에는 있으나 UI에서 만들거나 구분할 방법이 없다.
   운영 프로세스상 필요한 상태인지 확인 필요.
5. **정지된 admin의 화면 거동** — 레이아웃 가드는 `role`만, API 가드는 `status`까지 본다.
   콘솔은 열리는데 모든 조작이 403이 되는 상태가 의도인지 확인 필요(§16.4).
6. **채팅방 하드삭제의 파급** — cascade로 **그 방에서 작성된 후기까지 삭제**되는데
   다이얼로그 문구에 고지가 없다. 의도인지 확인 필요. 또한 첨부의 **GCS 실제 객체는 지우지 않아**
   고아 파일이 남는다(공고 하드삭제는 지운다 — 처리 방식이 다르다).
7. **비활성 광고 상품 구매 가능** — `resolveJobPostExposure`가 `isActive`를 보지 않아
   비활성 상품 id로 계속 구매가 된다. 의도인지 확인 필요.
8. **사유 최소 길이 불일치** — 커뮤니티 글·댓글 조치는 서버가 1자, UI는 2자를 요구한다.
   기준을 어디에 맞출지 확인 필요.
9. **없는 id에 성공 응답** — `bambi.bannedWords.setActive`/`remove`,
   `bambi.support.setFaqPublished`/`removeFaq`는 0행 매치여도 `{ ok: true }`를 반환해
   "삭제했어요" 토스트가 뜨지만 아무 일도 일어나지 않는다. 의도인지 확인 필요.
10. **목록 상한/페이지네이션 부재** — 업소 승인·후기·고객센터 문의·결제 관리는 페이지네이션이 없고
    서버 기본 상한(50) 또는 화면 첫 페이지(20)만 보인다. 데이터가 상한을 넘으면 **화면에서 접근할 방법이 없다.**
11. **`/moderator/content`의 상태 필터** — 서버는 `status` 입력을 지원하지만 화면이 보내지 않아
    `hidden`/`deleted` 항목만 골라 보는 방법이 없다. `deleted` 문의 복구 동선이 특히 불편하다.
12. **확인 모달이 없는 위험 조작** — 업소 승인(1클릭), 사이트 설정의 "지금 파기 실행",
    FAQ 삭제, 금칙어 단건/선택 삭제, 크롤러 노출 스위치, 업종 지정, 수집 공고·글 복구.
    확인 단계를 추가할지 확인 필요.

## 2026-08-18 탈퇴 채팅·페이지네이션·경고창 회귀 검증

- 신고 채팅의 구직자만 탈퇴, 구인자만 탈퇴, 양쪽 모두 탈퇴한 경우에 기존 이름과 `탈퇴` 표시를 유지하며 전체 메시지와 이미지·PDF 첨부를 열람할 수 있다.
- 수집 공고·수집 커뮤니티·사용자·신고·채팅·출석·후기 등 공용 숫자 입력 페이지네이션은 각 목록별 `/ 총 페이지 수`를 표시한다.
- 사용자 상세의 중간 위치에서 `이용 정지`와 `최근 경고 1회 되돌리기`를 각각 누르면 데스크톱과 모바일의 현재 화면 중앙에 확인창이 표시되고, 문서 하단으로 이동하지 않는다.

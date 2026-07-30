# /seeker 인증 모달 · 인증 선행 회원가입 — 설계

작성일: 2026-07-28
대상 브랜치: `worktree-seeker-auth-modal` → 완료 후 `refactor/login`에 로컬 머지

## 배경

현재 비로그인 방문자는 `proxy.ts` 게이트에 걸려 `/welcome`으로 리다이렉트되고, 거기서
19금 안내 + `AuthScreen`(로그인/회원가입 토글 + 휴대폰 인증 "비회원 둘러보기")을 만난다.
회원가입은 버튼을 누르면 곧바로 폼이 뜨고, 휴대폰 본인인증은 가입 후 계정설정에서
따로 한다.

이를 다음과 같이 바꾼다.

1. 진입점을 `/seeker` 하나로 통일하고, 인증 UI는 마켓플레이스 위의 오버레이 카드로 띄운다.
2. 오버레이 뒤 배경은 블러 처리하되 **푸터는 블러하지 않고 클릭도 가능하게** 둔다.
3. 회원가입은 **본인인증 → 가입 폼** 2단계로 바꾸고, 인증 결과를 프로필에 그대로 반영한다.
4. 19금 안내는 인증 UI에 상시 노출한다.

## 방문자 상태

| 상태 | 판정 | 화면 |
|---|---|---|
| **anon** | 세션 쿠키 없음 + 게스트 토큰 없음/무효 | 마스킹·블러 배경 + 인증 카드(닫기 없음) + 선명한 푸터 |
| **guest** | 게스트 토큰 유효 (본인인증 완료, 계정 없음) | 실제 공고 목록. 헤더의 로그인/회원가입 → 닫을 수 있는 Dialog |
| **member** | 세션 있음 | 현행과 동일 |

`guest`는 `/seeker` 목록만 볼 수 있고 상세·채팅·수다방은 계속 막힌다(현행 유지).

## 1. 라우팅 · 게이트

### 1.1 라우트 제거

- `apps/web/src/app/welcome/page.tsx`, `apps/web/src/app/login/page.tsx` 삭제.
- `apps/web/next.config.ts`에 permanent redirect 2개 추가 (`/welcome` → `/seeker`,
  `/login` → `/seeker`). 외부 북마크·검색엔진 색인 대비용이며, 코드 내부 링크는 전부
  새 경로로 고친다.
- `apps/web/src/app/sitemap.ts`의 `PUBLIC_PATHS`에서 `/welcome` → `/seeker`.

### 1.2 `lib/bambi/resolve-gate.ts`

- `PUBLIC_PREFIXES`에서 `/welcome`, `/login` 제거.
- anon 처리 추가: `pathname === "/seeker"`이면 `next`(오버레이 카드 자체가 게이트),
  그 외 비공개 경로는 `/seeker?auth=signup`으로 리다이렉트.
- `GUEST_BLOCKED_REDIRECT`를 `/seeker?auth=signup&guestBlocked=1`로 변경.
- `/seeker/*` 하위 경로는 anon·guest 모두 계속 차단한다(정확 일치만 통과).

`resolve-gate.test.ts`를 위 규칙에 맞춰 갱신한다.

### 1.3 서버 리다이렉트

`lib/bambi/require-role.ts`의 `redirect("/welcome")` 2곳 → `redirect("/seeker?auth=login")`.

### 1.4 링크 교체

| 위치 | 현재 | 변경 |
|---|---|---|
| `app/employer/{page,me,new,settings,settings/teams,jobs/[id]/edit}` | `href="/login"` | `/seeker?auth=login` |
| `app/employer/{page,me,new}` | `href="/welcome"` | `/seeker?auth=signup` |
| `app/seeker/jobs/[id]/chat/page.tsx:117` | `push("/login")` | `/seeker?auth=login` |
| `components/bambi/require-auth.tsx:34` | `replace("/login")` | `/seeker?auth=login` |
| `components/bambi/responsive-shell.tsx:224` | `"/login"` | `/seeker?auth=login` |
| `components/bambi/guest-blocked-toast.tsx:21` | `replace("/welcome")` | `replace("/seeker")` |
| `screens/seeker-marketplace.tsx:45` | `push("/welcome?signup")` | `/seeker?auth=signup` |

`seeker-chat-role-guard.test.ts:49`의 문자열 단언도 함께 갱신한다.

## 2. anon 화면

### 2.1 분기 지점

`app/seeker/layout.tsx`(서버 컴포넌트)에서 세션 쿠키·게스트 토큰을 읽어 anon을 판정한다.
anon이면 `SeekerAppShell`과 `children`을 렌더하지 않고 `<SeekerAuthGateScreen/>`만 렌더한다.
anon은 게이트상 `/seeker` 외에는 도달할 수 없으므로 `children`을 버려도 안전하며,
분기가 한 곳에 모여 마켓플레이스 컴포넌트를 건드리지 않는다.

판정은 `proxy.ts`와 동일하게 `getSessionCookie` + `verifyGuestToken`을 쓴다. 서버에서
판정하므로 클라이언트 하이드레이션 시 깜빡임이 없다.

### 2.2 레이아웃

```
<div className="flex min-h-[100dvh] flex-col">
  <div className="relative flex-1">
    <div aria-hidden inert
         className="hidden select-none blur-sm md:block">
      배경: 목업 헤더 바 + 마스킹된 공고 카드 그리드
    </div>
    <div className="flex min-h-full items-center justify-center p-4 md:absolute md:inset-0">
      <AuthPanel />
    </div>
  </div>
  <SiteFooter />   {/* 블러 밖 — 선명하고 클릭 가능 */}
</div>
```

- 오버레이는 실제 `Dialog`가 아니라 배경 위 절대배치 카드다. 닫을 수 없는 화면이라
  포커스 트랩·ESC·backdrop이 필요 없고, 그 덕에 "푸터는 선명하고 클릭 가능"이
  추가 장치 없이 성립한다.
- 배경 컨테이너에 네이티브 `inert` 속성을 건다. `pointer-events-none`만으로는 키보드
  탭 이동·스크린리더 접근이 남는데, `inert` 하나가 셋을 다 막는다.
- 모바일(`md` 미만)에서는 배경을 감춘다(`hidden md:block`). 좁은 화면은 카드가 뷰포트를
  거의 채워 블러 배경이 보이지도 않고, 절대배치로 카드가 잘리는 문제도 사라진다.
  카드는 문서 흐름에 배치되어 길어지면 페이지가 스크롤되고, 푸터는 그 아래에 온다.
  (`hidden`은 표시만 감출 뿐 마크업은 남는다 — 배경 데이터는 어차피 §2.3에서 마스킹된
  상태라 문제되지 않는다.)
- 헤더는 배경 안의 목업이며 함께 블러된다(로고는 `AuthPanel` 안에 이미 있다).

### 2.3 배경 데이터 마스킹 — 필수 가드

**블러는 방어 수단이 아니다.** CSS는 클라이언트 측 처리라 devtools에서 클래스를 지우거나
JS를 멈추면 DOM의 텍스트가 그대로 읽힌다. 네트워크 탭에도 원문이 남는다. 따라서
**읽을 수 있는 문자열을 클라이언트로 보내지 않는 것**이 유일한 실효 가드다.

`lib/bambi/auth-backdrop.ts`에 `maskJobsForBackdrop(jobs)`를 둔다. 서버 컴포넌트가
`bambi.jobs.list`(publicProcedure)를 호출해 실제 공고를 받은 뒤, **직렬화 전에** 마스킹한다.

마스킹 규칙:

- 문자열 필드(`title`, `company`, `location`, `region`, `district`, `pay`, `hours`,
  `type`, `pref`, `desc`, `tags[]`)는 원본과 **같은 문자 수**의 고정 전각 글리프로 치환한다.
  길이를 유지해 카드 폭·줄바꿈이 실제와 같아 보이게 하고, 내용은 남기지 않는다.
- 이미지·썸네일 URL은 제거하고 중립 그라디언트 자리표시로 대체한다(썸네일 자체가
  업소를 특정할 수 있다).
- `id` 등 식별자는 배경에 싣지 않는다. 카드 `key`는 배열 인덱스를 쓴다.
- boolean/enum 뱃지도 렌더하지 않는다.

결과적으로 실제 공고 **개수·레이아웃·카드 구성**은 그대로지만 devtools로 블러를
걷어내도 가짜 문자만 보인다. 실제 업소명은 어떤 경로로도 노출되지 않는다.

카드는 기존 `VisualJobCard`를 재사용하되 마스킹된 데이터를 주입한다. 마켓플레이스
화면(`SeekerMarketplaceScreen`)은 클라이언트에서 API를 다시 부르므로 재사용하지 않는다.

**검증:** `auth-backdrop.test.ts` — 마스킹 결과 객체를 깊이 순회해 원본 문자열이 하나도
남지 않음, 문자 길이 보존, URL 필드 제거를 단언한다.

`ponytail:` 배경은 매 anon 방문마다 공개 공고 쿼리 1회를 유발한다. 어차피 전부
마스킹되므로 비용이 문제되면 `lib/bambi/data.ts`의 `JOBS_SEED`를 마스킹해 쓰는 것으로
바꿔도 화면은 동일하다.

## 3. 인증 패널 (`AuthPanel`)

`screens/auth-screen.tsx`의 `AuthScreen`을 `components/bambi/auth/auth-panel.tsx`로
옮기며 개편한다. `embedded` prop은 제거한다(감싸는 쪽이 배치를 책임진다).

### 3.1 상태

```ts
mode: "sign-in" | "sign-up"     // URL ?auth=login|signup 과 동기화
step: "verify" | "form"          // sign-up 에서만 의미 있음
```

- `sign-in`은 단계가 없다 — 바로 폼.
- `sign-up` 진입 시 `step`은 게스트 토큰 유무로 결정한다. 토큰이 있고 그 안에
  `ivId`가 있으면 `"form"`, 없으면 `"verify"`.

### 3.2 회원가입 흐름

```
[회원가입] 클릭
  → step="verify"
      · 19금 안내 (AdultNotice)
      · [휴대폰 본인인증]  ← 기존 PhoneVerifyDialog 재사용
      · [비회원으로 둘러보기] ← 같은 인증창을 띄우고, 성공 시 모달만 닫는다
  → 포트원 인증창 완료
  → onboarding.checkIdentityForSignup({ identityVerificationId })   (§4.1)
      · 미성년 → 차단 안내
      · hasAccount:true → "이미 가입된 계정이 있어요" + [로그인하기] 버튼
      · 통과 → POST /api/guest 로 게스트 쿠키 발급 (gender + ivId)
  → step="form"
      · 닉네임 · 아이디 · 비밀번호(확인) · 이메일 · 가입유형 · 약관 동의
  → authClient.signUp.email
  → createJobSeekerProfile / createEmployerProfile
       ({ gender, identityVerificationId })     (§4.2)
  → recordLegalConsent → clearGuestCookie → /seeker
```

"비회원으로 둘러보기"는 버튼으로 유지하되 **반드시 본인인증을 거친다**. 인증만 마치고
가입을 그만두면 자연히 `guest` 상태가 되어 목록을 볼 수 있다. 즉 두 버튼은 같은 인증을
공유하고 인증 이후 목적지만 다르다.

로그인 흐름은 현행 그대로다(하드 내비게이션 `window.location.assign("/")` 유지 —
Router Cache로 인한 간헐적 재로그인 실패를 막는 기존 이유가 그대로 유효하다).

### 3.3 게스트 토큰 v2

`lib/bambi/guest-token.ts`의 `GuestTokenPayload`에 `ivId?: string`를 추가하고 `v: 2`로
올린다. 새 토큰만 `ivId`를 담고, 기존 `v: 1` 토큰은 계속 유효로 취급한다(성별만 읽힘,
`ivId` 없음 → 가입 시 재인증 요구).

이유: 인증 직후 새로고침해도 폼 단계가 유지된다. `sessionStorage`를 쓰는 것보다 코드가
적고, 토큰은 이미 HMAC 서명되어 있어 위조가 막힌다. `ivId`는 그 자체로 개인정보가
아니며 서버 조회 없이는 아무 의미가 없다.

`guest-token.test.ts`에 v1 하위호환·v2 왕복 케이스를 추가한다.

### 3.4 게스트용 Dialog

`guest` 상태에서 헤더의 로그인/회원가입을 누르면 shadcn `Dialog`로 같은 `AuthPanel`을
띄운다. 이쪽은 닫을 수 있다(뒤에 실제 목록이 있으므로 닫는 게 자연스럽다).
껍데기만 다르고 패널 내용은 anon 화면과 공유한다.

### 3.5 19금 안내

`adult-gate-screen.tsx`의 19 배지 + 법정 문구를 `components/bambi/auth/adult-notice.tsx`로
추출한다. anon 카드와 게스트 Dialog 양쪽 **상단에 항상** 노출한다(로그인 탭 포함).
추출 후 `adult-gate-screen.tsx`는 삭제한다.

## 4. 서버 (`packages/api/src/routers/bambi/onboarding.ts`)

### 4.1 `checkIdentityForSignup` (신규, publicProcedure)

```
input:  { identityVerificationId: string }
output: { gender: "male" | "female" | null, hasAccount: boolean }
```

포트원 단건조회 → `status === "VERIFIED"` 확인 → 생년월일로 만 19세 확인(못 읽으면 거부)
→ CI/DI 해시 계산 → `bambiProfile`에 같은 해시가 있으면 `hasAccount: true`.

계정 없이 호출되므로 `publicProcedure`다. 인증 자체는 이미 과금이 끝난 뒤이고 단건조회는
무료지만, `identityVerificationId`를 임의로 던지는 걸 막기 위해 IP 기준 레이트리밋을
적용한다(`/api/guest`와 동일한 정책).

이 절차는 개인정보를 반환하지 않는다 — 성별과 가입 여부 불리언만 내려간다.

### 4.2 프로필 생성에 인증 결과 반영

- `profileInput`에 `identityVerificationId: z.string().optional()` 추가.
- `createBambiProfile`이 값을 받으면 포트원 조회 결과로
  `phoneNumber` · `birthDate` · `gender` · `ciHash` · `diHash` · `isPhoneVerified: true`를
  함께 기록한다. 성별은 인증 결과가 신뢰 원천이므로 클라이언트가 보낸 값을 덮어쓴다.
- DI(또는 과거 CI) 충돌 시 `CONFLICT` — 패널이 "이미 가입된 계정이 있어요"로 안내하고
  로그인 탭으로 전환할 수 있게 한다. §4.1이 폼 진입 전에 대부분 걸러내지만,
  두 사람이 동시에 가입하는 경합을 위해 최종 방어선으로 남긴다.
- 포트원 미구성 개발 환경에서는 `identityVerificationId` 없이도 가입을 허용한다(현행
  목 흐름 유지). 프로덕션(`PORTONE_API_SECRET` 존재)에서는 필수로 요구한다.

### 4.3 공통 헬퍼 추출

`verifyMyPhone`의 검증 블록(포트원 조회 → VERIFIED 확인 → 성인 확인 → CI/DI 해시 →
충돌 검사)을 `resolveVerifiedIdentity({ apiSecret, identityVerificationId, excludeUserId })`로
추출하고 `verifyMyPhone` · `checkIdentityForSignup` · `createBambiProfile`이 공유한다.
같은 규칙이 세 곳으로 복제되는 것을 막는다.

`verify-phone-duplicate.test.ts`에 가입 경로(§4.2)의 중복 차단 케이스를 추가한다.

## 5. 삭제 · 이동 정리

| 파일 | 처리 |
|---|---|
| `app/welcome/page.tsx` | 삭제 |
| `app/login/page.tsx` | 삭제 |
| `screens/adult-gate-screen.tsx` | 삭제 (문구는 `auth/adult-notice.tsx`로) |
| `screens/auth-screen.tsx` | `auth/auth-panel.tsx`로 이동 + 2단계 개편 |
| `components/bambi/guest-blocked-toast.tsx` | `/seeker`에서 동작하도록 리다이렉트 대상 변경 |

신규 파일:

- `components/bambi/auth/auth-panel.tsx`
- `components/bambi/auth/adult-notice.tsx`
- `components/bambi/auth/seeker-auth-gate-screen.tsx`
- `components/bambi/auth/auth-backdrop.tsx`
- `lib/bambi/auth-backdrop.ts` (+ `.test.ts`)

## 6. 테스트

| 대상 | 내용 |
|---|---|
| `resolve-gate.test.ts` | anon `/seeker` 통과, anon 그 외 → `?auth=signup`, guest 규칙 |
| `auth-backdrop.test.ts` | 마스킹 후 원문 잔존 없음 · 길이 보존 · URL 제거 |
| `guest-token.test.ts` | v1 하위호환, v2 `ivId` 왕복 |
| `verify-phone-duplicate.test.ts` | 가입 경로 DI/CI 중복 차단 |
| `seeker-chat-role-guard.test.ts` | 리다이렉트 문자열 갱신 |

UI 시각 확인은 사용자가 직접 한다(개발서버·스크린샷 없음). 커밋 전 검증은
`pnpm dlx ultracite fix` + 타입체크 + 위 단위 테스트로 한다.

## 7. 명시적으로 하지 않는 것

- 비밀번호 재설정(현재도 "곧 제공" 안내) — 범위 밖.
- 소셜 로그인 추가 — 범위 밖.
- `guest` 권한 범위 변경 — 현행(목록만) 유지.
- 이미 가입한 회원의 재인증 흐름(`account-settings-screen`) — 현행 유지.

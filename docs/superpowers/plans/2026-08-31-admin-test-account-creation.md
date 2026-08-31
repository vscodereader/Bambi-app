# 운영자 가계정 생성 Implementation Plan

> **For agentic workers:** 이 문서는 구현의 정본이다. 아래 범위·인터페이스·검증 항목을 임의로 줄이거나 바꾸지 않는다. 구현 중 문서와 코드가 어긋나면 코드를 임의로 진행하지 말고 문서를 먼저 갱신하며, 사용자 판단이 필요한 변경이면 구현 전에 질문한다. 체크박스는 해당 구현과 검증이 실제로 끝난 뒤에만 완료 처리한다.

**Goal:** 운영자가 `회원 관리 > 계정 생성`에서 이름(미저장), 닉네임, 생년월일, 성별, 직업(구직자/구인자), 로그인 아이디, 비밀번호, 010 가번호를 입력하면 실제 아이디 로그인이 가능하고 기존 역할·성별·본인인증 정책이 그대로 적용되는 가계정을 즉시 생성한다. 이 계정은 실제 PortOne 본인인증이나 기존 CI·DI 삭제 없이 테스트에 사용할 수 있어야 한다.

**Base / Branch:** 최신 `origin/develop`의 `2204d2aab954713f1b72f3c720cfef8b22ba2647`에서 `feat/admin-test-account-creation` 브랜치를 생성했다. 구현 완료 전 최신 `develop`을 다시 반영하고 충돌 및 마이그레이션 이력을 재확인한다.

**Tech Stack:** Next.js 16 App Router, React 19, shadcn/base-ui, Tailwind CSS v4, oRPC, Better Auth username/email-password, Drizzle ORM, PostgreSQL, Zod, Vitest.

---

## 1. 확정 요구사항

1. 운영자 내비게이션의 `회원 관리` 아래에 `계정 생성` 메뉴와 `/moderator/users/create` 페이지를 추가한다.
2. 입력 항목은 다음과 같다.
   - 이름: 화면에서 입력·검증하지만 서버로 전송하거나 DB에 저장하지 않는다.
   - 닉네임: `user.name`에 저장하고 서비스의 표시 이름으로 사용한다.
   - 생년월일: 유효한 달력 날짜이자 만 19세 이상이어야 하며 `bambi_profile.birth_date`에 기존 형식 `YYYYMMDD`로 저장한다.
   - 성별: `male | female` 중 하나를 선택하고 `bambi_profile.gender`에 저장한다.
   - 직업: 화면 라벨은 `구직자 | 구인자`, 저장 역할은 `job_seeker | employer`만 허용한다.
   - ID: 기존 로그인 아이디 규칙과 정규화를 그대로 적용해 `user.login_id`와 `user.login_id_display`에 저장한다.
   - PW: 기존 Better Auth의 password hasher를 사용해 credential account에 해시만 저장한다. 비밀번호 확인 입력도 함께 제공해 오타를 막는다.
   - 가번호: `010-4자리-4자리`만 허용한다. 화면은 하이픈 형식을 사용하고 DB에는 기존 인증 번호 관례에 맞춘 숫자 11자리 정규형을 저장한다.
3. 생성한 계정은 `bambi_profile.status='active'`, `is_phone_verified=true` 상태여야 한다.
4. 실제 CI·DI 대신 계정마다 충돌하지 않는 가계정 전용 원문을 서버에서 만들고, 기존 `hashIdentityValue`로 SHA-256 해시한 값만 `ci_hash`, `di_hash`에 저장한다. 가상 원문은 응답·로그·DB 어디에도 저장하지 않는다.
5. 내부 이메일은 운영자가 입력하지 않는다. 서버가 계정마다 고유하고 메일 발송에 쓰이지 않는 `.invalid` 예약 도메인의 주소를 생성해 `user.email`의 not-null/unique 계약만 만족시킨다.
6. 생성한 계정은 기존 로그인 화면에서 입력한 ID/PW로 실제 로그인할 수 있어야 한다.
7. 생성한 계정에는 기존 서버 정책을 우회하는 별도 플래그나 예외 분기를 추가하지 않는다. `role`, `gender`, `status`, `isPhoneVerified`, 조직·광고 상태를 읽는 기존 가드가 그대로 판정한다.
8. 구인자 가계정에는 조직, 멤버십, 업체 프로필, 팀, 업체 승인 상태, 광고 캠페인을 자동 생성하지 않는다. 로그인 후 기존 업체 정보 제출과 운영자 승인 흐름을 그대로 테스트한다.
9. 프로필 사진은 생성하지 않는다. 계정 사용자가 로그인 후 기존 설정에서 직접 등록한다.
10. 실제 PortOne 인증 건(`bambi_identity_verification`)과 실제 인증 로그(`bambi_identity_verification_log`)는 만들거나 변조하지 않는다. 가계정 생성은 포트원 인증을 받았다고 위조하는 감사 로그가 아니라, 테스트용 프로필 상태를 만드는 운영자 기능이다.
11. 생성 성공/실패 때문에 현재 로그인한 운영자 세션이 새 계정 세션으로 바뀌어서는 안 된다.
12. 사용자가 직접 커밋·푸시한다. 구현자는 커밋·푸시·머지를 수행하지 않고, 완료 후 PowerShell에서 한글이 깨지지 않는 명령과 커밋 메시지 파일 방식을 안내한다. `--force`는 사용하지 않는다.
13. 가계정 전용 삭제·일괄 정리·필터·배지는 이번 범위에 포함하지 않는다. 생성 계정은 `.invalid` 내부 이메일과 `create_test_account` 감사 기록으로 식별하며, 필요 시 기존 사용자 관리의 제재·탈퇴 흐름으로 관리한다. 테스트 계정이 자동 만료되거나 자동 삭제되지 않는다는 점을 운영자 안내와 매뉴얼에 명시한다.
14. 운영자가 별도 생성 사유나 메모를 입력하는 기능은 이번 범위에 포함하지 않는다. 감사 사유는 고정 문구를 사용하고 생성 운영자는 `adminUserId`로 추적한다.

---

## 2. 현재 코드에서 재사용할 정본

### 2.1 인증·계정

- `packages/auth/src/login-id.ts`
  - `normalizeLoginId`
  - `getLoginIdErrorMessage`
  - 기존 3~30자 및 허용 문자 규칙
- `packages/auth/src/index.ts`
  - Better Auth email/password와 username 플러그인 설정
  - Better Auth password hasher (`auth.$context.password.hash`)
  - 탈퇴 계정 로그인 차단 등 기존 세션 훅
- `packages/db/src/schema/auth.ts`
  - `user`: 닉네임, 내부 이메일, 로그인 아이디
  - `account`: `provider_id='credential'`, 비밀번호 해시

직접 평문 비밀번호를 DB에 넣거나 별도 해시 알고리즘을 만들지 않는다. 생성 결과는 Better Auth가 기존 로그인에서 기대하는 credential account 계약을 정확히 만족해야 한다.

### 2.2 프로필·본인인증 상태

- `packages/db/src/schema/bambi.ts`의 기존 `bambiProfile`
  - `role`, `status`, `isPhoneVerified`, `phoneNumber`, `gender`, `birthDate`, `ciHash`, `diHash`
- `packages/api/src/services/portone-identity.ts`
  - `hashIdentityValue`
- 기존 성인 판정 함수
  - 가입·목 인증에서 사용하는 `isAdultBirth8` 또는 동일한 공용 정책을 재사용한다.

이번 기능을 위해 프로필 컬럼이나 가계정 표시 컬럼을 추가하지 않는다. 따라서 Drizzle migration도 만들지 않는다. 구현 직전 최신 `packages/db/src/migrations/`를 다시 확인하되, 스키마 변경이 생기지 않는 한 migration 파일을 생성하지 않는다.

### 2.3 권한 정책

- `packages/api/src/services/bambi-authz.ts`: 활성 계정, 역할, 구인자 조직 승인 등 서버 권한
- `packages/api/src/services/bambi-community-access.ts`: 수다방 접근
- `packages/api/src/routers/bambi/chats.ts`: 구직자 채팅 시작, 구인자 면접/연락처 요청
- `packages/api/src/routers/bambi/jobs.ts`: 구인자 조직·승인·공고 작성 범위
- `packages/api/src/routers/bambi/reviews.ts`: 구직자 후기 작성
- `packages/api/src/routers/bambi/community.ts`: 커뮤니티 읽기·작성 권한

가계정 전용 권한 코드를 만들지 않는다. 아래 결과가 기존 코드에서 자연스럽게 나와야 한다.

| 생성 조합 | 생성 직후 적용되는 핵심 정책 |
| --- | --- |
| 여성 구직자 | 인증된 활성 구직자. 일반 수다방 게시판 입장·작성 가능, 공고에서 채팅 시작 가능 |
| 남성 구직자 | 인증된 활성 구직자. 수다방 진입은 가능하지만 최신 서버 정책대로 `notice`와 `secret` 게시판만 이용 가능하고 다른 게시판은 `FORBIDDEN` |
| 여성 구인자 | 인증된 활성 구인자. 성별로 수다방을 열지 않으며, 광고 자격이 없으므로 수다방 차단. 업체 정보 제출부터 진행 |
| 남성 구인자 | 여성 구인자와 동일. 구인자는 성별이 아니라 조직·승인·광고 상태로 권한 판정 |

구인자는 조직이 없으므로 생성 직후 공고 등록이 불가능한 것이 정상이다. 기존 업체 정보 제출 → 운영자 승인 이후 기존 공고 작성 정책을 따른다.

최신 `develop`에는 남성 구직자의 보드 제한을 도입한 코드·단위 테스트와, 아직 “남성 구직자 전체 차단”이라고 적힌 오래된 매뉴얼·라우터 테스트가 함께 존재한다. 이번 작업은 실행 코드의 최신 정책(`notice`, `secret` 허용)을 정본으로 삼고, 관련 테스트 플로우와 충돌하는 회귀 테스트를 함께 최신화한다. 가계정 기능이 이 정책을 새로 만들거나 별도 우회하지 않는다.

### 2.4 UI

- `apps/web/src/lib/bambi/moderator-navigation.ts`: 데스크톱과 모바일 운영자 메뉴의 단일 정본
- `@bambi-app/ui/components`의 `Button`, `Card`, `Input`, `Label`, `Select`, `Alert`, `Separator` 등 기존 shadcn 컴포넌트
- `apps/web/src/components/bambi/auth/auth-fields.tsx`와 `auth-panel.tsx`: 닉네임·아이디·비밀번호 검증과 문구 관례
- `apps/web/src/components/bambi/mock-phone-verify-dialog.tsx`: 생년월일·성별 입력 패턴과 성인 검증 관례
- 기존 `formatPhone` 등 전화번호 표시 유틸

페이지는 실서비스 운영자 라우트이므로 인라인 style, raw 색상, 신규 CSS 파일, 임의 HTML 컨트롤을 만들지 않는다. `apps/web/CLAUDE.md`의 shadcn + Tailwind 규칙을 따른다.

입력 전화번호 정규화는 표시 전용 `formatPhone`에 맡기지 않는다. 신규 가계정 서비스의 순수 함수가 하이픈을 제거하고 `^010\d{8}$`를 검사하며, 웹은 같은 정규형 계약을 사용해 입력 오류를 미리 안내한다. 저장값을 보여줄 때만 기존 `formatPhone`을 재사용한다.

---

## 3. API 설계

### 3.1 프로시저

`packages/api/src/routers/bambi/moderation.ts`의 기존 `moderationRouter`에 다음 운영자 전용 mutation을 추가한다.

```ts
createTestAccount: adminProcedure
  .input(createTestAccountInput)
  .handler(async ({ context, input }) => ...)
```

이름은 서버 input에 넣지 않는다. 이름은 저장하지 않는다는 사용자 결정에 따라 브라우저 로컬 상태에서만 검증하고 mutation payload에서 제외한다. 불필요한 개인정보를 네트워크·서버 로그에 남기지 않는다.

```ts
const createTestAccountInput = z.object({
  birthDate: z.string(),          // 정규화 전/후 계약은 아래 검증 규칙 참조
  gender: z.enum(["male", "female"]),
  loginId: z.string(),
  nickname: z.string(),
  password: z.string(),
  phoneNumber: z.string(),
  role: z.enum(["job_seeker", "employer"]),
});

type CreateTestAccountResult = {
  userId: string;
  loginId: string;
  nickname: string;
  role: "job_seeker" | "employer";
  isPhoneVerified: true;
};
```

응답에는 비밀번호, 내부 이메일, CI/DI 해시, 가상 식별 원문을 포함하지 않는다.

### 3.2 서버 검증

서버는 클라이언트 검증을 신뢰하지 않고 다음을 다시 검사한다.

1. 호출자는 `adminProcedure`와 기존 `requireAdminProfile` 계약을 통과한 운영자여야 한다.
2. `nickname`
   - 현재 회원가입에서 명시적으로 강제하는 것과 같이 trim 후 2자 이상을 적용한다. 저장소에 없는 최대 길이를 임의의 새 정책으로 추가하지 않는다.
   - 기존 금칙어·예약 표시명 정책을 `assertDisplayNameAllowed(trimmedNickname, { isAdmin: false })`로 검사한다. 호출자는 운영자지만 생성 대상은 일반 구직자·구인자이므로 운영자 예외를 적용하지 않는다.
3. `loginId`
   - `getLoginIdErrorMessage`로 기존 규칙 검사
   - `normalizeLoginId`로 소문자 정규화
   - 정규화된 `user.login_id` 중복 검사
4. `password`
   - 현재 웹 회원가입과 같은 8자 이상을 검사하고, 별도 공용 상수로 존재하지 않는 128자 상한을 새 정책으로 만들지 않는다.
   - 해시는 반드시 현재 Better Auth context의 password hasher가 처리한다.
   - 서버는 비밀번호 확인 값을 받지 않는다. 확인 일치는 클라이언트에서 검사하고 실제 비밀번호 하나만 전송한다.
5. `birthDate`
   - `YYYYMMDD`로 정규화
   - 존재하는 달력 날짜인지 검사(예: 20260231 거부)
   - 기존 성인 정책과 동일하게 만 19세 미만 거부
6. `phoneNumber`
   - 화면 입력은 `010-0000-0000` 형식을 안내한다.
   - 클라이언트와 서버가 하이픈을 제거한 뒤 정확히 `^010\d{8}$`인지 검사한다.
   - DB에는 숫자 11자리로 저장
7. `role`
   - `job_seeker | employer`만 허용
   - `admin`, `legal_advisor`, `guest` 생성 금지
8. 같은 가번호의 재사용은 새 제약으로 막지 않는다. 현행 DB와 실인증 정책의 사람 식별 정본은 전화번호 단독이 아니라 CI/DI이므로 기존 계약을 유지한다.

### 3.3 내부 이메일

- 서버에서 `randomUUID()`를 사용해 로컬 파트를 만든다.
- RFC 예약 `.invalid` 도메인을 사용해 실제 발송 가능한 주소로 오인하지 않게 한다.
- 예시 형식은 구현 상수로 관리하되 응답/UI에는 노출하지 않는다.
- DB unique 충돌이 사실상 불가능해야 하며, 그래도 충돌하면 전체 트랜잭션이 실패한다.
- 로그인은 내부 이메일이 아니라 입력한 ID와 PW로 검증한다.
- 현재 로그인 화면은 이메일 로그인도 지원하므로 내부 이메일과 PW를 아는 경우 기술적으로 이메일 로그인이 가능하다. 이를 막기 위한 별도 인증 분기는 만들지 않으며 정상 사용 경로는 ID/PW로 안내한다.
- 내부 이메일은 기존 운영자 사용자 목록·상세의 이메일 열에 표시될 수 있다. 계정 생성 성공 화면에는 노출하지 않고, 메일 발송·본인인증 기반 계정 찾기에는 사용하지 않는다.

### 3.4 가상 CI·DI

각 계정 생성 요청마다 CI용 UUID와 DI용 UUID를 각각 새로 만든다. 같은 원문을 두 축에 재사용하지 않는다.

```ts
const ciHash = await hashIdentityValue(`admin-test-ci:${randomUUID()}`);
const diHash = await hashIdentityValue(`admin-test-di:${randomUUID()}`);
```

위 접두사는 DB에 저장되는 값이 아니라 해시 입력의 도메인 분리용이다. 실제 PortOne CI/DI와 동일한 원문 공간을 공유하지 않고, UUID 엔트로피와 기존 SHA-256 해시를 함께 사용한다. 다음을 지킨다.

- `ciHash !== diHash`
- 계정마다 이전 가계정과 다른 해시
- 실제 `bambi_identity_verification` 발급/소진 행 없음
- 실제 `bambi_identity_verification_log` 행 없음
- 실제 CI/DI 삭제나 변경 없음
- 다른 계정과 unique 충돌 시 전체 생성 실패

가계정의 아이디 찾기·비밀번호 찾기는 실제 명의 PortOne CI/DI와 연결되지 않으므로 지원되지 않는다. ID/PW로 로그인해 테스트하는 계정이라는 점을 UI 안내와 운영자 매뉴얼에 명시한다.

### 3.5 원자적 생성

비밀번호 해시는 DB 트랜잭션 전에 기존 Better Auth hasher로 계산한다. 이후 아래 네 행을 하나의 `db.transaction`에서 생성한다.

1. `user`
   - 생성 UUID
   - `name=trimmedNickname`
   - `email=generatedInternalEmail`
   - `emailVerified=false`
   - `login_id=normalizedLoginId`
   - `login_id_display=normalizedLoginId`
2. `account`
   - 생성 UUID
   - `userId=<생성 user id>`
   - `accountId=<생성 user id>`
   - `providerId='credential'`
   - `password=<Better Auth hash>`
   - `createdAt=<동일한 생성 시각>`
   - `updatedAt=<동일한 생성 시각>` — 현재 스키마의 `account.updatedAt`은 not-null이고 insert default가 없으므로 반드시 명시한다.
3. `bambi_profile`
   - `userId=<생성 user id>`
   - 선택 역할·성별·생년월일
   - 정규화된 가번호
   - `status='active'`
   - `isPhoneVerified=true`
   - 가상 `ciHash`, `diHash`
   - `isAdvertiser=false`
4. `admin_moderation_action`
   - `adminUserId=<호출 운영자>`
   - `targetType='user'`
   - `targetId=<생성 user id>`
   - `action='create_test_account'`
   - `reason='운영자 가계정 생성'`
   - metadata에는 역할·성별·로그인 아이디만 기록하고 비밀번호·전화번호·생년월일·내부 이메일·CI/DI는 넣지 않는다.

어느 insert든 실패하면 네 행 모두 롤백한다. 공개 `signUp.email`을 서버에서 호출한 뒤 보상 삭제하는 방식은 사용하지 않는다. 그 방식은 auth 계정 생성과 프로필 생성 사이에 프로세스가 종료되면 프로필 없는 반쪽 계정을 남길 수 있고, 호출 중 운영자 세션에 새 가입 세션을 결합할 위험이 있기 때문이다.

Better Auth 테이블을 직접 채우는 부분은 임의 구현이 아니다. 기존 `account-recovery.ts`가 사용하는 `auth.$context.password.hash`와 credential account 계약(`providerId='credential'`, `accountId=userId`)을 그대로 따르고, 실제 `auth.api.signInUsername` 통합 테스트로 호환성을 고정한다.

사전 중복 조회만 신뢰하지 않는다. 같은 로그인 아이디의 동시 생성은 DB unique가 최종 방어하며, 해당 제약 오류도 기존 `LOGIN_ID_TAKEN_MESSAGE`를 사용하는 안전한 `BAD_REQUEST`로 변환한다. 내부 이메일·CI·DI 등 다른 예상 밖 unique 오류는 DB 원문을 숨긴 채 안전한 서버 오류로 변환하고 전체 트랜잭션을 롤백한다.

### 3.6 오류 계약

화면은 서버 메시지를 그대로 표시할 수 있도록 한국어 메시지를 정의한다.

| 경우 | 코드 | 메시지 원칙 |
| --- | --- | --- |
| 비운영자 호출 | `FORBIDDEN` | 기존 adminProcedure 메시지 |
| 로그인 아이디 형식 오류 | `BAD_REQUEST` | 기존 `getLoginIdErrorMessage` 결과 |
| 로그인 아이디 중복 | `BAD_REQUEST` | 기존 `LOGIN_ID_TAKEN_MESSAGE` 그대로 재사용. 사전 조회와 DB unique 경쟁 모두 같은 응답 |
| 닉네임 금칙어/예약어 | `BAD_REQUEST` | 기존 표시명 정책 메시지 |
| 유효하지 않은 생년월일 | `BAD_REQUEST` | 올바른 생년월일 안내 |
| 미성년 | `FORBIDDEN` | 기존 19세 미만 안내 문구 재사용 |
| 가번호 형식 오류 | `BAD_REQUEST` | `010-0000-0000 형식` 안내 |
| 예상하지 못한 unique/DB 오류 | `INTERNAL_SERVER_ERROR` 또는 안전한 변환 | 비밀번호·내부 식별값·DB 원문을 노출하지 않음 |

---

## 4. UI 설계

### 4.1 내비게이션

`apps/web/src/lib/bambi/moderator-navigation.ts`의 `회원 관리.items`에 다음 항목을 `사용자` 바로 다음에 추가한다.

```ts
{ href: "/moderator/users/create", label: "계정 생성" }
```

데스크톱과 모바일 더보기는 같은 `MODERATOR_NAV_ITEMS`에서 파생되므로 별도 모바일 목록을 수정하거나 복제하지 않는다. 내비게이션 동등성 테스트가 있으면 새 목적지가 양쪽에 자동 반영되는지 함께 고정한다.

### 4.2 페이지

신규 파일:

- `apps/web/src/app/moderator/users/create/page.tsx`

페이지 제목은 `계정 생성`, 설명은 “실제 본인인증 없이 역할·성별별 기능을 확인할 수 있는 가계정을 만듭니다.”로 한다. 실제 회원 계정과 혼동하지 않도록 다음 안내를 `Alert`로 표시한다.

- 실제 PortOne 본인인증을 수행하지 않는 테스트 계정
- 실제 CI/DI를 삭제하지 않아도 됨
- ID/PW 로그인용이며 본인인증 기반 계정 찾기/비밀번호 찾기는 사용할 수 없음
- 구인자는 로그인 후 업체 정보 제출과 운영자 승인을 별도로 거쳐야 함
- 이름은 저장되지 않고 닉네임만 서비스에 표시됨
- 가계정은 자동 만료·자동 삭제되지 않으며 기존 사용자 관리에서 관리함

### 4.3 폼 구성

기존 운영자 폼 밀도와 반응형 패턴을 따른다.

1. `이름`
   - required
   - trim 후 비어 있지 않은지만 클라이언트에서 검사한다. 저장되지 않는 값에 임의의 길이·문자 정책을 새로 만들지 않는다.
   - 브라우저 로컬 상태에만 존재
   - payload에 포함하지 않음
   - 도움말: `이 입력값은 저장되지 않습니다.`
2. `닉네임`
   - required
   - 기존 회원가입과 같은 검증
   - 도움말: `서비스와 게시글에 표시되는 이름입니다.`
3. `생년월일`
   - 기본 입력은 숫자 키패드가 열리는 `YYYYMMDD` 8자리 텍스트 입력으로 두고, 옆 달력 버튼은 브라우저 기본 date picker를 연다.
   - 달력 선택값과 직접 입력값은 공용 `formatTestAccountBirthInput`으로 같은 8자리 값에 수렴한다.
   - 서버에는 `YYYYMMDD`
   - 만 19세 이상 안내
4. `성별`
   - 기존 `ToggleGroup` 또는 `Select` 재사용
   - 남성/여성 단일 선택
5. `직업`
   - `Select`
   - `구직자(job_seeker)`, `구인자(employer)`
6. `ID`
   - 기존 로그인 아이디 규칙과 안내 재사용
   - 입력 중 공용 검증 메시지 표시
7. `PW`, `PW 확인`
   - `type='password'`, `autoComplete='new-password'`
   - 현재 회원가입과 같은 8자 이상
   - 두 값 일치 검사
8. `가번호`
   - placeholder `010-0000-0000`
   - 클라이언트가 하이픈 제거 후 `^010\d{8}$`를 검사하고, 서버가 같은 계약을 다시 검사
   - DB에는 숫자 11자리로 저장하고 조회 화면에서만 기존 `formatPhone`으로 표시

제출 중 버튼을 비활성화해 중복 요청을 막는다. 성공하면:

- 성공 toast 또는 `Alert`로 `가계정을 생성했습니다.` 표시
- 생성된 닉네임, ID, 역할, 인증 완료 상태만 요약
- 비밀번호는 다시 표시하지 않음
- PW와 PW 확인은 성공 즉시 비우고, 나머지 폼도 새 계정 생성이 가능하도록 초기화하되 성공 요약은 사용자가 확인할 때까지 유지
- 운영자 세션과 현재 페이지는 유지

실패하면 입력값을 유지하고 서버 메시지를 폼 상단 `Alert`에 표시한다. 비밀번호는 브라우저 상태에 남더라도 로그·toast·URL에 출력하지 않는다.

### 4.4 라우트/상태 갱신

- mutation 성공 후 운영자 사용자 목록 쿼리를 invalidate한다.
- `/moderator/users`로 이동했을 때 새 계정이 최신순 목록에 나타나야 한다.
- 새 계정 상세에서는 기존 데이터만으로 닉네임, ID, 역할, 인증 번호, 생년월일, 성별, `active` 상태를 확인할 수 있어야 한다.
- 내부 이메일은 기존 사용자 관리 테이블과 계정 상세의 email 항목에 `.invalid` 주소 그대로 표시한다. 기존 목록·상세의 이메일 렌더링은 바꾸지 않으며 계정 생성 성공 화면에서만 노출하지 않는다.

---

## 5. 파일 변경 계획

### Create

- `docs/superpowers/plans/2026-08-31-admin-test-account-creation.md`
- `packages/api/test/routers/bambi/moderation-test-account.test.ts`
- `packages/api/src/services/bambi-test-account.ts`
- `packages/api/test/services/bambi-test-account.test.ts`
- `apps/web/src/app/moderator/users/create/page.tsx`
- `apps/web/src/app/moderator/users/create/page.test.ts`
- `apps/web/src/app/bambi/local-editor-media/route.ts`
- `apps/web/src/lib/bambi/moderation-labels.test.ts`

### Modify

- `packages/api/src/routers/bambi/moderation.ts`
  - input schema, `bambi-test-account` 서비스 호출, `createTestAccount` mutation
- `apps/web/src/lib/bambi/moderator-navigation.ts`
  - 회원 관리 아래 계정 생성 목적지
- `apps/web/src/lib/bambi/moderation-labels.ts`
  - `create_test_account` 감사 액션을 `가계정 생성`으로 표시
- `packages/api/src/services/bambi-storage.ts`
  - 개발 환경 본문 이미지는 운영용 GCS 이름이 있어도 로컬 원본 PUT/GET 경로를 사용
- `packages/api/test/services/bambi-storage.test.ts`
  - 개발 환경 editor media 인텐트의 로컬 URL 회귀 테스트
- `apps/web/src/lib/bambi-job-form.ts`
  - 로컬 editor media URL을 허용된 업로드 대상으로 재사용
- `apps/web/src/components/bambi/community-editor.tsx`
  - 로컬 업로드 응답은 같은 로컬 GET URL을 본문 이미지 src로 사용
- `packages/api/test/routers/bambi/community.test.ts`
  - 남성 구직자 전체 차단을 기대하는 오래된 회귀 테스트를 최신 `notice`·`secret` 보드 범위로 갱신
- `docs/manual/moderator-manual.md`
  - 계정 생성 절차, 입력값 저장 여부, 역할별 기대 결과, 한계
- `docs/test-flows/moderator-test-flow.md`
  - 생성·중복·미성년·가번호·로그인·권한 조합 검증
- `docs/manual/seeker-manual.md`
  - 남성 구직자 전체 차단이라는 오래된 설명을 최신 보드 범위로 갱신
- `docs/test-flows/seeker-test-flow.md`
  - 남성 구직자 테스트 계정·수다방 정책 표를 최신 보드 범위로 갱신

### No schema change

- `packages/db/src/schema/*` 수정 없음
- `packages/db/src/migrations/*` 신규 파일 없음
- `db:push` 사용 없음

---

## 6. 테스트 전략

### 6.1 API 통합 테스트

`packages/api/test/routers/bambi/moderation-test-account.test.ts`에서 테스트 DB를 사용해 다음을 검증한다.

1. 운영자가 여성 구직자를 생성하면:
   - `user.name`은 닉네임
   - 로그인 아이디 두 컬럼은 정규화된 값
   - 내부 이메일은 unique이며 `.invalid`
   - credential account가 존재하고 비밀번호가 평문이 아님
   - 프로필은 `job_seeker`, `female`, `active`, 인증 완료, 숫자 11자리 번호, 생년월일 저장
   - CI/DI 해시는 64자리 SHA-256이며 서로 다름
   - 실제 인증 발급/로그 테이블에는 행이 생기지 않음
   - 감사 로그에는 민감정보 없이 `create_test_account` 기록
   - credential account의 `createdAt`, `updatedAt`이 모두 채워짐
2. 생성 결과로 `auth.api.signInUsername`을 호출하면 입력한 ID/PW 로그인이 성공한다.
3. 틀린 비밀번호 로그인은 실패한다.
4. 같은 ID 두 번째 생성은 기존 `LOGIN_ID_TAKEN_MESSAGE`의 `BAD_REQUEST`로 거부되고 새 `user/account/profile` 찌꺼기가 남지 않는다. 사전 조회를 통과한 동시 생성 경쟁의 DB unique도 같은 메시지로 변환되는 경계를 검증한다.
5. 잘못된 ID, 금지 닉네임, 19세 미만, 존재하지 않는 날짜, `010`이 아닌 번호, 자릿수 오류를 각각 거부한다.
6. 비운영자 호출은 거부되고 아무 행도 생기지 않는다.
7. 역할은 구직자/구인자만 허용한다.
8. 두 가계정을 같은 입력 정보로 연속 생성하되 ID만 다르게 하면 가상 CI/DI가 각각 고유하다.
9. 서비스가 받는 transaction executor 또는 테스트 전용 dependency 경계를 이용해 마지막 감사 로그 insert에서 의도적으로 실패를 발생시키고, `user`, `account`, `bambi_profile`, 감사 로그가 모두 남지 않는지 반드시 검증한다. 중복 ID 테스트만으로 이 검증을 대신하지 않는다.
10. 구인자 생성 시 조직·member·업체 프로필이 자동 생성되지 않는다.
11. 이미 CI/DI 해시가 저장된 기존 회원 fixture를 만든 뒤 가계정을 생성하고, 기존 회원의 두 해시가 전후 동일한지 확인한다.
12. 생성 전후 실제 인증 티켓·인증 로그 테이블 행 수가 증가하지 않는지 확인한다.

테스트가 만든 사용자·세션·계정·프로필·감사 로그는 기존 테스트 정리 관례에 따라 삭제한다. 개발/운영 DB에서 테스트하지 않는다.

### 6.2 기존 권한 회귀 테스트

새 가계정 플래그 분기를 만들지 않으므로 기존 정책 테스트를 재실행한다. 추가 테스트는 생성된 프로필을 기존 판정 함수에 연결해 다음을 고정한다.

- 여성 구직자 `resolveCommunityAccess().canAccess === true`이며 일반 게시판 접근 가능
- 남성 구직자 `resolveCommunityAccess().canAccess === true`이지만 `notice`, `secret`만 접근 가능하고 다른 게시판은 기존 보드 범위 가드가 거부
- 여성/남성 구인자 모두 광고 없음(`isAdvertiser=false`)이면 `false`
- 구인자 프로필 생성 뒤 `onboarding.getMyRouting`이 `role: "employer"`, `employerApprovalStatus: "none"`을 반환하는지 확인
- 생성된 구직자는 기존 `requireActiveBambiProfile`/채팅 시작 전제에서 인증 완료로 판정

정책 자체를 새 테스트에서 복제 구현하지 말고 기존 helper/router를 호출한다.

### 6.3 웹 테스트

1. `MODERATOR_NAV_ITEMS`의 회원 관리에 `/moderator/users/create`가 있고 모바일 그룹에도 같은 목적지가 파생된다.
2. 폼에 이름, 닉네임, 생년월일, 성별, 직업, ID, PW, PW 확인, 가번호가 모두 렌더된다.
   생년월일은 숫자 8자리 직접 입력과 달력 선택을 모두 제공하고 같은 payload로 수렴한다.
3. 이름은 필수로 검증되지만 mutation payload에는 포함되지 않는다.
4. PW 불일치, 잘못된 가번호, 미입력 선택값에서 제출되지 않는다.
5. 직업 라벨이 구직자/구인자로 보이고 서버 값이 정확하다.
6. 제출 중 중복 클릭이 차단된다.
7. 성공 시 비밀번호·내부 이메일·CI/DI가 화면에 노출되지 않는다.
8. 서버 오류 시 기존 입력이 유지되고 오류 문구가 보인다.
9. 성공 직후 PW와 PW 확인 상태가 비워진다.
10. `moderationActionLabel("create_test_account")`가 `가계정 생성`을 반환한다.

### 6.4 수동 검증

사용자가 이미 실행 중인 개발 서버/HMR에서 다음을 확인한다. 저장소 규칙상 구현자가 dev 서버나 build를 새로 실행하지 않는다.

1. 운영자로 로그인 → `회원 관리 > 계정 생성`이 데스크톱/모바일 메뉴 모두에서 보임.
2. 여성 구직자 생성 → 운영자 로그아웃 → 생성 ID/PW 로그인 → 구직자 홈 진입 → 글 작성 및 수다방 이용.
3. 남성 구직자 생성 → 로그인과 일반 구직 기능 정상 → 수다방 진입 후 공지사항·비밀게시판만 노출/접근되고 다른 게시판 직접 접근은 거부.
4. 여성 구인자 생성 → 로그인 정상 → 수다방은 광고 없음으로 차단 → 업체 정보 제출 → 운영자 승인 흐름 진행.
5. 남성 구인자도 위와 동일하며 성별 때문에 구인자 권한이 달라지지 않음.
6. 생성된 네 계정 모두 마이페이지에서 인증 완료 전화번호·생년월일·성별 표시.
7. 사용자 관리 목록/상세에 닉네임, ID, 역할, 인증 상태 표시.
8. 알려진 CI/DI 해시를 가진 기존 계정의 생성 전후 값을 비교해 삭제·변경되지 않았음을 확인.
9. 실제 PortOne 본인인증을 새로 하지 않고도 계정 생성과 ID/PW 로그인이 됨.

---

## 7. 구현 작업 순서

### Task 1: 회귀 테스트와 공용 검증 계약 고정

- [x] 최신 `develop`과 마이그레이션 마지막 번호를 다시 확인한다.
- [x] 기존 login ID, 닉네임 금칙어, 성인 판정 helper를 확정하고 신규 서비스의 전화번호 정규화 순수 함수 계약을 고정한다.
- [x] API 실패/성공/로그인/롤백 테스트를 작성한다.
- [x] 내비게이션과 폼 payload 테스트를 작성한다.

### Task 2: 운영자 전용 가계정 생성 API

- [x] `createTestAccountInput`을 추가한다.
- [x] `bambi-test-account.ts` 서비스를 만들고 기존 공용 validator로 닉네임·ID·생년월일을, 신규 순수 함수로 가번호를 검증한다.
- [x] Better Auth hasher로 비밀번호를 해시한다.
- [x] 내부 이메일과 도메인 분리된 가상 CI/DI를 생성한다.
- [x] `user/account/bambi_profile/admin_moderation_action`을 한 트랜잭션에서 생성한다.
- [x] 응답에서 모든 민감정보를 제외한다.
- [x] 실제 username 로그인 통합 테스트와 원자성 테스트를 통과시킨다.

### Task 3: 운영자 내비게이션과 계정 생성 UI

- [x] `회원 관리 > 계정 생성` 목적지를 단일 내비게이션 정본에 추가한다.
- [x] 기존 shadcn 컴포넌트와 폼 패턴으로 페이지를 만든다.
- [x] 이름은 로컬에서만 검증하고 payload에서 제외한다.
- [x] 닉네임·생년월일·성별·직업·ID·PW/확인·가번호 입력과 접근 가능한 label을 구현한다.
- [x] 제출 중복 방지, 성공 요약, 오류 유지, 사용자 목록 invalidate를 구현한다.
- [x] 감사 이력 라벨 `가계정 생성`을 추가한다.
- [ ] 데스크톱·모바일 반응형 및 키보드 탐색을 확인한다.

### Task 4: 문서와 역할별 테스트 흐름

- [x] 운영자 매뉴얼에 가계정 생성 절차와 주의사항을 추가한다.
- [x] 운영자 테스트 플로우에 네 역할/성별 조합, 실제 로그인, 권한 결과를 추가한다.
- [x] 이름 미저장, 내부 이메일, 가상 CI/DI, 본인인증 찾기 미지원, 구인자 온보딩 필요를 빠짐없이 명시한다.
- [x] 남성 구직자의 최신 `notice`·`secret` 보드 범위와 오래된 전체 차단 문구를 최신화한다.
- [x] 가계정 자동 만료·전용 삭제·전용 필터가 이번 범위 밖임을 명시한다.

### Task 5: 최종 검증

- [x] 관련 API Vitest 통과.
- [x] 관련 web Vitest 통과.
- [x] `pnpm --filter @bambi-app/api check-types` 통과.
- [x] `pnpm --filter web check-types` 통과.
- [x] 변경 파일 Ultracite 검사 통과.
- [x] `git diff --check` 통과.
- [x] build와 dev 서버 신규 실행은 하지 않고 사용자 HMR 환경에서 수동 검증을 요청한다.
- [x] 실제 검증 결과와 미실행 수동 항목을 이 문서에 기록한다.

### 구현 후 자동 검증 결과 (2026-08-31)

- API·web TypeScript 검사 통과.
- 가번호 정책·감사 라벨·폼/내비게이션 Vitest 5건 통과.
- 실제 DB를 사용하는 `moderation.createTestAccount` 통합 테스트 4건 통과: Better Auth username 로그인, 비운영자 차단, 구인자 조직 미생성, transaction 전체 롤백.
- 커뮤니티 접근 단위 테스트를 포함한 API 관련 테스트 12건 통과.
- 남성 구직자 보드 범위 라우터 테스트 2건 통과.
- `community.test.ts` 전체 49건 중 이번 변경과 무관한 기존 실패 6건이 남아 있다: 오래된 overview `surface` 입력 3건, 작성자명 기대 1건, 예약 작성인 기대 1건, 테스트 레이트리밋 초기화 1건. 이번에 수정한 남성 구직자 2건은 별도 실행으로 통과했다.
- 변경 코드 Ultracite 검사와 `git diff --check` 통과.
- 저장소 규칙에 따라 build/dev 서버는 실행하지 않았다. 실제 운영자 화면과 네 역할·성별 조합의 브라우저 수동 검증은 사용자 HMR 환경에서 남아 있다.

### 브라우저 검수 후 본문 이미지 로컬 업로드 보완

- 가계정으로 수다방 이미지를 선택할 때 `Internal server error`가 발생했다. 계정 권한이 아니라, 개발 서버에 `GCS_PUBLIC_BUCKET` 이름이 복사되어 있으면 editor media 인텐트가 로컬에서도 GCS 서명 URL을 만들려 해 ADC 인증에 실패하는 기존 저장소 분기가 원인이었다.
- editor media 인텐트는 기존 `shouldUsePublicBucket` 정본을 사용해 운영 환경에서만 GCS로 보내고, 개발 환경에서는 `/bambi/local-editor-media`로 실제 이미지 바이트를 PUT/GET한다.
- 로컬 엔드포인트는 `bambi-editor-media/` 키만 허용하고 경로 탈출을 거부하며, JPG·PNG·WebP MIME·10MB 상한·파일 시그니처를 다시 검사한다.
- 운영 환경의 GCS 서명 업로드와 공개 URL 흐름은 변경하지 않는다.

### 구인자 공고 등록 로컬 이미지 보완

- 가계정 구인자가 승인된 업체에서 공고를 제출할 때도 미리보기는 로컬 파일이라 보였지만, 제출 순간 `jobs.createMediaUpload`이 개발 환경에서 GCS 서명 URL을 만들려 해 같은 ADC 오류가 발생했다.
- 공고 미디어 인텐트도 `shouldUsePublicBucket` 정본을 사용하고, 개발 환경에서는 기존 `/bambi/local-job-media`를 PUT/GET 가능한 원본 저장소로 확장했다.
- 로컬 공고 미디어는 `bambi-job-post-media/` 키 경계, 경로 탈출 방지, JPG·PNG·WebP MIME, 10MB 상한, 파일 시그니처를 검사한다.
- 개발 화면의 `jobMediaPublicUrl`은 로컬 공고 키를 로컬 GET 경로로 해석하므로 등록 뒤 목록·상세에서도 실제 원본을 표시한다.
- 저장소·가계정 통합 테스트 16건과 API/web 타입 검사, 변경 파일 Ultracite, `git diff --check`를 통과했다.

### 전체 변경 재감사·하드코딩 제거

- 사용자 브라우저 검수에 의존하던 부분을 줄이기 위해 가계정 credential 로그인 뒤 `onboarding.getMyRouting`까지 호출하는 통합 테스트를 추가했다. 구직자는 `job_seeker`, 구인자는 `employer + approval none`으로 연결된다.
- 공고/본문 로컬 이미지 저장의 MIME 목록·10MB 상한·파일 시그니처·경로 탈출 검사가 두 라우트에 복제돼 있던 문제를 `local-image-storage.ts` 한 곳으로 통합했다. MIME·용량·alt 길이는 기존 `bambi-job-media-policy`를 정본으로 사용한다.
- editor/job storage key root와 로컬 URL 문자열을 `bambi-storage-policy.ts` 한 곳으로 통합했다.
- 역할·성별 enum과 `create_test_account` 감사 액션은 `bambi-test-account-policy.ts`, 비밀번호 최소 길이는 `packages/auth/password-policy.ts`, 성인 나이·문구는 기존 `portone-identity.ts`를 재사용한다.
- 기존 GCS 공고 키까지 로컬로 해석하는 회귀를 감사 중 발견해 즉시 교정했다. 신규 로컬 공고 키에만 `bambi-job-post-media/{orgId}/local/{userId}/...` 세그먼트를 넣고, 기존 키는 계속 GCS 공개 URL로 렌더한다.
- Chrome에서 기존 공고 이미지들이 다시 GCS 원본 URL로 로드되고 실제 `naturalWidth`가 채워지는 것을 확인했다. `owner/luna-cover.jpg` 한 건은 원래 GCS 객체가 없는 기존 키라 기존 샘플 폴백 경고가 유지된다.
- 공용 로컬 저장 유틸은 실제 PNG 바이트 PUT→GET 동일성, 경로 탈출 차단, MIME/시그니처 불일치를 자동 테스트한다.
- 최종 집중 검증: web 순수/화면 테스트 8건, API 가계정·저장소·커뮤니티 정책 테스트 26건, 승인된 구인자 공고+미디어 생성 1건, 업체 승인 게이트 5건 통과. API/web 타입 검사와 변경 코드 Ultracite, `git diff --check` 통과.
- 더 넓게 실행한 기존 스위트에는 이번 변경과 무관한 기저 실패가 남아 있다. `community.test.ts` 6건은 오래된 overview 입력·작성인·레이트리밋 fixture, `job-post-media.test.ts` 2건은 fixture 승인 상태, `submit-employer-business-info.test.ts` 4건은 새 서류 필수 정책과 알림 FK cleanup 미반영이다. 이번 기능의 집중 테스트와 해당 핵심 성공 경로는 별도 실행으로 통과했다.

### 전이 의존 코드 하드코딩 최종 감사

- 새 코드뿐 아니라 가계정이 실제 사용하는 기존 로그인·비밀번호 복구·커뮤니티 잠금글·채팅 첨부·사업자 서류 경로까지 따라가 정책 중복을 제거했다.
- 비밀번호 최소 길이는 `packages/auth/password-policy.ts`, 커뮤니티 제목·작성인·잠금 비밀번호 길이는 `bambi-community-post-policy.ts`, 사업자 서류 최대 개수는 `bambi-business-document-policy.ts`를 단일 정본으로 사용한다.
- 채팅 이미지/PDF와 사업자 서류의 MIME·10MB 정책은 `bambi-media-policy.ts`를 웹·API·로컬 PUT 엔드포인트가 함께 사용한다.
- 채팅 첨부도 개발 환경에서 운영용 버킷 이름만 보고 GCS를 시도하던 분기를 `shouldUsePublicBucket`으로 교정하고, `bambi-chat/`과 `employer/` key root를 공유 로컬 엔드포인트가 서로 다른 저장 디렉터리에 실제 원본으로 보존한다.
- 커뮤니티/공고 이미지와 채팅/서류의 로컬 경로·key root는 `bambi-storage-policy.ts`, 이미지 파일 시그니처·경로 탈출·PUT/GET은 `local-image-storage.ts`를 정본으로 둔다.
- 관련 하드코딩 재검색 결과 이번 계정 흐름 밖인 메인 팝업 이미지 accept, 계정 프로필 사진 accept, 광고기간 등급 아이콘의 기존 local placeholder만 남았다. 사용자가 이번 범위에서 제외한 프로필 사진과 별도 운영 기능이므로 이 PR에서 동작을 바꾸지 않는다.
- 최종 자동 검증: API 관련 59건 + web/순수 8건 = 67건 통과, 승인된 구인자 공고+미디어 생성 1건과 업체 승인 게이트 5건 별도 통과, API/web 타입 검사·변경 파일 Ultracite·`git diff --check` 통과.

### 사용자 검수에서 발견한 후처리·중간 데이터 호환 보완

- 채팅 신고는 DB에 `open` 행이 생성된 뒤 실시간 목록 갱신 쿼리가 `community_post`를 JOIN하지 않고 그 테이블 컬럼을 SELECT해 500이 발생했다. 사용하지 않는 두 컬럼을 제거해 신고 저장 후 실시간 방/목록 갱신까지 성공 응답으로 끝나게 했다.
- 실제 실패 화면의 방 ID를 DB에서 조회해 신고가 이미 `open`으로 접수된 것을 확인했다. 따라서 사용자가 같은 신고를 다시 넣을 필요가 없으며, 재시도 시 중복 신고 안내가 정상이다.
- 채팅 신고 회귀 테스트는 신고 생성·구직자 권한·구인자 거부·후처리 성공을 확인한다. 테스트 cleanup도 생성된 알림을 먼저 삭제하도록 고쳐 기능 성공 후 FK cleanup 실패가 테스트 실패로 오인되지 않게 했다.
- 로컬 공고 저장 형식 전환 중 생성된 이미지 2개는 기존 GCS key 모양으로 DB에 저장됐지만 실제 원본은 로컬에 있었다. 개발 `local-job-media` GET은 로컬 원본을 먼저 찾고, 없으면 기존 GCS 공개 URL로 307 redirect하도록 호환 계층을 추가했다.
- 해당 공고의 실제 두 storage key를 DB에서 읽어 로컬 GET을 직접 호출했고 `200 image/jpeg` 28,084 bytes, `200 image/png` 2,086,272 bytes를 확인했다. DB migration이나 데이터 임의 수정 없이 중간 데이터와 기존 GCS 데이터를 모두 보존한다.
- 최종 재검증: auth/api/web 타입 검사, 변경 코드 40파일 Ultracite, `git diff --check` 통과. API 집중 59건, web/순수 8건, 신고 후처리 1건, 승인 공고+미디어 1건, 업체 승인 게이트 5건 통과.

### 인증 완료 가계정의 비밀글 판정 통일

- 가계정은 `bambi_profile.is_phone_verified=true`와 성별·생년월일·가번호·가상 CI/DI를 저장하지만 실제 PortOne 인증 로그는 만들지 않는다. 비밀글 경로만 `bambi_identity_verification_log` 실명 행을 요구해 인증 완료 프로필을 다시 인증하라고 거부했다.
- 회원 인증 여부는 기존 프로필의 `isPhoneVerified + gender + phoneNumber`를 정본으로 통일했다. 비회원은 계정 프로필이 없으므로 기존 인증 로그의 유효성/보존기간 판정을 그대로 사용한다.
- 가짜 실명 로그를 만들거나 사용자 입력 이름을 저장하지 않는다. 가계정 통합 테스트에서 실제 인증 로그 행 수가 늘지 않는 동시에 `hasMemberVerifiedIdentity`가 true인지 확인한다.
- 비밀글·인증 관련 집중 테스트 18건이 통과했다. 함께 실행된 `community.test.ts`의 오래된 overview `surface` fixture 1건만 기존 입력 계약 불일치로 실패했으며 이번 인증 변경과 무관하다.

## 후속 확정 범위: 수동 등급 기준점·사용자 목록 진입점

### 역할 변경 제외

- 사용자 역할을 구직자·구인자·관리자로 변경하는 기능은 사용자 결정으로 이번 범위에서 제외한다.
- 기존 법률자문 지정·해제 동작도 변경하지 않는다.

### 수동 등급 기준점 재설정

- 출석 관리 행의 점 3개 메뉴에 `등급 변경`을 추가한다.
- 운영자는 현재 등급표에서 대상 등급을 고르고 사유를 입력한다. 포인트 잔액과 원장 행은 변경하지 않는다.
- 수동 등급은 영구 고정이 아니다. 변경 당시 누적 등급 포인트를 기준선으로 잡고 선택 등급의 당시 `minPoints`를 새 출발점으로 저장한다.
- 이후 유효 등급 포인트는 `선택 등급 기준 포인트 + (현재 누적 등급 포인트 - 변경 당시 누적 등급 포인트)`로 계산한다.
- 낮은 회원을 높은 등급으로 올리면 선택 등급부터 다음 등급까지 필요한 포인트를 새로 벌어 자동 승급한다.
- 높은 회원을 낮은 등급으로 내리면 선택 등급부터 기존 높은 등급까지 필요한 포인트를 다시 벌어야 자동 승급한다.
- 수동 변경 이후 등급 계산에 포함되는 음수 거래가 생기면 유효 등급 포인트도 함께 감소한다. 포인트몰·공고 결제처럼 기존 등급 계산에서 제외되는 거래는 영향이 없다.
- 같은 회원을 다시 수동 변경하면 이전 기준선을 새 변경 시점·새 등급으로 교체한다.
- 선택 등급의 기준 포인트는 변경 당시 값을 스냅샷으로 저장해 이후 등급표 기준이 수정돼도 과거 출발점이 흔들리지 않게 한다.
- 선택한 등급 행이 삭제되면 FK `set null`로 수동 기준을 해제하고 현재 누적 등급 포인트 자동 산정으로 돌아간다.
- 변경 운영자·대상·이전/새 등급·사유·기준 포인트를 감사 로그에 기록한다.

### 사용자 관리 계정 생성 진입점

- `/moderator/users/create` 페이지와 구현은 유지한다.
- 사용자 관리 필터 줄의 `쪽지 보내기` 바로 옆에 `계정 생성` 버튼을 추가해 기존 페이지로 이동한다.
- 운영자 상단/모바일 `회원 관리` 메뉴의 별도 `계정 생성` 항목은 제거해 진입점을 사용자 관리 화면 한 곳으로 통일한다.

### DB

- `bambi_profile`에 선택 등급 FK, 변경 당시 누적 등급 포인트, 선택 등급 기준 포인트 스냅샷, 변경 시각을 추가한다.
- `db:push`는 사용하지 않고 최신 0112 다음 Drizzle migration을 생성한다.

---

## 8. 커밋 단위

사용자가 직접 커밋한다. 구현 완료 후 다음 두 커밋으로 나눌 수 있으며, 관련 변경은 하나의 브랜치와 PR로 올린다.

1. `feat: 운영자 가계정 생성 API 추가`
   - API, 인증 credential, 프로필, 감사 로그, API 테스트
2. `feat: 운영자 계정 생성 화면 추가`
   - 내비게이션, 페이지, 웹 테스트, 매뉴얼·테스트 플로우

각 커밋 메시지는 제목 한 줄로 끝내지 않고 CMU02의 최신 형식에 맞춘 상세 본문을 포함한다. PowerShell 한글 깨짐을 피하기 위해 구현 완료 후 UTF-8 메시지 파일을 만드는 명령과 `git commit -F <파일>` 명령을 제공한다.

---

## 9. PR 준비

1. PR 직전에 `origin/develop`을 다시 fetch한다.
2. `--force` 없이 최신 develop을 반영한다.
3. 충돌이 있으면 기존 코드와 이 설계의 재사용 원칙을 유지해 해결한다.
4. 최신 develop의 migration journal과 SQL 마지막 번호를 확인한다. 이번 변경은 스키마 변경이 없으므로 migration이 생기지 않아야 한다.
5. 동기 CMU02의 최신 이슈·PR 본문 구조와 문체를 GitHub에서 다시 확인한다.
6. PR 본문에 다음을 구체적으로 기록한다.
   - 실제 CI/DI 삭제와 재인증 반복을 없애려는 목적
   - 운영자 가계정 생성 항목과 미저장 이름 처리
   - Better Auth credential과 프로필의 원자적 생성
   - 가상 CI/DI 격리와 실제 인증 로그 미생성
   - 역할/성별 네 조합의 기존 정책 적용 결과
   - 구인자는 기존 업체 제출·승인 절차를 유지한다는 점
   - 자동 테스트와 사용자 수동 검증 결과
   - `Closes #<issue-number>`
7. 최종 머지는 동기가 수행한다.

---

## 10. 완료 조건

다음이 모두 충족돼야 완료다.

- 운영자만 계정 생성 페이지와 API를 사용할 수 있다.
- 입력한 ID/PW로 기존 로그인 화면에서 실제 로그인이 된다.
- 닉네임만 서비스에 표시되고 입력한 이름은 서버로 전송되거나 저장되지 않는다.
- 생년월일·성별·가번호·인증 완료·활성 상태가 프로필에 정확히 저장된다.
- 가상 CI/DI는 계정마다 고유하고 실제 인증 데이터·로그를 건드리지 않는다.
- user/account/profile/audit 중 일부만 남는 실패 상태가 없다.
- 여성 구직자는 일반 수다방을 이용하고, 남성 구직자는 최신 정책대로 공지사항·비밀게시판 범위만 이용하며, 여성/남성 구인자는 광고 전 수다방이 차단되는 기존 정책이 그대로 적용된다.
- 구인자 계정에 조직·승인을 선생성하지 않으며 기존 온보딩을 테스트할 수 있다.
- 프로필 사진은 생성 범위에 포함하지 않는다.
- DB schema와 migration을 변경하지 않는다.
- 문서, 테스트, 타입 검사, Ultracite, diff 검증 결과가 기록된다.
- 구현자가 커밋·푸시·머지를 하지 않는다.

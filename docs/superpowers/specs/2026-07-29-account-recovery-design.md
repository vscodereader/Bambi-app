# 아이디 찾기 · 비밀번호 찾기 설계

작성일: 2026-07-29

## 배경

로그인 화면(`apps/web/src/components/bambi/auth/auth-panel.tsx`)의 "비밀번호를 잊으셨나요?"는
"곧 제공될 예정이에요" 토스트만 띄우는 자리표시자다. 아이디를 잊은 사용자를 위한 경로는
아예 없다. 계정 복구 수단이 없으면 로그인하지 못한 사용자는 중복 가입을 시도하는데,
`bambiProfile.diHash` 유니크 제약 때문에 재가입도 막혀 완전히 갇힌다.

이미 갖춰진 것:

- 포트원 V2 KCP 인증창(`phone-verify-dialog.tsx`) — PC 팝업 / 모바일 리디렉션
- 서버 발급 인증건 + TTL 30분 + 1회 소진(`packages/api/src/services/bambi-identity-ticket.ts`)
- 인증 결과 → 성인 판정 · CI/DI 해시(`bambi-identity.ts`, `portone-identity.ts`)
- 사람 ↔ 계정 연결: `bambiProfile.ciHash` / `diHash` (DI 유니크 → 1인 1계정)
- 로그인 아이디: better-auth username 플러그인의 `user.login_id`

## 범위

- **포함**: `apps/web` 로그인 화면의 아이디 찾기 · 비밀번호 찾기
- **제외**: `apps/native` (창 개념이 없어 별도 화면 흐름으로 다시 설계해야 함),
  이메일 링크 기반 비밀번호 재설정, 목(mock) 인증 폴백 경로

## 사용자 흐름

로그인 폼에 진입점 두 개를 둔다.

- 아이디 라벨 옆: **아이디 찾기** (신규)
- 비밀번호 라벨 옆: **비밀번호를 잊으셨나요?** (기존 자리, 자리표시자 토스트 제거)

### 아이디 찾기

1. 링크 클릭 → 포트원 인증창(PC 팝업 / 모바일 리디렉션)
2. 인증 성공 → 밤비알바 로그인 페이지 **위 모달**에서 결과 안내
   - 계정 있음: `가입된 아이디: hongkildong` + [이 아이디로 로그인] 버튼
     → 모달을 닫으면서 로그인 폼의 아이디 칸을 자동으로 채운다
   - `login_id`가 없는 옛 계정: "아이디 없이 이메일로 가입된 계정이에요. 가입하신 이메일로
     로그인해 주세요."
   - 계정 없음: "가입된 계정이 없어요." + 회원가입 유도

포트원 인증창 자체는 PG(KCP)가 소유해 우리 내용을 그릴 수 없다. 결과는 반드시 인증창이
닫힌 뒤 밤비알바 페이지에서 보여준다.

### 비밀번호 찾기

1. 링크 클릭 → 포트원 인증창
2. 인증 성공 → 같은 모달에서 **계정 존재 여부 먼저 확인**
   - 계정 없음: 아이디 찾기와 동일한 안내로 종료 (새 비밀번호를 다 입력한 뒤에 실패하는
     상황을 만들지 않는다)
3. 계정 있음 → 모달에 `새 비밀번호` / `새 비밀번호 확인` 입력
4. [확인] → 서버가 비밀번호 변경 + 해당 사용자 전 세션 무효화
5. 완료 안내:
   - "비밀번호가 성공적으로 변경되었습니다. 새 비밀번호로 로그인해 주세요."
   - "이 창은 5초 뒤 자동으로 닫혀요. 지금 닫으셔도 됩니다."
6. 5초 후 모달 자동 닫힘 → 로그인 폼으로 복귀

### 모바일 리디렉션 복귀

모바일에서는 인증창이 리디렉션 방식이라 페이지가 통째로 떠났다가 쿼리스트링
(`identityVerificationId`)으로 돌아온다. 한 화면에 인증 진입점이 여럿(가입 · 비회원 둘러보기 ·
아이디 찾기 · 비밀번호 찾기)이므로, 기존 `bambi:phone-verify-intent` 세션스토리지
메커니즘을 그대로 써서 인증을 시작한 진입점만 결과를 처리한다. 찾기 흐름은 복귀 시
해당 모달을 자동으로 다시 연다.

새 intent 값:

- `auth-panel:find-id`
- `auth-panel:reset-password`

## 서버

새 파일 `packages/api/src/routers/bambi/account-recovery.ts`.
`onboarding.ts`는 이미 700줄이 넘어 더 키우지 않는다. `bambiRouter`에 `accountRecovery`로 등록.

### `lookupAccountByIdentity` (publicProcedure)

```
입력: { identityVerificationId: string }
출력: { found: boolean; loginId: string | null }
```

1. `assertIdentityVerificationUsable` — 발급 기록 · TTL · 미소진 확인 (**소진하지 않음**)
2. `resolveVerifiedIdentity` — 포트원 단건조회, 성인 판정, CI/DI 해시
3. CI/DI 해시로 `bambiProfile` → `user` 조회. `user.deletedAt IS NULL`인 계정만 대상
4. `{ found, loginId }` 반환. 계정은 있으나 `login_id`가 없으면 `{ found: true, loginId: null }`

이메일은 응답에 싣지 않는다. 아이디를 못 찾은 경우의 안내는 화면 문구로 충분하고,
이메일을 내려보내면 노출 범위가 요구사항("가입된 아이디만 안내")을 넘는다.

### `resetPasswordByIdentity` (publicProcedure)

```
입력: { identityVerificationId: string; newPassword: string(min 8) }
출력: { success: true }
```

1. `assertIdentityVerificationUsable`
2. `resolveVerifiedIdentity`
3. 위와 동일한 방식으로 계정 특정. 없으면 `NOT_FOUND`
4. `consumeIdentityVerification` — **최종 소비 지점**. 여기를 지나면 같은 인증건으로
   비밀번호를 다시 바꿀 수 없다
5. `auth.$context`의 `password.hash()` + `internalAdapter.updatePassword(userId, hash)`.
   `credential` account가 없는 계정이면 `internalAdapter.createAccount`로 만든다
   (better-auth의 `email-otp/reset-password`가 쓰는 것과 같은 절차)
6. `internalAdapter.deleteSessions(userId)` — 해당 사용자의 모든 세션 무효화

클라이언트는 대상 `userId`를 절대 보내지 않는다. 계정은 오직 서버가 인증 결과의 CI/DI로
특정한다.

### 인증건 소진 정책

가입 흐름이 쓰는 규칙을 그대로 따른다: **중간 단계는 검증만, 최종 소비 지점에서만 소진.**

- `lookupAccountByIdentity`는 소진하지 않는다. 비밀번호 흐름이 같은 인증건에 두 번
  닿기 때문이고(계정 확인 1회 + 변경 1회), 조회 자체는 부작용이 없으며 얻는 것이
  본인 아이디뿐이라 재사용 위험이 없다. 인증건은 30분 TTL로 어차피 만료된다.
- `resetPasswordByIdentity`만 소진한다.

### 비밀번호 정책

회원가입과 동일하게 최소 8자. 화면과 서버 양쪽에서 검증한다.

## 클라이언트

### `apps/web/src/components/bambi/use-portone-verification.ts` (신규)

`phone-verify-dialog.tsx`의 `PortOneVerifyButton` 안에 있는 "인증건 발급 → 인증창 호출 →
모바일 리디렉션 복귀 처리" 로직을 훅으로 추출한다. 기존 `PhoneVerifyDialog`는 이 훅을
쓰는 버튼으로 남고 동작은 바뀌지 않는다. 새 흐름은 같은 훅을 텍스트 링크에 붙여
모바일 복귀 처리를 그대로 물려받는다.

```ts
usePortOneVerification({
  intent: string;
  onVerified: (identityVerificationId: string) => Promise<void> | void;
}): {
  isConfigured: boolean;   // NEXT_PUBLIC_PORTONE_* 구성 여부
  isVerifying: boolean;
  startVerification: () => void;
}
```

`isConfigured`가 false면(포트원 미구성 개발 환경) 찾기 링크를 렌더하지 않는다.
목 인증에는 CI/DI가 없어 계정을 특정할 수 없으므로 폴백 경로를 만들지 않는다.

### `apps/web/src/components/bambi/auth/account-recovery-dialog.tsx` (신규)

상태 넷을 가진 모달:

| 상태 | 내용 |
|---|---|
| `id-result` | 찾은 아이디 + [이 아이디로 로그인] |
| `password-form` | 새 비밀번호 / 확인 입력 |
| `password-done` | 변경 완료 + 5초 자동 닫힘 안내 |
| `not-found` | 계정 없음 안내 + 회원가입 유도 |

### 수정

- `auth-fields.tsx` — 아이디 라벨 옆 "아이디 찾기" 링크 추가
- `auth-panel.tsx` — `handleForgotPassword` 자리표시자 제거, 모달 연결,
  [이 아이디로 로그인] 시 폼 아이디 칸 자동 입력

UI는 shadcn 컴포넌트(Dialog / Field / Input / Button / Alert)만 쓴다.

## 테스트

`packages/api/src/routers/bambi/account-recovery.test.ts` — 기존
`verify-phone-duplicate.test.ts` 패턴을 따른다.

- 계정 있음 → `{ found: true, loginId }`
- 계정 없음 → `{ found: false, loginId: null }`
- 탈퇴 계정(`user.deletedAt` 있음)은 찾지 못함
- 비밀번호 변경 후 새 비밀번호로 로그인 성공
- 비밀번호 변경 후 기존 세션 행이 사라짐
- 소진된 인증건으로 `resetPasswordByIdentity` 재호출 시 거부
- `lookupAccountByIdentity`는 인증건을 소진하지 않음(두 번 호출해도 통과)

## 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 결과 표시 위치 | 별도 브라우저 창 없이 밤비알바 로그인 페이지 위 모달 |
| 아이디 노출 | 마스킹 없이 전체 노출 (본인인증을 통과한 본인이므로) |
| 적용 범위 | `apps/web`만 |
| 비밀번호 변경 후 세션 | 해당 사용자 전 세션 무효화 |
| 인증건 소진 | 조회는 소진하지 않고, 비밀번호 변경만 소진 |
| 목 인증 폴백 | 만들지 않음. 포트원 미구성 시 링크 자체를 숨김 |

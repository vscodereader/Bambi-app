# 아이디 찾기 · 비밀번호 찾기 구현 계획

설계: [2026-07-29-account-recovery-design.md](../specs/2026-07-29-account-recovery-design.md)

워크트리: `.claude/worktrees/worktree-account-recovery` (브랜치 `worktree-worktree-account-recovery`)

세 갈래를 서브에이전트로 병렬 진행한다. 파일이 겹치지 않고, 갈래 사이 결합은 아래
계약으로 고정한다. 커밋은 컨트롤러가 순차로 한다(서브에이전트는 커밋하지 않는다).

## 갈래 사이 계약

### 서버 프로시저 (A → C)

```ts
client.bambi.accountRecovery.lookupAccountByIdentity({ identityVerificationId: string })
  // => { found: boolean; loginId: string | null }

client.bambi.accountRecovery.resetPasswordByIdentity({
  identityVerificationId: string;
  newPassword: string;
})
  // => { success: true }
```

### 인증 훅 (B → C)

```ts
// apps/web/src/components/bambi/use-portone-verification.ts
usePortOneVerification({
  intent: string;
  onVerified: (identityVerificationId: string) => Promise<void> | void;
}): {
  isConfigured: boolean;
  isVerifying: boolean;
  startVerification: () => void;
}
```

## A. 서버 — 계정 복구 라우터

- [x] `packages/api/src/routers/bambi/account-recovery.ts` 신규
      - `lookupAccountByIdentity` (public, 인증건 소진 안 함)
      - `resetPasswordByIdentity` (public, 인증건 소진 + 비밀번호 변경 + 전 세션 삭제)
      - CI/DI 해시 → `bambiProfile` → `user` 조회 헬퍼 (탈퇴 계정 제외)
- [x] `packages/api/src/routers/bambi/index.ts`에 `accountRecovery` 등록
- [x] `packages/api/src/routers/bambi/account-recovery.test.ts` 신규 (설계의 테스트 목록)

비밀번호 변경·세션 삭제는 `auth.$context`의 `password.hash` +
`internalAdapter.findAccounts` / `updatePassword` / `createAccount` / `deleteSessions`로 한다
(better-auth 1.6.11의 `email-otp/reset-password`가 쓰는 것과 같은 절차).
`newPassword`에는 상한 128자를 둔다 — 상한 없이 해시 함수에 넘기면 긴 입력 하나로 CPU를 태울 수 있다.

## B. 클라이언트 — 포트원 인증 훅 추출

- [x] `apps/web/src/components/bambi/use-portone-verification.ts` 신규
      (`phone-verify-dialog.tsx`의 인증건 발급 · 인증창 호출 · 모바일 리디렉션 복귀 로직 이동)
- [x] `phone-verify-dialog.tsx`가 훅을 쓰도록 리팩터 — 동작 무변경

## C. 클라이언트 — 찾기 모달과 로그인 폼 연결

- [x] `apps/web/src/components/bambi/auth/account-recovery-dialog.tsx` 신규
      (`id-result` / `password-form` / `password-done` / `not-found` 4상태)
- [x] `auth-fields.tsx` — 아이디 라벨 옆 "아이디 찾기" 링크 추가
- [x] `auth-panel.tsx` — `handleForgotPassword` 자리표시자 제거, 모달 연결,
      찾은 아이디를 로그인 폼에 자동 입력

## 통합 (컨트롤러)

- [x] 계약 일치 확인 — 세 갈래가 모두 착지한 상태에서 `pnpm --filter web check-types` 통과가
      곧 `client.bambi.accountRecovery.*` 두 프로시저와 훅 시그니처의 일치 증명
- [x] `pnpm dlx ultracite check apps/web/src/components/bambi packages/api/src/routers/bambi`
      → `Checked 190 files. No fixes applied. Found 2 warnings` (2건 모두 손대지 않은
      `community.test.ts`의 기존 `suppressions/unused`)
- [x] `pnpm --filter web check-types` / `pnpm --filter @bambi-app/api check-types` 둘 다 통과
- [x] `pnpm --filter @bambi-app/api test account-recovery` → `Test Files 1 passed, Tests 12 passed`
      (워크트리 안에서 실행)
- [x] 매뉴얼 동기화 — `seeker-manual.md`("아이디·비밀번호를 잊었을 때" 절 신설, FAQ 2건),
      `employer-manual.md`(2-1절의 "재설정 기능 준비 중" 문장 교체)
- [x] 순차 커밋

### 무관한 기존 실패 (이번 작업 범위 밖)

`packages/api` 전체 스위트에서 3건이 실패하지만 이번 변경과 무관하다. 두 테스트 파일은
`./moderation`·`./jobs`를 직접 import하고, 우리가 건드린 `routers/bambi/index.ts`를 거치지 않는다.

- `jobs-list-boost-order.test.ts` 2건 — 부스트 정렬 결과에 예상 밖 행이 섞임
- `moderation-support.test.ts:186` 1건 — `authorName`이 표시명 대신 이름을 반환

### 알려진 한계

`sessionStorage`가 차단된 환경에서는 인증 시작 기록(`bambi:phone-verify-intent`)을 남길 수
없어, 모바일 리디렉션 복귀 시 화면의 모든 인증 진입점이 같은 결과를 처리한다. 원래 두 곳
(가입 · 비회원 둘러보기)이던 것이 찾기 링크 둘을 더해 넷이 되어, 그 환경에서는 가입 인증
복귀에 찾기 모달이 함께 뜰 수 있다. 인증 결과가 유실되는 것보다는 낫다고 보아 기존 폴백
규칙을 그대로 두었다 — 실제로 문제가 보고되면 찾기 흐름만 "기록이 정확히 일치할 때만
처리"로 좁힌다.

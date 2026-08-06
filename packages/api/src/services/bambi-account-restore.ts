// 탈퇴 계정 복구(운영자 액션)의 판정 로직. DB에 닿지 않는 순수 함수로 두어
// 서버(accountRecovery.restoreWithdrawnAccount)와 운영자 화면이 같은 기준을 공유한다.
//
// 복구는 user.deletedAt을 NULL로 되돌리는 것이 전부다 — better-auth 세션 생성 훅이
// deletedAt만 보고 로그인을 막으므로(packages/auth/src/index.ts), 마커를 지우면 그대로
// 로그인이 재개된다. 다만 파기 배치(bambi-withdrawal-purge)가 이미 훑고 간 계정은
// 비밀번호·연락처·본인인증 해시가 지워져 되살려도 로그인할 수단이 없다. 그래서
// purgedAt이 찍힌 계정은 복구 대상에서 제외한다.

export type AccountRestoreBlockReason = "already_active" | "purged";

export interface AccountRestoreState {
	// 소프트 탈퇴 시각(null이면 활성 계정).
	deletedAt: Date | null | undefined;
	// 개인정보 파기 완료 시각(null이면 아직 보존기간 안).
	purgedAt: Date | null | undefined;
}

export type AccountRestoreDecision =
	| { canRestore: false; message: string; reason: AccountRestoreBlockReason }
	| { canRestore: true };

export const ACCOUNT_RESTORE_BLOCK_MESSAGES: Record<
	AccountRestoreBlockReason,
	string
> = {
	already_active: "이미 이용 중인 계정이에요. 복구할 탈퇴 기록이 없어요.",
	purged:
		"개인정보 파기가 끝난 계정이라 되살릴 수 없어요. 본인이 다시 가입해야 해요.",
};

/**
 * 복구 가능 여부 판정. 파기 여부를 먼저 본다 — 파기된 계정도 deletedAt이 남아 있어서
 * 탈퇴 여부부터 보면 "복구 가능"으로 잘못 읽힌다.
 */
export const resolveAccountRestoreDecision = (
	state: AccountRestoreState
): AccountRestoreDecision => {
	if (state.purgedAt) {
		return {
			canRestore: false,
			message: ACCOUNT_RESTORE_BLOCK_MESSAGES.purged,
			reason: "purged",
		};
	}
	if (!state.deletedAt) {
		return {
			canRestore: false,
			message: ACCOUNT_RESTORE_BLOCK_MESSAGES.already_active,
			reason: "already_active",
		};
	}
	return { canRestore: true };
};

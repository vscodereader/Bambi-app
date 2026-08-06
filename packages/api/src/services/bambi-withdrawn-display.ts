// 탈퇴 계정의 표시명 처리(표시 계층 전담).
//
// 탈퇴(onboarding.withdrawMyAccount)는 user.deletedAt 마커만 남기고 이름·프로필 이미지
// 원본은 그대로 둔다. 원본을 즉시 덮으면 운영자가 "누가 탈퇴했는지"를 영영 알 수 없고,
// 실수로 탈퇴한 계정을 되살려도(moderation 복구) 이름이 돌아오지 않기 때문이다.
// 실제 파기는 보존기간이 지난 뒤 파기 배치(bambi-withdrawal-purge)가 한다.
//
// 그 대신 **일반 사용자에게 이름을 내보내는 모든 지점**은 이 헬퍼를 지나야 한다.
// 여기를 건너뛰면 탈퇴자의 실제 닉네임이 채팅·커뮤니티·후기에 그대로 남는다.
// 운영자 화면(moderation 라우터)만 원본 이름 + 탈퇴 상태를 함께 본다.

export const WITHDRAWN_DISPLAY_NAME = "탈퇴한 회원";

export interface WithdrawableNameRow {
	// 소프트 탈퇴 시각. 값이 있으면 표시명을 익명 문구로 바꾼다.
	deletedAt: Date | null | undefined;
	// user.name 원본. leftJoin으로 계정이 없는 행(비회원 글 등)은 null이 온다.
	name: string | null | undefined;
}

export const isWithdrawnAccount = (
	row: Pick<WithdrawableNameRow, "deletedAt"> | null | undefined
): boolean => Boolean(row?.deletedAt);

/**
 * 사용자에게 보여줄 표시명을 고른다.
 *
 * - 탈퇴 계정 → "탈퇴한 회원"(원본 이름은 절대 내보내지 않는다)
 * - 그 외 → 원본 이름, 없으면 호출부가 정한 fallback(비회원 문구 등)
 *
 * 행 자체가 없을 때(leftJoin 미스)도 fallback으로 떨어진다.
 */
export const resolveVisibleDisplayName = <TFallback extends string | null>(
	row: WithdrawableNameRow | null | undefined,
	fallback: TFallback
): TFallback | string => {
	if (!row) {
		return fallback;
	}
	if (row.deletedAt) {
		return WITHDRAWN_DISPLAY_NAME;
	}
	return row.name ?? fallback;
};

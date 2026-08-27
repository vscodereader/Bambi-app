// 운영자 쪽지 발송 대상 해석. DB를 만지지 않는 순수 로직만 둔다 —
// test/services에서 dev DB 없이 검증한다. DB 조회·insert는 라우터가 담당.

/** 발송 UI가 고르는 역할 축. "구직자"는 법률자문가(legal_advisor)를 포함한다. */
export type DirectMessageTargetRole = "employer" | "job_seeker";

export const DIRECT_MESSAGE_TITLE_MAX = 100;
export const DIRECT_MESSAGE_BODY_MAX = 2000;

type ExpandedRole = "employer" | "job_seeker" | "legal_advisor";

/** 역할 축 → 실제 bambi_user_role 값 목록. admin·guest는 어떤 조합에서도 제외된다. */
export const expandTargetRoles = (
	roles: DirectMessageTargetRole[]
): ExpandedRole[] => {
	const expanded = new Set<ExpandedRole>();
	for (const role of roles) {
		expanded.add(role);
		if (role === "job_seeker") {
			expanded.add("legal_advisor");
		}
	}
	return [...expanded];
};

/** 역할 조회 결과 ∪ 개별 지정, 중복 제거. 순서는 역할 조회분 먼저(안정적 발송 순서). */
export const mergeRecipientUserIds = (
	roleUserIds: string[],
	explicitUserIds: string[]
): string[] => [...new Set([...roleUserIds, ...explicitUserIds])];

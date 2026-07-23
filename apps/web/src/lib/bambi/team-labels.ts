// 밤비 — 조직 역할·멤버/초대 상태 enum의 한글 표시 라벨. 팀 관리 화면(team-member-list)과
// 운영자 팀 합류 승인(moderator/team-invites)이 공유한다. moderation-labels.ts와 동일 패턴:
// Record<string, string> + string 입력 + 알 수 없는 값에도 안전한 중립 폴백(enum 원값 노출 금지).

// 조직 관리 역할(owner/manager/staff).
export const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
	manager: "매니저",
	owner: "소유자",
	staff: "스태프",
};

export function organizationRoleLabel(role: string): string {
	return ORGANIZATION_ROLE_LABELS[role] ?? "구성원";
}

// 멤버·초대 상태(member.status / invitation.status).
export const MEMBER_STATUS_LABELS: Record<string, string> = {
	accepted: "수락됨",
	active: "활성",
	cancelled: "취소",
	expired: "만료",
	pending: "운영자 승인 대기",
	rejected: "반려됨",
};

export function memberStatusLabel(status: string): string {
	return MEMBER_STATUS_LABELS[status] ?? "상태 확인 필요";
}

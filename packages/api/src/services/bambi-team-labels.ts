// 조직 관리 역할(owner/manager/staff) 표시 라벨. 알림 문구(packages/api)와 web 팀 관리 화면이
// 공유한다. Record<string,string> + 알 수 없는 값에도 중립 폴백(enum 원값 노출 금지).
export const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
	manager: "매니저",
	owner: "소유자",
	staff: "스태프",
};

export function organizationRoleLabel(role: string): string {
	return ORGANIZATION_ROLE_LABELS[role] ?? "구성원";
}

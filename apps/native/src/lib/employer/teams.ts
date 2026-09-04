// 밤비 native — 구인자 팀 관리 화면의 순수 로직. 화면(app/(employer)/me/teams.tsx)과
// 멤버 섹션(components/team-member-section.tsx)이 공유한다. business.ts와 같은 이유로
// react-native·아이콘 모듈을 끌어오지 않아 node에서 그대로 테스트된다.

// web lib/bambi/team-labels.ts 미러. 두 앱이 패키지를 공유하지 않아 import가 불가하다.
// enum 원값이 화면에 새지 않도록 알 수 없는 값에도 중립 폴백을 준다.
export const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
	manager: "매니저",
	owner: "소유자",
	staff: "스태프",
};

export const organizationRoleLabel = (role: string): string =>
	ORGANIZATION_ROLE_LABELS[role] ?? "구성원";

export const MEMBER_STATUS_LABELS: Record<string, string> = {
	accepted: "수락됨",
	active: "활성",
	cancelled: "취소",
	expired: "만료",
	pending: "운영자 승인 대기",
	rejected: "반려됨",
};

export const memberStatusLabel = (status: string): string =>
	MEMBER_STATUS_LABELS[status] ?? "상태 확인 필요";

// bambi-screen Pill의 tone 축.
export type MemberStatusTone = "danger" | "neutral" | "success" | "warning";

export const memberStatusTone = (status: string): MemberStatusTone => {
	if (status === "active" || status === "accepted") {
		return "success";
	}

	if (status === "pending") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "neutral";
};

// 초대·역할 변경으로 지정할 수 있는 역할. owner는 여기 없다 — 서버가 setMemberRole로의
// 소유자 승격을 막는다(소유자 지정은 transferOwnership 전용).
export const ASSIGNABLE_ROLE_OPTIONS = [
	{ label: "스태프", value: "staff" },
	{ label: "매니저", value: "manager" },
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLE_OPTIONS)[number]["value"];

export interface TeamFormValues {
	displayName: string;
	districtCode: string;
	regionCode: string;
}

export interface TeamSubmitInput {
	displayName: string;
	districtCode?: string;
	regionCode: string;
}

type TeamFormErrors = Partial<Record<keyof TeamFormValues, string>>;

export type TeamFormResult =
	| { errors: TeamFormErrors; message: string; ok: false }
	| { input: TeamSubmitInput; ok: true };

// 서버 createTeamInput의 displayName 상한.
const TEAM_NAME_MAX_LENGTH = 120;

export const validateTeamForm = (values: TeamFormValues): TeamFormResult => {
	const errors: TeamFormErrors = {};
	const displayName = values.displayName.trim();

	if (displayName.length === 0) {
		errors.displayName = "팀 이름을 입력해 주세요.";
	} else if (displayName.length > TEAM_NAME_MAX_LENGTH) {
		errors.displayName = `팀 이름은 ${TEAM_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`;
	}

	if (values.regionCode.length === 0) {
		errors.regionCode = "지역을 선택해 주세요.";
	}

	const message = Object.values(errors).find(Boolean);

	if (message) {
		return { errors, message, ok: false };
	}

	return {
		input: {
			displayName,
			// 세부지역만 보내면 서버 정합 검사가 거부한다 — 시/도가 없으면 함께 비운다.
			districtCode: values.districtCode || undefined,
			regionCode: values.regionCode,
		},
		ok: true,
	};
};

// 웹 목록의 삭제 가드 문구를 사유로 돌려준다(null이면 삭제 가능). 서버는 남은 멤버를
// CONFLICT로, 미승인 조직을 FORBIDDEN으로 막으므로 두 경우 모두 버튼을 열지 않는다.
export const getTeamDeleteBlockReason = ({
	isVerified,
	memberCount,
}: {
	isVerified: boolean;
	memberCount: number;
}): null | string => {
	if (!isVerified) {
		return "운영자 승인 후 팀을 삭제할 수 있어요.";
	}

	if (memberCount > 0) {
		return `멤버 ${memberCount}명이 남아 있어요. 멤버를 모두 정리하면 삭제할 수 있어요.`;
	}

	return null;
};

export interface RegionNode {
	code: string;
	districts: { code: string; name: string }[];
	label: string;
}

// web teams/page.tsx의 `[team.region, findDistrictName(...)].join(" ")` 이식.
// team.region은 저장 시점에 서버가 복사해 둔 시/도 표시 문자열이라 지역 마스터가 아직
// 도착하지 않아도 쓸 수 있고, 세부지역명만 마스터에서 되짚는다.
export const formatTeamRegion = (
	regions: RegionNode[],
	team: {
		districtCode: null | string;
		region: null | string;
		regionCode: null | string;
	}
): string => {
	const region = regions.find((node) => node.code === team.regionCode);
	const districtName = region?.districts.find(
		(district) => district.code === team.districtCode
	)?.name;
	const parts = [team.region ?? region?.label, districtName].filter(Boolean);

	return parts.length > 0 ? parts.join(" ") : "지역 미지정";
};

export interface MemberRowLike {
	kind: "active" | "invitation";
	role: string;
	status: string;
}

export interface MemberActionPermissions {
	canChangeRole: boolean;
	canDeleteInvitation: boolean;
	canRemove: boolean;
	canResubmit: boolean;
	canSetTeams: boolean;
	canTransferOwnership: boolean;
}

const NO_MEMBER_ACTIONS: MemberActionPermissions = {
	canChangeRole: false,
	canDeleteInvitation: false,
	canRemove: false,
	canResubmit: false,
	canSetTeams: false,
	canTransferOwnership: false,
};

// 서버가 setMemberTeams·transferOwnership을 활성 멤버로만 제한한다. 메뉴에서 항목을
// 숨기지 않고 비활성으로 두고 이 사유를 함께 보여준다.
export const MEMBER_NOT_ACTIVE_REASON = "활성 멤버만 할 수 있어요.";

// 웹 MemberRowActions의 노출 규칙 + 서버 가드를 합친 판정. 소유자 행에는 아무 액션도 열지
// 않는다(서버가 setMemberRole·removeMember에서 소유자를 거부한다). 미승인 조직은
// assertOrganizationVerified에 걸리므로 전부 닫는다.
export const getMemberActionPermissions = ({
	canManageOrganization,
	isVerified,
	row,
}: {
	canManageOrganization: boolean;
	isVerified: boolean;
	row: MemberRowLike;
}): MemberActionPermissions => {
	if (!(canManageOrganization && isVerified)) {
		return NO_MEMBER_ACTIONS;
	}

	if (row.kind === "active") {
		if (row.role === "owner") {
			return NO_MEMBER_ACTIONS;
		}

		return {
			canChangeRole: true,
			canDeleteInvitation: false,
			canRemove: true,
			canResubmit: false,
			// setMemberTeams는 활성 멤버만 허용한다.
			canSetTeams: row.status === "active",
			// transferOwnership도 같은 축이다 — 초대 수락 전 멤버는 서버가 거부한다.
			canTransferOwnership: row.status === "active",
		};
	}

	// 초대 행은 반려된 건만 재제출·삭제할 수 있다(다른 상태는 서버가 CONFLICT).
	if (row.status !== "rejected") {
		return NO_MEMBER_ACTIONS;
	}

	return {
		canChangeRole: false,
		canDeleteInvitation: true,
		canRemove: false,
		canResubmit: true,
		canSetTeams: false,
		canTransferOwnership: false,
	};
};

const INVITE_REASON_MIN_LENGTH = 10;
const INVITE_REASON_MAX_LENGTH = 200;

export const getInviteReasonError = (reason: string): string => {
	const normalized = reason.trim();

	if (normalized.length < INVITE_REASON_MIN_LENGTH) {
		return `초대 사유는 ${INVITE_REASON_MIN_LENGTH}자 이상 입력해 주세요.`;
	}

	if (normalized.length > INVITE_REASON_MAX_LENGTH) {
		return `초대 사유는 ${INVITE_REASON_MAX_LENGTH}자 이하로 입력해 주세요.`;
	}

	return "";
};

export interface InviteFormValues {
	email: string;
	reason: string;
	role: AssignableRole;
	teamId: string;
}

export interface InviteSubmitInput {
	email: string;
	reason: string;
	role: AssignableRole;
	teamId?: string;
}

type InviteFormErrors = Partial<Record<"email" | "reason", string>>;

export type InviteFormResult =
	| { errors: InviteFormErrors; message: string; ok: false }
	| { input: InviteSubmitInput; ok: true };

export const validateInviteForm = (
	values: InviteFormValues
): InviteFormResult => {
	const errors: InviteFormErrors = {};
	const email = values.email.trim();

	if (email.length === 0) {
		errors.email = "초대할 구인자 계정을 선택해 주세요.";
	}

	const reasonError = getInviteReasonError(values.reason);

	if (reasonError) {
		errors.reason = reasonError;
	}

	const message = Object.values(errors).find(Boolean);

	if (message) {
		return { errors, message, ok: false };
	}

	return {
		input: {
			email,
			reason: values.reason.trim(),
			role: values.role,
			// 빈 문자열은 "전체 조직" 선택이다 — teamId를 아예 보내지 않는다.
			teamId: values.teamId || undefined,
		},
		ok: true,
	};
};

// 멤버 행 표시 이름. 초대 행은 표시 이름이 없어 이메일로 떨어진다.
export const getMemberLabel = (row: {
	displayName: null | string;
	email: string;
	invitedEmail: null | string;
}): string => row.displayName ?? row.invitedEmail ?? row.email;

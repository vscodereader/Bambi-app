import type {
	accountStatus,
	bambiGender,
	bambiUserRole,
} from "@bambi-app/db/schema/bambi";

type Role = (typeof bambiUserRole.enumValues)[number];
type Status = (typeof accountStatus.enumValues)[number];
type Gender = (typeof bambiGender.enumValues)[number];

export type CommunityAccessNotice =
	| "unverified"
	| "male_employer"
	| "male_seeker";

export interface CommunityAccessProfile {
	gender: Gender | null;
	isAdvertiser: boolean;
	role: Role;
	status: Status;
}

export interface CommunityAccess {
	canAccess: boolean;
	notice: CommunityAccessNotice | null;
}

// 수다방 입장 자격: 정지 계정이 아니고 (관리자 | 여성회원 | 광고 중 업소).
// 미자격자에게는 상황별 안내(notice)를 함께 돌려준다. isAdvertiser는 호출부가
// 라이브 파생 계산해 넘긴다(저장 컬럼을 신뢰하지 않음).
export const resolveCommunityAccess = (
	profile: CommunityAccessProfile
): CommunityAccess => {
	const active = profile.status !== "suspended";
	const canAccess =
		active &&
		(profile.role === "admin" ||
			profile.gender === "female" ||
			(profile.role === "employer" && profile.isAdvertiser));

	if (canAccess) {
		return { canAccess: true, notice: null };
	}

	let notice: CommunityAccessNotice;
	if (profile.gender === null) {
		notice = "unverified";
	} else if (profile.role === "employer") {
		notice = "male_employer";
	} else {
		notice = "male_seeker";
	}

	return { canAccess: false, notice };
};

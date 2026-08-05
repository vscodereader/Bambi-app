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

// 수다방 입장 자격: 정지 계정이 아니고 (관리자 | 법률자문 | 여성 구직자 | 광고 중 업소).
// 미자격자에게는 상황별 안내(notice)를 함께 돌려준다. isAdvertiser는 호출부가
// 라이브 파생 계산해 넘긴다(저장 컬럼을 신뢰하지 않음).
// 업소회원은 성별과 무관하게 광고 자격만 본다 — 여성 명의 업소 계정이 광고 없이
// 글을 쓰던 구멍을 막는다(여성 자격은 구직자에게 주는 것이다).
// 법률자문은 운영자가 지정한 답변 계정이라 성별·광고와 무관하게 입장한다(관리자와 같은 축).
export const resolveCommunityAccess = (
	profile: CommunityAccessProfile
): CommunityAccess => {
	const active = profile.status !== "suspended";
	const canAccess =
		active &&
		(profile.role === "admin" ||
			profile.role === "legal_advisor" ||
			(profile.role === "employer"
				? profile.isAdvertiser
				: profile.gender === "female"));

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

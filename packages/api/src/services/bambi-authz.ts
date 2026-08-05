import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	type accountStatus,
	type bambiGender,
	bambiProfile,
	type bambiUserRole,
	chatRoom,
	employerOrganizationProfile,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq, or } from "drizzle-orm";

export interface SessionLike {
	user?: {
		id?: string | null;
	} | null;
}

type BambiRole = (typeof bambiUserRole.enumValues)[number];
type AccountStatus = (typeof accountStatus.enumValues)[number];
type BambiGender = (typeof bambiGender.enumValues)[number];

export interface BambiAccessProfile {
	gender: BambiGender | null;
	isPhoneVerified: boolean;
	role: BambiRole;
	status: AccountStatus;
	userId: string;
}

// 구인 기능(조직·팀·공고·광고·분석)을 쓸 수 있는 역할. 예전에는 호출부마다
// `role === "job_seeker"`면 거부하는 식으로 뒤집어 판정했는데, 그러면 bambi_user_role에
// 값이 하나 늘 때마다(legal_advisor 등) 구직자 축 계정이 조용히 구인자 API로 새어 들어간다.
// 허용 목록으로 고정해 기본값이 "거부"가 되게 한다(기존 두 역할의 판정 결과는 그대로다).
const EMPLOYER_LIKE_ROLES = new Set<string>(["employer", "admin"]);

export const isEmployerLikeRole = (role: string): boolean =>
	EMPLOYER_LIKE_ROLES.has(role);

interface EmployerPostingAccessInput {
	organizationId: string;
	session: SessionLike | null | undefined;
	teamId?: string | null;
}

const ORGANIZATION_ADMIN_ROLES = new Set(["owner", "admin"]);

const forbidden = (message: string) => new ORPCError("FORBIDDEN", { message });

export const requireSessionUserId = (
	session: SessionLike | null | undefined
): string => {
	const userId = session?.user?.id;

	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return userId;
};

export const getBambiAccessProfile = async (
	userId: string
): Promise<BambiAccessProfile | null> => {
	const [profile] = await db
		.select({
			userId: bambiProfile.userId,
			role: bambiProfile.role,
			status: bambiProfile.status,
			isPhoneVerified: bambiProfile.isPhoneVerified,
			gender: bambiProfile.gender,
		})
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);

	return profile ?? null;
};

export const requireBambiAccessProfile = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const userId = requireSessionUserId(session);
	const profile = await getBambiAccessProfile(userId);

	if (!profile) {
		throw forbidden("Bambi profile is required for this action.");
	}

	return profile;
};

export const requireActiveBambiProfile = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireBambiAccessProfile(session);

	if (profile.status === "suspended") {
		throw forbidden("Suspended Bambi accounts cannot perform this action.");
	}

	return profile;
};

export const requireAdminProfile = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);

	if (profile.role !== "admin") {
		throw forbidden("Admin Bambi profile is required for this action.");
	}

	return profile;
};

export const requireEmployerPostingAccess = async ({
	organizationId,
	teamId,
	session,
}: EmployerPostingAccessInput): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);

	if (profile.role !== "employer" && profile.role !== "admin") {
		throw forbidden(
			"Employer or admin Bambi profile is required to post jobs."
		);
	}

	const [organizationMember] = await db
		.select({
			role: member.role,
		})
		.from(member)
		.where(
			and(
				eq(member.userId, profile.userId),
				eq(member.organizationId, organizationId)
			)
		)
		.limit(1);

	if (!organizationMember) {
		throw forbidden("Organization membership is required to post jobs.");
	}

	if (!teamId) {
		if (ORGANIZATION_ADMIN_ROLES.has(organizationMember.role)) {
			return profile;
		}

		throw forbidden("Team membership is required to create team job posts.");
	}

	const [selectedTeam] = await db
		.select({
			id: team.id,
		})
		.from(team)
		.where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
		.limit(1);

	if (!selectedTeam) {
		throw forbidden("Selected team must belong to the organization.");
	}

	if (ORGANIZATION_ADMIN_ROLES.has(organizationMember.role)) {
		return profile;
	}

	const [teamMembership] = await db
		.select({
			id: teamMember.id,
		})
		.from(teamMember)
		.where(
			and(eq(teamMember.userId, profile.userId), eq(teamMember.teamId, teamId))
		)
		.limit(1);

	if (!teamMembership) {
		throw forbidden(
			"Membership in the selected team is required to post jobs."
		);
	}

	return profile;
};

// 승인(verified)된 조직만 공고 등록·조직 설정 조작을 허용하기 위한 검사.
export const isEmployerOrganizationVerified = async (
	organizationId: string
): Promise<boolean> => {
	const [row] = await db
		.select({ status: employerOrganizationProfile.verificationStatus })
		.from(employerOrganizationProfile)
		.where(eq(employerOrganizationProfile.organizationId, organizationId))
		.limit(1);

	return row?.status === "verified";
};

export const requireChatParticipant = async (
	chatRoomId: string,
	session: SessionLike | null | undefined
) => {
	const profile = await requireActiveBambiProfile(session);
	const [room] = await db
		.select()
		.from(chatRoom)
		.where(
			and(
				eq(chatRoom.id, chatRoomId),
				or(
					eq(chatRoom.employerUserId, profile.userId),
					eq(chatRoom.jobSeekerUserId, profile.userId)
				)
			)
		)
		.limit(1);

	if (!room) {
		throw new ORPCError("NOT_FOUND", {
			message: "Chat room was not found for this user.",
		});
	}

	return { profile, room };
};

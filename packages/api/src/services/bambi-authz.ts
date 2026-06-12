import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	type accountStatus,
	bambiProfile,
	type bambiUserRole,
	chatRoom,
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

export interface BambiAccessProfile {
	isPhoneVerified: boolean;
	role: BambiRole;
	status: AccountStatus;
	userId: string;
}

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

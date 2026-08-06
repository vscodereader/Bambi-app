import { db } from "@bambi-app/db";
import {
	invitation,
	member,
	team,
	teamMember,
	user,
} from "@bambi-app/db/schema/auth";
import {
	employerOrganizationProfile,
	employerTeamProfile,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, ne } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	isEmployerLikeRole,
	isEmployerOrganizationVerified,
	requireActiveBambiProfile,
} from "../../services/bambi-authz";
import {
	canInviteMembers,
	canManageOrganization,
	normalizeOrganizationManagementRole,
	type OrganizationMembership,
} from "../../services/bambi-organization-authz";

const organizationIdInput = z.object({
	organizationId: z.string().min(1),
});

const updateProfileInput = organizationIdInput.extend({
	displayName: z.string().min(1).max(120),
});

const forbidden = (message: string) => new ORPCError("FORBIDDEN", { message });

const requireEmployerLikeProfile = async (
	session: Parameters<typeof requireActiveBambiProfile>[0]
) => {
	const profile = await requireActiveBambiProfile(session);

	if (!isEmployerLikeRole(profile.role)) {
		throw forbidden("Employer Bambi profile is required.");
	}

	return profile;
};

const getOrganizationMemberships = async (
	userId: string
): Promise<OrganizationMembership[]> =>
	await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
		})
		.from(member)
		.where(eq(member.userId, userId));

const requireOrganizationMemberAccess = async ({
	session,
}: {
	session: Parameters<typeof requireActiveBambiProfile>[0];
}) => {
	const profile = await requireEmployerLikeProfile(session);
	const organizationMemberships = await getOrganizationMemberships(
		profile.userId
	);

	return { organizationMemberships, profile };
};

const requireOrganizationManagementAccess = async ({
	organizationId,
	session,
}: {
	organizationId: string;
	session: Parameters<typeof requireActiveBambiProfile>[0];
}) => {
	const access = await requireOrganizationMemberAccess({
		session,
	});

	if (
		!canManageOrganization({
			organizationId,
			organizationMemberships: access.organizationMemberships,
		})
	) {
		throw forbidden("Organization owner access is required.");
	}

	return access;
};

const requireMemberListAccess = async ({
	organizationId,
	session,
}: {
	organizationId: string;
	session: Parameters<typeof requireActiveBambiProfile>[0];
}) => {
	const access = await requireOrganizationMemberAccess({
		session,
	});

	if (
		!canInviteMembers({
			organizationId,
			organizationMemberships: access.organizationMemberships,
		})
	) {
		throw forbidden("Organization owner or manager access is required.");
	}

	return access;
};

export const organizationsRouter = {
	getMine: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireEmployerLikeProfile(context.session);
		const rows = await db
			.select({
				businessRegistrationNumber:
					employerOrganizationProfile.businessRegistrationNumber,
				displayName: employerOrganizationProfile.displayName,
				id: employerOrganizationProfile.id,
				memberId: member.id,
				organizationId: employerOrganizationProfile.organizationId,
				role: member.role,
				verificationNote: employerOrganizationProfile.verificationNote,
				verificationStatus: employerOrganizationProfile.verificationStatus,
			})
			.from(employerOrganizationProfile)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, employerOrganizationProfile.organizationId),
					eq(member.userId, profile.userId)
				)
			)
			.orderBy(asc(employerOrganizationProfile.displayName));
		const organizationMemberships = rows.map(({ organizationId, role }) => ({
			organizationId,
			role,
		}));

		return rows
			.map((row) => {
				const normalizedRole = normalizeOrganizationManagementRole(row.role);
				const canEditOrganization = canManageOrganization({
					organizationId: row.organizationId,
					organizationMemberships,
				});
				const canInvite = canInviteMembers({
					organizationId: row.organizationId,
					organizationMemberships,
				});

				return {
					...row,
					canInviteMembers: canInvite,
					canManageOrganization: canEditOrganization,
					role: normalizedRole,
				};
			})
			.filter((row) => row.role && row.canInviteMembers);
	}),

	updateProfile: protectedProcedure
		.input(updateProfileInput)
		.handler(async ({ context, input }) => {
			await requireOrganizationManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			if (!(await isEmployerOrganizationVerified(input.organizationId))) {
				throw new ORPCError("FORBIDDEN", {
					message: "운영자 승인 후 조직 설정을 변경할 수 있습니다.",
				});
			}

			const [updated] = await db
				.update(employerOrganizationProfile)
				.set({
					displayName: input.displayName,
				})
				.where(
					eq(employerOrganizationProfile.organizationId, input.organizationId)
				)
				.returning();

			if (!updated) {
				throw new ORPCError("NOT_FOUND");
			}

			return updated;
		}),

	listMembers: protectedProcedure
		.input(organizationIdInput)
		.handler(async ({ context, input }) => {
			await requireMemberListAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			const [activeMembers, pendingInvitations, orgTeams, teamMemberships] =
				await Promise.all([
					db
						.select({
							acceptedUserId: member.acceptedUserId,
							createdAt: member.createdAt,
							displayName: user.name,
							email: user.email,
							id: member.id,
							invitedEmail: member.invitedEmail,
							role: member.role,
							status: member.status,
							updatedAt: member.updatedAt,
							userId: member.userId,
						})
						.from(member)
						.innerJoin(user, eq(member.userId, user.id))
						.where(eq(member.organizationId, input.organizationId))
						.orderBy(asc(member.createdAt)),
					db
						.select({
							acceptedUserId: invitation.acceptedUserId,
							createdAt: invitation.createdAt,
							email: invitation.email,
							id: invitation.id,
							rejectionReason: invitation.rejectionReason,
							role: invitation.role,
							status: invitation.status,
							teamId: invitation.teamId,
							updatedAt: invitation.updatedAt,
						})
						.from(invitation)
						// accepted 초대는 이미 활성 member로 합류했으므로 목록에서 제외한다
						// (중복 "수락됨" 잔여 행 방지).
						.where(
							and(
								eq(invitation.organizationId, input.organizationId),
								ne(invitation.status, "accepted")
							)
						)
						.orderBy(asc(invitation.createdAt)),
					db
						.select({
							displayName: employerTeamProfile.displayName,
							id: team.id,
							name: team.name,
						})
						.from(team)
						.leftJoin(
							employerTeamProfile,
							eq(employerTeamProfile.teamId, team.id)
						)
						.where(eq(team.organizationId, input.organizationId)),
					db
						.select({
							teamId: teamMember.teamId,
							userId: teamMember.userId,
						})
						.from(teamMember)
						.innerJoin(team, eq(teamMember.teamId, team.id))
						.where(eq(team.organizationId, input.organizationId)),
				]);

			const teamNameById = new Map(
				orgTeams.map((row) => [row.id, row.displayName ?? row.name])
			);
			const teamsByUserId = new Map<string, { id: string; name: string }[]>();
			for (const row of teamMemberships) {
				const name = teamNameById.get(row.teamId);
				if (!name) {
					continue;
				}

				const list = teamsByUserId.get(row.userId) ?? [];
				list.push({ id: row.teamId, name });
				teamsByUserId.set(row.userId, list);
			}

			const resolveInvitationTeams = (teamId: null | string) => {
				if (!teamId) {
					return [];
				}

				const name = teamNameById.get(teamId);
				return name ? [{ id: teamId, name }] : [];
			};

			return [
				...activeMembers.map((row) => ({
					...row,
					acceptedUserId: row.acceptedUserId ?? row.userId,
					invitedEmail: row.invitedEmail,
					kind: "active" as const,
					role: normalizeOrganizationManagementRole(row.role) ?? "staff",
					teams: teamsByUserId.get(row.userId) ?? [],
				})),
				...pendingInvitations.map((row) => ({
					...row,
					acceptedUserId: row.acceptedUserId,
					displayName: null,
					email: row.email,
					invitedEmail: row.email,
					kind: "invitation" as const,
					role: normalizeOrganizationManagementRole(row.role) ?? "staff",
					teams: resolveInvitationTeams(row.teamId),
					userId: null,
				})),
			];
		}),
};

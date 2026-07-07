import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import { invitation, member, team, user } from "@bambi-app/db/schema/auth";
import { bambiProfile, employerTeamProfile } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, ilike, notInArray, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import {
	canInviteMembers,
	canManageOrganization,
	normalizeOrganizationManagementRole,
	type OrganizationManagementRole,
	type OrganizationMembership,
} from "../../services/bambi-organization-authz";

const organizationRoleSchema = z.enum(["owner", "manager", "staff"]);

const organizationIdInput = z.object({
	organizationId: z.string().min(1),
});

const createTeamInput = organizationIdInput.extend({
	displayName: z.string().min(1).max(120),
	name: z.string().min(1).max(120).optional(),
	region: z.string().min(1).max(80).optional(),
});

const updateTeamInput = createTeamInput.extend({
	teamId: z.string().min(1),
});

const inviteMemberInput = organizationIdInput.extend({
	email: z.string().email().max(320),
	role: organizationRoleSchema,
	teamId: z.string().min(1).optional(),
});

const setMemberRoleInput = organizationIdInput.extend({
	memberId: z.string().min(1),
	role: organizationRoleSchema,
});

const searchEmployerInviteesInput = organizationIdInput.extend({
	query: z.string().max(320).optional(),
});

const forbidden = (message: string) => new ORPCError("FORBIDDEN", { message });

const requireEmployerLikeProfile = async (
	session: Parameters<typeof requireActiveBambiProfile>[0]
) => {
	const profile = await requireActiveBambiProfile(session);

	if (profile.role === "job_seeker") {
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

const requireOrganizationTeamManagementAccess = async ({
	organizationId,
	session,
}: {
	organizationId: string;
	session: Parameters<typeof requireActiveBambiProfile>[0];
}) => {
	const profile = await requireEmployerLikeProfile(session);
	const organizationMemberships = await getOrganizationMemberships(
		profile.userId
	);

	if (!canInviteMembers({ organizationId, organizationMemberships })) {
		throw forbidden("Organization owner or manager access is required.");
	}

	return { organizationMemberships, profile };
};

const requireOrganizationOwnerAccess = async ({
	organizationId,
	session,
}: {
	organizationId: string;
	session: Parameters<typeof requireActiveBambiProfile>[0];
}) => {
	const profile = await requireEmployerLikeProfile(session);
	const organizationMemberships = await getOrganizationMemberships(
		profile.userId
	);

	if (!canManageOrganization({ organizationId, organizationMemberships })) {
		throw forbidden("Organization owner access is required.");
	}

	return { organizationMemberships, profile };
};

const assertTeamBelongsToOrganization = async ({
	organizationId,
	teamId,
}: {
	organizationId: string;
	teamId: string;
}): Promise<void> => {
	const [selectedTeam] = await db
		.select({ id: team.id })
		.from(team)
		.where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
		.limit(1);

	if (!selectedTeam) {
		throw forbidden("Selected team must belong to the organization.");
	}
};

const getExpiresAt = () => {
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 14);
	return expiresAt;
};

const toStoredRole = (
	role: OrganizationManagementRole
): OrganizationManagementRole => role;

export const teamsRouter = {
	list: protectedProcedure
		.input(organizationIdInput)
		.handler(async ({ context, input }) => {
			await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			return await db
				.select({
					createdAt: team.createdAt,
					displayName: employerTeamProfile.displayName,
					id: team.id,
					organizationId: team.organizationId,
					region: employerTeamProfile.region,
					teamId: team.id,
					updatedAt: team.updatedAt,
				})
				.from(team)
				.leftJoin(employerTeamProfile, eq(employerTeamProfile.teamId, team.id))
				.where(eq(team.organizationId, input.organizationId))
				.orderBy(asc(team.name));
		}),

	create: protectedProcedure
		.input(createTeamInput)
		.handler(async ({ context, input }) => {
			await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			const now = new Date();
			const teamId = `team_${randomUUID()}`;
			const teamName = input.name ?? input.displayName;

			return await db.transaction(async (tx) => {
				const [createdTeam] = await tx
					.insert(team)
					.values({
						createdAt: now,
						id: teamId,
						name: teamName,
						organizationId: input.organizationId,
						updatedAt: now,
					})
					.returning();
				const [createdProfile] = await tx
					.insert(employerTeamProfile)
					.values({
						displayName: input.displayName,
						organizationId: input.organizationId,
						region: input.region,
						teamId,
					})
					.returning();

				return { ...createdProfile, name: createdTeam?.name, teamId };
			});
		}),

	update: protectedProcedure
		.input(updateTeamInput)
		.handler(async ({ context, input }) => {
			await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertTeamBelongsToOrganization({
				organizationId: input.organizationId,
				teamId: input.teamId,
			});

			return await db.transaction(async (tx) => {
				const [updatedTeam] = await tx
					.update(team)
					.set({
						name: input.name ?? input.displayName,
						updatedAt: new Date(),
					})
					.where(eq(team.id, input.teamId))
					.returning();
				const [updatedProfile] = await tx
					.update(employerTeamProfile)
					.set({
						displayName: input.displayName,
						region: input.region,
					})
					.where(eq(employerTeamProfile.teamId, input.teamId))
					.returning();

				if (!(updatedTeam && updatedProfile)) {
					throw new ORPCError("NOT_FOUND");
				}

				return { ...updatedProfile, name: updatedTeam.name };
			});
		}),

	inviteMember: protectedProcedure
		.input(inviteMemberInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			if (input.teamId) {
				await assertTeamBelongsToOrganization({
					organizationId: input.organizationId,
					teamId: input.teamId,
				});
			}

			const [created] = await db
				.insert(invitation)
				.values({
					email: input.email.toLowerCase(),
					expiresAt: getExpiresAt(),
					id: `invitation_${randomUUID()}`,
					inviterId: profile.userId,
					organizationId: input.organizationId,
					role: toStoredRole(input.role),
					status: "pending",
					teamId: input.teamId,
				})
				.returning();

			return created;
		}),

	searchEmployerInvitees: protectedProcedure
		.input(searchEmployerInviteesInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			// 제외 대상: 이미 이 조직의 멤버인 유저.
			const existingMembers = await db
				.select({ userId: member.userId })
				.from(member)
				.where(eq(member.organizationId, input.organizationId));
			const excludedUserIds = [
				profile.userId,
				...existingMembers
					.map((row) => row.userId)
					.filter((id): id is string => Boolean(id)),
			];

			// 제외 대상: 이미 pending 초대가 있는 이메일.
			const pendingInvites = await db
				.select({ email: invitation.email })
				.from(invitation)
				.where(
					and(
						eq(invitation.organizationId, input.organizationId),
						eq(invitation.status, "pending")
					)
				);
			const pendingEmails = pendingInvites.map((row) =>
				row.email.toLowerCase()
			);
			// 빈 배열이면 notInArray가 안전하지 않으므로 조건 자체를 생략한다.
			const pendingEmailFilter =
				pendingEmails.length > 0
					? notInArray(user.email, pendingEmails)
					: undefined;

			const trimmed = input.query?.trim();
			const searchFilter = trimmed
				? or(
						ilike(user.email, `%${trimmed}%`),
						ilike(user.name, `%${trimmed}%`)
					)
				: undefined;

			// pending 초대 이메일 제외를 SQL WHERE로 넣어 LIMIT 10이 완전히
			// 필터된 집합에 적용되게 한다(이름순 자른 뒤 후처리로 버리지 않음).
			return await db
				.select({
					userId: user.id,
					email: user.email,
					name: user.name,
				})
				.from(bambiProfile)
				.innerJoin(user, eq(user.id, bambiProfile.userId))
				.where(
					and(
						eq(bambiProfile.role, "employer"),
						notInArray(user.id, excludedUserIds),
						searchFilter,
						pendingEmailFilter
					)
				)
				.orderBy(asc(user.name))
				.limit(10);
		}),

	setMemberRole: protectedProcedure
		.input(setMemberRoleInput)
		.handler(async ({ context, input }) => {
			await requireOrganizationOwnerAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			const [targetMember] = await db
				.select({ id: member.id })
				.from(member)
				.where(
					and(
						eq(member.id, input.memberId),
						eq(member.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!targetMember) {
				throw new ORPCError("NOT_FOUND");
			}

			const normalizedRole = normalizeOrganizationManagementRole(input.role);

			if (!normalizedRole) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid organization role.",
				});
			}

			const [updated] = await db
				.update(member)
				.set({
					role: toStoredRole(normalizedRole),
					updatedAt: new Date(),
				})
				.where(eq(member.id, input.memberId))
				.returning();

			return updated;
		}),
};

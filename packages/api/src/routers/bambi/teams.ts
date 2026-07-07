import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import { invitation, member, team, user } from "@bambi-app/db/schema/auth";
import { bambiProfile, employerTeamProfile } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, ilike, notInArray, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	isEmployerOrganizationVerified,
	requireActiveBambiProfile,
} from "../../services/bambi-authz";
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

// 승인(verified)되지 않은 조직은 팀 관리 조작을 막는다. admin(bambi role)은 예외.
const assertOrganizationVerified = async ({
	organizationId,
	profile,
}: {
	organizationId: string;
	profile: { role: string };
}): Promise<void> => {
	if (
		profile.role !== "admin" &&
		!(await isEmployerOrganizationVerified(organizationId))
	) {
		throw forbidden("운영자 승인 후 팀을 관리할 수 있습니다.");
	}
};

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
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
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
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
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
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			if (input.teamId) {
				await assertTeamBelongsToOrganization({
					organizationId: input.organizationId,
					teamId: input.teamId,
				});
			}

			// 초대 대상은 현재 employer로 가입된 계정만 허용한다.
			const normalizedEmail = input.email.toLowerCase();
			const [invitee] = await db
				.select({ role: bambiProfile.role })
				.from(user)
				.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
				.where(eq(user.email, normalizedEmail))
				.limit(1);

			if (invitee?.role !== "employer") {
				throw forbidden("구인자로 가입된 계정만 초대할 수 있습니다.");
			}

			const [created] = await db
				.insert(invitation)
				.values({
					email: normalizedEmail,
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

			// 검색어가 비어 있으면 전체 구인자를 노출하지 않고 빈 결과를 반환한다.
			if (!input.query?.trim()) {
				return [];
			}

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
			const { profile } = await requireOrganizationOwnerAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			const [targetMember] = await db
				.select({ id: member.id, role: member.role })
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

			// 소유자(owner)의 권한은 변경할 수 없다. 실수로 소유권을 잃는 것을 막는다.
			if (normalizeOrganizationManagementRole(targetMember.role) === "owner") {
				throw forbidden("소유자의 권한은 변경할 수 없습니다.");
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

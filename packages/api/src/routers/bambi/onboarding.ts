import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	employerOrganizationProfile,
	employerTeamProfile,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { getJobPostingScopes } from "../../services/bambi-job-access";
import {
	assertCanCreateBambiProfile,
	assertCanManageEmployerProfile,
	assertCanUpdateOwnBambiProfile,
	type BambiProfileRole,
	type OrganizationRole,
} from "../../services/bambi-onboarding";

const profileInput = z.object({
	displayName: z.string().min(1).max(80).optional(),
	phoneNumber: z.string().min(3).max(30).optional(),
});

const profileUpdateInput = profileInput.extend({
	role: z.enum(["job_seeker", "employer", "admin"]).optional(),
});

const organizationProfileInput = z.object({
	organizationId: z.string().min(1),
	displayName: z.string().min(1).max(120),
	businessRegistrationNumber: z.string().min(1).max(40).optional(),
});

const teamProfileInput = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1),
	displayName: z.string().min(1).max(120),
	region: z.string().min(1).max(80).optional(),
});

const requestEmployerVerificationInput = z.object({
	organizationId: z.string().min(1),
});

const ORGANIZATION_ROLES = new Set<OrganizationRole>([
	"owner",
	"admin",
	"member",
]);

const toOrganizationRole = (role: string | null | undefined) =>
	ORGANIZATION_ROLES.has(role as OrganizationRole)
		? (role as OrganizationRole)
		: null;

const requireManageableOrganizationRole = async ({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<void> => {
	const [organizationMember] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId))
		)
		.limit(1);

	const organizationRole = toOrganizationRole(organizationMember?.role);
	assertCanManageEmployerProfile({ organizationRole });
};

const requireEmployerBambiProfile = async (userId: string) => {
	const [profile] = await db
		.select()
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);

	if (!profile || profile.role === "job_seeker") {
		throw new ORPCError("FORBIDDEN", {
			message: "Employer Bambi profile is required.",
		});
	}

	return profile;
};

const createBambiProfile = async ({
	displayName,
	phoneNumber,
	role,
	userId,
}: {
	displayName?: string;
	phoneNumber?: string;
	role: BambiProfileRole;
	userId: string;
}) => {
	const [existingProfile] = await db
		.select({ role: bambiProfile.role })
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);

	assertCanCreateBambiProfile({ existingRole: existingProfile?.role });

	const [createdProfile] = await db
		.insert(bambiProfile)
		.values({
			userId,
			role,
			displayName,
			phoneNumber,
		})
		.returning();

	return createdProfile;
};

export const onboardingRouter = {
	getMine: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const [profile] = await db
			.select()
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId))
			.limit(1);

		const organizationProfiles = await db
			.select({
				id: employerOrganizationProfile.id,
				organizationId: employerOrganizationProfile.organizationId,
				role: member.role,
				displayName: employerOrganizationProfile.displayName,
				businessRegistrationNumber:
					employerOrganizationProfile.businessRegistrationNumber,
				verificationStatus: employerOrganizationProfile.verificationStatus,
				verificationNote: employerOrganizationProfile.verificationNote,
				createdAt: employerOrganizationProfile.createdAt,
				updatedAt: employerOrganizationProfile.updatedAt,
			})
			.from(employerOrganizationProfile)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, employerOrganizationProfile.organizationId),
					eq(member.userId, userId)
				)
			);

		const teamProfiles = await db
			.select({
				id: employerTeamProfile.id,
				organizationId: employerTeamProfile.organizationId,
				teamId: employerTeamProfile.teamId,
				displayName: employerTeamProfile.displayName,
				region: employerTeamProfile.region,
				createdAt: employerTeamProfile.createdAt,
				updatedAt: employerTeamProfile.updatedAt,
			})
			.from(employerTeamProfile)
			.innerJoin(
				teamMember,
				and(
					eq(teamMember.teamId, employerTeamProfile.teamId),
					eq(teamMember.userId, userId)
				)
			);
		const postingScopes = getJobPostingScopes({
			organizationMemberships: organizationProfiles.map(
				({ organizationId, role }) => ({
					organizationId,
					role,
				})
			),
			teamMemberships: teamProfiles.map(({ organizationId, teamId }) => ({
				organizationId,
				teamId,
			})),
		});
		const organizationProfileById = new Map(
			organizationProfiles.map((organizationProfile) => [
				organizationProfile.organizationId,
				organizationProfile,
			])
		);
		const teamProfileById = new Map(
			teamProfiles.map((teamProfile) => [teamProfile.teamId, teamProfile])
		);

		return {
			bambiProfile: profile ?? null,
			employerOrganizationProfiles: organizationProfiles,
			employerTeamProfiles: teamProfiles,
			employerJobPostingScopes: postingScopes.map((scope) => {
				const organizationProfile = organizationProfileById.get(
					scope.organizationId
				);
				const teamProfile = scope.teamId
					? teamProfileById.get(scope.teamId)
					: undefined;

				return {
					organizationDisplayName:
						organizationProfile?.displayName ?? scope.organizationId,
					organizationId: scope.organizationId,
					scopeType: scope.scopeType,
					teamDisplayName: teamProfile?.displayName ?? null,
					teamId: scope.teamId ?? null,
				};
			}),
		};
	}),

	updateMyProfile: protectedProcedure
		.input(profileUpdateInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const [existingProfile] = await db
				.select({ role: bambiProfile.role })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
				.limit(1);

			assertCanUpdateOwnBambiProfile({
				existingRole: existingProfile?.role,
				hasPersonalProfileChanges:
					input.displayName !== undefined || input.phoneNumber !== undefined,
				requestedRole: input.role,
			});

			const [updatedProfile] = await db
				.update(bambiProfile)
				.set({
					displayName: input.displayName,
					phoneNumber: input.phoneNumber,
				})
				.where(eq(bambiProfile.userId, userId))
				.returning();

			return updatedProfile;
		}),

	createJobSeekerProfile: protectedProcedure
		.input(profileInput)
		.handler(async ({ context, input }) =>
			createBambiProfile({
				...input,
				role: "job_seeker",
				userId: context.session.user.id,
			})
		),

	createEmployerProfile: protectedProcedure
		.input(profileInput)
		.handler(async ({ context, input }) =>
			createBambiProfile({
				...input,
				role: "employer",
				userId: context.session.user.id,
			})
		),

	upsertEmployerOrganizationProfile: protectedProcedure
		.input(organizationProfileInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;

			await requireManageableOrganizationRole({
				organizationId: input.organizationId,
				userId,
			});
			await requireEmployerBambiProfile(userId);

			const [profile] = await db
				.insert(employerOrganizationProfile)
				.values(input)
				.onConflictDoUpdate({
					target: employerOrganizationProfile.organizationId,
					set: {
						displayName: input.displayName,
						businessRegistrationNumber: input.businessRegistrationNumber,
						updatedAt: new Date(),
					},
				})
				.returning();

			return profile;
		}),

	upsertEmployerTeamProfile: protectedProcedure
		.input(teamProfileInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;

			await requireManageableOrganizationRole({
				organizationId: input.organizationId,
				userId,
			});
			await requireEmployerBambiProfile(userId);

			const [selectedTeam] = await db
				.select({ id: team.id })
				.from(team)
				.where(
					and(
						eq(team.id, input.teamId),
						eq(team.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!selectedTeam) {
				throw new ORPCError("FORBIDDEN", {
					message: "Selected team must belong to the organization.",
				});
			}

			const [profile] = await db
				.insert(employerTeamProfile)
				.values(input)
				.onConflictDoUpdate({
					target: employerTeamProfile.teamId,
					set: {
						organizationId: input.organizationId,
						displayName: input.displayName,
						region: input.region,
						updatedAt: new Date(),
					},
				})
				.returning();

			return profile;
		}),

	requestEmployerVerification: protectedProcedure
		.input(requestEmployerVerificationInput)
		.handler(async ({ context, input }) => {
			await requireManageableOrganizationRole({
				organizationId: input.organizationId,
				userId: context.session.user.id,
			});

			const [profile] = await db
				.select()
				.from(employerOrganizationProfile)
				.where(
					eq(employerOrganizationProfile.organizationId, input.organizationId)
				)
				.limit(1);

			if (!profile) {
				throw new ORPCError("NOT_FOUND");
			}

			if (profile.verificationStatus === "verified") {
				return profile;
			}

			const [updatedProfile] = await db
				.update(employerOrganizationProfile)
				.set({
					verificationStatus: "pending",
					updatedAt: new Date(),
				})
				.where(
					eq(employerOrganizationProfile.organizationId, input.organizationId)
				)
				.returning();

			return updatedProfile;
		}),
};

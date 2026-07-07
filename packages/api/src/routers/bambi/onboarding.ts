import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import {
	member,
	organization,
	team,
	teamMember,
} from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	employerOrganizationProfile,
	employerTeamProfile,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { isEmployerOrganizationVerified } from "../../services/bambi-authz";
import {
	getJobPostingScopes,
	ORGANIZATION_WIDE_POSTING_ROLES,
} from "../../services/bambi-job-access";
import {
	assertCanCreateBambiProfile,
	assertCanManageEmployerProfile,
	assertCanUpdateOwnBambiProfile,
	type BambiProfileRole,
	deriveEmployerApprovalStatus,
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

const submitEmployerBusinessInfoInput = z.object({
	displayName: z.string().min(1).max(120),
	businessRegistrationNumber: z
		.string()
		.regex(
			/^\d{3}-\d{2}-\d{5}$/,
			"사업자등록번호는 000-00-00000 형식이어야 합니다."
		),
});

const toOrganizationSlug = (name: string): string => {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9가-힣]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 40);
	return `${base || "org"}-${randomUUID().slice(0, 8)}`;
};

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

		const teamProfileColumns = {
			id: employerTeamProfile.id,
			organizationId: employerTeamProfile.organizationId,
			teamId: employerTeamProfile.teamId,
			displayName: employerTeamProfile.displayName,
			region: employerTeamProfile.region,
			createdAt: employerTeamProfile.createdAt,
			updatedAt: employerTeamProfile.updatedAt,
		};
		const teamProfiles = await db
			.select(teamProfileColumns)
			.from(employerTeamProfile)
			.innerJoin(
				teamMember,
				and(
					eq(teamMember.teamId, employerTeamProfile.teamId),
					eq(teamMember.userId, userId)
				)
			);

		// owner/admin(조직 전체 공고를 낼 수 있는 역할)인 조직의 팀은 본인이
		// teamMember인지와 무관하게 공고 등록 범위에 노출한다.
		const organizationWidePostingOrganizationIds = organizationProfiles
			.filter(({ role }) => ORGANIZATION_WIDE_POSTING_ROLES.has(role))
			.map(({ organizationId }) => organizationId);
		const organizationWideTeamProfiles =
			organizationWidePostingOrganizationIds.length > 0
				? await db
						.select(teamProfileColumns)
						.from(employerTeamProfile)
						.where(
							inArray(
								employerTeamProfile.organizationId,
								organizationWidePostingOrganizationIds
							)
						)
				: [];

		// 내 공고 팀 프로필(teamMember 기준)과 owner/admin 조직 전체 팀을 합쳐
		// teamId 기준으로 중복을 제거한다. 공고 등록 범위 계산과 라벨 조회에 쓴다.
		const teamProfileById = new Map(
			[...teamProfiles, ...organizationWideTeamProfiles].map((teamProfile) => [
				teamProfile.teamId,
				teamProfile,
			])
		);
		const postingScopeTeamProfiles = [...teamProfileById.values()];

		const postingScopes = getJobPostingScopes({
			organizationMemberships: organizationProfiles.map(
				({ organizationId, role }) => ({
					organizationId,
					role,
				})
			),
			teamMemberships: postingScopeTeamProfiles.map(
				({ organizationId, teamId }) => ({
					organizationId,
					teamId,
				})
			),
		});
		const organizationProfileById = new Map(
			organizationProfiles.map((organizationProfile) => [
				organizationProfile.organizationId,
				organizationProfile,
			])
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

	getMyRouting: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const [profile] = await db
			.select({ role: bambiProfile.role })
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId))
			.limit(1);

		if (!profile) {
			return { role: null, employerApprovalStatus: "none" as const };
		}

		if (profile.role !== "employer") {
			return { role: profile.role, employerApprovalStatus: "none" as const };
		}

		const orgProfiles = await db
			.select({
				verificationStatus: employerOrganizationProfile.verificationStatus,
			})
			.from(employerOrganizationProfile)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, employerOrganizationProfile.organizationId),
					eq(member.userId, userId)
				)
			);

		return {
			role: profile.role,
			employerApprovalStatus: deriveEmployerApprovalStatus(
				orgProfiles.map((row) => row.verificationStatus)
			),
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
			const employerProfile = await requireEmployerBambiProfile(userId);

			if (
				employerProfile.role !== "admin" &&
				!(await isEmployerOrganizationVerified(input.organizationId))
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "운영자 승인 후 조직 설정을 변경할 수 있습니다.",
				});
			}

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
			const employerProfile = await requireEmployerBambiProfile(userId);

			if (
				employerProfile.role !== "admin" &&
				!(await isEmployerOrganizationVerified(input.organizationId))
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "운영자 승인 후 팀 설정을 변경할 수 있습니다.",
				});
			}

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

	submitEmployerBusinessInfo: protectedProcedure
		.input(submitEmployerBusinessInfoInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			await requireEmployerBambiProfile(userId);

			// 본인이 owner인 조직이 이미 있으면 그 조직 프로필을 갱신하고 재심사(pending)로 돌린다.
			const [ownedOrg] = await db
				.select({
					organizationId: employerOrganizationProfile.organizationId,
				})
				.from(employerOrganizationProfile)
				.innerJoin(
					member,
					and(
						eq(
							member.organizationId,
							employerOrganizationProfile.organizationId
						),
						eq(member.userId, userId),
						eq(member.role, "owner")
					)
				)
				.limit(1);

			if (ownedOrg) {
				await db
					.update(employerOrganizationProfile)
					.set({
						displayName: input.displayName,
						businessRegistrationNumber: input.businessRegistrationNumber,
						verificationStatus: "pending",
						updatedAt: new Date(),
					})
					.where(
						eq(
							employerOrganizationProfile.organizationId,
							ownedOrg.organizationId
						)
					);

				return {
					organizationId: ownedOrg.organizationId,
					verificationStatus: "pending" as const,
				};
			}

			const organizationId = `org_${randomUUID()}`;
			const now = new Date();

			await db.transaction(async (tx) => {
				await tx.insert(organization).values({
					id: organizationId,
					name: input.displayName,
					slug: toOrganizationSlug(input.displayName),
					createdAt: now,
				});
				await tx.insert(member).values({
					id: `member_${randomUUID()}`,
					organizationId,
					userId,
					role: "owner",
					createdAt: now,
				});
				await tx.insert(employerOrganizationProfile).values({
					organizationId,
					displayName: input.displayName,
					businessRegistrationNumber: input.businessRegistrationNumber,
					verificationStatus: "pending",
				});
			});

			return { organizationId, verificationStatus: "pending" as const };
		}),
};

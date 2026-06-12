import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	employerOrganizationProfile,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
} from "../../services/bambi-authz";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import {
	type EmployerVerificationStatus,
	getInitialJobPostStatus,
	getUpdatedJobPostStatus,
	type JobPostStatus,
} from "../../services/bambi-policy";

const jobPostInput = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1).optional(),
	title: z.string().min(2).max(80),
	industryCategory: z.string().min(1).max(80),
	region: z.string().min(1).max(80),
	payAmount: z.number().int().positive(),
	payUnit: z.string().min(1).max(30),
	workSchedule: z.string().min(1).max(200),
	description: z.string().min(10).max(2000),
	interviewNotes: z.string().max(500).optional(),
});

const listInput = z.object({
	industryCategory: z.string().min(1).max(80).optional(),
	region: z.string().min(1).max(80).optional(),
	minPayAmount: z.number().int().positive().optional(),
	limit: z.number().int().min(1).max(50).default(20),
});

const hasRiskFlags = (input: z.infer<typeof jobPostInput>): boolean => {
	const text = `${input.title} ${input.description} ${input.interviewNotes ?? ""}`;
	const riskyTerms = ["미성년", "성매매", "강요"];

	return riskyTerms.some((term) => text.includes(term));
};

export const jobsRouter = {
	list: publicProcedure.input(listInput).handler(async ({ input }) => {
		const filters = [eq(jobPost.status, "published" as JobPostStatus)];

		if (input.industryCategory) {
			filters.push(eq(jobPost.industryCategory, input.industryCategory));
		}

		if (input.region) {
			filters.push(eq(jobPost.region, input.region));
		}

		if (input.minPayAmount) {
			filters.push(sql`${jobPost.payAmount} >= ${input.minPayAmount}`);
		}

		return await db
			.select({
				id: jobPost.id,
				title: jobPost.title,
				industryCategory: jobPost.industryCategory,
				region: jobPost.region,
				payAmount: jobPost.payAmount,
				payUnit: jobPost.payUnit,
				status: jobPost.status,
				employerVerificationStatus:
					employerOrganizationProfile.verificationStatus,
				publishedAt: jobPost.publishedAt,
			})
			.from(jobPost)
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.where(and(...filters))
			.orderBy(
				sql`case when ${employerOrganizationProfile.verificationStatus} = 'verified' then 0 else 1 end`,
				desc(jobPost.publishedAt)
			)
			.limit(input.limit);
	}),

	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ input }) => {
			const [post] = await db
				.select()
				.from(jobPost)
				.where(eq(jobPost.id, input.id))
				.limit(1);

			if (post?.status !== "published") {
				throw new ORPCError("NOT_FOUND");
			}

			return post;
		}),

	listMine: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		if (profile.role === "job_seeker") {
			throw new ORPCError("FORBIDDEN");
		}

		const organizationMemberships = await db
			.select({
				organizationId: member.organizationId,
				role: member.role,
			})
			.from(member)
			.where(eq(member.userId, profile.userId));
		const teamMemberships = await db
			.select({
				organizationId: team.organizationId,
				teamId: teamMember.teamId,
			})
			.from(teamMember)
			.innerJoin(team, eq(teamMember.teamId, team.id))
			.where(eq(teamMember.userId, profile.userId));
		const organizationIds = organizationMemberships.map(
			(membership) => membership.organizationId
		);
		const manageableOrganizationIds = organizationMemberships
			.filter(
				(membership) =>
					membership.role === "owner" || membership.role === "admin"
			)
			.map((membership) => membership.organizationId);
		const accessibleTeamPostScopes = getAccessibleTeamPostScopes({
			organizationIds,
			teamMemberships,
		});
		const accessFilters = [eq(jobPost.createdByUserId, profile.userId)];

		if (manageableOrganizationIds.length > 0) {
			accessFilters.push(
				inArray(jobPost.organizationId, manageableOrganizationIds)
			);
		}

		for (const scope of accessibleTeamPostScopes) {
			const teamAccessFilter = and(
				eq(jobPost.organizationId, scope.organizationId),
				eq(jobPost.teamId, scope.teamId)
			);

			if (teamAccessFilter) {
				accessFilters.push(teamAccessFilter);
			}
		}

		return await db
			.select({
				id: jobPost.id,
				title: jobPost.title,
				industryCategory: jobPost.industryCategory,
				region: jobPost.region,
				payAmount: jobPost.payAmount,
				payUnit: jobPost.payUnit,
				status: jobPost.status,
				organizationId: jobPost.organizationId,
				teamId: jobPost.teamId,
				createdByUserId: jobPost.createdByUserId,
				employerVerificationStatus:
					employerOrganizationProfile.verificationStatus,
				createdAt: jobPost.createdAt,
				updatedAt: jobPost.updatedAt,
			})
			.from(jobPost)
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.where(or(...accessFilters))
			.orderBy(desc(jobPost.updatedAt));
	}),

	getEditableById: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const [post] = await db
				.select()
				.from(jobPost)
				.where(eq(jobPost.id, input.id))
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			await requireEmployerPostingAccess({
				organizationId: post.organizationId,
				teamId: post.teamId,
				session: context.session,
			});

			return post;
		}),

	create: protectedProcedure
		.input(jobPostInput)
		.handler(async ({ context, input }) => {
			const actor = await requireEmployerPostingAccess({
				organizationId: input.organizationId,
				teamId: input.teamId,
				session: context.session,
			});
			const [organizationProfile] = await db
				.select()
				.from(employerOrganizationProfile)
				.where(
					eq(employerOrganizationProfile.organizationId, input.organizationId)
				)
				.limit(1);

			if (!organizationProfile) {
				throw new ORPCError("FORBIDDEN", {
					message: "Employer organization profile is required.",
				});
			}

			const riskDetected = hasRiskFlags(input);
			const status = getInitialJobPostStatus({
				employerVerificationStatus:
					organizationProfile.verificationStatus as EmployerVerificationStatus,
				hasRiskFlags: riskDetected,
			});
			const now = new Date();

			const [created] = await db
				.insert(jobPost)
				.values({
					...input,
					createdByUserId: actor.userId,
					status,
					riskFlags: riskDetected ? ["risky_term"] : [],
					publishedAt: status === "published" ? now : null,
				})
				.returning();

			return created;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				data: jobPostInput,
			})
		)
		.handler(async ({ context, input }) => {
			const [existing] = await db
				.select()
				.from(jobPost)
				.where(eq(jobPost.id, input.id))
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			await requireEmployerPostingAccess({
				organizationId: existing.organizationId,
				teamId: existing.teamId,
				session: context.session,
			});

			if (
				input.data.organizationId !== existing.organizationId ||
				(input.data.teamId ?? null) !== (existing.teamId ?? null)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Changing a job post organization or team is not supported.",
				});
			}

			const [organizationProfile] = await db
				.select()
				.from(employerOrganizationProfile)
				.where(
					eq(
						employerOrganizationProfile.organizationId,
						existing.organizationId
					)
				)
				.limit(1);

			if (!organizationProfile) {
				throw new ORPCError("FORBIDDEN", {
					message: "Employer organization profile is required.",
				});
			}

			const riskDetected = hasRiskFlags(input.data);
			const status: JobPostStatus = riskDetected
				? "pending_review"
				: getUpdatedJobPostStatus({
						currentStatus: existing.status as JobPostStatus,
						employerVerificationStatus:
							organizationProfile.verificationStatus as EmployerVerificationStatus,
						publicContentChanged: true,
					});
			const [updated] = await db
				.update(jobPost)
				.set({
					...input.data,
					status,
					riskFlags: riskDetected ? ["risky_term"] : [],
					publishedAt:
						status === "published" && !existing.publishedAt
							? new Date()
							: existing.publishedAt,
				})
				.where(eq(jobPost.id, input.id))
				.returning();

			return updated;
		}),
};

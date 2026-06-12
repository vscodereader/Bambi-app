import { db } from "@bambi-app/db";
import {
	employerOrganizationProfile,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";
import { requireEmployerPostingAccess } from "../../services/bambi-authz";
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

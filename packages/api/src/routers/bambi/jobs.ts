import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	employerOrganizationProfile,
	employerTeamProfile,
	jobPost,
	jobPostMedia,
	jobPromotionCampaign,
	review,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";
import {
	getRecentJobPerformanceMetrics,
	recordJobListingImpressions,
	recordJobPerformanceEvent,
} from "../../services/bambi-analytics";
import {
	isEmployerOrganizationVerified,
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
} from "../../services/bambi-authz";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import {
	getJobDescriptionBlockRiskTerms,
	jobDescriptionBlockTypes,
	normalizeJobDescriptionBlocks,
	toPlainJobDescription,
	validateJobDescriptionBlocks,
} from "../../services/bambi-job-description-blocks";
import {
	JOB_POST_DETAIL_IMAGE_LIMIT,
	JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH,
	type JobPostMediaPolicyInput,
	validateJobPostImageUpload,
	validateJobPostMediaSet,
} from "../../services/bambi-job-media-policy";
import {
	type EmployerVerificationStatus,
	getInitialJobPostStatus,
	getUpdatedJobPostStatus,
	type JobPostStatus,
} from "../../services/bambi-policy";
import {
	buildPublicJobSections,
	type PublicPromotedJobListRow,
} from "../../services/bambi-promotions";
import {
	createJobPostMediaUploadIntent,
	isOwnedJobPostMediaKey,
} from "../../services/bambi-storage";
import { deletePublicObjects } from "../../services/gcs";

const jobDescriptionBlockInput = z.object({
	id: z.string().min(1).max(80),
	text: z.string().max(800),
	type: z.enum(jobDescriptionBlockTypes),
});

const jobPostMediaInput = z.object({
	altText: z.string().max(JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH).default(""),
	byteSize: z.number().int().min(1),
	fileName: z.string().max(180),
	mimeType: z.string().min(1).max(120),
	storageKey: z.string().min(1).max(512),
});

const jobPostMediaSetInput = z
	.object({
		cover: jobPostMediaInput.optional(),
		detail: z
			.array(jobPostMediaInput)
			.max(JOB_POST_DETAIL_IMAGE_LIMIT)
			.default([]),
	})
	.optional();

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
	descriptionBlocks: z.array(jobDescriptionBlockInput).max(12).optional(),
	interviewNotes: z.string().max(500).optional(),
	media: jobPostMediaSetInput,
});

const createMediaUploadInput = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1).optional(),
	fileName: z.string().max(180),
	mimeType: z.string().min(1).max(120),
	byteSize: z.number().int().min(1),
});

const listInput = z.object({
	industryCategory: z.string().min(1).max(80).optional(),
	region: z.string().min(1).max(80).optional(),
	minPayAmount: z.number().int().positive().optional(),
	limit: z.number().int().min(1).max(50).default(20),
});

type JobPostInput = z.infer<typeof jobPostInput>;
type JobPostMediaSetInput = z.infer<typeof jobPostMediaSetInput>;

interface PreparedJobPostContent {
	description: string;
	descriptionBlocks: NonNullable<JobPostInput["descriptionBlocks"]>;
	hasRiskFlags: boolean;
}

interface JobPostMediaRowInput extends JobPostMediaPolicyInput {
	position: number;
}

interface BuildJobPostMediaRowsInput {
	actorUserId: string;
	jobPostId: string;
	media: JobPostMediaSetInput;
	organizationId: string;
}

const RISKY_TERMS = ["미성년", "성매매", "강요"] as const;

const hasRiskFlags = ({
	blockRiskTerms,
	description,
	interviewNotes,
	title,
}: {
	blockRiskTerms: string[];
	description: string;
	interviewNotes?: string;
	title: string;
}): boolean => {
	const text = `${title} ${description} ${interviewNotes ?? ""}`;

	return (
		blockRiskTerms.length > 0 || RISKY_TERMS.some((term) => text.includes(term))
	);
};

const getJobPostPolicyErrorMessage = (code: string): string => {
	switch (code) {
		case "alt_text_too_long":
			return "Job post media alt text is too long.";
		case "block_text_too_long":
			return "Job description block text is too long.";
		case "empty_block_text":
			return "Job description block text is required.";
		case "empty_file_name":
			return "Job post media filename is required.";
		case "file_too_large":
			return "Job post media file is too large.";
		case "too_many_blocks":
			return "Job post has too many description blocks.";
		case "too_many_cover_images":
			return "Job post can have only one cover image.";
		case "too_many_detail_images":
			return "Job post can have up to five detail images.";
		case "unsupported_block_type":
			return "Job description block type is not supported.";
		default:
			return "Job post media file type is not supported.";
	}
};

const prepareJobPostContent = (input: JobPostInput): PreparedJobPostContent => {
	const descriptionBlocks = input.descriptionBlocks ?? [];
	const validation = validateJobDescriptionBlocks(descriptionBlocks);

	if (!validation.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: getJobPostPolicyErrorMessage(validation.issues[0]?.code ?? ""),
		});
	}

	const normalizedBlocks = normalizeJobDescriptionBlocks(descriptionBlocks);
	const description =
		normalizedBlocks.length > 0
			? toPlainJobDescription(normalizedBlocks)
			: input.description.trim();
	const blockRiskTerms = getJobDescriptionBlockRiskTerms(normalizedBlocks);

	return {
		description,
		descriptionBlocks: normalizedBlocks,
		hasRiskFlags: hasRiskFlags({
			blockRiskTerms,
			description,
			interviewNotes: input.interviewNotes,
			title: input.title,
		}),
	};
};

const getMediaSetItems = (
	media: JobPostMediaSetInput
): JobPostMediaRowInput[] => {
	if (!media) {
		return [];
	}

	const rows: JobPostMediaRowInput[] = [];

	if (media.cover) {
		rows.push({
			...media.cover,
			usage: "cover",
			position: 0,
		});
	}

	for (const [index, item] of media.detail.entries()) {
		rows.push({
			...item,
			usage: "detail",
			position: index,
		});
	}

	return rows;
};

const requireValidJobPostMediaSet = ({
	media,
	organizationId,
}: {
	media: JobPostMediaSetInput;
	organizationId: string;
}): JobPostMediaRowInput[] => {
	const rows = getMediaSetItems(media);
	const result = validateJobPostMediaSet(rows);

	if (!result.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: getJobPostPolicyErrorMessage(result.issues[0]?.code ?? ""),
		});
	}

	// 서명 발급은 조직 소유권을 검사하지만, 저장 단계에서 클라이언트가 임의 키를 보내면
	// 그 검사가 무의미해진다. 공고 삭제·교체 시 이 키로 GCS 객체를 실제로 지우므로
	// 남의 조직 키가 섞이면 원본이 삭제된다. 자기 조직 prefix가 아닌 키는 전부 거부한다.
	for (const row of rows) {
		if (
			!isOwnedJobPostMediaKey({ organizationId, storageKey: row.storageKey })
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "Job post media does not belong to this organization.",
			});
		}
	}

	return rows;
};

const buildJobPostMediaInsertRows = ({
	actorUserId,
	jobPostId,
	media,
	organizationId,
}: BuildJobPostMediaRowsInput) =>
	requireValidJobPostMediaSet({ media, organizationId }).map((item) => ({
		altText: item.altText.trim(),
		byteSize: item.byteSize,
		fileName: item.fileName.trim(),
		jobPostId,
		mimeType: item.mimeType,
		organizationId,
		position: item.position,
		storageKey: item.storageKey,
		uploadedByUserId: actorUserId,
		usage: item.usage,
	}));

const getJobPostMediaStorageKeys = async (
	jobPostId: string
): Promise<string[]> => {
	const rows = await db
		.select({ storageKey: jobPostMedia.storageKey })
		.from(jobPostMedia)
		.where(eq(jobPostMedia.jobPostId, jobPostId));

	return rows.map((row) => row.storageKey);
};

const getJobPostMediaSet = async (jobPostId: string) => {
	const rows = await db
		.select()
		.from(jobPostMedia)
		.where(eq(jobPostMedia.jobPostId, jobPostId))
		.orderBy(asc(jobPostMedia.usage), asc(jobPostMedia.position));

	return {
		cover: rows.find((item) => item.usage === "cover") ?? null,
		detail: rows.filter((item) => item.usage === "detail"),
	};
};

const ratingAverageSql = sql<number>`coalesce((select avg(${review.rating}) from ${review} where ${review.jobPostId} = ${jobPost.id} and ${review.status} = 'published'), 0)::double precision`;
const ratingCountSql = sql<number>`coalesce((select count(*) from ${review} where ${review.jobPostId} = ${jobPost.id} and ${review.status} = 'published'), 0)::integer`;
const coverImageSql = sql<{
	altText: string;
	byteSize: number;
	fileName: string;
	id: string;
	mimeType: string;
	storageKey: string;
	usage: "cover";
} | null>`(
	select json_build_object(
		'id', ${jobPostMedia.id},
		'usage', ${jobPostMedia.usage},
		'fileName', ${jobPostMedia.fileName},
		'mimeType', ${jobPostMedia.mimeType},
		'byteSize', ${jobPostMedia.byteSize},
		'storageKey', ${jobPostMedia.storageKey},
		'altText', ${jobPostMedia.altText}
	)
	from ${jobPostMedia}
	where ${jobPostMedia.jobPostId} = ${jobPost.id}
		and ${jobPostMedia.usage} = 'cover'
	order by ${jobPostMedia.position} asc
	limit 1
)`;

export const jobsRouter = {
	list: publicProcedure.input(listInput).handler(async ({ context, input }) => {
		const now = new Date();
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

		const getPromotedJobs = async (
			tier: "premium" | "recommended"
		): Promise<PublicPromotedJobListRow[]> =>
			await db
				.select({
					description: jobPost.description,
					coverImage: coverImageSql,
					employerDisplayName: employerOrganizationProfile.displayName,
					employerVerificationStatus:
						employerOrganizationProfile.verificationStatus,
					id: jobPost.id,
					industryCategory: jobPost.industryCategory,
					lastBoostedAt: jobPromotionCampaign.lastBoostedAt,
					organizationId: jobPost.organizationId,
					payAmount: jobPost.payAmount,
					payUnit: jobPost.payUnit,
					promotionCampaignId: jobPromotionCampaign.id,
					promotionEndsAt: jobPromotionCampaign.endsAt,
					promotionStartsAt: jobPromotionCampaign.startsAt,
					promotionStatus: jobPromotionCampaign.status,
					promotionTier: jobPromotionCampaign.tier,
					publishedAt: jobPost.publishedAt,
					ratingAverage: ratingAverageSql,
					ratingCount: ratingCountSql,
					region: jobPost.region,
					status: jobPost.status,
					teamDisplayName: employerTeamProfile.displayName,
					title: jobPost.title,
					workSchedule: jobPost.workSchedule,
				})
				.from(jobPromotionCampaign)
				.innerJoin(jobPost, eq(jobPromotionCampaign.jobPostId, jobPost.id))
				.innerJoin(
					employerOrganizationProfile,
					eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
				)
				.leftJoin(
					employerTeamProfile,
					eq(jobPost.teamId, employerTeamProfile.teamId)
				)
				.where(
					and(
						...filters,
						eq(jobPromotionCampaign.status, "active"),
						eq(jobPromotionCampaign.tier, tier),
						lte(jobPromotionCampaign.startsAt, now),
						gt(jobPromotionCampaign.endsAt, now)
					)
				)
				.orderBy(
					desc(jobPromotionCampaign.lastBoostedAt),
					desc(jobPromotionCampaign.startsAt)
				)
				.limit(tier === "premium" ? 5 : 10);

		const [premiumRows, recommendedRows, organicRows] = await Promise.all([
			getPromotedJobs("premium"),
			getPromotedJobs("recommended"),
			db
				.select({
					description: jobPost.description,
					coverImage: coverImageSql,
					employerDisplayName: employerOrganizationProfile.displayName,
					employerVerificationStatus:
						employerOrganizationProfile.verificationStatus,
					id: jobPost.id,
					industryCategory: jobPost.industryCategory,
					organizationId: jobPost.organizationId,
					payAmount: jobPost.payAmount,
					payUnit: jobPost.payUnit,
					publishedAt: jobPost.publishedAt,
					ratingAverage: ratingAverageSql,
					ratingCount: ratingCountSql,
					region: jobPost.region,
					status: jobPost.status,
					teamDisplayName: employerTeamProfile.displayName,
					title: jobPost.title,
					workSchedule: jobPost.workSchedule,
				})
				.from(jobPost)
				.innerJoin(
					employerOrganizationProfile,
					eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
				)
				.leftJoin(
					employerTeamProfile,
					eq(jobPost.teamId, employerTeamProfile.teamId)
				)
				.where(and(...filters))
				.orderBy(
					sql`case when ${employerOrganizationProfile.verificationStatus} = 'verified' then 0 else 1 end`,
					desc(jobPost.publishedAt)
				)
				.limit(input.limit + 15),
		]);

		const result = buildPublicJobSections({
			limit: input.limit,
			now,
			organicRows,
			premiumRows,
			recommendedRows,
		});

		// 현재 요청에서 새로 기록하는 impression 때문에 판정이 왜곡되지 않도록,
		// recordJobListingImpressions 이전에 최근 7일 성과를 집계해 각 item에 붙인다.
		const performanceJobIds = [
			...result.sections.premium,
			...result.sections.recommended,
			...result.sections.organic,
		].map((item) => item.id);
		const performanceByJobId = await getRecentJobPerformanceMetrics(
			performanceJobIds,
			now
		);
		const withPerformance = <TItem extends { id: string }>(item: TItem) => ({
			...item,
			performance: performanceByJobId.get(item.id) ?? {
				detailViews: 0,
				impressions: 0,
			},
		});

		await recordJobListingImpressions({
			actorUserId: context.session?.user.id,
			sections: result.sections,
		});

		return {
			...result,
			sections: {
				organic: result.sections.organic.map(withPerformance),
				premium: result.sections.premium.map(withPerformance),
				recommended: result.sections.recommended.map(withPerformance),
			},
		};
	}),

	legacyList: publicProcedure.input(listInput).handler(async ({ input }) => {
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
				workSchedule: jobPost.workSchedule,
				description: jobPost.description,
				coverImage: coverImageSql,
				status: jobPost.status,
				employerDisplayName: employerOrganizationProfile.displayName,
				employerVerificationStatus:
					employerOrganizationProfile.verificationStatus,
				teamDisplayName: employerTeamProfile.displayName,
				publishedAt: jobPost.publishedAt,
			})
			.from(jobPost)
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.leftJoin(
				employerTeamProfile,
				eq(jobPost.teamId, employerTeamProfile.teamId)
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
		.handler(async ({ context, input }) => {
			const [post] = await db
				.select({
					id: jobPost.id,
					organizationId: jobPost.organizationId,
					teamId: jobPost.teamId,
					createdByUserId: jobPost.createdByUserId,
					status: jobPost.status,
					industryCategory: jobPost.industryCategory,
					region: jobPost.region,
					payAmount: jobPost.payAmount,
					payUnit: jobPost.payUnit,
					workSchedule: jobPost.workSchedule,
					title: jobPost.title,
					description: jobPost.description,
					descriptionBlocks: jobPost.descriptionBlocks,
					interviewNotes: jobPost.interviewNotes,
					rejectionReason: jobPost.rejectionReason,
					riskFlags: jobPost.riskFlags,
					publishedAt: jobPost.publishedAt,
					ratingAverage: ratingAverageSql,
					ratingCount: ratingCountSql,
					createdAt: jobPost.createdAt,
					updatedAt: jobPost.updatedAt,
					employerDisplayName: employerOrganizationProfile.displayName,
					employerVerificationStatus:
						employerOrganizationProfile.verificationStatus,
					teamDisplayName: employerTeamProfile.displayName,
				})
				.from(jobPost)
				.innerJoin(
					employerOrganizationProfile,
					eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
				)
				.leftJoin(
					employerTeamProfile,
					eq(jobPost.teamId, employerTeamProfile.teamId)
				)
				.where(eq(jobPost.id, input.id))
				.limit(1);

			if (post?.status !== "published") {
				throw new ORPCError("NOT_FOUND");
			}

			await recordJobPerformanceEvent({
				actorUserId: context.session?.user.id,
				eventType: "detail_view",
				jobPostId: post.id,
				organizationId: post.organizationId,
			});

			return {
				...post,
				media: await getJobPostMediaSet(post.id),
			};
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
		const accessFilters: SQL[] = [];

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

		if (accessFilters.length === 0) {
			return [];
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

			return {
				...post,
				media: await getJobPostMediaSet(post.id),
			};
		}),

	createMediaUpload: protectedProcedure
		.input(createMediaUploadInput)
		.handler(async ({ context, input }) => {
			const actor = await requireEmployerPostingAccess({
				organizationId: input.organizationId,
				teamId: input.teamId,
				session: context.session,
			});
			const policy = validateJobPostImageUpload(input);

			if (!policy.ok) {
				throw new ORPCError("BAD_REQUEST", {
					message: getJobPostPolicyErrorMessage(policy.code),
				});
			}

			return await createJobPostMediaUploadIntent({
				actorUserId: actor.userId,
				byteSize: input.byteSize,
				fileName: input.fileName,
				mimeType: input.mimeType,
				organizationId: input.organizationId,
			});
		}),

	create: protectedProcedure
		.input(jobPostInput)
		.handler(async ({ context, input }) => {
			const {
				descriptionBlocks: _descriptionBlocks,
				media,
				...jobInput
			} = input;
			const actor = await requireEmployerPostingAccess({
				organizationId: input.organizationId,
				teamId: input.teamId,
				session: context.session,
			});

			if (
				actor.role !== "admin" &&
				!(await isEmployerOrganizationVerified(input.organizationId))
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "운영자 승인 후 공고를 등록할 수 있습니다.",
				});
			}

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

			const preparedContent = prepareJobPostContent(input);
			const mediaRows = requireValidJobPostMediaSet({
				media,
				organizationId: input.organizationId,
			});
			const riskDetected = preparedContent.hasRiskFlags;
			const status = getInitialJobPostStatus({
				employerVerificationStatus:
					organizationProfile.verificationStatus as EmployerVerificationStatus,
				hasRiskFlags: riskDetected,
			});
			const now = new Date();

			return await db.transaction(async (tx) => {
				const [created] = await tx
					.insert(jobPost)
					.values({
						...jobInput,
						createdByUserId: actor.userId,
						description: preparedContent.description,
						descriptionBlocks: preparedContent.descriptionBlocks,
						status,
						riskFlags: riskDetected ? ["risky_term"] : [],
						publishedAt: status === "published" ? now : null,
					})
					.returning();

				if (!created) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Job post could not be created.",
					});
				}

				const insertedMedia =
					mediaRows.length > 0
						? await tx
								.insert(jobPostMedia)
								.values(
									buildJobPostMediaInsertRows({
										actorUserId: actor.userId,
										jobPostId: created.id,
										media,
										organizationId: input.organizationId,
									})
								)
								.returning()
						: [];

				return {
					...created,
					media: {
						cover: insertedMedia.find((item) => item.usage === "cover") ?? null,
						detail: insertedMedia.filter((item) => item.usage === "detail"),
					},
				};
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				data: jobPostInput,
			})
		)
		.handler(async ({ context, input }) => {
			const {
				descriptionBlocks: _descriptionBlocks,
				media,
				...jobInput
			} = input.data;
			const [existing] = await db
				.select()
				.from(jobPost)
				.where(eq(jobPost.id, input.id))
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			const actor = await requireEmployerPostingAccess({
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

			const preparedContent = prepareJobPostContent(input.data);
			const mediaRows = media
				? requireValidJobPostMediaSet({
						media,
						organizationId: existing.organizationId,
					})
				: null;
			const riskDetected = preparedContent.hasRiskFlags;
			const status: JobPostStatus = riskDetected
				? "pending_review"
				: getUpdatedJobPostStatus({
						currentStatus: existing.status as JobPostStatus,
						employerVerificationStatus:
							organizationProfile.verificationStatus as EmployerVerificationStatus,
						publicContentChanged: true,
					});

			// 교체 대상에서 빠진 이미지만 GCS에서 지우기 위해, 갱신 전 키를 확보한다.
			const previousStorageKeys = mediaRows
				? await getJobPostMediaStorageKeys(input.id)
				: [];

			const result = await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(jobPost)
					.set({
						...jobInput,
						description: preparedContent.description,
						descriptionBlocks: preparedContent.descriptionBlocks,
						status,
						riskFlags: riskDetected ? ["risky_term"] : [],
						publishedAt:
							status === "published" && !existing.publishedAt
								? new Date()
								: existing.publishedAt,
					})
					.where(eq(jobPost.id, input.id))
					.returning();

				if (!updated) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Job post could not be updated.",
					});
				}

				if (mediaRows) {
					await tx
						.delete(jobPostMedia)
						.where(eq(jobPostMedia.jobPostId, input.id));

					const insertedMedia =
						mediaRows.length > 0
							? await tx
									.insert(jobPostMedia)
									.values(
										buildJobPostMediaInsertRows({
											actorUserId: actor.userId,
											jobPostId: updated.id,
											media,
											organizationId: existing.organizationId,
										})
									)
									.returning()
							: [];

					return {
						...updated,
						media: {
							cover:
								insertedMedia.find((item) => item.usage === "cover") ?? null,
							detail: insertedMedia.filter((item) => item.usage === "detail"),
						},
					};
				}

				return {
					...updated,
					media: await getJobPostMediaSet(updated.id),
				};
			});

			// 트랜잭션이 커밋된 뒤에만 객체를 지운다. 롤백된 변경으로 원본을 잃지 않는다.
			if (mediaRows) {
				const retainedKeys = new Set(mediaRows.map((row) => row.storageKey));

				await deletePublicObjects(
					previousStorageKeys.filter((key) => !retainedKeys.has(key))
				);
			}

			return result;
		}),
	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
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

			// 연관 미디어·프로모션·성과 이벤트 행은 FK onDelete cascade로 함께 제거되지만,
			// GCS 객체는 cascade 대상이 아니므로 키를 미리 확보해 직접 지운다.
			const storageKeys = await getJobPostMediaStorageKeys(input.id);

			await db.delete(jobPost).where(eq(jobPost.id, input.id));
			await deletePublicObjects(storageKeys);

			return { id: input.id };
		}),
};

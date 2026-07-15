import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	adProduct,
	employerOrganizationProfile,
	employerTeamProfile,
	jobPost,
	jobPostMedia,
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
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";
import {
	buildExposureJobSections,
	EXPOSURE_SECTION_LIMITS,
	EXPOSURE_TYPE_LABELS,
	type JobExposureType,
	type ListingSectionExposureType,
	previewTemplateToExposureType,
} from "../../services/bambi-ad-exposure";
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
import { createJobPostMediaUploadIntent } from "../../services/bambi-storage";

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
	exposureType: z
		.enum([
			"premium-banner",
			"left-banner",
			"right-banner",
			"special",
			"urgent",
			"recommended",
			"standard",
		])
		.optional(),
	exposureDurationDays: z.number().int().min(1).max(365).nullish(),
	adProductId: z.string().uuid().nullish(),
	exposureAmount: z.number().int().min(0).nullish(),
	paymentMethod: z.enum(["card", "bank_transfer"]).nullish(),
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

const requireValidJobPostMediaSet = (
	media: JobPostMediaSetInput
): JobPostMediaRowInput[] => {
	const rows = getMediaSetItems(media);
	const result = validateJobPostMediaSet(rows);

	if (!result.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: getJobPostPolicyErrorMessage(result.issues[0]?.code ?? ""),
		});
	}

	return rows;
};

const buildJobPostMediaInsertRows = ({
	actorUserId,
	jobPostId,
	media,
	organizationId,
}: BuildJobPostMediaRowsInput) =>
	requireValidJobPostMediaSet(media).map((item) => ({
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

interface ResolvedJobExposure {
	adProductId: string | null;
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	exposureType: JobExposureType;
	paymentMethod: "bank_transfer" | "card" | null;
}

// 공고의 노출 상품·기간·금액·노출 타입을 서버에서 확정한다. 운영자가 등록한 광고 상품을
// 단일 소스로 삼아, 상품의 미리보기 템플릿으로 노출 타입을 도출하고 선택 기간이 상품의
// 가격 옵션에 존재하는지 검증한 뒤 그 금액을 결제 예정 금액으로 저장한다.
const resolveJobPostExposure = async (input: {
	adProductId?: string | null;
	exposureDurationDays?: number | null;
	paymentMethod?: "bank_transfer" | "card" | null;
}): Promise<ResolvedJobExposure> => {
	if (!input.adProductId) {
		return {
			adProductId: null,
			exposureAmount: null,
			exposureDurationDays: null,
			exposureType: "standard",
			paymentMethod: null,
		};
	}

	const product = await db.query.adProduct.findFirst({
		where: eq(adProduct.id, input.adProductId),
	});

	if (!product) {
		throw new ORPCError("BAD_REQUEST", {
			message: "선택한 노출 상품을 찾을 수 없습니다.",
		});
	}

	const priceOption = product.priceOptions.find(
		(option) => option.days === input.exposureDurationDays
	);

	if (!priceOption) {
		throw new ORPCError("BAD_REQUEST", {
			message: "선택한 이용 기간이 해당 노출 상품에 없습니다.",
		});
	}

	return {
		adProductId: product.id,
		exposureAmount: priceOption.amount,
		exposureDurationDays: priceOption.days,
		exposureType: previewTemplateToExposureType(product.previewTemplate),
		paymentMethod: input.paymentMethod ?? null,
	};
};

export const jobsRouter = {
	list: publicProcedure.input(listInput).handler(async ({ context, input }) => {
		const now = new Date();
		const filters = [
			eq(jobPost.status, "published" as JobPostStatus),
			eq(jobPost.paymentStatus, "paid"),
		];

		if (input.industryCategory) {
			filters.push(eq(jobPost.industryCategory, input.industryCategory));
		}

		if (input.region) {
			filters.push(eq(jobPost.region, input.region));
		}

		if (input.minPayAmount) {
			filters.push(sql`${jobPost.payAmount} >= ${input.minPayAmount}`);
		}

		const exposureSelection = {
			description: jobPost.description,
			coverImage: coverImageSql,
			employerDisplayName: employerOrganizationProfile.displayName,
			employerVerificationStatus:
				employerOrganizationProfile.verificationStatus,
			exposureEndsAt: jobPost.exposureEndsAt,
			exposureType: jobPost.exposureType,
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
		};

		const getExposedJobs = async (type: ListingSectionExposureType) =>
			await db
				.select(exposureSelection)
				.from(jobPost)
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
						eq(jobPost.exposureType, type),
						or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
					)
				)
				.orderBy(desc(jobPost.publishedAt))
				.limit(EXPOSURE_SECTION_LIMITS[type]);

		const [specialRows, urgentRows, recommendedRows, organicRows] =
			await Promise.all([
				getExposedJobs("special"),
				getExposedJobs("urgent"),
				getExposedJobs("recommended"),
				db
					.select(exposureSelection)
					.from(jobPost)
					.innerJoin(
						employerOrganizationProfile,
						eq(
							jobPost.organizationId,
							employerOrganizationProfile.organizationId
						)
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

		const result = buildExposureJobSections({
			limit: input.limit,
			now,
			organicRows,
			recommendedRows,
			specialRows,
			urgentRows,
		});

		// 현재 요청에서 새로 기록하는 impression 때문에 판정이 왜곡되지 않도록,
		// recordJobListingImpressions 이전에 최근 7일 성과를 집계해 각 item에 붙인다.
		const performanceJobIds = [
			...result.sections.special,
			...result.sections.urgent,
			...result.sections.recommended,
			...result.sections.organic,
		].map((item) => item.id);
		const performanceByJobId = await getRecentJobPerformanceMetrics(
			performanceJobIds,
			now
		);
		const toListItem = <TItem extends { exposureType: string; id: string }>(
			item: TItem,
			inPaidSection: boolean
		) => ({
			...item,
			isPromoted: inPaidSection,
			promotionLabel: inPaidSection
				? EXPOSURE_TYPE_LABELS[item.exposureType as JobExposureType]
				: null,
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
			totalCount: result.totalCount,
			sections: {
				organic: result.sections.organic.map((item) => toListItem(item, false)),
				recommended: result.sections.recommended.map((item) =>
					toListItem(item, true)
				),
				special: result.sections.special.map((item) => toListItem(item, true)),
				urgent: result.sections.urgent.map((item) => toListItem(item, true)),
			},
		};
	}),

	legacyList: publicProcedure.input(listInput).handler(async ({ input }) => {
		const filters = [
			eq(jobPost.status, "published" as JobPostStatus),
			eq(jobPost.paymentStatus, "paid"),
		];

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
					paymentStatus: jobPost.paymentStatus,
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

			if (post?.status !== "published" || post.paymentStatus !== "paid") {
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
				exposureType: jobPost.exposureType,
				paymentStatus: jobPost.paymentStatus,
				exposureDurationDays: jobPost.exposureDurationDays,
				exposureEndsAt: jobPost.exposureEndsAt,
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

			return createJobPostMediaUploadIntent({
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
			const exposure = await resolveJobPostExposure({
				adProductId: input.adProductId,
				exposureDurationDays: input.exposureDurationDays,
				paymentMethod: input.paymentMethod,
			});
			const mediaRows = requireValidJobPostMediaSet(media);
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
						adProductId: exposure.adProductId,
						exposureType: exposure.exposureType,
						exposureDurationDays: exposure.exposureDurationDays,
						exposureAmount: exposure.exposureAmount,
						paymentMethod: exposure.paymentMethod,
						// 무료 공고(유료 노출상품 미선택)는 결제 게이트 없이 즉시 노출한다.
						// 유료 노출상품을 선택한 경우에만 운영자 결제완료 처리를 기다린다.
						paymentStatus: exposure.adProductId ? "unpaid" : "paid",
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
			const exposure = await resolveJobPostExposure({
				adProductId: input.data.adProductId,
				exposureDurationDays: input.data.exposureDurationDays,
				paymentMethod: input.data.paymentMethod,
			});
			// 노출 상품·기간이 바뀌면 재결제가 필요하다. 유료 전환/변경은 미결제로 되돌리고,
			// 무료 전환은 결제 게이트 없이 즉시 게시(paid)로 둔다(생성 시 무료 공고와 동일 규칙).
			const exposureChanged =
				exposure.adProductId !== existing.adProductId ||
				exposure.exposureDurationDays !== existing.exposureDurationDays;
			const changedPaymentStatus = exposure.adProductId
				? ("unpaid" as const)
				: ("paid" as const);
			const nextPaymentStatus = exposureChanged
				? changedPaymentStatus
				: existing.paymentStatus;
			const nextExposureEndsAt = exposureChanged
				? null
				: existing.exposureEndsAt;
			const mediaRows = media ? requireValidJobPostMediaSet(media) : null;
			const riskDetected = preparedContent.hasRiskFlags;
			const status: JobPostStatus = riskDetected
				? "pending_review"
				: getUpdatedJobPostStatus({
						currentStatus: existing.status as JobPostStatus,
						employerVerificationStatus:
							organizationProfile.verificationStatus as EmployerVerificationStatus,
						publicContentChanged: true,
					});

			return await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(jobPost)
					.set({
						...jobInput,
						description: preparedContent.description,
						descriptionBlocks: preparedContent.descriptionBlocks,
						status,
						riskFlags: riskDetected ? ["risky_term"] : [],
						adProductId: exposure.adProductId,
						exposureType: exposure.exposureType,
						exposureDurationDays: exposure.exposureDurationDays,
						exposureAmount: exposure.exposureAmount,
						paymentMethod: exposure.paymentMethod,
						paymentStatus: nextPaymentStatus,
						exposureEndsAt: nextExposureEndsAt,
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

			// 연관 미디어·프로모션·성과 이벤트는 FK onDelete cascade로 함께 제거된다.
			await db.delete(jobPost).where(eq(jobPost.id, input.id));

			return { id: input.id };
		}),
};

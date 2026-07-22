import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	adProduct,
	employerOrganizationProfile,
	employerTeamProfile,
	jobIndustryCategory,
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
	AD_BANNER_EXPOSURE_TYPES,
	buildExposureJobSections,
	EXPOSURE_TYPE_LABELS,
	groupAdBannerJobs,
	type JobExposureType,
	type ListingSectionExposureType,
	previewTemplateToExposureType,
	requiredAdBannerUsagesForExposureType,
} from "../../services/bambi-ad-exposure";
import {
	getRecentJobPerformanceMetrics,
	recordAdBannerImpressions,
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
	JOB_AD_BANNER_SPECS,
	JOB_POST_DETAIL_IMAGE_LIMIT,
	JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH,
	type JobPostMediaPolicyInput,
	type JobPostMediaUsage,
	jobPostMediaUsages,
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
	height: z.number().int().min(1).max(20_000).optional(),
	mimeType: z.string().min(1).max(120),
	storageKey: z.string().min(1).max(512),
	width: z.number().int().min(1).max(20_000).optional(),
});

const jobPostMediaSetInput = z
	.object({
		adHorizontal: jobPostMediaInput.optional(),
		adVertical: jobPostMediaInput.optional(),
		cover: jobPostMediaInput.optional(),
		detail: z
			.array(jobPostMediaInput)
			.max(JOB_POST_DETAIL_IMAGE_LIMIT)
			.default([]),
	})
	.optional();

// 업종은 DB enum(확정 8종)만 받는다 — 자유 문자열을 받으면 목록 밖 값이 저장 단계에서야
// (DB 캐스팅 오류로) 터지므로 입력 검증에서 막는다.
const industryCategorySchema = z.enum(jobIndustryCategory.enumValues);

const jobPostInputShape = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1).optional(),
	title: z.string().min(2).max(80),
	industryCategory: industryCategorySchema,
	region: z.string().min(1).max(80),
	district: z.string().max(80).optional(),
	// "협의" 단위는 금액이 없다(면접 후 급여 협의). 아래 refine에서 짝을 강제한다.
	payAmount: z.number().int().positive().nullish(),
	payUnit: z.string().min(1).max(30),
	workSchedule: z.string().min(1).max(200),
	description: z.string().min(10).max(2000),
	descriptionBlocks: z.array(jobDescriptionBlockInput).max(12).optional(),
	interviewNotes: z.string().max(500).optional(),
	beginnerFriendly: z.boolean().optional(),
	instantInterview: z.boolean().optional(),
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

// 급여 단위 "협의"는 금액 없이 저장한다. apps/web/src/lib/bambi-options.ts의
// NEGOTIABLE_PAY_UNIT과 같은 값을 유지할 것.
const NEGOTIABLE_PAY_UNIT = "협의";

// 단위와 금액의 짝을 강제한다 — 협의인데 금액이 붙거나, 금액 단위인데 금액이 빠지면
// 목록에서 "협의 0원" 같은 잡음이 되고 최소 시급 필터도 어긋난다.
const jobPostInput = jobPostInputShape.refine(
	(input) =>
		input.payUnit === NEGOTIABLE_PAY_UNIT
			? input.payAmount == null
			: typeof input.payAmount === "number",
	{
		message: "급여 단위가 '협의'가 아니면 급여 금액이 필요합니다.",
		path: ["payAmount"],
	}
);

const createMediaUploadInput = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1).optional(),
	fileName: z.string().max(180),
	mimeType: z.string().min(1).max(120),
	byteSize: z.number().int().min(1),
	// 허용 MIME이 슬롯마다 다르다(광고 배너만 GIF). usage를 안 보내면 가장 좁은
	// 규칙(썸네일·상세)으로 검사하므로, GIF를 올리려면 배너 usage를 함께 보내야 한다.
	usage: z.enum(jobPostMediaUsages).optional(),
});

const listInput = z.object({
	industryCategory: industryCategorySchema.optional(),
	region: z.string().min(1).max(80).optional(),
	district: z.string().max(80).optional(),
	minPayAmount: z.number().int().positive().optional(),
	limit: z.number().int().min(1).max(50).default(20),
});

// 최소 시급(minPayAmount) 비교 — 공고 급여 단위가 섞여 있으므로 시급 기준으로 환산한다.
// 나눗셈 대신 하한에 근로시간을 곱해 정수로 비교한다(반올림 오차·정수 나눗셈 절삭 방지).
// 환산 근로시간은 apps/web/src/lib/bambi-options.ts의 PAY_UNIT_HOURS와 같은 값을 유지할 것.
const minHourlyPayFilter = (minPayAmount: number) =>
	sql`${jobPost.payAmount} >= ${minPayAmount} * CASE ${jobPost.payUnit} WHEN '일급' THEN 8 WHEN '주급' THEN 40 WHEN '월급' THEN 209 ELSE 1 END`;

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
		case "banner_dimensions_required":
			return "광고 배너 이미지의 크기를 확인하지 못했습니다. 다시 등록해 주세요.";
		// 하한 수치는 정책 상수에서 읽는다. 문구에 숫자를 박아 두면 규격을 바꿀 때 조용히 어긋난다.
		case "banner_too_small":
			return `광고 배너 이미지가 너무 작습니다. 가로형은 ${JOB_AD_BANNER_SPECS.ad_horizontal.minWidth}×${JOB_AD_BANNER_SPECS.ad_horizontal.minHeight}px, 세로형은 ${JOB_AD_BANNER_SPECS.ad_vertical.minWidth}×${JOB_AD_BANNER_SPECS.ad_vertical.minHeight}px 이상으로 등록해 주세요.`;
		case "too_many_ad_banners":
			return "광고 배너는 가로형·세로형 각 1장만 등록할 수 있습니다.";
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

	// 광고 배너는 usage당 1장이므로 position은 항상 0이다.
	if (media.adHorizontal) {
		rows.push({
			...media.adHorizontal,
			usage: "ad_horizontal",
			position: 0,
		});
	}

	if (media.adVertical) {
		rows.push({
			...media.adVertical,
			usage: "ad_vertical",
			position: 0,
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
		height: item.height ?? null,
		jobPostId,
		mimeType: item.mimeType,
		organizationId,
		position: item.position,
		storageKey: item.storageKey,
		uploadedByUserId: actorUserId,
		usage: item.usage,
		width: item.width ?? null,
	}));

interface JobPostMediaRow {
	usage: JobPostMediaUsage;
}

// 응답 형태는 폼 입력 형태와 대칭이다(cover/detail/adHorizontal/adVertical).
const toJobPostMediaSet = <Row extends JobPostMediaRow>(rows: Row[]) => ({
	adHorizontal: rows.find((item) => item.usage === "ad_horizontal") ?? null,
	adVertical: rows.find((item) => item.usage === "ad_vertical") ?? null,
	cover: rows.find((item) => item.usage === "cover") ?? null,
	detail: rows.filter((item) => item.usage === "detail"),
});

const getJobPostMediaStorageKeys = async (
	jobPostId: string
): Promise<string[]> => {
	const rows = await db
		.select({ storageKey: jobPostMedia.storageKey })
		.from(jobPostMedia)
		.where(eq(jobPostMedia.jobPostId, jobPostId));

	return rows.map((row) => row.storageKey);
};

const getJobPostMediaUsages = async (
	jobPostId: string
): Promise<JobPostMediaUsage[]> => {
	const rows = await db
		.select({ usage: jobPostMedia.usage })
		.from(jobPostMedia)
		.where(eq(jobPostMedia.jobPostId, jobPostId));

	return rows.map((row) => row.usage);
};

// 프리미엄(배너형) 광고 공고는 상단·좌측 슬롯용 가로형과 우측 슬롯용 세로형 배너를 모두
// 갖춰야 한다. 통합 후 한 공고가 세 슬롯 모두의 후보가 되므로, 어느 한쪽이 빠지면 그 슬롯이
// 빈 채로 노출된다. 최종 저장될 미디어 usage에 필요한 배너 규격이 모두 있는지 검증한다.
const requireAdBannerMedia = (
	exposureType: string,
	usages: JobPostMediaUsage[]
): void => {
	const required = requiredAdBannerUsagesForExposureType(exposureType);

	if (required.length === 0) {
		return;
	}

	const present = new Set(usages);

	if (!required.every((usage) => present.has(usage))) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"프리미엄 광고는 가로형·세로형 배너 이미지를 모두 등록해야 합니다.",
		});
	}
};

const getJobPostMediaSet = async (jobPostId: string) => {
	const rows = await db
		.select()
		.from(jobPostMedia)
		.where(eq(jobPostMedia.jobPostId, jobPostId))
		.orderBy(asc(jobPostMedia.usage), asc(jobPostMedia.position));

	return toJobPostMediaSet(rows);
};

const ratingAverageSql = sql<number>`coalesce((select avg(${review.rating}) from ${review} where ${review.jobPostId} = ${jobPost.id} and ${review.status} = 'published'), 0)::double precision`;
const ratingCountSql = sql<number>`coalesce((select count(*) from ${review} where ${review.jobPostId} = ${jobPost.id} and ${review.status} = 'published'), 0)::integer`;
// 공고의 특정 usage 미디어 1건을 뽑는 상관 서브쿼리. 커버와 광고 배너가 형태가 같아
// usage만 갈아끼워 재사용한다(같은 SQL 블록을 usage별로 복붙하면 한쪽만 고쳐지는 사고가 난다).
const jobPostMediaByUsageSql = <Usage extends JobPostMediaUsage>(
	usage: Usage
) =>
	sql<{
		altText: string;
		byteSize: number;
		fileName: string;
		id: string;
		mimeType: string;
		storageKey: string;
		usage: Usage;
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
		and ${jobPostMedia.usage} = ${usage}
	order by ${jobPostMedia.position} asc
	limit 1
)`;

const coverImageSql = jobPostMediaByUsageSql("cover");
// 배너 슬롯은 커버가 아니라 사장님이 그 슬롯 규격(7:3 / 4:9)으로 올린 이미지를 써야 한다.
const adHorizontalImageSql = jobPostMediaByUsageSql("ad_horizontal");
const adVerticalImageSql = jobPostMediaByUsageSql("ad_vertical");

interface ResolvedJobExposure {
	adProductId: string | null;
	// 구매 시점 스냅샷: 상품의 하루 자동 끌어올리기 횟수를 공고 컬럼으로 복사한다(수동과 동일 패턴).
	autoBoostsPerDay: number;
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	exposureType: JobExposureType;
	// 구매 시점 스냅샷: 상품의 하루 수동 끌어올리기 횟수를 공고 컬럼으로 복사한다.
	// 이후 상품 수정과 무관하게 이 값으로 끌어올리기 자격을 판정한다.
	manualBoostsPerDay: number;
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
			manualBoostsPerDay: 0,
			autoBoostsPerDay: 0,
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

	const exposureType = previewTemplateToExposureType(product.previewTemplate);
	// 배너형 광고는 끌어올리기 대상이 아니다. 상품에 끌어올리기 값이 남아 있어도
	// 스냅샷을 0으로 강제해 배너 공고가 끌어올려지지 않게 한다(리스팅형만 제공 —
	// resolveBoostEligibility·runAutoBoostTick와 동일 정책).
	const isBanner = (AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(
		exposureType
	);

	return {
		adProductId: product.id,
		exposureAmount: priceOption.amount,
		exposureDurationDays: priceOption.days,
		exposureType,
		manualBoostsPerDay: isBanner ? 0 : product.manualBoostsPerDay,
		autoBoostsPerDay: isBanner ? 0 : product.autoBoostsPerDay,
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

		if (input.district) {
			filters.push(eq(jobPost.district, input.district));
		}

		if (input.minPayAmount) {
			filters.push(minHourlyPayFilter(input.minPayAmount));
		}

		const exposureSelection = {
			description: jobPost.description,
			beginnerFriendly: jobPost.beginnerFriendly,
			instantInterview: jobPost.instantInterview,
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
			district: jobPost.district,
			status: jobPost.status,
			teamDisplayName: employerTeamProfile.displayName,
			title: jobPost.title,
			workSchedule: jobPost.workSchedule,
		};

		// 노출 정렬 키: 끌어올린(boosted_at) 시각과 게시 시각 중 최신. Postgres GREATEST는
		// null을 무시하므로 미점프 공고는 publishedAt 그대로이고, 점프 뒤 재검수·재게시로
		// publishedAt이 더 최신이 되면 자동으로 최신 쪽을 따른다. 배너 쿼리에는 적용하지 않는다.
		const exposureRankSql = sql`greatest(${jobPost.boostedAt}, ${jobPost.publishedAt})`;

		// 슬롯 상한 없이 결제완료·미만료 유료 공고를 전부 노출한다(행 단위 확장).
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
				.orderBy(desc(exposureRankSql));

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
						desc(exposureRankSql)
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

		if (input.district) {
			filters.push(eq(jobPost.district, input.district));
		}

		if (input.minPayAmount) {
			filters.push(minHourlyPayFilter(input.minPayAmount));
		}

		return await db
			.select({
				id: jobPost.id,
				title: jobPost.title,
				industryCategory: jobPost.industryCategory,
				region: jobPost.region,
				district: jobPost.district,
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

	// seeker 광고 배너 슬롯(상단 프리미엄·좌/우 사이드)에 노출할 결제완료 공고를
	// 위치별로 내려준다. 목록 필터와 무관해 list와 분리된 공개 조회다.
	listAdBanners: publicProcedure.handler(async ({ context }) => {
		const now = new Date();
		const rows = await db
			.select({
				// 슬롯별 배너 원본. 좌측·프리미엄은 가로형, 우측은 세로형을 쓰며 클라이언트가
				// 슬롯에 맞는 쪽을 고른다. 미업로드 공고를 위해 coverImage도 폴백용으로 함께 내린다.
				adHorizontal: adHorizontalImageSql,
				adVertical: adVerticalImageSql,
				coverImage: coverImageSql,
				employerDisplayName: employerOrganizationProfile.displayName,
				exposureEndsAt: jobPost.exposureEndsAt,
				exposureType: jobPost.exposureType,
				id: jobPost.id,
				organizationId: jobPost.organizationId,
				publishedAt: jobPost.publishedAt,
				teamDisplayName: employerTeamProfile.displayName,
				title: jobPost.title,
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
			.where(
				and(
					eq(jobPost.status, "published" as JobPostStatus),
					eq(jobPost.paymentStatus, "paid"),
					inArray(jobPost.exposureType, [...AD_BANNER_EXPOSURE_TYPES]),
					or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
				)
			)
			.orderBy(desc(jobPost.publishedAt));
		const groups = groupAdBannerJobs(rows, now);

		await recordAdBannerImpressions({
			actorUserId: context.session?.user.id,
			groups,
		});

		return groups;
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
					district: jobPost.district,
					payAmount: jobPost.payAmount,
					payUnit: jobPost.payUnit,
					workSchedule: jobPost.workSchedule,
					title: jobPost.title,
					description: jobPost.description,
					descriptionBlocks: jobPost.descriptionBlocks,
					interviewNotes: jobPost.interviewNotes,
					beginnerFriendly: jobPost.beginnerFriendly,
					instantInterview: jobPost.instantInterview,
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
				district: jobPost.district,
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
			const exposure = await resolveJobPostExposure({
				adProductId: input.adProductId,
				exposureDurationDays: input.exposureDurationDays,
				paymentMethod: input.paymentMethod,
			});
			const mediaRows = requireValidJobPostMediaSet({
				media,
				organizationId: input.organizationId,
			});
			requireAdBannerMedia(
				exposure.exposureType,
				mediaRows.map((row) => row.usage)
			);
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
						manualBoostsPerDay: exposure.manualBoostsPerDay,
						autoBoostsPerDay: exposure.autoBoostsPerDay,
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
					media: toJobPostMediaSet(insertedMedia),
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
			const mediaRows = media
				? requireValidJobPostMediaSet({
						media,
						organizationId: existing.organizationId,
					})
				: null;
			// update는 media를 안 보내면 기존 미디어를 그대로 두고, 보내면 전량 교체한다.
			// 배너 검증은 그 "최종 상태"(교체될 rows 또는 유지되는 기존 rows) 기준으로 한다.
			requireAdBannerMedia(
				exposure.exposureType,
				mediaRows
					? mediaRows.map((row) => row.usage)
					: await getJobPostMediaUsages(input.id)
			);
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
						// 금액 단위 → "협의"로 바꿀 때 undefined면 drizzle이 컬럼을 건너뛰어
						// 예전 금액이 남는다. null로 명시해 지운다.
						payAmount: jobInput.payAmount ?? null,
						description: preparedContent.description,
						descriptionBlocks: preparedContent.descriptionBlocks,
						status,
						riskFlags: riskDetected ? ["risky_term"] : [],
						adProductId: exposure.adProductId,
						exposureType: exposure.exposureType,
						exposureDurationDays: exposure.exposureDurationDays,
						exposureAmount: exposure.exposureAmount,
						manualBoostsPerDay: exposure.manualBoostsPerDay,
						autoBoostsPerDay: exposure.autoBoostsPerDay,
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
						media: toJobPostMediaSet(insertedMedia),
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

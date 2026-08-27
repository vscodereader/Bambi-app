import { db } from "@bambi-app/db";
import { member, team, teamMember, user } from "@bambi-app/db/schema/auth";
import {
	adProduct,
	bambiPointTransaction,
	bambiProfile,
	bambiSiteSettings,
	employerOrganizationProfile,
	employerTeamProfile,
	jobAdBannerLayout,
	jobAdPurchase,
	jobBoostOption,
	jobBoostPurchase,
	jobIndustryCategory,
	jobPost,
	jobPostMedia,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";
import {
	type AdBannerLayoutInput,
	adBannerLayoutSchema,
	collectLayoutModerationText,
	isAdBannerImageRequired,
	parseStoredAdBannerLayout,
} from "../../services/bambi-ad-banner-layout";
import {
	loadDiscountCampaigns,
	resolveEffectiveAdPrice,
} from "../../services/bambi-ad-discount-campaigns";
import {
	AD_BANNER_EXPOSURE_TYPES,
	type AdBannerGroupKey,
	adBannerSlotLocation,
	buildExposureJobSections,
	DEFAULT_AD_ROTATION_MINUTES,
	EXPOSURE_TYPE_LABELS,
	groupAdBannerJobs,
	groupCrawledAdBannerJobs,
	type JobExposureType,
	type ListingSectionExposureType,
	mergeAdBannerSlots,
	previewTemplateToExposureType,
	requireDirectionImage,
	requiredAdBannerUsagesForExposureType,
} from "../../services/bambi-ad-exposure";
import {
	getRecentJobPerformanceMetrics,
	recordAdBannerImpressions,
	recordJobListingImpressions,
	recordJobPerformanceEvent,
} from "../../services/bambi-analytics";
import {
	isEmployerLikeRole,
	isEmployerOrganizationVerified,
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
} from "../../services/bambi-authz";
import { detectBannedTerms } from "../../services/bambi-banned-words";
import { loadCrawledAdBannerPools } from "../../services/bambi-crawled-ad-banner-slots";
import { readCrawledLimits } from "../../services/bambi-crawled-limits";
import { pingJobLanding } from "../../services/bambi-indexnow";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import {
	type BoostPurchaseLike,
	isBoostPurchaseActive,
} from "../../services/bambi-job-boost";
import {
	jobDescriptionBlockTypes,
	normalizeJobDescriptionBlocks,
	toPlainJobDescription,
	validateJobDescriptionBlocks,
} from "../../services/bambi-job-description-blocks";
import {
	type JobDetailDesignSnapshot,
	type JobDetailDesignStatus,
	type JobDetailDesignWrite,
	keepOrClearJobDetailDesign,
	resolveJobDetailDesign,
	toJobDetailDesignWrite,
} from "../../services/bambi-job-detail-design";
import {
	adHorizontalImageSql,
	adVerticalImageSql,
	type CrawledSectionType,
	countCrawledJobFeedRows,
	coverImageSql,
	isCrawledJobFeedEnabled,
	type JobFeedRow,
	listCrawledSectionRows,
	listLandingJobSummary,
	minHourlyPayFilter,
	ratingAverageSql,
	ratingCountSql,
	searchJobFeed,
} from "../../services/bambi-job-feed";
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
	JOB_PAY_AMOUNT_MAX,
	JOB_PAY_AMOUNT_MAX_MESSAGE,
} from "../../services/bambi-job-pay";
import {
	JOB_PAYMENT_POINTS_EXCEED_EDITED_TOTAL,
	resolveCappedPointRefund,
	resolveJobPointUseLimit,
} from "../../services/bambi-job-payment-points";
import { notifyBambiNotification } from "../../services/bambi-notifications";
import { isOrganizationManagerRole } from "../../services/bambi-organization-authz";
import {
	adjustMemberPoints,
	awardMemberPoints,
	getPointBalanceTx,
	lockMemberPoints,
} from "../../services/bambi-point-ledger";
import {
	getUpdatedJobPostStatus,
	type JobPostStatus,
} from "../../services/bambi-policy";
import {
	DEFAULT_RECOMMENDED_CAPACITY,
	DEFAULT_SPECIAL_CAPACITY,
	getListingQueuePositions,
	hasActiveOrgResponderFilter,
	notQueuedListingFilter,
} from "../../services/bambi-premium-capacity";
import { resolveRegionSelection } from "../../services/bambi-region";
import {
	createJobPostMediaUploadIntent,
	isOwnedJobPostMediaKey,
} from "../../services/bambi-storage";
import { assertJobPostWarningRestriction } from "../../services/bambi-warning-restriction";
import { deletePublicObjects } from "../../services/gcs";
import { requirePurchasableBoostOption } from "./boost-options";

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

// 끌어올리기 추가 옵션 유형. boost-options.optionTypeSchema와 같은 값이며, 폼이 체크한
// 유형 목록으로 넘어온다.
const boostOptionTypeSchema = z.enum([
	"manual_period",
	"manual_count",
	"auto_period",
]);
type BoostOptionType = z.infer<typeof boostOptionTypeSchema>;

const BOOST_OPTION_POINT_LABELS: Record<BoostOptionType, string> = {
	auto_period: "자동 끌어올리기",
	manual_count: "끌어올리기 횟수권",
	manual_period: "끌어올리기",
};

const buildJobPointDescription = (
	exposureType: JobExposureType,
	boostOptionTypes: BoostOptionType[] | undefined
): string => {
	const base =
		exposureType === "standard"
			? "무료 공고"
			: `공고 등록(${EXPOSURE_TYPE_LABELS[exposureType]})`;
	const options = (boostOptionTypes ?? []).map(
		(option) => BOOST_OPTION_POINT_LABELS[option]
	);
	return [base, ...options].join(" + ");
};

const buildJobPointRefundDescription = (description: null | string): string =>
	description ? `공고 취소 환급(${description})` : "공고 취소 포인트 환급";

const jobPostInputShape = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1).optional(),
	title: z.string().min(2).max(80),
	industryCategory: industryCategorySchema,
	// 지역은 자유 문자열이 아니라 지역 마스터의 법정동코드(10자리)로 받는다. 존재·활성·
	// 레벨 정합은 저장 직전 resolveRegionSelection이 DB 대조로 확인하고, 화면에 나갈
	// 문자열(region·district)은 서버가 마스터에서 복사한다 — 표기가 한 벌로 굳는다.
	regionCode: z.string().length(10),
	districtCode: z.string().length(10).optional(),
	// "협의" 단위는 금액이 없다(면접 후 급여 협의). 아래 refine에서 짝을 강제한다.
	payAmount: z
		.number()
		.int()
		.positive()
		.max(JOB_PAY_AMOUNT_MAX, JOB_PAY_AMOUNT_MAX_MESSAGE)
		.nullish(),
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
	// 상세이미지 디자인 제작 애드온 신청 여부. 키를 생략하면(undefined) 기존 상태를
	// 그대로 둔다 — 운영자 편집(moderation.adminUpdateJobPost)이 이 값을 안 보내도
	// 구인자가 신청해 둔 옵션이 조용히 해제되지 않게 하기 위해서다.
	detailDesignRequested: z.boolean().optional(),
	// 클라이언트가 화면에서 본 옵션 가격. exposureAmount와 같은 재확인용 값이고
	// 저장 값이 아니다 — 저장되는 금액은 항상 서버가 상품에서 다시 읽는다.
	detailDesignAmount: z.number().int().min(0).nullish(),
	paymentMethod: z.enum(["card", "bank_transfer"]).nullish(),
	// 프리미엄 배너 에디터가 만든 레이아웃(job_ad_banner_layout.layout). jsonb라 DB 제약이
	// 없으므로 adBannerLayoutSchema가 유일한 방어선이다 — 트러스트 바운더리다.
	// 키를 아예 생략하면 기존 레이아웃을 보존하고, 명시적 null이면 지운다.
	adBannerLayout: adBannerLayoutSchema.nullish(),
	// 끌어올리기 추가 옵션 신청 목록(폼에서 체크한 유형, 최대 3·중복 불가). 키를 생략하면
	// (undefined) 기존 구매를 그대로 둔다 — 이 필드를 안 보내는 클라이언트(현 edit 폼·native)가
	// 저장해도 구인자가 따로 구매해 둔 미결제 옵션이 조용히 취소되지 않게 하기 위해서다
	// (detailDesignRequested가 optional인 이유와 같다). 빈 배열은 "전부 해제"다.
	// 비컬럼 필드라 job_post 저장 spread에서 반드시 분리한다(아래 destructure).
	boostOptionTypes: z.array(boostOptionTypeSchema).max(3).optional(),
	// 무료 공고에서 옵션을 신청할 때의 결제수단. 유료 공고는 공고 결제수단을 그대로 쓴다.
	boostOptionPaymentMethod: z.enum(["bank_transfer", "card"]).optional(),
	// 새 공고 등록 시에만 사용한다. 수정에서는 기존 스냅샷을 보존한다.
	pointsToUse: z.number().int().min(0).default(0),
	submissionKey: z.string().uuid().optional(),
	media: jobPostMediaSetInput,
});

// 급여 단위 "협의"는 금액 없이 저장한다. apps/web/src/lib/bambi-options.ts의
// NEGOTIABLE_PAY_UNIT과 같은 값을 유지할 것.
const NEGOTIABLE_PAY_UNIT = "협의";

// 단위와 금액의 짝을 강제한다 — 협의인데 금액이 붙거나, 금액 단위인데 금액이 빠지면
// 목록에서 "협의 0원" 같은 잡음이 되고 최소 시급 필터도 어긋난다.
export const jobPostInput = jobPostInputShape
	.refine(
		(input) =>
			input.payUnit === NEGOTIABLE_PAY_UNIT
				? input.payAmount == null
				: typeof input.payAmount === "number",
		{
			message: "급여 단위가 '협의'가 아니면 급여 금액이 필요합니다.",
			path: ["payAmount"],
		}
	)
	// 같은 옵션 유형을 두 번 신청하면 스냅샷 중복이 되므로 거부한다.
	.refine(
		(input) =>
			new Set(input.boostOptionTypes ?? []).size ===
			(input.boostOptionTypes ?? []).length,
		{
			message: "같은 끌어올리기 옵션을 중복 신청할 수 없습니다.",
			path: ["boostOptionTypes"],
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
	regionCode: z.string().length(10).optional(),
	districtCode: z.string().length(10).optional(),
	minPayAmount: z.number().int().positive().optional(),
	limit: z.number().int().min(1).max(50).default(20),
	// 전체 공고(organic) "더보기" 커서 — 응답의 nextOrganicOffset을 그대로 돌려보낸다.
	// 생략하면 첫 페이지(유료 섹션 3종 포함)이고, 주면 전체 공고만 이어 받는다.
	// 자체 공고 블록과 수집 블록이 순서대로 이어붙는 구조라 커서도 블록별 위치 두 개다.
	organicOffset: z
		.object({
			crawled: z.number().int().min(0),
			jobPost: z.number().int().min(0),
		})
		.optional(),
});

type JobPostInput = z.infer<typeof jobPostInput>;
type JobPostMediaSetInput = z.infer<typeof jobPostMediaSetInput>;

interface PreparedJobPostContent {
	description: string;
	descriptionBlocks: NonNullable<JobPostInput["descriptionBlocks"]>;
	// 걸린 금칙어 원문. 비어 있으면 감지 없음(그래도 검수는 거친다).
	detectedTerms: string[];
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

// 레이아웃 저장 결정. "keep"은 클라이언트가 adBannerLayout 키를 아예 보내지 않은 경우다.
export type AdBannerLayoutWrite =
	| { kind: "delete" }
	| { kind: "keep" }
	| { kind: "upsert"; layout: AdBannerLayoutInput };

// 배너 슬롯을 쓰지 않는 노출 타입이면 레이아웃을 버린다. 저장해두면 나중에 상품이 배너형으로
// 바뀔 때 검수받지 않은 문구가 조용히 노출된다.
//
// 배너형이면 "키가 없으면 건드리지 않는다". 생략을 null로 취급해 무조건 덮으면, 다른 옵셔널
// 필드는 생략 시 보존되는데 배너 편집물만 저장 한 번에 지워지는 비대칭이 생긴다.
export const normalizeAdBannerLayout = (
	input: { adBannerLayout?: AdBannerLayoutInput | null },
	exposureType: string
): AdBannerLayoutWrite => {
	if (!(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType)) {
		return { kind: "delete" };
	}

	if (input.adBannerLayout === undefined) {
		return { kind: "keep" };
	}

	return input.adBannerLayout === null
		? { kind: "delete" }
		: { kind: "upsert", layout: input.adBannerLayout };
};

export const getStoredAdBannerLayout = async (
	jobPostId: string
): Promise<AdBannerLayoutInput | null> => {
	const [row] = await db
		.select({ layout: jobAdBannerLayout.layout })
		.from(jobAdBannerLayout)
		.where(eq(jobAdBannerLayout.jobPostId, jobPostId))
		.limit(1);

	// 쓰기 경로가 전부 zod를 통과하지만 읽을 때 다시 검증한다 — 수동 DB 편집·부분 복구·훗날의
	// v2 스키마가 남긴 행 하나가 렌더러를 터뜨려 광고 레일이 붙은 화면을 통째로 내릴 수 있다.
	return parseStoredAdBannerLayout(row?.layout ?? null);
};

// 검수 대상 레이아웃. 키를 생략해 기존 레이아웃이 보존되는 경우엔 저장분을 읽어야 남아 있을
// 문구가 금칙어 검사를 빠져나가지 않는다.
const resolveModeratedLayout = async (
	write: AdBannerLayoutWrite,
	existingJobPostId: null | string
): Promise<unknown> => {
	if (write.kind === "upsert") {
		return write.layout;
	}

	if (write.kind === "keep" && existingJobPostId) {
		return await getStoredAdBannerLayout(existingJobPostId);
	}

	return null;
};

const writeAdBannerLayout = async (
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	jobPostId: string,
	write: AdBannerLayoutWrite
): Promise<void> => {
	if (write.kind === "keep") {
		return;
	}

	if (write.kind === "delete") {
		await tx
			.delete(jobAdBannerLayout)
			.where(eq(jobAdBannerLayout.jobPostId, jobPostId));

		return;
	}

	await tx
		.insert(jobAdBannerLayout)
		.values({ jobPostId, layout: write.layout })
		.onConflictDoUpdate({
			set: { layout: write.layout, updatedAt: new Date() },
			target: jobAdBannerLayout.jobPostId,
		});
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

// 배너 문구도 구직자에게 노출되는 문구다. 실제로 저장될 레이아웃을 넘겨받아 본문과 같은
// 금칙어 검사를 태운다 — 버려질 문구로 공고가 검수에 걸리지는 않게 한다.
const prepareJobPostContent = async (
	input: JobPostInput,
	adBannerLayout: unknown
): Promise<PreparedJobPostContent> => {
	const descriptionBlocks = input.descriptionBlocks ?? [];
	const validation = validateJobDescriptionBlocks(descriptionBlocks);

	if (!validation.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: getJobPostPolicyErrorMessage(validation.issues[0]?.code ?? ""),
		});
	}

	const normalizedBlocks = normalizeJobDescriptionBlocks(descriptionBlocks);
	const description = input.description.trim();
	const blockDescription = toPlainJobDescription(normalizedBlocks);

	return {
		description,
		descriptionBlocks: normalizedBlocks,
		// 가로·세로 두 배너 슬롯을 모두 훑고 블록 조립본을 함께 넘긴다 — 한쪽 슬롯만 보면
		// 반대 슬롯이 빠져나가고, 블록별로만 보면 "미성"과 "년"을 나란히 놓아 배너에는
		// "미성년"으로 보이는 조합이 검사를 통과한다.
		detectedTerms: await detectBannedTerms([
			input.title,
			description,
			blockDescription,
			input.interviewNotes ?? "",
			collectLayoutModerationText(adBannerLayout),
		]),
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

export const getJobPostMediaStorageKeys = async (
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
// layout은 최종 저장될 레이아웃(upsert면 새 값, keep이면 저장분)이다 — 배경이 단색인 슬롯은
// 업로드 이미지가 렌더에 쓰이지 않아 요구하지 않는다.
const requireAdBannerMedia = (
	exposureType: string,
	usages: JobPostMediaUsage[],
	layout: unknown
): void => {
	const required = requiredAdBannerUsagesForExposureType(exposureType).filter(
		(usage) => isAdBannerImageRequired(layout, usage)
	);

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

export const getJobPostMediaSet = async (jobPostId: string) => {
	const rows = await db
		.select()
		.from(jobPostMedia)
		.where(eq(jobPostMedia.jobPostId, jobPostId))
		.orderBy(asc(jobPostMedia.usage), asc(jobPostMedia.position));

	return toJobPostMediaSet(rows);
};

interface ResolvedJobExposure {
	adProductId: string | null;
	// 구매 시점 스냅샷: 상품의 하루 자동 끌어올리기 횟수를 공고 컬럼으로 복사한다(수동과 동일 패턴).
	autoBoostsPerDay: number;
	// 확정된 상품의 상세이미지 디자인 제작 옵션 가격. null = 이 상품엔 옵션이 없다(무료 공고 포함).
	// 애드온 판정이 상품 행을 다시 읽지 않도록 여기서 함께 돌려준다.
	detailDesignPrice: number | null;
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
export const resolveJobPostExposure = async (input: {
	adProductId?: string | null;
	exposureDurationDays?: number | null;
	expectedExposureAmount?: number | null;
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
			detailDesignPrice: null,
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

	// 무통장입금은 운영자가 입금 계좌를 1개 이상 등록해야만 결제를 진행할 수 있다.
	// (여기 도달 시 유료 상품 — adProductId 없는 무료 공고는 위에서 이미 early-return.)
	if (input.paymentMethod === "bank_transfer") {
		const [settings] = await db
			.select({ bankAccounts: bambiSiteSettings.bankAccounts })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"))
			.limit(1);

		if (!settings?.bankAccounts.length) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"무통장입금 계좌가 준비되지 않아 결제를 진행할 수 없습니다. 다른 결제수단을 선택하거나 고객센터로 문의해 주세요.",
			});
		}
	}

	const exposureType = previewTemplateToExposureType(product.previewTemplate);
	// 배너형 광고는 끌어올리기 대상이 아니다. 상품에 끌어올리기 값이 남아 있어도
	// 스냅샷을 0으로 강제해 배너 공고가 끌어올려지지 않게 한다(리스팅형만 제공 —
	// resolveBoostEligibility·runAutoBoostTick와 동일 정책).
	const isBanner = (AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(
		exposureType
	);

	const [campaigns, now] = [
		await loadDiscountCampaigns([product.id]),
		new Date(),
	];
	const resolvedPrice = resolveEffectiveAdPrice({
		amount: priceOption.amount,
		baseDiscountPercent: priceOption.discountPercent ?? 0,
		campaigns: campaigns.filter(
			(campaign) => campaign.priceOptionDays === priceOption.days
		),
		now,
	});
	if (
		input.expectedExposureAmount != null &&
		input.expectedExposureAmount !== resolvedPrice.amount
	) {
		throw new ORPCError("CONFLICT", {
			message: `광고 가격이 ${input.expectedExposureAmount.toLocaleString("ko-KR")}원에서 ${resolvedPrice.amount.toLocaleString("ko-KR")}원으로 변경되었습니다. 변경된 가격을 확인한 뒤 다시 결제해 주세요.`,
		});
	}

	return {
		adProductId: product.id,
		// 구매 시점 할인가 스냅샷: 선택한 가격 옵션의 discountPercent(없으면 0)를 적용해 결제
		// 금액을 확정한다. 이후 상품 할인율이 바뀌어도 이미 확정된 이 금액에는 영향을 주지 않는다.
		exposureAmount: resolvedPrice.amount,
		exposureDurationDays: priceOption.days,
		exposureType,
		manualBoostsPerDay: isBanner ? 0 : product.manualBoostsPerDay,
		autoBoostsPerDay: isBanner ? 0 : product.autoBoostsPerDay,
		detailDesignPrice: product.detailDesignPrice,
		paymentMethod: input.paymentMethod ?? null,
	};
};

// 애드온 스냅샷 확정. 판정 자체는 pure 헬퍼가 하고 여기서는 실패 코드 → ORPCError
// 번역만 한다(가격 변동 문구는 노출 금액 재확인과 같은 패턴). 가격은 노출 확정이 이미
// 읽어 둔 상품 행에서 온다 — 저장마다 상품을 두 번 읽지 않는다.
const resolveJobDetailDesignSnapshot = ({
	currentStatus,
	expectedAmount,
	productDetailDesignPrice,
	requested,
}: {
	currentStatus: JobDetailDesignStatus | null;
	expectedAmount?: null | number;
	productDetailDesignPrice: null | number;
	requested: boolean;
}): JobDetailDesignSnapshot => {
	const resolution = resolveJobDetailDesign({
		currentStatus,
		expectedAmount,
		productDetailDesignPrice,
		requested,
	});

	if (resolution.ok) {
		return resolution.snapshot;
	}

	if (resolution.code === "amount_changed") {
		throw new ORPCError("CONFLICT", {
			message: `상세이미지 디자인 제작 가격이 ${resolution.expectedAmount.toLocaleString("ko-KR")}원에서 ${resolution.price.toLocaleString("ko-KR")}원으로 변경되었습니다. 변경된 가격을 확인한 뒤 다시 결제해 주세요.`,
		});
	}

	if (resolution.code === "completed_locked") {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"이미 제작이 완료된 상세이미지 디자인은 신청을 해제할 수 없습니다. 운영자에게 문의해 주세요.",
		});
	}

	throw new ORPCError("BAD_REQUEST", {
		message:
			"선택한 광고 상품에는 상세이미지 디자인 제작 옵션이 없습니다. 옵션이 제공되는 상품을 선택해 주세요.",
	});
};

// 등록·수정 tx 안에서 공고의 끌어올리기 옵션 구매를 반영한다. 등록은 기존 구매가 없어 신청분을
// 그대로 insert하고, 수정은 체크 해제(요청 목록에 없음)된 unpaid 구매를 delete한 뒤, 아직
// unpaid·활성으로 잡혀 있지 않은 유형만 새로 산다. paid·활성 구매는 요청과 무관하게 불변이다.
// 옵션 구매는 결제 전까지 unpaid(스키마 기본값)로 남으며, 이 unpaid는 공고 게시를 막지 않는다 —
// 공고 paymentStatus는 호출부에서 이미 확정한다(무료 공고 즉시 게시 그대로).
const syncBoostPurchases = async ({
	actorUserId,
	existing,
	exposureType,
	isPaidPosting,
	jobPostId,
	optionPaymentMethod,
	organizationId,
	postingPaymentMethod,
	requestedTypes,
	tx,
}: {
	actorUserId: string;
	existing: BoostPurchaseLike[];
	exposureType: string;
	// 유료 노출상품 공고 여부. 결제수단 출처(공고 vs 옵션 전용)를 가른다.
	isPaidPosting: boolean;
	jobPostId: string;
	optionPaymentMethod?: "bank_transfer" | "card";
	organizationId: string;
	postingPaymentMethod: "bank_transfer" | "card" | null;
	requestedTypes: BoostOptionType[] | undefined;
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
}): Promise<void> => {
	const now = new Date();

	// 배너형으로 확정된 공고엔 옵션을 팔지 않는다. 상품을 배너로 바꾼 수정에서 요청 목록이
	// 그대로 넘어오면 "살 게 없다"고 판정돼 검증이 아예 돌지 않으므로, 요청과 무관하게 여기서
	// 미결제 구매를 전량 지우고 신규 구매를 막는다 — 배너 공고에 영원히 못 쓰는 청구가 남지
	// 않게 한다. 이미 입금된(paid) 구매는 임의로 지우지 않는다(환불은 운영자 몫).
	if ((AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType)) {
		await tx
			.delete(jobBoostPurchase)
			.where(
				and(
					eq(jobBoostPurchase.jobPostId, jobPostId),
					eq(jobBoostPurchase.paymentStatus, "unpaid")
				)
			);

		return;
	}

	// 키를 아예 안 보낸 저장은 옵션을 건드리지 않는다 — 이 필드를 모르는 클라이언트의 수정이
	// 따로 구매해 둔 미결제 옵션을 조용히 취소하지 않게 한다(빈 배열은 "전부 해제"로 처리).
	if (requestedTypes === undefined) {
		return;
	}

	// 체크 해제된 unpaid 구매만 취소한다(=취소). paid·활성 구매는 폼이 체크 고정하므로 불변.
	for (const purchase of existing) {
		if (
			purchase.paymentStatus === "unpaid" &&
			!requestedTypes.includes(purchase.optionType as BoostOptionType)
		) {
			// unpaid 술어를 WHERE에 함께 건다 — 읽은 뒤 지우기 전에 운영자가 입금 확인(paid)
			// 하면 이미 결제된 구매를 지우게 된다. 그 경우 0행 삭제로 조용히 유지된다.
			await tx
				.delete(jobBoostPurchase)
				.where(
					and(
						eq(jobBoostPurchase.id, purchase.id),
						eq(jobBoostPurchase.paymentStatus, "unpaid")
					)
				);
		}
	}

	// 무료 공고에서 먼저 담아 둔 standalone 미결제 옵션을 같은 수정 화면에서 유료
	// 노출상품과 함께 저장하면, 새 구매 행을 만들지 않더라도 공고 결제 묶음으로 승격해야
	// 한다. 결제됐거나 활성화된 단독 구매는 사용·환불 이력이 걸릴 수 있어 건드리지 않는다.
	if (isPaidPosting && postingPaymentMethod) {
		const bundledPurchaseIds = existing
			.filter(
				(purchase) =>
					purchase.paymentStatus === "unpaid" &&
					requestedTypes.includes(purchase.optionType as BoostOptionType)
			)
			.map((purchase) => purchase.id);

		if (bundledPurchaseIds.length > 0) {
			await tx
				.update(jobBoostPurchase)
				.set({
					paymentMethod: postingPaymentMethod,
					purchaseSource: "job_registration",
				})
				.where(
					and(
						inArray(jobBoostPurchase.id, bundledPurchaseIds),
						eq(jobBoostPurchase.paymentStatus, "unpaid")
					)
				);
		}
	}

	// 이미 unpaid·활성으로 잡혀 있는 유형은 그대로 두고, 새로 나타난 유형만 산다.
	const typesToBuy = requestedTypes.filter(
		(optionType) =>
			!existing.some(
				(p) =>
					p.optionType === optionType &&
					(p.paymentStatus === "unpaid" || isBoostPurchaseActive(p, now))
			)
	);

	if (typesToBuy.length === 0) {
		return;
	}

	// 유료 공고는 공고 결제수단을, 무료 공고는 옵션 전용 결제수단을 쓴다(무료인데 없으면 거부).
	let paymentMethod: "bank_transfer" | "card" | null;
	if (isPaidPosting) {
		paymentMethod = postingPaymentMethod;
	} else {
		if (!optionPaymentMethod) {
			throw new ORPCError("BAD_REQUEST", {
				message: "결제수단을 선택해 주세요.",
			});
		}
		paymentMethod = optionPaymentMethod;
	}

	const catalog = await tx
		.select({
			boostCount: jobBoostOption.boostCount,
			boostsPerDay: jobBoostOption.boostsPerDay,
			durationDays: jobBoostOption.durationDays,
			optionType: jobBoostOption.optionType,
			price: jobBoostOption.price,
		})
		.from(jobBoostOption)
		.where(inArray(jobBoostOption.optionType, typesToBuy));
	const catalogByType = new Map(catalog.map((row) => [row.optionType, row]));

	for (const optionType of typesToBuy) {
		// 판매 중·배너형·중복 검증(purchaseOption과 동일 규칙)을 통과한 확정 옵션만 스냅샷한다.
		const option = requirePurchasableBoostOption({
			existingSameType: existing.filter((p) => p.optionType === optionType),
			exposureType,
			now,
			option: catalogByType.get(optionType),
			optionType,
		});

		await tx.insert(jobBoostPurchase).values({
			amount: option.price,
			boostCount: option.boostCount,
			boostsPerDay: option.boostsPerDay,
			buyerUserId: actorUserId,
			durationDays: option.durationDays,
			jobPostId,
			optionType,
			organizationId,
			paymentMethod,
			purchaseSource: "job_registration",
		});
	}
};

// jobs.update와 운영자 편집(moderation.adminUpdateJobPost)이 공유하는 갱신·노출확정 로직.
// 호출자는 대상 공고(existing)를 먼저 조회·권한 확인한 뒤 넘긴다 — 이 함수는 권한 검사를 하지
// 않으므로(조직 멤버십 우회가 목적) 반드시 호출부에서 게이트를 통과시켜야 한다.
// published였던 공고가 구인자 수정으로 강등되면(published→pending_review) 랜딩에서 즉시 빠지므로
// 재색인을 요청한다. 빠져나간 옛 위치를 갱신하려 수정 전 행(existing)으로 핑한다. 삭제 경로의
// existing.status==="published" 가드와 대칭. (applyJobPostUpdate 인지복잡도 예산상 가드를 분리한다.)
const pingJobLandingForUpdatedPost = (
	existing: typeof jobPost.$inferSelect
): void => {
	if (existing.status === "published") {
		pingJobLanding(existing);
	}
};

export const applyJobPostUpdate = async ({
	actorUserId,
	data,
	existing,
	// 운영자 편집(moderation.adminUpdateJobPost) 전용 "즉시 반영" 모드. 구인자 수정은 재검수·
	// (상품·기간을 바꿨으면) 재결제를 거치지만, 운영자 수정은 검수 상태·결제 상태·노출 종료일을
	// 수정 전 그대로 두고 내용만 갈아끼운다. 되돌아갈 곳이 없기 때문이다 — 운영자 수정 건은
	// 검수 큐(pending_review만 조회)에도, 결제 관리(유료 공고만 조회)에도 다시 뜨지 않아
	// 한 번 미결제로 떨어지면 게시 상태로 되돌릴 창구가 사라진다.
	moderatorEdit = false,
}: {
	actorUserId: string;
	data: JobPostInput;
	existing: typeof jobPost.$inferSelect;
	moderatorEdit?: boolean;
}) => {
	// 레이아웃은 별도 테이블이라 job_post 컬럼 spread에서 빼 둔다. 애드온 두 필드도 뺀다 —
	// detailDesignRequested는 컬럼이 아니고, detailDesignAmount는 "클라이언트가 본 가격"이라
	// 그대로 흘려보내면 저장 금액이 클라이언트 입력으로 덮인다. 끌어올리기 옵션 두 필드도
	// job_post 컬럼이 아니라 별도 테이블(jobBoostPurchase) 몫이라 spread에서 분리한다.
	const {
		adBannerLayout: _adBannerLayout,
		boostOptionPaymentMethod: _boostOptionPaymentMethod,
		boostOptionTypes: _boostOptionTypes,
		descriptionBlocks: _descriptionBlocks,
		detailDesignAmount: _detailDesignAmount,
		detailDesignRequested: _detailDesignRequested,
		media,
		pointsToUse: _pointsToUse,
		submissionKey: _submissionKey,
		...jobInput
	} = data;

	if (
		data.organizationId !== existing.organizationId ||
		(data.teamId ?? null) !== (existing.teamId ?? null)
	) {
		throw new ORPCError("FORBIDDEN", {
			message: "Changing a job post organization or team is not supported.",
		});
	}

	const [organizationProfile] = await db
		.select()
		.from(employerOrganizationProfile)
		.where(
			eq(employerOrganizationProfile.organizationId, existing.organizationId)
		)
		.limit(1);

	if (!organizationProfile) {
		throw new ORPCError("FORBIDDEN", {
			message: "Employer organization profile is required.",
		});
	}

	// 지역 코드는 클라이언트가 보낸 값이라 저장 전에 마스터 대조가 필요하다. 표시용
	// region·district 문자열도 여기서 나온다.
	const regionSelection = await resolveRegionSelection(data);
	// 노출 확정이 먼저다 — 배너 문구를 남길지 버릴지가 확정된 노출 타입에 달려 있고,
	// 검수 검사도 실제로 저장될 문구만 봐야 한다.
	const exposure = await resolveJobPostExposure({
		adProductId: data.adProductId,
		exposureDurationDays: data.exposureDurationDays,
		expectedExposureAmount: data.exposureAmount,
		paymentMethod: data.paymentMethod,
	});
	// db enum(job_detail_design_status)과 pure 헬퍼의 상태 상수 대조. pure 모듈은 import 0
	// 제약이라 스스로 db와 맞는지 확인할 수 없어, 값이 실제로 흐르는 여기서 satisfies로 건다.
	const currentDetailDesignStatus =
		existing.detailDesignStatus satisfies JobDetailDesignStatus | null;
	// 운영자 편집은 애드온을 완전히 동결한다 — 결제 축(결제 상태·노출 종료일)을 건드리지 않는
	// 모드라, 여기서 금액을 바꾸면 총액만 오르고 결제 상태는 paid로 남는 어긋남이 생긴다.
	// 금액 키가 없는 객체라 drizzle이 detail_design_amount 컬럼을 건너뛴다.
	let detailDesign: JobDetailDesignWrite = {
		detailDesignStatus: currentDetailDesignStatus,
	};

	if (!moderatorEdit) {
		detailDesign =
			data.detailDesignRequested === undefined
				? // 신청 여부를 안 보낸 저장이라도 상품은 바뀔 수 있다. 새 상품에 옵션이 없으면
					// 스냅샷을 정리해야 유령 금액이 남지 않는다(completed는 보존 — 헬퍼 주석 참고).
					keepOrClearJobDetailDesign({
						currentStatus: currentDetailDesignStatus,
						productOffersDetailDesign: exposure.detailDesignPrice !== null,
					})
				: // completed 건이면 헬퍼가 돌려준 (새 상품가 기준) 금액을 의도적으로 버리고
					// 구매 시점 스냅샷을 남긴다 — toJobDetailDesignWrite가 금액 키를 뺀다.
					toJobDetailDesignWrite({
						currentStatus: currentDetailDesignStatus,
						snapshot: resolveJobDetailDesignSnapshot({
							currentStatus: currentDetailDesignStatus,
							// 노출 금액과 같은 재확인 값. 안 넘기면 가격 변동 가드가 조용히 꺼진다.
							expectedAmount: data.detailDesignAmount,
							productDetailDesignPrice: exposure.detailDesignPrice,
							requested: data.detailDesignRequested,
						}),
					});
	}
	const layoutWrite = normalizeAdBannerLayout(data, exposure.exposureType);
	// 최종 저장될 레이아웃. 검수(금칙어)와 배너 이미지 필수 판정이 같은 값을 봐야 한다.
	const finalLayout = await resolveModeratedLayout(layoutWrite, existing.id);
	const preparedContent = await prepareJobPostContent(data, finalLayout);
	// 노출 상품·기간이 바뀌면 재결제가 필요하다. 유료 전환/변경은 미결제로 되돌리고,
	// 무료 전환은 결제 게이트 없이 즉시 게시(paid)로 둔다(생성 시 무료 공고와 동일 규칙).
	// 운영자 편집만 예외다 — 결제 상태와 광고 종료일은 결제 관리·광고 기간 조정 화면의
	// 몫이라, 여기서 되돌리면 게시 중이던 유료 공고가 조용히 노출에서 내려간다.
	const exposureChanged =
		!moderatorEdit &&
		(exposure.adProductId !== existing.adProductId ||
			exposure.exposureDurationDays !== existing.exposureDurationDays);
	// 옵션을 켜거나 끄면(또는 가격이 달라지면) 결제 총액이 바뀌므로 노출 변경과 동일하게
	// 미결제로 되돌린다. 금액 키가 없으면 컬럼을 안 건드리는 저장이라 총액도 그대로다.
	const detailDesignChanged =
		!moderatorEdit &&
		detailDesign.detailDesignAmount !== undefined &&
		detailDesign.detailDesignAmount !== existing.detailDesignAmount;
	const changedPaymentStatus = exposure.adProductId
		? ("unpaid" as const)
		: ("paid" as const);
	const nextPaymentStatus =
		exposureChanged || detailDesignChanged
			? changedPaymentStatus
			: existing.paymentStatus;
	const nextExposureEndsAt = exposureChanged ? null : existing.exposureEndsAt;
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
			: await getJobPostMediaUsages(existing.id),
		finalLayout
	);
	const status: JobPostStatus = moderatorEdit
		? (existing.status as JobPostStatus)
		: getUpdatedJobPostStatus({
				currentStatus: existing.status as JobPostStatus,
			});

	// 교체 대상에서 빠진 이미지만 GCS에서 지우기 위해, 갱신 전 키를 확보한다.
	const previousStorageKeys = mediaRows
		? await getJobPostMediaStorageKeys(existing.id)
		: [];

	const result = await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(jobPost)
			.set({
				...jobInput,
				...regionSelection,
				// 금액 단위 → "협의"로 바꿀 때 undefined면 drizzle이 컬럼을 건너뛰어
				// 예전 금액이 남는다. null로 명시해 지운다.
				payAmount: jobInput.payAmount ?? null,
				description: preparedContent.description,
				descriptionBlocks: preparedContent.descriptionBlocks,
				status,
				riskFlags:
					preparedContent.detectedTerms.length > 0 ? ["banned_word"] : [],
				detectedTerms: preparedContent.detectedTerms,
				adProductId: exposure.adProductId,
				exposureType: exposure.exposureType,
				exposureDurationDays: exposure.exposureDurationDays,
				exposureAmount: exposure.exposureAmount,
				// 스프레드로 넣는다: 금액을 보존해야 하는 경우(완료 건·운영자 편집·키 미전달)
				// detailDesignAmount 키 자체가 없어 drizzle이 그 컬럼을 건너뛴다.
				...detailDesign,
				manualBoostsPerDay: exposure.manualBoostsPerDay,
				autoBoostsPerDay: exposure.autoBoostsPerDay,
				paymentMethod: exposure.paymentMethod,
				paymentStatus: nextPaymentStatus,
				exposureEndsAt: nextExposureEndsAt,
				// 재검수로 내려가도 게시 시각은 지우지 않는다. 노출 정렬 키가
				// greatest(boosted_at, published_at)이라 지우면 재승인 후 정렬이 깨진다.
				publishedAt: existing.publishedAt,
			})
			.where(eq(jobPost.id, existing.id))
			.returning();

		if (!updated) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Job post could not be updated.",
			});
		}

		await writeAdBannerLayout(tx, updated.id, layoutWrite);

		// 운영자 편집은 애드온과 마찬가지로 끌어올리기 옵션도 완전 동결한다(input 무시).
		if (!moderatorEdit) {
			const existingBoostPurchases = await tx
				.select({
					boostsPerDay: jobBoostPurchase.boostsPerDay,
					createdAt: jobBoostPurchase.createdAt,
					expiresAt: jobBoostPurchase.expiresAt,
					id: jobBoostPurchase.id,
					optionType: jobBoostPurchase.optionType,
					paymentStatus: jobBoostPurchase.paymentStatus,
					remainingCount: jobBoostPurchase.remainingCount,
				})
				.from(jobBoostPurchase)
				.where(eq(jobBoostPurchase.jobPostId, existing.id));

			await syncBoostPurchases({
				actorUserId,
				existing: existingBoostPurchases,
				exposureType: exposure.exposureType,
				isPaidPosting: exposure.adProductId !== null,
				jobPostId: updated.id,
				optionPaymentMethod: data.boostOptionPaymentMethod,
				organizationId: existing.organizationId,
				postingPaymentMethod: exposure.paymentMethod,
				requestedTypes: data.boostOptionTypes,
				tx,
			});
		}

		const [registrationOptions] = await tx
			.select({
				total: sql<number>`coalesce(sum(${jobBoostPurchase.amount}), 0)::int`,
			})
			.from(jobBoostPurchase)
			.where(
				and(
					eq(jobBoostPurchase.jobPostId, existing.id),
					eq(jobBoostPurchase.purchaseSource, "job_registration")
				)
			);
		const updatedGrossAmount =
			(updated.exposureAmount ?? 0) +
			(updated.detailDesignAmount ?? 0) +
			(registrationOptions?.total ?? 0);
		if (updatedGrossAmount < existing.pointsUsed) {
			throw new ORPCError("BAD_REQUEST", {
				message: JOB_PAYMENT_POINTS_EXCEED_EDITED_TOTAL,
			});
		}

		if (mediaRows) {
			await tx
				.delete(jobPostMedia)
				.where(eq(jobPostMedia.jobPostId, existing.id));

			const insertedMedia =
				mediaRows.length > 0
					? await tx
							.insert(jobPostMedia)
							.values(
								buildJobPostMediaInsertRows({
									actorUserId,
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

	// 게시 중이던 공고를 구인자가 수정하면 재검수로 강등돼 랜딩에서 빠진다(운영자 편집은 status
	// 보존이라 강등 없음). 강등 전 published였을 때만 재색인을 요청한다 — 가드는 헬퍼로 분리했다.
	pingJobLandingForUpdatedPost(existing);

	return result;
};

interface CrawledJobSections {
	organic: JobFeedRow[];
	// 전체공고에 실제로 반환한 창 크기 — "더보기" 커서는 이 값만큼 전진한다.
	organicWindowSize: number;
	recommended: JobFeedRow[];
	special: JobFeedRow[];
	// 필터를 만족하는 수집 공고 전체 수(창과 무관).
	total: number;
	urgent: JobFeedRow[];
}

// 목록에 주입할 수집 행. 섹션 세 개는 라벨별 상한, 전체 공고는 organicPage 창을 쓴다.
// 스위치가 꺼져 있으면 조회조차 하지 않는다(공개 경로라 쿼리 한 번도 아깝다).
//
// withSections=false는 "더보기" 2페이지 이후다 — 섹션 3종은 첫 로드 고정이라 다시 돌리지
// 않고, organicPage.limit이 0이면(자체 공고가 그 페이지를 다 채웠으면) 전체 공고 쿼리도 건다.
const loadCrawledJobSections = async (
	input: z.infer<typeof listInput>,
	organicPage: { limit: number; offset: number },
	withSections: boolean
): Promise<CrawledJobSections> => {
	if (!(await isCrawledJobFeedEnabled())) {
		return {
			organic: [],
			organicWindowSize: 0,
			recommended: [],
			special: [],
			total: 0,
			urgent: [],
		};
	}

	// 과거 회차가 남긴 초과 라벨 방어 — 수집 시에도 같은 값으로 자르지만 조회에서 한 번 더 막는다.
	const limits = withSections ? await readCrawledLimits() : null;
	const sectionRows = async (
		type: CrawledSectionType
	): Promise<JobFeedRow[]> =>
		limits
			? await listCrawledSectionRows({ ...input, limit: limits[type], type })
			: [];
	// 전체 공고에는 라벨 무관 전량이 들어간다(승격 라벨 없이 'standard' 유지).
	const organicRows = async (): Promise<JobFeedRow[]> =>
		organicPage.limit > 0
			? await listCrawledSectionRows({
					...input,
					limit: organicPage.limit,
					offset: organicPage.offset,
				})
			: [];
	const [special, urgent, recommended, organic, total] = await Promise.all([
		sectionRows("special"),
		sectionRows("urgent"),
		sectionRows("recommended"),
		organicRows(),
		countCrawledJobFeedRows(input),
	]);
	const organicWindowSize = organic.length;

	return {
		organic,
		organicWindowSize,
		recommended,
		special,
		total,
		urgent,
	};
};

export const jobsRouter = {
	list: publicProcedure.input(listInput).handler(async ({ context, input }) => {
		const now = new Date();
		// 커서가 없으면 첫 페이지다 — 유료 섹션 3종은 이때만 조회하고, "더보기" 이후
		// 페이지는 전체 공고(organic)만 이어 받는다(섹션은 첫 로드 고정).
		const organicCursor = input.organicOffset;
		const isFirstPage = organicCursor === undefined;
		const filters = [
			eq(jobPost.status, "published" as JobPostStatus),
			eq(jobPost.paymentStatus, "paid"),
			eq(employerOrganizationProfile.verificationStatus, "verified"),
			// 대기열(결제됨·미활성) 스페셜/추천 공고를 organic 목록·전체 카운트에서 뺀다.
			// 섹션 쿼리(getExposedJobs)는 이미 exposureEndsAt로 제외하고, urgent엔 이 필터가
			// 항상 참이라 무해하다(정원 대상 타입에만 걸리는 조건).
			notQueuedListingFilter(),
			// 대표 탈퇴로 응대자가 0명이 된 고아 조직의 공고는 섹션·전체공고·카운트에서 뺀다.
			hasActiveOrgResponderFilter(),
		];

		if (input.industryCategory) {
			filters.push(eq(jobPost.industryCategory, input.industryCategory));
		}

		if (input.regionCode) {
			filters.push(eq(jobPost.regionCode, input.regionCode));
		}

		if (input.districtCode) {
			filters.push(eq(jobPost.districtCode, input.districtCode));
		}

		if (input.minPayAmount) {
			filters.push(
				minHourlyPayFilter(
					input.minPayAmount,
					jobPost.payAmount,
					jobPost.payUnit
				)
			);
		}

		const exposureSelection = {
			description: jobPost.description,
			beginnerFriendly: jobPost.beginnerFriendly,
			instantInterview: jobPost.instantInterview,
			coverImage: coverImageSql,
			// 아래 세 칸은 수집 행(crawledJobFeedSelection)과 모양을 맞추기 위한 자리다 —
			// 같은 배열에 두 출처가 섞이므로 키가 어긋나면 클라이언트가 출처별로 분기해야 한다.
			coverImageUrl: sql<null | string>`null::text`,
			listingType: sql<null | string>`null::text`,
			// impression·성과 집계에서 수집 행을 걸러내는 근거. job_performance_event가 job_post를
			// FK로 잡고 있어 수집 id가 섞이면 이 공개 조회가 통째로 죽는다.
			source: jobPost.source,
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
			regionCode: jobPost.regionCode,
			districtCode: jobPost.districtCode,
			status: jobPost.status,
			teamDisplayName: employerTeamProfile.displayName,
			title: jobPost.title,
			workSchedule: jobPost.workSchedule,
		};

		// 노출 정렬 키: 끌어올린(boosted_at) 시각과 게시 시각 중 최신. Postgres GREATEST는
		// null을 무시하므로 미점프 공고는 publishedAt 그대로이고, 점프 뒤 재검수·재게시로
		// publishedAt이 더 최신이 되면 자동으로 최신 쪽을 따른다. 배너 쿼리에는 적용하지 않는다.
		const exposureRankSql = sql`greatest(${jobPost.boostedAt}, ${jobPost.publishedAt})`;

		// 섹션 3종과 전체 공고가 같은 투영·조인을 쓴다.
		const selectExposureJobs = () =>
			db
				.select(exposureSelection)
				.from(jobPost)
				.innerJoin(
					employerOrganizationProfile,
					eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
				)
				.leftJoin(
					employerTeamProfile,
					eq(jobPost.teamId, employerTeamProfile.teamId)
				);
		type ExposureJobRow = Awaited<
			ReturnType<typeof selectExposureJobs>
		>[number];

		// 슬롯 상한 없이 결제완료·미만료 유료 공고를 전부 노출한다(행 단위 확장).
		const getExposedJobs = async (
			type: ListingSectionExposureType
		): Promise<ExposureJobRow[]> => {
			if (!isFirstPage) {
				return [];
			}

			// 대기열(결제됨·exposureEndsAt null) 공고는 노출에서 제외 — 활성화된 것만 보인다.
			// 단 이 배제는 정원 리스팅(special/recommended)에만 적용한다. urgent는 정원 대기열이
			// 없어 기존 동작(null=상시 노출) 그대로 유지한다.
			const exposureWindow =
				type === "urgent"
					? or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
					: and(
							isNotNull(jobPost.exposureEndsAt),
							gt(jobPost.exposureEndsAt, now)
						);

			return await selectExposureJobs()
				.where(and(...filters, eq(jobPost.exposureType, type), exposureWindow))
				.orderBy(desc(exposureRankSql));
		};

		const [
			specialRows,
			urgentRows,
			recommendedRows,
			organicRows,
			[jobPostTotalRow],
			[listingCapacityRow],
		] = await Promise.all([
			getExposedJobs("special"),
			getExposedJobs("urgent"),
			getExposedJobs("recommended"),
			selectExposureJobs()
				.where(and(...filters))
				.orderBy(
					sql`case when ${employerOrganizationProfile.verificationStatus} = 'verified' then 0 else 1 end`,
					desc(exposureRankSql),
					// offset 페이징은 정렬이 결정적일 때만 성립한다. 위 두 키는 대량으로
					// 동률이라(같은 시각에 게시된 공고들) id로 동점을 깬다 — 수집 목록이
					// 같은 이유로 이미 하고 있는 것과 같다.
					desc(jobPost.id)
				)
				// 전체공고는 페이지마다 정확히 limit개를 소비한다. 유료 섹션은 별도 쿼리다.
				.limit(input.limit)
				.offset(organicCursor?.jobPost ?? 0),
			// 필터를 만족하는 자체 공고 전체 수. 페이지 창과 무관해야 헤더의 전체 건수와
			// "더보기" 종료 판정이 정확하다.
			db
				.select({ value: count() })
				.from(jobPost)
				.innerJoin(
					employerOrganizationProfile,
					eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
				)
				.where(and(...filters)),
			// 스페셜/추천 방어적 slice에 쓸 정원. null이면 아래에서 코드 기본값으로 폴백한다.
			db
				.select({
					recommendedCapacity: bambiSiteSettings.recommendedCapacity,
					specialCapacity: bambiSiteSettings.specialCapacity,
				})
				.from(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"))
				.limit(1),
		]);
		const jobPostTotal = jobPostTotalRow?.value ?? 0;

		const result = buildExposureJobSections({
			limit: input.limit,
			now,
			organicRows,
			recommendedRows,
			specialRows,
			urgentRows,
		});

		// 방어적 slice: 정원=슬롯 수 불변식은 승인 게이트가 지키지만, 운영자가 정원을 낮춘
		// 직후처럼 이미 active인 공고 수가 새 정원을 넘는 전이 상태가 있을 수 있다. 정렬은
		// 그대로 두고 앞에서부터 정원 개수만 남긴다(urgent/organic·cursor·totalCount는 그대로).
		result.sections.special = result.sections.special.slice(
			0,
			listingCapacityRow?.specialCapacity ?? DEFAULT_SPECIAL_CAPACITY
		);
		result.sections.recommended = result.sections.recommended.slice(
			0,
			listingCapacityRow?.recommendedCapacity ?? DEFAULT_RECOMMENDED_CAPACITY
		);
		// 섹션 중복 노출을 위한 보강분 때문에 organic 배열이 limit을 넘을 수 있다.
		// 실제 전체공고 페이지에는 밤비 공고를 최대 limit까지만 싣고, 남은 자리만
		// 아래에서 크롤링 공고로 채운다.
		const pageJobPostOrganic = result.sections.organic.slice(0, input.limit);
		const jobPostWindowSize = Math.min(
			result.organicWindowSize,
			pageJobPostOrganic.length
		);

		// 현재 요청에서 새로 기록하는 impression 때문에 판정이 왜곡되지 않도록,
		// recordJobListingImpressions 이전에 최근 7일 성과를 집계해 각 item에 붙인다.
		// 집계·기록 대상은 아래 result.sections(유료 행)뿐이다 — 수집 행은 뒤에서 붙이므로
		// job_performance_event에 수집 id가 들어갈 경로가 없다.
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

		// 유료 광고 섹션(스페셜·급구·추천) 카드에 붙일 조직 단위 누적 광고 집계(횟수·일수).
		// 노출된 유료 밤비 공고의 조직만 모아 job_ad_purchase를 1회 group by 한다 —
		// organic·수집 행은 유료 자리가 아니라 대상이 아니다(빈 org 집합이면 쿼리 생략).
		const paidSectionOrgIds = [
			...new Set(
				[
					...result.sections.special,
					...result.sections.urgent,
					...result.sections.recommended,
				].map((item) => item.organizationId)
			),
		];
		const adPeriodRows =
			paidSectionOrgIds.length > 0
				? await db
						.select({
							organizationId: jobAdPurchase.organizationId,
							count: sql<number>`count(*)::int`,
							totalDays: sql<number>`coalesce(sum(${jobAdPurchase.durationDays}), 0)::int`,
						})
						.from(jobAdPurchase)
						.where(inArray(jobAdPurchase.organizationId, paidSectionOrgIds))
						.groupBy(jobAdPurchase.organizationId)
				: [];
		const adPeriodByOrg = new Map(
			adPeriodRows.map((row) => [
				row.organizationId,
				{ count: row.count, totalDays: row.totalDays },
			])
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
			// 유료 카드만·문자열 organizationId가 있을 때만 집계를 붙인다(수집 행은 organizationId
			// 가 null이라 자연히 제외, organic은 inPaidSection=false라 제외).
			adPeriod:
				inPaidSection &&
				"organizationId" in item &&
				typeof item.organizationId === "string"
					? (adPeriodByOrg.get(item.organizationId) ?? null)
					: null,
		});

		await recordJobListingImpressions({
			actorUserId: context.session?.user.id,
			sections: result.sections,
		});

		// 우선순위 규칙: 1순위 우리 순수 공고가 항상 최상단, 2순위 크롤링. 섞어 정렬하지 않고
		// 각 섹션·전체 공고의 **뒤에** 붙인다. 전체 공고도 같은 순서라 "더보기"는 자체 공고를
		// 다 소진한 뒤에야 수집 블록으로 넘어간다.
		const crawled = await loadCrawledJobSections(
			input,
			{
				// 첫 페이지와 더보기 모두 밤비 공고를 우선 배치하고 남은 슬롯만
				// 크롤링 공고로 채운다. 밤비 공고가 재승인되어 다시 노출돼도
				// 한 페이지의 전체공고 개수는 input.limit(현재 48)를 유지한다.
				limit: Math.max(0, input.limit - pageJobPostOrganic.length),
				offset: organicCursor?.crawled ?? 0,
			},
			isFirstPage
		);
		const crawledIds = new Set(
			[
				...crawled.special,
				...crawled.urgent,
				...crawled.recommended,
				...crawled.organic,
			].map((item) => item.id)
		);
		const nextOrganicOffset = {
			crawled: (organicCursor?.crawled ?? 0) + crawled.organicWindowSize,
			jobPost: (organicCursor?.jobPost ?? 0) + jobPostWindowSize,
		};
		const hasMoreOrganic =
			nextOrganicOffset.jobPost < jobPostTotal ||
			nextOrganicOffset.crawled < crawled.total;

		return {
			// 필터를 만족하는 전체 자격 공고 수(섹션은 전체 공고의 부분집합이라 두 원천의
			// 합이 곧 고유 건수다). 이번 페이지가 아니라 "더보기"로 끝까지 도달할 수 있는
			// 총량이며, 화면 헤더의 "N개" 표기가 이 값이다.
			availableCount: jobPostTotal + crawled.total,
			// 전체 공고를 이어 받을 커서. 더 없으면 null이라 더보기 버튼이 사라진다.
			nextOrganicOffset: hasMoreOrganic ? nextOrganicOffset : null,
			// 수집 행은 섹션과 전체 공고에 동시에 담기므로 고유 id로 센다(유료 쪽과 같은 규칙).
			// 이 응답에 실제로 담긴 공고 수다(전체 자격 건수는 availableCount).
			totalCount: result.totalCount + crawledIds.size,
			sections: {
				organic: [
					...pageJobPostOrganic.map((item) => toListItem(item, false)),
					...crawled.organic.map((item) => toListItem(item, false)),
				],
				recommended: [
					...result.sections.recommended.map((item) => toListItem(item, true)),
					...crawled.recommended.map((item) => toListItem(item, true)),
				],
				special: [
					...result.sections.special.map((item) => toListItem(item, true)),
					...crawled.special.map((item) => toListItem(item, true)),
				],
				urgent: [
					...result.sections.urgent.map((item) => toListItem(item, true)),
					...crawled.urgent.map((item) => toListItem(item, true)),
				],
			},
		};
	}),

	// 사이트맵 전용 경량 집계. 지역×업종별 공개 노출 자격 공고 수·최신 갱신 시각을 목록과 같은
	// 자격 조건으로 세어, 0건 조합 제외와 lastmod 산정에 쓴다(공고 본문·미디어는 싣지 않는다).
	landingSummary: publicProcedure.handler(
		async () => await listLandingJobSummary()
	),

	search: publicProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(20).default(20),
				query: z.string().trim().min(1).max(100),
			})
		)
		.handler(async ({ input }) => {
			const rows = await searchJobFeed(input);

			return {
				// list 항목과 같은 모양으로 내려 클라이언트 매퍼(toMarketplaceJob)를 재사용한다.
				// 검색 결과 노출은 유료 자리도 성과 집계 대상도 아니다 — impression을 기록하지
				// 않고 성과 칸은 0으로 채운다(수집 행이 목록에서 받는 값과 같다).
				items: rows.map((row) => ({
					...row,
					isPromoted: false,
					performance: { detailViews: 0, impressions: 0 },
					promotionLabel: null,
				})),
			};
		}),

	legacyList: publicProcedure.input(listInput).handler(async ({ input }) => {
		const filters = [
			eq(jobPost.status, "published" as JobPostStatus),
			eq(jobPost.paymentStatus, "paid"),
			eq(employerOrganizationProfile.verificationStatus, "verified"),
			// 대기열(결제됨·미활성) 스페셜/추천 공고 제외 — list와 동일.
			notQueuedListingFilter(),
			// 고아 조직(응대자 0명) 공고 제외 — list와 동일.
			hasActiveOrgResponderFilter(),
		];

		if (input.industryCategory) {
			filters.push(eq(jobPost.industryCategory, input.industryCategory));
		}

		if (input.regionCode) {
			filters.push(eq(jobPost.regionCode, input.regionCode));
		}

		if (input.districtCode) {
			filters.push(eq(jobPost.districtCode, input.districtCode));
		}

		if (input.minPayAmount) {
			filters.push(
				minHourlyPayFilter(
					input.minPayAmount,
					jobPost.payAmount,
					jobPost.payUnit
				)
			);
		}

		return await db
			.select({
				id: jobPost.id,
				title: jobPost.title,
				industryCategory: jobPost.industryCategory,
				region: jobPost.region,
				district: jobPost.district,
				regionCode: jobPost.regionCode,
				districtCode: jobPost.districtCode,
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
		const selectedRows = await db
			.select({
				// 배너 이미지 위에 얹을 레이아웃(문구·좌표·연출). 편집한 적 없는 공고는 조인이
				// 비어 null이라 클라이언트가 예전처럼 이미지만 렌더한다.
				layout: jobAdBannerLayout.layout,
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
				// 수집 배너와 한 배열에 섞이므로 출처를 함께 내린다 — 클라이언트가 이 값으로
				// 클릭 대상을 가른다(수집 공고에는 상세 페이지가 없다).
				source: jobPost.source,
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
			.leftJoin(jobAdBannerLayout, eq(jobPost.id, jobAdBannerLayout.jobPostId))
			.where(
				and(
					eq(jobPost.status, "published" as JobPostStatus),
					eq(jobPost.paymentStatus, "paid"),
					eq(employerOrganizationProfile.verificationStatus, "verified"),
					inArray(jobPost.exposureType, [...AD_BANNER_EXPOSURE_TYPES]),
					or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now)),
					// 고아 조직(응대자 0명) 공고는 배너 슬롯에서도 뺀다.
					hasActiveOrgResponderFilter()
				)
			)
			.orderBy(desc(jobPost.publishedAt));

		// jsonb 컬럼은 drizzle이 unknown으로 준다. 캐스팅만 하면 형태가 어긋난 행 하나가
		// 렌더러에서 터지는데, 이 배너 레일은 마켓플레이스·공고상세·채팅목록 등 여러 화면에
		// 붙어 있어 한 광고주의 잘못된 행이 화면 전체를 내린다. 읽을 때마다 다시 검증하고
		// 실패하면 null로 떨어뜨려 이미지만 나오게 한다.
		const rows = selectedRows.map((row) => ({
			...row,
			layout: parseStoredAdBannerLayout(row.layout ?? null),
		}));

		// 로테이션 주기는 운영자 사이트 설정값(분)을 따르고, 미설정이면 코드 기본값을 쓴다.
		const [settingsRow] = await db
			.select({
				crawledAdBannerEnabled: bambiSiteSettings.crawledAdBannerEnabled,
				minutes: bambiSiteSettings.adBannerRotationMinutes,
			})
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, "default"))
			.limit(1);
		const rotationMs =
			(settingsRow?.minutes ?? DEFAULT_AD_ROTATION_MINUTES) * 60 * 1000;
		const groups = groupAdBannerJobs(rows, now, rotationMs);

		// 슬롯 방향 배너가 없는 후보는 비운다(단색 배경 슬롯은 예외 — requireDirectionImage 참고).
		// 문의 예약 칸과는 충돌하지 않는다: 그 칸은 groupAdBannerJobs가 이미 null로 비웠고
		// requireDirectionImage는 null을 그대로 null로 흘려보내기만 한다(비우기만 하는 필터).
		const directedGroups = {
			leftBanner: requireDirectionImage(groups.leftBanner, "ad_horizontal"),
			premiumBanner: requireDirectionImage(
				groups.premiumBanner,
				"ad_horizontal"
			),
			rightBanner: requireDirectionImage(groups.rightBanner, "ad_vertical"),
		};

		// impression은 결제 광고에만 기록한다. job_performance_event가 job_post를 FK로 잡고
		// 있어 수집 공고 id를 넣으면 이 공개 조회가 통째로 실패하고, 성과 지표는 광고주에게
		// 보여주는 값이라 수집 노출을 섞으면 숫자의 의미가 흐려진다.
		//
		// 순서 주의: 이 집계는 groupAdBannerJobs가 문의 칸을 이미 null로 비운 뒤의 groups를
		// (requireDirectionImage만 한 겹 더 통과시켜) 그대로 받는다. 그래서 문의 칸에 밀려난
		// 광고에는 노출이 기록되지 않는다 — 화면에 안 나온 광고의 impression을 광고주에게
		// 청구하지 않으려면 이 순서(비우기 → 방향 필터 → 집계)가 유지돼야 한다.
		await recordAdBannerImpressions({
			actorUserId: context.session?.user.id,
			groups: directedGroups,
		});

		if (!settingsRow?.crawledAdBannerEnabled) {
			return directedGroups;
		}

		// 문의 칸은 전역 슬롯(0..8)으로 오므로 그룹 배열의 (그룹 키, 배열 위치)로 풀어 둔다.
		// 0-2=좌·3-5=중간 프리미엄·6-8=우 순서이며, 변환은 링 base에서 파생하는 서비스 헬퍼가 맡는다.
		const inquiry = adBannerSlotLocation(groups.inquirySlotIndex);

		// 수집 배너는 결제 광고가 채우지 못한 칸에만 들어가고, 가로형·세로형이 서로 다른 링을
		// 돈다(groupCrawledAdBannerJobs 참고).
		const crawledGroups = groupCrawledAdBannerJobs(
			await loadCrawledAdBannerPools(),
			now,
			rotationMs
		);

		// 병합하되 문의 칸만은 끝까지 비워 둔다. 이 방어가 없으면 수집 배너가 켜진 사이트에서
		// 빈 칸이 전부 수집 배너로 메워져 "광고 등록 문의" 카드가 다시 사라진다 — 결제 광고 만석
		// 대비로 센티넬을 넣은 의미가 통째로 없어진다.
		const mergeKeepingInquirySlot = <TCrawled, TPaid>(
			group: AdBannerGroupKey,
			paid: (TPaid | null)[],
			crawled: (TCrawled | null)[]
		): (TCrawled | TPaid | null)[] => {
			const reservedIndex = inquiry.group === group ? inquiry.index : -1;
			return mergeAdBannerSlots(paid, crawled).map((item, index) =>
				index === reservedIndex ? null : item
			);
		};

		return {
			leftBanner: mergeKeepingInquirySlot(
				"leftBanner",
				directedGroups.leftBanner,
				crawledGroups.leftBanner
			),
			premiumBanner: mergeKeepingInquirySlot(
				"premiumBanner",
				directedGroups.premiumBanner,
				crawledGroups.premiumBanner
			),
			rightBanner: mergeKeepingInquirySlot(
				"rightBanner",
				directedGroups.rightBanner,
				crawledGroups.rightBanner
			),
		};
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
					exposureType: jobPost.exposureType,
					exposureEndsAt: jobPost.exposureEndsAt,
					industryCategory: jobPost.industryCategory,
					region: jobPost.region,
					district: jobPost.district,
					regionCode: jobPost.regionCode,
					districtCode: jobPost.districtCode,
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
				// 고아 조직(대표 탈퇴로 응대자 0명) 공고는 상세 직접 접근도 NOT_FOUND로 막는다 —
				// 조건 불일치 시 행이 안 잡혀 아래 status 게이트가 NOT_FOUND를 던진다.
				.where(and(eq(jobPost.id, input.id), hasActiveOrgResponderFilter()))
				.limit(1);

			if (
				post?.status !== "published" ||
				post.paymentStatus !== "paid" ||
				post.employerVerificationStatus !== "verified"
			) {
				throw new ORPCError("NOT_FOUND");
			}

			// 대기열 공고(스페셜/추천이면서 아직 미활성=exposureEndsAt null)는 아직 공개 전이다 —
			// 결제·게시됐어도 자리가 나 활성화되기 전까지 상세를 열어주지 않는다.
			const isQueuedListing =
				(post.exposureType === "special" ||
					post.exposureType === "recommended") &&
				post.exposureEndsAt === null;
			if (isQueuedListing) {
				throw new ORPCError("NOT_FOUND");
			}

			await recordJobPerformanceEvent({
				actorUserId: context.session?.user.id,
				eventType: "detail_view",
				jobPostId: post.id,
				organizationId: post.organizationId,
			});

			// 공고 작성자(구인자)의 인증번호를 상세에 노출한다(인증된 경우에만).
			const [creatorProfile] = await db
				.select({
					displayName: user.name,
					profileImageUrl: user.image,
					isPhoneVerified: bambiProfile.isPhoneVerified,
					phoneNumber: bambiProfile.phoneNumber,
				})
				.from(bambiProfile)
				.innerJoin(user, eq(user.id, bambiProfile.userId))
				.where(eq(bambiProfile.userId, post.createdByUserId))
				.limit(1);

			return {
				...post,
				createdByDisplayName: creatorProfile?.displayName ?? null,
				createdByProfileImageUrl: creatorProfile?.profileImageUrl ?? null,
				employerVerifiedPhone: creatorProfile?.isPhoneVerified
					? (creatorProfile.phoneNumber ?? null)
					: null,
				media: await getJobPostMediaSet(post.id),
			};
		}),

	listMine: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		if (!isEmployerLikeRole(profile.role)) {
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
			.filter((membership) => isOrganizationManagerRole(membership.role))
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

		const rows = await db
			.select({
				id: jobPost.id,
				title: jobPost.title,
				industryCategory: jobPost.industryCategory,
				region: jobPost.region,
				district: jobPost.district,
				regionCode: jobPost.regionCode,
				districtCode: jobPost.districtCode,
				payAmount: jobPost.payAmount,
				payUnit: jobPost.payUnit,
				status: jobPost.status,
				// 반려 사유는 목록에서 바로 보여준다. 안 내려주면 구인자는 무엇을 고쳐야 하는지
				// 알 방법이 화면 어디에도 없다.
				rejectionReason: jobPost.rejectionReason,
				organizationId: jobPost.organizationId,
				teamId: jobPost.teamId,
				createdByUserId: jobPost.createdByUserId,
				exposureType: jobPost.exposureType,
				detailDesignStatus: jobPost.detailDesignStatus,
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

		// 대기열 공고에 FIFO 순번을 붙여 "대기열 #N"을 렌더할 수 있게 한다. 양 섹션 대기 행을
		// 요청당 1회만 조회하고, 대기가 아닌 행은 position이 없어 null이 된다.
		const queuePositions = await getListingQueuePositions(db);
		return rows.map((row) => ({
			...row,
			listingQueuePosition: queuePositions.get(row.id)?.position ?? null,
		}));
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

			// 수정 폼 프리필. 레이아웃을 함께 내리지 않으면 폼이 빈 값으로 시작해 저장 시
			// 기존 배너 편집물이 사라진다.
			return {
				...post,
				adBannerLayout: await getStoredAdBannerLayout(post.id),
				// 신청된 끌어올리기 옵션 전체(createdAt 순). 폼이 paid·활성 구매를 체크 고정하고,
				// unpaid 구매를 토글 가능하게 표시하는 데 쓴다.
				boostPurchases: await db
					.select({
						amount: jobBoostPurchase.amount,
						expiresAt: jobBoostPurchase.expiresAt,
						id: jobBoostPurchase.id,
						optionType: jobBoostPurchase.optionType,
						paymentStatus: jobBoostPurchase.paymentStatus,
						purchaseSource: jobBoostPurchase.purchaseSource,
						remainingCount: jobBoostPurchase.remainingCount,
					})
					.from(jobBoostPurchase)
					.where(eq(jobBoostPurchase.jobPostId, post.id))
					.orderBy(asc(jobBoostPurchase.createdAt)),
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
			await assertJobPostWarningRestriction({
				role: actor.role,
				userId: actor.userId,
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
			// 레이아웃은 별도 테이블이라 job_post 컬럼 spread에서 빼 둔다. 애드온 두 필드도 뺀다 —
			// detailDesignRequested는 컬럼이 아니고, detailDesignAmount는 "클라이언트가 본 가격"이라
			// 그대로 흘려보내면 저장 금액이 클라이언트 입력으로 덮인다. 끌어올리기 옵션 두 필드도
			// job_post 컬럼이 아니라 별도 테이블(jobBoostPurchase) 몫이라 spread에서 분리한다.
			const {
				adBannerLayout: _adBannerLayout,
				boostOptionPaymentMethod: _boostOptionPaymentMethod,
				boostOptionTypes: _boostOptionTypes,
				descriptionBlocks: _descriptionBlocks,
				detailDesignAmount: _detailDesignAmount,
				detailDesignRequested: _detailDesignRequested,
				media,
				pointsToUse: _pointsToUse,
				submissionKey: _submissionKey,
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

			// 지역 코드는 클라이언트가 보낸 값이라 저장 전에 마스터 대조가 필요하다. 표시용
			// region·district 문자열도 여기서 나온다.
			const regionSelection = await resolveRegionSelection(input);
			// 노출 확정이 먼저다 — 배너형이 아니면 문구를 저장 전에 버려야 하고, 검수
			// 검사도 실제로 저장될 문구만 봐야 한다.
			const exposure = await resolveJobPostExposure({
				adProductId: input.adProductId,
				exposureDurationDays: input.exposureDurationDays,
				expectedExposureAmount: input.exposureAmount,
				paymentMethod: input.paymentMethod,
			});
			// 신규 등록이라 기존 상태가 없다(currentStatus: null) — 보존 분기도 필요 없다.
			const detailDesign = resolveJobDetailDesignSnapshot({
				currentStatus: null,
				// 노출 금액과 같은 재확인 값. 안 넘기면 가격 변동 가드가 조용히 꺼진다.
				expectedAmount: input.detailDesignAmount,
				productDetailDesignPrice: exposure.detailDesignPrice,
				requested: input.detailDesignRequested ?? false,
			});
			const layoutWrite = normalizeAdBannerLayout(input, exposure.exposureType);
			// 최종 저장될 레이아웃. 검수(금칙어)와 배너 이미지 필수 판정이 같은 값을 봐야 한다.
			const finalLayout = await resolveModeratedLayout(layoutWrite, null);
			const preparedContent = await prepareJobPostContent(input, finalLayout);
			const mediaRows = requireValidJobPostMediaSet({
				media,
				organizationId: input.organizationId,
			});
			requireAdBannerMedia(
				exposure.exposureType,
				mediaRows.map((row) => row.usage),
				finalLayout
			);
			// 공고는 예외 없이 운영자 검수를 거친다. 업소 인증 여부로 건너뛰지 않는다.
			const status: JobPostStatus = "pending_review";

			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 공고·옵션·미디어·포인트를 원자적으로 확정하는 단일 트랜잭션이다.
			const result = await db.transaction(async (tx) => {
				if (input.submissionKey) {
					const [retried] = await tx
						.select()
						.from(jobPost)
						.where(
							and(
								eq(jobPost.createdByUserId, actor.userId),
								eq(jobPost.submissionKey, input.submissionKey)
							)
						)
						.limit(1);
					if (retried) {
						return { ...retried, media: await getJobPostMediaSet(retried.id) };
					}
				}
				const [created] = await tx
					.insert(jobPost)
					.values({
						...jobInput,
						...regionSelection,
						createdByUserId: actor.userId,
						description: preparedContent.description,
						descriptionBlocks: preparedContent.descriptionBlocks,
						status,
						riskFlags:
							preparedContent.detectedTerms.length > 0 ? ["banned_word"] : [],
						detectedTerms: preparedContent.detectedTerms,
						adProductId: exposure.adProductId,
						exposureType: exposure.exposureType,
						exposureDurationDays: exposure.exposureDurationDays,
						exposureAmount: exposure.exposureAmount,
						detailDesignAmount: detailDesign.detailDesignAmount,
						detailDesignStatus: detailDesign.detailDesignStatus,
						manualBoostsPerDay: exposure.manualBoostsPerDay,
						autoBoostsPerDay: exposure.autoBoostsPerDay,
						paymentMethod: exposure.paymentMethod,
						// 무료 공고(유료 노출상품 미선택)는 결제 게이트 없이 즉시 노출한다.
						// 유료 노출상품을 선택한 경우에만 운영자 결제완료 처리를 기다린다.
						paymentStatus: exposure.adProductId ? "unpaid" : "paid",
						pointsUsed: 0,
						pointsUsedByUserId: input.pointsToUse > 0 ? actor.userId : null,
						submissionKey: input.submissionKey,
						publishedAt: null,
					})
					.returning();

				if (!created) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Job post could not be created.",
					});
				}

				await writeAdBannerLayout(tx, created.id, layoutWrite);

				// 공고 insert와 같은 tx에서 신청된 끌어올리기 옵션을 구매(unpaid) 처리한다.
				// 신규 공고라 기존 구매가 없어 신청분을 그대로 insert한다.
				await syncBoostPurchases({
					actorUserId: actor.userId,
					existing: [],
					exposureType: exposure.exposureType,
					isPaidPosting: exposure.adProductId !== null,
					jobPostId: created.id,
					optionPaymentMethod: input.boostOptionPaymentMethod,
					organizationId: input.organizationId,
					postingPaymentMethod: exposure.paymentMethod,
					requestedTypes: input.boostOptionTypes,
					tx,
				});

				const [boostTotalRow] = await tx
					.select({
						total: sql<number>`coalesce(sum(${jobBoostPurchase.amount}), 0)::int`,
					})
					.from(jobBoostPurchase)
					.where(
						and(
							eq(jobBoostPurchase.jobPostId, created.id),
							eq(jobBoostPurchase.purchaseSource, "job_registration")
						)
					);
				const grossAmount =
					(created.exposureAmount ?? 0) +
					(created.detailDesignAmount ?? 0) +
					(boostTotalRow?.total ?? 0);
				const requestedPoints = input.pointsToUse;
				const pointDescription = buildJobPointDescription(
					exposure.exposureType,
					input.boostOptionTypes
				);
				if (requestedPoints > 0) {
					const [settings] = await tx
						.select({
							max: bambiSiteSettings.jobPaymentMaxPoints,
							min: bambiSiteSettings.jobPaymentMinPoints,
						})
						.from(bambiSiteSettings)
						.where(eq(bambiSiteSettings.id, "default"))
						.limit(1);
					const minimum = settings?.min ?? 0;
					if (minimum <= 0 || requestedPoints < minimum) {
						throw new ORPCError("BAD_REQUEST", {
							message:
								minimum > 0
									? `최소 ${minimum.toLocaleString("ko-KR")}포인트부터 사용할 수 있어요.`
									: "공고 결제 포인트 사용이 중단되어 있습니다.",
						});
					}
					const balance = await getPointBalanceTx(tx, actor.userId);
					const limit = resolveJobPointUseLimit({
						balance,
						grossAmount,
						maximum: settings?.max ?? null,
						minimum,
					});
					if (!limit.enabled || requestedPoints > limit.maximum) {
						throw new ORPCError("BAD_REQUEST", {
							message:
								"결제 예정 금액과 설정된 사용 한도를 초과할 수 없습니다.",
						});
					}
					try {
						await adjustMemberPoints(tx, {
							amount: -requestedPoints,
							description: pointDescription,
							externalKey: `job_payment_use:${created.id}`,
							reason: `공고 등록 포인트 사용: ${created.id}`,
							userId: actor.userId,
						});
					} catch (error) {
						throw new ORPCError("BAD_REQUEST", {
							message:
								error instanceof Error
									? error.message
									: "포인트를 사용할 수 없습니다.",
						});
					}
				}
				const needsPaymentConfirmation = grossAmount > 0 || requestedPoints > 0;
				const [withPoints] = await tx
					.update(jobPost)
					.set({
						paymentStatus: needsPaymentConfirmation ? "unpaid" : "paid",
						pointsUsed: requestedPoints,
						pointsUsedByUserId: requestedPoints > 0 ? actor.userId : null,
					})
					.where(eq(jobPost.id, created.id))
					.returning();

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
					...(withPoints ?? created),
					media: toJobPostMediaSet(insertedMedia),
				};
			});

			// 모든 공고는 예외 없이 pending_review로 들어온다 — 운영자 검수 큐에 새 건이
			// 쌓였다는 신호다. 개인 수신자가 없으니 role 공유 1행. 커밋 뒤 best-effort.
			await notifyBambiNotification({
				actorUserId: actor.userId,
				metadata: { action: "submitted", organizationId: input.organizationId },
				recipientRole: "admin",
				targetId: result.id,
				targetType: "job_post",
			});

			return result;
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

			const actor = await requireEmployerPostingAccess({
				organizationId: existing.organizationId,
				teamId: existing.teamId,
				session: context.session,
			});

			const result = await applyJobPostUpdate({
				actorUserId: actor.userId,
				data: input.data,
				existing,
			});

			// 반려 공고를 고쳐 다시 낸 경우도 새 검수거리다. 게시 중 공고의 단순 수정
			// (상태 불변)까지 알리면 큐가 소음으로 찬다 — 전이가 일어난 경우만 보낸다.
			if (
				existing.status !== "pending_review" &&
				result.status === "pending_review"
			) {
				await notifyBambiNotification({
					actorUserId: actor.userId,
					metadata: {
						action: "submitted",
						organizationId: existing.organizationId,
					},
					recipientRole: "admin",
					targetId: existing.id,
					targetType: "job_post",
				});
			}

			return result;
		}),
	getDeletePointRefundPreview: protectedProcedure
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
			if (
				existing.pointsUsed <= 0 ||
				!existing.pointsUsedByUserId ||
				existing.pointsRefundedAt ||
				existing.pointsRefundLockedAt
			) {
				return {
					forfeitedAmount: 0,
					refundAmount: 0,
					refundLocked: existing.pointsRefundLockedAt !== null,
					usedAmount: existing.pointsUsed,
				};
			}
			return await db.transaction(async (tx) => {
				await lockMemberPoints(tx, existing.pointsUsedByUserId as string);
				const [capRow] = await tx
					.select({ cap: bambiSiteSettings.maxMemberPoints })
					.from(bambiSiteSettings)
					.where(eq(bambiSiteSettings.id, "default"))
					.limit(1);
				const balance = await getPointBalanceTx(
					tx,
					existing.pointsUsedByUserId as string
				);
				const refund = resolveCappedPointRefund({
					balance,
					cap: capRow?.cap ?? null,
					usedAmount: existing.pointsUsed,
				});
				return {
					cap: capRow?.cap ?? null,
					...refund,
					refundLocked: false,
					usedAmount: existing.pointsUsed,
				};
			});
		}),
	delete: protectedProcedure
		.input(
			z.object({
				expectedForfeitedAmount: z.number().int().min(0).optional(),
				expectedRefundAmount: z.number().int().min(0).optional(),
				id: z.string().uuid(),
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

			// 연관 미디어·프로모션·성과 이벤트 행은 FK onDelete cascade로 함께 제거되지만,
			// GCS 객체는 cascade 대상이 아니므로 키를 미리 확보해 직접 지운다.
			const storageKeys = await getJobPostMediaStorageKeys(input.id);

			await db.transaction(async (tx) => {
				const [locked] = await tx
					.select()
					.from(jobPost)
					.where(eq(jobPost.id, input.id))
					.for("update")
					.limit(1);
				if (!locked) {
					throw new ORPCError("NOT_FOUND");
				}
				if (
					locked.pointsUsed > 0 &&
					locked.pointsUsedByUserId &&
					!locked.pointsRefundedAt &&
					!locked.pointsRefundLockedAt
				) {
					await lockMemberPoints(tx, locked.pointsUsedByUserId);
					const [debit] = await tx
						.select({
							amount: bambiPointTransaction.amount,
							description: bambiPointTransaction.description,
						})
						.from(bambiPointTransaction)
						.where(
							eq(
								bambiPointTransaction.externalKey,
								`job_payment_use:${locked.id}`
							)
						)
						.limit(1);
					if (!debit || -debit.amount !== locked.pointsUsed) {
						throw new ORPCError("CONFLICT", {
							message:
								"공고의 포인트 차감 기록이 일치하지 않아 삭제할 수 없습니다. 운영자에게 문의해 주세요.",
						});
					}
					const [capRow] = await tx
						.select({ cap: bambiSiteSettings.maxMemberPoints })
						.from(bambiSiteSettings)
						.where(eq(bambiSiteSettings.id, "default"))
						.limit(1);
					const balance = await getPointBalanceTx(
						tx,
						locked.pointsUsedByUserId
					);
					const { forfeitedAmount, refundAmount } = resolveCappedPointRefund({
						balance,
						cap: capRow?.cap ?? null,
						usedAmount: locked.pointsUsed,
					});
					if (
						input.expectedRefundAmount !== undefined &&
						(input.expectedRefundAmount !== refundAmount ||
							input.expectedForfeitedAmount !== forfeitedAmount)
					) {
						throw new ORPCError("CONFLICT", {
							message:
								"포인트 잔액이 변경되었습니다. 최신 환급 금액을 확인한 뒤 다시 시도해 주세요.",
						});
					}
					if (refundAmount > 0) {
						await awardMemberPoints(tx, {
							amount: refundAmount,
							description: buildJobPointRefundDescription(debit.description),
							externalKey: `job_payment_refund:${locked.id}`,
							reason: `공고 취소 포인트 환급: ${locked.id}`,
							userId: locked.pointsUsedByUserId,
						});
					} else {
						await tx.insert(bambiPointTransaction).values({
							amount: 0,
							balanceAfter: balance,
							description: buildJobPointRefundDescription(debit.description),
							externalKey: `job_payment_refund:${locked.id}`,
							reason: `공고 취소 포인트 환급 완료(상한 소멸): ${locked.id}`,
							userId: locked.pointsUsedByUserId,
						});
					}
					await tx
						.update(jobPost)
						.set({ pointsRefundedAt: new Date() })
						.where(eq(jobPost.id, locked.id));
				}
				await tx.delete(jobPost).where(eq(jobPost.id, input.id));
			});
			await deletePublicObjects(storageKeys);

			// 노출 중이던 공고가 사라졌으면 랜딩 재색인을 요청한다(집계에서 빠져야 한다).
			// 검수 전(pending_review 등) 비공개 공고 삭제는 랜딩에 영향이 없어 건너뛴다.
			if (existing.status === "published") {
				pingJobLanding(existing);
			}

			return { id: input.id };
		}),
};

import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	adProduct,
	bambiProfile,
	bambiSiteSettings,
	employerOrganizationProfile,
	employerTeamProfile,
	jobAdBannerLayout,
	jobIndustryCategory,
	jobPost,
	jobPostMedia,
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
	type AdBannerLayoutInput,
	adBannerLayoutSchema,
	collectLayoutModerationText,
	isAdBannerImageRequired,
	parseStoredAdBannerLayout,
} from "../../services/bambi-ad-banner-layout";
import {
	AD_BANNER_EXPOSURE_TYPES,
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
import { discountedAdAmount } from "../../services/bambi-ad-pricing";
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
import { loadCrawledAdBannerPools } from "../../services/bambi-crawled-ad-banner-slots";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import {
	getJobDescriptionBlockRiskTerms,
	jobDescriptionBlockTypes,
	normalizeJobDescriptionBlocks,
	toPlainJobDescription,
	validateJobDescriptionBlocks,
} from "../../services/bambi-job-description-blocks";
import {
	adHorizontalImageSql,
	adVerticalImageSql,
	coverImageSql,
	minHourlyPayFilter,
	ratingAverageSql,
	ratingCountSql,
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
import { isOrganizationManagerRole } from "../../services/bambi-organization-authz";
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
	// 프리미엄 배너 에디터가 만든 레이아웃(job_ad_banner_layout.layout). jsonb라 DB 제약이
	// 없으므로 adBannerLayoutSchema가 유일한 방어선이다 — 트러스트 바운더리다.
	// 키를 아예 생략하면 기존 레이아웃을 보존하고, 명시적 null이면 지운다.
	adBannerLayout: adBannerLayoutSchema.nullish(),
	media: jobPostMediaSetInput,
});

// 급여 단위 "협의"는 금액 없이 저장한다. apps/web/src/lib/bambi-options.ts의
// NEGOTIABLE_PAY_UNIT과 같은 값을 유지할 것.
const NEGOTIABLE_PAY_UNIT = "협의";

// 단위와 금액의 짝을 강제한다 — 협의인데 금액이 붙거나, 금액 단위인데 금액이 빠지면
// 목록에서 "협의 0원" 같은 잡음이 되고 최소 시급 필터도 어긋난다.
export const jobPostInput = jobPostInputShape.refine(
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

const RISKY_TERMS = ["미성년", "성매매", "강요"] as const;

const hasRiskFlags = ({
	adBannerText,
	blockRiskTerms,
	description,
	interviewNotes,
	title,
}: {
	adBannerText: string;
	blockRiskTerms: string[];
	description: string;
	interviewNotes?: string;
	title: string;
}): boolean => {
	const text = `${title} ${description} ${interviewNotes ?? ""} ${adBannerText}`;

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

// 배너 문구도 구직자에게 노출되는 문구다. 실제로 저장될 레이아웃을 넘겨받아 본문과 같은
// 금칙어·위험어 검사를 태운다 — 버려질 문구로 공고가 검수에 걸리지는 않게 한다.
const prepareJobPostContent = (
	input: JobPostInput,
	adBannerLayout: unknown
): PreparedJobPostContent => {
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
			// 가로·세로 두 슬롯을 모두 훑고, 블록별 문구와 화면 읽기 순서 조립본을 함께 넘긴다 —
			// 한쪽 슬롯만 보면 반대 슬롯이 빠져나가고, 블록별로만 보면 "미성"과 "년"을 나란히
			// 놓아 배너에는 "미성년"으로 보이는 조합이 검사를 통과한다.
			adBannerText: collectLayoutModerationText(adBannerLayout),
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

	return {
		adProductId: product.id,
		// 구매 시점 할인가 스냅샷: 선택한 가격 옵션의 discountPercent(없으면 0)를 적용해 결제
		// 금액을 확정한다. 이후 상품 할인율이 바뀌어도 이미 확정된 이 금액에는 영향을 주지 않는다.
		exposureAmount: discountedAdAmount(
			priceOption.amount,
			priceOption.discountPercent ?? 0
		),
		exposureDurationDays: priceOption.days,
		exposureType,
		manualBoostsPerDay: isBanner ? 0 : product.manualBoostsPerDay,
		autoBoostsPerDay: isBanner ? 0 : product.autoBoostsPerDay,
		paymentMethod: input.paymentMethod ?? null,
	};
};

// jobs.update와 운영자 편집(moderation.adminUpdateJobPost)이 공유하는 갱신·노출확정 로직.
// 호출자는 대상 공고(existing)를 먼저 조회·권한 확인한 뒤 넘긴다 — 이 함수는 권한 검사를 하지
// 않으므로(조직 멤버십 우회가 목적) 반드시 호출부에서 게이트를 통과시켜야 한다.
export const applyJobPostUpdate = async ({
	actorUserId,
	data,
	existing,
}: {
	actorUserId: string;
	data: JobPostInput;
	existing: typeof jobPost.$inferSelect;
}) => {
	// 레이아웃은 별도 테이블이라 job_post 컬럼 spread에서 빼 둔다.
	const {
		adBannerLayout: _adBannerLayout,
		descriptionBlocks: _descriptionBlocks,
		media,
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

	// 노출 확정이 먼저다 — 배너 문구를 남길지 버릴지가 확정된 노출 타입에 달려 있고,
	// 검수 검사도 실제로 저장될 문구만 봐야 한다.
	const exposure = await resolveJobPostExposure({
		adProductId: data.adProductId,
		exposureDurationDays: data.exposureDurationDays,
		paymentMethod: data.paymentMethod,
	});
	const layoutWrite = normalizeAdBannerLayout(data, exposure.exposureType);
	// 최종 저장될 레이아웃. 검수(금칙어)와 배너 이미지 필수 판정이 같은 값을 봐야 한다.
	const finalLayout = await resolveModeratedLayout(layoutWrite, existing.id);
	const preparedContent = prepareJobPostContent(data, finalLayout);
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
		? await getJobPostMediaStorageKeys(existing.id)
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
			.where(eq(jobPost.id, existing.id))
			.returning();

		if (!updated) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Job post could not be updated.",
			});
		}

		await writeAdBannerLayout(tx, updated.id, layoutWrite);

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

	return result;
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
					inArray(jobPost.exposureType, [...AD_BANNER_EXPOSURE_TYPES]),
					or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
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
		await recordAdBannerImpressions({
			actorUserId: context.session?.user.id,
			groups: directedGroups,
		});

		if (!settingsRow?.crawledAdBannerEnabled) {
			return directedGroups;
		}

		// 수집 배너는 결제 광고가 채우지 못한 칸에만 들어가고, 가로형·세로형이 서로 다른 링을
		// 돈다(groupCrawledAdBannerJobs 참고).
		const crawledGroups = groupCrawledAdBannerJobs(
			await loadCrawledAdBannerPools(),
			now,
			rotationMs
		);

		return {
			leftBanner: mergeAdBannerSlots(
				directedGroups.leftBanner,
				crawledGroups.leftBanner
			),
			premiumBanner: mergeAdBannerSlots(
				directedGroups.premiumBanner,
				crawledGroups.premiumBanner
			),
			rightBanner: mergeAdBannerSlots(
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

			// 공고 작성자(구인자)의 인증번호를 상세에 노출한다(인증된 경우에만).
			const [creatorProfile] = await db
				.select({
					isPhoneVerified: bambiProfile.isPhoneVerified,
					phoneNumber: bambiProfile.phoneNumber,
				})
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, post.createdByUserId))
				.limit(1);

			return {
				...post,
				employerVerifiedPhone: creatorProfile?.isPhoneVerified
					? (creatorProfile.phoneNumber ?? null)
					: null,
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

			// 수정 폼 프리필. 레이아웃을 함께 내리지 않으면 폼이 빈 값으로 시작해 저장 시
			// 기존 배너 편집물이 사라진다.
			return {
				...post,
				adBannerLayout: await getStoredAdBannerLayout(post.id),
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
			// 레이아웃은 별도 테이블이라 job_post 컬럼 spread에서 빼 둔다.
			const {
				adBannerLayout: _adBannerLayout,
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

			// 노출 확정이 먼저다 — 배너형이 아니면 문구를 저장 전에 버려야 하고, 검수
			// 검사도 실제로 저장될 문구만 봐야 한다.
			const exposure = await resolveJobPostExposure({
				adProductId: input.adProductId,
				exposureDurationDays: input.exposureDurationDays,
				paymentMethod: input.paymentMethod,
			});
			const layoutWrite = normalizeAdBannerLayout(input, exposure.exposureType);
			// 최종 저장될 레이아웃. 검수(금칙어)와 배너 이미지 필수 판정이 같은 값을 봐야 한다.
			const finalLayout = await resolveModeratedLayout(layoutWrite, null);
			const preparedContent = prepareJobPostContent(input, finalLayout);
			const mediaRows = requireValidJobPostMediaSet({
				media,
				organizationId: input.organizationId,
			});
			requireAdBannerMedia(
				exposure.exposureType,
				mediaRows.map((row) => row.usage),
				finalLayout
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

				await writeAdBannerLayout(tx, created.id, layoutWrite);

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

			return await applyJobPostUpdate({
				actorUserId: actor.userId,
				data: input.data,
				existing,
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

			// 연관 미디어·프로모션·성과 이벤트 행은 FK onDelete cascade로 함께 제거되지만,
			// GCS 객체는 cascade 대상이 아니므로 키를 미리 확보해 직접 지운다.
			const storageKeys = await getJobPostMediaStorageKeys(input.id);

			await db.delete(jobPost).where(eq(jobPost.id, input.id));
			await deletePublicObjects(storageKeys);

			return { id: input.id };
		}),
};

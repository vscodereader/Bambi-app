export const jobPostMediaUsages = [
	"cover",
	"detail",
	"ad_horizontal",
	"ad_vertical",
] as const;

export type JobPostMediaUsage = (typeof jobPostMediaUsages)[number];

export type JobAdBannerUsage = "ad_horizontal" | "ad_vertical";

export const jobAdBannerUsages: JobAdBannerUsage[] = [
	"ad_horizontal",
	"ad_vertical",
];

export const JOB_POST_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const JOB_POST_COVER_IMAGE_LIMIT = 1;
export const JOB_POST_DETAIL_IMAGE_LIMIT = 5;
export const JOB_AD_BANNER_LIMIT = 1;
export const JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH = 120;

export const ALLOWED_JOB_POST_IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

// 광고 배너에 한해 움직이는 GIF를 허용한다. 썸네일·상세는 목록/본문에서 정적으로 쓰이므로
// 애니메이션을 받지 않는다. 용량 상한(8MB)은 배너도 그대로 적용된다.
export const ALLOWED_JOB_AD_BANNER_MIME_TYPES = [
	...ALLOWED_JOB_POST_IMAGE_MIME_TYPES,
	"image/gif",
] as const;

export const getAllowedJobPostMimeTypes = (
	usage?: JobPostMediaUsage
): readonly string[] =>
	usage && isJobAdBannerUsage(usage)
		? ALLOWED_JOB_AD_BANNER_MIME_TYPES
		: ALLOWED_JOB_POST_IMAGE_MIME_TYPES;

export interface JobAdBannerSpec {
	// 비율 표기(문구 전용). 비율 검증 자체는 클라이언트가 원본 치수로 하고(job-ad-banner-spec),
	// 서버는 바이트를 열지 않아 크기 하한만 재확인한다.
	aspectLabel: string;
	label: string;
	// 하한. 이보다 작으면 슬롯에서 늘어나 뭉개지므로 이 규칙을 강제한다. 미설정이면 크기는 안 본다.
	minHeight?: number;
	minWidth?: number;
}

// 크기 하한은 클라이언트 규격(apps/web/src/lib/bambi/job-ad-banner-spec.ts)과 같은 값이어야
// 한다. aspectLabel은 안내 문구용이며, 비율 반려는 클라이언트가 담당한다(치수가 위조 가능해도
// 손해는 본인 배너가 잘려 보이는 것뿐이라 서버가 바이트를 다시 열지는 않는다).
export const JOB_AD_BANNER_SPECS: Record<JobAdBannerUsage, JobAdBannerSpec> = {
	ad_horizontal: {
		aspectLabel: "7:3",
		label: "가로형 광고 배너",
		// 프리미엄 슬롯이 500px+ 폭으로 커져 화질 하한을 700×300으로 올렸다.
		minHeight: 300,
		minWidth: 700,
	},
	ad_vertical: {
		aspectLabel: "4:9",
		label: "세로형 광고 배너",
		// 예전엔 권장값(강제 안 함)이던 400×900을 화질을 위해 최소로 승격했다.
		minHeight: 900,
		minWidth: 400,
	},
};

export const isJobAdBannerUsage = (
	usage: JobPostMediaUsage
): usage is JobAdBannerUsage =>
	usage === "ad_horizontal" || usage === "ad_vertical";

export type JobPostImageUploadPolicyCode =
	| "empty_file_name"
	| "file_too_large"
	| "unsupported_type";

export interface JobPostImageUploadInput {
	byteSize: number;
	fileName: string;
	mimeType: string;
	usage?: JobPostMediaUsage;
}

export type JobPostImageUploadPolicyResult =
	| {
			ok: true;
	  }
	| {
			code: JobPostImageUploadPolicyCode;
			maxBytes?: number;
			ok: false;
	  };

export interface JobPostMediaPolicyInput extends JobPostImageUploadInput {
	altText: string;
	height?: null | number;
	storageKey: string;
	usage: JobPostMediaUsage;
	width?: null | number;
}

export type JobPostMediaPolicyCode =
	| "alt_text_too_long"
	| "banner_dimensions_required"
	| "banner_too_small"
	| "empty_file_name"
	| "file_too_large"
	| "too_many_ad_banners"
	| "too_many_cover_images"
	| "too_many_detail_images"
	| "unsupported_type"
	| "unsupported_usage";

export interface JobPostMediaPolicyIssue {
	code: JobPostMediaPolicyCode;
	maxBytes?: number;
	maxCoverImages?: number;
	maxDetailImages?: number;
	maxLength?: number;
	minHeight?: number;
	minWidth?: number;
	storageKey?: string;
	usage?: JobPostMediaUsage;
}

export interface JobPostMediaPolicyResult {
	issues: JobPostMediaPolicyIssue[];
	ok: boolean;
}

const isAllowedImageMimeType = (
	mimeType: string,
	usage?: JobPostMediaUsage
): boolean => getAllowedJobPostMimeTypes(usage).includes(mimeType);

const isSupportedUsage = (
	usage: JobPostMediaPolicyInput["usage"]
): usage is JobPostMediaUsage =>
	jobPostMediaUsages.includes(usage as JobPostMediaUsage);

export const isAllowedJobAdBannerSize = ({
	height,
	usage,
	width,
}: {
	height: number;
	usage: JobAdBannerUsage;
	width: number;
}): boolean => {
	const { minHeight, minWidth } = JOB_AD_BANNER_SPECS[usage];

	if (!(minWidth && minHeight)) {
		return true;
	}

	return width >= minWidth && height >= minHeight;
};

export const validateJobPostImageUpload = ({
	byteSize,
	fileName,
	mimeType,
	usage,
}: JobPostImageUploadInput): JobPostImageUploadPolicyResult => {
	if (!fileName.trim()) {
		return { code: "empty_file_name", ok: false };
	}

	if (!isAllowedImageMimeType(mimeType, usage)) {
		return { code: "unsupported_type", ok: false };
	}

	if (byteSize > JOB_POST_IMAGE_MAX_BYTES) {
		return {
			code: "file_too_large",
			maxBytes: JOB_POST_IMAGE_MAX_BYTES,
			ok: false,
		};
	}

	return { ok: true };
};

// 서버는 크기 하한만 재확인한다. 비율 반려는 클라이언트가 원본 치수로 판정한다 —
// 치수는 브라우저가 읽어 보내므로 위조할 수 있지만, 위조해도 손해는 본인 배너가 잘려 보이는
// 것뿐이라 서버가 바이트를 다시 열지는 않는다.
const collectAdBannerIssues = (
	item: JobPostMediaPolicyInput
): JobPostMediaPolicyIssue[] => {
	if (!isJobAdBannerUsage(item.usage)) {
		return [];
	}

	const { height, storageKey, usage, width } = item;

	if (!(width && height)) {
		return [{ code: "banner_dimensions_required", storageKey, usage }];
	}

	if (isAllowedJobAdBannerSize({ height, usage, width })) {
		return [];
	}

	const { minHeight, minWidth } = JOB_AD_BANNER_SPECS[usage];

	return [
		{
			code: "banner_too_small",
			minHeight,
			minWidth,
			storageKey,
			usage,
		},
	];
};

const collectUsageCountIssues = (
	media: JobPostMediaPolicyInput[]
): JobPostMediaPolicyIssue[] => {
	const issues: JobPostMediaPolicyIssue[] = [];
	const countOf = (usage: JobPostMediaUsage) =>
		media.filter((item) => item.usage === usage).length;

	if (countOf("cover") > JOB_POST_COVER_IMAGE_LIMIT) {
		issues.push({
			code: "too_many_cover_images",
			maxCoverImages: JOB_POST_COVER_IMAGE_LIMIT,
		});
	}

	if (countOf("detail") > JOB_POST_DETAIL_IMAGE_LIMIT) {
		issues.push({
			code: "too_many_detail_images",
			maxDetailImages: JOB_POST_DETAIL_IMAGE_LIMIT,
		});
	}

	for (const usage of jobAdBannerUsages) {
		if (countOf(usage) > JOB_AD_BANNER_LIMIT) {
			issues.push({ code: "too_many_ad_banners", usage });
		}
	}

	return issues;
};

export const validateJobPostMediaSet = (
	media: JobPostMediaPolicyInput[]
): JobPostMediaPolicyResult => {
	const issues = collectUsageCountIssues(media);

	for (const item of media) {
		if (!isSupportedUsage(item.usage)) {
			issues.push({
				code: "unsupported_usage",
				storageKey: item.storageKey,
			});
		}

		const uploadPolicy = validateJobPostImageUpload(item);

		if (!uploadPolicy.ok) {
			issues.push({
				code: uploadPolicy.code,
				maxBytes: uploadPolicy.maxBytes,
				storageKey: item.storageKey,
			});
		}

		if (item.altText.trim().length > JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH) {
			issues.push({
				code: "alt_text_too_long",
				maxLength: JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH,
				storageKey: item.storageKey,
			});
		}

		issues.push(...collectAdBannerIssues(item));
	}

	return {
		issues,
		ok: issues.length === 0,
	};
};

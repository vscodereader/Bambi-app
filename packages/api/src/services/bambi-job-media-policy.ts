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
	// 문구용 비율 표기. 안내·오류 메시지는 특정 해상도가 아니라 비율로 말한다.
	aspectLabel: string;
	aspectRatio: number;
	label: string;
	// 하한. 비율이 맞아도 이보다 작으면 슬롯에서 늘어나 뭉개진다. 미설정이면 크기는 안 본다.
	minHeight?: number;
	minWidth?: number;
	// 안내용 권장 해상도. 강제하지 않으며, 하한(min*)이 있으면 그쪽을 대신 안내한다.
	recommendedHeight?: number;
	recommendedWidth?: number;
}

// 슬롯 CSS(aspect-[7/3], aspect-[4/9])와 같은 값을 쓴다. 둘이 어긋나면 광고가 잘려 나간다.
export const JOB_AD_BANNER_SPECS: Record<JobAdBannerUsage, JobAdBannerSpec> = {
	ad_horizontal: {
		aspectLabel: "7:3",
		aspectRatio: 7 / 3,
		label: "가로형 광고 배너",
		// 하한과 비율은 서로 독립인 두 규칙이고 둘 다 통과해야 한다. 150×50 자체는 3:1이라
		// 비율 검증에 걸리므로, 실질 하한은 "가로 150px 이상"이고 세로는 7:3이 결정한다
		// (가로 150이면 세로는 약 64 이상). 세로 하한 50은 그래서 사실상 비구속이다.
		minHeight: 50,
		minWidth: 150,
	},
	ad_vertical: {
		aspectLabel: "4:9",
		aspectRatio: 4 / 9,
		label: "세로형 광고 배너",
		recommendedHeight: 900,
		recommendedWidth: 400,
	},
};

// 편집기의 반올림 오차는 흡수하되, 눈에 띄는 왜곡·잘림은 막는 폭.
export const JOB_AD_BANNER_ASPECT_RATIO_TOLERANCE = 0.02;

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
	| "banner_aspect_ratio_mismatch"
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
	expectedAspectRatio?: number;
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

export const isAllowedJobAdBannerAspectRatio = ({
	height,
	usage,
	width,
}: {
	height: number;
	usage: JobAdBannerUsage;
	width: number;
}): boolean => {
	if (width <= 0 || height <= 0) {
		return false;
	}

	const { aspectRatio } = JOB_AD_BANNER_SPECS[usage];

	return (
		Math.abs(width / height - aspectRatio) / aspectRatio <=
		JOB_AD_BANNER_ASPECT_RATIO_TOLERANCE
	);
};

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

// 광고 배너는 슬롯 비율과 맞아야 잘리지 않는다. 치수는 브라우저가 읽어 보내므로 위조할 수
// 있지만, 위조해도 손해는 본인 배너가 잘려 보이는 것뿐이라 서버가 바이트를 다시 열지는 않는다.
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

	const issues: JobPostMediaPolicyIssue[] = [];

	if (!isAllowedJobAdBannerAspectRatio({ height, usage, width })) {
		issues.push({
			code: "banner_aspect_ratio_mismatch",
			expectedAspectRatio: JOB_AD_BANNER_SPECS[usage].aspectRatio,
			storageKey,
			usage,
		});
	}

	if (!isAllowedJobAdBannerSize({ height, usage, width })) {
		const { minHeight, minWidth } = JOB_AD_BANNER_SPECS[usage];

		issues.push({
			code: "banner_too_small",
			minHeight,
			minWidth,
			storageKey,
			usage,
		});
	}

	return issues;
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

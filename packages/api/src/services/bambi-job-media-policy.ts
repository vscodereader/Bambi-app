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

// 공고·커뮤니티·채팅 이미지 공통 상한(세 파일 동기화): bambi-job-media-policy.ts,
// apps/web/src/lib/bambi-job-form.ts, bambi-media-policy.ts.
export const JOB_POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const JOB_POST_COVER_IMAGE_LIMIT = 1;
export const JOB_POST_DETAIL_IMAGE_LIMIT = 5;
// 세로로 긴 상세 이미지는 업로드 시 조각들로 잘려 여러 행이 된다. 한 원본이 만들 수 있는
// 조각 수 상한 — 상세 행 개수의 하드캡(원본 상한 × 이 값)과 정렬 여유를 잡는 데 쓴다.
// 세로 상한(zod 20000px) ÷ 조각 최대 높이(DETAIL_SLICE_MAX_HEIGHT 3500) ≈ 6, 여유 포함 8.
export const JOB_POST_DETAIL_MAX_SLICES_PER_IMAGE = 8;
// 조각 하나의 최대 세로 픽셀. Android RN Image(Fresco)는 GPU 텍스처 한계(기기별 4096~,
// 구형 2048)를 넘는 비트맵을 2의 거듭제곱으로 다운샘플해 가로 해상도까지 깎아 흐려진다.
// 3500은 거의 모든 기기의 4096 한계 아래로 여유를 두면서 조각 수를 최소화한다(웹은 무관).
export const DETAIL_SLICE_MAX_HEIGHT = 3500;
export const JOB_AD_BANNER_LIMIT = 1;
export const JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH = 120;

export const ALLOWED_JOB_POST_IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

// 광고 배너에 한해 움직이는 GIF를 허용한다. 썸네일·상세는 목록/본문에서 정적으로 쓰이므로
// 애니메이션을 받지 않는다. 용량 상한(10MB)은 배너도 그대로 적용된다.
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
	// 조각 그룹 메타(detail만). 같은 원본에서 잘린 조각들이 공유하는 id와 그룹 내 순서(0부터).
	// 슬라이싱하지 않은 이미지는 둘 다 null/undefined. 개수 상한은 조각이 아니라 원본으로 센다.
	sliceGroupId?: null | string;
	sliceIndex?: null | number;
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

	// 상세는 조각이 아니라 원본 단위로 센다. 세로로 긴 이미지가 여러 조각 행으로 잘려도
	// 각 그룹의 첫 조각(sliceIndex 0)만, 슬라이싱 안 한 이미지(sliceIndex null)는 그대로 하나로.
	const detailOriginalCount = media.filter(
		(item) =>
			item.usage === "detail" &&
			(item.sliceIndex === null ||
				item.sliceIndex === undefined ||
				item.sliceIndex === 0)
	).length;

	if (detailOriginalCount > JOB_POST_DETAIL_IMAGE_LIMIT) {
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

export interface DetailSlicePlan {
	// 조각 세로 픽셀(<= maxHeight).
	height: number;
	// 그룹 내 순서(0부터) = sliceIndex.
	index: number;
	// 원본에서 잘라낼 시작 y.
	offsetY: number;
}

// 세로가 maxHeight를 넘으면 가로 전폭·세로 균등 조각 계획을 돌려준다(합이 정확히 height).
// 넘지 않으면 [] — 슬라이싱 불필요.
export const planDetailSlices = (
	height: number,
	maxHeight: number = DETAIL_SLICE_MAX_HEIGHT
): DetailSlicePlan[] => {
	if (!(Number.isFinite(height) && height > maxHeight)) {
		return [];
	}

	const count = Math.ceil(height / maxHeight);
	const base = Math.floor(height / count);
	// 나머지 픽셀은 앞 조각들에 1px씩 분배해 반올림 손실 없이 합 = height. base < maxHeight가
	// 보장되므로(넘으면 count가 더 컸다) base+1도 maxHeight 이하다.
	const remainder = height - base * count;
	const plans: DetailSlicePlan[] = [];
	let offsetY = 0;

	for (let index = 0; index < count; index += 1) {
		const sliceHeight = base + (index < remainder ? 1 : 0);

		plans.push({ height: sliceHeight, index, offsetY });
		offsetY += sliceHeight;
	}

	return plans;
};

// 같은 sliceGroupId를 공유하는 조각들을 하나의 그룹으로 묶는다. 비-슬라이스 미디어는 단독
// 그룹. 그룹 위치는 첫 조각의 등장 순서를 따르고(서버 position 정렬 유지), 그룹 내부는
// sliceIndex 순으로 정렬한다(서버가 이미 보장하지만 방어적으로).
export const groupDetailMediaBySlice = <
	T extends { sliceGroupId?: null | string; sliceIndex?: null | number },
>(
	images: T[]
): T[][] => {
	const groups: T[][] = [];
	const byGroupId = new Map<string, T[]>();

	for (const image of images) {
		if (!image.sliceGroupId) {
			groups.push([image]);
			continue;
		}

		const existing = byGroupId.get(image.sliceGroupId);

		if (existing) {
			existing.push(image);
		} else {
			const group = [image];

			byGroupId.set(image.sliceGroupId, group);
			groups.push(group);
		}
	}

	for (const group of groups) {
		if (group.length > 1) {
			group.sort((a, b) => (a.sliceIndex ?? 0) - (b.sliceIndex ?? 0));
		}
	}

	return groups;
};

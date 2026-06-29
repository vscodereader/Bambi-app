export const jobPostMediaUsages = ["cover", "detail"] as const;

export type JobPostMediaUsage = (typeof jobPostMediaUsages)[number];

export const JOB_POST_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const JOB_POST_COVER_IMAGE_LIMIT = 1;
export const JOB_POST_DETAIL_IMAGE_LIMIT = 5;
export const JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH = 120;

export const ALLOWED_JOB_POST_IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

export type JobPostImageUploadPolicyCode =
	| "empty_file_name"
	| "file_too_large"
	| "unsupported_type";

export interface JobPostImageUploadInput {
	byteSize: number;
	fileName: string;
	mimeType: string;
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
	storageKey: string;
	usage: JobPostMediaUsage;
}

export type JobPostMediaPolicyCode =
	| "alt_text_too_long"
	| "empty_file_name"
	| "file_too_large"
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
	storageKey?: string;
}

export interface JobPostMediaPolicyResult {
	issues: JobPostMediaPolicyIssue[];
	ok: boolean;
}

const isAllowedImageMimeType = (mimeType: string): boolean =>
	ALLOWED_JOB_POST_IMAGE_MIME_TYPES.includes(
		mimeType as (typeof ALLOWED_JOB_POST_IMAGE_MIME_TYPES)[number]
	);

const isSupportedUsage = (
	usage: JobPostMediaPolicyInput["usage"]
): usage is JobPostMediaUsage =>
	jobPostMediaUsages.includes(usage as JobPostMediaUsage);

export const validateJobPostImageUpload = ({
	byteSize,
	fileName,
	mimeType,
}: JobPostImageUploadInput): JobPostImageUploadPolicyResult => {
	if (!fileName.trim()) {
		return { code: "empty_file_name", ok: false };
	}

	if (!isAllowedImageMimeType(mimeType)) {
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

export const validateJobPostMediaSet = (
	media: JobPostMediaPolicyInput[]
): JobPostMediaPolicyResult => {
	const issues: JobPostMediaPolicyIssue[] = [];
	const coverImageCount = media.filter((item) => item.usage === "cover").length;
	const detailImageCount = media.filter(
		(item) => item.usage === "detail"
	).length;

	if (coverImageCount > JOB_POST_COVER_IMAGE_LIMIT) {
		issues.push({
			code: "too_many_cover_images",
			maxCoverImages: JOB_POST_COVER_IMAGE_LIMIT,
		});
	}

	if (detailImageCount > JOB_POST_DETAIL_IMAGE_LIMIT) {
		issues.push({
			code: "too_many_detail_images",
			maxDetailImages: JOB_POST_DETAIL_IMAGE_LIMIT,
		});
	}

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
	}

	return {
		issues,
		ok: issues.length === 0,
	};
};

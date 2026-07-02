export type ChatMediaCategory = "image" | "pdf";

export type ChatMediaPolicyCode =
	| "empty_file_name"
	| "file_too_large"
	| "unsupported_type";

export interface ChatMediaUploadInput {
	byteSize: number;
	fileName: string;
	mimeType: string;
}

export type ChatMediaPolicyResult =
	| {
			category: ChatMediaCategory;
			ok: true;
	  }
	| {
			code: ChatMediaPolicyCode;
			maxBytes?: number;
			ok: false;
	  };

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PDF_MAX_BYTES = 10 * 1024 * 1024;

const MEDIA_POLICY_BY_MIME_TYPE = {
	"application/pdf": {
		category: "pdf",
		maxBytes: PDF_MAX_BYTES,
	},
	"image/jpeg": {
		category: "image",
		maxBytes: IMAGE_MAX_BYTES,
	},
	"image/png": {
		category: "image",
		maxBytes: IMAGE_MAX_BYTES,
	},
	"image/webp": {
		category: "image",
		maxBytes: IMAGE_MAX_BYTES,
	},
} as const;

export const ALLOWED_CHAT_MEDIA_MIME_TYPES = Object.keys(
	MEDIA_POLICY_BY_MIME_TYPE
);

export const validateChatMediaUpload = ({
	byteSize,
	fileName,
	mimeType,
}: ChatMediaUploadInput): ChatMediaPolicyResult => {
	if (!fileName.trim()) {
		return { code: "empty_file_name", ok: false };
	}

	const policy =
		MEDIA_POLICY_BY_MIME_TYPE[
			mimeType as keyof typeof MEDIA_POLICY_BY_MIME_TYPE
		];

	if (!policy) {
		return { code: "unsupported_type", ok: false };
	}

	if (byteSize > policy.maxBytes) {
		return { code: "file_too_large", maxBytes: policy.maxBytes, ok: false };
	}

	return { category: policy.category, ok: true };
};

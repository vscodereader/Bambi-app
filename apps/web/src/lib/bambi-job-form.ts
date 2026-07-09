import {
	industryOptions,
	payUnitOptions,
	regionOptions,
} from "./bambi-options";

const TITLE_MIN_LENGTH = 2;
const TITLE_MAX_LENGTH = 80;
const OPTION_MAX_LENGTH = 80;
const PAY_UNIT_MAX_LENGTH = 30;
const WORK_SCHEDULE_MAX_LENGTH = 200;
const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 2000;
const INTERVIEW_NOTES_MAX_LENGTH = 500;
const DESCRIPTION_BLOCK_MAX_COUNT = 12;
const DESCRIPTION_BLOCK_TEXT_MAX_LENGTH = 800;
const DETAIL_IMAGE_MAX_COUNT = 5;
const IMAGE_ALT_TEXT_MAX_LENGTH = 120;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
]);

export const jobDescriptionBlockTypes = [
	"paragraph",
	"heading",
	"bullet_list",
	"callout",
] as const;

export type JobDescriptionBlockType = (typeof jobDescriptionBlockTypes)[number];

export const jobExposureTypes = [
	"premium-banner",
	"left-banner",
	"right-banner",
	"special",
	"urgent",
	"recommended",
	"standard",
] as const;

export type JobExposureType = (typeof jobExposureTypes)[number];

export const jobPaymentMethods = ["card", "bank_transfer"] as const;

export type JobPaymentMethod = (typeof jobPaymentMethods)[number];

export interface JobDescriptionBlockFormValue {
	id: string;
	text: string;
	type: JobDescriptionBlockType;
}

export interface JobFormMediaItem {
	altText: string;
	byteSize: number;
	file?: File;
	fileName: string;
	mimeType: string;
	previewUrl?: string;
	storageKey?: string;
	uploadUrl?: string;
}

export interface JobFormMedia {
	cover: JobFormMediaItem | null;
	detail: JobFormMediaItem[];
}

export interface JobPostMediaUploadRequest {
	byteSize: number;
	fileName: string;
	mimeType: string;
	organizationId: string;
	teamId?: string;
}

export interface JobPostMediaUploadIntent {
	byteSize: number;
	fileName: string;
	mimeType: string;
	storageKey: string;
	uploadUrl: string;
}

export interface JobPostMediaApiInput {
	altText: string;
	byteSize: number;
	fileName: string;
	mimeType: string;
	storageKey: string;
}

export interface JobPostMediaApiSetInput {
	cover?: JobPostMediaApiInput;
	detail: JobPostMediaApiInput[];
}

export interface JobForm {
	adProductId: string | null;
	description: string;
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	exposureType: JobExposureType;
	industryCategory: string;
	interviewNotes: string;
	organizationId: string;
	payAmount: string;
	paymentMethod: JobPaymentMethod | null;
	payUnit: string;
	region: string;
	teamId: string;
	title: string;
	workSchedule: string;
}

export interface JobPostInput {
	adProductId: string | null;
	description: string;
	descriptionBlocks: JobDescriptionBlockFormValue[];
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	exposureType: JobExposureType;
	industryCategory: string;
	interviewNotes?: string;
	media?: {
		cover?: JobFormMediaItem;
		detail: JobFormMediaItem[];
	};
	organizationId: string;
	payAmount: number;
	paymentMethod: JobPaymentMethod | null;
	payUnit: string;
	region: string;
	teamId?: string;
	title: string;
	workSchedule: string;
}

export interface JobTeamScope {
	organizationId: string;
	teamId: string;
}

export type JobFormErrorKey = keyof JobForm | "descriptionBlocks" | "media";

export type JobFormErrors = Partial<Record<JobFormErrorKey, string>>;

type JobFormValidationResult =
	| {
			errors: JobFormErrors;
			message: string;
			ok: false;
	  }
	| {
			input: JobPostInput;
			ok: true;
	  };

export const emptyJobForm: JobForm = {
	adProductId: null,
	description: "",
	exposureAmount: null,
	exposureDurationDays: null,
	exposureType: "standard",
	industryCategory: industryOptions[0] ?? "",
	interviewNotes: "",
	organizationId: "",
	payAmount: "",
	paymentMethod: null,
	payUnit: payUnitOptions[0] ?? "",
	region: regionOptions[0] ?? "",
	teamId: "",
	title: "",
	workSchedule: "",
};

export const emptyJobFormMedia: JobFormMedia = {
	cover: null,
	detail: [],
};

const trim = (value: string) => value.trim();

const isLengthBetween = (value: string, min: number, max: number) =>
	value.length >= min && value.length <= max;

const findFirstError = (errors: JobFormErrors) =>
	Object.values(errors).find((message) => Boolean(message));

const isSupportedDescriptionBlockType = (
	type: JobDescriptionBlockFormValue["type"]
): type is JobDescriptionBlockType =>
	jobDescriptionBlockTypes.includes(type as JobDescriptionBlockType);

export const createEmptyDescriptionBlock = (
	type: JobDescriptionBlockType
): JobDescriptionBlockFormValue => ({
	id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
	text: "",
	type,
});

export const normalizeJobDescriptionBlocks = (
	blocks: JobDescriptionBlockFormValue[] = []
): JobDescriptionBlockFormValue[] =>
	blocks
		.map((block) => ({
			id: trim(block.id),
			text: trim(block.text),
			type: block.type,
		}))
		.filter((block) => block.id.length > 0 && block.text.length > 0);

export const toPlainJobDescription = (
	blocks: JobDescriptionBlockFormValue[]
): string =>
	normalizeJobDescriptionBlocks(blocks)
		.map((block) => block.text)
		.join("\n\n");

const resolveMediaItemForSubmit = async ({
	createUploadIntent,
	item,
	organizationId,
	teamId,
}: {
	createUploadIntent: (
		input: JobPostMediaUploadRequest
	) => Promise<JobPostMediaUploadIntent>;
	item: JobFormMediaItem;
	organizationId: string;
	teamId?: string;
}): Promise<JobPostMediaApiInput> => {
	if (item.storageKey) {
		return {
			altText: trim(item.altText),
			byteSize: item.byteSize,
			fileName: trim(item.fileName),
			mimeType: item.mimeType,
			storageKey: item.storageKey,
		};
	}

	if (!item.file) {
		throw new Error("이미지 파일을 다시 선택해 주세요.");
	}

	const uploadIntent = await createUploadIntent({
		byteSize: item.file.size,
		fileName: item.file.name,
		mimeType: item.file.type,
		organizationId,
		teamId,
	});

	return {
		altText: trim(item.altText),
		byteSize: uploadIntent.byteSize,
		fileName: uploadIntent.fileName,
		mimeType: uploadIntent.mimeType,
		storageKey: uploadIntent.storageKey,
	};
};

export const resolveJobPostMediaForSubmit = async ({
	createUploadIntent,
	media,
	organizationId,
	teamId,
}: {
	createUploadIntent: (
		input: JobPostMediaUploadRequest
	) => Promise<JobPostMediaUploadIntent>;
	media?: {
		cover?: JobFormMediaItem;
		detail: JobFormMediaItem[];
	};
	organizationId: string;
	teamId?: string;
}): Promise<JobPostMediaApiSetInput | undefined> => {
	if (!media) {
		return;
	}

	const cover = media.cover
		? await resolveMediaItemForSubmit({
				createUploadIntent,
				item: media.cover,
				organizationId,
				teamId,
			})
		: undefined;
	const detail = await Promise.all(
		media.detail.map((item) =>
			resolveMediaItemForSubmit({
				createUploadIntent,
				item,
				organizationId,
				teamId,
			})
		)
	);

	return {
		cover,
		detail,
	};
};

const getDescriptionBlockError = (
	blocks: JobDescriptionBlockFormValue[] = []
): string | undefined => {
	if (blocks.length > DESCRIPTION_BLOCK_MAX_COUNT) {
		return "상세 블록은 최대 12개까지 등록할 수 있습니다.";
	}

	for (const block of blocks) {
		if (!isSupportedDescriptionBlockType(block.type)) {
			return "지원하지 않는 상세 블록 형식입니다.";
		}

		const text = trim(block.text);

		if (text.length === 0) {
			return "상세 블록 내용을 입력해 주세요.";
		}

		if (text.length > DESCRIPTION_BLOCK_TEXT_MAX_LENGTH) {
			return "상세 블록 내용은 800자 이하로 입력해 주세요.";
		}
	}

	return;
};

const getMediaError = (media?: JobFormMedia): string | undefined => {
	if (!media) {
		return;
	}

	if (media.detail.length > DETAIL_IMAGE_MAX_COUNT) {
		return "상세 이미지는 최대 5장까지 등록할 수 있습니다.";
	}

	const items = [media.cover, ...media.detail].filter(
		(item): item is JobFormMediaItem => Boolean(item)
	);

	for (const item of items) {
		if (!trim(item.fileName)) {
			return "이미지 파일명을 확인해 주세요.";
		}

		if (!ALLOWED_IMAGE_MIME_TYPES.has(item.mimeType)) {
			return "이미지는 JPG, PNG, WebP 형식만 등록할 수 있습니다.";
		}

		if (trim(item.altText).length > IMAGE_ALT_TEXT_MAX_LENGTH) {
			return "이미지 설명은 120자 이하로 입력해 주세요.";
		}
	}

	return;
};

const getPostingScopeErrors = ({
	organizationId,
	teamId,
	teamScopes,
}: {
	organizationId: string;
	teamId: string;
	teamScopes?: JobTeamScope[];
}): JobFormErrors => {
	const errors: JobFormErrors = {};

	if (!organizationId) {
		errors.organizationId = "공고를 등록할 조직을 선택해 주세요.";
	}

	const teamMatchesOrganization = teamScopes?.some(
		(scope) =>
			scope.organizationId === organizationId && scope.teamId === teamId
	);

	if (teamId && teamScopes && !teamMatchesOrganization) {
		errors.teamId = "선택한 팀이 조직에 속해 있는지 확인해 주세요.";
	}

	return errors;
};

const getConditionErrors = ({
	industryCategory,
	payAmount,
	payUnit,
	region,
	title,
	workSchedule,
}: {
	industryCategory: string;
	payAmount: number;
	payUnit: string;
	region: string;
	title: string;
	workSchedule: string;
}): JobFormErrors => {
	const errors: JobFormErrors = {};

	if (!isLengthBetween(title, TITLE_MIN_LENGTH, TITLE_MAX_LENGTH)) {
		errors.title = "공고 제목은 2자 이상 80자 이하로 입력해 주세요.";
	}

	if (
		!(
			industryCategory.length > 0 &&
			industryCategory.length <= OPTION_MAX_LENGTH
		)
	) {
		errors.industryCategory = "업종을 선택해 주세요.";
	}

	if (!(region.length > 0 && region.length <= OPTION_MAX_LENGTH)) {
		errors.region = "지역을 선택해 주세요.";
	}

	if (!(Number.isInteger(payAmount) && payAmount > 0)) {
		errors.payAmount = "급여 금액은 1 이상의 정수로 입력해 주세요.";
	}

	if (!(payUnit.length > 0 && payUnit.length <= PAY_UNIT_MAX_LENGTH)) {
		errors.payUnit = "급여 단위를 선택해 주세요.";
	}

	if (
		!(
			workSchedule.length > 0 && workSchedule.length <= WORK_SCHEDULE_MAX_LENGTH
		)
	) {
		errors.workSchedule = "근무 일정은 200자 이하로 입력해 주세요.";
	}

	return errors;
};

const getContentErrors = ({
	blockError,
	description,
	interviewNotes,
	mediaError,
}: {
	blockError?: string;
	description: string;
	interviewNotes: string;
	mediaError?: string;
}): JobFormErrors => {
	const errors: JobFormErrors = {};

	if (
		!isLengthBetween(
			description,
			DESCRIPTION_MIN_LENGTH,
			DESCRIPTION_MAX_LENGTH
		)
	) {
		errors.description = "상세 설명은 10자 이상 2000자 이하로 입력해 주세요.";
	}

	if (blockError) {
		errors.descriptionBlocks = blockError;
	}

	if (mediaError) {
		errors.media = mediaError;
	}

	if (interviewNotes.length > INTERVIEW_NOTES_MAX_LENGTH) {
		errors.interviewNotes = "면접 안내는 500자 이하로 입력해 주세요.";
	}

	return errors;
};

const getExposureErrors = ({
	adProductId,
	exposureDurationDays,
	paymentMethod,
}: {
	adProductId: string | null;
	exposureDurationDays: number | null;
	paymentMethod: JobPaymentMethod | null;
}): JobFormErrors => {
	const errors: JobFormErrors = {};

	// 광고 상품을 고르지 않으면 무료 일반 구인(standard)으로 통과한다.
	if (!adProductId) {
		return errors;
	}

	if (!(typeof exposureDurationDays === "number" && exposureDurationDays > 0)) {
		errors.exposureDurationDays = "이용 기간을 선택해 주세요.";
	}

	if (paymentMethod !== "card" && paymentMethod !== "bank_transfer") {
		errors.paymentMethod = "결제 방법을 선택해 주세요.";
	}

	return errors;
};

export const validateJobForm = (
	form: JobForm,
	options: {
		descriptionBlocks?: JobDescriptionBlockFormValue[];
		media?: JobFormMedia;
		teamScopes?: JobTeamScope[];
	} = {}
): JobFormValidationResult => {
	const errors: JobFormErrors = {};
	const organizationId = trim(form.organizationId);
	const teamId = trim(form.teamId);
	const title = trim(form.title);
	const industryCategory = trim(form.industryCategory);
	const region = trim(form.region);
	const payAmountText = trim(form.payAmount);
	const payAmount = Number(payAmountText);
	const payUnit = trim(form.payUnit);
	const workSchedule = trim(form.workSchedule);
	const normalizedBlocks = normalizeJobDescriptionBlocks(
		options.descriptionBlocks
	);
	const hasDescriptionBlocks = normalizedBlocks.length > 0;
	const description = hasDescriptionBlocks
		? toPlainJobDescription(normalizedBlocks)
		: trim(form.description);
	const interviewNotes = trim(form.interviewNotes);
	const blockError =
		options.descriptionBlocks && options.descriptionBlocks.length > 0
			? getDescriptionBlockError(options.descriptionBlocks)
			: undefined;
	const mediaError = getMediaError(options.media);
	// 광고 상품 선택 여부로 유료/무료를 판정한다. 상품이 없으면 무료 일반 구인으로
	// 강제해 노출 관련 값을 모두 비운다.
	const isFreeExposure = !form.adProductId;
	const adProductId = isFreeExposure ? null : form.adProductId;
	const exposureType: JobExposureType = isFreeExposure
		? "standard"
		: form.exposureType;
	const exposureDurationDays = isFreeExposure
		? null
		: form.exposureDurationDays;
	const exposureAmount = isFreeExposure ? null : form.exposureAmount;
	const paymentMethod = isFreeExposure ? null : form.paymentMethod;
	Object.assign(
		errors,
		getPostingScopeErrors({
			organizationId,
			teamId,
			teamScopes: options.teamScopes,
		}),
		getConditionErrors({
			industryCategory,
			payAmount,
			payUnit,
			region,
			title,
			workSchedule,
		}),
		getContentErrors({
			blockError,
			description,
			interviewNotes,
			mediaError,
		}),
		getExposureErrors({
			adProductId,
			exposureDurationDays,
			paymentMethod,
		})
	);

	const firstError = findFirstError(errors);

	if (firstError) {
		return {
			errors,
			message: firstError,
			ok: false,
		};
	}

	return {
		input: {
			adProductId,
			description,
			descriptionBlocks: normalizedBlocks,
			exposureAmount,
			exposureDurationDays,
			exposureType,
			industryCategory,
			interviewNotes: interviewNotes || undefined,
			media: options.media
				? {
						cover: options.media.cover ?? undefined,
						detail: options.media.detail,
					}
				: undefined,
			organizationId,
			payAmount,
			paymentMethod,
			payUnit,
			region,
			teamId: teamId || undefined,
			title,
			workSchedule,
		},
		ok: true,
	};
};

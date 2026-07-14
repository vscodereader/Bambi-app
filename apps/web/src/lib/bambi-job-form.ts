import {
	isAllowedJobAdBannerAspectRatio,
	isAllowedJobAdBannerSize,
	JOB_AD_BANNER_SPECS,
	type JobAdBannerUsage,
} from "./bambi/job-ad-banner-spec";
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
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
// 서버 정책(ALLOWED_JOB_AD_BANNER_MIME_TYPES)과 같은 목록. 광고 배너만 움직이는 GIF를 받는다.
const ALLOWED_AD_BANNER_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, "image/gif"];

export const jobPostMediaUsages = [
	"cover",
	"detail",
	"ad_horizontal",
	"ad_vertical",
] as const;

export type JobPostMediaUsage = (typeof jobPostMediaUsages)[number];

const isAdBannerUsage = (usage: JobPostMediaUsage): boolean =>
	usage === "ad_horizontal" || usage === "ad_vertical";

export const getAllowedMimeTypesForUsage = (
	usage: JobPostMediaUsage
): string[] =>
	isAdBannerUsage(usage)
		? ALLOWED_AD_BANNER_MIME_TYPES
		: ALLOWED_IMAGE_MIME_TYPES;

// <input accept>에 그대로 넣는 값.
export const getFileAcceptForUsage = (usage: JobPostMediaUsage): string =>
	getAllowedMimeTypesForUsage(usage).join(",");

export const jobDescriptionBlockTypes = [
	"paragraph",
	"heading",
	"bullet_list",
	"callout",
] as const;

export type JobDescriptionBlockType = (typeof jobDescriptionBlockTypes)[number];

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
	height?: number;
	mimeType: string;
	previewUrl?: string;
	storageKey?: string;
	uploadUrl?: string;
	width?: number;
}

export interface JobFormMedia {
	// 광고 상품을 신청·결제한 공고만 노출되지만, 이미지는 공고 등록 시 함께 받는다.
	adHorizontal: JobFormMediaItem | null;
	adVertical: JobFormMediaItem | null;
	cover: JobFormMediaItem | null;
	detail: JobFormMediaItem[];
}

export interface JobPostMediaUploadRequest {
	byteSize: number;
	fileName: string;
	mimeType: string;
	organizationId: string;
	teamId?: string;
	usage: JobPostMediaUsage;
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
	height?: number;
	mimeType: string;
	storageKey: string;
	width?: number;
}

export interface JobPostMediaApiSetInput {
	adHorizontal?: JobPostMediaApiInput;
	adVertical?: JobPostMediaApiInput;
	cover?: JobPostMediaApiInput;
	detail: JobPostMediaApiInput[];
}

export interface JobForm {
	description: string;
	industryCategory: string;
	interviewNotes: string;
	organizationId: string;
	payAmount: string;
	payUnit: string;
	region: string;
	teamId: string;
	title: string;
	workSchedule: string;
}

export interface JobPostInput {
	description: string;
	descriptionBlocks: JobDescriptionBlockFormValue[];
	industryCategory: string;
	interviewNotes?: string;
	media?: {
		adHorizontal?: JobFormMediaItem;
		adVertical?: JobFormMediaItem;
		cover?: JobFormMediaItem;
		detail: JobFormMediaItem[];
	};
	organizationId: string;
	payAmount: number;
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
	description: "",
	industryCategory: industryOptions[0] ?? "",
	interviewNotes: "",
	organizationId: "",
	payAmount: "",
	payUnit: payUnitOptions[0] ?? "",
	region: regionOptions[0] ?? "",
	teamId: "",
	title: "",
	workSchedule: "",
};

export const emptyJobFormMedia: JobFormMedia = {
	adHorizontal: null,
	adVertical: null,
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

// 서버가 GCS 없이 도는 개발 환경에서는 인텐트가 local:// 플레이스홀더를 돌려준다.
// 이때는 실제 전송할 대상이 없으므로 업로드를 건너뛴다.
const isSignedUploadUrl = (uploadUrl: string): boolean =>
	uploadUrl.startsWith("https://");

// 서명 URL로 브라우저가 GCS에 직접 PUT 한다. Content-Type은 서명에 묶여 있어
// 인텐트에서 선언한 값과 정확히 일치해야 GCS가 받아준다.
const uploadFileToSignedUrl = async ({
	file,
	uploadIntent,
}: {
	file: File;
	uploadIntent: JobPostMediaUploadIntent;
}): Promise<void> => {
	if (!isSignedUploadUrl(uploadIntent.uploadUrl)) {
		// 개발 환경의 플레이스홀더는 건너뛰지만, 프로덕션에서 서명되지 않은 URL이 왔다면
		// 서버 구성이 잘못된 것이다. 조용히 넘기면 업로드 없이 공고만 저장된다.
		if (process.env.NODE_ENV === "production") {
			throw new Error(
				"이미지 업로드를 사용할 수 없습니다. 관리자에게 문의해 주세요."
			);
		}

		return;
	}

	const response = await fetch(uploadIntent.uploadUrl, {
		body: file,
		headers: { "Content-Type": uploadIntent.mimeType },
		method: "PUT",
	});

	if (!response.ok) {
		throw new Error(
			"이미지 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요."
		);
	}
};

interface ResolvedJobPostMediaItem {
	apiInput: JobPostMediaApiInput;
	item: JobFormMediaItem;
}

const resolveMediaItemForSubmit = async ({
	createUploadIntent,
	item,
	organizationId,
	teamId,
	usage,
}: {
	createUploadIntent: (
		input: JobPostMediaUploadRequest
	) => Promise<JobPostMediaUploadIntent>;
	item: JobFormMediaItem;
	organizationId: string;
	teamId?: string;
	usage: JobPostMediaUsage;
}): Promise<ResolvedJobPostMediaItem> => {
	if (item.storageKey) {
		return {
			apiInput: {
				altText: trim(item.altText),
				byteSize: item.byteSize,
				fileName: trim(item.fileName),
				height: item.height,
				mimeType: item.mimeType,
				storageKey: item.storageKey,
				width: item.width,
			},
			item,
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
		usage,
	});

	await uploadFileToSignedUrl({ file: item.file, uploadIntent });

	const apiInput: JobPostMediaApiInput = {
		altText: trim(item.altText),
		byteSize: uploadIntent.byteSize,
		fileName: uploadIntent.fileName,
		height: item.height,
		mimeType: uploadIntent.mimeType,
		storageKey: uploadIntent.storageKey,
		width: item.width,
	};

	return {
		apiInput,
		item: {
			...item,
			byteSize: apiInput.byteSize,
			fileName: apiInput.fileName,
			mimeType: apiInput.mimeType,
			storageKey: apiInput.storageKey,
		},
	};
};

type JobFormMediaSlotKind = "adHorizontal" | "adVertical" | "cover" | "detail";

const SLOT_KIND_USAGES: Record<JobFormMediaSlotKind, JobPostMediaUsage> = {
	adHorizontal: "ad_horizontal",
	adVertical: "ad_vertical",
	cover: "cover",
	detail: "detail",
};

interface JobFormMediaSlot {
	item: JobFormMediaItem;
	kind: JobFormMediaSlotKind;
}

const toMediaSlots = (media: {
	adHorizontal?: JobFormMediaItem;
	adVertical?: JobFormMediaItem;
	cover?: JobFormMediaItem;
	detail: JobFormMediaItem[];
}): JobFormMediaSlot[] => {
	const slots: JobFormMediaSlot[] = [];

	if (media.cover) {
		slots.push({ item: media.cover, kind: "cover" });
	}

	for (const item of media.detail) {
		slots.push({ item, kind: "detail" });
	}

	if (media.adHorizontal) {
		slots.push({ item: media.adHorizontal, kind: "adHorizontal" });
	}

	if (media.adVertical) {
		slots.push({ item: media.adVertical, kind: "adVertical" });
	}

	return slots;
};

// onMediaResolved로 업로드된 storageKey를 폼 상태에 되돌린다. 이게 없으면 공고 저장이
// 실패했을 때 재시도마다 같은 파일이 새 키로 다시 올라가, DB 행 없는 고아 객체가 쌓인다.
// 일부만 실패해도 성공분의 키는 남기므로 재시도는 실패한 이미지만 다시 올린다.
export const resolveJobPostMediaForSubmit = async ({
	createUploadIntent,
	media,
	onMediaResolved,
	organizationId,
	teamId,
}: {
	createUploadIntent: (
		input: JobPostMediaUploadRequest
	) => Promise<JobPostMediaUploadIntent>;
	media?: {
		adHorizontal?: JobFormMediaItem;
		adVertical?: JobFormMediaItem;
		cover?: JobFormMediaItem;
		detail: JobFormMediaItem[];
	};
	onMediaResolved?: (media: JobFormMedia) => void;
	organizationId: string;
	teamId?: string;
}): Promise<JobPostMediaApiSetInput | undefined> => {
	if (!media) {
		return;
	}

	const slots = toMediaSlots(media);
	const settled = await Promise.allSettled(
		slots.map(({ item, kind }) =>
			resolveMediaItemForSubmit({
				createUploadIntent,
				item,
				organizationId,
				teamId,
				usage: SLOT_KIND_USAGES[kind],
			})
		)
	);
	const resolvedMedia: JobFormMedia = { ...emptyJobFormMedia, detail: [] };
	const apiSet: JobPostMediaApiSetInput = { detail: [] };

	for (const [index, { item, kind }] of slots.entries()) {
		const result = settled[index];
		const resolvedItem =
			result?.status === "fulfilled" ? result.value.item : item;

		if (kind === "detail") {
			resolvedMedia.detail.push(resolvedItem);
		} else {
			resolvedMedia[kind] = resolvedItem;
		}

		if (result?.status !== "fulfilled") {
			continue;
		}

		if (kind === "detail") {
			apiSet.detail.push(result.value.apiInput);
		} else {
			apiSet[kind] = result.value.apiInput;
		}
	}

	onMediaResolved?.(resolvedMedia);

	const failed = settled.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);

	if (failed) {
		throw failed.reason instanceof Error
			? failed.reason
			: new Error("이미지 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
	}

	return apiSet;
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

const getAdBannerError = (
	item: JobFormMediaItem | null,
	usage: JobAdBannerUsage
): string | undefined => {
	if (!item) {
		return;
	}

	const { label, recommendedHeight, recommendedWidth } =
		JOB_AD_BANNER_SPECS[usage];

	if (!(item.width && item.height)) {
		return `${label} 이미지의 크기를 확인하지 못했습니다. 다시 등록해 주세요.`;
	}

	if (
		!isAllowedJobAdBannerAspectRatio({
			height: item.height,
			usage,
			width: item.width,
		})
	) {
		return `${label}는 규격 비율에 맞아야 합니다. ${recommendedWidth}×${recommendedHeight}px 비율의 이미지를 등록해 주세요.`;
	}

	if (
		!isAllowedJobAdBannerSize({
			height: item.height,
			usage,
			width: item.width,
		})
	) {
		const { minHeight, minWidth } = JOB_AD_BANNER_SPECS[usage];

		return `${label} 이미지가 너무 작습니다. ${minWidth}×${minHeight}px 이상으로 등록해 주세요.`;
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

	const entries: { item: JobFormMediaItem; usage: JobPostMediaUsage }[] = [
		...(media.cover ? [{ item: media.cover, usage: "cover" as const }] : []),
		...media.detail.map((item) => ({ item, usage: "detail" as const })),
		...(media.adHorizontal
			? [{ item: media.adHorizontal, usage: "ad_horizontal" as const }]
			: []),
		...(media.adVertical
			? [{ item: media.adVertical, usage: "ad_vertical" as const }]
			: []),
	];

	for (const { item, usage } of entries) {
		if (!trim(item.fileName)) {
			return "이미지 파일명을 확인해 주세요.";
		}

		if (!getAllowedMimeTypesForUsage(usage).includes(item.mimeType)) {
			return isAdBannerUsage(usage)
				? "광고 배너는 JPG, PNG, WebP, GIF 형식만 등록할 수 있습니다."
				: "이미지는 JPG, PNG, WebP 형식만 등록할 수 있습니다.";
		}

		// 서버 정책과 같은 상한. 여기서 막지 않으면 폼을 다 채워 제출한 뒤에야 거부당한다.
		if (item.byteSize > IMAGE_MAX_BYTES) {
			return "이미지는 한 장당 8MB 이하만 등록할 수 있습니다.";
		}

		if (trim(item.altText).length > IMAGE_ALT_TEXT_MAX_LENGTH) {
			return "이미지 설명은 120자 이하로 입력해 주세요.";
		}
	}

	return (
		getAdBannerError(media.adHorizontal, "ad_horizontal") ??
		getAdBannerError(media.adVertical, "ad_vertical")
	);
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
			description,
			descriptionBlocks: normalizedBlocks,
			industryCategory,
			interviewNotes: interviewNotes || undefined,
			media: options.media
				? {
						adHorizontal: options.media.adHorizontal ?? undefined,
						adVertical: options.media.adVertical ?? undefined,
						cover: options.media.cover ?? undefined,
						detail: options.media.detail,
					}
				: undefined,
			organizationId,
			payAmount,
			payUnit,
			region,
			teamId: teamId || undefined,
			title,
			workSchedule,
		},
		ok: true,
	};
};

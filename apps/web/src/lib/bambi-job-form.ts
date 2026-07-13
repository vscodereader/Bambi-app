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
}: {
	createUploadIntent: (
		input: JobPostMediaUploadRequest
	) => Promise<JobPostMediaUploadIntent>;
	item: JobFormMediaItem;
	organizationId: string;
	teamId?: string;
}): Promise<ResolvedJobPostMediaItem> => {
	if (item.storageKey) {
		return {
			apiInput: {
				altText: trim(item.altText),
				byteSize: item.byteSize,
				fileName: trim(item.fileName),
				mimeType: item.mimeType,
				storageKey: item.storageKey,
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
	});

	await uploadFileToSignedUrl({ file: item.file, uploadIntent });

	const apiInput: JobPostMediaApiInput = {
		altText: trim(item.altText),
		byteSize: uploadIntent.byteSize,
		fileName: uploadIntent.fileName,
		mimeType: uploadIntent.mimeType,
		storageKey: uploadIntent.storageKey,
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

	const hasCover = Boolean(media.cover);
	const items = [...(media.cover ? [media.cover] : []), ...media.detail];
	const settled = await Promise.allSettled(
		items.map((item) =>
			resolveMediaItemForSubmit({
				createUploadIntent,
				item,
				organizationId,
				teamId,
			})
		)
	);
	const resolvedItems = items.map((item, index) => {
		const result = settled[index];

		return result?.status === "fulfilled" ? result.value.item : item;
	});

	onMediaResolved?.({
		cover: hasCover ? (resolvedItems[0] ?? null) : null,
		detail: resolvedItems.slice(hasCover ? 1 : 0),
	});

	const failed = settled.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);

	if (failed) {
		throw failed.reason instanceof Error
			? failed.reason
			: new Error("이미지 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
	}

	const apiInputs = settled.flatMap((result) =>
		result.status === "fulfilled" ? [result.value.apiInput] : []
	);

	return {
		cover: hasCover ? apiInputs[0] : undefined,
		detail: apiInputs.slice(hasCover ? 1 : 0),
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

import {
	isAllowedJobAdBannerAspect,
	isAllowedJobAdBannerSize,
	JOB_AD_BANNER_SPECS,
	type JobAdBannerUsage,
} from "./bambi/job-ad-banner-spec";
import {
	districtsForRegion,
	type IndustryOption,
	industryOptions,
	NEGOTIABLE_PAY_UNIT,
	payUnitOptions,
	regionOptions,
} from "./bambi-options";

const TITLE_MIN_LENGTH = 2;
const TITLE_MAX_LENGTH = 80;
const WORK_SCHEDULE_MAX_LENGTH = 200;
const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 2000;
const INTERVIEW_NOTES_MAX_LENGTH = 500;
const DESCRIPTION_BLOCK_MAX_COUNT = 12;
const DESCRIPTION_BLOCK_TEXT_MAX_LENGTH = 800;
const DETAIL_IMAGE_MAX_COUNT = 5;
const IMAGE_ALT_TEXT_MAX_LENGTH = 120;
// 공고·커뮤니티·채팅 이미지 공통 상한(세 파일 동기화): bambi-job-media-policy.ts,
// apps/web/src/lib/bambi-job-form.ts, bambi-media-policy.ts.
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
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
	adProductId: string | null;
	beginnerFriendly: boolean;
	description: string;
	district: string;
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	exposureType: JobExposureType;
	industryCategory: string;
	instantInterview: boolean;
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
	beginnerFriendly: boolean;
	description: string;
	descriptionBlocks: JobDescriptionBlockFormValue[];
	district: string;
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	exposureType: JobExposureType;
	// 서버 입력이 업종 enum이라 제출 페이로드는 확정 목록 값으로 좁힌다(폼 상태는 string 유지).
	industryCategory: IndustryOption;
	instantInterview: boolean;
	interviewNotes?: string;
	media?: {
		adHorizontal?: JobFormMediaItem;
		adVertical?: JobFormMediaItem;
		cover?: JobFormMediaItem;
		detail: JobFormMediaItem[];
	};
	organizationId: string;
	// 급여 단위가 "협의"면 null(금액 없이 게시).
	payAmount: null | number;
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

// 선택한 시/도의 기본 세부지역. 목록이 없는 시/도(기타)는 빈 값.
export const defaultDistrictForRegion = (region: string): string =>
	districtsForRegion(region)[0] ?? "";

export const emptyJobForm: JobForm = {
	adProductId: null,
	beginnerFriendly: false,
	description: "",
	district: defaultDistrictForRegion(regionOptions[0] ?? ""),
	exposureAmount: null,
	exposureDurationDays: null,
	exposureType: "standard",
	industryCategory: industryOptions[0] ?? "",
	instantInterview: false,
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
	adHorizontal: null,
	adVertical: null,
	cover: null,
	detail: [],
};

// 프리미엄 광고는 가로형·세로형 배너를 모두 요구한다. requiredUsages 중 media에 없는
// 슬롯을 돌려준다("ad_horizontal"은 adHorizontal, "ad_vertical"은 adVertical 부재 시 누락).
export const getMissingAdBannerUsages = (
	media: JobFormMedia,
	requiredUsages: JobAdBannerUsage[]
): JobAdBannerUsage[] =>
	requiredUsages.filter((usage) =>
		usage === "ad_horizontal" ? !media.adHorizontal : !media.adVertical
	);

// 유료 상품이 필수 배너 슬롯을 요구하는데 누락됐으면 에러 문구를 돌려준다.
// media가 undefined여도 필수가 있으면 두 슬롯 모두 누락으로 잡힌다.
const getRequiredBannerError = ({
	adProductId,
	media,
	requiredBannerUsages = [],
}: {
	adProductId: string | null;
	media?: JobFormMedia;
	requiredBannerUsages?: JobAdBannerUsage[];
}): string | undefined => {
	if (!adProductId || requiredBannerUsages.length === 0) {
		return;
	}

	return getMissingAdBannerUsages(
		media ?? emptyJobFormMedia,
		requiredBannerUsages
	).length > 0
		? "프리미엄 광고는 가로형·세로형 광고 배너 이미지를 모두 등록해야 합니다."
		: undefined;
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
// 공고 폼 밖(수다방·FAQ 본문 에디터)에서도 같은 인텐트 모양을 그대로 쓰므로 export 한다 —
// local:// 건너뛰기와 프로덕션 방어를 각자 다시 구현하면 반드시 한쪽이 어긋난다.
export const uploadFileToSignedUrl = async ({
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

	const { aspectLabel, label, minHeight, minWidth } =
		JOB_AD_BANNER_SPECS[usage];

	if (!(item.width && item.height)) {
		return `${label} 이미지의 크기를 확인하지 못했습니다. 다시 등록해 주세요.`;
	}

	// 뭉개지는 원인인 크기 하한을 먼저 막는다.
	if (
		!isAllowedJobAdBannerSize({
			height: item.height,
			usage,
			width: item.width,
		})
	) {
		return `${label} 이미지가 너무 작습니다. ${minWidth}×${minHeight}px 이상으로 등록해 주세요.`;
	}

	// 비율이 허용 오차를 크게 벗어나면 슬롯에서 로고·문구가 잘려 광고 가치가 훼손되므로
	// 반려한다. 오차 안쪽의 약간의 차이는 슬롯이 object-cover로 흡수하니 막지 않는다.
	if (
		!isAllowedJobAdBannerAspect({
			height: item.height,
			usage,
			width: item.width,
		})
	) {
		return `${label} 이미지가 요구 비율 ${aspectLabel}과 크게 달라 등록할 수 없습니다. ${aspectLabel} 비율에 맞춰 최소 ${minWidth}×${minHeight}px 이상으로 다시 등록해 주세요.`;
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
			return "이미지는 한 장당 10MB 이하만 등록할 수 있습니다.";
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
	district,
	industryCategory,
	payAmount,
	payUnit,
	region,
	title,
	workSchedule,
}: {
	district: string;
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

	// 값이 taxonomy 목록 안에 있어야 한다. 길이만 검사하면 구 taxonomy 값
	// ("서울 강남구" 등)이 수정 폼에서 그대로 재저장돼 지역 필터에 영영 걸리지 않는다.
	if (!(industryOptions as readonly string[]).includes(industryCategory)) {
		errors.industryCategory = "업종을 선택해 주세요.";
	}

	if (!(regionOptions as readonly string[]).includes(region)) {
		errors.region = "지역을 선택해 주세요.";
	}

	// 세부지역이 정의된 시/도만 필수. "기타"처럼 목록이 빈 시/도는 건너뛴다.
	const districts = districtsForRegion(region);
	if (districts.length > 0 && !districts.includes(district)) {
		errors.district = "세부지역을 선택해 주세요.";
	}

	// "협의"는 금액 없이 내는 단위라 금액 검사를 건너뛴다.
	if (
		payUnit !== NEGOTIABLE_PAY_UNIT &&
		!(Number.isInteger(payAmount) && payAmount > 0)
	) {
		errors.payAmount = "급여 금액은 1 이상의 정수로 입력해 주세요.";
	}

	if (!(payUnitOptions as readonly string[]).includes(payUnit)) {
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
		requiredBannerUsages?: JobAdBannerUsage[];
		teamScopes?: JobTeamScope[];
	} = {}
): JobFormValidationResult => {
	const errors: JobFormErrors = {};
	const organizationId = trim(form.organizationId);
	const teamId = trim(form.teamId);
	const title = trim(form.title);
	const industryCategory = trim(form.industryCategory);
	const region = trim(form.region);
	const district = trim(form.district);
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
	// 광고 상품 선택 여부로 유료/무료를 판정한다. 상품이 없으면 무료 일반 구인으로
	// 강제해 노출 관련 값을 모두 비운다.
	const isFreeExposure = !form.adProductId;
	const adProductId = isFreeExposure ? null : form.adProductId;
	// 형식·크기 오류가 있으면 그것이 우선. 없을 때만 유료 상품의 필수 배너 누락을 본다.
	const mediaError =
		getMediaError(options.media) ??
		getRequiredBannerError({
			adProductId,
			media: options.media,
			requiredBannerUsages: options.requiredBannerUsages,
		});
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
			district,
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
			beginnerFriendly: form.beginnerFriendly,
			description,
			descriptionBlocks: normalizedBlocks,
			district,
			exposureAmount,
			exposureDurationDays,
			exposureType,
			// 위 검증(getConditionErrors)이 industryOptions 소속을 보장한 뒤에만 이 분기에 온다.
			industryCategory: industryCategory as IndustryOption,
			instantInterview: form.instantInterview,
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
			// 협의 공고는 금액을 저장하지 않는다(서버도 단위·금액 짝을 검사한다).
			payAmount: payUnit === NEGOTIABLE_PAY_UNIT ? null : payAmount,
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

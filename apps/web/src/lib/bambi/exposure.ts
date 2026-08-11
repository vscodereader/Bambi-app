import { jobStatusLabels } from "../bambi-options";

export const EXPOSURE_TYPE_LABELS = {
	"premium-banner": "프리미엄 배너",
	"left-banner": "좌측 배너",
	"right-banner": "우측 배너",
	special: "스페셜 채용",
	urgent: "급구 채용",
	recommended: "추천 채용",
	standard: "일반 구인",
} as const;

export const PAYMENT_STATUS_LABELS = {
	unpaid: "미결제",
	paid: "결제완료",
} as const;

// 상세이미지 디자인 제작 애드온 진행 상태. DB enum(job_detail_design_status) 원값을
// 화면에 그대로 내보내지 않기 위한 라벨 맵이다. null(미신청)은 여기 없다 — 표시하지 않거나
// 호출부에서 "-"로 처리한다.
export const JOB_DETAIL_DESIGN_STATUS_LABELS = {
	requested: "제작 대기",
	completed: "제작 완료",
} as const;

// 리스팅 대기열 배지용 짧은 라벨. EXPOSURE_TYPE_LABELS("스페셜 채용")는 배지엔 길어서
// 대기열 표기 전용의 축약 라벨 맵을 따로 둔다. 대기열은 스페셜·추천 2종에만 존재한다.
export const LISTING_QUEUE_SHORT_LABELS = {
	recommended: "추천",
	special: "스페셜",
} as const;

export type ExposureType = keyof typeof EXPOSURE_TYPE_LABELS;
export type JobDetailDesignStatusKey =
	keyof typeof JOB_DETAIL_DESIGN_STATUS_LABELS;
export type PaymentStatus = keyof typeof PAYMENT_STATUS_LABELS;

// 배너형 노출(프리미엄·좌측·우측 배너)은 끌어올리기(수동·자동) 대상이 아니다.
// 끌어올리기는 리스팅형(스페셜·급구·추천)에만 제공된다.
const BANNER_EXPOSURE_TYPES: ReadonlySet<string> = new Set([
	"premium-banner",
	"left-banner",
	"right-banner",
]);

export const isBannerExposureType = (exposureType: string): boolean =>
	BANNER_EXPOSURE_TYPES.has(exposureType);

export type StatusTone = "danger" | "default" | "good" | "warning";

const getBaseJobStatusTone = (status: string): StatusTone => {
	if (status === "published") {
		return "good";
	}

	// 검수 보류(on_hold)는 검수 대기와 같은 "아직 결론이 안 난" 축이라 같은 tone을 쓴다.
	if (status === "pending_review" || status === "on_hold") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "default";
};

/**
 * 화면에 보이는 "공고 상태"는 검수 축(status)이 아니라 실제 공개 여부를 반영한다(구인자·운영자 공용).
 * 공개 게이트 = status "published" AND paymentStatus "paid"(packages/api의 jobs.list/getById에서
 * 강제). 인증 업체는 등록 즉시 published가 되지만 무통장입금은 결제 확인 전까지 비공개이므로
 * published + 미결제는 "미공개"(warning)로 표기한다. 그 외 상태(검수 대기·반려·숨김·임시 저장)는
 * 결제와 무관하게 기존 라벨·tone을 유지한다.
 */
export const getJobDisplayStatus = ({
	paymentStatus,
	status,
}: {
	paymentStatus: string;
	status: string;
}): { label: string; tone: StatusTone } => {
	if (status === "published" && paymentStatus !== "paid") {
		return { label: "미공개", tone: "warning" };
	}

	return {
		label: jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status,
		tone: getBaseJobStatusTone(status),
	};
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 노출 만료일까지 남은 일수를 정수로 반환한다.
 * - `endsAt`이 null이면 만료 개념이 없으므로 null.
 * - 미래면 양수(올림), 과거이거나 만료 시점이면 0 이하(음수 가능).
 */
export const remainingDays = (endsAt: Date | string | null): number | null => {
	if (endsAt === null) {
		return null;
	}

	const end = new Date(endsAt).getTime();

	if (Number.isNaN(end)) {
		return null;
	}

	return Math.ceil((end - Date.now()) / MS_PER_DAY);
};

/**
 * 노출 만료 상태 라벨.
 * - null(기간 없음) → "해당 없음"
 * - 남은 일수 > 0 → "진행중"
 * - 남은 일수 <= 0 → "만료"
 */
export const expiryLabel = (
	endsAt: Date | string | null
): "진행중" | "만료" | "해당 없음" => {
	const days = remainingDays(endsAt);

	if (days === null) {
		return "해당 없음";
	}

	return days > 0 ? "진행중" : "만료";
};

// 리스팅 대기열 판정에 필요한 공고 필드. 노출 조회 헬퍼들과 달리 status·paymentStatus까지 본다.
export interface QueueableJobFields {
	exposureEndsAt: Date | string | null;
	exposureType: string;
	paymentStatus: string;
	status: string;
}

/**
 * FIFO 유료 대기열에 걸린 공고인지 판정한다(구인자·운영자 화면 공용).
 * 대기 = published + paid 인 스페셜/추천 공고인데 아직 노출이 시작되지 않은 상태.
 * exposureEndsAt === null 이 "결제됐지만 정원 만석이라 미노출 대기중"을 뜻한다
 * (노출이 시작되면 그 시점부터 만료일이 채워진다). packages/api의 queuedListingWhere와 같은 조건.
 */
export const isQueuedListing = (job: QueueableJobFields): boolean =>
	job.status === "published" &&
	job.paymentStatus === "paid" &&
	job.exposureType in LISTING_QUEUE_SHORT_LABELS &&
	job.exposureEndsAt === null;

/**
 * 대기열 배지 라벨. position이 있으면 "스페셜 #3", null이면 "스페셜 대기".
 * 대기열 대상이 아닌(맵에 없는) 노출 타입은 원값 노출 없이 "대기"로 방어한다.
 */
export const listingQueueBadgeLabel = (
	exposureType: string,
	position: number | null
): string => {
	const shortLabel =
		LISTING_QUEUE_SHORT_LABELS[
			exposureType as keyof typeof LISTING_QUEUE_SHORT_LABELS
		];

	if (shortLabel === undefined) {
		return "대기";
	}

	return position === null
		? `${shortLabel} 대기`
		: `${shortLabel} #${position}`;
};

// 노출 마감 라벨(expiryLabel 결과)을 StatusBadge tone으로 매핑. 공고 관리·결제 관리 공용.
export const getExpiryTone = (label: string): "danger" | "default" | "good" => {
	if (label === "진행중") {
		return "good";
	}

	if (label === "만료") {
		return "danger";
	}

	return "default";
};

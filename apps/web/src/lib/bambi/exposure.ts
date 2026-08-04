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

export type ExposureType = keyof typeof EXPOSURE_TYPE_LABELS;
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

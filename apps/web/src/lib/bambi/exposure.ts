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

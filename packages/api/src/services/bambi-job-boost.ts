const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Asia/Seoul 자정 경계. 한국은 DST가 없어 UTC+9 고정 오프셋 수동 계산으로 충분하다
// (라이브러리 추가 금지 제약).
export const getKstDayStart = (now: Date): Date => {
	const shifted = new Date(now.getTime() + KST_OFFSET_MS);
	shifted.setUTCHours(0, 0, 0, 0);
	return new Date(shifted.getTime() - KST_OFFSET_MS);
};

// 자동 끌어올리기 발동 창(KST). 09:00~21:00의 12시간을 하루 자동 횟수로 균등 분배한다.
// 변경이 쉬운 단일 상수로 둔다(상품별 커스텀은 비범위).
export const AUTO_BOOST_WINDOW_START_HOUR = 9;
export const AUTO_BOOST_WINDOW_END_HOUR = 21;
export const AUTO_BOOST_WINDOW_DURATION_MS =
	(AUTO_BOOST_WINDOW_END_HOUR - AUTO_BOOST_WINDOW_START_HOUR) * HOUR_MS;

// now가 속한 KST 하루 기준, 지금까지 도래한 자동 슬롯 수(dueCount)를 반환한다.
// 슬롯 = 09:00 + k×간격, 간격 = 12h ÷ N, k = 0..N-1. 예: N=2 → 09시·15시.
// 창 시작(09:00) 이전이면 0, 창 시작 이후엔 도래한 슬롯 수(최대 N)로 캐치업한다.
export const countDueAutoBoostSlots = (
	autoBoostsPerDay: number,
	now: Date
): number => {
	if (autoBoostsPerDay <= 0) {
		return 0;
	}

	const windowStart =
		getKstDayStart(now).getTime() + AUTO_BOOST_WINDOW_START_HOUR * HOUR_MS;
	const elapsed = now.getTime() - windowStart;

	if (elapsed < 0) {
		return 0;
	}

	const intervalMs = AUTO_BOOST_WINDOW_DURATION_MS / autoBoostsPerDay;
	// slot_k(= windowStart + k×interval)이 now 이하인 k(0..N-1)의 개수 = floor(elapsed/interval)+1.
	const due = Math.floor(elapsed / intervalMs) + 1;
	return Math.min(due, autoBoostsPerDay);
};

export type BoostIneligibleReason =
	| "daily_limit_reached"
	| "exposure_expired"
	| "not_ad_job"
	| "not_publicly_visible"
	| "product_without_boost";

export const BOOST_INELIGIBLE_MESSAGES: Record<BoostIneligibleReason, string> =
	{
		daily_limit_reached: "오늘 끌어올리기 횟수를 모두 사용했습니다.",
		exposure_expired: "광고 노출 기간이 만료되어 끌어올릴 수 없습니다.",
		not_ad_job: "광고 상품이 적용된 공고만 끌어올릴 수 있습니다.",
		not_publicly_visible:
			"공개 중(결제 완료·게시)인 공고만 끌어올릴 수 있습니다.",
		product_without_boost:
			"이 광고 상품에는 끌어올리기가 포함되어 있지 않습니다.",
	};

// 끌어올리기 자격: 광고 공고(adProductId 보유) AND 공개 게이트(published+paid) AND
// 노출 유효(exposureEndsAt null 또는 미래 — isExposureActive와 동일 판정) AND
// 상품이 점프 제공(manualBoostsPerDay > 0) AND 오늘 사용량이 한도 미만.
export const resolveBoostEligibility = ({
	adProductId,
	exposureEndsAt,
	manualBoostsPerDay,
	now,
	paymentStatus,
	status,
	usedToday,
}: {
	adProductId: string | null;
	exposureEndsAt: Date | null;
	manualBoostsPerDay: number;
	now: Date;
	paymentStatus: string;
	status: string;
	usedToday: number;
}): { eligible: true } | { eligible: false; reason: BoostIneligibleReason } => {
	if (!adProductId) {
		return { eligible: false, reason: "not_ad_job" };
	}

	if (status !== "published" || paymentStatus !== "paid") {
		return { eligible: false, reason: "not_publicly_visible" };
	}

	if (exposureEndsAt !== null && exposureEndsAt.getTime() <= now.getTime()) {
		return { eligible: false, reason: "exposure_expired" };
	}

	if (manualBoostsPerDay <= 0) {
		return { eligible: false, reason: "product_without_boost" };
	}

	if (usedToday >= manualBoostsPerDay) {
		return { eligible: false, reason: "daily_limit_reached" };
	}

	return { eligible: true };
};

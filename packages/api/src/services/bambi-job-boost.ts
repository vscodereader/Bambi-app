import { AD_BANNER_EXPOSURE_TYPES } from "./bambi-ad-exposure";

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

// 공고 id 문자열의 결정적 32비트 해시(FNV-1a). 같은 id는 항상 같은 값을 내고, 서로 다른 id는
// 32비트 공간에 고르게 흩어진다. 라이브러리 없이 순수 TS로 구현한다 —
// Math.imul로 32비트 정수 곱셈 오버플로를 재현하고, >>> 0으로 부호 없는 32비트로 만든다.
const FNV_OFFSET_BASIS = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;
const fnv1a32 = (input: string): number => {
	let hash = FNV_OFFSET_BASIS;
	for (let i = 0; i < input.length; i += 1) {
		// biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a 해시의 정의상 XOR 필수(의도된 비트 연산).
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME);
	}
	// biome-ignore lint/suspicious/noBitwiseOperators: 32비트 부호 없는 정수로 변환(FNV 결과 정규화, 의도된 비트 연산).
	return hash >>> 0;
};

// 공고별 자동 슬롯 오프셋(ms). 슬롯 = 창 시작 + offset + k×interval라, 같은 N을 가진 공고들도
// 발동 시각이 id별로 어긋나 특정 분에 몰리지 않고, 전 공고가 동시에 점프해 서로 상대 우위가
// 없던 herd 문제도 사라진다. offset = hash(id) % interval ∈ [0, interval)이므로
// 마지막 슬롯(= 창 시작 + offset + (N-1)×interval) < 창 시작 + N×interval = 창 끝(21시)이
// 수학적으로 보장돼, 모든 슬롯이 09~21시 창 안에 든다. N<=0이면 슬롯 자체가 없어 0.
export const getAutoBoostSlotOffsetMs = (
	jobPostId: string,
	autoBoostsPerDay: number
): number => {
	if (autoBoostsPerDay <= 0) {
		return 0;
	}

	const intervalMs = AUTO_BOOST_WINDOW_DURATION_MS / autoBoostsPerDay;
	return fnv1a32(jobPostId) % intervalMs;
};

// now가 속한 KST 하루 기준, 지금까지 도래한 자동 슬롯 수(dueCount)를 반환한다.
// 슬롯 = 창 시작(09:00) + offsetMs + k×간격, 간격 = 12h ÷ N, k = 0..N-1.
// offsetMs는 공고별 분산 오프셋(getAutoBoostSlotOffsetMs)이며, 기본값 0이면 09:00 + k×간격의
// 기존 동작과 동일하다(예: N=2 → 09시·15시). 창 시작 + offset(이 공고의 첫 슬롯) 이전이면 0,
// 이후엔 도래한 슬롯 수(최대 N)로 캐치업한다.
export const countDueAutoBoostSlots = (
	autoBoostsPerDay: number,
	now: Date,
	offsetMs = 0
): number => {
	if (autoBoostsPerDay <= 0) {
		return 0;
	}

	const windowStart =
		getKstDayStart(now).getTime() + AUTO_BOOST_WINDOW_START_HOUR * HOUR_MS;
	const elapsed = now.getTime() - windowStart;

	// 창이 아직 안 열렸거나(elapsed<0) 이 공고의 첫 슬롯(창 시작+offset) 이전이면 0.
	if (elapsed < offsetMs) {
		return 0;
	}

	const intervalMs = AUTO_BOOST_WINDOW_DURATION_MS / autoBoostsPerDay;
	// slot_k(= windowStart + offset + k×interval)이 now 이하인 k(0..N-1)의 개수
	// = floor((elapsed − offset) / interval) + 1. [0, N]으로 클램프(첫 슬롯 이전은 위에서 걸러짐).
	const due = Math.floor((elapsed - offsetMs) / intervalMs) + 1;
	return Math.min(due, autoBoostsPerDay);
};

// 수동 끌어올리기 최소 간격 기본값(분). 무료 공고(adProduct 없음)에 적용한다.
// 광고 공고는 adProduct.manualBoostCooldownMinutes를 라이브 참조한다.
export const DEFAULT_MANUAL_BOOST_COOLDOWN_MINUTES = 10;

// 마지막 수동 끌어올림 이후 cooldownMinutes 분이 아직 안 지났으면 true(연타 차단).
// last가 없거나(첫 끌어올림) cooldownMinutes<=0이면 쿨다운 자체가 없어 false.
// 경계: 정확히 경과한 시점(=)은 허용(false), 그 직전(<)만 차단(true).
export const isManualBoostWithinCooldown = (
	lastManualBoostAt: Date | null,
	now: Date,
	cooldownMinutes: number
): boolean => {
	if (lastManualBoostAt === null || cooldownMinutes <= 0) {
		return false;
	}

	return now.getTime() - lastManualBoostAt.getTime() < cooldownMinutes * 60_000;
};

// 쿨다운 종료까지 남은 시간(ms). last가 없으면 0. 라우터 메시지의 "약 N분 후" 계산용.
export const manualBoostCooldownRemainingMs = (
	lastManualBoostAt: Date | null,
	now: Date,
	cooldownMinutes: number
): number => {
	if (lastManualBoostAt === null) {
		return 0;
	}

	return Math.max(
		0,
		cooldownMinutes * 60_000 - (now.getTime() - lastManualBoostAt.getTime())
	);
};

export type BoostIneligibleReason =
	| "banner_product"
	| "daily_limit_reached"
	| "exposure_expired"
	| "no_boost_available"
	| "not_publicly_visible";

export const BOOST_INELIGIBLE_MESSAGES: Record<BoostIneligibleReason, string> =
	{
		banner_product:
			"배너 광고는 끌어올리기 대상이 아닙니다. 리스팅 광고(스페셜·급구·추천)에서만 제공됩니다.",
		daily_limit_reached: "오늘 끌어올리기 횟수를 모두 사용했습니다.",
		exposure_expired: "광고 노출 기간이 만료되어 끌어올릴 수 없습니다.",
		no_boost_available:
			"이 공고에 사용할 수 있는 끌어올리기가 없습니다. 광고 상품 또는 끌어올리기 옵션을 구매해 주세요.",
		not_publicly_visible:
			"공개 중(결제 완료·게시)인 공고만 끌어올릴 수 있습니다.",
	};

// 끌어올리기 추가 옵션 구매 1건의 판정용 최소 형태(jobBoostPurchase 행의 부분집합).
// 순수 서비스가 DB 스키마에 직접 매이지 않도록 필요한 칸만 인터페이스로 노출한다.
export interface BoostPurchaseLike {
	boostsPerDay: null | number;
	createdAt: Date;
	expiresAt: Date | null;
	id: string;
	optionType: "auto_period" | "manual_count" | "manual_period";
	paymentStatus: string;
	remainingCount: null | number;
}

// 구매가 지금 유효한지: 결제 완료 AND (기간제는 만료 미래 / 횟수권은 잔여 > 0).
export const isBoostPurchaseActive = (
	p: BoostPurchaseLike,
	now: Date
): boolean => {
	if (p.paymentStatus !== "paid") {
		return false;
	}

	if (p.optionType === "manual_count") {
		return (p.remainingCount ?? 0) > 0;
	}

	// 기간제(manual_period·auto_period): 만료 시각이 미래여야 활성.
	return p.expiresAt !== null && p.expiresAt.getTime() > now.getTime();
};

// 활성 기간제 구매의 하루 끌어올리기 횟수 합. optionType으로 수동/자동 기간제를 구분해 집계한다.
export const sumActivePeriodBoostsPerDay = (
	purchases: BoostPurchaseLike[],
	optionType: "auto_period" | "manual_period",
	now: Date
): number =>
	purchases
		.filter((p) => p.optionType === optionType && isBoostPurchaseActive(p, now))
		.reduce((sum, p) => sum + (p.boostsPerDay ?? 0), 0);

// 활성 횟수권(manual_count) 잔여 횟수 합.
export const sumRemainingBoostCount = (
	purchases: BoostPurchaseLike[],
	now: Date
): number =>
	purchases
		.filter(
			(p) => p.optionType === "manual_count" && isBoostPurchaseActive(p, now)
		)
		.reduce((sum, p) => sum + (p.remainingCount ?? 0), 0);

// 차감할 횟수권 1건: 활성 횟수권 중 가장 오래된 것(createdAt 오름차순, FIFO). 없으면 null.
// isBoostPurchaseActive가 잔여 0을 이미 걸러 잔여 있는 활성 구매만 후보가 된다.
export const pickCountPurchaseToConsume = (
	purchases: BoostPurchaseLike[],
	now: Date
): BoostPurchaseLike | null =>
	purchases
		.filter(
			(p) => p.optionType === "manual_count" && isBoostPurchaseActive(p, now)
		)
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;

// 끌어올리기 자격 v2. 상품(번들)과 추가 옵션을 합산해 판정한다:
// 공개 게이트(published+paid) → 광고 공고 노출 만료 → 배너 비대상 →
// 하루 한도(상품 manualBoostsPerDay + 활성 옵션 기간제 optionManualPerDay)와 횟수권 잔여를 종합.
// 무료 공고(adProductId null)는 노출 만료 판정을 건너뛰어, 옵션만으로도 끌어올릴 수 있다.
// consume은 이번 끌어올림을 어디서 소진할지: "daily"=하루 한도, "count"=횟수권 1회 차감.
export const resolveBoostEligibility = ({
	adProductId,
	countRemaining,
	exposureEndsAt,
	exposureType,
	manualBoostsPerDay,
	now,
	optionManualPerDay,
	paymentStatus,
	status,
	usedToday,
}: {
	adProductId: string | null;
	countRemaining: number;
	exposureEndsAt: Date | null;
	exposureType: string;
	manualBoostsPerDay: number;
	now: Date;
	optionManualPerDay: number;
	paymentStatus: string;
	status: string;
	usedToday: number;
}):
	| { eligible: true; consume: "count" | "daily" }
	| { eligible: false; reason: BoostIneligibleReason } => {
	if (status !== "published" || paymentStatus !== "paid") {
		return { eligible: false, reason: "not_publicly_visible" };
	}

	// 광고 공고(adProductId 보유)만 노출 기간 만료를 따진다. 무료 공고는 노출 기간이 없어(null)
	// 이 게이트를 건너뛰고, 옵션 구매만으로 끌어올릴 수 있다.
	if (
		adProductId !== null &&
		exposureEndsAt !== null &&
		exposureEndsAt.getTime() <= now.getTime()
	) {
		return { eligible: false, reason: "exposure_expired" };
	}

	// 배너형 공고는 끌어올리기 대상이 아니다(리스팅형: 스페셜·급구·추천에서만 제공).
	if ((AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType)) {
		return { eligible: false, reason: "banner_product" };
	}

	// 하루 한도 = 상품 번들 + 활성 기간제 옵션 합.
	const dailyLimit = manualBoostsPerDay + optionManualPerDay;

	// 하루 한도도 없고 횟수권 잔여도 없으면 애초에 쓸 끌어올리기가 없다.
	if (dailyLimit <= 0 && countRemaining <= 0) {
		return { eligible: false, reason: "no_boost_available" };
	}

	// 하루 한도가 남았으면 우선 그것부터 소진한다(횟수권을 아낀다).
	if (usedToday < dailyLimit) {
		return { consume: "daily", eligible: true };
	}

	// 하루 한도는 소진됐지만 횟수권이 남았으면 횟수권 1회 차감.
	if (countRemaining > 0) {
		return { consume: "count", eligible: true };
	}

	return { eligible: false, reason: "daily_limit_reached" };
};

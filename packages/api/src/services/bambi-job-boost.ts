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

export type BoostIneligibleReason =
	| "banner_product"
	| "daily_limit_reached"
	| "exposure_expired"
	| "not_ad_job"
	| "not_publicly_visible"
	| "product_without_boost";

export const BOOST_INELIGIBLE_MESSAGES: Record<BoostIneligibleReason, string> =
	{
		banner_product:
			"배너 광고는 끌어올리기 대상이 아닙니다. 리스팅 광고(스페셜·급구·추천)에서만 제공됩니다.",
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
// 리스팅형 노출(배너형은 끌어올리기 비대상) AND 상품이 점프 제공(manualBoostsPerDay > 0)
// AND 오늘 사용량이 한도 미만.
export const resolveBoostEligibility = ({
	adProductId,
	exposureEndsAt,
	exposureType,
	manualBoostsPerDay,
	now,
	paymentStatus,
	status,
	usedToday,
}: {
	adProductId: string | null;
	exposureEndsAt: Date | null;
	exposureType: string;
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

	// 배너형 공고는 끌어올리기 대상이 아니다(리스팅형: 스페셜·급구·추천에서만 제공).
	// 상태·노출 게이트 뒤에 둬 일시적 사유(미게시·만료)가 먼저 안내되게 하고,
	// 상품 유형 사유는 그 다음으로 판정한다.
	if ((AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType)) {
		return { eligible: false, reason: "banner_product" };
	}

	if (manualBoostsPerDay <= 0) {
		return { eligible: false, reason: "product_without_boost" };
	}

	if (usedToday >= manualBoostsPerDay) {
		return { eligible: false, reason: "daily_limit_reached" };
	}

	return { eligible: true };
};

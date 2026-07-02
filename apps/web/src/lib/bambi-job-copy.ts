// 밤비 공고 폼에서 쓰는 안내 문구·기준값 모음.
// TODO(placeholder): 아래 값은 임시값입니다. 실제 정책이 확정되면 이 파일만 수정하세요.
//  - JOB_REVIEW_SLA_TEXT: 검수 소요 시간 안내 문구 (운영 SLA 확정 시)
//  - MINIMUM_HOURLY_WAGE / MINIMUM_HOURLY_WAGE_YEAR: 최저시급 기준값·연도 (고시값)
export const JOB_REVIEW_SLA_TEXT = "보통 1영업일 이내";
export const MINIMUM_HOURLY_WAGE = 10_320;
export const MINIMUM_HOURLY_WAGE_YEAR = 2026;

export const HOURLY_PAY_UNIT = "시급";

export const formatPayAmount = (payAmount: string): string => {
	const numericPay = Number(payAmount.trim());

	return Number.isFinite(numericPay) && numericPay > 0
		? numericPay.toLocaleString("ko-KR")
		: "";
};

export const isBelowMinimumHourlyWage = (
	payAmount: string,
	payUnit: string
): boolean => {
	if (payUnit !== HOURLY_PAY_UNIT) {
		return false;
	}

	const numericPay = Number(payAmount.trim());

	return (
		Number.isFinite(numericPay) &&
		numericPay > 0 &&
		numericPay < MINIMUM_HOURLY_WAGE
	);
};

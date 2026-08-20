// 누적 광고일수 등급 구간 검증(순수). 상한 없음(null)은 항상 유효, 값이면 최소 일수가 최대
// 일수보다 크면 안 된다. 라우터 zod refine과 테스트가 공유한다.
export const isAdPeriodTierRangeValid = (
	minDays: number,
	maxDays: null | number
): boolean => maxDays === null || minDays <= maxDays;

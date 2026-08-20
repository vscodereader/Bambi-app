// 누적 광고일수 등급 구간 검증(순수). 상한 없음(null)은 항상 유효, 값이면 최소 일수가 최대
// 일수보다 크면 안 된다. 라우터 zod refine과 테스트가 공유한다.
export const isAdPeriodTierRangeValid = (
	minDays: number,
	maxDays: null | number
): boolean => maxDays === null || minDays <= maxDays;

// 아이콘 색: Tailwind 텍스트 색 유틸만 허용(raw hex 금지). 브랜드색 text-primary(숫자 없음)와
// text-amber-500(숫자 있음) 둘 다 통과. 화면은 프리셋에서 고르지만 서버도 최소 형태를 막는다.
const TEXT_COLOR_CLASS = /^text-[a-z]+(-\d{2,3})?$/;

export const isAdPeriodTierColorClassValid = (value: string): boolean =>
	TEXT_COLOR_CLASS.test(value);

import { DEFAULT_MINIMUM_WAGE } from "@bambi-app/api/services/bambi-policy";

interface MinimumWageSettings {
	minimumWageHourly?: null | number;
	minimumWageYear?: null | number;
}

// 공고 상세의 급여 옆 보조 표기("2026년 최저시급 10,320원").
// 운영자 미설정(null)·조회 실패·로딩 중(undefined)에는 코드 기본값으로 떨어져,
// 표기가 깜빡이며 사라지지 않게 한다. 연도는 저장값을 그대로 쓴다 — 현재 연도로
// 유추하면 다음 해 시급이 미리 고시된 연말에 틀린 연도가 붙는다.
export const formatMinimumWageLabel = (
	settings?: MinimumWageSettings | null
): string => {
	const year = settings?.minimumWageYear ?? DEFAULT_MINIMUM_WAGE.year;
	const hourly = settings?.minimumWageHourly ?? DEFAULT_MINIMUM_WAGE.hourly;
	return `${year}년 최저시급 ${hourly.toLocaleString("ko-KR")}원`;
};

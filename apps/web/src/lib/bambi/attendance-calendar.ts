// 출석 월 달력 그리드. 달력 라이브러리를 붙이지 않고 Date의 UTC 산술만 쓴다
// (의존성 추가 금지 규칙). 값은 전부 "YYYY-MM-DD" 문자열이라 서버가 내려주는
// 출석일 배열과 파싱 없이 그대로 대조된다.

export interface MonthCell {
	// null이면 첫 주의 빈 칸이다.
	date: null | string;
	// 렌더 key. 빈 칸도 유일한 key를 갖게 여기서 만들어 준다 —
	// JSX에서 map 인덱스를 key로 쓰지 않기 위한 것이다.
	key: string;
}

// "YYYY-MM"을 숫자 두 개로. 구조분해 destructure는 noUncheckedIndexedAccess 때문에
// undefined가 섞이므로 slice로 자른다.
const parseMonth = (month: string): { month: number; year: number } => ({
	month: Number(month.slice(5, 7)),
	year: Number(month.slice(0, 4)),
});

export const shiftMonth = (month: string, delta: number): string => {
	const parsed = parseMonth(month);
	const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1));
	return shifted.toISOString().slice(0, 7);
};

/**
 * 일요일 시작 그리드. 첫 주의 빈 칸만 채우고 마지막 주 뒤쪽은 비워 둔다
 * (grid가 남은 칸을 알아서 접으므로 더미를 만들 이유가 없다).
 */
export const buildMonthGrid = (month: string): MonthCell[] => {
	const parsed = parseMonth(month);
	const firstDay = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
	// 다음 달 0일 = 이번 달 마지막 날.
	const dayCount = new Date(
		Date.UTC(parsed.year, parsed.month, 0)
	).getUTCDate();
	const cells: MonthCell[] = [];

	for (let blank = 0; blank < firstDay.getUTCDay(); blank += 1) {
		cells.push({ date: null, key: `${month}-blank-${blank}` });
	}

	for (let day = 1; day <= dayCount; day += 1) {
		const date = `${month}-${String(day).padStart(2, "0")}`;
		cells.push({ date, key: date });
	}

	return cells;
};

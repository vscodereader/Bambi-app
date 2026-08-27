// 출석체크의 날짜 계산. 출석 단위는 "서울에서의 하루"라 서버 로캘·UTC 자정과 무관하게
// KST 달력일로만 판정한다(클라이언트 시계는 신뢰하지 않는다 — 스펙 §5.1).
// 달력 라이브러리를 붙이지 않고 Intl + UTC 산술만 쓴다(의존성 추가 금지 규칙).

// en-CA 로캘은 YYYY-MM-DD를 그대로 내주므로 조립 없이 date 컬럼 값으로 쓸 수 있다.
const KST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
	day: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Seoul",
	year: "numeric",
});

export const getKstDateString = (now: Date = new Date()): string =>
	KST_DATE_FORMAT.format(now);

// YYYY-MM-DD를 UTC 자정으로 해석해 일수만 더한다. 시각이 없는 달력 산술이라
// 로컬 타임존·서머타임이 끼어들 여지가 없다.
export const shiftKstDate = (isoDate: string, days: number): string => {
	const shifted = new Date(`${isoDate}T00:00:00.000Z`);
	shifted.setUTCDate(shifted.getUTCDate() + days);
	return shifted.toISOString().slice(0, 10);
};

/**
 * 연속 출석일. 내림차순(최신 우선) 출석일 배열을 앞에서부터 하루씩 이어 세고 첫 구멍에서 멈춘다.
 * 기준일(today) 당일 또는 **전날**에서 시작하는 연속만 살아 있는 것으로 본다 — 오늘 출석을
 * 누르기 전에도 "연속 N일"이 보여야 버튼을 누를 이유가 생기고, 자정 직후 0으로 리셋돼
 * 보이는 착시를 막는다.
 */
export const countAttendanceStreak = (
	attendedDatesDesc: readonly string[],
	today: string
): number => {
	const latest = attendedDatesDesc[0];

	if (!latest || (latest !== today && latest !== shiftKstDate(today, -1))) {
		return 0;
	}

	let streak = 1;
	let expected = shiftKstDate(latest, -1);

	for (const attendedOn of attendedDatesDesc.slice(1)) {
		if (attendedOn !== expected) {
			break;
		}
		streak += 1;
		expected = shiftKstDate(attendedOn, -1);
	}

	return streak;
};

export interface AttendanceRewardRun {
	endOn: string;
	entitledClaims: number;
	length: number;
	startOn: string;
}

// 새 체크인·복구 날짜를 포함하는 전체 출석 연속 구간. 화면의 현재 연속 출석과 같은 기존·일반·
// 복구 출석 날짜를 모두 사용해 표시 일수와 보상 일수가 어긋나지 않게 한다.
export const resolveAttendanceRewardRun = (
	attendedDates: readonly string[],
	triggerAttendedOn: string
): AttendanceRewardRun | null => {
	const dates = [...new Set(attendedDates)].sort();
	const triggerIndex = dates.indexOf(triggerAttendedOn);
	if (triggerIndex < 0) {
		return null;
	}
	let startIndex = triggerIndex;
	while (
		startIndex > 0 &&
		dates[startIndex - 1] === shiftKstDate(dates[startIndex] as string, -1)
	) {
		startIndex -= 1;
	}
	let endIndex = triggerIndex;
	while (
		endIndex < dates.length - 1 &&
		dates[endIndex + 1] === shiftKstDate(dates[endIndex] as string, 1)
	) {
		endIndex += 1;
	}
	const startOn = dates[startIndex];
	const endOn = dates[endIndex];
	if (!(startOn && endOn)) {
		return null;
	}
	const length = endIndex - startIndex + 1;
	return {
		entitledClaims: Math.floor(length / 7),
		endOn,
		length,
		startOn,
	};
};

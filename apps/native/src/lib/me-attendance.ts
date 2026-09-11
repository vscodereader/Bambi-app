// 포인트 내역 화면(app/(seeker)/me/attendance.tsx) 전용 순수 헬퍼.
// 웹 apps/web/src/lib/bambi/attendance-calendar.ts는 apps/web 안이라 native에서 import
// 할 수 없어 최소한만 옮긴다. 값은 전부 "YYYY-MM-DD" 문자열이라 서버가 내려주는
// attendedDates·today와 파싱 없이 그대로 대조된다.

export interface MonthCell {
	// null이면 앞뒤 패딩 빈 칸이다.
	date: null | string;
	// 렌더 key. 빈 칸도 유일한 key를 갖게 여기서 만들어 준다.
	key: string;
}

const DAYS_PER_WEEK = 7;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// "YYYY-MM"을 숫자 두 개로. 구조분해는 undefined가 섞이므로 slice로 자른다.
const parseMonth = (month: string): { month: number; year: number } => ({
	month: Number(month.slice(5, 7)),
	year: Number(month.slice(0, 4)),
});

export const shiftMonth = (month: string, delta: number): string => {
	const parsed = parseMonth(month);
	return new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1))
		.toISOString()
		.slice(0, 7);
};

export const monthLabel = (month: string): string =>
	`${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;

/**
 * 일요일 시작 달력을 주 단위로 자른다. 웹은 CSS grid가 남는 칸을 알아서 접지만
 * native는 flex-row라 마지막 줄 칸이 홀로 늘어난다 — 앞뒤 모두 빈 칸으로 채워
 * 항상 7칸 행만 내보낸다.
 */
export const buildMonthWeeks = (month: string): MonthCell[][] => {
	const parsed = parseMonth(month);
	const leading = new Date(
		Date.UTC(parsed.year, parsed.month - 1, 1)
	).getUTCDay();
	// 다음 달 0일 = 이번 달 마지막 날.
	const dayCount = new Date(
		Date.UTC(parsed.year, parsed.month, 0)
	).getUTCDate();
	const cells: MonthCell[] = [];

	for (let blank = 0; blank < leading; blank += 1) {
		cells.push({ date: null, key: `${month}-lead-${blank}` });
	}

	for (let day = 1; day <= dayCount; day += 1) {
		const date = `${month}-${String(day).padStart(2, "0")}`;
		cells.push({ date, key: date });
	}

	while (cells.length % DAYS_PER_WEEK !== 0) {
		cells.push({ date: null, key: `${month}-trail-${cells.length}` });
	}

	const weeks: MonthCell[][] = [];

	for (let index = 0; index < cells.length; index += DAYS_PER_WEEK) {
		weeks.push(cells.slice(index, index + DAYS_PER_WEEK));
	}

	return weeks;
};

// 적립은 부호를 붙여 사용과 한눈에 갈린다(웹 PointHistoryCard와 같은 규칙).
export const formatPointAmount = (amount: number): string =>
	`${amount > 0 ? "+" : ""}${amount.toLocaleString("ko-KR")}P`;

// getMineHistory의 createdAt은 Date로 내려온다(oRPC가 Date를 그대로 직렬화).
// 웹처럼 Intl timeZone: "Asia/Seoul"을 쓰지 않는다 — Hermes(Android)의
// Intl.DateTimeFormat은 timeZone 지원이 불확실해 조용히 로컬 시간으로 떨어진다.
// KST는 서머타임이 없으므로 +9시간 산술이 곧 정확한 변환이다.
export const formatPointDate = (value: Date | string): string =>
	new Date(new Date(value).getTime() + KST_OFFSET_MS)
		.toISOString()
		.slice(0, 10)
		.replaceAll("-", ".");

// 포인트몰 주문 라벨. apps/web/src/lib/bambi/point-shop-labels.ts는 web 패키지 안이라
// native에서 import할 수 없어 구매자 화면에 필요한 두 맵만 옮겨 적는다(운영자용
// "처리 대기" 라벨은 native에 운영자 화면이 없어 가져오지 않는다). enum 원값 노출 금지.
const BUYER_STATUS_LABELS: Record<string, string> = {
	canceled: "취소·환불",
	completed: "지급완료",
	owned: "보유 중",
	pending: "주문완료",
	used: "사용 완료",
};

export const pointShopBuyerStatusLabel = (status: string): string =>
	BUYER_STATUS_LABELS[status] ?? "상태 확인 필요";

const BENEFIT_TYPE_LABELS: Record<string, string> = {
	ad_extend: "광고 기간 연장",
	boost_auto_period: "자동 끌어올리기(기간)",
	boost_manual_count: "끌어올리기 횟수권",
	boost_manual_period: "끌어올리기(기간)",
	coupon: "쿠폰 발송",
	none: "직접 지급",
};

export const pointShopBenefitTypeLabel = (benefitType: string): string =>
	BENEFIT_TYPE_LABELS[benefitType] ?? "혜택 확인 필요";

// 보유 혜택의 사용 기한 만료(웹 my-benefits-card.tsx의 isExpired와 같은 식).
// usableUntil이 null이면 무기한이다. 표시 보조일 뿐 사용 가부의 정본은 서버다.
export const isBenefitExpired = (usableUntil: Date | null | string): boolean =>
	usableUntil !== null && new Date(usableUntil).getTime() <= Date.now();

// 등급 아이콘 URL 가드. 서버 resolveGradeIconUrl은 세 가지를 내려준다 — 프로덕션 GCS
// 절대 URL, builtin 웹 상대 경로("/grade-icons/*.gif"), 개발 폴백 웹 라우트
// ("/bambi/local-grade-icons?key=..."). 뒤 둘은 apps/web 오리진 자산이라 native <Image>가
// 조용히 아무것도 그리지 않는다 — 절대 URL일 때만 그리고 아니면 이름만 남긴다.
// (커버 이미지와 달리 base URL 조립은 하지 않는다. 서버가 완성 URL을 준다.)
export const isAbsoluteIconUrl = (
	value: null | string | undefined
): value is string =>
	typeof value === "string" &&
	(value.startsWith("https://") || value.startsWith("http://"));

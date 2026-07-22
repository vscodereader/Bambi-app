// 업종 카테고리 — 서버 DB enum(job_industry_category)과 값이 1:1로 일치해야 한다.
// 값 자체가 화면 표기라 별도 라벨 맵 없이 그대로 렌더·저장한다.
export const industryOptions = [
	"룸싸롱",
	"텐프로/쩜오",
	"노래주점",
	"단란주점",
	"다방",
	"BAR",
	"마사지",
	"요정",
] as const;

export type IndustryOption = (typeof industryOptions)[number];

// 서버 입력이 enum으로 좁혀져 자유 문자열을 그대로 못 보낸다. 폼 검증·필터가 이 가드로
// 좁힌 뒤 전송한다.
export const isIndustryOption = (value: string): value is IndustryOption =>
	(industryOptions as readonly string[]).includes(value);

export const regionOptions = ["서울", "경기", "인천", "부산", "기타"] as const;

// 시/도 → 세부지역. 폼·seeker 필터·mock이 공유하는 단일 소스.
export const REGION_DISTRICTS: Record<string, readonly string[]> = {
	서울: ["강남", "서초", "송파", "마포", "용산", "강북"],
	경기: ["부천", "수원", "성남", "안양"],
	인천: ["남동", "부평", "미추홀"],
	부산: ["해운대", "서면", "연제"],
	기타: [],
};

// 선택한 시/도의 세부지역 목록(정의 없으면 빈 배열).
export function districtsForRegion(region: string): readonly string[] {
	return REGION_DISTRICTS[region] ?? [];
}
// 금액 없이 "면접 후 급여 협의"로 내는 단위. 이 단위면 payAmount를 저장하지 않는다.
export const NEGOTIABLE_PAY_UNIT = "협의";

export const payUnitOptions = [
	"시급",
	"일급",
	"주급",
	"월급",
	NEGOTIABLE_PAY_UNIT,
] as const;

// 급여가 협의라 금액을 못 읽는 공고의 표시 문구. 목록·카드가 공유한다.
export const NEGOTIABLE_PAY_TEXT = "급여 협의";

// 급여 단위 → 시급 환산에 쓰는 근로시간. 최소 시급 필터가 단위가 섞인 공고를
// 같은 잣대로 비교하려면 필요하다. 일 8시간·주 5일, 월급은 근로기준법 통상임금
// 산정 기준시간 209시간(주휴 포함)을 따른다.
export const PAY_UNIT_HOURS: Record<string, number> = {
	시급: 1,
	일급: 8,
	주급: 40,
	월급: 209,
};

export const jobStatusLabels = {
	draft: "임시 저장",
	pending_review: "검수 대기",
	published: "공개",
	hidden: "숨김",
	rejected: "반려",
} as const;

export const verificationStatusLabels = {
	none: "미인증",
	pending: "인증 대기",
	verified: "인증 완료",
	rejected: "인증 반려",
} as const;

export const interviewStatusLabels = {
	proposed: "제안됨",
	confirmed: "확정",
	declined: "거절",
	canceled: "취소",
	completed: "완료",
} as const;

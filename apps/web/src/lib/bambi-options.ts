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
	// 맨 끝. 구체 업종에 안 맞는 공고(수집 원본의 "기타 - 기타업종" 포함)를 받는 자리라
	// 목록·Select에서도 마지막에 와야 한다.
	"기타",
] as const;

export type IndustryOption = (typeof industryOptions)[number];

// 서버 입력이 enum으로 좁혀져 자유 문자열을 그대로 못 보낸다. 폼 검증·필터가 이 가드로
// 좁힌 뒤 전송한다.
export const isIndustryOption = (value: string): value is IndustryOption =>
	(industryOptions as readonly string[]).includes(value);

// 지역·세부지역은 DB 지역 마스터(regions.list)에서 온다 — lib/bambi/regions.ts 참고.

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

// on_hold(검수 보류)는 운영자가 검수 큐에서 판단을 미룬 상태다. 운영자가 직접 내린
// hidden(숨김)과 라벨이 갈려야 구인자가 "왜 안 보이는지"를 구분할 수 있다.
export const jobStatusLabels = {
	draft: "임시 저장",
	pending_review: "검수 대기",
	published: "공개",
	hidden: "숨김",
	rejected: "반려",
	on_hold: "검수 보류",
} as const;

// 국세청 사업자등록 상태(b_stt_cd) 원값 → 화면 라벨. 서버가 계속사업자("01")만
// 제출을 통과시키므로 저장된 값은 사실상 "01"이지만, 원값 노출을 막으려 맵을 둔다.
export const biznumStatusLabels = {
	"01": "계속사업자",
	"02": "휴업자",
	"03": "폐업자",
} as const;

// 대조에 성공한 행에서만 쓰는 라벨이라 값이 없거나 모르는 코드는 하나로 묶는다.
export const getBiznumStatusLabel = (code: null | string): string =>
	biznumStatusLabels[code as keyof typeof biznumStatusLabels] ?? "상태 미상";

export const verificationStatusLabels = {
	none: "미인증",
	pending: "인증 대기",
	verified: "인증 완료",
	rejected: "인증 반려",
	changes_unsubmitted: "변경사항 미제출",
} as const;

export const interviewStatusLabels = {
	proposed: "제안됨",
	confirmed: "확정",
	declined: "거절",
	canceled: "취소",
	completed: "완료",
} as const;

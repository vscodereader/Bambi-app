// 밤비 — 운영자 콘솔에서 노출되는 상태·역할·위험 신호 enum의 한글 표시 라벨.
// report-labels.ts의 targetTypeLabel과 동일 패턴을 따른다: Record<string, string> +
// string 입력 + 알 수 없는 값에도 안전한 중립 폴백(enum 원값 노출 금지). 서버가 TS 유니온
// 밖의 문자열(다른 브랜치에서 추가된 상태·역할 등)을 런타임에 내려도 원값이 화면에 새지
// 않는다. 여기서 만드는 건 **표시 텍스트**뿐이며, 필터 쿼리 값·비교 로직·API 입력의 원값은
// 절대 이 라벨로 대체하지 않는다.

// 공고 검수 상태(job_post_status): draft·pending_review·published·hidden·rejected.
const JOB_POST_STATUS_LABELS: Record<string, string> = {
	draft: "작성 중",
	pending_review: "검수 대기",
	published: "게시됨",
	hidden: "숨김",
	rejected: "반려",
};

export function jobPostStatusLabel(status: string): string {
	return JOB_POST_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 후기 검수 상태(review_status): published·pending_review·hidden.
const REVIEW_STATUS_LABELS: Record<string, string> = {
	published: "게시됨",
	pending_review: "검수 대기",
	hidden: "숨김",
};

export function reviewStatusLabel(status: string): string {
	return REVIEW_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 계정 상태(account_status): active·warned·suspended. blocked는 web UI 전용 상태로 포함한다.
const ACCOUNT_STATUS_LABELS: Record<string, string> = {
	active: "정상",
	warned: "경고",
	suspended: "정지",
	blocked: "차단",
};

export function accountStatusLabel(status: string): string {
	return ACCOUNT_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 사용자 역할(bambi_user_role): job_seeker·employer·admin.
const USER_ROLE_LABELS: Record<string, string> = {
	admin: "운영자",
	employer: "구인자",
	job_seeker: "구직자",
};

export function userRoleLabel(role: string): string {
	return USER_ROLE_LABELS[role] ?? "사용자";
}

// 공고 위험 신호 코드(job_post.risk_flags 항목). 자동 필터가 붙이는 내부 코드라 원값 노출을
// 막고 운영자용 한글 설명으로 치환한다. 알 수 없는 코드는 중립 폴백으로 표시한다.
const RISK_FLAG_LABELS: Record<string, string> = {
	needs_review: "검수 대기",
	risky_term: "위험 표현 감지",
};

export function riskFlagLabel(flag: string): string {
	return RISK_FLAG_LABELS[flag] ?? "정책 확인 필요";
}

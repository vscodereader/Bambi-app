// 밤비 — 운영자 콘솔에서 노출되는 상태·역할·위험 신호 enum의 한글 표시 라벨.
// report-labels.ts의 targetTypeLabel과 동일 패턴을 따른다: Record<string, string> +
// string 입력 + 알 수 없는 값에도 안전한 중립 폴백(enum 원값 노출 금지). 서버가 TS 유니온
// 밖의 문자열(다른 브랜치에서 추가된 상태·역할 등)을 런타임에 내려도 원값이 화면에 새지
// 않는다. 여기서 만드는 건 **표시 텍스트**뿐이며, 필터 쿼리 값·비교 로직·API 입력의 원값은
// 절대 이 라벨로 대체하지 않는다.

// 공고 검수 상태(job_post_status): draft·pending_review·published·hidden·rejected·on_hold.
const JOB_POST_STATUS_LABELS: Record<string, string> = {
	draft: "작성 중",
	pending_review: "검수 대기",
	published: "게시됨",
	hidden: "숨김",
	rejected: "반려",
	on_hold: "검수 보류",
};

export function jobPostStatusLabel(status: string): string {
	return JOB_POST_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 후기 검수 상태(review_status): published·pending_review·hidden.
export const REVIEW_STATUS_LABELS: Record<string, string> = {
	published: "게시됨",
	pending_review: "검수 대기",
	hidden: "숨김",
};

export function reviewStatusLabel(status: string): string {
	return REVIEW_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 계정 상태(account_status): active·warned·suspended.
const ACCOUNT_STATUS_LABELS: Record<string, string> = {
	active: "정상",
	warned: "경고",
	suspended: "정지",
};

export function accountStatusLabel(status: string): string {
	return ACCOUNT_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 감사 로그 액션 코드(admin_moderation_action.action). 사용자 대상 제재는 `set_status:*`
// 형태라 원값이 화면에 새지 않게 조치 이름으로 치환한다.
const MODERATION_ACTION_LABELS: Record<string, string> = {
	"set_status:active": "정상 복구",
	"set_status:warned": "경고",
	"set_status:suspended": "이용 정지",
	"set_role:legal_advisor": "법률자문 지정",
	"set_role:job_seeker": "법률자문 해제",
};

export function moderationActionLabel(action: string): string {
	return MODERATION_ACTION_LABELS[action] ?? "기타 조치";
}

// 사용자 역할(bambi_user_role): job_seeker·employer·admin·guest·legal_advisor.
// guest는 계정 없는 비회원 작성자 스냅샷이라 회원 목록에는 나타나지 않고, 수다방
// 글·댓글의 author_role로만 등장한다. legal_advisor는 운영자가 구직자 계정에 지정하는
// 무료 법률 자문 답변 계정이다.
const USER_ROLE_LABELS: Record<string, string> = {
	admin: "운영자",
	employer: "구인자",
	guest: "비회원",
	job_seeker: "구직자",
	legal_advisor: "법률자문",
};

export function userRoleLabel(role: string): string {
	return USER_ROLE_LABELS[role] ?? "사용자";
}

// 공고 위험 신호 코드(job_post.risk_flags 항목). 자동 필터가 붙이는 내부 코드라 원값 노출을
// 막고 운영자용 한글 설명으로 치환한다. 알 수 없는 코드는 중립 폴백으로 표시한다.
const RISK_FLAG_LABELS: Record<string, string> = {
	// needs_review·risky_term은 과거 데이터에 남아 있는 코드다(원값 노출을 막으려 유지).
	needs_review: "검수 대기",
	risky_term: "위험 표현 감지",
	banned_word: "금칙어 감지",
};

export function riskFlagLabel(flag: string): string {
	return RISK_FLAG_LABELS[flag] ?? "정책 확인 필요";
}

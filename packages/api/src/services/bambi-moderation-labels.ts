// 밤비 — 운영자 콘솔(web·native)이 공유하는 상태·역할·위험 신호 라벨과 판정 규칙.
// 표시는 전부 여기를 거친다: Record<string, string> + string 입력 + 알 수 없는 값에도
// 안전한 중립 폴백(enum 원값 노출 금지). 서버가 TS 유니온 밖의 문자열(다른 브랜치에서
// 추가된 상태·역할 등)을 런타임에 내려도 원값이 화면에 새지 않는다. 여기서 만드는 건
// **표시 텍스트와 판정 프리셋**뿐이며, 필터 쿼리 값·비교 로직·API 입력의 원값은 절대
// 이 라벨로 대체하지 않는다.

import type { ContentModerationStatus } from "./bambi-content-status";
import { MEMBER_GRADE_ANCHOR_ACTION } from "./bambi-member-grade-policy";
import { TEST_ACCOUNT_AUDIT_ACTION } from "./bambi-test-account-policy";

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
	[TEST_ACCOUNT_AUDIT_ACTION]: "가계정 생성",
	[MEMBER_GRADE_ANCHOR_ACTION]: "등급 기준 변경",
	"set_status:active": "정상 복구",
	"set_status:warned": "경고",
	"set_status:suspended": "이용 정지",
	"set_role:legal_advisor": "법률자문 지정",
	"set_role:job_seeker": "법률자문 해제",
	restore_account: "탈퇴 복구",
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

const USER_GENDER_LABELS: Record<string, string> = {
	female: "여성",
	male: "남성",
};

export function userGenderLabel(gender: string): string {
	return USER_GENDER_LABELS[gender] ?? "성별 확인 필요";
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

// 신고 사유·대상 한국어 라벨. my-reports-screen·운영자 콘솔·커뮤니티 상세가 공유한다.
// enum 값은 moderation targetTypeSchema/reportReasonSchema와 일치해야 한다.

export type ReportReason =
	| "illegal_or_prohibited_content"
	| "coercion_or_safety"
	| "underage_concern"
	| "scam_or_fraud"
	| "harassment"
	| "misleading_job_information"
	| "other";

export type ReportTargetType =
	| "job_post"
	| "chat_room"
	| "chat_message"
	| "review"
	| "user"
	| "community_post"
	| "community_comment";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
	illegal_or_prohibited_content: "불법·금지 콘텐츠",
	coercion_or_safety: "강요·안전 위협",
	underage_concern: "미성년 의심",
	scam_or_fraud: "사기·기만",
	harassment: "괴롭힘",
	misleading_job_information: "허위 공고 정보",
	other: "기타",
};

export const REPORT_TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
	job_post: "공고",
	chat_room: "채팅방",
	chat_message: "채팅 메시지",
	review: "후기",
	user: "사용자",
	community_post: "커뮤니티 글",
	community_comment: "커뮤니티 댓글",
};

// 서버는 TS 유니온 밖의 문자열을 런타임에 내려줄 수 있다(브랜치 간 enum 확장 시점 차이).
// 아래 두 헬퍼는 string을 받아 알 수 없는 값에도 중립 폴백("기타")을 반환한다
// — 화면에 DB enum 원값이 그대로 노출되는 것을 막는다.
export function targetTypeLabel(targetType: string): string {
	return REPORT_TARGET_TYPE_LABELS[targetType as ReportTargetType] ?? "기타";
}

export function reportReasonLabel(reason: string): string {
	return REPORT_REASON_LABELS[reason as ReportReason] ?? "기타";
}

// 사유 길이. 서버 스키마(min(2).max(500))와 일치시킨다.
export const MODERATION_REASON_MIN = 2;
export const MODERATION_REASON_MAX = 500;

// 신고 심각도. 안전 직결 사유의 미처리 신고만 높음, 그 외 미처리는 중간, 종료는 참고.
export type ReportSeverity = "high" | "low" | "mid";
export const REPORT_SEVERITY_LABELS: Record<ReportSeverity, string> = {
	high: "높음",
	low: "참고",
	mid: "중간",
};
const HIGH_SEVERITY_REPORT_REASONS = new Set<string>([
	"illegal_or_prohibited_content",
	"coercion_or_safety",
	"underage_concern",
]);
export const OPEN_REPORT_STATUSES = new Set<string>(["open", "reviewing"]);
export function getReportSeverity(
	reason: string,
	status: string
): ReportSeverity {
	if (!OPEN_REPORT_STATUSES.has(status)) {
		return "low";
	}
	return HIGH_SEVERITY_REPORT_REASONS.has(reason) ? "high" : "mid";
}
export const REPORT_STATUS_LABELS: Record<string, string> = {
	open: "접수",
	reviewing: "검토 중",
	resolved: "조치 완료",
	dismissed: "기각",
};
export function reportStatusLabel(status: string): string {
	return REPORT_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 검수 위험도. 무조건 검수 체제라 감지 0건이 다수 — 감지 유무로만 가른다(web과 동일).
export type QueueRiskLevel = "low" | "mid";
export const QUEUE_RISK_LABELS: Record<QueueRiskLevel, string> = {
	low: "감지 없음",
	mid: "감지됨",
};
export function resolveQueueRiskLevel(
	detectedTerms: readonly string[]
): QueueRiskLevel {
	return detectedTerms.length > 0 ? "mid" : "low";
}

// 판정 → 상태·기본 사유·프리셋. web VerdictReasonSheet/QUEUE_VERDICT_STATUS와 같은 문구.
export type QueueVerdict = "approve" | "hold" | "reject";
export interface QueueVerdictConfig {
	confirmLabel: string;
	danger: boolean;
	defaultReason: string;
	description: string;
	label: string;
	reasons: readonly string[];
	status: "on_hold" | "published" | "rejected";
	title: string;
	toast: string;
}
export const QUEUE_VERDICTS: Record<QueueVerdict, QueueVerdictConfig> = {
	approve: {
		confirmLabel: "승인하기",
		danger: false,
		defaultReason: "운영자가 공고를 승인했습니다.",
		description:
			"승인하면 무료 공고는 바로 게시되고, 유료 상품 공고는 입금 확인 후 게시돼요. 사유는 처리 기록에 남아요.",
		label: "승인",
		reasons: [
			"운영 검수 기준 충족",
			"감지 표현이 오해 소지 수준",
			"업소 정보 확인 완료",
			"보완 요청 반영 확인",
			"기타 승인 사유",
		],
		status: "published",
		title: "승인 사유 작성",
		toast: "공고를 승인했어요",
	},
	hold: {
		confirmLabel: "보류하기",
		danger: false,
		defaultReason: "운영자가 추가 확인을 위해 공고를 보류했습니다.",
		description:
			"보류하면 공고가 검수 보류 상태로 내려가고, 사유가 기록돼요. 공고 관리의 '검수 보류' 탭에서 다시 처리할 수 있어요.",
		label: "보류",
		reasons: [
			"업소 정보 추가 확인 필요",
			"사업자 인증 확인 필요",
			"공고 내용 보완 요청 예정",
			"내부 논의 필요",
			"기타 확인 필요",
		],
		status: "on_hold",
		title: "보류 사유 작성",
		toast: "공고를 보류했어요",
	},
	reject: {
		confirmLabel: "반려하기",
		danger: true,
		defaultReason: "운영자가 정책 위반으로 공고를 반려했습니다.",
		description: "작성한 사유는 처리 기록에 그대로 남아요.",
		label: "반려",
		reasons: [
			"성적 서비스 암시 표현",
			"강요·착취 의심 조건",
			"외부 연락 유도",
			"허위·과장 정보",
			"기타 정책 위반",
		],
		status: "rejected",
		title: "반려 사유 작성",
		toast: "공고를 반려했어요",
	},
};

// 신고 처리 기본 사유·토스트.
export const REPORT_DISMISS_DEFAULT_REASON = "운영자가 신고를 기각했습니다.";
export const REPORT_RESOLVE_DEFAULT_REASON =
	"운영자가 신고 조치를 완료했습니다.";
export const REPORT_TOASTS = {
	dismissed: "신고를 기각했어요",
	resolved: "조치를 적용했어요",
	failed: "신고 상태를 API에 반영하지 못했어요. 다시 시도해 주세요.",
} as const;

// 사용자 제재. status는 account_status enum.
export type SanctionStatus = "suspended" | "warned";
export interface SanctionChoice {
	danger: boolean;
	defaultReason: string;
	description: string;
	label: string;
	status: SanctionStatus;
}
export const SANCTION_CHOICES: readonly SanctionChoice[] = [
	{
		danger: false,
		defaultReason: "정책 안내와 함께 경고를 보냈어요",
		description:
			"정책 안내와 함께 경고를 기록해요. 누적 시 이용이 제한될 수 있어요.",
		label: "경고",
		status: "warned",
	},
	{
		danger: true,
		defaultReason: "정책 위반이 확인되어 이용을 정지했어요",
		description: "즉시 이용이 정지돼요. 자동 해제는 없어요.",
		label: "정지",
		status: "suspended",
	},
];
export const USER_RESTORE_ACTIVE_REASON = "계정을 정상으로 복구했어요";
export const WARNING_REVERT_DEFAULT_REASON =
	"운영자가 잘못 부여된 최근 경고를 되돌렸습니다.";
export const ACCOUNT_RESTORE_DEFAULT_REASON = "본인 요청으로 탈퇴를 되돌렸어요";
export const LEGAL_ADVISOR_ASSIGN_REASON =
	"무료 법률 자문 답변을 맡기려고 지정했어요";
export const LEGAL_ADVISOR_RELEASE_REASON =
	"법률 자문 활동이 끝나 지정을 해제했어요";
export const USER_TOASTS = {
	failed: "사용자 상태를 API에 반영하지 못했어요. 다시 시도해 주세요.",
	legalAdvisorAssigned: "법률자문으로 지정했어요",
	legalAdvisorReleased: "법률자문 지정을 해제했어요",
	restored: "탈퇴를 복구했어요. 본인이 기존 아이디로 다시 로그인할 수 있어요",
	warningReverted: "최근 경고 1회를 되돌렸어요",
} as const;

// 사용자 목록 상태 필터. deleted는 탈퇴 여부, 나머지는 미탈퇴 + status 일치.
export type UserStatusFilter =
	| "active"
	| "all"
	| "deleted"
	| "suspended"
	| "warned";
export const USER_STATUS_FILTER_LABELS: Record<UserStatusFilter, string> = {
	active: "정상",
	all: "전체",
	deleted: "탈퇴",
	suspended: "정지",
	warned: "경고",
};
export function matchesUserStatusFilter(
	user: { deletedAt: Date | null | string; status: string },
	filter: UserStatusFilter
): boolean {
	if (filter === "all") {
		return true;
	}
	if (filter === "deleted") {
		return user.deletedAt !== null;
	}
	return user.deletedAt === null && user.status === filter;
}

// 커뮤니티 글·댓글 상태별 조치. 상태 유니온은 서버 전이 규칙(bambi-content-status)과 공유한다.
export type CommunityContentStatus = ContentModerationStatus;
export const CONTENT_STATUS_LABELS: Record<CommunityContentStatus, string> = {
	deleted: "삭제됨",
	hidden: "숨김",
	published: "게시중",
};
export interface CommunityAction {
	confirm: boolean;
	danger: boolean;
	label: string;
	status: CommunityContentStatus;
}
export const COMMUNITY_ACTIONS: Record<
	CommunityContentStatus,
	readonly CommunityAction[]
> = {
	deleted: [
		{ confirm: false, danger: false, label: "복구", status: "published" },
	],
	hidden: [
		{ confirm: false, danger: false, label: "복구", status: "published" },
		{ confirm: true, danger: true, label: "삭제", status: "deleted" },
	],
	published: [
		{ confirm: false, danger: false, label: "숨기기", status: "hidden" },
		{ confirm: true, danger: true, label: "삭제", status: "deleted" },
	],
};
export function communityActionToast(
	kind: "comment" | "post",
	status: CommunityContentStatus
): string {
	const noun = kind === "post" ? "글을" : "댓글을";
	if (status === "published") {
		return "복구했어요.";
	}
	return status === "hidden" ? `${noun} 숨겼어요.` : `${noun} 삭제했어요.`;
}
export const CHAT_ROOM_BLOCK_TOASTS = {
	blocked: "대화방을 차단했어요",
	failed: "대화방 차단 상태를 반영하지 못했어요. 다시 시도해 주세요.",
	unblocked: "대화방 차단을 해제했어요",
} as const;

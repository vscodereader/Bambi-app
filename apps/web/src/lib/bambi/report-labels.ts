// 신고 사유·대상 한국어 라벨. my-reports-screen·운영자 콘솔·커뮤니티 상세가 공유한다.
// enum 값은 packages/api moderation targetTypeSchema/reportReasonSchema와 일치해야 한다.

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

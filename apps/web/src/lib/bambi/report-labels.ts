// 밤비 — 신고 대상 타입(targetType)의 한글 표시 라벨.
// 현재 브랜치 스키마의 유니온은 5종(job_post·chat_room·chat_message·review·user)이지만,
// 다른 브랜치(community)에서 생성된 community_post·community_comment 신고 row가 dev DB에
// 실존한다. 서버가 TS 유니온 밖의 문자열을 런타임에 내려줄 수 있으므로 string을 받아
// 알 수 없는 값에도 안전한 중립 폴백("기타")을 반환한다(enum 원값 노출 금지).
const TARGET_TYPE_LABELS: Record<string, string> = {
	job_post: "공고",
	chat_room: "채팅방",
	chat_message: "채팅 메시지",
	review: "후기",
	user: "사용자",
	community_post: "커뮤니티 글",
	community_comment: "커뮤니티 댓글",
};

export function targetTypeLabel(targetType: string): string {
	return TARGET_TYPE_LABELS[targetType] ?? "기타";
}

// 밤비 — 신고 사유(reason)의 한글 표시 라벨.
// 서버 enum 7종(illegal_or_prohibited_content 등)이 운영자 화면에 원값으로 노출되던 것을
// 구직자 신고 폼과 일관된 한글 명칭으로 바꾼다. targetTypeLabel과 동일하게 string을 받아
// 목록에 없는 값에도 중립 폴백("기타")을 반환한다(enum 원값 노출 금지).
const REPORT_REASON_LABELS: Record<string, string> = {
	illegal_or_prohibited_content: "불법·금지 콘텐츠",
	coercion_or_safety: "강요·안전 위협",
	underage_concern: "미성년 관련",
	scam_or_fraud: "허위 공고·사기",
	misleading_job_information: "잘못된 채용 정보",
	harassment: "괴롭힘·혐오 표현",
	other: "기타",
};

export function reportReasonLabel(reason: string): string {
	return REPORT_REASON_LABELS[reason] ?? "기타";
}

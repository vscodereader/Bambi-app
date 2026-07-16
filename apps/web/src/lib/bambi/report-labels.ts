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

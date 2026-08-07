/**
 * 알림 수신자 후보 정리. 이벤트마다 흩어져 있던 세 규칙을 한 곳에 모은다:
 * 1) null/undefined 제거 — 게스트 작성분·탈퇴로 사라진 작성자는 수신자가 없다(조용히 생략).
 * 2) 중복 제거 — 대댓글에서 글 작성자와 부모 댓글 작성자가 같은 사람이면 알림도 하나다.
 * 3) 행위자 본인 제거 — 내가 한 일을 나에게 알리지 않는다(운영자가 자기 글을 숨기는 경우 포함).
 */
export const resolveNotificationRecipients = (
	candidates: readonly (null | string | undefined)[],
	actorUserId: string
): string[] => {
	const recipients = new Set<string>();

	for (const candidate of candidates) {
		if (candidate && candidate !== actorUserId) {
			recipients.add(candidate);
		}
	}

	return [...recipients];
};

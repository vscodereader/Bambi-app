/**
 * 채팅방 참여 상태(회원별 소프트삭제) 판정. DB에 붙지 않고 방 row만 보고 답한다.
 *
 * 어느 한쪽이라도 "나가기"를 누르면 방은 양쪽 모두에게서 사라진다 — 되살리는 경로는
 * 없고(부활 장치 폐기), 공고에서 다시 문의하면 새 방을 판다. 그래서 "누가 나갔는지"가
 * 아니라 "이 방이 살아 있는지"만 판정하면 된다.
 */

export interface ChatRoomParticipation {
	employerDeletedAt: Date | null;
	employerUserId: string;
	jobSeekerUserId: string;
	seekerDeletedAt: Date | null;
}

export type ChatRoomSide = "employer" | "seeker";

/**
 * 방에서 이 사용자가 어느 쪽인지. 구인자 id가 아니면 구직자로 본다
 * (방 조회 가드가 참여자만 통과시키므로 제3자는 여기까지 오지 않는다).
 */
export const getChatRoomSide = (
	room: Pick<ChatRoomParticipation, "employerUserId">,
	actorUserId: string
): ChatRoomSide =>
	room.employerUserId === actorUserId ? "employer" : "seeker";

/** 어느 한쪽이라도 나간 방인가. 나간 방은 양쪽 모두에게 "없는 방"이다. */
export const isChatRoomLeftByAnyone = (
	room: Pick<ChatRoomParticipation, "employerDeletedAt" | "seekerDeletedAt">
): boolean => Boolean(room.employerDeletedAt || room.seekerDeletedAt);

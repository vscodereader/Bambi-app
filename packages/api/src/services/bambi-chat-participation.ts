/**
 * 채팅방 참여 상태(회원별 소프트삭제) 판정. DB에 붙지 않고 방 row만 보고 답한다.
 *
 * 발신은 한쪽이 "나가기"로 지운 방도 막지 않는다 — 전송이 곧 방 부활이라
 * (getChatRoomReviveFields) 양쪽 목록에 방이 다시 뜬다. 나갔다는 사실을 상대에게
 * 드러내지 않는 것이 정책이므로, "상대가 나갔는지"를 판정하는 함수는 두지 않는다.
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

/** 어느 한쪽이라도 나간 방인가. 부활이 필요한지 판단하는 데만 쓴다. */
export const isChatRoomLeftByAnyone = (
	room: Pick<ChatRoomParticipation, "employerDeletedAt" | "seekerDeletedAt">
): boolean => Boolean(room.employerDeletedAt || room.seekerDeletedAt);

/**
 * 방을 부활시킬 때 되돌릴 컬럼 — **양쪽 모두**다.
 *
 * 방 안 발신(sendMessage 등)과 공고에서의 재문의(startFromJobPost)가 같은 규칙을 쓴다.
 * 공고×구직자 유니크 제약 때문에 새 방을 팔 수 없기도 하다.
 */
export const getChatRoomReviveFields = (): {
	employerDeletedAt: null;
	seekerDeletedAt: null;
} => ({ employerDeletedAt: null, seekerDeletedAt: null });

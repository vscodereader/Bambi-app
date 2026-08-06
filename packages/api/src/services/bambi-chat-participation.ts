/**
 * 채팅방 참여 상태(회원별 소프트삭제) 판정. DB에 붙지 않고 방 row만 보고 답한다.
 *
 * 예전에는 메시지를 보낼 때마다 양쪽 deletedAt을 모두 NULL로 되돌려, 상대가 "나가기"로
 * 지운 방을 발신자가 마음대로 되살릴 수 있었다. 나간 쪽 의사를 지우지 않으려면
 * (1) 상대가 나갔는지, (2) 되살릴 수 있는 건 누구의 컬럼인지를 한 곳에서 판정해야 한다.
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

/** 상대가 이 방을 나갔는가(소프트삭제). 나갔다면 새 내용을 보낼 수 없다. */
export const hasCounterpartLeftChatRoom = (
	room: ChatRoomParticipation,
	actorUserId: string
): boolean =>
	getChatRoomSide(room, actorUserId) === "employer"
		? Boolean(room.seekerDeletedAt)
		: Boolean(room.employerDeletedAt);

/**
 * 발신 시 되돌릴 소프트삭제 컬럼. **보낸 사람 본인 것만** NULL로 돌려 "내가 지웠던 방에
 * 내가 다시 보내면 내 목록에만 돌아오게" 한다. 상대 컬럼은 절대 건드리지 않는다.
 */
export const getSenderRoomRestoreFields = (
	room: Pick<ChatRoomParticipation, "employerUserId">,
	actorUserId: string
): { employerDeletedAt: null } | { seekerDeletedAt: null } =>
	getChatRoomSide(room, actorUserId) === "employer"
		? { employerDeletedAt: null }
		: { seekerDeletedAt: null };

/** 어느 한쪽이라도 나간 방인가. 부활이 필요한지 판단하는 데만 쓴다. */
export const isChatRoomLeftByAnyone = (
	room: Pick<ChatRoomParticipation, "employerDeletedAt" | "seekerDeletedAt">
): boolean => Boolean(room.employerDeletedAt || room.seekerDeletedAt);

/**
 * 재문의(공고에서 채팅 다시 걸기)로 기존 방을 재사용할 때 되돌릴 컬럼 — **양쪽 모두**다.
 *
 * 방 안에서의 일반 발신(getSenderRoomRestoreFields)과 다른 유일한 경로다. 방 안 발신은
 * "상대가 나갔다"를 존중해 막지만, 공고에서 다시 문의를 거는 행위는 명시적인 새 대화
 * 의도라 양쪽 목록에 방을 되돌린다(유니크 제약 때문에 새 방을 팔 수 없기도 하다).
 */
export const getChatRoomReviveFields = (): {
	employerDeletedAt: null;
	seekerDeletedAt: null;
} => ({ employerDeletedAt: null, seekerDeletedAt: null });

import { describe, expect, it } from "vitest";

import {
	type ChatRoomParticipation,
	getChatRoomReviveFields,
	getChatRoomSide,
	isChatRoomLeftByAnyone,
} from "./bambi-chat-participation";

const createRoom = (
	overrides: Partial<ChatRoomParticipation> = {}
): ChatRoomParticipation => ({
	employerDeletedAt: null,
	employerUserId: "employer-1",
	jobSeekerUserId: "seeker-1",
	seekerDeletedAt: null,
	...overrides,
});

const leftAt = new Date("2026-08-01T09:00:00.000Z");

describe("채팅방 참여 판정", () => {
	it("방에서 사용자가 어느 쪽인지 가른다", () => {
		const room = createRoom();

		expect(getChatRoomSide(room, "employer-1")).toBe("employer");
		expect(getChatRoomSide(room, "seeker-1")).toBe("seeker");
	});
});

describe("발신·재문의 시 방 부활", () => {
	it("한쪽이라도 나갔으면 부활 대상으로 본다", () => {
		expect(isChatRoomLeftByAnyone(createRoom())).toBe(false);
		expect(
			isChatRoomLeftByAnyone(createRoom({ employerDeletedAt: leftAt }))
		).toBe(true);
		expect(
			isChatRoomLeftByAnyone(createRoom({ seekerDeletedAt: leftAt }))
		).toBe(true);
	});

	// 발신도 재문의도 같은 규칙이다 — 보낸 사람 컬럼만 되돌리던 옛 정책은 철회됐다.
	it("양쪽 소프트삭제를 모두 되돌린다", () => {
		expect(getChatRoomReviveFields()).toEqual({
			employerDeletedAt: null,
			seekerDeletedAt: null,
		});
	});

	it("호출마다 새 객체를 준다(공유 객체 변조 방지)", () => {
		expect(getChatRoomReviveFields()).not.toBe(getChatRoomReviveFields());
	});
});

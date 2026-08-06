import { describe, expect, it } from "vitest";

import {
	type ChatRoomParticipation,
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

describe("나간 방 판정", () => {
	// 한쪽만 나가도 방은 양쪽 모두에게서 사라진다 — 방 로드 가드가 이 값으로 끊는다.
	it("어느 한쪽이라도 나갔으면 없는 방으로 본다", () => {
		expect(isChatRoomLeftByAnyone(createRoom())).toBe(false);
		expect(
			isChatRoomLeftByAnyone(createRoom({ employerDeletedAt: leftAt }))
		).toBe(true);
		expect(
			isChatRoomLeftByAnyone(createRoom({ seekerDeletedAt: leftAt }))
		).toBe(true);
	});
});

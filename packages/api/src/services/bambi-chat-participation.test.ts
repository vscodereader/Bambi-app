import { describe, expect, it } from "vitest";

import {
	type ChatRoomParticipation,
	getChatRoomReviveFields,
	getChatRoomSide,
	getSenderRoomRestoreFields,
	hasCounterpartLeftChatRoom,
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

	it("양쪽 다 남아 있으면 상대가 나간 것으로 보지 않는다", () => {
		const room = createRoom();

		expect(hasCounterpartLeftChatRoom(room, "employer-1")).toBe(false);
		expect(hasCounterpartLeftChatRoom(room, "seeker-1")).toBe(false);
	});

	it("구직자가 나간 방은 구인자에게만 '상대가 나감'이다", () => {
		const room = createRoom({ seekerDeletedAt: leftAt });

		expect(hasCounterpartLeftChatRoom(room, "employer-1")).toBe(true);
		// 내가 지운 방은 내가 다시 보낼 수 있어야 한다(내 목록만 복원).
		expect(hasCounterpartLeftChatRoom(room, "seeker-1")).toBe(false);
	});

	it("구인자가 나간 방은 구직자에게만 '상대가 나감'이다", () => {
		const room = createRoom({ employerDeletedAt: leftAt });

		expect(hasCounterpartLeftChatRoom(room, "seeker-1")).toBe(true);
		expect(hasCounterpartLeftChatRoom(room, "employer-1")).toBe(false);
	});
});

describe("발신 시 소프트삭제 복원 범위", () => {
	it("구인자가 보내면 구인자 컬럼만 되돌린다", () => {
		expect(getSenderRoomRestoreFields(createRoom(), "employer-1")).toEqual({
			employerDeletedAt: null,
		});
	});

	it("구직자가 보내면 구직자 컬럼만 되돌린다", () => {
		expect(getSenderRoomRestoreFields(createRoom(), "seeker-1")).toEqual({
			seekerDeletedAt: null,
		});
	});

	it("상대가 나간 흔적(deletedAt)은 복원 대상에 들어가지 않는다", () => {
		const room = createRoom({ seekerDeletedAt: leftAt });

		expect(getSenderRoomRestoreFields(room, "employer-1")).not.toHaveProperty(
			"seekerDeletedAt"
		);
	});
});

describe("재문의 시 방 부활", () => {
	it("한쪽이라도 나갔으면 부활 대상으로 본다", () => {
		expect(isChatRoomLeftByAnyone(createRoom())).toBe(false);
		expect(
			isChatRoomLeftByAnyone(createRoom({ employerDeletedAt: leftAt }))
		).toBe(true);
		expect(
			isChatRoomLeftByAnyone(createRoom({ seekerDeletedAt: leftAt }))
		).toBe(true);
	});

	// 방 안 발신과 갈라지는 지점. 발신은 본인 컬럼만, 재문의는 양쪽을 되돌린다.
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

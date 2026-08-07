import { describe, expect, it } from "vitest";

import {
	buildBambiNotificationValues,
	hasExactlyOneRecipient,
} from "./bambi-notifications";

const base = {
	actorUserId: "user_actor",
	targetId: "target-1",
	targetType: "job_post" as const,
};

describe("hasExactlyOneRecipient", () => {
	it("개인 수신자만 있으면 통과한다", () => {
		expect(
			hasExactlyOneRecipient({ ...base, recipientUserId: "user_owner" })
		).toBe(true);
	});

	it("역할 공유 수신만 있으면 통과한다", () => {
		expect(hasExactlyOneRecipient({ ...base, recipientRole: "admin" })).toBe(
			true
		);
	});

	it("둘 다 비면 거부한다(수신자 해석 실패는 조용히 생략된다)", () => {
		expect(hasExactlyOneRecipient(base)).toBe(false);
		expect(hasExactlyOneRecipient({ ...base, recipientUserId: null })).toBe(
			false
		);
	});

	it("둘 다 채우면 거부한다(DB CHECK 위반 전에 막는다)", () => {
		expect(
			hasExactlyOneRecipient({
				...base,
				recipientRole: "admin",
				recipientUserId: "user_owner",
			})
		).toBe(false);
	});
});

describe("buildBambiNotificationValues", () => {
	it("개인 수신 행은 recipient_role을 비운다", () => {
		expect(
			buildBambiNotificationValues({
				...base,
				metadata: { action: "set_status:rejected", reason: "사진 미비" },
				recipientUserId: "user_owner",
			})
		).toEqual({
			actorUserId: "user_actor",
			chatRoomId: null,
			metadata: { action: "set_status:rejected", reason: "사진 미비" },
			recipientRole: null,
			recipientUserId: "user_owner",
			targetId: "target-1",
			targetType: "job_post",
		});
	});

	it("역할 공유 행은 recipient_user_id를 비우고 metadata 기본값은 빈 객체다", () => {
		expect(
			buildBambiNotificationValues({ ...base, recipientRole: "admin" })
		).toEqual({
			actorUserId: "user_actor",
			chatRoomId: null,
			metadata: {},
			recipientRole: "admin",
			recipientUserId: null,
			targetId: "target-1",
			targetType: "job_post",
		});
	});
});

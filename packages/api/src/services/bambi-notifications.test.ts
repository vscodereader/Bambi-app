import { describe, expect, it } from "vitest";

import { buildBambiNotificationValues } from "./bambi-notifications";

describe("bambi notifications", () => {
	it("builds safe chat notification values without message body or contact data", () => {
		const values = buildBambiNotificationValues({
			actorUserId: "sender-1",
			chatRoomId: "room-1",
			recipientUserId: "recipient-1",
			targetId: "message-1",
			targetType: "chat_message",
		});

		expect(values).toMatchObject({
			actorUserId: "sender-1",
			chatRoomId: "room-1",
			recipientUserId: "recipient-1",
			targetId: "message-1",
			targetType: "chat_message",
		});
		expect(values.metadata).toEqual({ source: "chat" });
		expect(JSON.stringify(values)).not.toContain("body");
		expect(JSON.stringify(values)).not.toContain("contact");
		expect(JSON.stringify(values)).not.toContain("location");
	});
});

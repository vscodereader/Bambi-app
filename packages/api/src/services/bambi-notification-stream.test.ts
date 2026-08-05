import { afterEach, describe, expect, it, vi } from "vitest";

import {
	BAMBI_NOTIFICATION_SSE_EVENT,
	type BambiNotificationEvent,
	configureBambiNotificationStream,
	emitBambiNotification,
	formatBambiSseFrame,
	getBambiNotificationSubscriberCount,
	registerBambiNotificationSubscriber,
	resetBambiNotificationStreamForTests,
	serializeBambiNotificationEvent,
	unregisterBambiNotificationSubscriber,
} from "./bambi-notification-stream";

const buildEvent = (
	overrides: Partial<BambiNotificationEvent> = {}
): BambiNotificationEvent => ({
	chatRoomId: "room-1",
	createdAt: "2026-08-05T00:00:00.000Z",
	notificationId: "notification-1",
	targetId: "message-1",
	targetType: "chat_message",
	...overrides,
});

afterEach(() => {
	resetBambiNotificationStreamForTests();
});

describe("bambi notification stream registry", () => {
	it("delivers an event to every stream of the recipient only", () => {
		const firstTab = vi.fn();
		const secondTab = vi.fn();
		const otherUser = vi.fn();

		registerBambiNotificationSubscriber({
			send: firstTab,
			subscriberId: "sub-1",
			userId: "user-1",
		});
		registerBambiNotificationSubscriber({
			send: secondTab,
			subscriberId: "sub-2",
			userId: "user-1",
		});
		registerBambiNotificationSubscriber({
			send: otherUser,
			subscriberId: "sub-3",
			userId: "user-2",
		});

		const event = buildEvent();
		const delivered = emitBambiNotification("user-1", event);

		expect(delivered).toBe(2);
		expect(firstTab).toHaveBeenCalledWith(event);
		expect(secondTab).toHaveBeenCalledWith(event);
		expect(otherUser).not.toHaveBeenCalled();
	});

	it("stops delivering after unregister and drops the empty user bucket", () => {
		const send = vi.fn();

		registerBambiNotificationSubscriber({
			send,
			subscriberId: "sub-1",
			userId: "user-1",
		});
		expect(getBambiNotificationSubscriberCount("user-1")).toBe(1);

		unregisterBambiNotificationSubscriber({
			subscriberId: "sub-1",
			userId: "user-1",
		});

		expect(getBambiNotificationSubscriberCount("user-1")).toBe(0);
		expect(emitBambiNotification("user-1", buildEvent())).toBe(0);
		expect(send).not.toHaveBeenCalled();
	});

	it("ignores unregister calls for unknown users or subscribers", () => {
		expect(() =>
			unregisterBambiNotificationSubscriber({
				subscriberId: "missing",
				userId: "ghost",
			})
		).not.toThrow();
	});

	it("emits nothing when the recipient has no open stream", () => {
		expect(emitBambiNotification("user-1", buildEvent())).toBe(0);
	});

	it("keeps delivering when one subscriber throws and reports it to the logger", () => {
		const failing = vi.fn(() => {
			throw new Error("socket closed");
		});
		const healthy = vi.fn();
		const error = vi.fn();

		configureBambiNotificationStream({ error });
		registerBambiNotificationSubscriber({
			send: failing,
			subscriberId: "sub-1",
			userId: "user-1",
		});
		registerBambiNotificationSubscriber({
			send: healthy,
			subscriberId: "sub-2",
			userId: "user-1",
		});

		expect(emitBambiNotification("user-1", buildEvent())).toBe(1);
		expect(healthy).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledTimes(1);
	});

	it("clears subscribers and logger on reset", () => {
		registerBambiNotificationSubscriber({
			send: vi.fn(),
			subscriberId: "sub-1",
			userId: "user-1",
		});

		resetBambiNotificationStreamForTests();

		expect(getBambiNotificationSubscriberCount("user-1")).toBe(0);
	});
});

describe("bambi sse serialization", () => {
	it("writes an id, event name and a blank-line terminated data frame", () => {
		const frame = serializeBambiNotificationEvent(buildEvent());

		expect(frame).toBe(
			`id: notification-1\nevent: ${BAMBI_NOTIFICATION_SSE_EVENT}\ndata: ${JSON.stringify(
				buildEvent()
			)}\n\n`
		);
		expect(frame.endsWith("\n\n")).toBe(true);
	});

	it("carries no message body or contact data", () => {
		const frame = serializeBambiNotificationEvent(buildEvent());

		expect(frame).not.toContain("body");
		expect(frame).not.toContain("contact");
		expect(frame).not.toContain("phone");
	});

	it("re-opens the data field for every line so multiline payloads stay valid", () => {
		const frame = formatBambiSseFrame({
			data: "first\nsecond",
			event: "demo",
		});

		expect(frame).toBe("event: demo\ndata: first\ndata: second\n\n");
	});

	it("omits the id line when no id is given", () => {
		expect(formatBambiSseFrame({ data: "{}", event: "demo" })).not.toContain(
			"id:"
		);
	});
});

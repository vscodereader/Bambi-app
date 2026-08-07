import { afterEach, describe, expect, it, vi } from "vitest";

import {
	BAMBI_HEARTBEAT_SSE_EVENT,
	BAMBI_MAX_STREAMS_PER_USER,
	BAMBI_NOTIFICATION_SSE_EVENT,
	BAMBI_SSE_HEARTBEAT_FRAME,
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
	action: null,
	chatRoomId: "room-1",
	createdAt: "2026-08-05T00:00:00.000Z",
	notificationId: "notification-1",
	recipientRole: null,
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

	it("keeps a per-user stream cap by closing the oldest stream", () => {
		const closes = Array.from({ length: BAMBI_MAX_STREAMS_PER_USER + 1 }, () =>
			vi.fn()
		);

		for (const [index, close] of closes.entries()) {
			const evicted = registerBambiNotificationSubscriber({
				close,
				send: vi.fn(),
				subscriberId: `sub-${index}`,
				userId: "user-1",
			});

			expect(evicted).toBe(index < BAMBI_MAX_STREAMS_PER_USER ? 0 : 1);
		}

		expect(getBambiNotificationSubscriberCount("user-1")).toBe(
			BAMBI_MAX_STREAMS_PER_USER
		);
		expect(closes[0]).toHaveBeenCalledTimes(1);
		expect(closes.at(-1)).not.toHaveBeenCalled();
	});

	// 밀어내기 콜백은 결국 unregister를 다시 부른다(스트림 종료 정리). 재진입해도 안전해야 한다.
	it("survives an eviction callback that unregisters itself", () => {
		for (let index = 0; index <= BAMBI_MAX_STREAMS_PER_USER; index += 1) {
			const subscriberId = `sub-${index}`;

			registerBambiNotificationSubscriber({
				close: () =>
					unregisterBambiNotificationSubscriber({
						subscriberId,
						userId: "user-1",
					}),
				send: vi.fn(),
				subscriberId,
				userId: "user-1",
			});
		}

		expect(getBambiNotificationSubscriberCount("user-1")).toBe(
			BAMBI_MAX_STREAMS_PER_USER
		);
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

	// 문구를 고르는 데 필요한 두 값만 예외로 싣는다 — 없으면 클라이언트가 targetType 폴백만 탄다.
	it("carries the action and shared recipient role", () => {
		const frame = serializeBambiNotificationEvent(
			buildEvent({
				action: "set_status:rejected",
				recipientRole: "admin",
				targetType: "job_post",
			})
		);

		expect(frame).toContain('"action":"set_status:rejected"');
		expect(frame).toContain('"recipientRole":"admin"');
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

	// 주석 프레임(": heartbeat")은 스펙상 클라이언트 핸들러에 보이지 않아 워치독을 걸 수 없다.
	it("sends the heartbeat as an observable named event", () => {
		expect(BAMBI_SSE_HEARTBEAT_FRAME).toBe(
			`event: ${BAMBI_HEARTBEAT_SSE_EVENT}\ndata: {}\n\n`
		);
		expect(BAMBI_SSE_HEARTBEAT_FRAME.startsWith(":")).toBe(false);
		expect(BAMBI_SSE_HEARTBEAT_FRAME.endsWith("\n\n")).toBe(true);
	});
});

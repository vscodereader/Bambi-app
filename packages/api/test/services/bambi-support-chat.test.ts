import { describe, expect, it } from "vitest";

import {
	resolveSupportChatNotificationTarget,
	supportChatSendKeys,
} from "@/services/bambi-support-chat";

describe("supportChatSendKeys", () => {
	it("회원은 계정 한 축", () => {
		expect(
			supportChatSendKeys({ kind: "member", userId: "u1" }, "1.2.3.4")
		).toEqual(["supportChat.send:u1"]);
	});

	it("비회원은 sid·IP 두 축, IP 없으면 unknown", () => {
		expect(
			supportChatSendKeys({ kind: "guest", sid: "s1" }, "1.2.3.4")
		).toEqual(["supportChat.send:sid:s1", "supportChat.send:ip:1.2.3.4"]);
		expect(
			supportChatSendKeys({ kind: "guest", sid: "s1" }, undefined)
		).toEqual(["supportChat.send:sid:s1", "supportChat.send:ip:unknown"]);
	});
});

describe("resolveSupportChatNotificationTarget", () => {
	it("이미 미읽음이 있으면 알림 없음(에지 트리거)", () => {
		expect(
			resolveSupportChatNotificationTarget({
				prevUnreadCount: 1,
				roomUserId: "u1",
				senderType: "inquirer",
			})
		).toBeNull();
	});

	it("문의자 발신 0→1이면 운영자 공유 알림", () => {
		expect(
			resolveSupportChatNotificationTarget({
				prevUnreadCount: 0,
				roomUserId: null,
				senderType: "inquirer",
			})
		).toEqual({ recipientRole: "admin" });
	});

	it("운영자 발신 0→1은 회원 방이면 개인 알림, 비회원 방이면 없음", () => {
		expect(
			resolveSupportChatNotificationTarget({
				prevUnreadCount: 0,
				roomUserId: "u1",
				senderType: "admin",
			})
		).toEqual({ recipientUserId: "u1" });
		expect(
			resolveSupportChatNotificationTarget({
				prevUnreadCount: 0,
				roomUserId: null,
				senderType: "admin",
			})
		).toBeNull();
	});
});

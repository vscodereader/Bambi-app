import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
	isSupportChatRoomEffectivelyClosed,
	resolveSupportChatNotificationTarget,
	SUPPORT_CHAT_AUTO_CLOSE_MS,
	supportChatSendKeys,
} from "@/services/bambi-support-chat";

const supportChatRouterSource = readFileSync(
	new URL("../../src/routers/bambi/support-chat.ts", import.meta.url),
	"utf8"
);

describe("supportChat 이용정지 예외", () => {
	it("구직자와 구인자 모두 활성 상태 가드 없이 운영자 문의를 보낼 수 있다", () => {
		expect(supportChatRouterSource).toContain(
			"requireBambiAccessProfile(context.session)"
		);
		expect(supportChatRouterSource).not.toContain(
			"requireActiveBambiProfile(context.session)"
		);
		expect(supportChatRouterSource).toContain('profile.role === "admin"');
	});
});

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

describe("isSupportChatRoomEffectivelyClosed", () => {
	const now = new Date("2026-08-18T12:00:00Z");
	it("명시 종료(closed)면 최근 메시지가 있어도 종료다", () => {
		expect(
			isSupportChatRoomEffectivelyClosed(
				{ lastMessageAt: now, status: "closed" },
				now
			)
		).toBe(true);
	});
	it("open이라도 마지막 메시지가 7일을 넘기면 종료다", () => {
		const stale = new Date(now.getTime() - SUPPORT_CHAT_AUTO_CLOSE_MS - 1);
		expect(
			isSupportChatRoomEffectivelyClosed(
				{ lastMessageAt: stale, status: "open" },
				now
			)
		).toBe(true);
	});
	it("open이고 7일 이내면 진행 중이다(경계 포함)", () => {
		const edge = new Date(now.getTime() - SUPPORT_CHAT_AUTO_CLOSE_MS);
		expect(
			isSupportChatRoomEffectivelyClosed(
				{ lastMessageAt: edge, status: "open" },
				now
			)
		).toBe(false);
	});
});

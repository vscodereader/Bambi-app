import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { supportChatRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("@/routers/bambi/support-chat"),
	]);

const { user } = authSchema;
const { bambiNotification, bambiProfile, supportChatMessage, supportChatRoom } =
	bambiSchema;
const seededUserIds: string[] = [];
const seededRoomIds: string[] = [];

const createSuspendedMember = async (role: "employer" | "job_seeker") => {
	const userId = `user_test_support_chat_${randomUUID()}`;
	await db.insert(user).values({
		email: `${userId}@bambi.test`,
		id: userId,
		name: `정지 ${role}`,
	});
	await db.insert(bambiProfile).values({ role, status: "suspended", userId });
	seededUserIds.push(userId);
	return userId;
};

const sendAs = async (userId: string, body: string) => {
	const caller = createProcedureClient(supportChatRouter.sendMessage, {
		context: {
			auth: null,
			clientIp: "127.0.0.1",
			session: { user: { id: userId } },
			supportChat: null,
		} as Context,
	});
	const result = await caller({ body });
	seededRoomIds.push(result.roomId);
	return result;
};

afterAll(async () => {
	if (seededUserIds.length) {
		await db
			.delete(bambiNotification)
			.where(inArray(bambiNotification.actorUserId, seededUserIds));
	}
	if (seededRoomIds.length) {
		await db
			.delete(supportChatMessage)
			.where(inArray(supportChatMessage.roomId, seededRoomIds));
		await db
			.delete(supportChatRoom)
			.where(inArray(supportChatRoom.id, seededRoomIds));
	}
	if (seededUserIds.length) {
		await db
			.delete(bambiProfile)
			.where(inArray(bambiProfile.userId, seededUserIds));
		await db.delete(user).where(inArray(user.id, seededUserIds));
	}
});

describe("이용정지 회원 운영자 문의", () => {
	it.each([
		"job_seeker",
		"employer",
	] as const)("이용정지 %s도 새 문의와 첫 메시지를 보낼 수 있다", async (role) => {
		const userId = await createSuspendedMember(role);
		const result = await sendAs(userId, `${role} 운영자 문의 테스트`);

		expect(result.id).toBeTruthy();
		expect(result.roomId).toBeTruthy();
	});
});

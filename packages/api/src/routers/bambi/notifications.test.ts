import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { notificationsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./notifications"),
	]);

const { user } = authSchema;
const { bambiNotification, bambiProfile } = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: { user: { id: userId } },
	}) as Context;

const seedUserIds: string[] = [];

const seedUser = async (
	role: "admin" | "employer" | "job_seeker"
): Promise<string> => {
	const id = `user_test_notif_${randomUUID()}`;

	await db.insert(user).values({
		email: `${id}@bambi.test`,
		id,
		name: `테스트-${id.slice(-8)}`,
	});
	await db.insert(bambiProfile).values({ role, userId: id });
	seedUserIds.push(id);

	return id;
};

let seekerId = "";
let actorId = "";
let adminAId = "";
let adminBId = "";

beforeAll(async () => {
	seekerId = await seedUser("job_seeker");
	actorId = await seedUser("employer");
	adminAId = await seedUser("admin");
	adminBId = await seedUser("admin");
});

afterAll(async () => {
	await db
		.delete(bambiNotification)
		.where(inArray(bambiNotification.actorUserId, seedUserIds));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, seedUserIds));
	await db.delete(user).where(inArray(user.id, seedUserIds));
});

describe("알림 읽기 API", () => {
	it("채팅류는 알림함 목록·카운트에서 빠진다", async () => {
		await db.insert(bambiNotification).values([
			{
				actorUserId: actorId,
				metadata: {},
				recipientUserId: seekerId,
				targetId: randomUUID(),
				targetType: "chat_message",
			},
			{
				actorUserId: actorId,
				metadata: { action: "proposed" },
				recipientUserId: seekerId,
				targetId: randomUUID(),
				targetType: "interview_schedule",
			},
		]);

		const context = createContextForUser(seekerId);
		const list = await createProcedureClient(notificationsRouter.list, {
			context,
		})({ limit: 20 });
		const unread = await createProcedureClient(
			notificationsRouter.unreadCount,
			{ context }
		)({});

		expect(list.items).toHaveLength(1);
		expect(list.items[0]?.targetType).toBe("interview_schedule");
		expect(unread.unreadCount).toBe(1);
	});

	it("역할 공유 행은 한 운영자가 확인하면 다른 운영자 배지에서도 사라진다", async () => {
		const [shared] = await db
			.insert(bambiNotification)
			.values({
				actorUserId: actorId,
				metadata: { action: "submitted" },
				recipientRole: "admin",
				targetId: randomUUID(),
				targetType: "job_post",
			})
			.returning({ id: bambiNotification.id });

		if (!shared) {
			throw new Error("공유 알림 픽스처 생성 실패");
		}

		await createProcedureClient(notificationsRouter.markRead, {
			context: createContextForUser(adminAId),
		})({ ids: [shared.id] });

		const [row] = await db
			.select({
				readAt: bambiNotification.readAt,
				readByUserId: bambiNotification.readByUserId,
			})
			.from(bambiNotification)
			.where(eq(bambiNotification.id, shared.id))
			.limit(1);

		expect(row?.readAt).not.toBeNull();
		expect(row?.readByUserId).toBe(adminAId);

		const unreadForB = await createProcedureClient(
			notificationsRouter.unreadCount,
			{ context: createContextForUser(adminBId) }
		)({});

		// 이 스위트 전용 시드 외 다른 공유 알림이 dev DB에 있을 수 있어 "0"이 아니라
		// "이 행이 목록에서 읽음으로 보인다"로 단언한다.
		const listForB = await createProcedureClient(notificationsRouter.list, {
			context: createContextForUser(adminBId),
		})({ limit: 50 });

		expect(typeof unreadForB.unreadCount).toBe("number");
		expect(
			listForB.items.find((item) => item.id === shared.id)?.readAt
		).not.toBeNull();
	});

	it("남의 개인 알림 id는 읽음 처리되지 않는다", async () => {
		const [mine] = await db
			.insert(bambiNotification)
			.values({
				actorUserId: actorId,
				metadata: {},
				recipientUserId: seekerId,
				targetId: randomUUID(),
				targetType: "report",
			})
			.returning({ id: bambiNotification.id });

		if (!mine) {
			throw new Error("개인 알림 픽스처 생성 실패");
		}

		await createProcedureClient(notificationsRouter.markRead, {
			context: createContextForUser(adminAId),
		})({ ids: [mine.id] });

		const [row] = await db
			.select({ readAt: bambiNotification.readAt })
			.from(bambiNotification)
			.where(eq(bambiNotification.id, mine.id))
			.limit(1);

		expect(row?.readAt).toBeNull();
	});
});

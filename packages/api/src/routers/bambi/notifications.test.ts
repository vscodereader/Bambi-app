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
	role: "admin" | "employer" | "job_seeker" | "legal_advisor"
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
let pagingSeekerId = "";
let actorId = "";
let adminAId = "";
let adminBId = "";
let advisorId = "";

beforeAll(async () => {
	seekerId = await seedUser("job_seeker");
	// 커서 테스트는 "이 사용자에게 정확히 3건"이 성립해야 해서 전용 계정을 쓴다.
	pagingSeekerId = await seedUser("job_seeker");
	actorId = await seedUser("employer");
	adminAId = await seedUser("admin");
	adminBId = await seedUser("admin");
	advisorId = await seedUser("legal_advisor");
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
	it("채팅류(chat_message·chat_room)는 알림함 목록·카운트에서 빠진다", async () => {
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
				metadata: {},
				recipientUserId: seekerId,
				targetId: randomUUID(),
				targetType: "chat_room",
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
		const unreadForB = createProcedureClient(notificationsRouter.unreadCount, {
			context: createContextForUser(adminBId),
		});
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

		// dev DB에 다른 공유 알림이 있어도 성질이 흔들리지 않게 "확인 전후 차이가 정확히 1"로
		// 단언한다(절대값 0/1은 이 스위트 밖 데이터에 좌우된다).
		const beforeForB = await unreadForB({});

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

		const afterForB = await unreadForB({});
		const listForB = await createProcedureClient(notificationsRouter.list, {
			context: createContextForUser(adminBId),
		})({ limit: 50 });

		expect(beforeForB.unreadCount - afterForB.unreadCount).toBe(1);
		expect(
			listForB.items.find((item) => item.id === shared.id)?.readAt
		).not.toBeNull();
	});

	it("다른 역할의 공유 행은 읽음 처리되지 않는다", async () => {
		const [advisorShared] = await db
			.insert(bambiNotification)
			.values({
				actorUserId: actorId,
				metadata: { board: "legal" },
				recipientRole: "legal_advisor",
				targetId: randomUUID(),
				targetType: "community_post",
			})
			.returning({ id: bambiNotification.id });

		if (!advisorShared) {
			throw new Error("법률자문 공유 알림 픽스처 생성 실패");
		}

		await createProcedureClient(notificationsRouter.markRead, {
			context: createContextForUser(adminAId),
		})({ ids: [advisorShared.id] });

		const [row] = await db
			.select({ readAt: bambiNotification.readAt })
			.from(bambiNotification)
			.where(eq(bambiNotification.id, advisorShared.id))
			.limit(1);
		const listForAdmin = await createProcedureClient(notificationsRouter.list, {
			context: createContextForUser(adminAId),
		})({ limit: 50 });

		expect(row?.readAt).toBeNull();
		expect(
			listForAdmin.items.some((item) => item.id === advisorShared.id)
		).toBe(false);
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

	it("커서로 이어 읽으면 누락도 중복도 없다", async () => {
		// created_at을 명시해 총순서를 고정한다(같은 시각이면 id 타이브레이크로 넘어가는데,
		// 커서 왕복이 밀리초로 잘리는 기존 한계에 걸려 테스트가 흔들린다).
		const base = Date.now();
		const seeded = await db
			.insert(bambiNotification)
			.values(
				[0, 1, 2].map((index) => ({
					actorUserId: actorId,
					createdAt: new Date(base - index * 60_000),
					metadata: {},
					recipientUserId: pagingSeekerId,
					targetId: randomUUID(),
					targetType: "job_post" as const,
				}))
			)
			.returning({ id: bambiNotification.id });

		const list = createProcedureClient(notificationsRouter.list, {
			context: createContextForUser(pagingSeekerId),
		});
		const first = await list({ limit: 2 });
		const second = await list({
			cursor: first.nextCursor ?? undefined,
			limit: 2,
		});
		const seenIds = [...first.items, ...second.items].map((item) => item.id);

		expect(first.items).toHaveLength(2);
		expect(first.nextCursor).not.toBeNull();
		expect(second.items).toHaveLength(1);
		expect(second.nextCursor).toBeNull();
		expect(new Set(seenIds).size).toBe(3);
		expect([...seenIds].sort()).toEqual(seeded.map((row) => row.id).sort());
	});

	it("markAllRead는 개인·공유 행을 모두 읽음 처리하고 0을 돌려준다", async () => {
		const inserted = await db
			.insert(bambiNotification)
			.values([
				{
					actorUserId: actorId,
					metadata: {},
					recipientUserId: advisorId,
					targetId: randomUUID(),
					targetType: "report" as const,
				},
				{
					actorUserId: actorId,
					metadata: { board: "legal" },
					recipientRole: "legal_advisor" as const,
					targetId: randomUUID(),
					targetType: "community_post" as const,
				},
			])
			.returning({ id: bambiNotification.id });

		// 이 계정이 볼 수 있는 안 읽은 행을 전부 처리하므로 dev DB에 남아 있던 다른
		// legal_advisor 공유 행도 함께 읽음이 된다(공유 읽음 의미론상 의도된 동작).
		const result = await createProcedureClient(
			notificationsRouter.markAllRead,
			{
				context: createContextForUser(advisorId),
			}
		)({});

		const rows = await db
			.select({
				readAt: bambiNotification.readAt,
				readByUserId: bambiNotification.readByUserId,
			})
			.from(bambiNotification)
			.where(
				inArray(
					bambiNotification.id,
					inserted.map((row) => row.id)
				)
			);

		expect(result.unreadCount).toBe(0);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.readAt).not.toBeNull();
			expect(row.readByUserId).toBe(advisorId);
		}
	});

	it("clearAll은 볼 수 있는 행을 지우고 목록을 비운다", async () => {
		// 공유 행 삭제까지 확인하려면 운영자 계정이 필요한데, 그러면 dev DB의 admin 공유
		// 알림이 통째로 지워진다 — 개인 행만 가진 구직자로 계약(삭제·카운트 0)만 확인한다.
		const clearingSeekerId = await seedUser("job_seeker");
		await db.insert(bambiNotification).values([
			{
				actorUserId: actorId,
				metadata: { action: "proposed" },
				recipientUserId: clearingSeekerId,
				targetId: randomUUID(),
				targetType: "interview_schedule",
			},
			{
				actorUserId: actorId,
				metadata: {},
				readAt: new Date(),
				recipientUserId: clearingSeekerId,
				targetId: randomUUID(),
				targetType: "report",
			},
		]);

		const context = createContextForUser(clearingSeekerId);
		const result = await createProcedureClient(notificationsRouter.clearAll, {
			context,
		})({});
		const list = await createProcedureClient(notificationsRouter.list, {
			context,
		})({ limit: 20 });

		expect(result.unreadCount).toBe(0);
		expect(list.items).toHaveLength(0);
	});
});

import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [
	{ db },
	authSchema,
	bambiSchema,
	{ attendanceRouter },
	{ pointSettingsRouter },
	attendanceService,
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/attendance"),
	import("@/routers/bambi/point-settings"),
	import("@/services/bambi-attendance"),
]);

const { user } = authSchema;
const {
	bambiAttendance,
	bambiNotification,
	bambiPointTransaction,
	bambiProfile,
} = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: { user: { id: userId } },
	}) as Context;

const createUser = async (role: "admin" | "employer" | "job_seeker") => {
	const userId = `user_test_attendance_${randomUUID()}`;
	await db.insert(user).values({
		email: `attendance-${randomUUID()}@bambi.test`,
		id: userId,
		name: "출석 테스트 계정",
	});
	await db
		.insert(bambiProfile)
		.values({ isPhoneVerified: true, role, status: "active", userId });
	return userId;
};

const cleanup = async (userIds: string[]) => {
	await db
		.delete(bambiNotification)
		.where(inArray(bambiNotification.recipientUserId, userIds));
	await db
		.delete(bambiAttendance)
		.where(inArray(bambiAttendance.userId, userIds));
	await db
		.delete(bambiPointTransaction)
		.where(inArray(bambiPointTransaction.userId, userIds));
	await db.delete(bambiProfile).where(inArray(bambiProfile.userId, userIds));
	await db.delete(user).where(inArray(user.id, userIds));
};

describe("bambi attendance router", () => {
	it("두 번 눌러도 행이 하나만 남고 두 번째는 alreadyAttended다", async () => {
		const userId = await createUser("job_seeker");
		const checkIn = createProcedureClient(attendanceRouter.checkIn, {
			context: createContextForUser(userId),
		});

		try {
			const first = await checkIn({});
			const second = await checkIn({});

			expect(first.alreadyAttended).toBe(false);
			expect(second.alreadyAttended).toBe(true);
			expect(second.attendedOn).toBe(attendanceService.getKstDateString());

			const rows = await db
				.select({ attendedOn: bambiAttendance.attendedOn })
				.from(bambiAttendance)
				.where(eq(bambiAttendance.userId, userId));
			expect(rows).toHaveLength(1);
		} finally {
			await cleanup([userId]);
		}
	});

	it("첫 출석에만 10포인트가 적립되고 두 번째 호출은 잔액이 그대로다", async () => {
		const userId = await createUser("job_seeker");
		const checkIn = createProcedureClient(attendanceRouter.checkIn, {
			context: createContextForUser(userId),
		});

		try {
			const first = await checkIn({});
			expect(first.pointsAwarded).toBe(10);
			expect(first.pointBalance).toBe(10);

			const second = await checkIn({});
			expect(second.pointsAwarded).toBe(0);
			expect(second.pointBalance).toBe(10);

			// 원장에도 행이 하나만 쌓여야 한다(잔액은 합산이라 행이 늘면 그대로 새어 나간다).
			const ledger = await db
				.select({ amount: bambiPointTransaction.amount })
				.from(bambiPointTransaction)
				.where(eq(bambiPointTransaction.userId, userId));
			expect(ledger).toEqual([{ amount: 10 }]);

			const mine = await createProcedureClient(attendanceRouter.getMine, {
				context: createContextForUser(userId),
			})({});
			expect(mine.pointBalance).toBe(10);
		} finally {
			await cleanup([userId]);
		}
	});

	it("업소 회원도 출석할 수 있고 운영자는 거부된다", async () => {
		const employerUserId = await createUser("employer");
		const adminUserId = await createUser("admin");

		try {
			await expect(
				createProcedureClient(attendanceRouter.checkIn, {
					context: createContextForUser(employerUserId),
				})({})
			).resolves.toMatchObject({ alreadyAttended: false });

			await expect(
				createProcedureClient(attendanceRouter.checkIn, {
					context: createContextForUser(adminUserId),
				})({})
			).rejects.toThrow();
		} finally {
			await cleanup([employerUserId, adminUserId]);
		}
	});

	it("getMine이 해당 월 출석일·연속·총계를 함께 돌려준다", async () => {
		const userId = await createUser("job_seeker");
		const today = attendanceService.getKstDateString();
		const yesterday = attendanceService.shiftKstDate(today, -1);
		// 연속이 끊긴 과거 기록 하나 — 총계에는 들어가고 연속에는 안 들어가야 한다.
		const longAgo = attendanceService.shiftKstDate(today, -30);

		try {
			await db.insert(bambiAttendance).values([
				{ attendedOn: today, userId },
				{ attendedOn: yesterday, userId },
				{ attendedOn: longAgo, userId },
			]);

			const result = await createProcedureClient(attendanceRouter.getMine, {
				context: createContextForUser(userId),
			})({});

			expect(result.today).toBe(today);
			expect(result.month).toBe(today.slice(0, 7));
			expect(result.checkedInToday).toBe(true);
			expect(result.streakDays).toBe(2);
			expect(result.totalDays).toBe(3);
			expect(result.attendedDates).toContain(today);
			// 다른 달 기록은 이번 달 배열에 섞이지 않는다.
			for (const attendedOn of result.attendedDates) {
				expect(attendedOn.startsWith(result.month)).toBe(true);
			}
		} finally {
			await cleanup([userId]);
		}
	});

	it("adminList가 집계·검색·요약을 함께 돌려준다", async () => {
		const seekerUserId = await createUser("job_seeker");
		const adminUserId = await createUser("admin");
		const today = attendanceService.getKstDateString();

		try {
			await db.insert(bambiAttendance).values([
				{ attendedOn: today, userId: seekerUserId },
				{
					attendedOn: attendanceService.shiftKstDate(today, -1),
					userId: seekerUserId,
				},
			]);

			const result = await createProcedureClient(attendanceRouter.adminList, {
				context: createContextForUser(adminUserId),
			})({ search: "출석 테스트 계정" });

			const row = result.items.find((item) => item.userId === seekerUserId);
			expect(row?.totalDays).toBe(2);
			expect(row?.attendedToday).toBe(true);
			expect(row?.lastAttendedOn).toBe(today);
			expect(row?.idleDays).toBe(0);
			// 원장이 비어도 잔액 칸은 0으로 온다(coalesce).
			expect(row?.pointBalance).toBe(0);
			// 운영자 계정은 출석 대상이 아니라 목록에 없다.
			expect(result.items.some((item) => item.userId === adminUserId)).toBe(
				false
			);
			expect(result.summary.attendedToday).toBeGreaterThanOrEqual(1);
		} finally {
			await cleanup([seekerUserId, adminUserId]);
		}
	});

	it("adminAdjustPoints가 지급·차감을 원장에 남기고 잔액을 넘게 깎지 않는다", async () => {
		const seekerUserId = await createUser("job_seeker");
		const adminUserId = await createUser("admin");
		const adjust = createProcedureClient(attendanceRouter.adminAdjustPoints, {
			context: createContextForUser(adminUserId),
		});

		try {
			const granted = await adjust({
				amount: 100,
				reason: "이벤트 보상",
				userId: seekerUserId,
			});
			expect(granted.pointBalance).toBe(100);
			expect(granted.applied).toBe(100);

			const deducted = await adjust({
				amount: -30,
				reason: "오지급 회수",
				userId: seekerUserId,
			});
			expect(deducted.pointBalance).toBe(70);

			// 잔액을 넘는 차감은 거부되고 원장에도 행이 남지 않는다.
			await expect(
				adjust({ amount: -1000, reason: "초과 차감", userId: seekerUserId })
			).rejects.toThrow();

			const ledger = await db
				.select({
					actorUserId: bambiPointTransaction.actorUserId,
					amount: bambiPointTransaction.amount,
					balanceAfter: bambiPointTransaction.balanceAfter,
					reason: bambiPointTransaction.reason,
				})
				.from(bambiPointTransaction)
				.where(eq(bambiPointTransaction.userId, seekerUserId));
			expect(ledger).toHaveLength(2);
			// 출석 적립(reason="attendance")과 구분되는 프리픽스가 붙는다.
			expect(ledger.map((row) => row.reason).sort()).toEqual([
				"운영자 지급: 이벤트 보상",
				"운영자 차감: 오지급 회수",
			]);
			expect(ledger.every((row) => row.actorUserId === adminUserId)).toBe(true);
			expect(
				ledger
					.map((row) => row.balanceAfter)
					.sort((a, b) => (a ?? 0) - (b ?? 0))
			).toEqual([70, 100]);

			const notifications = await db
				.select({
					metadata: bambiNotification.metadata,
					targetId: bambiNotification.targetId,
					targetType: bambiNotification.targetType,
				})
				.from(bambiNotification)
				.where(eq(bambiNotification.recipientUserId, seekerUserId));
			expect(notifications).toHaveLength(1);
			expect(notifications[0]).toMatchObject({
				metadata: { action: "admin_awarded", amount: 100 },
				targetId: granted.transactionId,
				targetType: "point_transaction",
			});

			const getHistory = createProcedureClient(
				pointSettingsRouter.getMineHistory,
				{ context: createContextForUser(seekerUserId) }
			);
			const history = await getHistory({ limit: 10 });
			expect(history.balance).toBe(70);
			expect(history.items).toHaveLength(2);
			expect(
				history.items.map(({ amount, label }) => ({ amount, label }))
			).toEqual([
				{ amount: -30, label: "운영자 차감: 오지급 회수" },
				{ amount: 100, label: "운영자 지급: 이벤트 보상" },
			]);

			const listMembers = createProcedureClient(
				pointSettingsRouter.listAdminMembers,
				{ context: createContextForUser(adminUserId) }
			);
			const members = await listMembers({
				page: 1,
				pageSize: 10,
				search: "출석 테스트 계정",
			});
			expect(members.items.some((item) => item.userId === seekerUserId)).toBe(
				true
			);

			const getAdminMember = createProcedureClient(
				pointSettingsRouter.getAdminMember,
				{ context: createContextForUser(adminUserId) }
			);
			const member = await getAdminMember({ userId: seekerUserId });
			expect(member.pointBalance).toBe(70);

			const listAdminHistory = createProcedureClient(
				pointSettingsRouter.listAdminMemberHistory,
				{ context: createContextForUser(adminUserId) }
			);
			const adminHistory = await listAdminHistory({
				page: 1,
				pageSize: 10,
				userId: seekerUserId,
			});
			expect(adminHistory.totalCount).toBe(2);
			expect(adminHistory.items.map((item) => item.processor)).toEqual([
				"출석 테스트 계정",
				"출석 테스트 계정",
			]);
			expect(adminHistory.items.map((item) => item.balanceAfter)).toEqual([
				70, 100,
			]);

			// 운영자 계정은 출석 대상 역할이 아니라 조정 대상이 될 수 없다.
			await expect(
				adjust({ amount: 10, reason: "테스트", userId: adminUserId })
			).rejects.toThrow();
		} finally {
			await cleanup([seekerUserId, adminUserId]);
		}
	});

	it("adminList는 운영자만 부를 수 있다", async () => {
		const seekerUserId = await createUser("job_seeker");

		try {
			await expect(
				createProcedureClient(attendanceRouter.adminList, {
					context: createContextForUser(seekerUserId),
				})({})
			).rejects.toThrow();
		} finally {
			await cleanup([seekerUserId]);
		}
	});
});

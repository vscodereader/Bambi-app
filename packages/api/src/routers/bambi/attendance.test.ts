import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [
	{ db },
	authSchema,
	bambiSchema,
	{ attendanceRouter },
	attendanceService,
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./attendance"),
	import("../../services/bambi-attendance"),
]);

const { user } = authSchema;
const { bambiAttendance, bambiPointTransaction, bambiProfile } = bambiSchema;

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
			// 운영자 계정은 출석 대상이 아니라 목록에 없다.
			expect(result.items.some((item) => item.userId === adminUserId)).toBe(
				false
			);
			expect(result.summary.attendedToday).toBeGreaterThanOrEqual(1);
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

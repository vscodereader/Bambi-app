import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./moderation"),
	]);

const { account, user } = authSchema;
const { bambiProfile } = bambiSchema;

const DAY_MS = 24 * 60 * 60 * 1000;

const createdUserIds: string[] = [];
afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await db.delete(user).where(eq(user.id, id));
	}
});

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const purgeClient = (adminUserId: string) =>
	createProcedureClient(moderationRouter.purgeWithdrawnAccounts, {
		context: ctx(adminUserId),
		path: ["bambi", "moderation", "purgeWithdrawnAccounts"],
	});

const seedAdmin = async () => {
	const userId = `user_purge_admin_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "운영자",
		email: `${userId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId, role: "admin", displayName: "운영자" });
	return userId;
};

const seedWithdrawnUser = async (daysAgo: number) => {
	const userId = `user_purge_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "탈퇴한 회원",
		email: `${userId}@bambi.test`,
		deletedAt: new Date(Date.now() - daysAgo * DAY_MS),
	});
	await db.insert(bambiProfile).values({
		userId,
		role: "job_seeker",
		displayName: "탈퇴한 회원",
		phoneNumber: "010-2222-3333",
		birthDate: "19900101",
		ciHash: `ci-${randomUUID()}`,
		diHash: `di-${randomUUID()}`,
		isPhoneVerified: true,
	});
	// account.updatedAt은 기본값이 없어 수동 지정이 필요하다.
	await db.insert(account).values({
		id: `account_${randomUUID()}`,
		accountId: userId,
		providerId: "credential",
		userId,
		password: "hashed-password",
		updatedAt: new Date(),
	});
	return userId;
};

describe("purgeWithdrawnAccounts 개인정보 파기 배치", () => {
	it("보존기간 경과분만 파기하고 최근 탈퇴자는 남긴다", async () => {
		const adminId = await seedAdmin();
		const oldUserId = await seedWithdrawnUser(31);
		const recentUserId = await seedWithdrawnUser(1);

		const result = await purgeClient(adminId)();
		expect(result.purgedCount).toBeGreaterThanOrEqual(1);

		const [purged] = await db.select().from(user).where(eq(user.id, oldUserId));
		expect(purged?.email).toBe(`withdrawn-${oldUserId}@invalid.bambi`);
		expect(purged?.purgedAt).not.toBeNull();

		const [purgedProfile] = await db
			.select()
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, oldUserId));
		expect(purgedProfile?.phoneNumber).toBeNull();
		expect(purgedProfile?.birthDate).toBeNull();
		expect(purgedProfile?.ciHash).toBeNull();
		expect(purgedProfile?.diHash).toBeNull();
		expect(purgedProfile?.isPhoneVerified).toBe(false);

		const accounts = await db
			.select()
			.from(account)
			.where(eq(account.userId, oldUserId));
		expect(accounts).toHaveLength(0);

		const [recent] = await db
			.select()
			.from(user)
			.where(eq(user.id, recentUserId));
		expect(recent?.email).toBe(`${recentUserId}@bambi.test`);
		expect(recent?.purgedAt).toBeNull();
	});

	it("이미 파기된 계정은 재처리하지 않는다", async () => {
		const adminId = await seedAdmin();
		const oldUserId = await seedWithdrawnUser(31);

		await purgeClient(adminId)();
		const again = await purgeClient(adminId)();

		expect(again.purgedCount).toBe(0);
		const [row] = await db.select().from(user).where(eq(user.id, oldUserId));
		expect(row?.purgedAt).not.toBeNull();
	});
});

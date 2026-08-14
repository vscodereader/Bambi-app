import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { siteSettingsRouter }, memberPolicy] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("@/routers/bambi/site-settings"),
		import("@/services/bambi-member-policy"),
	]);

const { user } = authSchema;
const { bambiProfile, bambiSiteSettings } = bambiSchema;
const { resolveWithdrawalRetentionDays } = memberPolicy;

const SETTINGS_ROW_ID = "default";

// 실 개발 DB의 단일 설정 행을 공유하므로 시작 전 값을 백업하고 끝나면 원복한다.
let originalDays: number | null = null;
beforeAll(async () => {
	const [row] = await db
		.select({ days: bambiSiteSettings.withdrawalRetentionDays })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
		.limit(1);
	originalDays = row?.days ?? null;
});
afterAll(async () => {
	await db
		.update(bambiSiteSettings)
		.set({ withdrawalRetentionDays: originalDays })
		.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID));
});

const createdUserIds: string[] = [];
afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await db.delete(user).where(eq(user.id, id));
	}
});

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const seedUserWithRole = async (role: "admin" | "job_seeker") => {
	const userId = `user_policy_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "정책테스트",
		email: `${userId}@bambi.test`,
	});
	await db.insert(bambiProfile).values({ userId, role });
	return userId;
};

const updateClient = (userId: string) =>
	createProcedureClient(siteSettingsRouter.updateMemberPolicy, {
		context: ctx(userId),
		path: ["bambi", "siteSettings", "updateMemberPolicy"],
	});

const getClient = () =>
	createProcedureClient(siteSettingsRouter.getMemberPolicy, {
		context: { auth: null, session: null } as Context,
		path: ["bambi", "siteSettings", "getMemberPolicy"],
	});

describe("회원 정책(탈퇴 보존기간) 설정", () => {
	it("운영자가 저장하면 조회·해석 헬퍼에 반영된다", async () => {
		const adminId = await seedUserWithRole("admin");

		const saved = await updateClient(adminId)({
			withdrawalRetentionDays: 14,
		});
		expect(saved.days).toBe(14);

		const policy = await getClient()();
		expect(policy.days).toBe(14);
		expect(await resolveWithdrawalRetentionDays()).toBe(14);
	});

	it("null로 저장하면 기본값으로 폴백한다", async () => {
		const adminId = await seedUserWithRole("admin");

		await updateClient(adminId)({ withdrawalRetentionDays: null });

		const policy = await getClient()();
		expect(policy.days).toBeNull();
		expect(await resolveWithdrawalRetentionDays()).toBe(policy.defaultDays);
	});

	it("운영자가 아니면 저장이 거부된다", async () => {
		const seekerId = await seedUserWithRole("job_seeker");

		await expect(
			updateClient(seekerId)({ withdrawalRetentionDays: 14 })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

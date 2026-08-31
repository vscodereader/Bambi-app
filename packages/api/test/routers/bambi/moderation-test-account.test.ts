import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [
	{ auth },
	{ db },
	authSchema,
	bambiSchema,
	{ moderationRouter },
	{ onboardingRouter },
	{ insertTestAccountRecords },
	{ hasMemberVerifiedIdentity },
] = await Promise.all([
	import("@bambi-app/auth"),
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/moderation"),
	import("@/routers/bambi/onboarding"),
	import("@/services/bambi-test-account"),
	import("@/services/bambi-secret-identity"),
]);

const { account, member, session, user } = authSchema;
const {
	adminModerationAction,
	bambiIdentityVerification,
	bambiIdentityVerificationLog,
	bambiProfile,
} = bambiSchema;

const createdUserIds: string[] = [];
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

const contextFor = (userId: string): Context =>
	({
		auth: null,
		session: { user: { id: userId } },
	}) as Context;

const seedActor = async (role: "admin" | "job_seeker"): Promise<string> => {
	const userId = randomUUID();
	createdUserIds.push(userId);
	await db.insert(user).values({
		email: `${randomUUID()}@bambi.test`,
		id: userId,
		name: role === "admin" ? "테스트 운영자" : "일반 회원",
	});
	await db.insert(bambiProfile).values({ role, status: "active", userId });
	return userId;
};

const createClient = (userId: string) =>
	createProcedureClient(moderationRouter.createTestAccount, {
		context: contextFor(userId),
		path: ["bambi", "moderation", "createTestAccount"],
	});

afterEach(async () => {
	if (createdUserIds.length === 0) {
		return;
	}
	await db
		.delete(adminModerationAction)
		.where(inArray(adminModerationAction.targetId, createdUserIds));
	await db.delete(session).where(inArray(session.userId, createdUserIds));
	await db.delete(user).where(inArray(user.id, createdUserIds));
	createdUserIds.length = 0;
});

describe("moderation.createTestAccount", () => {
	it("creates a verified credential account that signs in with username", async () => {
		const adminUserId = await seedActor("admin");
		const ticketCountBefore = await db.$count(bambiIdentityVerification);
		const logCountBefore = await db.$count(bambiIdentityVerificationLog);
		const loginId = `test-${randomUUID().slice(0, 8)}`;
		const password = "test-password-1234";

		const result = await createClient(adminUserId)({
			birthDate: "1995-04-12",
			gender: "female",
			loginId: loginId.toUpperCase(),
			nickname: "가계정 구직자",
			password,
			phoneNumber: "010-1234-5678",
			role: "job_seeker",
		});
		createdUserIds.push(result.userId);

		const [storedUser] = await db
			.select()
			.from(user)
			.where(eq(user.id, result.userId));
		const [credential] = await db
			.select()
			.from(account)
			.where(eq(account.userId, result.userId));
		const [profile] = await db
			.select()
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, result.userId));
		const [audit] = await db
			.select()
			.from(adminModerationAction)
			.where(eq(adminModerationAction.targetId, result.userId));

		expect(storedUser?.name).toBe("가계정 구직자");
		expect(storedUser?.login_id).toBe(loginId);
		expect(storedUser?.email.endsWith("@admin-test.invalid")).toBe(true);
		expect(credential).toMatchObject({
			accountId: result.userId,
			providerId: "credential",
		});
		expect(credential?.password).not.toBe(password);
		expect(credential?.createdAt).toBeInstanceOf(Date);
		expect(credential?.updatedAt).toBeInstanceOf(Date);
		expect(profile).toMatchObject({
			birthDate: "19950412",
			gender: "female",
			isAdvertiser: false,
			isPhoneVerified: true,
			phoneNumber: "01012345678",
			role: "job_seeker",
			status: "active",
		});
		expect(profile?.ciHash).toMatch(SHA256_HEX_PATTERN);
		expect(profile?.diHash).toMatch(SHA256_HEX_PATTERN);
		expect(profile?.ciHash).not.toBe(profile?.diHash);
		expect(audit).toMatchObject({
			action: "create_test_account",
			adminUserId,
			targetType: "user",
		});
		expect(await db.$count(bambiIdentityVerification)).toBe(ticketCountBefore);
		expect(await db.$count(bambiIdentityVerificationLog)).toBe(logCountBefore);
		await expect(hasMemberVerifiedIdentity(result.userId)).resolves.toBe(true);

		await expect(
			auth.api.signInUsername({ body: { password, username: loginId } })
		).resolves.toBeDefined();
		const getMyRouting = createProcedureClient(onboardingRouter.getMyRouting, {
			context: contextFor(result.userId),
			path: ["bambi", "onboarding", "getMyRouting"],
		});
		await expect(getMyRouting({})).resolves.toEqual({
			employerApprovalStatus: "none",
			role: "job_seeker",
		});
	});

	it("rejects non-admin callers without leaving account rows", async () => {
		const seekerUserId = await seedActor("job_seeker");
		const before = await db.$count(user);
		await expect(
			createClient(seekerUserId)({
				birthDate: "1990-01-01",
				gender: "male",
				loginId: `blocked-${randomUUID().slice(0, 8)}`,
				nickname: "생성 거부 계정",
				password: "test-password-1234",
				phoneNumber: "010-9999-8888",
				role: "employer",
			})
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(await db.$count(user)).toBe(before);
	});

	it("does not create employer organization state", async () => {
		const adminUserId = await seedActor("admin");
		const result = await createClient(adminUserId)({
			birthDate: "1988-08-08",
			gender: "male",
			loginId: `employer-${randomUUID().slice(0, 8)}`,
			nickname: "가계정 구인자",
			password: "test-password-1234",
			phoneNumber: "010-2222-3333",
			role: "employer",
		});
		createdUserIds.push(result.userId);

		expect(
			await db.select().from(member).where(eq(member.userId, result.userId))
		).toHaveLength(0);
		const getMyRouting = createProcedureClient(onboardingRouter.getMyRouting, {
			context: contextFor(result.userId),
			path: ["bambi", "onboarding", "getMyRouting"],
		});
		await expect(getMyRouting({})).resolves.toEqual({
			employerApprovalStatus: "none",
			role: "employer",
		});
	});

	it("rolls back every account row when the transaction fails after the audit insert", async () => {
		const adminUserId = await seedActor("admin");
		const userId = randomUUID();
		const prepared: Parameters<typeof insertTestAccountRecords>[1] = {
			adminUserId,
			birthDate: "19900101",
			ciHash: "a".repeat(64),
			diHash: "b".repeat(64),
			email: `${randomUUID()}@admin-test.invalid`,
			gender: "female",
			loginId: `rollback-${randomUUID().slice(0, 8)}`,
			nickname: "롤백 확인 계정",
			passwordHash: "not-used-for-login",
			phoneNumber: "01011112222",
			role: "job_seeker",
			userId,
		};

		await expect(
			db.transaction(async (tx) => {
				await insertTestAccountRecords(tx, prepared);
				throw new Error("intentional rollback");
			})
		).rejects.toThrow("intentional rollback");
		expect(
			await db.select().from(user).where(eq(user.id, userId))
		).toHaveLength(0);
		expect(
			await db.select().from(account).where(eq(account.userId, userId))
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(adminModerationAction)
				.where(eq(adminModerationAction.targetId, userId))
		).toHaveLength(0);
	});
});

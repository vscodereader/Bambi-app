import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { onboardingRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./onboarding"),
	]);

const { member, organization, session, user } = authSchema;
const { bambiProfile } = bambiSchema;

const createdUserIds: string[] = [];
const createdOrganizationIds: string[] = [];
afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await db.delete(user).where(eq(user.id, id));
	}
	for (const id of createdOrganizationIds.splice(0)) {
		await db.delete(organization).where(eq(organization.id, id));
	}
});

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const withdrawClient = (userId: string) =>
	createProcedureClient(onboardingRouter.withdrawMyAccount, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "withdrawMyAccount"],
	});

const seedUser = async () => {
	const userId = `user_withdraw_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "탈퇴대상",
		email: `${userId}@bambi.test`,
	});
	await db.insert(bambiProfile).values({
		userId,
		role: "job_seeker",
		displayName: "탈퇴대상",
		phoneNumber: "010-1111-2222",
	});
	return userId;
};

// session.updatedAt·expiresAt은 기본값이 없어 수동 지정이 필요하다.
const seedSession = async (userId: string) => {
	await db.insert(session).values({
		id: `session_${randomUUID()}`,
		token: `token_${randomUUID()}`,
		userId,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		updatedAt: new Date(),
	});
};

// organization·member는 createdAt 기본값이 없어 수동 지정이 필요하다.
const seedMembership = async (userId: string, role: "member" | "owner") => {
	const organizationId = `org_withdraw_${randomUUID()}`;
	createdOrganizationIds.push(organizationId);
	await db.insert(organization).values({
		id: organizationId,
		name: "탈퇴테스트조직",
		slug: `withdraw-${randomUUID().slice(0, 8)}`,
		createdAt: new Date(),
	});
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId,
		userId,
		role,
		createdAt: new Date(),
	});
};

describe("withdrawMyAccount 회원 탈퇴", () => {
	it("탈퇴하면 소프트 삭제·즉시 익명화·세션과 멤버십 정리가 이뤄진다", async () => {
		const userId = await seedUser();
		await seedSession(userId);
		await seedMembership(userId, "member");

		const result = await withdrawClient(userId)();
		expect(result.ok).toBe(true);

		const [updatedUser] = await db
			.select()
			.from(user)
			.where(eq(user.id, userId));
		expect(updatedUser?.deletedAt).not.toBeNull();
		expect(updatedUser?.name).toBe("탈퇴한 회원");

		const [profile] = await db
			.select()
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId));
		expect(profile?.displayName).toBe("탈퇴한 회원");
		// 개인정보는 보존기간 동안 유지된다 — 파기는 배치가 한다.
		expect(profile?.phoneNumber).toBe("010-1111-2222");

		const sessions = await db
			.select()
			.from(session)
			.where(eq(session.userId, userId));
		expect(sessions).toHaveLength(0);

		const memberships = await db
			.select()
			.from(member)
			.where(eq(member.userId, userId));
		expect(memberships).toHaveLength(0);
	});

	it("조직 소유자는 탈퇴가 차단된다", async () => {
		const userId = await seedUser();
		await seedMembership(userId, "owner");

		await expect(withdrawClient(userId)()).rejects.toThrow("조직 소유자");

		const [row] = await db.select().from(user).where(eq(user.id, userId));
		expect(row?.deletedAt).toBeNull();
	});
});

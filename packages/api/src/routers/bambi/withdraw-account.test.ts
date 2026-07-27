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

const { account, member, organization, session, user } = authSchema;
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

const eligibilityClient = (userId: string) =>
	createProcedureClient(onboardingRouter.getWithdrawEligibility, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "getWithdrawEligibility"],
	});

const seedUser = async () => {
	const userId = `user_withdraw_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "탈퇴대상",
		email: `${userId}@bambi.test`,
		login_id: userId,
		login_id_display: userId,
	});
	await db.insert(bambiProfile).values({
		userId,
		role: "job_seeker",
		phoneNumber: "010-1111-2222",
		gender: "female",
		birthDate: "19900101",
		isPhoneVerified: true,
		ciHash: `ci_${userId}`,
		diHash: `di_${userId}`,
	});
	// 비밀번호 자격증명. updatedAt은 기본값이 없어 수동 지정이 필요하다.
	await db.insert(account).values({
		id: `account_${randomUUID()}`,
		accountId: userId,
		providerId: "credential",
		userId,
		password: "hashed",
		updatedAt: new Date(),
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
	return organizationId;
};

// 같은 조직에 다른 멤버를 추가한다(팀에 멤버가 남은 상황 재현).
const seedOrganizationMember = async (
	organizationId: string,
	userId: string
) => {
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId,
		userId,
		role: "staff",
		createdAt: new Date(),
	});
};

describe("withdrawMyAccount 회원 탈퇴", () => {
	it("탈퇴하면 개인정보를 즉시 파기하고 CI·DI 해시만 남긴다", async () => {
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
		// 이메일은 notNull·unique라 tombstone으로 치환한다(원 이메일 재가입 재개방).
		expect(updatedUser?.email).toBe(`withdrawn-${userId}@invalid.bambi`);
		// 로그인 아이디는 nullable이라 비워서 파기한다(같은 아이디 재사용 개방).
		expect(updatedUser?.login_id).toBeNull();
		expect(updatedUser?.login_id_display).toBeNull();

		const [profile] = await db
			.select()
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId));
		// 표시명(닉네임)은 user.name 정본에서 익명화된다(위에서 검증).
		// 연락처·본인인증 정보는 즉시 파기하고, 부정 재가입 차단용 해시만 남긴다.
		expect(profile?.phoneNumber).toBeNull();
		expect(profile?.gender).toBeNull();
		expect(profile?.birthDate).toBeNull();
		expect(profile?.isPhoneVerified).toBe(false);
		expect(profile?.ciHash).toBe(`ci_${userId}`);
		expect(profile?.diHash).toBe(`di_${userId}`);

		// 비밀번호 등 자격증명도 즉시 파기된다.
		const accounts = await db
			.select()
			.from(account)
			.where(eq(account.userId, userId));
		expect(accounts).toHaveLength(0);

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

	it("소유 조직에 다른 멤버가 남아 있으면 탈퇴가 차단되고, 멤버 정리 후 탈퇴할 수 있다", async () => {
		const ownerId = await seedUser();
		const organizationId = await seedMembership(ownerId, "owner");
		const otherUserId = await seedUser();
		await seedOrganizationMember(organizationId, otherUserId);

		// 다른 멤버가 남아 있으면 거절.
		await expect(withdrawClient(ownerId)()).rejects.toThrow("다른 멤버");

		const [blocked] = await db.select().from(user).where(eq(user.id, ownerId));
		expect(blocked?.deletedAt).toBeNull();

		// 멤버를 정리하면 같은 호출이 성공한다.
		await db.delete(member).where(eq(member.userId, otherUserId));
		const result = await withdrawClient(ownerId)();
		expect(result.ok).toBe(true);

		const [withdrawn] = await db
			.select()
			.from(user)
			.where(eq(user.id, ownerId));
		expect(withdrawn?.deletedAt).not.toBeNull();
	});

	it("혼자 남은 소유자는 탈퇴할 수 있다", async () => {
		const userId = await seedUser();
		await seedMembership(userId, "owner");

		const result = await withdrawClient(userId)();
		expect(result.ok).toBe(true);

		const [row] = await db.select().from(user).where(eq(user.id, userId));
		expect(row?.deletedAt).not.toBeNull();
	});
});

describe("getWithdrawEligibility 탈퇴 가능 여부", () => {
	it("소유 조직에 다른 멤버가 있으면 blockedByTeamMembers=true", async () => {
		const ownerId = await seedUser();
		const organizationId = await seedMembership(ownerId, "owner");
		const otherUserId = await seedUser();
		await seedOrganizationMember(organizationId, otherUserId);

		const result = await eligibilityClient(ownerId)();
		expect(result.blockedByTeamMembers).toBe(true);
	});

	it("혼자 남은 소유자는 blockedByTeamMembers=false", async () => {
		const userId = await seedUser();
		await seedMembership(userId, "owner");

		const result = await eligibilityClient(userId)();
		expect(result.blockedByTeamMembers).toBe(false);
	});

	it("소유 조직이 없으면 blockedByTeamMembers=false", async () => {
		const userId = await seedUser();

		const result = await eligibilityClient(userId)();
		expect(result.blockedByTeamMembers).toBe(false);
	});
});

import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./moderation"),
	]);

const { user, organization, member } = authSchema;
const { adminModerationAction, bambiProfile, employerOrganizationProfile } =
	bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

const seedAdmin = async () => {
	const adminId = `user_admin_${randomUUID()}`;
	await db.insert(user).values({
		id: adminId,
		name: "운영자",
		email: `${adminId}@bambi.test`,
	});
	await db.insert(bambiProfile).values({ userId: adminId, role: "admin" });
	return adminId;
};

const seedPendingEmployer = async () => {
	const ownerId = `user_owner_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;
	await db.insert(user).values({
		id: ownerId,
		name: "업주",
		email: `${ownerId}@bambi.test`,
	});
	await db
		.insert(organization)
		.values({ id: orgId, name: "업소", slug: orgId, createdAt: new Date() });
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId: orgId,
		userId: ownerId,
		role: "owner",
		createdAt: new Date(),
	});
	await db.insert(bambiProfile).values({ userId: ownerId, role: "employer" });
	await db.insert(employerOrganizationProfile).values({
		organizationId: orgId,
		displayName: "업소",
		verificationStatus: "pending",
	});
	return { ownerId, orgId };
};

describe("setEmployerVerificationStatus", () => {
	it("verifies a pending employer as admin", async () => {
		const adminId = await seedAdmin();
		const { ownerId, orgId } = await seedPendingEmployer();

		const setStatus = createProcedureClient(
			moderationRouter.setEmployerVerificationStatus,
			{
				context: ctx(adminId),
				path: ["bambi", "moderation", "setEmployerVerificationStatus"],
			}
		);

		const result = await setStatus({
			organizationId: orgId,
			status: "verified",
			reason: "서류 확인",
		});
		expect(result.verificationStatus).toBe("verified");

		await db
			.delete(adminModerationAction)
			.where(inArray(adminModerationAction.adminUserId, [adminId]));
		await db.delete(user).where(eq(user.id, adminId));
		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(organization).where(eq(organization.id, orgId));
	});

	it("forbids non-admin", async () => {
		const nonAdmin = `user_x_${randomUUID()}`;
		await db.insert(user).values({
			id: nonAdmin,
			name: "일반",
			email: `${nonAdmin}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId: nonAdmin, role: "job_seeker" });
		const { ownerId, orgId } = await seedPendingEmployer();

		const setStatus = createProcedureClient(
			moderationRouter.setEmployerVerificationStatus,
			{
				context: ctx(nonAdmin),
				path: ["bambi", "moderation", "setEmployerVerificationStatus"],
			}
		);

		await expectOrpcCode(
			setStatus({
				organizationId: orgId,
				status: "verified",
				reason: "권한 테스트",
			}),
			"FORBIDDEN"
		);

		await db.delete(user).where(eq(user.id, nonAdmin));
		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(organization).where(eq(organization.id, orgId));
	});
});

import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [
	{ db },
	authSchema,
	bambiSchema,
	{ organizationsRouter },
	{ teamsRouter },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/organizations"),
	import("@/routers/bambi/teams"),
]);

const { user, organization, member } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

// pending 조직 owner를 만든다.
const seedPendingOwner = async () => {
	const userId = `user_gate_${randomUUID()}`;
	const organizationId = `org_${randomUUID()}`;
	await db.insert(user).values({
		id: userId,
		name: "미승인",
		email: `${userId}@bambi.test`,
	});
	await db.insert(bambiProfile).values({ userId, role: "employer" });
	await db.insert(organization).values({
		createdAt: new Date(),
		id: organizationId,
		name: "미승인업소",
		slug: `pending-${randomUUID().slice(0, 8)}`,
	});
	await db.insert(member).values({
		createdAt: new Date(),
		id: `member_${randomUUID()}`,
		organizationId,
		userId,
		role: "owner",
	});
	await db.insert(employerOrganizationProfile).values({
		organizationId,
		displayName: "미승인업소",
		verificationStatus: "pending",
	});
	return { userId, organizationId };
};

describe("verification gate — organizations.updateProfile", () => {
	it("forbids profile update while not verified", async () => {
		const { userId, organizationId } = await seedPendingOwner();

		const updateProfile = createProcedureClient(
			organizationsRouter.updateProfile,
			{
				context: ctx(userId),
				path: ["bambi", "organizations", "updateProfile"],
			}
		);

		await expect(
			updateProfile({ organizationId, displayName: "변경시도" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("allows profile update once verified", async () => {
		const { userId, organizationId } = await seedPendingOwner();
		await db
			.update(employerOrganizationProfile)
			.set({ verificationStatus: "verified" })
			.where(eq(employerOrganizationProfile.organizationId, organizationId));

		const updateProfile = createProcedureClient(
			organizationsRouter.updateProfile,
			{
				context: ctx(userId),
				path: ["bambi", "organizations", "updateProfile"],
			}
		);

		const updated = await updateProfile({
			organizationId,
			displayName: "정상변경",
		});
		expect(updated.displayName).toBe("정상변경");

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});
});

describe("verification gate — teams mutations", () => {
	it("forbids team creation while not verified", async () => {
		const { userId, organizationId } = await seedPendingOwner();

		const createTeam = createProcedureClient(teamsRouter.create, {
			context: ctx(userId),
			path: ["bambi", "teams", "create"],
		});

		await expect(
			createTeam({ displayName: "새 팀", organizationId })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("allows team creation once verified", async () => {
		const { userId, organizationId } = await seedPendingOwner();
		await db
			.update(employerOrganizationProfile)
			.set({ verificationStatus: "verified" })
			.where(eq(employerOrganizationProfile.organizationId, organizationId));

		const createTeam = createProcedureClient(teamsRouter.create, {
			context: ctx(userId),
			path: ["bambi", "teams", "create"],
		});

		const created = await createTeam({ displayName: "새 팀", organizationId });
		expect(created.displayName).toBe("새 팀");

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("forbids member invitation while not verified", async () => {
		const { userId, organizationId } = await seedPendingOwner();

		const inviteMember = createProcedureClient(teamsRouter.inviteMember, {
			context: ctx(userId),
			path: ["bambi", "teams", "inviteMember"],
		});

		await expect(
			inviteMember({
				email: "invitee@bambi.test",
				organizationId,
				role: "staff",
			})
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});
});

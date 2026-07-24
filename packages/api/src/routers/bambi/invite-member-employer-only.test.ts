import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { teamsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./teams"),
]);

const { user, organization, member } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const seedOwner = async () => {
	const ownerId = `user_iv_${randomUUID()}`;
	await db.insert(user).values({
		id: ownerId,
		name: "소유자",
		email: `${ownerId}@bambi.test`,
	});
	await db.insert(bambiProfile).values({ userId: ownerId, role: "employer" });
	const organizationId = `org_${randomUUID()}`;
	await db.insert(organization).values({
		id: organizationId,
		name: "org",
		slug: `org-${randomUUID().slice(0, 8)}`,
		createdAt: new Date(),
	});
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId,
		userId: ownerId,
		role: "owner",
		createdAt: new Date(),
	});
	// 초대는 승인(verified)된 조직만 가능하므로 fixture를 verified로 둔다.
	await db.insert(employerOrganizationProfile).values({
		organizationId,
		displayName: "org",
		verificationStatus: "verified",
	});
	return { ownerId, organizationId };
};

describe("inviteMember employer-only", () => {
	it("allows inviting an employer account", async () => {
		const { ownerId, organizationId } = await seedOwner();
		const inviteeEmail = `invitee_${randomUUID()}@bambi.test`;
		const inviteeId = `user_iv_${randomUUID()}`;
		await db.insert(user).values({
			id: inviteeId,
			name: "초대대상",
			email: inviteeEmail,
		});
		await db
			.insert(bambiProfile)
			.values({ userId: inviteeId, role: "employer" });

		const invite = createProcedureClient(teamsRouter.inviteMember, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "inviteMember"],
		});

		const created = await invite({
			organizationId,
			email: inviteeEmail,
			role: "staff",
		});
		expect(created?.email).toBe(inviteeEmail.toLowerCase());

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(user).where(eq(user.id, inviteeId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("rejects inviting a non-employer email", async () => {
		const { ownerId, organizationId } = await seedOwner();
		const seekerEmail = `seeker_${randomUUID()}@bambi.test`;
		const seekerId = `user_iv_${randomUUID()}`;
		await db.insert(user).values({
			id: seekerId,
			name: "구직자",
			email: seekerEmail,
		});
		await db
			.insert(bambiProfile)
			.values({ userId: seekerId, role: "job_seeker" });

		const invite = createProcedureClient(teamsRouter.inviteMember, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "inviteMember"],
		});

		await expect(
			invite({ organizationId, email: seekerEmail, role: "staff" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(user).where(eq(user.id, seekerId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("rejects inviting an email with no account", async () => {
		const { ownerId, organizationId } = await seedOwner();

		const invite = createProcedureClient(teamsRouter.inviteMember, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "inviteMember"],
		});

		await expect(
			invite({
				organizationId,
				email: `ghost_${randomUUID()}@bambi.test`,
				role: "staff",
			})
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});
});

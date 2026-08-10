import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { organizationsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("@/routers/bambi/organizations"),
	]);

const { user, organization, member, invitation } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

// 검증된 조직 + owner 멤버 + accepted 초대 1건 + pending 초대 1건(모두 랜덤 이메일)
const seedOrgWithInvites = async () => {
	const ownerId = `user_owner_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;

	await db
		.insert(user)
		.values({ id: ownerId, name: "업주", email: `${ownerId}@bambi.test` });
	await db.insert(bambiProfile).values({ userId: ownerId, role: "employer" });
	await db
		.insert(organization)
		.values({ id: orgId, name: "업소", slug: orgId, createdAt: new Date() });
	await db.insert(employerOrganizationProfile).values({
		organizationId: orgId,
		displayName: "업소 표시명",
		verificationStatus: "verified",
	});
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId: orgId,
		userId: ownerId,
		role: "owner",
		createdAt: new Date(),
	});

	const acceptedInviteId = `invitation_${randomUUID()}`;
	const pendingInviteId = `invitation_${randomUUID()}`;
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 14);
	await db.insert(invitation).values([
		{
			email: `accepted_${randomUUID()}@bambi.test`,
			expiresAt,
			id: acceptedInviteId,
			inviterId: ownerId,
			organizationId: orgId,
			role: "staff",
			status: "accepted",
			teamId: null,
		},
		{
			email: `pending_${randomUUID()}@bambi.test`,
			expiresAt,
			id: pendingInviteId,
			inviterId: ownerId,
			organizationId: orgId,
			role: "staff",
			status: "pending",
			teamId: null,
		},
	]);

	return { acceptedInviteId, orgId, ownerId, pendingInviteId };
};

const cleanup = async (ids: { orgId: string; ownerId: string }) => {
	// member/invitation/orgProfile 은 organization onDelete cascade
	await db.delete(organization).where(eq(organization.id, ids.orgId));
	await db.delete(user).where(eq(user.id, ids.ownerId));
};

describe("listMembers accepted invitation exclusion", () => {
	it("excludes accepted invitations but keeps pending ones", async () => {
		const seed = await seedOrgWithInvites();

		try {
			const listMembers = createProcedureClient(
				organizationsRouter.listMembers,
				{
					context: ctx(seed.ownerId),
					path: ["bambi", "organizations", "listMembers"],
				}
			);
			const members = await listMembers({ organizationId: seed.orgId });
			const ids = members.map((row) => row.id);

			expect(ids).toContain(seed.pendingInviteId);
			expect(ids).not.toContain(seed.acceptedInviteId);
		} finally {
			await cleanup(seed);
		}
	});
});

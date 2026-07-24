import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { teamsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./teams"),
]);

const { user, organization, member, invitation } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

// 검증된 조직 + owner 멤버 + 대상 employer + rejected(기본) 초대를 만든다.
const seedRejectedInvite = async (options?: { status?: string }) => {
	const ownerId = `user_owner_${randomUUID()}`;
	const inviteeId = `user_invitee_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;
	const inviteeEmail = `${inviteeId}@bambi.test`;

	await db.insert(user).values([
		{ id: ownerId, name: "업주", email: `${ownerId}@bambi.test` },
		{ id: inviteeId, name: "초대대상", email: inviteeEmail },
	]);
	await db.insert(bambiProfile).values([
		{ userId: ownerId, role: "employer" },
		{ userId: inviteeId, role: "employer" },
	]);
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

	const status = options?.status ?? "rejected";
	const inviteId = `invitation_${randomUUID()}`;
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 14);
	await db.insert(invitation).values({
		id: inviteId,
		organizationId: orgId,
		email: inviteeEmail,
		role: "staff",
		teamId: null,
		status,
		rejectionReason: status === "rejected" ? "정보 확인 불가" : null,
		expiresAt,
		inviterId: ownerId,
	});

	return { ownerId, inviteeId, orgId, inviteeEmail, inviteId };
};

const cleanup = async (ids: {
	ownerId: string;
	inviteeId: string;
	orgId: string;
	outsiderId?: string;
}) => {
	// invitation/member/orgProfile 은 organization onDelete cascade
	await db.delete(organization).where(eq(organization.id, ids.orgId));
	await db
		.delete(user)
		.where(
			inArray(user.id, [ids.ownerId, ids.inviteeId, ids.outsiderId ?? ""])
		);
};

const seedOutsider = async () => {
	const outsiderId = `user_out_${randomUUID()}`;
	await db.insert(user).values({
		id: outsiderId,
		name: "외부",
		email: `${outsiderId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId: outsiderId, role: "employer" });
	return outsiderId;
};

describe("teams.resubmitInvitation", () => {
	it("resets a rejected invitation to pending and clears rejectionReason", async () => {
		const seed = await seedRejectedInvite();

		const call = createProcedureClient(teamsRouter.resubmitInvitation, {
			context: ctx(seed.ownerId),
			path: ["bambi", "teams", "resubmitInvitation"],
		});
		await call({ invitationId: seed.inviteId, organizationId: seed.orgId });

		const [row] = await db
			.select({
				rejectionReason: invitation.rejectionReason,
				status: invitation.status,
			})
			.from(invitation)
			.where(eq(invitation.id, seed.inviteId));
		expect(row?.status).toBe("pending");
		expect(row?.rejectionReason).toBeNull();

		await cleanup(seed);
	});

	it("rejects resubmitting a non-rejected invitation with CONFLICT", async () => {
		const seed = await seedRejectedInvite({ status: "pending" });

		const call = createProcedureClient(teamsRouter.resubmitInvitation, {
			context: ctx(seed.ownerId),
			path: ["bambi", "teams", "resubmitInvitation"],
		});
		await expectOrpcCode(
			call({ invitationId: seed.inviteId, organizationId: seed.orgId }),
			"CONFLICT"
		);

		await cleanup(seed);
	});

	it("forbids a non-manager", async () => {
		const seed = await seedRejectedInvite();
		const outsiderId = await seedOutsider();

		const call = createProcedureClient(teamsRouter.resubmitInvitation, {
			context: ctx(outsiderId),
			path: ["bambi", "teams", "resubmitInvitation"],
		});
		await expectOrpcCode(
			call({ invitationId: seed.inviteId, organizationId: seed.orgId }),
			"FORBIDDEN"
		);

		await cleanup({ ...seed, outsiderId });
	});
});

describe("teams.deleteInvitation", () => {
	it("hard-deletes a rejected invitation", async () => {
		const seed = await seedRejectedInvite();

		const call = createProcedureClient(teamsRouter.deleteInvitation, {
			context: ctx(seed.ownerId),
			path: ["bambi", "teams", "deleteInvitation"],
		});
		await call({ invitationId: seed.inviteId, organizationId: seed.orgId });

		const rows = await db
			.select({ id: invitation.id })
			.from(invitation)
			.where(eq(invitation.id, seed.inviteId));
		expect(rows).toHaveLength(0);

		await cleanup(seed);
	});

	it("rejects deleting a non-rejected invitation with CONFLICT", async () => {
		const seed = await seedRejectedInvite({ status: "pending" });

		const call = createProcedureClient(teamsRouter.deleteInvitation, {
			context: ctx(seed.ownerId),
			path: ["bambi", "teams", "deleteInvitation"],
		});
		await expectOrpcCode(
			call({ invitationId: seed.inviteId, organizationId: seed.orgId }),
			"CONFLICT"
		);

		await cleanup(seed);
	});

	it("forbids a non-manager", async () => {
		const seed = await seedRejectedInvite();
		const outsiderId = await seedOutsider();

		const call = createProcedureClient(teamsRouter.deleteInvitation, {
			context: ctx(outsiderId),
			path: ["bambi", "teams", "deleteInvitation"],
		});
		await expectOrpcCode(
			call({ invitationId: seed.inviteId, organizationId: seed.orgId }),
			"FORBIDDEN"
		);

		await cleanup({ ...seed, outsiderId });
	});
});

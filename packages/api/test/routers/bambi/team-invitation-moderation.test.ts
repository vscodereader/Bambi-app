import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("@/routers/bambi/moderation"),
	]);

const { user, organization, member, team, teamMember, invitation } = authSchema;
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

// 검증된 조직 + owner(inviter) + 팀 1개 + 초대 대상 employer + pending 초대를 만든다.
const seedPendingInvite = async (options?: {
	withTeam?: boolean;
	expired?: boolean;
	inviteeAlreadyMember?: boolean;
}) => {
	const withTeam = options?.withTeam ?? true;
	const ownerId = `user_owner_${randomUUID()}`;
	const inviteeId = `user_invitee_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;
	const teamId = `team_${randomUUID()}`;
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
	if (withTeam) {
		await db.insert(team).values({
			id: teamId,
			name: "1팀",
			organizationId: orgId,
			createdAt: new Date(),
		});
	}
	if (options?.inviteeAlreadyMember) {
		await db.insert(member).values({
			id: `member_${randomUUID()}`,
			organizationId: orgId,
			userId: inviteeId,
			role: "staff",
			createdAt: new Date(),
		});
	}
	const inviteId = `invitation_${randomUUID()}`;
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + (options?.expired ? -1 : 14));
	await db.insert(invitation).values({
		id: inviteId,
		organizationId: orgId,
		email: inviteeEmail,
		role: "staff",
		teamId: withTeam ? teamId : null,
		status: "pending",
		expiresAt,
		inviterId: ownerId,
	});

	return { ownerId, inviteeId, orgId, teamId, inviteeEmail, inviteId };
};

const cleanup = async (ids: {
	ownerId: string;
	inviteeId: string;
	orgId: string;
	adminId?: string;
}) => {
	if (ids.adminId) {
		await db
			.delete(adminModerationAction)
			.where(inArray(adminModerationAction.adminUserId, [ids.adminId]));
	}
	// invitation/member/teamMember/team/orgProfile 은 organization onDelete cascade
	await db.delete(organization).where(eq(organization.id, ids.orgId));
	await db
		.delete(user)
		.where(inArray(user.id, [ids.ownerId, ids.inviteeId, ids.adminId ?? ""]));
};

describe("listPendingTeamInvitations", () => {
	it("returns pending invitations with org/team/invitee info for admin", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite();

		const list = createProcedureClient(
			moderationRouter.listPendingTeamInvitations,
			{
				context: ctx(adminId),
				path: ["bambi", "moderation", "listPendingTeamInvitations"],
			}
		);

		const rows = (await list({})) as Array<{
			id: string;
			organizationName: string | null;
			teamName: string | null;
			inviteeName: string | null;
			email: string;
			isExpired: boolean;
		}>;
		const found = rows.find((r) => r.id === seed.inviteId);
		expect(found).toBeDefined();
		expect(found?.organizationName).toBe("업소 표시명");
		expect(found?.teamName).toBe("1팀");
		expect(found?.inviteeName).toBe("초대대상");
		expect(found?.email).toBe(seed.inviteeEmail);
		expect(found?.isExpired).toBe(false);

		await cleanup({ ...seed, adminId });
	});

	it("forbids non-admin", async () => {
		const seed = await seedPendingInvite();

		const list = createProcedureClient(
			moderationRouter.listPendingTeamInvitations,
			{
				context: ctx(seed.ownerId),
				path: ["bambi", "moderation", "listPendingTeamInvitations"],
			}
		);

		await expectOrpcCode(list({}), "FORBIDDEN");
		await cleanup(seed);
	});
});

describe("setTeamInvitationStatus", () => {
	const callSet = (adminId: string) =>
		createProcedureClient(moderationRouter.setTeamInvitationStatus, {
			context: ctx(adminId),
			path: ["bambi", "moderation", "setTeamInvitationStatus"],
		});

	it("accepts an invite and creates member + teamMember", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite({ withTeam: true });

		const result = (await callSet(adminId)({
			invitationId: seed.inviteId,
			status: "accepted",
		})) as { status: string; acceptedUserId: string | null };
		expect(result.status).toBe("accepted");
		expect(result.acceptedUserId).toBe(seed.inviteeId);

		const memberRows = await db
			.select()
			.from(member)
			.where(eq(member.userId, seed.inviteeId));
		expect(memberRows.some((m) => m.organizationId === seed.orgId)).toBe(true);

		const teamMemberRows = await db
			.select()
			.from(teamMember)
			.where(eq(teamMember.userId, seed.inviteeId));
		expect(teamMemberRows.some((t) => t.teamId === seed.teamId)).toBe(true);

		await cleanup({ ...seed, adminId });
	});

	it("accepts an org-only invite (no teamId) creating member only", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite({ withTeam: false });

		await callSet(adminId)({ invitationId: seed.inviteId, status: "accepted" });

		const teamMemberRows = await db
			.select()
			.from(teamMember)
			.where(eq(teamMember.userId, seed.inviteeId));
		expect(teamMemberRows.length).toBe(0);

		await cleanup({ ...seed, adminId });
	});

	it("does not duplicate member when invitee already a member", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite({
			withTeam: true,
			inviteeAlreadyMember: true,
		});

		await callSet(adminId)({ invitationId: seed.inviteId, status: "accepted" });

		const memberRows = await db
			.select()
			.from(member)
			.where(eq(member.userId, seed.inviteeId));
		const orgMembers = memberRows.filter(
			(m) => m.organizationId === seed.orgId
		);
		expect(orgMembers.length).toBe(1);

		await cleanup({ ...seed, adminId });
	});

	it("rejects an invite with reason and stores it", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite();

		const result = (await callSet(adminId)({
			invitationId: seed.inviteId,
			status: "rejected",
			reason: "부적합",
		})) as { status: string; rejectionReason: string | null };
		expect(result.status).toBe("rejected");
		expect(result.rejectionReason).toBe("부적합");

		const memberRows = await db
			.select()
			.from(member)
			.where(eq(member.userId, seed.inviteeId));
		expect(memberRows.some((m) => m.organizationId === seed.orgId)).toBe(false);

		await cleanup({ ...seed, adminId });
	});

	it("blocks accepting an expired invite", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite({ expired: true });

		await expectOrpcCode(
			callSet(adminId)({ invitationId: seed.inviteId, status: "accepted" }),
			"CONFLICT"
		);

		await cleanup({ ...seed, adminId });
	});

	it("forbids non-admin", async () => {
		const seed = await seedPendingInvite();

		await expectOrpcCode(
			callSet(seed.ownerId)({
				invitationId: seed.inviteId,
				status: "accepted",
			}),
			"FORBIDDEN"
		);

		await cleanup(seed);
	});
});

import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { teamsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/teams"),
]);

const { user, organization, member, team, teamMember, invitation } = authSchema;
const { bambiProfile, employerOrganizationProfile, employerTeamProfile } =
	bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

const call = (userId: string) =>
	createProcedureClient(teamsRouter.deleteTeam, {
		context: ctx(userId),
		path: ["bambi", "teams", "deleteTeam"],
	});

const seedOrgWithTeam = async () => {
	const ownerId = `user_owner_${randomUUID()}`;
	const staffId = `user_staff_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;
	const teamId = `team_${randomUUID()}`;
	const staffMemberId = `member_${randomUUID()}`;

	await db.insert(user).values([
		{ id: ownerId, name: "업주", email: `${ownerId}@bambi.test` },
		{ id: staffId, name: "스태프", email: `${staffId}@bambi.test` },
	]);
	await db.insert(bambiProfile).values([
		{ userId: ownerId, role: "employer" },
		{ userId: staffId, role: "employer" },
	]);
	await db
		.insert(organization)
		.values({ id: orgId, name: "업소", slug: orgId, createdAt: new Date() });
	await db.insert(employerOrganizationProfile).values({
		organizationId: orgId,
		displayName: "업소 표시명",
		verificationStatus: "verified",
	});
	await db.insert(member).values([
		{
			id: `member_${randomUUID()}`,
			organizationId: orgId,
			userId: ownerId,
			role: "owner",
			createdAt: new Date(),
		},
		{
			id: staffMemberId,
			organizationId: orgId,
			userId: staffId,
			role: "staff",
			createdAt: new Date(),
		},
	]);
	await db.insert(team).values({
		id: teamId,
		name: "1팀",
		organizationId: orgId,
		createdAt: new Date(),
	});
	await db.insert(employerTeamProfile).values({
		organizationId: orgId,
		teamId,
		displayName: "1팀 표시명",
	});

	return { orgId, ownerId, staffId, staffMemberId, teamId };
};

const cleanup = async (userIds: string[], orgIds: string[]) => {
	await db.delete(organization).where(inArray(organization.id, orgIds));
	await db.delete(user).where(inArray(user.id, userIds));
};

describe("teams.deleteTeam", () => {
	it("deletes the team and its employerTeamProfile, and nulls terminal invitation refs", async () => {
		const seed = await seedOrgWithTeam();
		// 반려된 초대가 이 팀을 가리킨다 → 삭제 후 teamId가 null로 정리되어야 한다.
		const inviteId = `invitation_${randomUUID()}`;
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 14);
		await db.insert(invitation).values({
			id: inviteId,
			organizationId: seed.orgId,
			email: `x_${randomUUID()}@bambi.test`,
			role: "staff",
			teamId: seed.teamId,
			status: "rejected",
			rejectionReason: "정보 확인 불가",
			expiresAt,
			inviterId: seed.ownerId,
		});

		await call(seed.ownerId)({
			organizationId: seed.orgId,
			teamId: seed.teamId,
		});

		expect(
			await db
				.select({ id: team.id })
				.from(team)
				.where(eq(team.id, seed.teamId))
		).toHaveLength(0);
		expect(
			await db
				.select({ id: employerTeamProfile.id })
				.from(employerTeamProfile)
				.where(eq(employerTeamProfile.teamId, seed.teamId))
		).toHaveLength(0);
		const [invite] = await db
			.select({ teamId: invitation.teamId })
			.from(invitation)
			.where(eq(invitation.id, inviteId));
		expect(invite?.teamId).toBeNull();

		await cleanup([seed.ownerId, seed.staffId], [seed.orgId]);
	});

	it("rejects deletion when a team member remains (CONFLICT)", async () => {
		const seed = await seedOrgWithTeam();
		await db.insert(teamMember).values({
			id: `tm_${randomUUID()}`,
			teamId: seed.teamId,
			userId: seed.staffId,
			createdAt: new Date(),
		});

		await expectOrpcCode(
			call(seed.ownerId)({ organizationId: seed.orgId, teamId: seed.teamId }),
			"CONFLICT"
		);
		expect(
			await db
				.select({ id: team.id })
				.from(team)
				.where(eq(team.id, seed.teamId))
		).toHaveLength(1);

		await cleanup([seed.ownerId, seed.staffId], [seed.orgId]);
	});

	it("rejects deletion when a pending invitation targets the team (CONFLICT)", async () => {
		const seed = await seedOrgWithTeam();
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 14);
		await db.insert(invitation).values({
			id: `invitation_${randomUUID()}`,
			organizationId: seed.orgId,
			email: `p_${randomUUID()}@bambi.test`,
			role: "staff",
			teamId: seed.teamId,
			status: "pending",
			expiresAt,
			inviterId: seed.ownerId,
		});

		await expectOrpcCode(
			call(seed.ownerId)({ organizationId: seed.orgId, teamId: seed.teamId }),
			"CONFLICT"
		);
		expect(
			await db
				.select({ id: team.id })
				.from(team)
				.where(eq(team.id, seed.teamId))
		).toHaveLength(1);

		await cleanup([seed.ownerId, seed.staffId], [seed.orgId]);
	});

	it("forbids a non-manager actor", async () => {
		const seed = await seedOrgWithTeam();

		await expectOrpcCode(
			call(seed.staffId)({ organizationId: seed.orgId, teamId: seed.teamId }),
			"FORBIDDEN"
		);

		await cleanup([seed.ownerId, seed.staffId], [seed.orgId]);
	});

	it("rejects deleting a team from another organization", async () => {
		const seed = await seedOrgWithTeam();
		const otherOrgId = `org_${randomUUID()}`;
		const otherTeamId = `team_${randomUUID()}`;
		await db.insert(organization).values({
			id: otherOrgId,
			name: "타업소",
			slug: otherOrgId,
			createdAt: new Date(),
		});
		await db.insert(team).values({
			id: otherTeamId,
			name: "타팀",
			organizationId: otherOrgId,
			createdAt: new Date(),
		});

		await expectOrpcCode(
			call(seed.ownerId)({
				organizationId: seed.orgId,
				teamId: otherTeamId,
			}),
			"FORBIDDEN"
		);

		await cleanup([seed.ownerId, seed.staffId], [seed.orgId, otherOrgId]);
	});
});

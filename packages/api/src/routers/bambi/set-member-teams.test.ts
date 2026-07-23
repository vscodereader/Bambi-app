import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { teamsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./teams"),
]);

const { user, organization, member, team, teamMember } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

const call = (userId: string) =>
	createProcedureClient(teamsRouter.setMemberTeams, {
		context: ctx(userId),
		path: ["bambi", "teams", "setMemberTeams"],
	});

// 검증된 조직 + owner/manager/staff + team1(staff 소속)/team2를 만든다.
const seedOrg = async () => {
	const ownerId = `user_owner_${randomUUID()}`;
	const managerId = `user_manager_${randomUUID()}`;
	const staffId = `user_staff_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;
	const team1Id = `team_${randomUUID()}`;
	const team2Id = `team_${randomUUID()}`;
	const staffMemberId = `member_${randomUUID()}`;

	await db.insert(user).values([
		{ id: ownerId, name: "업주", email: `${ownerId}@bambi.test` },
		{ id: managerId, name: "매니저", email: `${managerId}@bambi.test` },
		{ id: staffId, name: "스태프", email: `${staffId}@bambi.test` },
	]);
	await db.insert(bambiProfile).values([
		{ userId: ownerId, role: "employer", displayName: "업주" },
		{ userId: managerId, role: "employer", displayName: "매니저" },
		{ userId: staffId, role: "employer", displayName: "스태프" },
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
			id: `member_${randomUUID()}`,
			organizationId: orgId,
			userId: managerId,
			role: "manager",
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
	await db.insert(team).values([
		{ id: team1Id, name: "1팀", organizationId: orgId, createdAt: new Date() },
		{ id: team2Id, name: "2팀", organizationId: orgId, createdAt: new Date() },
	]);
	await db.insert(teamMember).values({
		id: `tm_${randomUUID()}`,
		teamId: team1Id,
		userId: staffId,
		createdAt: new Date(),
	});

	return {
		managerId,
		orgId,
		ownerId,
		staffId,
		staffMemberId,
		team1Id,
		team2Id,
	};
};

const cleanup = async (userIds: string[], orgIds: string[]) => {
	// member/team/teamMember/orgProfile 은 organization onDelete cascade
	await db.delete(organization).where(inArray(organization.id, orgIds));
	await db.delete(user).where(inArray(user.id, userIds));
};

const teamIdsForUser = async (userId: string, orgTeamIds: string[]) => {
	const rows = await db
		.select({ teamId: teamMember.teamId })
		.from(teamMember)
		.where(
			and(eq(teamMember.userId, userId), inArray(teamMember.teamId, orgTeamIds))
		);
	return rows.map((row) => row.teamId).sort();
};

describe("teams.setMemberTeams", () => {
	it("replaces the member's team memberships within the organization", async () => {
		const seed = await seedOrg();

		await call(seed.ownerId)({
			memberId: seed.staffMemberId,
			organizationId: seed.orgId,
			teamIds: [seed.team2Id],
		});

		expect(
			await teamIdsForUser(seed.staffId, [seed.team1Id, seed.team2Id])
		).toEqual([seed.team2Id]);

		await cleanup([seed.ownerId, seed.managerId, seed.staffId], [seed.orgId]);
	});

	it("allows an empty array (no team membership)", async () => {
		const seed = await seedOrg();

		await call(seed.ownerId)({
			memberId: seed.staffMemberId,
			organizationId: seed.orgId,
			teamIds: [],
		});

		expect(
			await teamIdsForUser(seed.staffId, [seed.team1Id, seed.team2Id])
		).toEqual([]);

		await cleanup([seed.ownerId, seed.managerId, seed.staffId], [seed.orgId]);
	});

	it("lets a manager change memberships", async () => {
		const seed = await seedOrg();

		await call(seed.managerId)({
			memberId: seed.staffMemberId,
			organizationId: seed.orgId,
			teamIds: [seed.team1Id, seed.team2Id],
		});

		expect(
			await teamIdsForUser(seed.staffId, [seed.team1Id, seed.team2Id])
		).toEqual([seed.team1Id, seed.team2Id].sort());

		await cleanup([seed.ownerId, seed.managerId, seed.staffId], [seed.orgId]);
	});

	it("rejects a team from another organization", async () => {
		const seed = await seedOrg();
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
				memberId: seed.staffMemberId,
				organizationId: seed.orgId,
				teamIds: [otherTeamId],
			}),
			"FORBIDDEN"
		);
		// team1 소속은 그대로 유지되어야 한다.
		expect(
			await teamIdsForUser(seed.staffId, [seed.team1Id, seed.team2Id])
		).toEqual([seed.team1Id]);

		await cleanup(
			[seed.ownerId, seed.managerId, seed.staffId],
			[seed.orgId, otherOrgId]
		);
	});

	it("rejects a target that is not a member of the organization", async () => {
		const seed = await seedOrg();

		await expectOrpcCode(
			call(seed.ownerId)({
				memberId: `member_${randomUUID()}`,
				organizationId: seed.orgId,
				teamIds: [seed.team1Id],
			}),
			"NOT_FOUND"
		);

		await cleanup([seed.ownerId, seed.managerId, seed.staffId], [seed.orgId]);
	});

	it("forbids a non-manager actor", async () => {
		const seed = await seedOrg();

		await expectOrpcCode(
			call(seed.staffId)({
				memberId: seed.staffMemberId,
				organizationId: seed.orgId,
				teamIds: [seed.team2Id],
			}),
			"FORBIDDEN"
		);

		await cleanup([seed.ownerId, seed.managerId, seed.staffId], [seed.orgId]);
	});
});

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

// 검증된 조직 + owner/manager/staff 멤버 + staff의 팀 소속을 만든다.
const seedOrgWithMembers = async () => {
	const ownerId = `user_owner_${randomUUID()}`;
	const staffId = `user_staff_${randomUUID()}`;
	const managerId = `user_manager_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;
	const teamId = `team_${randomUUID()}`;
	const ownerMemberId = `member_${randomUUID()}`;
	const staffMemberId = `member_${randomUUID()}`;
	const managerMemberId = `member_${randomUUID()}`;

	await db.insert(user).values([
		{ id: ownerId, name: "업주", email: `${ownerId}@bambi.test` },
		{ id: staffId, name: "스태프", email: `${staffId}@bambi.test` },
		{ id: managerId, name: "매니저", email: `${managerId}@bambi.test` },
	]);
	await db.insert(bambiProfile).values([
		{ userId: ownerId, role: "employer" },
		{ userId: staffId, role: "employer" },
		{ userId: managerId, role: "employer" },
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
			id: ownerMemberId,
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
		{
			id: managerMemberId,
			organizationId: orgId,
			userId: managerId,
			role: "manager",
			createdAt: new Date(),
		},
	]);
	await db.insert(team).values({
		id: teamId,
		name: "1팀",
		organizationId: orgId,
		createdAt: new Date(),
	});
	await db.insert(teamMember).values({
		id: `tm_${randomUUID()}`,
		teamId,
		userId: staffId,
		createdAt: new Date(),
	});

	return {
		managerId,
		managerMemberId,
		orgId,
		ownerId,
		ownerMemberId,
		staffId,
		staffMemberId,
		teamId,
	};
};

const cleanup = async (ids: {
	managerId: string;
	orgId: string;
	ownerId: string;
	staffId: string;
}) => {
	// member/team/teamMember/orgProfile 은 organization onDelete cascade
	await db.delete(organization).where(eq(organization.id, ids.orgId));
	await db
		.delete(user)
		.where(inArray(user.id, [ids.ownerId, ids.staffId, ids.managerId]));
};

describe("teams.removeMember", () => {
	it("owner removes an active member and their team memberships", async () => {
		const seed = await seedOrgWithMembers();

		const call = createProcedureClient(teamsRouter.removeMember, {
			context: ctx(seed.ownerId),
			path: ["bambi", "teams", "removeMember"],
		});
		await call({ memberId: seed.staffMemberId, organizationId: seed.orgId });

		const remainingMembers = await db
			.select({ id: member.id })
			.from(member)
			.where(eq(member.id, seed.staffMemberId));
		expect(remainingMembers).toHaveLength(0);

		const remainingTeamMembers = await db
			.select({ userId: teamMember.userId })
			.from(teamMember)
			.where(
				and(
					eq(teamMember.teamId, seed.teamId),
					eq(teamMember.userId, seed.staffId)
				)
			);
		expect(remainingTeamMembers).toHaveLength(0);

		await cleanup(seed);
	});

	it("forbids removing an owner", async () => {
		const seed = await seedOrgWithMembers();

		const call = createProcedureClient(teamsRouter.removeMember, {
			context: ctx(seed.ownerId),
			path: ["bambi", "teams", "removeMember"],
		});
		await expectOrpcCode(
			call({ memberId: seed.ownerMemberId, organizationId: seed.orgId }),
			"FORBIDDEN"
		);

		await cleanup(seed);
	});

	it("forbids a non-owner actor", async () => {
		const seed = await seedOrgWithMembers();

		const call = createProcedureClient(teamsRouter.removeMember, {
			context: ctx(seed.managerId),
			path: ["bambi", "teams", "removeMember"],
		});
		await expectOrpcCode(
			call({ memberId: seed.staffMemberId, organizationId: seed.orgId }),
			"FORBIDDEN"
		);

		await cleanup(seed);
	});
});

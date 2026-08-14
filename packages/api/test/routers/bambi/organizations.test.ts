import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({
	path: "../../apps/server/.env",
});

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

const { invitation, member, organization, team, teamMember, user } = authSchema;
const { bambiProfile, employerOrganizationProfile, employerTeamProfile } =
	bambiSchema;

interface OrganizationFixture {
	inviteeUserId: string;
	managerMemberId: string;
	managerUserId: string;
	organizationId: string;
	otherOrganizationId: string;
	otherOwnerUserId: string;
	ownerUserId: string;
	staffUserId: string;
	teamId: string;
	userIds: string[];
}

// 초대 대상 이메일은 employer로 가입된 계정만 허용되므로 고정 이메일로 픽스처 생성.
const INVITEE_EMAIL = "new-staff@bambi.test";

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: {
			user: {
				id: userId,
			},
		},
	}) as Context;

const makeEmail = (prefix: string): string =>
	`${prefix}-${randomUUID()}@bambi.test`;

const createOrganizationFixture = async (): Promise<OrganizationFixture> => {
	const now = new Date();
	const organizationId = `org_test_${randomUUID()}`;
	const otherOrganizationId = `org_test_${randomUUID()}`;
	const teamId = `team_test_${randomUUID()}`;
	const ownerUserId = `user_test_owner_${randomUUID()}`;
	const managerUserId = `user_test_manager_${randomUUID()}`;
	const staffUserId = `user_test_staff_${randomUUID()}`;
	const otherOwnerUserId = `user_test_other_owner_${randomUUID()}`;
	const inviteeUserId = `user_test_invitee_${randomUUID()}`;
	const managerMemberId = `member_test_manager_${randomUUID()}`;
	const userRows = [
		{ email: makeEmail("owner"), id: ownerUserId, name: "조직 소유자" },
		{ email: makeEmail("manager"), id: managerUserId, name: "조직 매니저" },
		{ email: makeEmail("staff"), id: staffUserId, name: "조직 스태프" },
		{
			email: makeEmail("other-owner"),
			id: otherOwnerUserId,
			name: "다른 조직 소유자",
		},
		{ email: INVITEE_EMAIL, id: inviteeUserId, name: "초대 대상 스태프" },
	];

	await db.insert(user).values(userRows);
	await db.insert(organization).values([
		{
			createdAt: now,
			id: organizationId,
			name: "테스트 조직",
			slug: `test-${randomUUID()}`,
		},
		{
			createdAt: now,
			id: otherOrganizationId,
			name: "다른 테스트 조직",
			slug: `other-test-${randomUUID()}`,
		},
	]);
	await db.insert(bambiProfile).values(
		userRows.map((row) => ({
			isPhoneVerified: true,
			role: "employer" as const,
			status: "active" as const,
			userId: row.id,
		}))
	);
	await db.insert(member).values([
		{
			createdAt: now,
			id: `member_test_owner_${randomUUID()}`,
			organizationId,
			role: "owner",
			userId: ownerUserId,
		},
		{
			createdAt: now,
			id: managerMemberId,
			organizationId,
			role: "manager",
			userId: managerUserId,
		},
		{
			createdAt: now,
			id: `member_test_staff_${randomUUID()}`,
			organizationId,
			role: "staff",
			userId: staffUserId,
		},
		{
			createdAt: now,
			id: `member_test_other_owner_${randomUUID()}`,
			organizationId: otherOrganizationId,
			role: "owner",
			userId: otherOwnerUserId,
		},
	]);
	await db.insert(team).values({
		createdAt: now,
		id: teamId,
		name: "강남점",
		organizationId,
		updatedAt: now,
	});
	await db.insert(teamMember).values({
		createdAt: now,
		id: `team_member_test_staff_${randomUUID()}`,
		teamId,
		userId: staffUserId,
	});
	await db.insert(employerOrganizationProfile).values([
		{
			businessRegistrationNumber: "111-22-33333",
			displayName: "테스트 조직",
			organizationId,
			verificationStatus: "verified",
		},
		{
			businessRegistrationNumber: "999-88-77777",
			displayName: "다른 테스트 조직",
			organizationId: otherOrganizationId,
			verificationStatus: "verified",
		},
	]);
	await db.insert(employerTeamProfile).values({
		displayName: "강남점",
		organizationId,
		region: "서울 강남구",
		teamId,
	});

	return {
		inviteeUserId,
		managerMemberId,
		managerUserId,
		organizationId,
		otherOrganizationId,
		otherOwnerUserId,
		ownerUserId,
		staffUserId,
		teamId,
		userIds: [
			ownerUserId,
			managerUserId,
			staffUserId,
			otherOwnerUserId,
			inviteeUserId,
		],
	};
};

const cleanupOrganizationFixture = async (
	fixture: OrganizationFixture
): Promise<void> => {
	await db
		.delete(invitation)
		.where(
			inArray(invitation.organizationId, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
	await db
		.delete(employerTeamProfile)
		.where(eq(employerTeamProfile.organizationId, fixture.organizationId));
	await db.delete(teamMember).where(eq(teamMember.teamId, fixture.teamId));
	await db.delete(team).where(eq(team.id, fixture.teamId));
	await db
		.delete(employerOrganizationProfile)
		.where(
			inArray(employerOrganizationProfile.organizationId, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
	await db
		.delete(member)
		.where(
			inArray(member.organizationId, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
	await db
		.delete(organization)
		.where(
			inArray(organization.id, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
};

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

describe("bambi organization and team routers", () => {
	it("lists only manageable organization settings for the current employer", async () => {
		const fixture = await createOrganizationFixture();

		try {
			const getMine = createProcedureClient(organizationsRouter.getMine, {
				context: createContextForUser(fixture.managerUserId),
				path: ["bambi", "organizations", "getMine"],
			});

			const result = await getMine();

			expect(result).toEqual([
				expect.objectContaining({
					canInviteMembers: true,
					canManageOrganization: false,
					displayName: "테스트 조직",
					organizationId: fixture.organizationId,
					role: "manager",
				}),
			]);
		} finally {
			await cleanupOrganizationFixture(fixture);
		}
	});

	it("denies organization profile updates across organization boundaries", async () => {
		const fixture = await createOrganizationFixture();

		try {
			const updateProfile = createProcedureClient(
				organizationsRouter.updateProfile,
				{
					context: createContextForUser(fixture.otherOwnerUserId),
					path: ["bambi", "organizations", "updateProfile"],
				}
			);

			await expectOrpcCode(
				updateProfile({
					displayName: "경계 밖 수정",
					organizationId: fixture.organizationId,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupOrganizationFixture(fixture);
		}
	});

	it("allows manager invitations and exposes pending member metadata", async () => {
		const fixture = await createOrganizationFixture();

		try {
			const inviteMember = createProcedureClient(teamsRouter.inviteMember, {
				context: createContextForUser(fixture.managerUserId),
				path: ["bambi", "teams", "inviteMember"],
			});
			const listMembers = createProcedureClient(
				organizationsRouter.listMembers,
				{
					context: createContextForUser(fixture.managerUserId),
					path: ["bambi", "organizations", "listMembers"],
				}
			);

			const invited = await inviteMember({
				email: "new-staff@bambi.test",
				organizationId: fixture.organizationId,
				reason: "신규 지점 운영 지원을 위한 초대입니다.",
				role: "staff",
				teamId: fixture.teamId,
			});
			const members = await listMembers({
				organizationId: fixture.organizationId,
			});

			expect(invited).toMatchObject({
				email: "new-staff@bambi.test",
				organizationId: fixture.organizationId,
				role: "staff",
				status: "pending",
				teamId: fixture.teamId,
			});
			expect(members).toContainEqual(
				expect.objectContaining({
					acceptedUserId: null,
					invitedEmail: "new-staff@bambi.test",
					role: "staff",
					status: "pending",
				})
			);
		} finally {
			await cleanupOrganizationFixture(fixture);
		}
	});

	it("allows only owners to change active member roles", async () => {
		const fixture = await createOrganizationFixture();

		try {
			const managerSetMemberRole = createProcedureClient(
				teamsRouter.setMemberRole,
				{
					context: createContextForUser(fixture.managerUserId),
					path: ["bambi", "teams", "setMemberRole"],
				}
			);
			const ownerSetMemberRole = createProcedureClient(
				teamsRouter.setMemberRole,
				{
					context: createContextForUser(fixture.ownerUserId),
					path: ["bambi", "teams", "setMemberRole"],
				}
			);

			await expectOrpcCode(
				managerSetMemberRole({
					memberId: fixture.managerMemberId,
					organizationId: fixture.organizationId,
					role: "staff",
				}),
				"FORBIDDEN"
			);

			const updated = await ownerSetMemberRole({
				memberId: fixture.managerMemberId,
				organizationId: fixture.organizationId,
				role: "staff",
			});

			expect(updated).toMatchObject({
				id: fixture.managerMemberId,
				role: "staff",
			});
		} finally {
			await cleanupOrganizationFixture(fixture);
		}
	});

	it("rejects promoting a member to owner via setMemberRole", async () => {
		const fixture = await createOrganizationFixture();

		try {
			const ownerSetMemberRole = createProcedureClient(
				teamsRouter.setMemberRole,
				{
					context: createContextForUser(fixture.ownerUserId),
					path: ["bambi", "teams", "setMemberRole"],
				}
			);

			// 일반 역할 변경으로는 소유자 승격이 막혀야 한다(소유권 이전 전용 경로만 허용).
			await expectOrpcCode(
				ownerSetMemberRole({
					memberId: fixture.managerMemberId,
					organizationId: fixture.organizationId,
					role: "owner",
				}),
				"FORBIDDEN"
			);

			const [managerRow] = await db
				.select({ role: member.role })
				.from(member)
				.where(eq(member.id, fixture.managerMemberId));

			expect(managerRow?.role).toBe("manager");
		} finally {
			await cleanupOrganizationFixture(fixture);
		}
	});

	it("transfers ownership: demotes the current owner and promotes the target", async () => {
		const fixture = await createOrganizationFixture();

		try {
			const managerTransfer = createProcedureClient(
				teamsRouter.transferOwnership,
				{
					context: createContextForUser(fixture.managerUserId),
					path: ["bambi", "teams", "transferOwnership"],
				}
			);
			const ownerTransfer = createProcedureClient(
				teamsRouter.transferOwnership,
				{
					context: createContextForUser(fixture.ownerUserId),
					path: ["bambi", "teams", "transferOwnership"],
				}
			);

			// 소유자만 이전을 시작할 수 있다.
			await expectOrpcCode(
				managerTransfer({
					memberId: fixture.managerMemberId,
					organizationId: fixture.organizationId,
				}),
				"FORBIDDEN"
			);

			const result = await ownerTransfer({
				memberId: fixture.managerMemberId,
				organizationId: fixture.organizationId,
			});

			expect(result).toEqual({ success: true });

			// 기존 소유자는 매니저로 강등, 대상은 소유자로 승격된다.
			const [previousOwner] = await db
				.select({ role: member.role })
				.from(member)
				.where(
					and(
						eq(member.organizationId, fixture.organizationId),
						eq(member.userId, fixture.ownerUserId)
					)
				);
			const [newOwner] = await db
				.select({ role: member.role })
				.from(member)
				.where(eq(member.id, fixture.managerMemberId));

			expect(previousOwner?.role).toBe("manager");
			expect(newOwner?.role).toBe("owner");
		} finally {
			await cleanupOrganizationFixture(fixture);
		}
	});
});

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

const { user, organization, member, invitation } = authSchema;
const { bambiProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const makeEmployer = async (label: string) => {
	const userId = `user_inv_${randomUUID()}`;
	const email = `${label}_${userId}@bambi.test`;
	await db.insert(user).values({
		id: userId,
		name: label,
		email,
	});
	await db
		.insert(bambiProfile)
		.values({ userId, role: "employer", displayName: label });
	return { userId, email };
};

describe("searchEmployerInvitees", () => {
	it("returns employer accounts filtered by query, excluding self and members", async () => {
		const { userId: ownerId } = await makeEmployer("소유자");
		const { userId: targetId } = await makeEmployer("김초대");
		const seekerId = `user_inv_${randomUUID()}`;
		await db.insert(user).values({
			id: seekerId,
			name: "김구직",
			email: `seeker_${seekerId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId: seekerId, role: "job_seeker", displayName: "김구직" });

		const organizationId = `org_${randomUUID()}`;
		await db.insert(organization).values({
			createdAt: new Date(),
			id: organizationId,
			name: "org",
			slug: `org-${randomUUID().slice(0, 8)}`,
		});
		await db.insert(member).values({
			createdAt: new Date(),
			id: `member_${randomUUID()}`,
			organizationId,
			userId: ownerId,
			role: "owner",
		});

		const search = createProcedureClient(teamsRouter.searchEmployerInvitees, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "searchEmployerInvitees"],
		});

		// "김"으로 검색 → 김초대(employer)만. 김구직은 job_seeker라 제외.
		const results = await search({ organizationId, query: "김" });
		const ids = results.map((r) => r.userId);
		expect(ids).toContain(targetId);
		expect(ids).not.toContain(seekerId);
		expect(ids).not.toContain(ownerId); // 본인 제외
		const target = results.find((r) => r.userId === targetId);
		expect(target?.name).toBe("김초대");
		expect(typeof target?.email).toBe("string");

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(user).where(eq(user.id, targetId));
		await db.delete(user).where(eq(user.id, seekerId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("excludes employers with a pending invitation and existing non-caller members", async () => {
		// 고유 태그로 이 테스트가 시드한 employer만 검색되게 좁힌다.
		const tag = `t${randomUUID().slice(0, 8)}`;
		const { userId: ownerId } = await makeEmployer(`${tag}오너`);
		const { userId: pendingId, email: pendingEmail } = await makeEmployer(
			`${tag}대기`
		);
		const { userId: memberId } = await makeEmployer(`${tag}멤버`);
		const { userId: candidateId } = await makeEmployer(`${tag}후보`);

		const organizationId = `org_${randomUUID()}`;
		await db.insert(organization).values({
			createdAt: new Date(),
			id: organizationId,
			name: "org",
			slug: `org-${randomUUID().slice(0, 8)}`,
		});
		// 호출자(owner)와, 호출자가 아닌 기존 멤버(memberId)를 조직에 넣는다.
		await db.insert(member).values([
			{
				createdAt: new Date(),
				id: `member_${randomUUID()}`,
				organizationId,
				userId: ownerId,
				role: "owner",
			},
			{
				createdAt: new Date(),
				id: `member_${randomUUID()}`,
				organizationId,
				userId: memberId,
				role: "staff",
			},
		]);
		// pendingId 이메일로 pending 초대를 만들어 둔다.
		await db.insert(invitation).values({
			id: `invitation_${randomUUID()}`,
			organizationId,
			email: pendingEmail.toLowerCase(),
			status: "pending",
			expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
			inviterId: ownerId,
			role: "staff",
		});

		const search = createProcedureClient(teamsRouter.searchEmployerInvitees, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "searchEmployerInvitees"],
		});

		const results = await search({ organizationId, query: tag });
		const ids = results.map((r) => r.userId);
		expect(ids).toContain(candidateId); // 후보는 노출
		expect(ids).not.toContain(pendingId); // pending 초대 이메일 제외
		expect(ids).not.toContain(memberId); // 호출자 아닌 기존 멤버 제외
		expect(ids).not.toContain(ownerId); // 본인 제외

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(user).where(eq(user.id, pendingId));
		await db.delete(user).where(eq(user.id, memberId));
		await db.delete(user).where(eq(user.id, candidateId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});
});

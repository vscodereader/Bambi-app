import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { jobsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./jobs"),
]);

const { user, organization, member } = authSchema;
const { bambiProfile, employerOrganizationProfile, jobPost } = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const now = new Date();

interface Fixture {
	jobPostId: string;
	managerUserId: string;
	organizationId: string;
}

const createFixture = async (): Promise<Fixture> => {
	const managerUserId = `user_test_manager_${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;

	await db.insert(user).values({
		id: managerUserId,
		name: "매니저",
		email: `mgr-${randomUUID()}@bambi.test`,
	});
	await db.insert(bambiProfile).values({
		displayName: "매니저",
		isPhoneVerified: true,
		role: "employer",
		status: "active",
		userId: managerUserId,
	});
	await db.insert(organization).values({
		id: organizationId,
		name: "테스트 사업장",
		slug: `test-org-${randomUUID()}`,
		createdAt: now,
	});
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId,
		userId: managerUserId,
		role: "manager",
		status: "active",
		createdAt: now,
	});
	await db.insert(employerOrganizationProfile).values({
		organizationId,
		displayName: "테스트 사업장",
		verificationStatus: "verified",
	});
	const [post] = await db
		.insert(jobPost)
		.values({
			organizationId,
			teamId: null,
			createdByUserId: managerUserId,
			status: "published",
			title: "팀 미지정 조직 공고",
			industryCategory: "다방" as const,
			region: "서울 강남구",
			payAmount: 12_000,
			payUnit: "시급",
			workSchedule: "평일 09:00-18:00",
			description: "테스트용 공고 상세 설명입니다. 최소 길이를 충족합니다.",
			exposureType: "standard",
			paymentStatus: "paid",
			publishedAt: now,
		})
		.returning();

	if (!post) {
		throw new Error("job post fixture insert failed");
	}

	return { jobPostId: post.id, managerUserId, organizationId };
};

const cleanupFixture = async (fixture: Fixture) => {
	await db.delete(jobPost).where(eq(jobPost.id, fixture.jobPostId));
	// employerOrganizationProfile·member는 organization cascade로 함께 제거된다.
	await db
		.delete(organization)
		.where(eq(organization.id, fixture.organizationId));
	await db
		.delete(bambiProfile)
		.where(eq(bambiProfile.userId, fixture.managerUserId));
	await db.delete(user).where(eq(user.id, fixture.managerUserId));
};

// 회귀 가드: 목록 필터가 raw role("owner"/"admin")만 비교하면 canonical "manager"가
// 팀 미지정(조직 전체) 공고를 목록에서 잃는다 — 팀 삭제(teamId=set null) 후 특히 치명적.
describe("jobs.listMine 매니저 조직 공고 노출", () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await createFixture();
		return async () => {
			await cleanupFixture(fixture);
		};
	});

	it("canonical manager 멤버도 팀 미지정(조직 전체) 공고를 목록에서 본다", async () => {
		const client = createProcedureClient(jobsRouter.listMine, {
			context: createContextForUser(fixture.managerUserId),
			path: ["bambi", "jobs", "listMine"],
		});

		const rows = await client();

		expect(rows.map((row) => row.id)).toContain(fixture.jobPostId);
	});
});

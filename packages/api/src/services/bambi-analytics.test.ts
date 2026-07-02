import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, analytics] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./bambi-analytics"),
]);

const { organization, user } = authSchema;
const { employerOrganizationProfile, jobPerformanceEvent, jobPost } =
	bambiSchema;
const { getRecentJobPerformanceMetrics } = analytics;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Fixture {
	jobA: string;
	jobB: string;
	jobC: string;
	organizationId: string;
	userId: string;
}

const createFixture = async (): Promise<Fixture> => {
	const now = new Date();
	const organizationId = `org_test_${randomUUID()}`;
	const userId = `user_test_${randomUUID()}`;
	const jobA = randomUUID();
	const jobB = randomUUID();
	const jobC = randomUUID();

	await db.insert(user).values({
		email: `analytics-${randomUUID()}@bambi.test`,
		id: userId,
		name: "성과 집계 테스트 유저",
	});
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "성과 집계 테스트 조직",
		slug: `analytics-${randomUUID()}`,
	});
	await db.insert(employerOrganizationProfile).values({
		displayName: "성과 집계 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});
	await db.insert(jobPost).values(
		[jobA, jobB, jobC].map((id, index) => ({
			createdByUserId: userId,
			description: "성과 집계 테스트 공고입니다.",
			id,
			industryCategory: "라운지",
			organizationId,
			payAmount: 180_000,
			payUnit: "일급",
			publishedAt: now,
			region: "서울 강남구",
			status: "published" as const,
			title: `성과 집계 테스트 공고 ${index}`,
			workSchedule: "20:00-02:00",
		}))
	);

	const recent = (hoursAgo: number): Date =>
		new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

	await db.insert(jobPerformanceEvent).values([
		// jobA: 최근 7일 impression 3, detail_view 2 + 제외 대상 이벤트
		{
			createdAt: recent(1),
			eventType: "impression",
			jobPostId: jobA,
			organizationId,
		},
		{
			createdAt: recent(2),
			eventType: "impression",
			jobPostId: jobA,
			organizationId,
		},
		{
			createdAt: recent(3),
			eventType: "impression",
			jobPostId: jobA,
			organizationId,
		},
		{
			createdAt: recent(4),
			eventType: "detail_view",
			jobPostId: jobA,
			organizationId,
		},
		{
			createdAt: recent(5),
			eventType: "detail_view",
			jobPostId: jobA,
			organizationId,
		},
		// 제외: chat_start / contact_reveal
		{
			createdAt: recent(6),
			eventType: "chat_start",
			jobPostId: jobA,
			organizationId,
		},
		{
			createdAt: recent(7),
			eventType: "contact_reveal",
			jobPostId: jobA,
			organizationId,
		},
		// 제외: 7일 이전
		{
			createdAt: new Date(now.getTime() - 8 * DAY_MS),
			eventType: "impression",
			jobPostId: jobA,
			organizationId,
		},
		{
			createdAt: new Date(now.getTime() - 9 * DAY_MS),
			eventType: "detail_view",
			jobPostId: jobA,
			organizationId,
		},
		// jobB: detail_view 1
		{
			createdAt: recent(1),
			eventType: "detail_view",
			jobPostId: jobB,
			organizationId,
		},
		// jobC: 이벤트 없음
	]);

	return { jobA, jobB, jobC, organizationId, userId };
};

const cleanupFixture = async (fixture: Fixture): Promise<void> => {
	const jobIds = [fixture.jobA, fixture.jobB, fixture.jobC];

	await db
		.delete(jobPerformanceEvent)
		.where(inArray(jobPerformanceEvent.jobPostId, jobIds));
	await db.delete(jobPost).where(inArray(jobPost.id, jobIds));
	await db
		.delete(employerOrganizationProfile)
		.where(
			inArray(employerOrganizationProfile.organizationId, [
				fixture.organizationId,
			])
		);
	await db
		.delete(organization)
		.where(inArray(organization.id, [fixture.organizationId]));
	await db.delete(user).where(inArray(user.id, [fixture.userId]));
};

describe("getRecentJobPerformanceMetrics", () => {
	it("aggregates only impression/detail_view within the last 7 days for many jobs at once", async () => {
		const fixture = await createFixture();

		try {
			const metrics = await getRecentJobPerformanceMetrics([
				fixture.jobA,
				fixture.jobB,
				fixture.jobC,
			]);

			// 7일 이내 impression/detail_view만, chat_start/contact_reveal·7일 이전 제외
			expect(metrics.get(fixture.jobA)).toEqual({
				detailViews: 2,
				impressions: 3,
			});
			expect(metrics.get(fixture.jobB)).toEqual({
				detailViews: 1,
				impressions: 0,
			});
			// 이벤트 없는 공고는 0
			expect(metrics.get(fixture.jobC)).toEqual({
				detailViews: 0,
				impressions: 0,
			});
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("returns an empty map for an empty id list without querying", async () => {
		const metrics = await getRecentJobPerformanceMetrics([]);

		expect(metrics.size).toBe(0);
	});
});

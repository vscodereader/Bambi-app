import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { analyticsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./analytics"),
	]);

const { member, organization, user } = authSchema;
const { bambiProfile, jobPerformanceEvent, jobPost } = bambiSchema;

interface AnalyticsFixture {
	organizationId: string;
	otherJobPostId: string;
	otherOrganizationId: string;
	otherOwnerUserId: string;
	ownerUserId: string;
	primaryJobPostId: string;
	userIds: string[];
}

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

const createAnalyticsFixture = async (): Promise<AnalyticsFixture> => {
	const now = new Date();
	const organizationId = `org_test_${randomUUID()}`;
	const otherOrganizationId = `org_test_${randomUUID()}`;
	const ownerUserId = `user_test_owner_${randomUUID()}`;
	const otherOwnerUserId = `user_test_other_owner_${randomUUID()}`;
	const primaryJobPostId = randomUUID();
	const otherJobPostId = randomUUID();
	const userRows = [
		{ email: makeEmail("owner"), id: ownerUserId, name: "조직 소유자" },
		{
			email: makeEmail("other-owner"),
			id: otherOwnerUserId,
			name: "다른 조직 소유자",
		},
	];

	await db.insert(user).values(userRows);
	await db.insert(organization).values([
		{
			createdAt: now,
			id: organizationId,
			name: "분석 테스트 조직",
			slug: `analytics-${randomUUID()}`,
		},
		{
			createdAt: now,
			id: otherOrganizationId,
			name: "다른 분석 테스트 조직",
			slug: `analytics-other-${randomUUID()}`,
		},
	]);
	await db.insert(bambiProfile).values(
		userRows.map((row) => ({
			displayName: row.name,
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
			id: `member_test_other_owner_${randomUUID()}`,
			organizationId: otherOrganizationId,
			role: "owner",
			userId: otherOwnerUserId,
		},
	]);
	await db.insert(jobPost).values([
		{
			createdByUserId: ownerUserId,
			description: "분석 이벤트 집계를 검증하는 공고입니다.",
			id: primaryJobPostId,
			industryCategory: "룸싸롱",
			organizationId,
			payAmount: 180_000,
			payUnit: "일급",
			publishedAt: now,
			region: "서울 강남구",
			status: "published",
			title: "분석 테스트 공고",
			workSchedule: "20:00-02:00",
		},
		{
			createdByUserId: otherOwnerUserId,
			description: "다른 조직의 분석 이벤트입니다.",
			id: otherJobPostId,
			industryCategory: "BAR",
			organizationId: otherOrganizationId,
			payAmount: 170_000,
			payUnit: "일급",
			publishedAt: now,
			region: "서울 서초구",
			status: "published",
			title: "다른 조직 공고",
			workSchedule: "18:00-23:00",
		},
	]);
	await db.insert(jobPerformanceEvent).values([
		{
			eventType: "impression",
			jobPostId: primaryJobPostId,
			metadata: {
				exposureType: "special",
				position: 0,
				section: "special",
			},
			organizationId,
		},
		{
			eventType: "impression",
			jobPostId: primaryJobPostId,
			metadata: {
				exposureType: "urgent",
				position: 0,
				section: "urgent",
			},
			organizationId,
		},
		{
			eventType: "impression",
			jobPostId: primaryJobPostId,
			metadata: {
				exposureType: "recommended",
				position: 0,
				section: "recommended",
			},
			organizationId,
		},
		{
			// 하위 호환: 구 캠페인 기반으로 기록된 legacy "premium" 섹션(스페셜로 흡수)
			eventType: "impression",
			jobPostId: primaryJobPostId,
			metadata: {
				position: 1,
				promotionTier: "premium",
				section: "premium",
			},
			organizationId,
		},
		{
			eventType: "impression",
			jobPostId: primaryJobPostId,
			metadata: {
				position: 0,
				section: "organic",
			},
			organizationId,
		},
		{
			eventType: "impression",
			jobPostId: primaryJobPostId,
			metadata: {
				exposureType: "premium-banner",
				position: 0,
				section: "premium-banner",
			},
			organizationId,
		},
		{
			eventType: "impression",
			jobPostId: primaryJobPostId,
			metadata: {
				exposureType: "left-banner",
				position: 0,
				section: "left-banner",
			},
			organizationId,
		},
		{
			eventType: "impression",
			jobPostId: primaryJobPostId,
			metadata: {
				exposureType: "right-banner",
				position: 0,
				section: "right-banner",
			},
			organizationId,
		},
		{
			actorUserId: ownerUserId,
			eventType: "detail_view",
			jobPostId: primaryJobPostId,
			organizationId,
		},
		{
			actorUserId: ownerUserId,
			eventType: "chat_start",
			jobPostId: primaryJobPostId,
			organizationId,
		},
		{
			actorUserId: ownerUserId,
			eventType: "contact_reveal",
			jobPostId: primaryJobPostId,
			organizationId,
		},
		{
			eventType: "detail_view",
			jobPostId: otherJobPostId,
			organizationId: otherOrganizationId,
		},
	]);

	return {
		organizationId,
		otherJobPostId,
		otherOrganizationId,
		otherOwnerUserId,
		ownerUserId,
		primaryJobPostId,
		userIds: [ownerUserId, otherOwnerUserId],
	};
};

const cleanupAnalyticsFixture = async (
	fixture: AnalyticsFixture
): Promise<void> => {
	await db
		.delete(jobPerformanceEvent)
		.where(
			inArray(jobPerformanceEvent.jobPostId, [
				fixture.primaryJobPostId,
				fixture.otherJobPostId,
			])
		);
	await db
		.delete(jobPost)
		.where(
			inArray(jobPost.id, [fixture.primaryJobPostId, fixture.otherJobPostId])
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

describe("bambi analytics router", () => {
	it("returns per-job performance counts scoped to manageable organizations", async () => {
		const fixture = await createAnalyticsFixture();

		try {
			const summary = createProcedureClient(analyticsRouter.summary, {
				context: createContextForUser(fixture.ownerUserId),
				path: ["bambi", "analytics", "summary"],
			});

			const result = await summary();

			expect(result).toEqual([
				expect.objectContaining({
					jobPostId: fixture.primaryJobPostId,
					metrics: {
						chatStarts: 1,
						contactReveals: 1,
						detailViews: 1,
						impressions: 8,
					},
					organizationId: fixture.organizationId,
					sectionMetrics: {
						leftBannerImpressions: 1,
						organicImpressions: 1,
						premiumBannerImpressions: 1,
						recommendedImpressions: 1,
						rightBannerImpressions: 1,
						// 스페셜(1) + legacy premium(1) 흡수 = 2
						specialImpressions: 2,
						urgentImpressions: 1,
					},
					title: "분석 테스트 공고",
				}),
			]);
		} finally {
			await cleanupAnalyticsFixture(fixture);
		}
	});
});

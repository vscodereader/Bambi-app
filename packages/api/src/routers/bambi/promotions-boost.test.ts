import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { promotionsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./promotions"),
	]);

const { member, organization, user } = authSchema;
const {
	adPlacement,
	adProduct,
	bambiProfile,
	employerOrganizationProfile,
	jobBoostEvent,
	jobPost,
} = bambiSchema;

interface BoostFixture {
	adJobId: string;
	adPlacementId: string;
	adProductId: string;
	employerUserId: string;
	freeJobId: string;
	jobPostIds: string[];
	memberId: string;
	organizationId: string;
	unpaidAdJobId: string;
}

const HOUR_MS = 60 * 60 * 1000;

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

const createBoostFixture = async (): Promise<BoostFixture> => {
	const now = new Date();
	const future = new Date(now.getTime() + 24 * HOUR_MS);
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const memberId = `member_test_${randomUUID()}`;
	const adPlacementId = randomUUID();
	const adProductId = randomUUID();

	const adJobId = randomUUID();
	const unpaidAdJobId = randomUUID();
	const freeJobId = randomUUID();
	const jobPostIds = [adJobId, unpaidAdJobId, freeJobId];

	await db.insert(user).values({
		email: makeEmail("employer"),
		id: employerUserId,
		name: "채용 담당자",
	});
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "끌어올리기 테스트 조직",
		slug: `promotion-boost-${randomUUID()}`,
	});
	await db.insert(member).values({
		createdAt: now,
		id: memberId,
		organizationId,
		role: "owner",
		userId: employerUserId,
	});
	await db.insert(bambiProfile).values({
		displayName: "채용 담당자",
		isPhoneVerified: true,
		role: "employer",
		status: "active",
		userId: employerUserId,
	});
	await db.insert(employerOrganizationProfile).values({
		displayName: "끌어올리기 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});
	await db.insert(adPlacement).values({
		id: adPlacementId,
		kind: "listing",
		name: "목록 상단 노출",
	});
	await db.insert(adProduct).values({
		id: adProductId,
		manualBoostsPerDay: 2,
		name: "스페셜 광고",
		placementId: adPlacementId,
		priceOptions: [{ amount: 10_000, days: 7 }],
	});

	const baseJob = (overrides: {
		adProductId: string | null;
		exposureEndsAt: Date | null;
		id: string;
		paymentStatus: "paid" | "unpaid";
		title: string;
	}) => ({
		createdByUserId: employerUserId,
		description: "끌어올리기 자격을 검증하기 위한 공고입니다.",
		industryCategory: "라운지",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		publishedAt: now,
		region: `promotion-boost-${randomUUID()}`,
		status: "published" as const,
		workSchedule: "20:00-02:00",
		...overrides,
	});

	await db.insert(jobPost).values([
		baseJob({
			adProductId,
			exposureEndsAt: future,
			id: adJobId,
			paymentStatus: "paid",
			title: "광고 결제 완료 공고",
		}),
		baseJob({
			adProductId,
			exposureEndsAt: future,
			id: unpaidAdJobId,
			paymentStatus: "unpaid",
			title: "광고 미결제 공고",
		}),
		baseJob({
			adProductId: null,
			exposureEndsAt: null,
			id: freeJobId,
			paymentStatus: "paid",
			title: "무료 일반 공고",
		}),
	]);

	return {
		adJobId,
		adPlacementId,
		adProductId,
		employerUserId,
		freeJobId,
		jobPostIds,
		memberId,
		organizationId,
		unpaidAdJobId,
	};
};

const cleanupBoostFixture = async (target: BoostFixture): Promise<void> => {
	await db
		.delete(jobBoostEvent)
		.where(inArray(jobBoostEvent.jobPostId, target.jobPostIds));
	await db.delete(jobPost).where(inArray(jobPost.id, target.jobPostIds));
	await db.delete(adProduct).where(eq(adProduct.id, target.adProductId));
	await db.delete(adPlacement).where(eq(adPlacement.id, target.adPlacementId));
	await db
		.delete(employerOrganizationProfile)
		.where(
			eq(employerOrganizationProfile.organizationId, target.organizationId)
		);
	await db.delete(member).where(eq(member.id, target.memberId));
	await db
		.delete(bambiProfile)
		.where(eq(bambiProfile.userId, target.employerUserId));
	await db.delete(user).where(eq(user.id, target.employerUserId));
	await db
		.delete(organization)
		.where(eq(organization.id, target.organizationId));
};

let fixture: BoostFixture;

const boostAs = (userId: string, jobPostId: string) =>
	createProcedureClient(promotionsRouter.boost, {
		context: createContextForUser(userId),
		path: ["bambi", "promotions", "boost"],
	})({ jobPostId });

const listMyAdsAs = (userId: string) =>
	createProcedureClient(promotionsRouter.listMyAds, {
		context: createContextForUser(userId),
		path: ["bambi", "promotions", "listMyAds"],
	})(undefined);

// 케이스는 위→아래로 순차 실행되며 boost 카운트가 케이스 간 누적된다.
// (boost 2회 성공 후 listMyAds가 boostsUsedToday: 2를 관측한다.)
describe("promotions boost/listMyAds", () => {
	beforeAll(async () => {
		fixture = await createBoostFixture();
	});

	afterAll(async () => {
		await cleanupBoostFixture(fixture);
	});

	describe("promotions.boost", () => {
		it("boosts a paid published ad job and records an event", async () => {
			const result = await boostAs(fixture.employerUserId, fixture.adJobId);
			expect(result.boostsUsedToday).toBe(1);

			const [post] = await db
				.select({ boostedAt: jobPost.boostedAt })
				.from(jobPost)
				.where(eq(jobPost.id, fixture.adJobId));
			expect(post?.boostedAt).not.toBeNull();

			const events = await db
				.select({ id: jobBoostEvent.id, boostType: jobBoostEvent.boostType })
				.from(jobBoostEvent)
				.where(eq(jobBoostEvent.jobPostId, fixture.adJobId));
			expect(events).toHaveLength(1);
			expect(events[0]?.boostType).toBe("manual");
		});

		it("rejects when the daily limit is exhausted", async () => {
			await boostAs(fixture.employerUserId, fixture.adJobId); // 2회째(위 테스트 포함)
			await expect(
				boostAs(fixture.employerUserId, fixture.adJobId)
			).rejects.toMatchObject({
				message: "오늘 끌어올리기 횟수를 모두 사용했습니다.",
			});
		});

		it("rejects unpaid ad jobs and non-ad jobs", async () => {
			await expect(
				boostAs(fixture.employerUserId, fixture.unpaidAdJobId)
			).rejects.toMatchObject({
				message: "공개 중(결제 완료·게시)인 공고만 끌어올릴 수 있습니다.",
			});
			await expect(
				boostAs(fixture.employerUserId, fixture.freeJobId)
			).rejects.toMatchObject({
				message: "광고 상품이 적용된 공고만 끌어올릴 수 있습니다.",
			});
		});
	});

	describe("promotions.listMyAds", () => {
		it("lists only ad jobs with product name and today's usage", async () => {
			const ads = await listMyAdsAs(fixture.employerUserId);
			const ids = ads.map((ad) => ad.jobPostId);
			expect(ids).toContain(fixture.adJobId);
			expect(ids).toContain(fixture.unpaidAdJobId);
			expect(ids).not.toContain(fixture.freeJobId);

			const adJob = ads.find((ad) => ad.jobPostId === fixture.adJobId);
			expect(adJob?.manualBoostsPerDay).toBe(2);
			expect(adJob?.boostsUsedToday).toBe(2);
			expect(adJob?.adProductName).toBeTruthy();
		});
	});
});

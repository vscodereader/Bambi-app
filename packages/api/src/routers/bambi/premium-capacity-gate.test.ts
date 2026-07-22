import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [
	{ db },
	authSchema,
	bambiSchema,
	{ moderationRouter },
	{ PREMIUM_AD_CAPACITY, countActivePremiumBanners },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./moderation"),
	import("../../services/bambi-premium-capacity"),
]);

const { organization, user } = authSchema;
const {
	adPlacement,
	adProduct,
	bambiProfile,
	employerOrganizationProfile,
	jobPost,
} = bambiSchema;

const HOUR_MS = 60 * 60 * 1000;

const createContextForUser = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

interface GateFixture {
	adminUserId: string;
	employerUserId: string;
	organizationId: string;
	placementId: string;
	productId: string;
	userIds: string[];
}

let fixture: GateFixture;

const createGateFixture = async (): Promise<GateFixture> => {
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const placementId = randomUUID();

	await db.insert(user).values([
		{
			email: `admin-${randomUUID()}@bambi.test`,
			id: adminUserId,
			name: "운영자",
		},
		{
			email: `emp-${randomUUID()}@bambi.test`,
			id: employerUserId,
			name: "구인자",
		},
	]);
	await db.insert(bambiProfile).values([
		{
			displayName: "운영자",
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
		{
			displayName: "구인자",
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		},
	]);
	await db.insert(organization).values({
		createdAt: new Date(),
		id: organizationId,
		name: "정원 게이트 테스트 업체",
		slug: `premium-gate-${randomUUID()}`,
	});
	await db.insert(employerOrganizationProfile).values({
		displayName: "정원 게이트 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});
	await db.insert(adPlacement).values({
		id: placementId,
		isActive: true,
		kind: "banner",
		name: "프리미엄 배너",
		sortOrder: 0,
	});
	const [product] = await db
		.insert(adProduct)
		.values({
			benefits: [],
			isActive: true,
			name: "프리미엄 배너 상품",
			placementId,
			previewTemplate: "premium-top",
			priceOptions: [{ amount: 300_000, days: 30 }],
			sortOrder: 0,
		})
		.returning();
	if (!product) {
		throw new Error("adProduct seed failed");
	}

	return {
		adminUserId,
		employerUserId,
		organizationId,
		placementId,
		productId: product.id,
		userIds: [adminUserId, employerUserId],
	};
};

const cleanupGateFixture = async (target: GateFixture): Promise<void> => {
	await db
		.delete(adProduct)
		.where(inArray(adProduct.placementId, [target.placementId]));
	await db
		.delete(adPlacement)
		.where(inArray(adPlacement.id, [target.placementId]));
	await db
		.delete(employerOrganizationProfile)
		.where(
			inArray(employerOrganizationProfile.organizationId, [
				target.organizationId,
			])
		);
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, target.userIds));
	await db.delete(user).where(inArray(user.id, target.userIds));
	await db
		.delete(organization)
		.where(inArray(organization.id, [target.organizationId]));
};

// 배너 공고 1건을 시드하고 id를 돌려준다. paid/published/미만료면 active 후보가 된다.
const insertBannerJob = async (overrides: {
	exposureEndsAt: Date | null;
	paymentStatus: "paid" | "unpaid";
	status: "pending_review" | "published";
}): Promise<string> => {
	const id = randomUUID();
	await db.insert(jobPost).values({
		adProductId: fixture.productId,
		createdByUserId: fixture.employerUserId,
		description: "프리미엄 정원 게이트 검증용 공고입니다.",
		exposureAmount: 300_000,
		exposureDurationDays: 30,
		exposureEndsAt: overrides.exposureEndsAt,
		exposureType: "premium-banner",
		id,
		industryCategory: "룸싸롱",
		organizationId: fixture.organizationId,
		payAmount: 200_000,
		payUnit: "일급",
		paymentStatus: overrides.paymentStatus,
		// 전역 조회 오염 방지용 유니크 region.
		region: `premium-gate-${randomUUID()}`,
		status: overrides.status,
		title: "프리미엄 배너 공고",
		workSchedule: "20:00-02:00",
	});
	return id;
};

const setPayment = (jobPostId: string, paymentStatus: "paid" | "unpaid") =>
	createProcedureClient(moderationRouter.setJobPostPayment, {
		context: createContextForUser(fixture.adminUserId),
		path: ["bambi", "moderation", "setJobPostPayment"],
	})({ jobPostId, paymentStatus });

const bulkSetPayment = (
	jobPostIds: string[],
	paymentStatus: "paid" | "unpaid"
) =>
	createProcedureClient(moderationRouter.bulkSetJobPostPayment, {
		context: createContextForUser(fixture.adminUserId),
		path: ["bambi", "moderation", "bulkSetJobPostPayment"],
	})({ jobPostIds, paymentStatus });

beforeAll(async () => {
	fixture = await createGateFixture();
});

afterAll(async () => {
	await cleanupGateFixture(fixture);
});

describe("프리미엄 정원 승인 게이트", () => {
	it("정원이 가득 차면 배너 승인이 거부되고, 자리가 나면 승인된다", async () => {
		const now = new Date();
		const future = new Date(now.getTime() + 24 * HOUR_MS);
		const past = new Date(now.getTime() - 24 * HOUR_MS);
		const createdIds: string[] = [];

		try {
			// 내 fixture만으로 active를 정원 초과(capacity+1)까지 채운다 — 전역 baseline과
			// 무관하게 global active ≥ capacity가 보장돼 거부 단정이 결정적이다.
			for (let i = 0; i < PREMIUM_AD_CAPACITY + 1; i++) {
				createdIds.push(
					await insertBannerJob({
						exposureEndsAt: future,
						paymentStatus: "paid",
						status: "published",
					})
				);
			}
			const pendingJobId = await insertBannerJob({
				exposureEndsAt: null,
				paymentStatus: "unpaid",
				status: "published",
			});
			createdIds.push(pendingJobId);

			// 정원 초과 → CONFLICT로 거부.
			await expect(setPayment(pendingJobId, "paid")).rejects.toMatchObject({
				code: "CONFLICT",
			});

			// 내 active 필러를 모두 만료시켜 자리를 낸다.
			await db
				.update(jobPost)
				.set({ exposureEndsAt: past })
				.where(
					inArray(jobPost.id, createdIds.slice(0, PREMIUM_AD_CAPACITY + 1))
				);

			// 자리가 실제로 생겼는지(baseline 포함 전역 active < 정원) 확인 후 승인 성공을 본다.
			const activeAfter = await countActivePremiumBanners(db, new Date());
			expect(activeAfter).toBeLessThan(PREMIUM_AD_CAPACITY);

			const approved = await setPayment(pendingJobId, "paid");
			expect(approved.paymentStatus).toBe("paid");
		} finally {
			await db.delete(jobPost).where(inArray(jobPost.id, createdIds));
		}
	});

	it("bulk 승인은 정원 내 항목만 성공하고 초과분은 항목별로 실패한다", async () => {
		const now = new Date();
		const createdIds: string[] = [];

		try {
			// 승인 직전 전역 active를 측정해 남은 자리(room)를 구한다.
			const activeBefore = await countActivePremiumBanners(db, now);
			const room = Math.max(0, PREMIUM_AD_CAPACITY - activeBefore);

			// room + 2건의 미결제 배너를 만들어 일괄 승인 → 앞 room건만 성공해야 한다.
			const total = room + 2;
			for (let i = 0; i < total; i++) {
				createdIds.push(
					await insertBannerJob({
						exposureEndsAt: null,
						paymentStatus: "unpaid",
						status: "published",
					})
				);
			}

			const result = await bulkSetPayment(createdIds, "paid");

			expect(result.total).toBe(total);
			expect(result.succeeded).toBe(room);
			expect(result.failed).toBe(total - room);
			for (const failure of result.failures) {
				expect(failure.code).toBe("CONFLICT");
			}
		} finally {
			await db.delete(jobPost).where(inArray(jobPost.id, createdIds));
		}
	});
});

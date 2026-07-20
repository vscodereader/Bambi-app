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
		manualBoostsPerDay: number;
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

	// 광고 공고는 구매 시점 스냅샷(상품 manualBoostsPerDay=2)을 공고 컬럼에 복사한 상태를 재현한다.
	await db.insert(jobPost).values([
		baseJob({
			adProductId,
			exposureEndsAt: future,
			id: adJobId,
			manualBoostsPerDay: 2,
			paymentStatus: "paid",
			title: "광고 결제 완료 공고",
		}),
		baseJob({
			adProductId,
			exposureEndsAt: future,
			id: unpaidAdJobId,
			manualBoostsPerDay: 2,
			paymentStatus: "unpaid",
			title: "광고 미결제 공고",
		}),
		baseJob({
			adProductId: null,
			exposureEndsAt: null,
			id: freeJobId,
			manualBoostsPerDay: 0,
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
			// 공고 구매 시점 스냅샷 컬럼(jobPost.manualBoostsPerDay) 값을 그대로 반환한다.
			expect(adJob?.manualBoostsPerDay).toBe(2);
			expect(adJob?.boostsUsedToday).toBe(2);
			expect(adJob?.adProductName).toBeTruthy();
		});
	});
});

// 스냅샷 보존: 공고 구매 시점에 복사된 manualBoostsPerDay가 이후 상품 수정과 무관하게
// 끌어올리기 자격을 지배하는지 검증한다(라이브 상품 참조였던 소급 버그의 회귀 방지).
describe("promotions boost 스냅샷 보존", () => {
	const now = new Date();
	const future = new Date(now.getTime() + 24 * HOUR_MS);
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const memberId = `member_test_${randomUUID()}`;
	const adPlacementId = randomUUID();
	const zeroProductId = randomUUID();
	const boostProductId = randomUUID();
	const zeroSnapshotJobId = randomUUID();
	const boostSnapshotJobId = randomUUID();
	const jobPostIds = [zeroSnapshotJobId, boostSnapshotJobId];

	const snapshotJob = (overrides: {
		adProductId: string;
		id: string;
		manualBoostsPerDay: number;
		title: string;
	}) => ({
		createdByUserId: employerUserId,
		description: "스냅샷 보존을 검증하기 위한 공고입니다.",
		exposureEndsAt: future,
		industryCategory: "라운지",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		paymentStatus: "paid" as const,
		publishedAt: now,
		region: `boost-snapshot-${randomUUID()}`,
		status: "published" as const,
		workSchedule: "20:00-02:00",
		...overrides,
	});

	beforeAll(async () => {
		await db.insert(user).values({
			email: makeEmail("snapshot"),
			id: employerUserId,
			name: "스냅샷 담당자",
		});
		await db.insert(organization).values({
			createdAt: now,
			id: organizationId,
			name: "스냅샷 테스트 조직",
			slug: `boost-snapshot-${randomUUID()}`,
		});
		await db.insert(member).values({
			createdAt: now,
			id: memberId,
			organizationId,
			role: "owner",
			userId: employerUserId,
		});
		await db.insert(bambiProfile).values({
			displayName: "스냅샷 담당자",
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		});
		await db.insert(employerOrganizationProfile).values({
			displayName: "스냅샷 테스트 업체",
			organizationId,
			verificationStatus: "verified",
		});
		await db.insert(adPlacement).values({
			id: adPlacementId,
			kind: "listing",
			name: "목록 상단 노출",
		});
		// 구매 시점 상품 상태: zeroProduct는 끌올 0회, boostProduct는 끌올 3회.
		await db.insert(adProduct).values([
			{
				id: zeroProductId,
				manualBoostsPerDay: 0,
				name: "끌올 미포함 광고",
				placementId: adPlacementId,
				priceOptions: [{ amount: 10_000, days: 7 }],
			},
			{
				id: boostProductId,
				manualBoostsPerDay: 3,
				name: "끌올 포함 광고",
				placementId: adPlacementId,
				priceOptions: [{ amount: 20_000, days: 7 }],
			},
		]);
		// 각 공고는 구매 시점 상품 값을 그대로 스냅샷으로 복사한다.
		await db.insert(jobPost).values([
			snapshotJob({
				adProductId: zeroProductId,
				id: zeroSnapshotJobId,
				manualBoostsPerDay: 0,
				title: "끌올 0회 스냅샷 공고",
			}),
			snapshotJob({
				adProductId: boostProductId,
				id: boostSnapshotJobId,
				manualBoostsPerDay: 3,
				title: "끌올 3회 스냅샷 공고",
			}),
		]);
		// 구매 후 운영자가 상품 끌올 횟수를 반대로 수정한다(0→5, 3→0). 스냅샷 공고에는 소급되면 안 된다.
		await db
			.update(adProduct)
			.set({ manualBoostsPerDay: 5 })
			.where(eq(adProduct.id, zeroProductId));
		await db
			.update(adProduct)
			.set({ manualBoostsPerDay: 0 })
			.where(eq(adProduct.id, boostProductId));
	});

	afterAll(async () => {
		await db
			.delete(jobBoostEvent)
			.where(inArray(jobBoostEvent.jobPostId, jobPostIds));
		await db.delete(jobPost).where(inArray(jobPost.id, jobPostIds));
		await db
			.delete(adProduct)
			.where(inArray(adProduct.id, [zeroProductId, boostProductId]));
		await db.delete(adPlacement).where(eq(adPlacement.id, adPlacementId));
		await db
			.delete(employerOrganizationProfile)
			.where(eq(employerOrganizationProfile.organizationId, organizationId));
		await db.delete(member).where(eq(member.id, memberId));
		await db
			.delete(bambiProfile)
			.where(eq(bambiProfile.userId, employerUserId));
		await db.delete(user).where(eq(user.id, employerUserId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("상품 끌올 0회로 구매한 공고는 상품을 5회로 올려도 여전히 거부한다", async () => {
		await expect(
			boostAs(employerUserId, zeroSnapshotJobId)
		).rejects.toMatchObject({
			message: "이 광고 상품에는 끌어올리기가 포함되어 있지 않습니다.",
		});
	});

	it("상품 끌올 3회로 구매한 공고는 상품을 0회로 내려도 여전히 성공한다", async () => {
		const result = await boostAs(employerUserId, boostSnapshotJobId);
		expect(result.boostsUsedToday).toBe(1);
	});

	it("listMyAds는 라이브 상품이 아니라 공고 스냅샷 값을 반환한다", async () => {
		const ads = await listMyAdsAs(employerUserId);
		const zeroJob = ads.find((ad) => ad.jobPostId === zeroSnapshotJobId);
		const boostJob = ads.find((ad) => ad.jobPostId === boostSnapshotJobId);
		expect(zeroJob?.manualBoostsPerDay).toBe(0);
		expect(boostJob?.manualBoostsPerDay).toBe(3);
	});
});

// 수동 카운트 타입 필터 회귀: 자동('auto') 이벤트가 수동 일일 한도를 잠식하면 안 된다.
// boost 사용량 카운트가 boostType='manual'만 세는지(자동 이벤트 무시) 검증한다.
describe("promotions boost 수동 카운트 타입 필터", () => {
	const now = new Date();
	const future = new Date(now.getTime() + 24 * HOUR_MS);
	const organizationId = `org_test_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const memberId = `member_test_${randomUUID()}`;
	const adPlacementId = randomUUID();
	const adProductId = randomUUID();
	const jobId = randomUUID();

	beforeAll(async () => {
		await db.insert(user).values({
			email: makeEmail("type-filter"),
			id: employerUserId,
			name: "타입 필터 담당자",
		});
		await db.insert(organization).values({
			createdAt: now,
			id: organizationId,
			name: "타입 필터 테스트 조직",
			slug: `type-filter-${randomUUID()}`,
		});
		await db.insert(member).values({
			createdAt: now,
			id: memberId,
			organizationId,
			role: "owner",
			userId: employerUserId,
		});
		await db.insert(bambiProfile).values({
			displayName: "타입 필터 담당자",
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		});
		await db.insert(employerOrganizationProfile).values({
			displayName: "타입 필터 테스트 업체",
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
			manualBoostsPerDay: 1,
			name: "수동 1회 광고",
			placementId: adPlacementId,
			priceOptions: [{ amount: 10_000, days: 7 }],
		});
		await db.insert(jobPost).values({
			adProductId,
			createdByUserId: employerUserId,
			description: "수동 카운트 타입 필터를 검증하기 위한 공고입니다.",
			exposureEndsAt: future,
			id: jobId,
			industryCategory: "라운지",
			manualBoostsPerDay: 1,
			organizationId,
			payAmount: 180_000,
			payUnit: "일급",
			paymentStatus: "paid",
			publishedAt: now,
			region: `type-filter-${randomUUID()}`,
			status: "published",
			title: "타입 필터 공고",
			workSchedule: "20:00-02:00",
		});
		// 오늘 자동('auto') 이벤트 1건을 미리 심는다. 수동 한도(1) 판정에 포함되면 안 된다.
		await db.insert(jobBoostEvent).values({
			actorUserId: employerUserId,
			boostType: "auto",
			jobPostId: jobId,
			organizationId,
		});
	});

	afterAll(async () => {
		await db.delete(jobBoostEvent).where(eq(jobBoostEvent.jobPostId, jobId));
		await db.delete(jobPost).where(eq(jobPost.id, jobId));
		await db.delete(adProduct).where(eq(adProduct.id, adProductId));
		await db.delete(adPlacement).where(eq(adPlacement.id, adPlacementId));
		await db
			.delete(employerOrganizationProfile)
			.where(eq(employerOrganizationProfile.organizationId, organizationId));
		await db.delete(member).where(eq(member.id, memberId));
		await db
			.delete(bambiProfile)
			.where(eq(bambiProfile.userId, employerUserId));
		await db.delete(user).where(eq(user.id, employerUserId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("자동 이벤트는 수동 한도를 잠식하지 않아 수동 끌어올리기가 여전히 가능하다", async () => {
		// 자동 1건이 이미 있어도 수동 사용량은 0으로 세어 수동 boost가 성공한다.
		const result = await boostAs(employerUserId, jobId);
		expect(result.boostsUsedToday).toBe(1);
	});

	it("수동 한도 소진 후에는 자동 이벤트와 무관하게 거부한다", async () => {
		// 수동 1회를 쓴 뒤에는 한도 초과로 거부(자동 이벤트는 여전히 카운트에서 제외).
		await expect(boostAs(employerUserId, jobId)).rejects.toMatchObject({
			message: "오늘 끌어올리기 횟수를 모두 사용했습니다.",
		});
	});
});

import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
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
const {
	bambiProfile,
	employerOrganizationProfile,
	adPlacement,
	adProduct,
	jobIndustryCategory,
	jobPost,
} = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

// jobPostInput의 필수 코어 필드 + 케이스별로 덧씌우는 노출 필드(모두 nullish)만 담는다.
interface JobUpdateData {
	adProductId?: string | null;
	description: string;
	exposureDurationDays?: number | null;
	industryCategory: (typeof jobIndustryCategory.enumValues)[number];
	organizationId: string;
	payAmount: number;
	paymentMethod?: "bank_transfer" | "card" | null;
	payUnit: string;
	region: string;
	title: string;
	workSchedule: string;
}

interface ExposureFixture {
	employerUserId: string;
	jobPostIds: string[];
	organizationId: string;
	placementId: string;
	productId: string;
}

const now = new Date();

// jobPostInput의 필수 필드를 채운 유효 입력. 각 케이스는 여기에 노출 필드만 덧씌운다.
const buildBaseInput = (organizationId: string) => ({
	organizationId,
	title: "테스트 알바 공고",
	industryCategory: "다방" as const,
	region: "서울 강남구",
	payAmount: 12_000,
	payUnit: "시급",
	workSchedule: "평일 09:00-18:00",
	description: "테스트용 공고 상세 설명입니다. 최소 길이를 충족합니다.",
});

const createExposureFixture = async (): Promise<ExposureFixture> => {
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const placementId = randomUUID();

	await db.insert(user).values({
		id: employerUserId,
		name: "구인자",
		email: `emp-${randomUUID()}@bambi.test`,
	});
	await db.insert(bambiProfile).values({
		isPhoneVerified: true,
		role: "employer",
		status: "active",
		userId: employerUserId,
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
		userId: employerUserId,
		role: "owner",
		status: "active",
		createdAt: now,
	});
	await db.insert(employerOrganizationProfile).values({
		organizationId,
		displayName: "테스트 사업장",
		verificationStatus: "verified",
	});
	await db.insert(adPlacement).values({
		id: placementId,
		name: "스페셜 리스트",
		kind: "listing",
		sortOrder: 0,
		isActive: true,
	});
	const [product] = await db
		.insert(adProduct)
		.values({
			placementId,
			name: "스페셜 노출 30일",
			previewTemplate: "special-list",
			benefits: ["스페셜 섹션 노출"],
			priceOptions: [{ amount: 50_000, days: 30 }],
			sortOrder: 0,
			isActive: true,
		})
		.returning();

	if (!product) {
		throw new Error("ad product fixture insert failed");
	}

	return {
		employerUserId,
		organizationId,
		placementId,
		productId: product.id,
		jobPostIds: [],
	};
};

// 지정한 노출/결제 상태로 공고 1건을 시드하고 id를 반환한다.
const seedJobPost = async (
	fixture: ExposureFixture,
	overrides: {
		adProductId: string | null;
		exposureDurationDays: number | null;
		exposureType: "special" | "standard";
		paymentStatus: "paid" | "unpaid";
		exposureEndsAt: Date | null;
	}
): Promise<string> => {
	const [row] = await db
		.insert(jobPost)
		.values({
			organizationId: fixture.organizationId,
			createdByUserId: fixture.employerUserId,
			status: "published",
			title: "테스트 알바 공고",
			industryCategory: "다방" as const,
			region: "서울 강남구",
			payAmount: 12_000,
			payUnit: "시급",
			workSchedule: "평일 09:00-18:00",
			description: "테스트용 공고 상세 설명입니다. 최소 길이를 충족합니다.",
			adProductId: overrides.adProductId,
			exposureType: overrides.exposureType,
			exposureDurationDays: overrides.exposureDurationDays,
			exposureAmount: overrides.adProductId ? 50_000 : null,
			paymentMethod: overrides.adProductId ? "card" : null,
			paymentStatus: overrides.paymentStatus,
			exposureEndsAt: overrides.exposureEndsAt,
			publishedAt: now,
		})
		.returning();

	if (!row) {
		throw new Error("job post fixture insert failed");
	}

	fixture.jobPostIds.push(row.id);
	return row.id;
};

const cleanupExposureFixture = async (fixture: ExposureFixture) => {
	if (fixture.jobPostIds.length > 0) {
		await db.delete(jobPost).where(inArray(jobPost.id, fixture.jobPostIds));
	}
	await db
		.delete(adProduct)
		.where(eq(adProduct.placementId, fixture.placementId));
	await db.delete(adPlacement).where(eq(adPlacement.id, fixture.placementId));
	// employerOrganizationProfile·member는 organization cascade로 함께 제거된다.
	await db
		.delete(organization)
		.where(eq(organization.id, fixture.organizationId));
	await db
		.delete(bambiProfile)
		.where(eq(bambiProfile.userId, fixture.employerUserId));
	await db.delete(user).where(eq(user.id, fixture.employerUserId));
};

describe("jobs.update 노출 결제 상태 정합성", () => {
	let fixture: ExposureFixture;

	const updateJob = (id: string, data: JobUpdateData) => {
		const client = createProcedureClient(jobsRouter.update, {
			context: createContextForUser(fixture.employerUserId),
			path: ["bambi", "jobs", "update"],
		});
		return client({ id, data });
	};

	beforeAll(async () => {
		fixture = await createExposureFixture();
		return async () => {
			await cleanupExposureFixture(fixture);
		};
	});

	it("무료 공고에 유료 상품을 붙이면 미결제로 전환되고 노출 만료일이 초기화된다", async () => {
		const baseInput = buildBaseInput(fixture.organizationId);
		// 사전: 무료 공고(상품 없음, paid + 만료일 없음)
		const id = await seedJobPost(fixture, {
			adProductId: null,
			exposureDurationDays: null,
			exposureType: "standard",
			paymentStatus: "paid",
			exposureEndsAt: null,
		});

		const updated = await updateJob(id, {
			...baseInput,
			adProductId: fixture.productId,
			exposureDurationDays: 30,
			paymentMethod: "card",
		});

		expect(updated.paymentStatus).toBe("unpaid");
		expect(updated.exposureEndsAt).toBeNull();
	});

	it("유료 결제완료 공고를 무료로 바꾸면 즉시 게시 가능(paid)하고 만료일이 초기화된다", async () => {
		const baseInput = buildBaseInput(fixture.organizationId);
		// 사전: paid + 미래 만료일을 가진 유료 공고
		const id = await seedJobPost(fixture, {
			adProductId: fixture.productId,
			exposureDurationDays: 30,
			exposureType: "special",
			paymentStatus: "paid",
			exposureEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
		});

		const updated = await updateJob(id, {
			...baseInput,
			adProductId: null,
			exposureDurationDays: null,
			paymentMethod: null,
		});

		expect(updated.paymentStatus).toBe("paid");
		expect(updated.exposureEndsAt).toBeNull();
	});

	it("가격 옵션에 할인율이 설정돼 있으면 노출 결제 금액이 할인가로 확정된다", async () => {
		const baseInput = buildBaseInput(fixture.organizationId);
		// 사전: 무료 공고에 유료 상품(옵션 할인 10%)을 붙여 할인가가 스냅샷되는지 본다.
		const id = await seedJobPost(fixture, {
			adProductId: null,
			exposureDurationDays: null,
			exposureType: "standard",
			paymentStatus: "paid",
			exposureEndsAt: null,
		});

		// 공유 fixture 상품의 30일 옵션에 할인율을 걸고, 검증 후 원복한다(다른 테스트에 영향 없게).
		await db
			.update(adProduct)
			.set({
				priceOptions: [{ amount: 50_000, days: 30, discountPercent: 10 }],
			})
			.where(eq(adProduct.id, fixture.productId));
		try {
			const updated = await updateJob(id, {
				...baseInput,
				adProductId: fixture.productId,
				exposureDurationDays: 30,
				paymentMethod: "card",
			});
			// 50_000 * (100-10)/100 = 45_000 (10원 단위 내림)
			expect(updated.exposureAmount).toBe(45_000);
		} finally {
			await db
				.update(adProduct)
				.set({ priceOptions: [{ amount: 50_000, days: 30 }] })
				.where(eq(adProduct.id, fixture.productId));
		}
	});

	it("노출 상품·기간이 그대로면 결제 상태와 만료일을 유지한다", async () => {
		const baseInput = buildBaseInput(fixture.organizationId);
		const futureEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
		// 사전: paid + 미래 만료일을 가진 유료 공고
		const id = await seedJobPost(fixture, {
			adProductId: fixture.productId,
			exposureDurationDays: 30,
			exposureType: "special",
			paymentStatus: "paid",
			exposureEndsAt: futureEndsAt,
		});

		const updated = await updateJob(id, {
			...baseInput,
			adProductId: fixture.productId,
			exposureDurationDays: 30,
			paymentMethod: "card",
		});

		expect(updated.paymentStatus).toBe("paid");
		expect(updated.exposureEndsAt).not.toBeNull();
	});
});

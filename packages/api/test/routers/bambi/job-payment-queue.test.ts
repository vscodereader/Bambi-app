import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("@/routers/bambi/moderation"),
	]);

const { organization, user } = authSchema;
const {
	adPlacement,
	adProduct,
	bambiProfile,
	employerOrganizationProfile,
	jobPost,
} = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

interface PaymentQueueFixture {
	adminUserId: string;
	employerUserId: string;
	// 광고 상품을 선택하지 않은 무료 공고(adProductId 없음).
	freeJobPostId: string;
	jobPostIds: string[];
	// previewTemplate 'none' 상품을 단 미결제 공고(exposureType 'standard').
	noneProductJobPostId: string;
	organizationId: string;
	placementId: string;
	userIds: string[];
}

const createPaymentQueueFixture = async (): Promise<PaymentQueueFixture> => {
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const placementId = randomUUID();
	const noneProductJobPostId = randomUUID();
	const freeJobPostId = randomUUID();

	await db.insert(user).values([
		{
			id: adminUserId,
			name: "운영자",
			email: `admin-${randomUUID()}@bambi.test`,
		},
		{
			id: employerUserId,
			name: "구인자",
			email: `emp-${randomUUID()}@bambi.test`,
		},
	]);
	await db.insert(bambiProfile).values([
		{
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
		{
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		},
	]);
	// organization은 createdAt에 default가 없어 수동 지정이 필요하다.
	await db.insert(organization).values({
		id: organizationId,
		name: "테스트 업체",
		slug: `org-${randomUUID()}`,
		createdAt: new Date(),
	});
	// listJobsForPayment는 employer_organization_profile과 innerJoin하므로 시드 필수.
	await db.insert(employerOrganizationProfile).values({
		organizationId,
		displayName: "테스트 업체",
	});
	await db.insert(adPlacement).values({
		id: placementId,
		name: "일반 리스팅",
		kind: "listing",
		sortOrder: 0,
		isActive: true,
	});
	// previewTemplate 'none' 상품: 유료지만 exposureType은 standard로 남는 상품.
	const [noneProduct] = await db
		.insert(adProduct)
		.values({
			placementId,
			name: "노출만 상품(미리보기 없음)",
			benefits: [],
			priceOptions: [{ amount: 50_000, days: 30 }],
			previewTemplate: "none",
			sortOrder: 0,
			isActive: true,
		})
		.returning();
	if (!noneProduct) {
		throw new Error("adProduct seed failed");
	}

	await db.insert(jobPost).values([
		{
			id: noneProductJobPostId,
			organizationId,
			createdByUserId: employerUserId,
			status: "pending_review",
			industryCategory: "BAR",
			region: "서울 강남구",
			payAmount: 12_000,
			payUnit: "hour",
			workSchedule: "평일 저녁",
			title: "none 상품 미결제 공고",
			description: "previewTemplate none 상품을 단 미결제 공고",
			exposureType: "standard",
			adProductId: noneProduct.id,
			exposureAmount: 50_000,
			exposureDurationDays: 30,
			paymentStatus: "unpaid",
		},
		{
			id: freeJobPostId,
			organizationId,
			createdByUserId: employerUserId,
			status: "pending_review",
			industryCategory: "BAR",
			region: "서울 강남구",
			payAmount: 11_000,
			payUnit: "hour",
			workSchedule: "주말",
			title: "무료 일반 공고",
			description: "광고 상품을 선택하지 않은 무료 공고",
			exposureType: "standard",
			adProductId: null,
			paymentStatus: "unpaid",
		},
	]);

	return {
		adminUserId,
		employerUserId,
		organizationId,
		placementId,
		noneProductJobPostId,
		freeJobPostId,
		jobPostIds: [noneProductJobPostId, freeJobPostId],
		userIds: [adminUserId, employerUserId],
	};
};

const cleanupPaymentQueueFixture = async (fixture: PaymentQueueFixture) => {
	await db.delete(jobPost).where(inArray(jobPost.id, fixture.jobPostIds));
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
	await db
		.delete(adProduct)
		.where(inArray(adProduct.placementId, [fixture.placementId]));
	await db
		.delete(adPlacement)
		.where(inArray(adPlacement.id, [fixture.placementId]));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
};

describe("listJobsForPayment 결제 큐 판별", () => {
	it("previewTemplate이 none인 상품을 단 미결제 공고도 결제 큐에 노출된다", async () => {
		const fixture = await createPaymentQueueFixture();
		try {
			const listJobsForPayment = createProcedureClient(
				moderationRouter.listJobsForPayment,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "listJobsForPayment"],
				}
			);
			const rows = await listJobsForPayment({ limit: 50, onlyUnpaid: true });
			expect(rows.map((row) => row.id)).toContain(fixture.noneProductJobPostId);
		} finally {
			await cleanupPaymentQueueFixture(fixture);
		}
	});

	it("무료 공고(adProductId 없음)는 결제 큐에 나오지 않는다", async () => {
		const fixture = await createPaymentQueueFixture();
		try {
			const listJobsForPayment = createProcedureClient(
				moderationRouter.listJobsForPayment,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "listJobsForPayment"],
				}
			);
			const rows = await listJobsForPayment({ limit: 50, onlyUnpaid: false });
			expect(rows.map((row) => row.id)).not.toContain(fixture.freeJobPostId);
		} finally {
			await cleanupPaymentQueueFixture(fixture);
		}
	});
});

// 리스팅(스페셜/추천) 공고를 원하는 결제·노출 상태로 시드한다. 반환 id를 fixture.jobPostIds에
// 넣어 기존 cleanup이 함께 지우게 한다. 결제 멱등 가드는 exposureType·noop 분기만 타므로
// adProductId 없이도 충분하다(가드가 resolveListingPaymentExposure 앞에서 단락).
const seedListingJobPost = async (
	fixture: PaymentQueueFixture,
	overrides: {
		exposureEndsAt: Date | null;
		exposureType?: "recommended" | "special";
		listingPaidAt: Date | null;
		paymentStatus: "paid" | "unpaid";
	}
): Promise<string> => {
	const id = randomUUID();
	fixture.jobPostIds.push(id);
	await db.insert(jobPost).values({
		id,
		organizationId: fixture.organizationId,
		createdByUserId: fixture.employerUserId,
		status: "published",
		industryCategory: "BAR",
		region: "서울 강남구",
		payAmount: 12_000,
		payUnit: "hour",
		workSchedule: "평일 저녁",
		title: "리스팅 결제 멱등 테스트 공고",
		description: "same-status 재확정 멱등 검증용 리스팅 공고",
		exposureType: overrides.exposureType ?? "special",
		exposureAmount: 60_000,
		exposureDurationDays: 30,
		paymentStatus: overrides.paymentStatus,
		exposureEndsAt: overrides.exposureEndsAt,
		listingPaidAt: overrides.listingPaidAt,
	});
	return id;
};

// 결제 관련 컬럼만 다시 읽어 실제 DB 쓰기 여부를 확인한다(반환값이 아니라 저장 상태로 검증).
const fetchPaymentFields = async (id: string) => {
	const [row] = await db
		.select({
			exposureEndsAt: jobPost.exposureEndsAt,
			listingPaidAt: jobPost.listingPaidAt,
			paymentStatus: jobPost.paymentStatus,
		})
		.from(jobPost)
		.where(eq(jobPost.id, id))
		.limit(1);
	if (!row) {
		throw new Error("job post not found after mutation");
	}
	return row;
};

const createSetJobPostPaymentClient = (adminUserId: string) =>
	createProcedureClient(moderationRouter.setJobPostPayment, {
		context: createContextForUser(adminUserId),
		path: ["bambi", "moderation", "setJobPostPayment"],
	});

// 미래·과거 고정 시각(오늘=2026-08-13 기준). 활성=미래 exposureEndsAt, listingPaidAt=과거.
const FUTURE_ENDS_AT = new Date("2026-09-01T00:00:00.000Z");
const PAST_PAID_AT = new Date("2026-08-01T00:00:00.000Z");

describe("결제 재확정 멱등(#4)", () => {
	it("활성 리스팅에 결제완료를 재확정해도 노출·순번이 그대로다", async () => {
		const fixture = await createPaymentQueueFixture();
		try {
			const jobPostId = await seedListingJobPost(fixture, {
				exposureEndsAt: FUTURE_ENDS_AT,
				listingPaidAt: PAST_PAID_AT,
				paymentStatus: "paid",
			});
			const setJobPostPayment = createSetJobPostPaymentClient(
				fixture.adminUserId
			);

			await setJobPostPayment({ jobPostId, paymentStatus: "paid" });

			// same-status no-op이라 재계산이 없어 노출 종료·FIFO 키가 원래 값 그대로여야 한다
			// (강등·listingPaidAt 리셋 없음).
			const row = await fetchPaymentFields(jobPostId);
			expect(row.exposureEndsAt?.getTime()).toBe(FUTURE_ENDS_AT.getTime());
			expect(row.listingPaidAt?.getTime()).toBe(PAST_PAID_AT.getTime());
		} finally {
			await cleanupPaymentQueueFixture(fixture);
		}
	});

	it("대기열 리스팅에 결제완료를 재확정해도 FIFO 순번(listingPaidAt)이 유지된다", async () => {
		const fixture = await createPaymentQueueFixture();
		try {
			const jobPostId = await seedListingJobPost(fixture, {
				exposureEndsAt: null,
				listingPaidAt: PAST_PAID_AT,
				paymentStatus: "paid",
			});
			const setJobPostPayment = createSetJobPostPaymentClient(
				fixture.adminUserId
			);

			await setJobPostPayment({ jobPostId, paymentStatus: "paid" });

			// 대기열(exposureEndsAt=null)은 유지되고, listingPaidAt이 now로 리셋되면 대기열 맨
			// 뒤로 밀린다 — 멱등 처리로 원래 결제 시각(FIFO 순번)이 보존돼야 한다.
			const row = await fetchPaymentFields(jobPostId);
			expect(row.exposureEndsAt).toBeNull();
			expect(row.listingPaidAt?.getTime()).toBe(PAST_PAID_AT.getTime());
		} finally {
			await cleanupPaymentQueueFixture(fixture);
		}
	});

	it("미결제 공고에 미결제를 재확정하면 에러 없이 현재 상태를 반환한다", async () => {
		const fixture = await createPaymentQueueFixture();
		try {
			const jobPostId = await seedListingJobPost(fixture, {
				exposureEndsAt: null,
				listingPaidAt: null,
				paymentStatus: "unpaid",
			});
			const setJobPostPayment = createSetJobPostPaymentClient(
				fixture.adminUserId
			);

			// unpaid→unpaid도 same-status라 에러가 아니라 현재 행을 그대로 반환한다.
			const updated = await setJobPostPayment({
				jobPostId,
				paymentStatus: "unpaid",
			});
			expect(updated.paymentStatus).toBe("unpaid");

			const row = await fetchPaymentFields(jobPostId);
			expect(row.paymentStatus).toBe("unpaid");
			expect(row.exposureEndsAt).toBeNull();
			expect(row.listingPaidAt).toBeNull();
		} finally {
			await cleanupPaymentQueueFixture(fixture);
		}
	});

	it("혼합 일괄 결제완료: 이미 결제된 리스팅은 순번이 보존되고 미결제만 전환된다", async () => {
		const fixture = await createPaymentQueueFixture();
		try {
			const alreadyPaidId = await seedListingJobPost(fixture, {
				exposureEndsAt: FUTURE_ENDS_AT,
				listingPaidAt: PAST_PAID_AT,
				paymentStatus: "paid",
			});
			const unpaidId = await seedListingJobPost(fixture, {
				exposureEndsAt: null,
				listingPaidAt: null,
				paymentStatus: "unpaid",
			});
			const bulkSetJobPostPayment = createProcedureClient(
				moderationRouter.bulkSetJobPostPayment,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "bulkSetJobPostPayment"],
				}
			);

			const result = await bulkSetJobPostPayment({
				jobPostIds: [alreadyPaidId, unpaidId],
				paymentStatus: "paid",
			});

			// 이미 paid였던 건은 no-op(성공으로 집계), 미결제였던 건은 실제 전환 — 둘 다 성공.
			expect(result.succeeded).toBe(2);
			expect(result.failed).toBe(0);

			// no-op 대상: 노출·FIFO 키가 그대로여야 한다(대기열 맨 뒤로 강등 없음).
			const paidRow = await fetchPaymentFields(alreadyPaidId);
			expect(paidRow.listingPaidAt?.getTime()).toBe(PAST_PAID_AT.getTime());
			expect(paidRow.exposureEndsAt?.getTime()).toBe(FUTURE_ENDS_AT.getTime());

			// 실제 전환 대상: paid로 바뀌었다.
			const unpaidRow = await fetchPaymentFields(unpaidId);
			expect(unpaidRow.paymentStatus).toBe("paid");
		} finally {
			await cleanupPaymentQueueFixture(fixture);
		}
	});
});

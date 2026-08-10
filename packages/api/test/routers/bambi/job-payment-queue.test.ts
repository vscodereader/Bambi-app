import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
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

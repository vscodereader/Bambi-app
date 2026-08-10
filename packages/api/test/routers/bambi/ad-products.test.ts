import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "@/context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { adProductsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("@/routers/bambi/ad-products"),
	]);

const { user } = authSchema;
const { bambiProfile, adPlacement, adProduct } = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const expectOrpcCode = async (promise: Promise<unknown>, code: string) => {
	await expect(promise).rejects.toMatchObject({ code });
};

interface CatalogFixture {
	activePlacementId: string;
	adminUserId: string;
	employerUserId: string;
	inactivePlacementId: string;
	placementIds: string[];
	userIds: string[];
}

const createCatalogFixture = async (): Promise<CatalogFixture> => {
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const activePlacementId = randomUUID();
	const inactivePlacementId = randomUUID();

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
	await db.insert(adPlacement).values([
		{
			id: activePlacementId,
			name: "상단 프리미엄 배너",
			kind: "banner",
			sortOrder: 0,
			isActive: true,
		},
		{
			id: inactivePlacementId,
			name: "숨김 위치",
			kind: "listing",
			sortOrder: 1,
			isActive: false,
		},
	]);
	await db.insert(adProduct).values([
		{
			placementId: activePlacementId,
			name: "프리미엄 배너 60일",
			benefits: ["상단 노출 연장"],
			priceOptions: [{ amount: 550_000, days: 60 }],
			sortOrder: 1,
			isActive: true,
		},
		{
			placementId: activePlacementId,
			name: "프리미엄 배너",
			benefits: ["상단 노출"],
			priceOptions: [{ amount: 330_000, days: 30 }],
			sortOrder: 0,
			isActive: true,
		},
		{
			placementId: activePlacementId,
			name: "숨김 상품",
			benefits: [],
			priceOptions: [{ amount: 1000, days: 7 }],
			sortOrder: 1,
			isActive: false,
		},
		{
			// 레거시 좌측 사이드 배너 상품(프리미엄으로 통합돼 신규 구매 차단 대상).
			// active지만 getCatalog에서는 숨기고 listCatalogAdmin에서는 노출해야 한다.
			placementId: activePlacementId,
			name: "레거시 사이드 배너",
			benefits: ["좌측 사이드 노출"],
			priceOptions: [{ amount: 200_000, days: 30 }],
			previewTemplate: "side-horizontal",
			sortOrder: 2,
			isActive: true,
		},
	]);

	return {
		adminUserId,
		employerUserId,
		activePlacementId,
		inactivePlacementId,
		userIds: [adminUserId, employerUserId],
		placementIds: [activePlacementId, inactivePlacementId],
	};
};

const cleanupCatalogFixture = async (fixture: CatalogFixture) => {
	await db
		.delete(adProduct)
		.where(inArray(adProduct.placementId, fixture.placementIds));
	await db
		.delete(adPlacement)
		.where(inArray(adPlacement.id, fixture.placementIds));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
};

describe("adProducts read", () => {
	it("getCatalog returns only active placements and active products", async () => {
		const fixture = await createCatalogFixture();
		try {
			const getCatalog = createProcedureClient(adProductsRouter.getCatalog, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "adProducts", "getCatalog"],
			});
			const catalog = await getCatalog({});
			const ids = catalog.map((p) => p.id);
			expect(ids).toContain(fixture.activePlacementId);
			expect(ids).not.toContain(fixture.inactivePlacementId);
			const active = catalog.find((p) => p.id === fixture.activePlacementId);
			expect(active?.products).toHaveLength(2);
			expect(active?.products[0]?.name).toBe("프리미엄 배너");
			expect(active?.products[0]?.priceOptions).toEqual([
				{ amount: 330_000, days: 30 },
			]);
			expect(active?.products[1]?.name).toBe("프리미엄 배너 60일");
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});

	it("getCatalog hides legacy side-banner products; listCatalogAdmin keeps them", async () => {
		const fixture = await createCatalogFixture();
		try {
			const getCatalog = createProcedureClient(adProductsRouter.getCatalog, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "adProducts", "getCatalog"],
			});
			const catalog = await getCatalog({});
			const active = catalog.find((p) => p.id === fixture.activePlacementId);
			// 좌/우 사이드 배너 템플릿 상품은 구매 카탈로그에서 제외된다.
			expect(
				active?.products.some((pr) => pr.name === "레거시 사이드 배너")
			).toBe(false);
			expect(
				active?.products.every(
					(pr) =>
						pr.previewTemplate !== "side-horizontal" &&
						pr.previewTemplate !== "side-vertical"
				)
			).toBe(true);

			const listAsAdmin = createProcedureClient(
				adProductsRouter.listCatalogAdmin,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "adProducts", "listCatalogAdmin"],
				}
			);
			const all = await listAsAdmin({});
			const adminActive = all.find((p) => p.id === fixture.activePlacementId);
			// 운영자 관리 목록에는 레거시 사이드 배너 상품이 계속 노출된다.
			expect(
				adminActive?.products.some((pr) => pr.name === "레거시 사이드 배너")
			).toBe(true);
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});

	it("listCatalogAdmin requires an admin profile", async () => {
		const fixture = await createCatalogFixture();
		try {
			const listAsEmployer = createProcedureClient(
				adProductsRouter.listCatalogAdmin,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "adProducts", "listCatalogAdmin"],
				}
			);
			await expectOrpcCode(listAsEmployer({}), "FORBIDDEN");

			const listAsAdmin = createProcedureClient(
				adProductsRouter.listCatalogAdmin,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "adProducts", "listCatalogAdmin"],
				}
			);
			const all = await listAsAdmin({});
			expect(all.map((p) => p.id)).toEqual(
				expect.arrayContaining([
					fixture.activePlacementId,
					fixture.inactivePlacementId,
				])
			);
			const activeP = all.find((p) => p.id === fixture.activePlacementId);
			expect(activeP?.products.some((pr) => pr.name === "숨김 상품")).toBe(
				true
			);
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});
});

describe("adProducts placement mutations", () => {
	it("blocks non-admins and creates/updates/deletes placements for admins", async () => {
		const fixture = await createCatalogFixture();
		let createdId: string | undefined;
		try {
			const asEmployer = createProcedureClient(
				adProductsRouter.createPlacement,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "adProducts", "createPlacement"],
				}
			);
			await expectOrpcCode(
				asEmployer({ name: "권한 테스트", kind: "listing" }),
				"FORBIDDEN"
			);

			const create = createProcedureClient(adProductsRouter.createPlacement, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createPlacement"],
			});
			const created = await create({ name: "사이드 배너", kind: "banner" });
			createdId = created.id;
			expect(created.name).toBe("사이드 배너");
			expect(created.isActive).toBe(true);

			const update = createProcedureClient(adProductsRouter.updatePlacement, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "updatePlacement"],
			});
			const updated = await update({
				id: created.id,
				isActive: false,
				name: "사이드 배너(중단)",
			});
			expect(updated.isActive).toBe(false);
			expect(updated.name).toBe("사이드 배너(중단)");

			const remove = createProcedureClient(adProductsRouter.deletePlacement, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "deletePlacement"],
			});
			const removed = await remove({ id: created.id });
			expect(removed).toEqual({ id: created.id });
			createdId = undefined;
		} finally {
			if (createdId) {
				await db.delete(adPlacement).where(eq(adPlacement.id, createdId));
			}
			await cleanupCatalogFixture(fixture);
		}
	});
});

describe("adProducts product mutations", () => {
	it("validates priceOptions and creates products for admins", async () => {
		const fixture = await createCatalogFixture();
		try {
			const create = createProcedureClient(adProductsRouter.createProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createProduct"],
			});

			// 빈 priceOptions는 거부
			await expect(
				create({
					placementId: fixture.activePlacementId,
					name: "잘못된 상품",
					benefits: [],
					priceOptions: [],
				})
			).rejects.toBeTruthy();

			const created = await create({
				placementId: fixture.activePlacementId,
				name: "추천 광고",
				tagline: "추천 섹션 노출",
				benefits: ["추천 섹션 상단"],
				priceOptions: [
					{ amount: 220_000, days: 30 },
					{ amount: 400_000, days: 60 },
				],
			});
			expect(created.name).toBe("추천 광고");
			expect(created.priceOptions).toHaveLength(2);

			const asEmployer = createProcedureClient(adProductsRouter.createProduct, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "adProducts", "createProduct"],
			});
			await expectOrpcCode(
				asEmployer({
					placementId: fixture.activePlacementId,
					name: "권한 테스트",
					benefits: [],
					priceOptions: [{ amount: 1000, days: 7 }],
				}),
				"FORBIDDEN"
			);
			// createProduct로 만든 행은 placement cascade로 fixture cleanup 시 함께 삭제됨
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});

	it("stores and updates previewTemplate; defaults to none; rejects invalid values", async () => {
		const fixture = await createCatalogFixture();
		try {
			const create = createProcedureClient(adProductsRouter.createProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createProduct"],
			});

			// (a) previewTemplate 지정 시 반환/조회에 반영
			const created = await create({
				placementId: fixture.activePlacementId,
				name: "프리미엄 상단",
				benefits: [],
				priceOptions: [{ amount: 1000, days: 7 }],
				previewTemplate: "premium-top",
			});
			expect(created.previewTemplate).toBe("premium-top");
			const [reloaded] = await db
				.select({ previewTemplate: adProduct.previewTemplate })
				.from(adProduct)
				.where(eq(adProduct.id, created.id));
			expect(reloaded?.previewTemplate).toBe("premium-top");

			const update = createProcedureClient(adProductsRouter.updateProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "updateProduct"],
			});
			const updated = await update({
				id: created.id,
				previewTemplate: "side-vertical",
			});
			expect(updated.previewTemplate).toBe("side-vertical");

			// (b) 미지정 시 기본 "none"
			const defaulted = await create({
				placementId: fixture.activePlacementId,
				name: "기본 상품",
				benefits: [],
				priceOptions: [{ amount: 1000, days: 7 }],
			});
			expect(defaulted.previewTemplate).toBe("none");

			// (c) 잘못된 enum 값이면 zod가 거부(입력 파싱 레벨)
			await expect(
				create({
					placementId: fixture.activePlacementId,
					name: "잘못된 미리보기",
					benefits: [],
					priceOptions: [{ amount: 1000, days: 7 }],
					// @ts-expect-error 유효하지 않은 previewTemplate 값
					previewTemplate: "invalid-template",
				})
			).rejects.toBeTruthy();
			// createProduct로 만든 행은 placement cascade로 fixture cleanup 시 함께 삭제됨
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});

	it("persists manualBoostsPerDay on create and update; defaults to 0", async () => {
		const fixture = await createCatalogFixture();
		try {
			const create = createProcedureClient(adProductsRouter.createProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createProduct"],
			});

			const created = await create({
				placementId: fixture.activePlacementId,
				name: "끌어올리기 상품",
				benefits: [],
				priceOptions: [{ amount: 1000, days: 7 }],
				manualBoostsPerDay: 3,
			});
			expect(created.manualBoostsPerDay).toBe(3);
			const [reloaded] = await db
				.select({ manualBoostsPerDay: adProduct.manualBoostsPerDay })
				.from(adProduct)
				.where(eq(adProduct.id, created.id));
			expect(reloaded?.manualBoostsPerDay).toBe(3);

			const update = createProcedureClient(adProductsRouter.updateProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "updateProduct"],
			});
			const updated = await update({
				id: created.id,
				manualBoostsPerDay: 5,
			});
			expect(updated.manualBoostsPerDay).toBe(5);

			// 미지정 시 기본 0
			const defaulted = await create({
				placementId: fixture.activePlacementId,
				name: "기본 끌어올리기 상품",
				benefits: [],
				priceOptions: [{ amount: 1000, days: 7 }],
			});
			expect(defaulted.manualBoostsPerDay).toBe(0);
			// createProduct로 만든 행은 placement cascade로 fixture cleanup 시 함께 삭제됨
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});

	it("가격 옵션별 discountPercent를 저장·수정하고, 범위를 벗어나면(101·-1) 거부한다", async () => {
		const fixture = await createCatalogFixture();
		try {
			const create = createProcedureClient(adProductsRouter.createProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createProduct"],
			});

			// 옵션의 범위 초과(101, -1)는 zod 파싱 레벨에서 거부(핸들러·DB 도달 전)
			await expect(
				create({
					placementId: fixture.activePlacementId,
					name: "할인 초과",
					benefits: [],
					priceOptions: [{ amount: 1000, days: 7, discountPercent: 101 }],
				})
			).rejects.toBeTruthy();
			await expect(
				create({
					placementId: fixture.activePlacementId,
					name: "할인 음수",
					benefits: [],
					priceOptions: [{ amount: 1000, days: 7, discountPercent: -1 }],
				})
			).rejects.toBeTruthy();

			// 옵션별로 다른 할인율 저장(한쪽은 할인, 다른 쪽은 미설정)
			const created = await create({
				placementId: fixture.activePlacementId,
				name: "할인 상품",
				benefits: [],
				priceOptions: [
					{ amount: 50_000, days: 30, discountPercent: 20 },
					{ amount: 90_000, days: 60 },
				],
			});
			expect(created.priceOptions).toEqual([
				{ amount: 50_000, days: 30, discountPercent: 20 },
				{ amount: 90_000, days: 60 },
			]);
			const [reloaded] = await db
				.select({ priceOptions: adProduct.priceOptions })
				.from(adProduct)
				.where(eq(adProduct.id, created.id));
			expect(reloaded?.priceOptions[0]?.discountPercent).toBe(20);
			expect(reloaded?.priceOptions[1]?.discountPercent).toBeUndefined();

			const update = createProcedureClient(adProductsRouter.updateProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "updateProduct"],
			});
			const updated = await update({
				id: created.id,
				priceOptions: [{ amount: 50_000, days: 30, discountPercent: 35 }],
			});
			expect(updated.priceOptions[0]?.discountPercent).toBe(35);

			// discountPercent 미설정 옵션은 할인 없음(값이 남지 않는다)
			const defaulted = await create({
				placementId: fixture.activePlacementId,
				name: "무할인 상품",
				benefits: [],
				priceOptions: [{ amount: 1000, days: 7 }],
			});
			expect(defaulted.priceOptions[0]?.discountPercent).toBeUndefined();
			// createProduct로 만든 행은 placement cascade로 fixture cleanup 시 함께 삭제됨
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});

	it("배너형 상품에 끌어올리기 값을 저장하려 하면 거부한다 (create·update)", async () => {
		const fixture = await createCatalogFixture();
		try {
			const create = createProcedureClient(adProductsRouter.createProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createProduct"],
			});

			// (a) 배너 템플릿 + 끌어올리기 > 0 → BAD_REQUEST
			await expectOrpcCode(
				create({
					placementId: fixture.activePlacementId,
					name: "배너+끌올",
					benefits: [],
					priceOptions: [{ amount: 1000, days: 7 }],
					previewTemplate: "premium-top",
					manualBoostsPerDay: 2,
				}),
				"BAD_REQUEST"
			);

			// (b) 리스팅 템플릿 + 끌어올리기는 정상 생성
			const listing = await create({
				placementId: fixture.activePlacementId,
				name: "스페셜+끌올",
				benefits: [],
				priceOptions: [{ amount: 1000, days: 7 }],
				previewTemplate: "special-list",
				manualBoostsPerDay: 2,
				autoBoostsPerDay: 1,
			});
			expect(listing.manualBoostsPerDay).toBe(2);

			// (c) 끌어올리기 값을 가진 리스팅 상품을 배너 템플릿으로만 바꾸면 거부
			//     (부분 수정이라도 기존 끌올 값 + 배너 템플릿 최종 상태를 잡아낸다)
			const update = createProcedureClient(adProductsRouter.updateProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "updateProduct"],
			});
			await expectOrpcCode(
				update({ id: listing.id, previewTemplate: "side-vertical" }),
				"BAD_REQUEST"
			);
			// createProduct로 만든 행은 placement cascade로 fixture cleanup 시 함께 삭제됨
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});

	it("reorderProducts only touches products in the given placement", async () => {
		const fixture = await createCatalogFixture();
		try {
			const [other] = await db
				.insert(adProduct)
				.values({
					placementId: fixture.inactivePlacementId,
					name: "다른 위치 상품",
					benefits: [],
					priceOptions: [{ amount: 1000, days: 7 }],
					sortOrder: 5,
				})
				.returning();
			if (!other) {
				throw new Error("reorder fixture insert failed");
			}

			const reorder = createProcedureClient(adProductsRouter.reorderProducts, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "reorderProducts"],
			});
			// activePlacementId로 스코프하면 다른 위치 상품(other)의 sortOrder는 변하지 않아야 한다
			await reorder({
				placementId: fixture.activePlacementId,
				ids: [other.id],
			});

			const [after] = await db
				.select({ sortOrder: adProduct.sortOrder })
				.from(adProduct)
				.where(eq(adProduct.id, other.id));
			expect(after?.sortOrder).toBe(5);
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});
});

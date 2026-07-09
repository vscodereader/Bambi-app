import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { adProductsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./ad-products"),
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

	it("stores and updates previewTemplate; defaults to none; rejects invalid values", async () => {
		const fixture = await createCatalogFixture();
		let createdId: string | undefined;
		let defaultedId: string | undefined;
		try {
			const create = createProcedureClient(adProductsRouter.createPlacement, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createPlacement"],
			});

			// (a) previewTemplate 지정 시 반환/조회에 반영
			const created = await create({
				name: "프리미엄 상단",
				kind: "banner",
				previewTemplate: "premium-top",
			});
			createdId = created.id;
			expect(created.previewTemplate).toBe("premium-top");
			const [reloaded] = await db
				.select({ previewTemplate: adPlacement.previewTemplate })
				.from(adPlacement)
				.where(eq(adPlacement.id, created.id));
			expect(reloaded?.previewTemplate).toBe("premium-top");

			const update = createProcedureClient(adProductsRouter.updatePlacement, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "updatePlacement"],
			});
			const updated = await update({
				id: created.id,
				previewTemplate: "side-vertical",
			});
			expect(updated.previewTemplate).toBe("side-vertical");

			// (b) 미지정 시 기본 "none"
			const defaulted = await create({ name: "기본 위치", kind: "listing" });
			defaultedId = defaulted.id;
			expect(defaulted.previewTemplate).toBe("none");

			// (c) 잘못된 enum 값이면 zod가 거부(입력 파싱 레벨)
			await expect(
				create({
					name: "잘못된 미리보기",
					kind: "listing",
					// @ts-expect-error 유효하지 않은 previewTemplate 값
					previewTemplate: "invalid-template",
				})
			).rejects.toBeTruthy();
		} finally {
			const cleanupIds = [createdId, defaultedId].filter((id): id is string =>
				Boolean(id)
			);
			if (cleanupIds.length > 0) {
				await db.delete(adPlacement).where(inArray(adPlacement.id, cleanupIds));
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

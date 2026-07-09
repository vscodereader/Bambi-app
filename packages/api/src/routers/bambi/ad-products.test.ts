import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
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

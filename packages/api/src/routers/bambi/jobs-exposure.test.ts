import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, bambiSchema, { eq }, { resolveJobPostExposure }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/bambi"),
		import("drizzle-orm"),
		import("./jobs"),
	]);

const expectOrpcCode = async (promise: Promise<unknown>, code: string) => {
	await expect(promise).rejects.toMatchObject({ code });
};

interface AdProductFixture {
	adProductId: string;
	placementId: string;
}

const createAdProductFixture = async (): Promise<AdProductFixture> => {
	const placementId = randomUUID();

	await db.insert(bambiSchema.adPlacement).values({
		id: placementId,
		name: "일반 리스팅",
		kind: "listing",
		sortOrder: 0,
		isActive: true,
	});
	const [product] = await db
		.insert(bambiSchema.adProduct)
		.values({
			placementId,
			name: "노출 상품",
			benefits: [],
			priceOptions: [{ amount: 50_000, days: 30 }],
			previewTemplate: "none",
			sortOrder: 0,
			isActive: true,
		})
		.returning();
	if (!product) {
		throw new Error("adProduct seed failed");
	}

	return { adProductId: product.id, placementId };
};

const cleanupAdProductFixture = async (fixture: AdProductFixture) => {
	await db
		.delete(bambiSchema.adProduct)
		.where(eq(bambiSchema.adProduct.placementId, fixture.placementId));
	await db
		.delete(bambiSchema.adPlacement)
		.where(eq(bambiSchema.adPlacement.id, fixture.placementId));
};

describe("resolveJobPostExposure 무통장 계좌 게이트", () => {
	it("bank_transfer + 유료상품 + 계좌 0개면 BAD_REQUEST", async () => {
		const fixture = await createAdProductFixture();
		try {
			await db
				.delete(bambiSchema.bambiSiteSettings)
				.where(eq(bambiSchema.bambiSiteSettings.id, "default"));

			await expectOrpcCode(
				resolveJobPostExposure({
					adProductId: fixture.adProductId,
					exposureDurationDays: 30,
					paymentMethod: "bank_transfer",
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupAdProductFixture(fixture);
			await db
				.delete(bambiSchema.bambiSiteSettings)
				.where(eq(bambiSchema.bambiSiteSettings.id, "default"));
		}
	});

	it("계좌가 1개 이상이면 정상 resolve", async () => {
		const fixture = await createAdProductFixture();
		try {
			await db
				.insert(bambiSchema.bambiSiteSettings)
				.values({
					id: "default",
					bankAccounts: [
						{ accountNumber: "1-2-3", bank: "국민은행", holder: "밤비" },
					],
				})
				.onConflictDoUpdate({
					target: bambiSchema.bambiSiteSettings.id,
					set: {
						bankAccounts: [
							{ accountNumber: "1-2-3", bank: "국민은행", holder: "밤비" },
						],
					},
				});

			const result = await resolveJobPostExposure({
				adProductId: fixture.adProductId,
				exposureDurationDays: 30,
				paymentMethod: "bank_transfer",
			});
			expect(result.adProductId).toBe(fixture.adProductId);
			expect(result.paymentMethod).toBe("bank_transfer");
		} finally {
			await cleanupAdProductFixture(fixture);
			await db
				.delete(bambiSchema.bambiSiteSettings)
				.where(eq(bambiSchema.bambiSiteSettings.id, "default"));
		}
	});
});

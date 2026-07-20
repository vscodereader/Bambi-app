import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, advertiser] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./bambi-advertiser"),
]);

const { member, organization, user } = authSchema;
const { adPlacement, adProduct, bambiProfile, jobPost } = bambiSchema;

interface Seed {
	adPlacementId: string;
	adProductId: string;
	jobPostId: string;
	organizationId: string;
	ownerUserId: string;
}

// 광고 상품(adProductId)이 연결되고 published·paid이며 노출이 유효한 공고를 소유한
// 조직 + owner 멤버 + employer 프로필을 시드한다. status·paymentStatus·exposureEndsAt로
// 공개 게이트/만료 케이스를 조절한다.
const seedActiveAdvertiser = async ({
	exposureEndsAt,
	memberRole,
	paymentStatus = "paid",
	status = "published",
}: {
	exposureEndsAt: Date | null;
	memberRole: "owner" | "admin" | "member";
	paymentStatus?: "paid" | "unpaid";
	status?: "published" | "pending_review";
}): Promise<Seed> => {
	const now = new Date();
	const organizationId = `org_adv_${randomUUID()}`;
	const ownerUserId = `user_adv_${randomUUID()}`;
	const jobPostId = randomUUID();
	const adPlacementId = randomUUID();
	const adProductId = randomUUID();

	await db.insert(user).values({
		id: ownerUserId,
		name: "adv owner",
		email: `${ownerUserId}@bambi.test`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(organization).values({
		id: organizationId,
		name: organizationId,
		slug: organizationId,
		createdAt: now,
	});
	await db.insert(member).values({
		id: `mem_${randomUUID()}`,
		organizationId,
		userId: ownerUserId,
		role: memberRole,
		createdAt: now,
	});
	await db.insert(bambiProfile).values({
		userId: ownerUserId,
		role: "employer",
	});
	await db.insert(adPlacement).values({
		id: adPlacementId,
		name: `placement_${adPlacementId}`,
	});
	await db.insert(adProduct).values({
		id: adProductId,
		placementId: adPlacementId,
		name: `product_${adProductId}`,
	});
	await db.insert(jobPost).values({
		id: jobPostId,
		organizationId,
		createdByUserId: ownerUserId,
		industryCategory: "cafe",
		region: "seoul",
		payAmount: 12_000,
		payUnit: "hour",
		workSchedule: "주 5일",
		title: "광고 테스트 공고",
		description: "설명",
		adProductId,
		status,
		paymentStatus,
		exposureEndsAt,
	});

	return {
		adPlacementId,
		adProductId,
		jobPostId,
		organizationId,
		ownerUserId,
	};
};

const cleanup = async (seed: Seed): Promise<void> => {
	// organization cascade가 jobPost를 지운다. adProduct/adPlacement·profile·user는 명시 삭제.
	await db.delete(organization).where(eq(organization.id, seed.organizationId));
	await db.delete(adProduct).where(eq(adProduct.id, seed.adProductId));
	await db.delete(adPlacement).where(eq(adPlacement.id, seed.adPlacementId));
	await db
		.delete(bambiProfile)
		.where(eq(bambiProfile.userId, seed.ownerUserId));
	await db.delete(user).where(eq(user.id, seed.ownerUserId));
};

describe("isAdvertiserEligibleRole", () => {
	it("allows owner and admin", () => {
		expect(advertiser.isAdvertiserEligibleRole("owner")).toBe(true);
		expect(advertiser.isAdvertiserEligibleRole("admin")).toBe(true);
	});

	it("rejects member and unknown roles", () => {
		expect(advertiser.isAdvertiserEligibleRole("member")).toBe(false);
		expect(advertiser.isAdvertiserEligibleRole(null)).toBe(false);
		expect(advertiser.isAdvertiserEligibleRole(undefined)).toBe(false);
	});
});

describe("hasActiveAdExposure", () => {
	it("returns true for owner of an org with a live paid published ad post", async () => {
		const seed = await seedActiveAdvertiser({
			exposureEndsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "owner",
		});
		try {
			await expect(
				advertiser.hasActiveAdExposure({
					now: new Date(),
					userId: seed.ownerUserId,
				})
			).resolves.toBe(true);
		} finally {
			await cleanup(seed);
		}
	});

	it("returns false when exposure already ended (exposureEndsAt in the past)", async () => {
		const seed = await seedActiveAdvertiser({
			exposureEndsAt: new Date(Date.now() - 60_000),
			memberRole: "owner",
		});
		try {
			await expect(
				advertiser.hasActiveAdExposure({
					now: new Date(),
					userId: seed.ownerUserId,
				})
			).resolves.toBe(false);
		} finally {
			await cleanup(seed);
		}
	});

	it("returns false when the ad post is unpaid", async () => {
		const seed = await seedActiveAdvertiser({
			exposureEndsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "owner",
			paymentStatus: "unpaid",
		});
		try {
			await expect(
				advertiser.hasActiveAdExposure({
					now: new Date(),
					userId: seed.ownerUserId,
				})
			).resolves.toBe(false);
		} finally {
			await cleanup(seed);
		}
	});

	it("returns false for a plain member role", async () => {
		const seed = await seedActiveAdvertiser({
			exposureEndsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "member",
		});
		try {
			await expect(
				advertiser.hasActiveAdExposure({
					now: new Date(),
					userId: seed.ownerUserId,
				})
			).resolves.toBe(false);
		} finally {
			await cleanup(seed);
		}
	});
});

describe("syncAdvertiserFlagForOrganization", () => {
	it("sets is_advertiser true for owner/admin members with a live ad exposure", async () => {
		const seed = await seedActiveAdvertiser({
			exposureEndsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "owner",
		});
		try {
			await advertiser.syncAdvertiserFlagForOrganization({
				now: new Date(),
				organizationId: seed.organizationId,
			});
			const [profile] = await db
				.select({ isAdvertiser: bambiProfile.isAdvertiser })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, seed.ownerUserId));
			expect(profile?.isAdvertiser).toBe(true);
		} finally {
			await cleanup(seed);
		}
	});
});

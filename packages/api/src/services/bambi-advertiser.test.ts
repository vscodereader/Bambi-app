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
const { bambiProfile, jobPost, jobPromotionCampaign } = bambiSchema;

interface Seed {
	campaignId: string;
	organizationId: string;
	ownerUserId: string;
}

// endsAt이 미래인 active 캠페인을 소유한 조직 + owner 멤버 + employer 프로필을 시드한다.
const seedActiveAdvertiser = async ({
	endsAt,
	memberRole,
}: {
	endsAt: Date;
	memberRole: "owner" | "admin" | "member";
}): Promise<Seed> => {
	const now = new Date();
	const organizationId = `org_adv_${randomUUID()}`;
	const ownerUserId = `user_adv_${randomUUID()}`;
	const jobPostId = randomUUID();
	const campaignId = randomUUID();

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
	});
	await db.insert(jobPromotionCampaign).values({
		id: campaignId,
		jobPostId,
		organizationId,
		tier: "standard",
		status: "active",
		startsAt: new Date(now.getTime() - 60_000),
		endsAt,
	});

	return { campaignId, organizationId, ownerUserId };
};

const cleanup = async (seed: Seed): Promise<void> => {
	// FK cascade(organization/jobPost) + 명시 삭제로 시드 정리.
	await db
		.delete(bambiProfile)
		.where(eq(bambiProfile.userId, seed.ownerUserId));
	await db.delete(organization).where(eq(organization.id, seed.organizationId));
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

describe("hasActiveAdvertiserCampaign", () => {
	it("returns true for owner of an org with a live active campaign", async () => {
		const seed = await seedActiveAdvertiser({
			endsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "owner",
		});
		try {
			await expect(
				advertiser.hasActiveAdvertiserCampaign({
					now: new Date(),
					userId: seed.ownerUserId,
				})
			).resolves.toBe(true);
		} finally {
			await cleanup(seed);
		}
	});

	it("returns false when the campaign already expired (endsAt in the past)", async () => {
		const seed = await seedActiveAdvertiser({
			endsAt: new Date(Date.now() - 60_000),
			memberRole: "owner",
		});
		try {
			await expect(
				advertiser.hasActiveAdvertiserCampaign({
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
			endsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "member",
		});
		try {
			await expect(
				advertiser.hasActiveAdvertiserCampaign({
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
	it("sets is_advertiser true for owner/admin members with a live campaign", async () => {
		const seed = await seedActiveAdvertiser({
			endsAt: new Date(Date.now() + 60 * 60_000),
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

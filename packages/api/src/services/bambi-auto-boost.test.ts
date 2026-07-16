import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [
	{ db },
	authSchema,
	bambiSchema,
	{ runAutoBoostTick },
	{ getKstDayStart },
	{ promotionsRouter },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./bambi-auto-boost"),
	import("./bambi-job-boost"),
	import("../routers/bambi/promotions"),
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

const HOUR_MS = 60 * 60 * 1000;

// 실제 real now와 같은 KST 하루에 속하되 시각을 20:00 KST로 고정한 틱 기준 시각.
// 20:00이면 발동 창(09~21시)의 모든 슬롯이 도래해 dueCount가 결정적이다. DB가 이벤트에
// 찍는 createdAt(real now)은 같은 KST 하루라 getKstDayStart(tickNow) 이후로 집계된다.
const realNow = new Date();
const tickNow = new Date(getKstDayStart(realNow).getTime() + 20 * HOUR_MS);
const past = new Date(realNow.getTime() - 24 * HOUR_MS);
const future = new Date(realNow.getTime() + 24 * HOUR_MS);

const organizationId = `org_test_${randomUUID()}`;
const employerUserId = `user_test_employer_${randomUUID()}`;
const memberId = `member_test_${randomUUID()}`;
const adPlacementId = randomUUID();
const adProductId = randomUUID();

const fireJobId = randomUUID();
const comboJobId = randomUUID();
const unpublishedJobId = randomUUID();
const unpaidJobId = randomUUID();
const expiredJobId = randomUUID();
const preSeededJobId = randomUUID();
const jobPostIds = [
	fireJobId,
	comboJobId,
	unpublishedJobId,
	unpaidJobId,
	expiredJobId,
	preSeededJobId,
];

const createContextForUser = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const boostAs = (userId: string, jobPostId: string) =>
	createProcedureClient(promotionsRouter.boost, {
		context: createContextForUser(userId),
		path: ["bambi", "promotions", "boost"],
	})({ jobPostId });

const autoEventCount = async (jobPostId: string): Promise<number> => {
	const events = await db
		.select({ id: jobBoostEvent.id })
		.from(jobBoostEvent)
		.where(
			and(
				eq(jobBoostEvent.jobPostId, jobPostId),
				eq(jobBoostEvent.boostType, "auto")
			)
		);
	return events.length;
};

const baseJob = (overrides: {
	autoBoostsPerDay: number;
	exposureEndsAt: Date | null;
	id: string;
	manualBoostsPerDay: number;
	paymentStatus: "paid" | "unpaid";
	status: "pending_review" | "published";
	title: string;
}) => ({
	adProductId,
	createdByUserId: employerUserId,
	description: "자동 끌어올리기 틱을 검증하기 위한 공고입니다.",
	industryCategory: "라운지",
	organizationId,
	payAmount: 180_000,
	payUnit: "일급",
	publishedAt: realNow,
	region: `auto-boost-${randomUUID()}`,
	workSchedule: "20:00-02:00",
	...overrides,
});

describe("runAutoBoostTick", () => {
	beforeAll(async () => {
		await db.insert(user).values({
			email: `auto-${randomUUID()}@bambi.test`,
			id: employerUserId,
			name: "자동 담당자",
		});
		await db.insert(organization).values({
			createdAt: realNow,
			id: organizationId,
			name: "자동 끌어올리기 테스트 조직",
			slug: `auto-boost-${randomUUID()}`,
		});
		await db.insert(member).values({
			createdAt: realNow,
			id: memberId,
			organizationId,
			role: "owner",
			userId: employerUserId,
		});
		await db.insert(bambiProfile).values({
			displayName: "자동 담당자",
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		});
		await db.insert(employerOrganizationProfile).values({
			displayName: "자동 끌어올리기 테스트 업체",
			organizationId,
			verificationStatus: "verified",
		});
		await db.insert(adPlacement).values({
			id: adPlacementId,
			kind: "listing",
			name: "목록 상단 노출",
		});
		await db.insert(adProduct).values({
			autoBoostsPerDay: 2,
			id: adProductId,
			name: "자동 끌어올리기 상품",
			placementId: adPlacementId,
			priceOptions: [{ amount: 10_000, days: 7 }],
		});
		await db.insert(jobPost).values([
			baseJob({
				autoBoostsPerDay: 2,
				exposureEndsAt: future,
				id: fireJobId,
				manualBoostsPerDay: 0,
				paymentStatus: "paid",
				status: "published",
				title: "자동 2회 공고",
			}),
			baseJob({
				autoBoostsPerDay: 1,
				exposureEndsAt: future,
				id: comboJobId,
				manualBoostsPerDay: 2,
				paymentStatus: "paid",
				status: "published",
				title: "수동+자동 공고",
			}),
			baseJob({
				autoBoostsPerDay: 2,
				exposureEndsAt: future,
				id: unpublishedJobId,
				manualBoostsPerDay: 0,
				paymentStatus: "paid",
				status: "pending_review",
				title: "미게시 공고",
			}),
			baseJob({
				autoBoostsPerDay: 2,
				exposureEndsAt: future,
				id: unpaidJobId,
				manualBoostsPerDay: 0,
				paymentStatus: "unpaid",
				status: "published",
				title: "미결제 공고",
			}),
			baseJob({
				autoBoostsPerDay: 2,
				exposureEndsAt: past,
				id: expiredJobId,
				manualBoostsPerDay: 0,
				paymentStatus: "paid",
				status: "published",
				title: "노출 만료 공고",
			}),
			baseJob({
				autoBoostsPerDay: 1,
				exposureEndsAt: future,
				id: preSeededJobId,
				manualBoostsPerDay: 0,
				paymentStatus: "paid",
				status: "published",
				title: "쿼터 소진 공고",
			}),
		]);
		// preSeededJob은 오늘 자동 1회(쿼터=1)를 이미 소진한 상태를 만든다(잠금 내 재확인 검증).
		await db.insert(jobBoostEvent).values({
			actorUserId: null,
			boostType: "auto",
			jobPostId: preSeededJobId,
			organizationId,
		});
	});

	afterAll(async () => {
		await db
			.delete(jobBoostEvent)
			.where(inArray(jobBoostEvent.jobPostId, jobPostIds));
		await db.delete(jobPost).where(inArray(jobPost.id, jobPostIds));
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

	it("fires each due job once per tick with a null-actor auto event and boostedAt", async () => {
		const fired = await runAutoBoostTick(tickNow);

		// fireJob(due=2)·comboJob(due=1)만 발동한다. 미게시·미결제·만료·쿼터소진은 제외.
		expect(fired).toBe(2);
		expect(await autoEventCount(fireJobId)).toBe(1); // 틱당 공고별 최대 1회
		expect(await autoEventCount(comboJobId)).toBe(1);

		const [firedEvent] = await db
			.select({
				actorUserId: jobBoostEvent.actorUserId,
				boostType: jobBoostEvent.boostType,
			})
			.from(jobBoostEvent)
			.where(eq(jobBoostEvent.jobPostId, fireJobId));
		expect(firedEvent?.boostType).toBe("auto");
		expect(firedEvent?.actorUserId).toBeNull();

		const [post] = await db
			.select({ boostedAt: jobPost.boostedAt })
			.from(jobPost)
			.where(eq(jobPost.id, fireJobId));
		expect(post?.boostedAt).not.toBeNull();
	});

	it("excludes unpublished, unpaid, and exposure-expired jobs", async () => {
		expect(await autoEventCount(unpublishedJobId)).toBe(0);
		expect(await autoEventCount(unpaidJobId)).toBe(0);
		expect(await autoEventCount(expiredJobId)).toBe(0);
	});

	it("does not fire a job that already met its daily auto quota (in-lock recheck)", async () => {
		// preSeededJob은 due=1, 이미 1회 소진 → 첫 틱에서도 추가 발동이 없어야 한다.
		expect(await autoEventCount(preSeededJobId)).toBe(1);
	});

	it("does not cannibalize the manual quota", async () => {
		// comboJob은 자동 이벤트가 생겼어도 수동 이벤트는 0이라 수동 끌어올리기가 여전히 가능하다.
		const manualEvents = await db
			.select({ id: jobBoostEvent.id })
			.from(jobBoostEvent)
			.where(
				and(
					eq(jobBoostEvent.jobPostId, comboJobId),
					eq(jobBoostEvent.boostType, "manual")
				)
			);
		expect(manualEvents).toHaveLength(0);

		const result = await boostAs(employerUserId, comboJobId);
		expect(result.boostsUsedToday).toBe(1);
	});

	it("catches up to the daily auto quota across ticks then stops", async () => {
		// fireJob은 첫 테스트에서 1회 발동됨(due=2). 다음 틱에서 2회째까지 캐치업.
		const secondFired = await runAutoBoostTick(tickNow);
		expect(await autoEventCount(fireJobId)).toBe(2);
		expect(secondFired).toBeGreaterThanOrEqual(1);

		// 쿼터(2) 소진 후 추가 틱은 fireJob을 더 발동하지 않는다.
		await runAutoBoostTick(tickNow);
		expect(await autoEventCount(fireJobId)).toBe(2);
	});
});

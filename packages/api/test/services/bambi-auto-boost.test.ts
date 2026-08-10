import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "@/context";
// 타입 전용 임포트(런타임 미로드) — jobPost.exposureType 열거 컬럼 값 타이핑용.
import type { JobExposureType } from "@/services/bambi-ad-exposure";

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
	import("@/services/bambi-auto-boost"),
	import("@/services/bambi-job-boost"),
	import("@/routers/bambi/promotions"),
]);

const { member, organization, user } = authSchema;
const {
	adPlacement,
	adProduct,
	bambiProfile,
	employerOrganizationProfile,
	jobBoostEvent,
	jobBoostPurchase,
	jobPost,
} = bambiSchema;

const HOUR_MS = 60 * 60 * 1000;

// 실제 real now와 같은 KST 하루에 속하되 시각을 창 끝(21:00 KST)으로 고정한 틱 기준 시각.
// 공고별 오프셋은 [0, interval) 범위라 마지막 슬롯(= 09:00 + offset + (N-1)×interval)이 21:00 전에
// 반드시 도래한다(getAutoBoostSlotOffsetMs 주석의 수학적 보장). 틱 기준을 21:00으로 잡으면 어떤
// 오프셋의 공고든 전체 자동 쿼터가 due가 되어 하드코딩 없이 결정적이다. DB가 이벤트에 찍는
// createdAt(real now)은 같은 KST 하루라 getKstDayStart(tickNow) 이후로 집계된다.
const realNow = new Date();
const tickNow = new Date(getKstDayStart(realNow).getTime() + 21 * HOUR_MS);
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
const bannerJobId = randomUUID();
// 번들 자동 없이 활성 auto_period 옵션만으로 후보가 되는 무료(standard) 공고.
const optionOnlyJobId = randomUUID();
// 배너형 + 활성 auto_period 옵션: 옵션이 있어도 배너형은 자동 후보에서 제외돼야 한다.
const bannerOptionJobId = randomUUID();
const jobPostIds = [
	fireJobId,
	comboJobId,
	unpublishedJobId,
	unpaidJobId,
	expiredJobId,
	preSeededJobId,
	bannerJobId,
	optionOnlyJobId,
	bannerOptionJobId,
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
	adProductId?: string | null;
	autoBoostsPerDay: number;
	exposureEndsAt: Date | null;
	exposureType?: JobExposureType;
	id: string;
	manualBoostsPerDay: number;
	paymentStatus: "paid" | "unpaid";
	status: "pending_review" | "published";
	title: string;
}) => ({
	adProductId,
	createdByUserId: employerUserId,
	description: "자동 끌어올리기 틱을 검증하기 위한 공고입니다.",
	// 자동 끌어올리기 후보는 리스팅형만 — 기본값을 리스팅(special)로 둔다(배너 케이스는 override).
	exposureType: "special" as JobExposureType,
	industryCategory: "룸싸롱" as const,
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
			// 배너형 공고: 자동 횟수·공개·미만료라도 리스팅형이 아니라 후보에서 제외돼야 한다.
			baseJob({
				autoBoostsPerDay: 2,
				exposureEndsAt: future,
				exposureType: "premium-banner",
				id: bannerJobId,
				manualBoostsPerDay: 0,
				paymentStatus: "paid",
				status: "published",
				title: "배너형 공고",
			}),
			// 무료(standard) 공고: 번들 자동 0·노출 만료 없음. 활성 auto_period 옵션만으로 후보가 된다.
			baseJob({
				adProductId: null,
				autoBoostsPerDay: 0,
				exposureEndsAt: null,
				exposureType: "standard",
				id: optionOnlyJobId,
				manualBoostsPerDay: 0,
				paymentStatus: "paid",
				status: "published",
				title: "옵션 전용 공고",
			}),
			// 배너형 + auto_period 옵션: 옵션이 있어도 배너형은 후보 쿼리·잠금 내 재확인 모두에서 제외.
			baseJob({
				autoBoostsPerDay: 0,
				exposureEndsAt: future,
				exposureType: "premium-banner",
				id: bannerOptionJobId,
				manualBoostsPerDay: 0,
				paymentStatus: "paid",
				status: "published",
				title: "배너형 옵션 공고",
			}),
		]);
		// optionOnly·bannerOption 두 공고에 활성 auto_period 옵션(하루 2회)을 붙인다.
		await db.insert(jobBoostPurchase).values([
			{
				amount: 20_000,
				boostsPerDay: 2,
				expiresAt: future,
				jobPostId: optionOnlyJobId,
				optionType: "auto_period",
				organizationId,
				paymentStatus: "paid",
			},
			{
				amount: 20_000,
				boostsPerDay: 2,
				expiresAt: future,
				jobPostId: bannerOptionJobId,
				optionType: "auto_period",
				organizationId,
				paymentStatus: "paid",
			},
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
		await db
			.delete(jobBoostPurchase)
			.where(inArray(jobBoostPurchase.jobPostId, jobPostIds));
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

		// 이 fixtures 중에선 fireJob(due=2)·comboJob(due=1)만 발동한다(미게시·미결제·만료·쿼터소진 제외).
		// dev DB에 무관한 자동 후보(시드 공고 등)가 있으면 global fired가 더 클 수 있어 하한으로 검증하고,
		// 우리 fixtures의 정확한 발동은 공고별 카운트로 단언한다.
		expect(fired).toBeGreaterThanOrEqual(2);
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

	it("excludes banner-type ad jobs (auto-boost is listing-only)", async () => {
		// 배너형(premium-banner)은 자동 후보 쿼리·잠금 내 재확인 모두에서 제외된다.
		expect(await autoEventCount(bannerJobId)).toBe(0);
	});

	it("fires a free standard job that has an active auto_period option", async () => {
		// 번들 자동 0이어도 활성 auto_period 옵션(하루 2회)만으로 후보가 되어 발동한다(standard 포함).
		expect(await autoEventCount(optionOnlyJobId)).toBeGreaterThanOrEqual(1);
	});

	it("excludes banner jobs even when they hold an active auto_period option", async () => {
		// 배너형은 옵션이 있어도 배너 제외(notInArray)로 후보에서 빠진다.
		expect(await autoEventCount(bannerOptionJobId)).toBe(0);
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

// 워커 풀 병렬 경로 검증: 동시 상한(10)을 넘는 12개 공고를 한 틱에 돌려 각 공고에 auto 이벤트가
// 정확히 1건씩 생기는지 확인한다(공유 인덱스에서 워커가 다음 대상을 꺼내는 재사용 경로 포함).
// 앞 describe의 fixtures는 그 블록 afterAll에서 이미 삭제되므로 이 블록의 공고만 auto 후보다.
describe("runAutoBoostTick (병렬 워커 풀)", () => {
	const PARALLEL_JOB_COUNT = 12;

	const parallelOrgId = `org_test_${randomUUID()}`;
	const parallelUserId = `user_test_parallel_${randomUUID()}`;
	const parallelMemberId = `member_test_${randomUUID()}`;
	const parallelPlacementId = randomUUID();
	const parallelProductId = randomUUID();
	const parallelJobIds = Array.from({ length: PARALLEL_JOB_COUNT }, () =>
		randomUUID()
	);

	beforeAll(async () => {
		await db.insert(user).values({
			email: `parallel-${randomUUID()}@bambi.test`,
			id: parallelUserId,
			name: "병렬 담당자",
		});
		await db.insert(organization).values({
			createdAt: realNow,
			id: parallelOrgId,
			name: "병렬 자동 끌어올리기 조직",
			slug: `auto-boost-parallel-${randomUUID()}`,
		});
		await db.insert(member).values({
			createdAt: realNow,
			id: parallelMemberId,
			organizationId: parallelOrgId,
			role: "owner",
			userId: parallelUserId,
		});
		await db.insert(bambiProfile).values({
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: parallelUserId,
		});
		await db.insert(employerOrganizationProfile).values({
			displayName: "병렬 자동 끌어올리기 업체",
			organizationId: parallelOrgId,
			verificationStatus: "verified",
		});
		await db.insert(adPlacement).values({
			id: parallelPlacementId,
			kind: "listing",
			name: "병렬 목록 상단 노출",
		});
		await db.insert(adProduct).values({
			autoBoostsPerDay: 1,
			id: parallelProductId,
			name: "병렬 자동 끌어올리기 상품",
			placementId: parallelPlacementId,
			priceOptions: [{ amount: 10_000, days: 7 }],
		});
		// 12개 공고 모두 공개·결제완료·노출 유효, 자동 1회. 창 끝(tickNow)이라 각 due=1.
		await db.insert(jobPost).values(
			parallelJobIds.map((id, index) => ({
				adProductId: parallelProductId,
				autoBoostsPerDay: 1,
				createdByUserId: parallelUserId,
				description: "병렬 워커 풀 검증 공고입니다.",
				exposureEndsAt: future,
				exposureType: "special" as const,
				id,
				industryCategory: "룸싸롱" as const,
				manualBoostsPerDay: 0,
				organizationId: parallelOrgId,
				payAmount: 180_000,
				payUnit: "일급",
				paymentStatus: "paid" as const,
				publishedAt: realNow,
				region: `auto-boost-parallel-${index}-${randomUUID()}`,
				status: "published" as const,
				title: `병렬 공고 ${index}`,
				workSchedule: "20:00-02:00",
			}))
		);
	});

	afterAll(async () => {
		await db
			.delete(jobBoostEvent)
			.where(inArray(jobBoostEvent.jobPostId, parallelJobIds));
		await db.delete(jobPost).where(inArray(jobPost.id, parallelJobIds));
		await db.delete(adProduct).where(eq(adProduct.id, parallelProductId));
		await db.delete(adPlacement).where(eq(adPlacement.id, parallelPlacementId));
		await db
			.delete(employerOrganizationProfile)
			.where(eq(employerOrganizationProfile.organizationId, parallelOrgId));
		await db.delete(member).where(eq(member.id, parallelMemberId));
		await db
			.delete(bambiProfile)
			.where(eq(bambiProfile.userId, parallelUserId));
		await db.delete(user).where(eq(user.id, parallelUserId));
		await db.delete(organization).where(eq(organization.id, parallelOrgId));
	});

	it("fires every due job exactly once in a single tick", async () => {
		const fired = await runAutoBoostTick(tickNow);
		// 12개 fixtures 전부 due=1 → 각각 1회. dev DB의 무관한 자동 후보가 있으면 global fired가 더 클 수
		// 있어 하한으로 검증하고(≥12), 병렬 경로의 핵심인 "각 공고 정확히 1건"은 공고별로 단언한다.
		expect(fired).toBeGreaterThanOrEqual(PARALLEL_JOB_COUNT);

		const counts = await Promise.all(
			parallelJobIds.map((id) => autoEventCount(id))
		);
		for (const eventCount of counts) {
			expect(eventCount).toBe(1);
		}
	});
});

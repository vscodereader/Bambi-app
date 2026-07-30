import { describe, expect, it } from "vitest";

import {
	groupCrawledAdBannerJobs,
	mergeAdBannerSlots,
} from "./bambi-ad-exposure";

const HOUR_MS = 60 * 60 * 1000;

const ad = (id: string) => ({ id });

// 버킷은 now/interval의 몫이라, 시각을 interval 배수로 만들어 버킷 번호를 직접 고른다.
const atBucket = (bucket: number) => new Date(bucket * HOUR_MS);

const pools = (horizontal: string[], vertical: string[]) => ({
	horizontal: horizontal.map(ad),
	vertical: vertical.map(ad),
});

const idsOf = (slots: ({ id: string } | null)[]) =>
	slots.map((slot) => slot?.id ?? null);

describe("groupCrawledAdBannerJobs", () => {
	it("가로형은 좌 3칸과 중간 2칸을 한 링으로 돈다", () => {
		const five = pools(["a", "b", "c", "d", "e"], []);
		const first = groupCrawledAdBannerJobs(five, atBucket(0), HOUR_MS);

		expect(idsOf(first.leftBanner)).toEqual(["a", "b", "c"]);
		expect(idsOf(first.premiumBanner)).toEqual(["d", "e"]);

		// 한 버킷 뒤: 전체가 한 칸씩 전진해 좌1에 있던 a가 좌2로 간다(링 길이 5).
		const next = groupCrawledAdBannerJobs(five, atBucket(1), HOUR_MS);

		expect([...idsOf(next.leftBanner), ...idsOf(next.premiumBanner)]).toEqual([
			"e",
			"a",
			"b",
			"c",
			"d",
		]);
	});

	// 이게 이 함수의 존재 이유다. 결제 광고처럼 좌→중간→우 한 줄로 돌면 세로 이미지만 있는
	// 공고가 가로 칸에 올라가 그 칸이 빈다.
	it("세로형은 우측 3칸 안에서만 순환하고 좌·중간으로 넘어가지 않는다", () => {
		const vertical = pools([], ["x", "y", "z"]);
		const buckets = [0, 1, 2, 3].map((bucket) =>
			groupCrawledAdBannerJobs(vertical, atBucket(bucket), HOUR_MS)
		);

		for (const groups of buckets) {
			expect(idsOf(groups.leftBanner)).toEqual([null, null, null]);
			expect(idsOf(groups.premiumBanner)).toEqual([null, null]);
			expect(idsOf(groups.rightBanner).toSorted()).toEqual(["x", "y", "z"]);
		}

		// 3칸·3개라 한 바퀴가 3버킷이다.
		expect(idsOf(buckets[0]?.rightBanner ?? [])).toEqual(
			idsOf(buckets[3]?.rightBanner ?? [])
		);
		expect(idsOf(buckets[0]?.rightBanner ?? [])).not.toEqual(
			idsOf(buckets[1]?.rightBanner ?? [])
		);
	});

	it("한 방향 이미지밖에 없는 공고는 그 방향 칸에만 나온다", () => {
		const groups = groupCrawledAdBannerJobs(
			pools(["h"], ["v"]),
			atBucket(0),
			HOUR_MS
		);

		expect([
			...idsOf(groups.leftBanner),
			...idsOf(groups.premiumBanner),
		]).toContain("h");
		expect([
			...idsOf(groups.leftBanner),
			...idsOf(groups.premiumBanner),
		]).not.toContain("v");
		expect(idsOf(groups.rightBanner)).toContain("v");
		expect(idsOf(groups.rightBanner)).not.toContain("h");
	});

	it("풀이 비면 모든 칸이 빈다", () => {
		const groups = groupCrawledAdBannerJobs(
			pools([], []),
			atBucket(7),
			HOUR_MS
		);

		expect([
			...idsOf(groups.leftBanner),
			...idsOf(groups.premiumBanner),
			...idsOf(groups.rightBanner),
		]).toEqual([null, null, null, null, null, null, null, null]);
	});

	it("같은 버킷이면 항상 같은 결과다(인스턴스 정합)", () => {
		const input = pools(["a", "b"], ["c"]);

		expect(groupCrawledAdBannerJobs(input, atBucket(9), HOUR_MS)).toEqual(
			groupCrawledAdBannerJobs(input, atBucket(9), HOUR_MS)
		);
	});
});

describe("mergeAdBannerSlots", () => {
	// 돈을 낸 광고를 수집 배너가 밀어내면 우리가 판 상품을 우리가 훼손하는 것이다.
	it("결제 광고가 있는 칸은 그대로 두고 빈 칸만 채운다", () => {
		const paid = [{ id: "paid-1" }, null, null];
		const crawled = [{ id: "crawled-1" }, { id: "crawled-2" }, null];

		expect(idsOf(mergeAdBannerSlots(paid, crawled))).toEqual([
			"paid-1",
			"crawled-2",
			null,
		]);
	});
});

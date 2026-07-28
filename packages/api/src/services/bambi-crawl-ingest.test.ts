import { describe, expect, it } from "vitest";

import {
	DEFAULT_CRAWL_INTERVAL_HOURS,
	isCrawlDue,
	isCrawlSiteImplemented,
	isYieldTrustworthy,
	MAX_LIST_PAGES,
	resolveListPageCount,
} from "./bambi-crawl-policy";

const NOW = new Date("2026-07-28T12:00:00Z");
const hoursAgo = (hours: number): Date =>
	new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe("isCrawlDue", () => {
	it("never runs while the master switch is off", () => {
		// 토글이 DB에 있어야 재배포 없이 즉시 멈출 수 있다.
		expect(
			isCrawlDue(
				{
					crawlEnabled: false,
					crawlIntervalHours: 1,
					crawlLastRunAt: hoursAgo(99),
				},
				NOW
			)
		).toBe(false);
	});

	it("runs immediately when it has never run", () => {
		expect(
			isCrawlDue(
				{ crawlEnabled: true, crawlIntervalHours: 6, crawlLastRunAt: null },
				NOW
			)
		).toBe(true);
	});

	it("waits for the configured interval to elapse", () => {
		const settings = {
			crawlEnabled: true,
			crawlIntervalHours: 6,
			crawlLastRunAt: hoursAgo(5),
		};

		expect(isCrawlDue(settings, NOW)).toBe(false);
		expect(isCrawlDue({ ...settings, crawlLastRunAt: hoursAgo(6) }, NOW)).toBe(
			true
		);
	});

	it("falls back to the code default when the interval is unset", () => {
		expect(
			isCrawlDue(
				{
					crawlEnabled: true,
					crawlIntervalHours: null,
					crawlLastRunAt: hoursAgo(DEFAULT_CRAWL_INTERVAL_HOURS - 1),
				},
				NOW
			)
		).toBe(false);
		expect(
			isCrawlDue(
				{
					crawlEnabled: true,
					crawlIntervalHours: null,
					crawlLastRunAt: hoursAgo(DEFAULT_CRAWL_INTERVAL_HOURS + 1),
				},
				NOW
			)
		).toBe(true);
	});
});

describe("isYieldTrustworthy", () => {
	it("rejects a run that parsed nothing from the listing", () => {
		// 상대가 마크업을 바꿔 0건이 나온 것을 "공고가 사라졌다"로 읽으면 수집분 전체가
		// 한 회차에 만료된다. 이 판정이 그 사고를 막는 장치다.
		expect(
			isYieldTrustworthy({
				detailAttempts: 0,
				detailFailures: 0,
				listItems: 0,
			})
		).toBe(false);
	});

	it("accepts a healthy run", () => {
		expect(
			isYieldTrustworthy({
				detailAttempts: 100,
				detailFailures: 3,
				listItems: 50,
			})
		).toBe(true);
	});

	it("rejects a run where most detail pages failed to parse", () => {
		expect(
			isYieldTrustworthy({
				detailAttempts: 100,
				detailFailures: 80,
				listItems: 50,
			})
		).toBe(false);
	});

	it("withholds judgement when the sample is too small", () => {
		// 상세 두 건이 실패한 것만으로 회차를 버리면, 삭제된 공고 몇 건에 수집이 멈춘다.
		expect(
			isYieldTrustworthy({
				detailAttempts: 2,
				detailFailures: 2,
				listItems: 50,
			})
		).toBe(true);
	});
});

describe("isCrawlSiteImplemented", () => {
	it("treats foxalba as ready and queenalba as not yet built", () => {
		// 파서가 없는 사이트를 골라도 수집기가 회차를 만들지 않도록, 이 판정이 게이트 역할을 한다.
		expect(isCrawlSiteImplemented("foxalba")).toBe(true);
		expect(isCrawlSiteImplemented("queenalba")).toBe(false);
	});
});

describe("resolveListPageCount", () => {
	it("derives the page count from the total, not the pager widget", () => {
		expect(resolveListPageCount(3283)).toBe(66);
		expect(resolveListPageCount(50)).toBe(1);
		expect(resolveListPageCount(51)).toBe(2);
	});

	it("still fetches one page when the total is unreadable", () => {
		expect(resolveListPageCount(null)).toBe(1);
		expect(resolveListPageCount(0)).toBe(1);
	});

	it("caps the page count so a bad total cannot flood the source", () => {
		expect(resolveListPageCount(1_000_000)).toBe(MAX_LIST_PAGES);
	});
});

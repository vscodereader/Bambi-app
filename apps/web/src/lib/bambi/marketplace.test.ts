import { describe, expect, it } from "vitest";
import { JOBS } from "./data";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	filterMarketplaceJobs,
	getSelectedMarketplaceJob,
} from "./marketplace";

describe("filterMarketplaceJobs", () => {
	it("returns all jobs for the default filter state", () => {
		const result = filterMarketplaceJobs(JOBS, DEFAULT_MARKETPLACE_FILTERS);

		expect(result).toHaveLength(JOBS.length);
	});

	it("filters jobs by free text across title, company, location, and tags", () => {
		const result = filterMarketplaceJobs(JOBS, {
			...DEFAULT_MARKETPLACE_FILTERS,
			query: "청담",
		});

		expect(result.map((job) => job.id)).toEqual(["j1", "j4"]);
	});

	it("filters jobs by region, category, pay, verification, and beginner-friendly chips", () => {
		const result = filterMarketplaceJobs(JOBS, {
			category: "라운지",
			minimumPay: 17_000,
			onlyBeginnerFriendly: true,
			onlyToday: false,
			onlyVerified: true,
			query: "",
			region: "강남",
		});

		expect(result.map((job) => job.id)).toEqual(["j1"]);
	});

	it("filters jobs to today-interview listings when the chip is on", () => {
		const result = filterMarketplaceJobs(JOBS, {
			...DEFAULT_MARKETPLACE_FILTERS,
			onlyToday: true,
		});

		expect(result.map((job) => job.id)).toEqual(["j3", "j4"]);
	});
});

describe("getSelectedMarketplaceJob", () => {
	it("returns the requested job when it is still visible", () => {
		const result = getSelectedMarketplaceJob(JOBS, "j2");

		expect(result?.id).toBe("j2");
	});

	it("falls back to the first visible job when the selected id is missing", () => {
		const result = getSelectedMarketplaceJob(JOBS, "missing");

		expect(result?.id).toBe("j1");
	});
});

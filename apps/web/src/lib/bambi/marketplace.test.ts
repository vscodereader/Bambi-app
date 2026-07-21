import { describe, expect, it } from "vitest";
import { JOBS } from "./data";
import {
	applyDiscoveryAxis,
	DEFAULT_MARKETPLACE_FILTERS,
	discoveryAxisForTab,
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
			subcategory: "전체",
		});

		expect(result.map((job) => job.id)).toEqual(["j1"]);
	});

	it("narrows results by the selected subcategory keyword", () => {
		const result = filterMarketplaceJobs(JOBS, {
			...DEFAULT_MARKETPLACE_FILTERS,
			subcategory: "매니저",
		});

		expect(result.length).toBeGreaterThan(0);
		expect(result.length).toBeLessThan(JOBS.length);
		for (const job of result) {
			const haystack = `${job.title} ${job.company} ${job.type} ${job.desc} ${job.tags.join(" ")}`;
			expect(haystack).toContain("매니저");
		}
	});

	it("filters jobs to instant-interview listings when the chip is on", () => {
		const result = filterMarketplaceJobs(JOBS, {
			...DEFAULT_MARKETPLACE_FILTERS,
			onlyToday: true,
		});

		expect(result.map((job) => job.id)).toEqual(["j3", "j4"]);
		for (const job of result) {
			expect(job.instantInterview).toBe(true);
		}
	});

	it("does not match negated text like 초보 사절 / 오늘 면접 불가", () => {
		const negated = JOBS.map((job) => ({
			...job,
			beginnerFriendly: false,
			desc: `${job.desc} 초보 사절, 오늘 면접 불가`,
			instantInterview: false,
		}));

		expect(
			filterMarketplaceJobs(negated, {
				...DEFAULT_MARKETPLACE_FILTERS,
				onlyBeginnerFriendly: true,
			})
		).toHaveLength(0);
		expect(
			filterMarketplaceJobs(negated, {
				...DEFAULT_MARKETPLACE_FILTERS,
				onlyToday: true,
			})
		).toHaveLength(0);
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

describe("applyDiscoveryAxis", () => {
	const base = {
		...DEFAULT_MARKETPLACE_FILTERS,
		category: "라운지",
		minimumPay: 20_000,
		query: "청담",
		region: "강남",
	};

	it("resets both region and category for the all axis", () => {
		expect(applyDiscoveryAxis(base, "all")).toEqual({
			...base,
			category: "전체",
			region: "전체",
		});
	});

	it("keeps region but clears category for the region axis", () => {
		expect(applyDiscoveryAxis(base, "region")).toEqual({
			...base,
			category: "전체",
		});
	});

	it("keeps category but clears region for the category axis", () => {
		expect(applyDiscoveryAxis(base, "category")).toEqual({
			...base,
			region: "전체",
		});
	});

	it("preserves unrelated filters like query and minimumPay", () => {
		const result = applyDiscoveryAxis(base, "region");

		expect(result.query).toBe("청담");
		expect(result.minimumPay).toBe(20_000);
	});
});

describe("discoveryAxisForTab", () => {
	it("maps region and category tab ids to their axis", () => {
		expect(discoveryAxisForTab("region")).toBe("region");
		expect(discoveryAxisForTab("category")).toBe("category");
	});

	it("maps all and disabled tabs to the all axis", () => {
		expect(discoveryAxisForTab("all")).toBe("all");
		expect(discoveryAxisForTab("map")).toBe("all");
		expect(discoveryAxisForTab("recent")).toBe("all");
	});
});

import { describe, expect, it } from "vitest";
import { JOBS } from "./data";
import {
	applyDiscoveryAxis,
	DEFAULT_MARKETPLACE_FILTERS,
	discoveryAxisForTab,
	filterMarketplaceJobs,
	getSelectedMarketplaceJob,
} from "./marketplace";
import type { Job } from "./types";

const baseJob: Job = {
	beginnerFriendly: false,
	company: "테스트",
	desc: "",
	district: "강남",
	featured: false,
	hours: "",
	id: "t1",
	instantInterview: false,
	location: "서울 · 강남",
	pay: "시급 20,000원",
	pref: "",
	rating: 0,
	region: "서울",
	reviews: 0,
	status: "published",
	tags: [],
	title: "공고",
	type: "클럽",
	verified: false,
};

describe("filterMarketplaceJobs 지역·업종", () => {
	it("시/도 필터는 job.region 필드로 정확 비교", () => {
		const jobs = [
			baseJob,
			{ ...baseJob, district: "해운대", id: "t2", region: "부산" },
		];
		const result = filterMarketplaceJobs(jobs, {
			...DEFAULT_MARKETPLACE_FILTERS,
			region: "서울",
		});

		expect(result.map((job) => job.id)).toEqual(["t1"]);
	});

	it("세부지역 필터는 job.district 필드로 정확 비교", () => {
		const jobs = [baseJob, { ...baseJob, district: "서초", id: "t2" }];
		const result = filterMarketplaceJobs(jobs, {
			...DEFAULT_MARKETPLACE_FILTERS,
			district: "강남",
			region: "서울",
		});

		expect(result.map((job) => job.id)).toEqual(["t1"]);
	});

	it("업종 필터는 job.type으로 비교", () => {
		const jobs = [baseJob, { ...baseJob, id: "t2", type: "라운지" }];
		const result = filterMarketplaceJobs(jobs, {
			...DEFAULT_MARKETPLACE_FILTERS,
			category: "클럽",
		});

		expect(result.map((job) => job.id)).toEqual(["t1"]);
	});

	it("초보 가능·당일면접 칩은 필드로 좁힌다", () => {
		const jobs = [
			baseJob,
			{
				...baseJob,
				beginnerFriendly: true,
				id: "t2",
				instantInterview: true,
			},
		];

		expect(
			filterMarketplaceJobs(jobs, {
				...DEFAULT_MARKETPLACE_FILTERS,
				onlyBeginnerFriendly: true,
			}).map((job) => job.id)
		).toEqual(["t2"]);
		expect(
			filterMarketplaceJobs(jobs, {
				...DEFAULT_MARKETPLACE_FILTERS,
				onlyToday: true,
			}).map((job) => job.id)
		).toEqual(["t2"]);
	});
});

describe("filterMarketplaceJobs", () => {
	it("returns all jobs for the default filter state", () => {
		const result = filterMarketplaceJobs(JOBS, DEFAULT_MARKETPLACE_FILTERS);

		expect(result).toHaveLength(JOBS.length);
	});

	it("filters jobs by free text across title, company, location, and tags", () => {
		const query = "강남";
		const result = filterMarketplaceJobs(JOBS, {
			...DEFAULT_MARKETPLACE_FILTERS,
			query,
		});

		// mock의 지역 표기가 바뀌면 id 목록은 쉽게 낡으므로, 결과가 비지 않고
		// 모든 결과가 검색어를 어느 필드에든 포함하는지로 검증한다.
		expect(result.length).toBeGreaterThan(0);
		expect(
			result.every((job) =>
				[
					job.title,
					job.company,
					job.location,
					job.pay,
					job.type,
					job.hours,
					job.pref,
					...job.tags,
				]
					.join(" ")
					.includes(query)
			)
		).toBe(true);
	});

	it("filters jobs by region, category, pay, verification, and beginner-friendly chips", () => {
		const result = filterMarketplaceJobs(JOBS, {
			category: "라운지",
			district: "강남",
			minimumPay: 17_000,
			onlyBeginnerFriendly: true,
			onlyToday: false,
			onlyVerified: true,
			query: "",
			region: "서울",
		});

		expect(result.map((job) => job.id)).toEqual(["j1"]);
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

		expect(result?.id).toBe(JOBS[0]?.id);
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

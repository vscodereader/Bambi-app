import { describe, expect, it } from "vitest";
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
	type: "BAR",
	verified: false,
};

// 마켓플레이스 필터/선택 로직 검증용 자체 픽스처. 각 테스트의 기대값(특정 id 집합)에
// 맞춰 최소한의 공고를 구성한다 — 삭제된 샘플 데이터(data.ts)를 대체한다.
const sampleJobs: Job[] = [
	{
		...baseJob,
		id: "j1",
		beginnerFriendly: true,
		company: "달밤 라운지",
		district: "강남",
		location: "서울 · 강남",
		pay: "시급 18,000원",
		region: "서울",
		type: "룸싸롱",
		verified: true,
	},
	{
		...baseJob,
		id: "j2",
		company: "문스톤 라운지",
		district: "강남",
		location: "서울 · 강남",
		pay: "시급 17,000원",
		region: "서울",
		type: "룸싸롱",
		verified: true,
	},
	{
		...baseJob,
		id: "j3",
		company: "시그니처 바",
		district: "용산",
		instantInterview: true,
		location: "서울 · 용산",
		region: "서울",
		type: "BAR",
	},
	{
		...baseJob,
		id: "j4",
		company: "라운지 엘",
		district: "서초",
		instantInterview: true,
		location: "서울 · 서초",
		region: "서울",
		type: "단란주점",
	},
];

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
		const jobs = [baseJob, { ...baseJob, id: "t2", type: "룸싸롱" }];
		const result = filterMarketplaceJobs(jobs, {
			...DEFAULT_MARKETPLACE_FILTERS,
			category: "BAR",
		});

		expect(result.map((job) => job.id)).toEqual(["t1"]);
	});

	it("최소 시급은 일급·월급 공고를 시급으로 환산해 비교한다", () => {
		const jobs = [
			{ ...baseJob, id: "hourly", pay: "시급 20,000원" },
			{ ...baseJob, id: "daily", pay: "일급 150,000원" }, // 18,750원/h
			{ ...baseJob, id: "monthly", pay: "월급 3,500,000원" }, // 16,746원/h
		];

		const result = filterMarketplaceJobs(jobs, {
			...DEFAULT_MARKETPLACE_FILTERS,
			minimumPay: 18_000,
		});

		expect(result.map((job) => job.id)).toEqual(["hourly", "daily"]);
	});

	it("금액 없는 공고는 최소 시급을 걸면 빠지고 기본 필터에는 남는다", () => {
		const jobs = [{ ...baseJob, id: "negotiable", pay: "급여 협의" }];

		expect(
			filterMarketplaceJobs(jobs, {
				...DEFAULT_MARKETPLACE_FILTERS,
				minimumPay: 1,
			})
		).toEqual([]);
		expect(
			filterMarketplaceJobs(jobs, DEFAULT_MARKETPLACE_FILTERS)
		).toHaveLength(1);
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
		const result = filterMarketplaceJobs(
			sampleJobs,
			DEFAULT_MARKETPLACE_FILTERS
		);

		expect(result).toHaveLength(sampleJobs.length);
	});

	it("filters jobs by region, category, pay, verification, and beginner-friendly chips", () => {
		const result = filterMarketplaceJobs(sampleJobs, {
			category: "룸싸롱",
			district: "강남",
			minimumPay: 17_000,
			onlyBeginnerFriendly: true,
			onlyToday: false,
			onlyVerified: true,
			region: "서울",
		});

		expect(result.map((job) => job.id)).toEqual(["j1"]);
	});

	it("filters jobs to instant-interview listings when the chip is on", () => {
		const result = filterMarketplaceJobs(sampleJobs, {
			...DEFAULT_MARKETPLACE_FILTERS,
			onlyToday: true,
		});

		expect(result.map((job) => job.id)).toEqual(["j3", "j4"]);
		for (const job of result) {
			expect(job.instantInterview).toBe(true);
		}
	});

	it("does not match negated text like 초보 사절 / 오늘 면접 불가", () => {
		const negated = sampleJobs.map((job) => ({
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
		const result = getSelectedMarketplaceJob(sampleJobs, "j2");

		expect(result?.id).toBe("j2");
	});

	it("falls back to the first visible job when the selected id is missing", () => {
		const result = getSelectedMarketplaceJob(sampleJobs, "missing");

		expect(result?.id).toBe(sampleJobs[0]?.id);
	});
});

describe("applyDiscoveryAxis", () => {
	const base = {
		...DEFAULT_MARKETPLACE_FILTERS,
		category: "룸싸롱",
		minimumPay: 20_000,
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

	it("preserves unrelated filters like minimumPay", () => {
		const result = applyDiscoveryAxis(base, "region");

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

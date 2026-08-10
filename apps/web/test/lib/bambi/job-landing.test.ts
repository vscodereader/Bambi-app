import { describe, expect, it } from "vitest";
import {
	findJobLandingIndustry,
	findJobLandingRegion,
	JOB_LANDING_INDUSTRIES,
	JOB_LANDING_REGIONS,
	jobLandingDescription,
	jobLandingPath,
	jobLandingPaths,
	jobLandingTitle,
} from "@/lib/bambi/job-landing";
import { industryOptions } from "@/lib/bambi-options";

const ASCII_SLUG = /^[a-z][a-z-]*$/;

describe("job landing slugs", () => {
	it("keeps every industry option addressable", () => {
		expect(JOB_LANDING_INDUSTRIES.map((item) => item.label)).toEqual([
			...industryOptions,
		]);
	});
	it("uses unique ascii slugs on both axes", () => {
		const slugs = [
			...JOB_LANDING_REGIONS.map((item) => item.slug),
			...JOB_LANDING_INDUSTRIES.map((item) => item.slug),
		];

		for (const slug of slugs) {
			expect(slug).toMatch(ASCII_SLUG);
		}
		expect(new Set(slugs).size).toBe(slugs.length);
	});
	it("maps region slugs back to the region master code", () => {
		expect(findJobLandingRegion("seoul")?.code).toBe("1100000000");
		expect(findJobLandingRegion("unknown")).toBeUndefined();
		expect(findJobLandingIndustry("room-salon")?.label).toBe("룸싸롱");
		expect(findJobLandingIndustry("unknown")).toBeUndefined();
	});
});

describe("job landing paths and copy", () => {
	const region = findJobLandingRegion("seoul");
	const industry = findJobLandingIndustry("room-salon");

	it("builds one path per axis combination", () => {
		expect(jobLandingPath({})).toBe("/jobs");
		expect(jobLandingPath({ region })).toBe("/jobs/seoul");
		expect(jobLandingPath({ industry, region })).toBe("/jobs/seoul/room-salon");
		// 지역 없는 업종 랜딩은 없다 — 업종 세그먼트를 버린다.
		expect(jobLandingPath({ industry })).toBe("/jobs");
	});
	// 사이트맵이 그대로 싣는 목록이라, 빠지거나 중복되면 색인이 어긋난다.
	it("lists every landing address once for the sitemap", () => {
		const paths = jobLandingPaths();
		const expected =
			1 + JOB_LANDING_REGIONS.length * (1 + JOB_LANDING_INDUSTRIES.length);

		expect(paths).toHaveLength(expected);
		expect(new Set(paths).size).toBe(expected);
		expect(paths).toContain("/jobs");
		expect(paths).toContain("/jobs/seoul");
		expect(paths).toContain("/jobs/seoul/room-salon");
	});
	it("gives each landing its own title and description", () => {
		expect(jobLandingTitle({ industry, region })).toBe(
			"서울 룸싸롱 알바 채용 정보 | 밤비알바"
		);
		const titles = new Set([
			jobLandingTitle({}),
			jobLandingTitle({ region }),
			jobLandingTitle({ industry, region }),
		]);
		const descriptions = new Set([
			jobLandingDescription({}),
			jobLandingDescription({ region }),
			jobLandingDescription({ industry, region }),
		]);

		expect(titles.size).toBe(3);
		expect(descriptions.size).toBe(3);
	});
});

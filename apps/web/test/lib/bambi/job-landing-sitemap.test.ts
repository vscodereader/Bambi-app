import { describe, expect, it } from "vitest";
import {
	buildJobLandingSitemapEntries,
	type LandingSummaryRow,
} from "@/lib/bambi/job-landing-sitemap";

const BASE = "https://bambialba.com";

const COMBO_URL_RE = /\/jobs\/[a-z-]+\/[a-z-]+$/;

// 랜딩 표의 확정 슬러그(테스트가 매핑을 못 박는다).
const SEOUL = "1100000000";
const BUSAN = "2600000000";
const ROOM_SALON = "룸싸롱";

const entryByPath = (
	entries: ReturnType<typeof buildJobLandingSitemapEntries>,
	path: string
) => entries.find((entry) => entry.url === `${BASE}${path}`);

describe("buildJobLandingSitemapEntries", () => {
	it("falls back to all 161 landing paths without lastmod when summary is null", () => {
		const entries = buildJobLandingSitemapEntries(null, BASE);

		// 1 인덱스 + 16 지역 + 16×9 조합.
		expect(entries).toHaveLength(1 + 16 + 16 * 9);
		expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
			true
		);
		expect(entryByPath(entries, "/jobs")).toBeDefined();
		expect(entryByPath(entries, "/jobs/seoul/room-salon")).toBeDefined();
	});

	it("includes empty combos without lastmod", () => {
		const summary: LandingSummaryRow[] = [
			{
				count: 3,
				industryCategory: ROOM_SALON,
				lastModified: "2026-08-20T00:00:00.000Z",
				regionCode: SEOUL,
			},
		];
		const entries = buildJobLandingSitemapEntries(summary, BASE);

		// 채워진 조합(서울×룸싸롱)은 lastmod가 있고, 0건 조합도 lastmod 없이 항목으로 실린다.
		expect(
			entryByPath(entries, "/jobs/seoul/room-salon")?.lastModified
		).toEqual(new Date("2026-08-20T00:00:00.000Z"));
		expect(entryByPath(entries, "/jobs/seoul/bar")).toBeDefined();
		expect(
			entryByPath(entries, "/jobs/seoul/bar")?.lastModified
		).toBeUndefined();
		expect(entryByPath(entries, "/jobs/busan/room-salon")).toBeDefined();
		expect(
			entryByPath(entries, "/jobs/busan/room-salon")?.lastModified
		).toBeUndefined();
		// 조합 항목은 16×9 = 144개 전부(인덱스·16개 지역 허브는 별도).
		const comboEntries = entries.filter((entry) =>
			COMBO_URL_RE.test(entry.url)
		);
		expect(comboEntries).toHaveLength(144);
	});

	it("keeps all 16 region hub pages even when empty", () => {
		const entries = buildJobLandingSitemapEntries([], BASE);

		expect(entryByPath(entries, "/jobs")).toBeDefined();
		expect(entryByPath(entries, "/jobs/seoul")).toBeDefined();
		expect(entryByPath(entries, "/jobs/jeju")).toBeDefined();
		// 인덱스(1) + 지역(16) + 조합(16×9), lastmod는 전부 없음.
		expect(entries).toHaveLength(1 + 16 + 16 * 9);
		expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
			true
		);
	});

	it("maps combo lastmod, region lastmod = max within region, index = global max", () => {
		const summary: LandingSummaryRow[] = [
			{
				count: 1,
				industryCategory: ROOM_SALON,
				lastModified: new Date("2026-08-10T00:00:00.000Z"),
				regionCode: SEOUL,
			},
			{
				count: 1,
				industryCategory: "BAR",
				lastModified: new Date("2026-08-22T00:00:00.000Z"),
				regionCode: SEOUL,
			},
			{
				count: 1,
				industryCategory: ROOM_SALON,
				lastModified: new Date("2026-08-25T00:00:00.000Z"),
				regionCode: BUSAN,
			},
		];
		const entries = buildJobLandingSitemapEntries(summary, BASE);

		expect(
			entryByPath(entries, "/jobs/seoul/room-salon")?.lastModified
		).toEqual(new Date("2026-08-10T00:00:00.000Z"));
		// 서울 허브 = 서울 조합 중 최신(bar 8/22).
		expect(entryByPath(entries, "/jobs/seoul")?.lastModified).toEqual(
			new Date("2026-08-22T00:00:00.000Z")
		);
		// 인덱스 = 전체 최신(부산 룸싸롱 8/25).
		expect(entryByPath(entries, "/jobs")?.lastModified).toEqual(
			new Date("2026-08-25T00:00:00.000Z")
		);
	});

	it("merges own and crawled rows for the same combo to the latest time", () => {
		const summary: LandingSummaryRow[] = [
			{
				count: 2,
				industryCategory: ROOM_SALON,
				lastModified: new Date("2026-08-10T00:00:00.000Z"),
				regionCode: SEOUL,
			},
			{
				count: 5,
				industryCategory: ROOM_SALON,
				lastModified: new Date("2026-08-18T00:00:00.000Z"),
				regionCode: SEOUL,
			},
		];
		const entries = buildJobLandingSitemapEntries(summary, BASE);

		expect(
			entryByPath(entries, "/jobs/seoul/room-salon")?.lastModified
		).toEqual(new Date("2026-08-18T00:00:00.000Z"));
	});

	it("includes a combo with null lastmod but omits its lastModified", () => {
		const summary: LandingSummaryRow[] = [
			{
				count: 1,
				industryCategory: ROOM_SALON,
				lastModified: null,
				regionCode: SEOUL,
			},
		];
		const entries = buildJobLandingSitemapEntries(summary, BASE);
		const combo = entryByPath(entries, "/jobs/seoul/room-salon");

		expect(combo).toBeDefined();
		expect(combo?.lastModified).toBeUndefined();
		// 시각이 없으면 지역 허브·인덱스도 lastmod를 붙이지 않는다.
		expect(entryByPath(entries, "/jobs/seoul")?.lastModified).toBeUndefined();
		expect(entryByPath(entries, "/jobs")?.lastModified).toBeUndefined();
	});

	it("ignores rows for regions outside the 16-region table (e.g. null regionCode)", () => {
		const summary: LandingSummaryRow[] = [
			{
				count: 4,
				industryCategory: ROOM_SALON,
				lastModified: new Date("2026-08-30T00:00:00.000Z"),
				regionCode: null,
			},
		];
		const entries = buildJobLandingSitemapEntries(summary, BASE);

		// 조합·지역 항목엔 lastmod가 안 붙지만 인덱스 최신 계산엔 기여한다.
		expect(entries).toHaveLength(1 + 16 + 16 * 9);
		expect(entryByPath(entries, "/jobs")?.lastModified).toEqual(
			new Date("2026-08-30T00:00:00.000Z")
		);
	});
});

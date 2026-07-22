import { describe, expect, it } from "vitest";
import {
	buildExposureJobSections,
	groupAdBannerJobs,
	isExposureActive,
	PREMIUM_BANNER_MAX_SLOTS,
	requiredAdBannerUsagesForExposureType,
	SIDE_BANNER_MAX_SLOTS,
} from "./bambi-ad-exposure";

const NOW = new Date("2026-07-15T00:00:00Z");
const FUTURE = new Date("2026-08-01T00:00:00Z");
const PAST = new Date("2026-07-01T00:00:00Z");

const row = (id: string, exposureType: string, overrides = {}) => ({
	exposureEndsAt: FUTURE,
	exposureType,
	id,
	publishedAt: NOW,
	status: "published",
	...overrides,
});

describe("isExposureActive", () => {
	it("만료일 null은 활성으로 본다", () => {
		expect(isExposureActive(null, NOW)).toBe(true);
	});
	it("만료일이 지났으면 비활성이다", () => {
		expect(isExposureActive(PAST, NOW)).toBe(false);
	});
});

describe("buildExposureJobSections", () => {
	it("exposureType별 섹션에 배치하고 전체 공고에는 유료 공고도 함께 담는다", () => {
		const special = row("s1", "special");
		const organicOnly = row("o1", "standard");
		const { sections, totalCount } = buildExposureJobSections({
			limit: 30,
			now: NOW,
			organicRows: [special, organicOnly],
			recommendedRows: [],
			specialRows: [special],
			urgentRows: [],
		});
		expect(sections.special.map((r) => r.id)).toEqual(["s1"]);
		expect(sections.organic.map((r) => r.id)).toEqual(["s1", "o1"]);
		// 중복 노출이라도 총계는 고유 공고 수로 센다.
		expect(totalCount).toBe(2);
	});
	it("만료된 유료 공고는 섹션에서 빠지고 organic으로 강등된다", () => {
		const expired = row("s1", "special", { exposureEndsAt: PAST });
		const { sections } = buildExposureJobSections({
			limit: 30,
			now: NOW,
			organicRows: [expired],
			recommendedRows: [],
			specialRows: [expired],
			urgentRows: [],
		});
		expect(sections.special).toEqual([]);
		expect(sections.organic.map((r) => r.id)).toEqual(["s1"]);
	});
	it("활성(published·미만료) 매칭 공고를 상한 없이 전부 섹션에 포함한다", () => {
		const specials = Array.from({ length: 7 }, (_, i) =>
			row(`s${i}`, "special")
		);
		const { sections } = buildExposureJobSections({
			limit: 30,
			now: NOW,
			organicRows: [],
			recommendedRows: [],
			specialRows: specials,
			urgentRows: [],
		});
		expect(sections.special).toHaveLength(7);
	});
	it("유료 공고가 앞자리를 차지해도 무료 공고가 전체 공고에서 밀리지 않는다", () => {
		const specials = Array.from({ length: 3 }, (_, i) =>
			row(`s${i}`, "special")
		);
		const organicOnly = [row("o0", "standard"), row("o1", "standard")];
		const { sections } = buildExposureJobSections({
			limit: 2,
			now: NOW,
			organicRows: [...specials, ...organicOnly],
			recommendedRows: [],
			specialRows: specials,
			urgentRows: [],
		});
		expect(sections.special).toHaveLength(3);
		// organic 상한이 유료 섹션 크기만큼 늘어 무료 2건이 그대로 남는다.
		const organicIds = sections.organic.map((r) => r.id);
		expect(organicIds).toContain("o0");
		expect(organicIds).toContain("o1");
	});
});

const HOUR_MS = 60 * 60 * 1000;

const makeRow = (id: string, exposureType: string) => ({
	exposureEndsAt: null,
	exposureType,
	id,
});

// 세 그룹을 좌→중→우 순서(8칸)로 이어 붙인 평면 배열. 활성 칸만 non-null이다.
const flatSlots = <T>(groups: {
	leftBanner: (T | null)[];
	premiumBanner: (T | null)[];
	rightBanner: (T | null)[];
}): (T | null)[] => [
	...groups.leftBanner,
	...groups.premiumBanner,
	...groups.rightBanner,
];

const activeIndex = <T>(groups: {
	leftBanner: (T | null)[];
	premiumBanner: (T | null)[];
	rightBanner: (T | null)[];
}): number => flatSlots(groups).findIndex((slot) => slot !== null);

const activeId = (groups: {
	leftBanner: ({ id: string } | null)[];
	premiumBanner: ({ id: string } | null)[];
	rightBanner: ({ id: string } | null)[];
}): string | undefined => flatSlots(groups).find((slot) => slot !== null)?.id;

describe("groupAdBannerJobs", () => {
	// 풀은 id 오름차순으로 정렬되므로 b0..b(n-1)이 그대로 링 기준 순서가 된다.
	const pool = (n: number) =>
		Array.from({ length: n }, (_, i) => makeRow(`b${i}`, "premium-banner"));

	it("그룹은 고정 길이(좌3·중2·우3) 배열이다", () => {
		const groups = groupAdBannerJobs(pool(3), NOW);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
	});

	it("화면 전체에서 광고는 언제나 딱 한 칸에만 노출되고 나머지는 null이다", () => {
		for (const n of [1, 3, 8, 12]) {
			const filled = flatSlots(groupAdBannerJobs(pool(n), NOW)).filter(
				(slot) => slot !== null
			);
			expect(filled).toHaveLength(1);
		}
	});

	it("레거시 left-banner/right-banner 공고도 통합 풀에 합류해 후보가 된다", () => {
		const rows = [
			...Array.from({ length: 3 }, (_, i) => makeRow(`l${i}`, "left-banner")),
			...Array.from({ length: 3 }, (_, i) => makeRow(`r${i}`, "right-banner")),
		];
		// 여러 버킷을 돌면 레거시 공고도 라운드로빈으로 반드시 표시된다.
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const shown = new Set<string>();
		for (let step = 0; step < rows.length; step++) {
			const id = activeId(
				groupAdBannerJobs(rows, new Date(base + step * HOUR_MS))
			);
			if (id) {
				shown.add(id);
			}
		}
		expect([...shown].sort()).toEqual(rows.map((r) => r.id).sort());
	});

	it("만료된 배너는 링 후보에서 빠진다", () => {
		const rows = [
			makeRow("live", "left-banner"),
			{ exposureEndsAt: PAST, exposureType: "left-banner", id: "expired" },
		];
		const groups = groupAdBannerJobs(rows, NOW);
		const filled = flatSlots(groups).filter(
			(
				slot
			): slot is { exposureEndsAt: null; exposureType: string; id: string } =>
				slot !== null
		);
		expect(filled.map((r) => r.id)).toEqual(["live"]);
	});

	it("풀이 비면 세 그룹 모두 고정 길이 null 배열이다", () => {
		const groups = groupAdBannerJobs([], NOW);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(flatSlots(groups).every((slot) => slot === null)).toBe(true);
	});
});

describe("groupAdBannerJobs 링 순환", () => {
	const pool = (n: number) =>
		Array.from({ length: n }, (_, i) => makeRow(`b${i}`, "premium-banner"));

	it("같은 버킷이면 몇 번을 호출해도 같은 칸·같은 광고다", () => {
		const rows = pool(3);
		const a = groupAdBannerJobs(rows, new Date("2026-07-21T03:10:00Z"));
		const b = groupAdBannerJobs(rows, new Date("2026-07-21T03:50:00Z"));
		expect(activeIndex(b)).toBe(activeIndex(a));
		expect(activeId(b)).toBe(activeId(a));
	});

	it("버킷마다 활성 칸이 한 칸씩 전진하고 8칸을 돌면 처음으로 순환한다", () => {
		const rows = pool(1);
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const indices = Array.from({ length: 9 }, (_, step) =>
			activeIndex(groupAdBannerJobs(rows, new Date(base + step * HOUR_MS)))
		);
		for (let step = 1; step < indices.length; step++) {
			const prev = indices[step - 1] ?? -1;
			const curr = indices[step] ?? -1;
			expect(curr).toBe((prev + 1) % 8);
		}
		// 8칸을 돌면 처음 칸으로 되돌아온다.
		expect(indices[8]).toBe(indices[0]);
	});

	it("광고가 여러 개면 칸 전진마다 표시 광고도 라운드로빈으로 교체된다", () => {
		const rows = pool(3);
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const ids = Array.from({ length: 3 }, (_, step) =>
			activeId(groupAdBannerJobs(rows, new Date(base + step * HOUR_MS)))
		);
		expect(ids[1]).not.toBe(ids[0]);
		expect(ids[2]).not.toBe(ids[1]);
		expect(new Set(ids).size).toBe(3);
	});

	it("광고가 1개면 그 광고가 칸만 옮겨 다닌다", () => {
		const rows = pool(1);
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const a = groupAdBannerJobs(rows, new Date(base));
		const b = groupAdBannerJobs(rows, new Date(base + HOUR_MS));
		expect(activeId(a)).toBe("b0");
		expect(activeId(b)).toBe("b0");
		expect(activeIndex(b)).toBe(((activeIndex(a) ?? -1) + 1) % 8);
	});

	it("커스텀 주기(분)를 주면 그 주기 단위로 버킷이 전진한다", () => {
		const rows = pool(1);
		const tenMin = 10 * 60 * 1000;
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const a = groupAdBannerJobs(rows, new Date(base), tenMin);
		// 10분 뒤 = 다음 버킷 → 한 칸 전진.
		const b = groupAdBannerJobs(rows, new Date(base + tenMin), tenMin);
		expect(activeIndex(b)).toBe(((activeIndex(a) ?? -1) + 1) % 8);
		// 기본(1h) 주기라면 10분 뒤는 아직 같은 버킷이라 칸이 그대로다.
		const c = groupAdBannerJobs(rows, new Date(base + tenMin));
		const d = groupAdBannerJobs(rows, new Date(base));
		expect(activeIndex(c)).toBe(activeIndex(d));
	});
});

describe("requiredAdBannerUsagesForExposureType", () => {
	it("배너형은 가로+세로 두 규격을 모두 요구한다", () => {
		for (const type of ["premium-banner", "left-banner", "right-banner"]) {
			expect(requiredAdBannerUsagesForExposureType(type)).toEqual([
				"ad_horizontal",
				"ad_vertical",
			]);
		}
	});
	it("배너형이 아니면 빈 배열이다", () => {
		for (const type of ["standard", "special", "urgent", "recommended", ""]) {
			expect(requiredAdBannerUsagesForExposureType(type)).toEqual([]);
		}
	});
});

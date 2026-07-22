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

describe("groupAdBannerJobs", () => {
	it("상단·좌·우 슬롯을 하나의 프리미엄 풀에서 채우고 만료를 제외한다", () => {
		const rows = [
			...Array.from({ length: 5 }, (_, i) => row(`p${i}`, "premium-banner")),
			row("expired", "premium-banner", { exposureEndsAt: PAST }),
		];
		const groups = groupAdBannerJobs(rows, NOW);
		// 풀(활성 5건) > 슬롯 상한이므로 각 슬롯은 상한까지 찬다.
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		// 선발은 전부 활성 풀에서만 나온다(만료 공고 배제).
		const poolIds = Array.from({ length: 5 }, (_, i) => `p${i}`);
		const selected = [
			...groups.premiumBanner,
			...groups.leftBanner,
			...groups.rightBanner,
		];
		for (const r of selected) {
			expect(poolIds).toContain(r.id);
		}
	});
	it("레거시 left-banner/right-banner 공고도 통합 풀에 합류해 세 슬롯 후보가 된다", () => {
		const rows = [
			...Array.from({ length: 3 }, (_, i) => row(`l${i}`, "left-banner")),
			...Array.from({ length: 3 }, (_, i) => row(`r${i}`, "right-banner")),
		];
		const groups = groupAdBannerJobs(rows, NOW);
		// 프리미엄 상품이 하나도 없어도 레거시 side 공고만으로 프리미엄 슬롯이 채워진다.
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		const poolIds = [
			...Array.from({ length: 3 }, (_, i) => `l${i}`),
			...Array.from({ length: 3 }, (_, i) => `r${i}`),
		];
		for (const r of [...groups.premiumBanner, ...groups.rightBanner]) {
			expect(poolIds).toContain(r.id);
		}
	});
	it("슬롯 상한은 프리미엄 2개·좌우 각 3개다", () => {
		const rows = Array.from({ length: 10 }, (_, i) =>
			row(`p${i}`, "premium-banner")
		);
		const groups = groupAdBannerJobs(rows, NOW);
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
	});
});

const HOUR_MS = 60 * 60 * 1000;

const makeRow = (id: string, exposureType: string) => ({
	exposureEndsAt: null,
	exposureType,
	id,
});

const idsOf = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("groupAdBannerJobs 1시간 랜덤 로테이션", () => {
	const leftRows = Array.from({ length: 8 }, (_, i) =>
		makeRow(`left-${i}`, "left-banner")
	);
	const premiumRows = Array.from({ length: 8 }, (_, i) =>
		makeRow(`prem-${i}`, "premium-banner")
	);

	it("같은 시간 버킷에서는 몇 번을 호출해도 같은 선발을 돌려준다", () => {
		const now = new Date("2026-07-21T03:10:00Z");
		const again = new Date("2026-07-21T03:50:00Z"); // 같은 버킷(03시)
		const first = groupAdBannerJobs(leftRows, now);
		const second = groupAdBannerJobs(leftRows, again);
		expect(second.leftBanner.map((r) => r.id)).toEqual(
			first.leftBanner.map((r) => r.id)
		);
	});

	it("시간 버킷이 지나면 선발이 바뀐다(72버킷 중 최소 1회 변화)", () => {
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const selections = new Set<string>();
		for (let hour = 0; hour < 72; hour++) {
			const groups = groupAdBannerJobs(
				leftRows,
				new Date(base + hour * HOUR_MS)
			);
			selections.add(groups.leftBanner.map((r) => r.id).join(","));
		}
		expect(selections.size).toBeGreaterThan(1);
	});

	it("슬롯 초과 후보 전원이 72버킷 안에 최소 1회 선발된다(고정 배제 없음)", () => {
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const seen = new Set<string>();
		for (let hour = 0; hour < 72; hour++) {
			const groups = groupAdBannerJobs(
				leftRows,
				new Date(base + hour * HOUR_MS)
			);
			for (const r of groups.leftBanner) {
				seen.add(r.id);
			}
		}
		expect([...seen].sort()).toEqual(idsOf(leftRows));
	});

	it("프리미엄은 2개로 캡되고 좌/우는 3개를 유지한다", () => {
		const rows = [
			...leftRows,
			...premiumRows,
			...Array.from({ length: 8 }, (_, i) =>
				makeRow(`right-${i}`, "right-banner")
			),
		];
		const groups = groupAdBannerJobs(rows, new Date("2026-07-21T03:00:00Z"));
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
	});

	it("후보가 슬롯 이하면 전원 노출된다(집합 기준)", () => {
		const few = leftRows.slice(0, 2);
		const groups = groupAdBannerJobs(few, new Date("2026-07-21T03:00:00Z"));
		expect(idsOf(groups.leftBanner)).toEqual(idsOf(few));
	});

	it("만료된 배너는 로테이션 후보에서 빠진다", () => {
		const now = new Date("2026-07-21T03:00:00Z");
		const rows = [
			{ ...makeRow("left-live", "left-banner") },
			{
				exposureEndsAt: new Date("2026-07-20T00:00:00Z"),
				exposureType: "left-banner",
				id: "left-expired",
			},
		];
		const groups = groupAdBannerJobs(rows, now);
		expect(idsOf(groups.leftBanner)).toEqual(["left-live"]);
	});

	it("프리미엄만 있는 풀이 좌·우 슬롯도 채운다(통합 풀 공유)", () => {
		const groups = groupAdBannerJobs(
			premiumRows,
			new Date("2026-07-21T03:00:00Z")
		);
		const poolIds = premiumRows.map((r) => r.id);
		for (const r of [...groups.leftBanner, ...groups.rightBanner]) {
			expect(poolIds).toContain(r.id);
		}
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
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

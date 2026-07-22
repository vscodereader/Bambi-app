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

describe("groupAdBannerJobs 링 로테이션", () => {
	// 풀은 id 오름차순으로 정렬되므로 b0..b(n-1)이 그대로 링 기준 순서가 된다.
	const pool = (n: number) =>
		Array.from({ length: n }, (_, i) => makeRow(`b${i}`, "premium-banner"));

	it("같은 버킷에서는 몇 번을 호출해도 세 그룹 모두 같은 선발을 돌려준다", () => {
		const rows = pool(8);
		const now = new Date("2026-07-21T03:10:00Z");
		const again = new Date("2026-07-21T03:50:00Z"); // 같은 버킷(03시)
		const first = groupAdBannerJobs(rows, now);
		const second = groupAdBannerJobs(rows, again);
		expect(second.leftBanner.map((r) => r.id)).toEqual(
			first.leftBanner.map((r) => r.id)
		);
		expect(second.premiumBanner.map((r) => r.id)).toEqual(
			first.premiumBanner.map((r) => r.id)
		);
		expect(second.rightBanner.map((r) => r.id)).toEqual(
			first.rightBanner.map((r) => r.id)
		);
	});

	it("버킷이 하나 지나면 링이 좌→중간→우로 정확히 한 칸 전진한다(n=8)", () => {
		const rows = pool(8);
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const a = groupAdBannerJobs(rows, new Date(base));
		const b = groupAdBannerJobs(rows, new Date(base + HOUR_MS));
		// 각 칸의 공고가 링 진행 방향으로 다음 칸에 그대로 나타난다.
		expect(b.leftBanner[2]?.id).toBe(a.leftBanner[1]?.id);
		expect(b.premiumBanner[0]?.id).toBe(a.leftBanner[2]?.id);
		expect(b.rightBanner[0]?.id).toBe(a.premiumBanner[1]?.id);
		expect(b.leftBanner[0]?.id).toBe(a.rightBanner[2]?.id);
	});

	it("n=9면 우측 끝 공고는 다음 버킷에 대기하고, 대기하던 공고가 좌측 첫 칸으로 진입한다", () => {
		const rows = pool(9);
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const a = groupAdBannerJobs(rows, new Date(base));
		const b = groupAdBannerJobs(rows, new Date(base + HOUR_MS));
		const aIds = new Set(
			[...a.leftBanner, ...a.premiumBanner, ...a.rightBanner].map((r) => r.id)
		);
		const bIds = new Set(
			[...b.leftBanner, ...b.premiumBanner, ...b.rightBanner].map((r) => r.id)
		);
		// 8칸뿐이라 매 버킷 정확히 1건이 비노출로 대기한다.
		expect(aIds.size).toBe(8);
		// a의 우측 끝 공고는 다음 버킷에 어느 그룹에도 없다(대기 진입).
		expect(bIds.has(a.rightBanner[2]?.id ?? "")).toBe(false);
		// a에서 대기하던(어느 그룹에도 없던) 공고가 b의 좌측 첫 칸으로 진입한다.
		const waiting = rows.map((r) => r.id).find((id) => !aIds.has(id));
		expect(b.leftBanner[0]?.id).toBe(waiting);
	});

	it("n<8이면 그룹당 min(칸수,n)개·그룹 내 중복 없이 세 그룹 합집합이 전 공고를 덮는다", () => {
		const rows = pool(5);
		const groups = groupAdBannerJobs(rows, new Date("2026-07-21T03:00:00Z"));
		expect(groups.leftBanner).toHaveLength(3);
		expect(groups.premiumBanner).toHaveLength(2);
		expect(groups.rightBanner).toHaveLength(3);
		// 그룹 내부에 같은 공고가 두 번 쌓이지 않는다.
		for (const g of [
			groups.leftBanner,
			groups.premiumBanner,
			groups.rightBanner,
		]) {
			expect(new Set(g.map((r) => r.id)).size).toBe(g.length);
		}
		// 세 그룹의 합집합은 전 공고를 포함한다(n≤8이면 전원 노출).
		const union = idsOf([
			...groups.leftBanner,
			...groups.premiumBanner,
			...groups.rightBanner,
		]);
		expect([...new Set(union)]).toEqual(idsOf(rows));
	});

	it("만료된 배너는 링 후보에서 빠진다", () => {
		const rows = [
			makeRow("live", "left-banner"),
			{
				exposureEndsAt: new Date("2026-07-20T00:00:00Z"),
				exposureType: "left-banner",
				id: "expired",
			},
		];
		const groups = groupAdBannerJobs(rows, new Date("2026-07-21T03:00:00Z"));
		const all = new Set(
			[
				...groups.leftBanner,
				...groups.premiumBanner,
				...groups.rightBanner,
			].map((r) => r.id)
		);
		expect([...all]).toEqual(["live"]);
	});

	it("슬롯 상한은 프리미엄 2개·좌우 각 3개다", () => {
		const groups = groupAdBannerJobs(
			pool(10),
			new Date("2026-07-21T03:00:00Z")
		);
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
	});

	it("풀이 비면 세 그룹 모두 빈 배열이다", () => {
		const groups = groupAdBannerJobs([], new Date("2026-07-21T03:00:00Z"));
		expect(groups.leftBanner).toEqual([]);
		expect(groups.premiumBanner).toEqual([]);
		expect(groups.rightBanner).toEqual([]);
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

import { describe, expect, it } from "vitest";
import {
	buildExposureJobSections,
	groupAdBannerJobs,
	isExposureActive,
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
	it("배너 타입별 활성 공고를 그룹핑하고 만료를 제외한다(프리미엄은 상한 없음)", () => {
		const rows = [
			...Array.from({ length: 5 }, (_, i) => row(`p${i}`, "premium-banner")),
			row("l1", "left-banner"),
			row("r1", "right-banner", { exposureEndsAt: PAST }),
		];
		const groups = groupAdBannerJobs(rows, NOW);
		expect(groups.premiumBanner).toHaveLength(5);
		expect(groups.leftBanner.map((r) => r.id)).toEqual(["l1"]);
		expect(groups.rightBanner).toEqual([]);
	});
	it("좌/우 사이드 배너는 각각 최대 3개(앞에서부터)만 노출하고 프리미엄은 전부 포함한다", () => {
		const rows = [
			...Array.from({ length: 5 }, (_, i) => row(`p${i}`, "premium-banner")),
			...Array.from({ length: 4 }, (_, i) => row(`l${i}`, "left-banner")),
			...Array.from({ length: 4 }, (_, i) => row(`r${i}`, "right-banner")),
		];
		const groups = groupAdBannerJobs(rows, NOW);
		// 프리미엄은 상한 없이 5개 전부.
		expect(groups.premiumBanner).toHaveLength(5);
		// 좌/우는 SIDE_BANNER_MAX_SLOTS(3)개까지, 정렬상 앞의 3개만.
		expect(groups.leftBanner.map((r) => r.id)).toEqual(["l0", "l1", "l2"]);
		expect(groups.rightBanner.map((r) => r.id)).toEqual(["r0", "r1", "r2"]);
	});
});

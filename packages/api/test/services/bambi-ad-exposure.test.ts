import { describe, expect, it } from "vitest";
import {
	buildExposureJobSections,
	groupAdBannerJobs,
	isExposureActive,
	PREMIUM_BANNER_MAX_SLOTS,
	requireDirectionImage,
	requiredAdBannerUsagesForExposureType,
	SIDE_BANNER_MAX_SLOTS,
} from "@/services/bambi-ad-exposure";

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
	it("organic 쿼리가 못 집어온 섹션 공고도 전체 공고에 반드시 담는다", () => {
		const special = row("s1", "special");
		const urgent = row("u1", "urgent");
		const { sections, totalCount } = buildExposureJobSections({
			limit: 30,
			now: NOW,
			// 상한이 걸린 별도 쿼리라 섹션 공고가 아예 안 들어온 상황.
			organicRows: [row("o1", "standard")],
			recommendedRows: [],
			specialRows: [special],
			urgentRows: [urgent],
		});
		expect(sections.organic.map((r) => r.id)).toEqual(["o1", "s1", "u1"]);
		// 유료 배지는 호출부가 섹션 여부로 붙이므로 원값을 유지한다.
		expect(sections.organic.map((r) => r.exposureType)).toEqual([
			"standard",
			"special",
			"urgent",
		]);
		expect(totalCount).toBe(3);
	});
	it("전체 공고 창 크기는 섹션 보강분을 빼고 센다(더보기 커서 기준)", () => {
		const special = row("s1", "special");
		const { organicWindowSize, sections } = buildExposureJobSections({
			limit: 2,
			now: NOW,
			organicRows: [
				row("o1", "standard"),
				row("o2", "standard"),
				row("o3", "standard"),
			],
			recommendedRows: [],
			specialRows: [special],
			urgentRows: [],
		});
		// 창 = limit(2) + 섹션 1건 = 3. 뒤에 보강으로 붙은 s1은 정렬 창 밖이라 세지 않는다 —
		// 여기까지 커서를 전진시키면 다음 페이지가 o3 다음이 아니라 그 뒤부터 시작해 한 건이 샌다.
		expect(sections.organic.map((r) => r.id)).toEqual(["o1", "o2", "o3", "s1"]);
		expect(organicWindowSize).toBe(3);
	});
});

const makeRow = (id: string, exposureType: string) => ({
	exposureEndsAt: null,
	exposureType,
	id,
});

// 링 한 바퀴의 칸 수. 슬롯 상수에서 파생시킨다 — 숫자를 박아 두면 좌·중·우 칸 수를
// 바꿀 때마다 이 파일 전체의 8이 조용히 틀린 기대값이 된다.
const TOTAL_SLOTS = SIDE_BANNER_MAX_SLOTS * 2 + PREMIUM_BANNER_MAX_SLOTS;

// 세 그룹을 좌→중→우 순서(TOTAL_SLOTS칸)로 이어 붙인 평면 배열. 활성 칸만 non-null이다.
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

// 링 전체(좌0-2·중3-5·우6-8)를 평면화한 id 배열(대기 칸은 null). 컨베이어 검증의 기본 관측면.
const flatIds = (groups: {
	leftBanner: ({ id: string } | null)[];
	premiumBanner: ({ id: string } | null)[];
	rightBanner: ({ id: string } | null)[];
}): (string | null)[] => flatSlots(groups).map((slot) => slot?.id ?? null);

const slotOf = (
	groups: {
		leftBanner: ({ id: string } | null)[];
		premiumBanner: ({ id: string } | null)[];
		rightBanner: ({ id: string } | null)[];
	},
	id: string
): number => flatIds(groups).indexOf(id);

const shownIds = (groups: {
	leftBanner: ({ id: string } | null)[];
	premiumBanner: ({ id: string } | null)[];
	rightBanner: ({ id: string } | null)[];
}): string[] => flatIds(groups).filter((id): id is string => id !== null);

describe("groupAdBannerJobs", () => {
	// 풀은 id 오름차순으로 정렬되므로 b0..b(n-1)이 그대로 링 기준 순서가 된다.
	const pool = (n: number) =>
		Array.from({ length: n }, (_, i) => makeRow(`b${i}`, "premium-banner"));
	// interval=1ms·now=버킷값이면 버킷 인덱스를 정수로 직접 지정할 수 있다(결정적 검증용).
	const atBucket = (rows: ReturnType<typeof pool>, b: number) =>
		groupAdBannerJobs(rows, new Date(b), 1);

	it("그룹은 고정 길이(좌3·중3·우3) 배열이다", () => {
		const groups = groupAdBannerJobs(pool(3), NOW);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
	});

	// 성질 ①: 어떤 버킷·어떤 n에서도 같은 광고가 두 칸에 나오지 않는다.
	it("어떤 버킷에서도 같은 광고가 두 칸에 나오지 않는다", () => {
		for (const n of [1, 3, TOTAL_SLOTS, TOTAL_SLOTS + 1, TOTAL_SLOTS + 3]) {
			for (const b of [0, 1, 2, 7, 8, 13, 100]) {
				const shown = shownIds(atBucket(pool(n), b));
				expect(new Set(shown).size).toBe(shown.length);
			}
		}
	});

	// 성질 ②: 광고가 링 칸 수 이상이면 모든 칸이 서로 다른 광고로 가득 찬다.
	it("n≥링 칸 수면 전 칸이 서로 다른 광고로 채워진다", () => {
		for (const n of [TOTAL_SLOTS, TOTAL_SLOTS + 4]) {
			for (const b of [0, 1, 5, 13, 100]) {
				const ids = flatIds(atBucket(pool(n), b));
				expect(ids.every((id) => id !== null)).toBe(true);
				expect(new Set(ids).size).toBe(TOTAL_SLOTS);
			}
		}
	});

	// 성질 ④: 광고 1개면 슬롯 (bucket mod 링 칸 수) 한 칸에만 — 직전 단일칸 동작과 동일.
	it("n=1이면 슬롯 (bucket mod 링 칸 수) 한 칸에만 노출된다", () => {
		const rows = pool(1);
		for (const b of [0, 1, 7, 8, 15, 100]) {
			const groups = atBucket(rows, b);
			expect(shownIds(groups)).toEqual(["b0"]);
			expect(slotOf(groups, "b0")).toBe(
				((b % TOTAL_SLOTS) + TOTAL_SLOTS) % TOTAL_SLOTS
			);
		}
	});

	// 성질 ⑤: 광고가 링 칸 수보다 적으면 등록순 연속 칸을 채운 "열차"로 배치된다.
	it("n<링 칸 수면 광고들이 등록순 연속 칸 '열차'로 배치된다", () => {
		const rows = pool(3);
		for (const b of [0, 1, 6, 7, 8]) {
			const groups = atBucket(rows, b);
			expect(shownIds(groups)).toHaveLength(3);
			const head = slotOf(groups, "b0");
			expect(head).toBe(((b % TOTAL_SLOTS) + TOTAL_SLOTS) % TOTAL_SLOTS);
			// b0→b1→b2가 진행 방향(mod 링 칸 수)으로 연속 배치된다.
			expect(slotOf(groups, "b1")).toBe((head + 1) % TOTAL_SLOTS);
			expect(slotOf(groups, "b2")).toBe((head + 2) % TOTAL_SLOTS);
		}
	});

	it("레거시 left-banner/right-banner 공고도 통합 풀에 합류해 후보가 된다", () => {
		const rows = [
			...Array.from({ length: 3 }, (_, i) => makeRow(`l${i}`, "left-banner")),
			...Array.from({ length: 3 }, (_, i) => makeRow(`r${i}`, "right-banner")),
		];
		// n=6은 링 칸 수보다 적어 한 버킷에서 여섯 공고가 모두 열차로 노출된다.
		const shown = shownIds(groupAdBannerJobs(rows, NOW));
		expect([...shown].sort()).toEqual(rows.map((r) => r.id).sort());
	});

	it("만료된 배너는 링 후보에서 빠진다", () => {
		const rows = [
			makeRow("live", "left-banner"),
			{ exposureEndsAt: PAST, exposureType: "left-banner", id: "expired" },
		];
		expect(shownIds(groupAdBannerJobs(rows, NOW))).toEqual(["live"]);
	});

	it("풀이 비면 세 그룹 모두 고정 길이 null 배열이다", () => {
		const groups = groupAdBannerJobs([], NOW);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(flatSlots(groups).every((slot) => slot === null)).toBe(true);
	});
});

describe("groupAdBannerJobs 컨베이어 순환", () => {
	// id를 두 자리로 채운다 — 링 순서는 id 문자열 정렬이라 b10이 b1과 b2 사이에 끼어
	// "등록순"이라는 이 describe의 전제가 열 개를 넘는 순간 조용히 깨진다.
	const bannerId = (index: number) => `b${String(index).padStart(2, "0")}`;
	const pool = (n: number) =>
		Array.from({ length: n }, (_, i) => makeRow(bannerId(i), "premium-banner"));
	const atBucket = (rows: ReturnType<typeof pool>, b: number) =>
		groupAdBannerJobs(rows, new Date(b), 1);

	it("같은 버킷이면 몇 번을 호출해도 같은 슬롯 배치다", () => {
		const rows = pool(10);
		const a = groupAdBannerJobs(rows, new Date("2026-07-21T03:10:00Z"));
		const b = groupAdBannerJobs(rows, new Date("2026-07-21T03:50:00Z"));
		expect(flatIds(b)).toEqual(flatIds(a));
	});

	// 성질 ③: 버킷이 1 증가하면 노출 중인 각 광고가 정확히 한 칸 전진한다.
	it("버킷이 1 증가하면 노출 중인 각 광고가 정확히 한 칸 전진한다", () => {
		for (const n of [1, 3, TOTAL_SLOTS, TOTAL_SLOTS + 2]) {
			const rows = pool(n);
			for (const b of [0, 3, 7, 20]) {
				const cur = flatIds(atBucket(rows, b));
				const next = flatIds(atBucket(rows, b + 1));
				for (let s = 0; s < TOTAL_SLOTS - 1; s++) {
					const id = cur[s];
					if (id !== null) {
						// 마지막 칸이 아니면 다음 버킷에 s+1 칸으로 이동한다.
						expect(next[s + 1]).toBe(id);
					}
				}
			}
		}
	});

	// 성질 ③(퇴장·재진입): 링 칸 수보다 2개 많으면 전 칸 노출·2개 대기, 마지막 칸 다음
	// L−TOTAL_SLOTS=2버킷 대기 후 좌1 재진입.
	it("링 칸 수+2개: 전 칸 노출·2개 대기, 마지막 칸 퇴장 후 2버킷 대기했다 좌1로 재진입한다", () => {
		const waiting = 2;
		const n = TOTAL_SLOTS + waiting;
		const rows = pool(n);
		// 버킷 0에서 첫 광고가 좌1(slot0)에 오도록 j=((s−0) mod n)=s로 채워진다.
		expect(shownIds(atBucket(rows, 0))).toHaveLength(TOTAL_SLOTS);
		// 첫 광고의 전 생애: 좌1→…→우3, 이후 2버킷 대기(-1), 버킷 n에서 좌1 재진입.
		const trail = Array.from({ length: n + 1 }, (_, b) =>
			slotOf(atBucket(rows, b), bannerId(0))
		);
		expect(trail.slice(0, TOTAL_SLOTS)).toEqual(
			Array.from({ length: TOTAL_SLOTS }, (_, index) => index)
		);
		expect(trail.slice(TOTAL_SLOTS, n)).toEqual(
			Array.from({ length: waiting }, () => -1)
		);
		expect(trail[n]).toBe(0);
		// 대기 중인 두 광고는 등록순 뒤쪽이고 버킷 0에선 화면에 없다.
		const shown0 = new Set(shownIds(atBucket(rows, 0)));
		expect(shown0.has(bannerId(TOTAL_SLOTS))).toBe(false);
		expect(shown0.has(bannerId(TOTAL_SLOTS + 1))).toBe(false);
	});

	it("광고가 1개면 그 광고가 칸만 옮겨 다닌다", () => {
		const rows = pool(1);
		const a = atBucket(rows, 0);
		const b = atBucket(rows, 1);
		expect(activeId(a)).toBe(bannerId(0));
		expect(activeId(b)).toBe(bannerId(0));
		expect(activeIndex(b)).toBe(((activeIndex(a) ?? -1) + 1) % TOTAL_SLOTS);
	});

	it("커스텀 주기(분)를 주면 그 주기 단위로 버킷이 전진한다", () => {
		const rows = pool(1);
		const tenMin = 10 * 60 * 1000;
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const a = groupAdBannerJobs(rows, new Date(base), tenMin);
		// 10분 뒤 = 다음 버킷 → 한 칸 전진.
		const b = groupAdBannerJobs(rows, new Date(base + tenMin), tenMin);
		expect(activeIndex(b)).toBe(((activeIndex(a) ?? -1) + 1) % TOTAL_SLOTS);
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

describe("requireDirectionImage", () => {
	const imageLayout = {
		horizontal: {
			background: { type: "image" },
			scrim: { enabled: true, opacity: 65 },
			texts: [],
		},
		version: 1,
		vertical: {
			background: { type: "image" },
			scrim: { enabled: true, opacity: 65 },
			texts: [],
		},
	};
	const colorLayout = {
		...imageLayout,
		horizontal: {
			...imageLayout.horizontal,
			background: { color: "#1f2937", type: "color" },
		},
	};
	const media = { storageKey: "ad-h.png" };

	it("방향 이미지가 없으면 후보에서 비운다", () => {
		// 종전 동작 보존 — 이미지 배경인데 이미지가 없으면 커버로 폴백하지 않고 자리표시로 둔다.
		expect(
			requireDirectionImage(
				[{ adHorizontal: null, id: "a", layout: imageLayout }],
				"ad_horizontal"
			)
		).toEqual([null]);
		// 레이아웃을 편집한 적 없는 공고(layout null)도 마찬가지다.
		expect(
			requireDirectionImage(
				[{ adHorizontal: null, id: "a", layout: null }],
				"ad_horizontal"
			)
		).toEqual([null]);
	});

	it("배경이 단색인 슬롯은 이미지가 없어도 후보로 남는다", () => {
		// 여기서 떨어뜨리면 저장까지 마친 단색 배너가 영영 노출되지 않고 impression도 없다.
		const row = { adHorizontal: null, id: "a", layout: colorLayout };

		expect(requireDirectionImage([row], "ad_horizontal")).toEqual([row]);
	});

	it("한쪽만 단색이면 반대쪽은 여전히 이미지를 요구한다", () => {
		const row = { adVertical: null, id: "a", layout: colorLayout };

		expect(requireDirectionImage([row], "ad_vertical")).toEqual([null]);
	});

	it("방향 이미지가 있으면 그대로 남고 빈 칸(null)은 그대로 둔다", () => {
		const row = { adHorizontal: media, id: "a", layout: imageLayout };

		expect(requireDirectionImage([row, null], "ad_horizontal")).toEqual([
			row,
			null,
		]);
	});
});

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
	it("전체 공고는 유료 여부와 무관하게 정렬 앞의 limit건만 유지한다", () => {
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
		expect(sections.organic.map((r) => r.id)).toEqual(["s0", "s1"]);
	});
	it("섹션 공고를 전체 공고 뒤에 보강해 페이지 정원을 넘기지 않는다", () => {
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
		expect(sections.organic.map((r) => r.id)).toEqual(["o1"]);
		expect(totalCount).toBe(3);
	});
	it("전체 공고 창과 더보기 커서는 정확히 limit건만 센다", () => {
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
		expect(sections.organic.map((r) => r.id)).toEqual(["o1", "o2"]);
		expect(organicWindowSize).toBe(2);
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

	// 성질 ②: 광고가 링 칸 수 이상이면 "광고 등록 문의" 예약 칸 하나를 뺀 모든 칸이 서로 다른
	// 광고로 가득 찬다. 예약 칸은 만석에서도 반드시 한 칸 비므로 전 칸이 차는 일은 없다 —
	// 여기서 "전 칸 non-null"을 계속 요구하면 문의 카드가 사라지는 회귀를 테스트가 강제하게 된다.
	it("n≥링 칸 수면 예약 칸을 뺀 전 칸이 서로 다른 광고로 채워진다", () => {
		for (const n of [TOTAL_SLOTS, TOTAL_SLOTS + 4]) {
			for (const b of [0, 1, 5, 13, 100]) {
				const groups = atBucket(pool(n), b);
				const ids = flatIds(groups);
				// 비는 칸은 정확히 하나이고, 그 칸이 곧 문의 카드가 예약한 칸이다.
				expect(ids.filter((id) => id === null)).toHaveLength(1);
				expect(ids[groups.inquirySlotIndex]).toBeNull();
				expect(new Set(shownIds(groups)).size).toBe(TOTAL_SLOTS - 1);
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

	// 성질 ③(퇴장·재진입): 광고 n개는 문의 센티넬 1개와 함께 길이 L=n+1인 링을 돈다. 링 칸 수보다
	// 2개 많으면 화면 9칸 중 예약 칸을 뺀 8칸이 광고로 차고, 마지막 칸을 지난 광고는
	// L−TOTAL_SLOTS=3버킷 대기했다 좌1로 재진입한다. (센티넬이 링을 한 칸 늘렸으므로 대기가
	// 2버킷이 아니라 3버킷이고 재진입 버킷도 n이 아니라 L이다 — 대기 수를 손으로 박지 않고
	// 링 길이에서 파생시켜 둔다.)
	it("링 칸 수+2개: 예약 칸을 뺀 전 칸 노출, 마지막 칸 퇴장 후 (링−칸 수)버킷 대기했다 좌1로 재진입한다", () => {
		const n = TOTAL_SLOTS + 2;
		const ring = n + 1;
		const waiting = ring - TOTAL_SLOTS;
		const rows = pool(n);
		// 버킷 0에서 첫 광고가 좌1(slot0)에 오도록 j=((s−0) mod L)=s로 채워진다.
		expect(shownIds(atBucket(rows, 0))).toHaveLength(TOTAL_SLOTS - 1);
		// 첫 광고의 전 생애: 좌1→…→우3, 이후 waiting버킷 대기(-1), 버킷 L에서 좌1 재진입.
		const trail = Array.from({ length: ring + 1 }, (_, b) =>
			slotOf(atBucket(rows, b), bannerId(0))
		);
		expect(trail.slice(0, TOTAL_SLOTS)).toEqual(
			Array.from({ length: TOTAL_SLOTS }, (_, index) => index)
		);
		expect(trail.slice(TOTAL_SLOTS, ring)).toEqual(
			Array.from({ length: waiting }, () => -1)
		);
		expect(trail[ring]).toBe(0);
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

// "광고 등록 문의" 카드는 광고가 아니라 링 위의 가상 아이템(센티넬)이다. 정원이 다 차면 9칸이
// 전부 광고로 덮여 문의 카드가 사라지고, 반대로 광고가 적으면 빈 칸이 전부 같은 문의 카드로
// 도배된다 — 이 두 실패를 동시에 막는 것이 센티넬의 존재 이유라, 아래 검증은 전부 "언제나
// 정확히 한 칸, 그리고 매 버킷 다른 칸"이라는 성질을 광고 수를 바꿔 가며 확인한다.
describe("groupAdBannerJobs 광고 등록 문의 센티넬", () => {
	// 두 자리 id — 열 개를 넘기면 문자열 정렬에서 b10이 b1과 b2 사이에 끼어 "등록순" 전제가 깨진다.
	const bannerId = (index: number) => `b${String(index).padStart(2, "0")}`;
	const pool = (n: number) =>
		Array.from({ length: n }, (_, i) => makeRow(bannerId(i), "premium-banner"));
	const atBucket = (rows: ReturnType<typeof pool>, b: number) =>
		groupAdBannerJobs(rows, new Date(b), 1);
	// 링 한 바퀴의 버킷 수 = 광고 n개 + 센티넬 1개, 단 화면 칸 수(9)가 하한이다. 이만큼 버킷을
	// 돌리면 센티넬이 링을 정확히 한 바퀴 돈다 — 주기 단위 성질은 이 길이로만 세야 맞는다.
	const ringLength = (n: number) => Math.max(n + 1, TOTAL_SLOTS);

	// 예약 칸은 (a) 항상 화면 안(0..8)이고 (b) 항상 비어 있어야 한다. 호출부는 이 null을 그대로
	// 자리표시로 렌더하므로, 범위를 벗어나면 문의 카드가 사라지고 비어 있지 않으면 광고를 덮는다.
	const expectReservedSlot = (groups: ReturnType<typeof atBucket>) => {
		expect(groups.inquirySlotIndex).toBeGreaterThanOrEqual(0);
		expect(groups.inquirySlotIndex).toBeLessThan(TOTAL_SLOTS);
		expect(flatSlots(groups)[groups.inquirySlotIndex]).toBeNull();
	};

	it("광고가 0개여도 예약 칸은 화면 안의 빈 칸 하나다", () => {
		// n=0도 early return 없이 같은 경로를 타므로 반환 계약(inquirySlotIndex)이 갈리지 않는다.
		for (const b of [0, 1, 5, 8, 13, 100]) {
			const groups = atBucket(pool(0), b);
			expectReservedSlot(groups);
			expect(shownIds(groups)).toEqual([]);
		}
	});

	it("광고가 링 칸 수 미만이면 예약 칸이 광고를 하나도 밀어내지 않는다", () => {
		// n≤8이면 ring=9라 센티넬의 링 인덱스 n이 앉는 칸은 원래 대기(빈) 칸이다 — 즉 fold가
		// 일어날 수 없고 노출 광고 수가 줄지 않는다. 여기가 깨지면 돈 낸 광고를 문의 카드가 밀어낸 것이다.
		for (const n of [1, 8]) {
			const rows = pool(n);
			for (let b = 0; b < ringLength(n); b++) {
				const groups = atBucket(rows, b);
				expectReservedSlot(groups);
				expect(shownIds(groups)).toHaveLength(Math.min(n, TOTAL_SLOTS));
			}
		}
	});

	it("만석(9·10개)이어도 매 버킷 예약 칸이 한 칸 비고, fold는 설계된 횟수만 일어난다", () => {
		// 밀려난 광고 수는 노출 총량으로 센다 — 광고 하나는 링 한 바퀴 동안 화면 9칸을 한 번씩
		// 지나므로 fold가 없다면 총 9n건이고, fold가 난 버킷마다 광고 1건이 예약 칸에 덮여 1씩 준다.
		const expectedFolds: Record<number, number> = { 9: 1, 10: 2 };
		for (const n of [9, 10]) {
			const rows = pool(n);
			let totalShown = 0;
			for (let b = 0; b < ringLength(n); b++) {
				const groups = atBucket(rows, b);
				expectReservedSlot(groups);
				const shown = shownIds(groups);
				// 만석 화면은 fold 버킷이든 아니든 항상 "광고 8 + 문의 1"로 고정된다.
				expect(shown).toHaveLength(TOTAL_SLOTS - 1);
				// 성질 ①(한 광고는 한 칸에만)은 센티넬이 끼어들어도 그대로 성립한다.
				expect(new Set(shown).size).toBe(shown.length);
				totalShown += shown.length;
			}
			expect(TOTAL_SLOTS * n - totalShown).toBe(expectedFolds[n]);
		}
	});

	it("버킷이 1 증가하면 예약 칸도 옮겨 간다", () => {
		// 문의 카드가 한 칸에 눌러앉으면 그 자리를 판매 슬롯으로 영영 못 쓰고, 다른 칸은 영영
		// 문의 카드를 못 본다. n=9만 예외라 아래 케이스에서 따로 못 박는다.
		for (const n of [0, 1, 2, 8, 10, 11]) {
			const rows = pool(n);
			for (let b = 0; b < ringLength(n); b++) {
				expect(atBucket(rows, b + 1).inquirySlotIndex).not.toBe(
					atBucket(rows, b).inquirySlotIndex
				);
			}
		}
	});

	it("광고가 정확히 9개면 링당 한 번 예약 칸이 좌1에 두 버킷 머문다", () => {
		// fold 규칙((rawSlot+bucket) % 9)의 산술적 귀결이다 — ring=10·bucket 0에서만 rawSlot 9(→0)와
		// 다음 버킷의 rawSlot 0(→0)이 맞붙어 슬롯 0이 연달아 나온다(ring≥11이면 어긋난다).
		// 정지가 아니라 한 바퀴에 한 번 겹치는 것이므로, 9칸을 모두 도는 성질은 그대로다.
		const rows = pool(9);
		const slots = Array.from(
			{ length: ringLength(9) },
			(_, b) => atBucket(rows, b).inquirySlotIndex
		);
		expect(slots[0]).toBe(0);
		expect(slots.slice(1)).toEqual(
			Array.from({ length: TOTAL_SLOTS }, (_, index) => index)
		);
	});

	it("fold로 밀려나는 광고가 한 곳에 고이지 않는다(링 한 바퀴 노출 편차 ≤ 1)", () => {
		// fold 버킷마다 광고 1건이 예약 칸에 덮이는데, 그 대상이 늘 같은 광고면 같은 값을 낸
		// 광고주 하나만 항구적으로 노출(과 impression 집계)을 잃는다. 접는 칸을 버킷만큼
		// 회전시키기 전에는 밀리는 링 인덱스가 n−9로 고정돼 n=10에서 그 광고만 9회 중 7회만
		// 노출됐다(n≥18이면 0회). 그래서 fold "횟수"가 아니라 "누가 밀렸는가"를 못 박는다.
		for (const n of [9, 10, 11, 12]) {
			const rows = pool(n);
			const shownCount = new Map(rows.map((r) => [r.id, 0]));
			for (let b = 0; b < ringLength(n); b++) {
				for (const id of shownIds(atBucket(rows, b))) {
					shownCount.set(id, (shownCount.get(id) ?? 0) + 1);
				}
			}
			const counts = [...shownCount.values()];
			expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
			// 링 한 바퀴 동안 한 번도 안 나온 광고가 있으면 그 광고주는 사실상 미노출이다.
			expect(Math.min(...counts)).toBeGreaterThan(0);
		}
	});

	it("어떤 광고 수에서도 예약 칸은 링 한 바퀴 동안 9칸을 모두 순회한다", () => {
		// 문의 카드가 특정 칸에 갇히지 않는다는 진짜 불변식. 광고 수가 바뀌어도 한 주기 안에
		// 좌·중간·우 아홉 칸이 모두 한 번씩 문의 카드 자리가 된다.
		for (const n of [0, 1, 2, 8, 9, 10, 11, 13]) {
			const rows = pool(n);
			const visited = new Set(
				Array.from(
					{ length: ringLength(n) },
					(_, b) => atBucket(rows, b).inquirySlotIndex
				)
			);
			expect(visited.size).toBe(TOTAL_SLOTS);
		}
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

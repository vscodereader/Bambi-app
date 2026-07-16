import { describe, expect, it } from "vitest";

import {
	BOOST_INELIGIBLE_MESSAGES,
	countDueAutoBoostSlots,
	getAutoBoostSlotOffsetMs,
	getKstDayStart,
	resolveBoostEligibility,
} from "./bambi-job-boost";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_DURATION_MS = 12 * HOUR_MS;

const FUTURE = new Date("2026-08-01T00:00:00Z");
const NOW = new Date("2026-07-16T05:00:00Z"); // KST 2026-07-16 14:00

const eligibleInput = {
	adProductId: "ad-1",
	exposureEndsAt: FUTURE,
	manualBoostsPerDay: 3,
	now: NOW,
	paymentStatus: "paid",
	status: "published",
	usedToday: 0,
};

describe("getKstDayStart", () => {
	it("returns KST midnight expressed in UTC (15:00 previous day)", () => {
		// KST 2026-07-16 14:00 → 그날 자정(KST 00:00) = UTC 2026-07-15 15:00
		expect(getKstDayStart(NOW).toISOString()).toBe("2026-07-15T15:00:00.000Z");
	});

	it("rolls to the next KST day at 15:00 UTC", () => {
		// UTC 16일 14:59 = KST 16일 23:59 → 자정은 15일 15:00Z
		expect(getKstDayStart(new Date("2026-07-16T14:59:59Z")).toISOString()).toBe(
			"2026-07-15T15:00:00.000Z"
		);
		// UTC 16일 15:00 = KST 17일 00:00 → 자정은 16일 15:00Z
		expect(getKstDayStart(new Date("2026-07-16T15:00:00Z")).toISOString()).toBe(
			"2026-07-16T15:00:00.000Z"
		);
	});
});

describe("resolveBoostEligibility", () => {
	it("allows a paid published ad job under its daily limit", () => {
		expect(resolveBoostEligibility(eligibleInput)).toEqual({ eligible: true });
	});

	it("rejects a job without an ad product", () => {
		expect(
			resolveBoostEligibility({ ...eligibleInput, adProductId: null })
		).toEqual({ eligible: false, reason: "not_ad_job" });
	});

	it("rejects unpaid or unpublished jobs", () => {
		expect(
			resolveBoostEligibility({ ...eligibleInput, paymentStatus: "unpaid" })
		).toEqual({ eligible: false, reason: "not_publicly_visible" });
		expect(
			resolveBoostEligibility({ ...eligibleInput, status: "pending_review" })
		).toEqual({ eligible: false, reason: "not_publicly_visible" });
	});

	it("rejects expired exposure but allows null exposureEndsAt", () => {
		expect(
			resolveBoostEligibility({
				...eligibleInput,
				exposureEndsAt: new Date("2026-07-01T00:00:00Z"),
			})
		).toEqual({ eligible: false, reason: "exposure_expired" });
		expect(
			resolveBoostEligibility({ ...eligibleInput, exposureEndsAt: null })
		).toEqual({ eligible: true });
	});

	it("rejects products without boosts and exhausted daily limits", () => {
		expect(
			resolveBoostEligibility({ ...eligibleInput, manualBoostsPerDay: 0 })
		).toEqual({ eligible: false, reason: "product_without_boost" });
		expect(resolveBoostEligibility({ ...eligibleInput, usedToday: 3 })).toEqual(
			{ eligible: false, reason: "daily_limit_reached" }
		);
	});

	it("has a Korean message for every reason", () => {
		for (const message of Object.values(BOOST_INELIGIBLE_MESSAGES)) {
			expect(message.length).toBeGreaterThan(0);
		}
	});
});

// 발동 창은 09:00~21:00 KST(12시간). KST 09:00 = UTC 00:00, KST 21:00 = UTC 12:00.
// 슬롯 = 09:00 + k×(12h÷N). 경계 직전/직후, KST 자정, 0회를 검증한다.
describe("countDueAutoBoostSlots", () => {
	const at = (iso: string) => new Date(iso);

	it("returns 0 for a product without auto boosts regardless of time", () => {
		expect(countDueAutoBoostSlots(0, at("2026-07-16T06:00:00Z"))).toBe(0);
		expect(countDueAutoBoostSlots(-1, at("2026-07-16T06:00:00Z"))).toBe(0);
	});

	it("returns 0 before the 09:00 KST window opens", () => {
		// KST 2026-07-16 08:59 = UTC 2026-07-15 23:59
		expect(countDueAutoBoostSlots(2, at("2026-07-15T23:59:59Z"))).toBe(0);
	});

	it("counts N=1 slot at 09:00 and caps at 1", () => {
		expect(countDueAutoBoostSlots(1, at("2026-07-15T23:59:59Z"))).toBe(0);
		expect(countDueAutoBoostSlots(1, at("2026-07-16T00:00:00Z"))).toBe(1); // 09:00 KST
		expect(countDueAutoBoostSlots(1, at("2026-07-16T11:00:00Z"))).toBe(1); // 20:00 KST
	});

	it("counts N=2 slots at 09:00 and 15:00 with boundary precision", () => {
		expect(countDueAutoBoostSlots(2, at("2026-07-16T00:00:00Z"))).toBe(1); // 09:00
		expect(countDueAutoBoostSlots(2, at("2026-07-16T05:59:59Z"))).toBe(1); // 14:59 직전
		expect(countDueAutoBoostSlots(2, at("2026-07-16T06:00:00Z"))).toBe(2); // 15:00 직후
		expect(countDueAutoBoostSlots(2, at("2026-07-16T11:00:00Z"))).toBe(2); // caps at N
	});

	it("counts N=3 slots at 09:00/13:00/17:00", () => {
		expect(countDueAutoBoostSlots(3, at("2026-07-16T03:59:59Z"))).toBe(1); // 12:59 직전
		expect(countDueAutoBoostSlots(3, at("2026-07-16T04:00:00Z"))).toBe(2); // 13:00 직후
		expect(countDueAutoBoostSlots(3, at("2026-07-16T07:59:59Z"))).toBe(2); // 16:59 직전
		expect(countDueAutoBoostSlots(3, at("2026-07-16T08:00:00Z"))).toBe(3); // 17:00 직후
	});

	it("counts N=4 slots at 09:00/12:00/15:00/18:00", () => {
		expect(countDueAutoBoostSlots(4, at("2026-07-16T02:59:59Z"))).toBe(1); // 11:59 직전
		expect(countDueAutoBoostSlots(4, at("2026-07-16T03:00:00Z"))).toBe(2); // 12:00 직후
		expect(countDueAutoBoostSlots(4, at("2026-07-16T09:00:00Z"))).toBe(4); // 18:00 직후
		expect(countDueAutoBoostSlots(4, at("2026-07-16T11:00:00Z"))).toBe(4); // caps at N
	});

	it("resets at KST midnight (window not yet open)", () => {
		// KST 2026-07-17 00:00 = UTC 2026-07-16 15:00 — 새 하루의 09:00 창은 아직
		expect(countDueAutoBoostSlots(3, at("2026-07-16T15:00:00Z"))).toBe(0);
	});

	// 공고별 오프셋을 반영한 슬롯 계산. offsetMs를 직접 넘겨 해시와 무관하게 경계를 검증한다.
	// N=2, interval=6h, offset=1h → 슬롯 = 10:00·16:00 KST(= UTC 01:00·07:00).
	describe("with per-job offset", () => {
		const OFFSET_1H = HOUR_MS;

		it("returns 0 before the offset first slot (창 시작+offset 이전)", () => {
			// 09:00 KST(창 시작, UTC 00:00) — 아직 offset(10:00) 이전
			expect(
				countDueAutoBoostSlots(2, at("2026-07-16T00:00:00Z"), OFFSET_1H)
			).toBe(0);
			// 09:59:59 KST(UTC 00:59:59) — 첫 슬롯 직전
			expect(
				countDueAutoBoostSlots(2, at("2026-07-16T00:59:59Z"), OFFSET_1H)
			).toBe(0);
		});

		it("counts the first offset slot at 창 시작+offset", () => {
			// 10:00 KST(UTC 01:00) — 첫 슬롯 직후
			expect(
				countDueAutoBoostSlots(2, at("2026-07-16T01:00:00Z"), OFFSET_1H)
			).toBe(1);
		});

		it("counts the second offset slot with boundary precision", () => {
			// 15:59:59 KST(UTC 06:59:59) — 둘째 슬롯(16:00) 직전
			expect(
				countDueAutoBoostSlots(2, at("2026-07-16T06:59:59Z"), OFFSET_1H)
			).toBe(1);
			// 16:00 KST(UTC 07:00) — 둘째 슬롯 직후
			expect(
				countDueAutoBoostSlots(2, at("2026-07-16T07:00:00Z"), OFFSET_1H)
			).toBe(2);
		});

		it("caps catch-up at N regardless of offset", () => {
			// 20:00 KST(UTC 11:00) — 두 슬롯 모두 지남, 상한 N=2
			expect(
				countDueAutoBoostSlots(2, at("2026-07-16T11:00:00Z"), OFFSET_1H)
			).toBe(2);
		});

		it("defaults offsetMs to 0 preserving legacy slot behavior", () => {
			// 기본값 0이면 09:00 + k×interval의 기존 동작과 완전히 동일
			for (const iso of [
				"2026-07-16T00:00:00Z",
				"2026-07-16T05:59:59Z",
				"2026-07-16T06:00:00Z",
				"2026-07-16T11:00:00Z",
			]) {
				expect(countDueAutoBoostSlots(2, at(iso))).toBe(
					countDueAutoBoostSlots(2, at(iso), 0)
				);
			}
		});
	});
});

describe("getAutoBoostSlotOffsetMs", () => {
	const ids = [
		"job_1a2b3c",
		"job_9f8e7d",
		"e2c5f0a1-0000-4000-8000-000000000000",
		"e2c5f0a1-0000-4000-8000-000000000001",
		"short",
		"another-post-id",
	];

	it("returns 0 for products without auto boosts", () => {
		expect(getAutoBoostSlotOffsetMs("job_1a2b3c", 0)).toBe(0);
		expect(getAutoBoostSlotOffsetMs("job_1a2b3c", -1)).toBe(0);
	});

	it("is deterministic — same id and N always yields the same offset", () => {
		for (const id of ids) {
			for (const n of [1, 2, 3, 4]) {
				expect(getAutoBoostSlotOffsetMs(id, n)).toBe(
					getAutoBoostSlotOffsetMs(id, n)
				);
			}
		}
	});

	it("keeps offset within [0, interval) for every N", () => {
		for (const id of ids) {
			for (const n of [1, 2, 3, 4]) {
				const intervalMs = WINDOW_DURATION_MS / n;
				const offset = getAutoBoostSlotOffsetMs(id, n);
				expect(offset).toBeGreaterThanOrEqual(0);
				expect(offset).toBeLessThan(intervalMs);
			}
		}
	});

	it("spreads different ids across the interval (herd 제거)", () => {
		// UUID처럼 인접한 두 id도 서로 다른 오프셋을 내야 특정 분에 몰리지 않는다.
		expect(
			getAutoBoostSlotOffsetMs("e2c5f0a1-0000-4000-8000-000000000000", 2)
		).not.toBe(
			getAutoBoostSlotOffsetMs("e2c5f0a1-0000-4000-8000-000000000001", 2)
		);

		// 다양한 id의 오프셋이 최소 두 종류 이상으로 분산된다(전부 같은 값이 아님).
		const offsets = new Set(ids.map((id) => getAutoBoostSlotOffsetMs(id, 3)));
		expect(offsets.size).toBeGreaterThan(1);
	});

	it("guarantees the last slot stays inside the 09~21 window", () => {
		// 마지막 슬롯 = offset + (N-1)×interval < N×interval = 12h(창 길이)여야 한다.
		for (const id of ids) {
			for (const n of [1, 2, 3, 4]) {
				const intervalMs = WINDOW_DURATION_MS / n;
				const offset = getAutoBoostSlotOffsetMs(id, n);
				const lastSlotMs = offset + (n - 1) * intervalMs;
				expect(lastSlotMs).toBeLessThan(WINDOW_DURATION_MS);
			}
		}
	});
});

import { describe, expect, it } from "vitest";

import {
	BOOST_INELIGIBLE_MESSAGES,
	type BoostPurchaseLike,
	countDueAutoBoostSlots,
	getAutoBoostSlotOffsetMs,
	getKstDayStart,
	isBoostPurchaseActive,
	isManualBoostWithinCooldown,
	manualBoostCooldownRemainingMs,
	pickCountPurchaseToConsume,
	resolveBoostEligibility,
	sumActivePeriodBoostsPerDay,
	sumRemainingBoostCount,
} from "@/services/bambi-job-boost";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_DURATION_MS = 12 * HOUR_MS;

const FUTURE = new Date("2026-08-01T00:00:00Z");
const PAST = new Date("2026-07-01T00:00:00Z");
const NOW = new Date("2026-07-16T05:00:00Z"); // KST 2026-07-16 14:00

const eligibleInput = {
	adProductId: "ad-1",
	countRemaining: 0,
	exposureEndsAt: FUTURE,
	exposureType: "special",
	manualBoostsPerDay: 3,
	now: NOW,
	optionManualPerDay: 0,
	paymentStatus: "paid",
	status: "published",
	usedToday: 0,
};

// BoostPurchaseLike 픽스처 헬퍼 — 기본은 결제 완료 횟수권(잔여 있음)이고 필요한 칸만 덮어쓴다.
const purchase = (over: Partial<BoostPurchaseLike>): BoostPurchaseLike => ({
	boostsPerDay: null,
	createdAt: new Date("2026-07-16T00:00:00Z"),
	expiresAt: null,
	id: "p",
	optionType: "manual_count",
	paymentStatus: "paid",
	remainingCount: 5,
	...over,
});

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
	it("allows a paid published ad job under its daily limit (daily 소비)", () => {
		expect(resolveBoostEligibility(eligibleInput)).toEqual({
			consume: "daily",
			eligible: true,
		});
	});

	it("① 무료 공고(adProductId null)+활성 기간제 → daily", () => {
		// 무료 공고는 상품 없음(manualBoostsPerDay 0)이지만 옵션 기간제 합이 있으면 daily.
		expect(
			resolveBoostEligibility({
				...eligibleInput,
				adProductId: null,
				exposureEndsAt: null,
				exposureType: "free",
				manualBoostsPerDay: 0,
				optionManualPerDay: 2,
			})
		).toEqual({ consume: "daily", eligible: true });
	});

	it("② 무료 공고+옵션 없음 → no_boost_available", () => {
		expect(
			resolveBoostEligibility({
				...eligibleInput,
				adProductId: null,
				countRemaining: 0,
				exposureEndsAt: null,
				exposureType: "free",
				manualBoostsPerDay: 0,
				optionManualPerDay: 0,
			})
		).toEqual({ eligible: false, reason: "no_boost_available" });
	});

	it("③ 번들 3+기간제 2, usedToday 4 → daily", () => {
		expect(
			resolveBoostEligibility({
				...eligibleInput,
				manualBoostsPerDay: 3,
				optionManualPerDay: 2,
				usedToday: 4,
			})
		).toEqual({ consume: "daily", eligible: true });
	});

	it("④ usedToday 5(한도 소진)+잔여 2 → count", () => {
		expect(
			resolveBoostEligibility({
				...eligibleInput,
				countRemaining: 2,
				manualBoostsPerDay: 3,
				optionManualPerDay: 2,
				usedToday: 5,
			})
		).toEqual({ consume: "count", eligible: true });
	});

	it("⑤ usedToday 5+잔여 0 → daily_limit_reached", () => {
		expect(
			resolveBoostEligibility({
				...eligibleInput,
				countRemaining: 0,
				manualBoostsPerDay: 3,
				optionManualPerDay: 2,
				usedToday: 5,
			})
		).toEqual({ eligible: false, reason: "daily_limit_reached" });
	});

	it("rejects unpaid or unpublished jobs", () => {
		expect(
			resolveBoostEligibility({ ...eligibleInput, paymentStatus: "unpaid" })
		).toEqual({ eligible: false, reason: "not_publicly_visible" });
		expect(
			resolveBoostEligibility({ ...eligibleInput, status: "pending_review" })
		).toEqual({ eligible: false, reason: "not_publicly_visible" });
	});

	it("rejects expired exposure only for ad jobs (adProductId null은 통과)", () => {
		expect(
			resolveBoostEligibility({ ...eligibleInput, exposureEndsAt: PAST })
		).toEqual({ eligible: false, reason: "exposure_expired" });
		// 광고 공고의 미래 노출은 통과
		expect(
			resolveBoostEligibility({ ...eligibleInput, exposureEndsAt: null })
		).toEqual({ consume: "daily", eligible: true });
		// 무료 공고(adProductId null)는 과거 exposureEndsAt이라도 만료로 거부하지 않는다.
		expect(
			resolveBoostEligibility({
				...eligibleInput,
				adProductId: null,
				exposureEndsAt: PAST,
			})
		).toEqual({ consume: "daily", eligible: true });
	});

	it("⑥ 배너형+옵션 있어도 banner_product", () => {
		// 배너형은 스냅샷·옵션에 끌올 값이 남아 있어도 배너 전용 사유로 거부한다.
		for (const exposureType of [
			"premium-banner",
			"left-banner",
			"right-banner",
		]) {
			expect(
				resolveBoostEligibility({
					...eligibleInput,
					countRemaining: 3,
					exposureType,
					optionManualPerDay: 5,
				})
			).toEqual({ eligible: false, reason: "banner_product" });
		}
	});

	it("has a Korean message for every reason", () => {
		for (const message of Object.values(BOOST_INELIGIBLE_MESSAGES)) {
			expect(message.length).toBeGreaterThan(0);
		}
	});
});

describe("isBoostPurchaseActive", () => {
	it("⑦ unpaid/만료/잔여0 → false, 정상 → true", () => {
		// 결제 완료 횟수권(잔여>0) → 활성
		expect(isBoostPurchaseActive(purchase({}), NOW)).toBe(true);
		// 미결제 → 비활성
		expect(
			isBoostPurchaseActive(purchase({ paymentStatus: "unpaid" }), NOW)
		).toBe(false);
		// 횟수권 잔여 0 → 비활성
		expect(isBoostPurchaseActive(purchase({ remainingCount: 0 }), NOW)).toBe(
			false
		);
		// 기간제 미래 만료 → 활성
		expect(
			isBoostPurchaseActive(
				purchase({
					boostsPerDay: 2,
					expiresAt: FUTURE,
					optionType: "manual_period",
					remainingCount: null,
				}),
				NOW
			)
		).toBe(true);
		// 기간제 과거 만료 → 비활성
		expect(
			isBoostPurchaseActive(
				purchase({
					boostsPerDay: 2,
					expiresAt: PAST,
					optionType: "manual_period",
					remainingCount: null,
				}),
				NOW
			)
		).toBe(false);
	});
});

describe("sumActivePeriodBoostsPerDay", () => {
	it("⑨ 만료 건 제외·타입 필터로 하루 횟수 합산", () => {
		const purchases = [
			purchase({
				boostsPerDay: 2,
				expiresAt: FUTURE,
				optionType: "manual_period",
				remainingCount: null,
			}),
			purchase({
				boostsPerDay: 1,
				expiresAt: FUTURE,
				optionType: "manual_period",
				remainingCount: null,
			}),
			// 만료 건 — 제외
			purchase({
				boostsPerDay: 5,
				expiresAt: PAST,
				optionType: "manual_period",
				remainingCount: null,
			}),
			// 다른 타입 — 제외
			purchase({
				boostsPerDay: 3,
				expiresAt: FUTURE,
				optionType: "auto_period",
				remainingCount: null,
			}),
		];
		expect(sumActivePeriodBoostsPerDay(purchases, "manual_period", NOW)).toBe(
			3
		);
		expect(sumActivePeriodBoostsPerDay(purchases, "auto_period", NOW)).toBe(3);
	});
});

describe("sumRemainingBoostCount", () => {
	it("활성 횟수권 잔여만 합산(미결제·잔여0 제외)", () => {
		const purchases = [
			purchase({ remainingCount: 2 }),
			purchase({ remainingCount: 3 }),
			purchase({ remainingCount: 0 }),
			purchase({ paymentStatus: "unpaid", remainingCount: 10 }),
		];
		expect(sumRemainingBoostCount(purchases, NOW)).toBe(5);
	});
});

describe("pickCountPurchaseToConsume", () => {
	it("⑧ 오래된 활성 우선, 잔여0 건너뜀", () => {
		const oldestEmpty = purchase({
			createdAt: new Date("2026-07-10T00:00:00Z"),
			id: "old-empty",
			remainingCount: 0,
		});
		const middle = purchase({
			createdAt: new Date("2026-07-12T00:00:00Z"),
			id: "middle",
			remainingCount: 2,
		});
		const newest = purchase({
			createdAt: new Date("2026-07-14T00:00:00Z"),
			id: "newest",
			remainingCount: 5,
		});
		expect(
			pickCountPurchaseToConsume([newest, oldestEmpty, middle], NOW)?.id
		).toBe("middle");
	});

	it("활성 횟수권이 없으면 null", () => {
		expect(
			pickCountPurchaseToConsume([purchase({ remainingCount: 0 })], NOW)
		).toBeNull();
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

describe("isManualBoostWithinCooldown", () => {
	const now = new Date("2026-07-16T05:00:00Z");
	const COOLDOWN = 10; // 분

	it("null(첫 끌어올림)이면 false", () => {
		expect(isManualBoostWithinCooldown(null, now, COOLDOWN)).toBe(false);
	});

	it("방금(간격 미달)이면 true", () => {
		// 5분 전 — 10분 쿨다운 미경과
		const last = new Date(now.getTime() - 5 * 60_000);
		expect(isManualBoostWithinCooldown(last, now, COOLDOWN)).toBe(true);
	});

	it("정확히 경과한 시점은 허용(false)", () => {
		const last = new Date(now.getTime() - COOLDOWN * 60_000);
		expect(isManualBoostWithinCooldown(last, now, COOLDOWN)).toBe(false);
	});

	it("초과 경과면 false", () => {
		const last = new Date(now.getTime() - 15 * 60_000);
		expect(isManualBoostWithinCooldown(last, now, COOLDOWN)).toBe(false);
	});

	it("cooldown 0(미제공)이면 언제든 false", () => {
		const last = new Date(now.getTime() - 1000);
		expect(isManualBoostWithinCooldown(last, now, 0)).toBe(false);
	});
});

describe("manualBoostCooldownRemainingMs", () => {
	const now = new Date("2026-07-16T05:00:00Z");

	it("null이면 0", () => {
		expect(manualBoostCooldownRemainingMs(null, now, 10)).toBe(0);
	});

	it("남은 시간을 ms로 반환한다", () => {
		const last = new Date(now.getTime() - 4 * 60_000); // 4분 전, 10분 쿨다운
		expect(manualBoostCooldownRemainingMs(last, now, 10)).toBe(6 * 60_000);
	});

	it("경과했으면 0으로 클램프", () => {
		const last = new Date(now.getTime() - 20 * 60_000);
		expect(manualBoostCooldownRemainingMs(last, now, 10)).toBe(0);
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

import { describe, expect, it } from "vitest";

import {
	BOOST_INELIGIBLE_MESSAGES,
	getKstDayStart,
	resolveBoostEligibility,
} from "./bambi-job-boost";

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

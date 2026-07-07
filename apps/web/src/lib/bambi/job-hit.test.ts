import { describe, expect, it } from "vitest";
import {
	HIT_RIBBON_CLASS_BY_TONE,
	isJobHit,
	shouldShowHitRibbon,
} from "./job-hit";

const withPerf = (impressions: number, detailViews: number) => ({
	performance: { detailViews, impressions },
});

describe("isJobHit", () => {
	it("hits at the detailViews=100 boundary (condition A)", () => {
		expect(isJobHit(withPerf(0, 100))).toBe(true);
	});

	it("does not hit just below the detailViews boundary", () => {
		expect(isJobHit(withPerf(0, 99))).toBe(false);
	});

	it("hits at impressions=200 with CTR exactly 12% (condition B)", () => {
		expect(isJobHit(withPerf(200, 24))).toBe(true);
	});

	it("does not hit at impressions=200 with 23 detail views (CTR 11.5%)", () => {
		expect(isJobHit(withPerf(200, 23))).toBe(false);
	});

	it("does not hit when CTR is high but impressions < 200", () => {
		// CTR 40%이지만 impressions<200, detailViews<100 → 비-Hit
		expect(isJobHit(withPerf(50, 20))).toBe(false);
	});

	it("returns false when performance is missing", () => {
		expect(isJobHit({})).toBe(false);
	});

	it("treats the detailViews condition independently even when impressions=0", () => {
		expect(isJobHit(withPerf(0, 120))).toBe(true);
	});

	it("does not hit with impressions=0 and low detail views (no divide-by-zero)", () => {
		expect(isJobHit(withPerf(0, 10))).toBe(false);
	});
});

describe("shouldShowHitRibbon", () => {
	it("shows for special/urgent/recommended when the job is a hit", () => {
		expect(shouldShowHitRibbon(withPerf(0, 100), "special")).toBe(true);
		expect(shouldShowHitRibbon(withPerf(0, 100), "urgent")).toBe(true);
		expect(shouldShowHitRibbon(withPerf(200, 24), "recommended")).toBe(true);
	});

	it("never shows for organic even when the job is a hit", () => {
		expect(shouldShowHitRibbon(withPerf(0, 100), "organic")).toBe(false);
	});

	it("does not show when the job is not a hit", () => {
		expect(shouldShowHitRibbon(withPerf(200, 23), "special")).toBe(false);
	});
});

describe("HIT_RIBBON_CLASS_BY_TONE", () => {
	it("maps each tone to its section color family", () => {
		expect(HIT_RIBBON_CLASS_BY_TONE.special).toContain("coral");
		expect(HIT_RIBBON_CLASS_BY_TONE.urgent).toContain("amber");
		expect(HIT_RIBBON_CLASS_BY_TONE.recommended).toContain("sky");
	});
});

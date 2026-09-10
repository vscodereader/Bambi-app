import { describe, expect, it } from "vitest";
import {
	isJobHit,
	shouldShowHitRibbon,
} from "../../src/services/bambi-job-hit";

describe("job hit", () => {
	it("상세 조회 100회 경계에서 HIT다", () => {
		expect(isJobHit({ detailViews: 100, impressions: 0 })).toBe(true);
		expect(isJobHit({ detailViews: 99, impressions: 0 })).toBe(false);
	});
	it("노출 200회와 CTR 12퍼센트 경계를 적용한다", () => {
		expect(isJobHit({ detailViews: 24, impressions: 200 })).toBe(true);
		expect(isJobHit({ detailViews: 23, impressions: 200 })).toBe(false);
	});
	it("유료 목록 섹션에서만 리본을 표시한다", () => {
		const performance = { detailViews: 100, impressions: 100 };
		expect(shouldShowHitRibbon(performance, "special")).toBe(true);
		expect(shouldShowHitRibbon(performance, "organic")).toBe(false);
	});
});

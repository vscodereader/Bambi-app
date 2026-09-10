import { describe, expect, it } from "vitest";
import {
	clampGuideIndex,
	SEEKER_GUIDE_SLIDES,
	signupSuccessRoute,
} from "./onboarding-guide";

describe("seeker onboarding guide", () => {
	it("develop과 같은 다섯 단계를 같은 순서로 둔다", () => {
		expect(SEEKER_GUIDE_SLIDES.map((item) => item.id)).toEqual([
			"seeker-marketplace",
			"seeker-chat",
			"seeker-interview-contact",
			"seeker-review-safety",
			"seeker-point-shop",
		]);
	});
	it("단계 인덱스를 안내 범위 안으로 접는다", () => {
		expect(clampGuideIndex(-1)).toBe(0);
		expect(clampGuideIndex(99)).toBe(4);
	});
	it("구직자 가입만 안내 화면으로 보내고 구인자는 기존 홈을 유지한다", () => {
		expect(signupSuccessRoute("job_seeker")).toBe("/feature-guide");
		expect(signupSuccessRoute("employer")).toBe("/");
	});
});

import { describe, expect, it } from "vitest";

import {
	buildOnboardingReplayPath,
	canReplayAudience,
	isOnboardingPath,
	parseOnboardingReplayRequest,
} from "@/lib/bambi/onboarding-route";

describe("onboarding route", () => {
	it("builds and parses a replay path", () => {
		expect(buildOnboardingReplayPath("common")).toBe(
			"/onboarding?audience=common&source=replay"
		);
		expect(
			parseOnboardingReplayRequest({ audience: "employer", source: "replay" })
		).toEqual({ audience: "employer", source: "replay" });
	});

	it("rejects incomplete and unknown replay parameters", () => {
		expect(parseOnboardingReplayRequest({ audience: "common" })).toBeNull();
		expect(
			parseOnboardingReplayRequest({ audience: "admin", source: "replay" })
		).toBeNull();
		expect(
			parseOnboardingReplayRequest({ audience: ["common"], source: "replay" })
		).toBeNull();
	});

	it("allows common or the current role only", () => {
		expect(canReplayAudience("common", "job_seeker")).toBe(true);
		expect(canReplayAudience("job_seeker", "job_seeker")).toBe(true);
		expect(canReplayAudience("employer", "job_seeker")).toBe(false);
	});

	it("identifies only the onboarding page as the full-screen route", () => {
		expect(isOnboardingPath("/onboarding")).toBe(true);
		expect(isOnboardingPath("/onboarding-extra")).toBe(false);
		expect(isOnboardingPath(null)).toBe(false);
	});
});

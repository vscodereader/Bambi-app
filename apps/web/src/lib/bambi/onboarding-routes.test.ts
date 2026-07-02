import { describe, expect, it } from "vitest";
import { getOnboardingNextRoute } from "./onboarding-routes";

describe("getOnboardingNextRoute", () => {
	it("routes existing admins to the moderator console", () => {
		expect(getOnboardingNextRoute("admin")).toBe("/moderator");
	});

	it("routes existing employers to employer management", () => {
		expect(getOnboardingNextRoute("employer")).toBe("/employer");
	});

	it("routes existing job seekers to seeker marketplace", () => {
		expect(getOnboardingNextRoute("job_seeker")).toBe("/seeker");
	});
});

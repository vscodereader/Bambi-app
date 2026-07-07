import { describe, expect, it } from "vitest";
import { homePathForRole } from "./home-path";

describe("homePathForRole", () => {
	it("sends admin to the moderator area", () => {
		expect(homePathForRole("admin")).toBe("/moderator");
	});
	it("sends employer to the employer area", () => {
		expect(homePathForRole("employer")).toBe("/employer");
	});
	it("sends job seeker to the seeker area", () => {
		expect(homePathForRole("job_seeker")).toBe("/seeker");
	});
});

import { describe, expect, it } from "vitest";
import {
	defaultManualKeyForRole,
	manualKeysForRole,
	manualPath,
} from "./manual";

describe("manualKeysForRole", () => {
	it("gives job seekers only the seeker manual", () => {
		expect(manualKeysForRole("job_seeker")).toEqual(["seeker"]);
	});
	// 법률자문은 구직자 화면을 쓰는 역할이라 열람 범위도 구직자와 같다.
	it("treats legal advisors like job seekers", () => {
		expect(manualKeysForRole("legal_advisor")).toEqual(["seeker"]);
	});
	it("gives employers the seeker and employer manuals", () => {
		expect(manualKeysForRole("employer")).toEqual(["seeker", "employer"]);
	});
	it("gives admins every manual", () => {
		expect(manualKeysForRole("admin")).toEqual([
			"seeker",
			"employer",
			"moderator",
		]);
	});
});

describe("defaultManualKeyForRole", () => {
	it("sends each role to its own manual", () => {
		expect(defaultManualKeyForRole("job_seeker")).toBe("seeker");
		expect(defaultManualKeyForRole("legal_advisor")).toBe("seeker");
		expect(defaultManualKeyForRole("employer")).toBe("employer");
		expect(defaultManualKeyForRole("admin")).toBe("moderator");
	});
});

describe("manualPath", () => {
	it("builds the manual route for a key", () => {
		expect(manualPath("seeker")).toBe("/manual/seeker");
		expect(manualPath("moderator")).toBe("/manual/moderator");
	});
});

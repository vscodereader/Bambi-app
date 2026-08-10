import { describe, expect, it } from "vitest";
import { homePathForRole } from "@/lib/bambi/home-path";

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
	// 법률자문은 구직자 계정에 얹는 역할이라 홈도 /seeker다 — 다른 경로로 보내면
	// enforce*Access가 되돌리는 리다이렉트 루프가 생긴다.
	it("sends legal advisor to the seeker area", () => {
		expect(homePathForRole("legal_advisor")).toBe("/seeker");
	});
});

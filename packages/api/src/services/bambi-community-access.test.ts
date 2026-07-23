import { describe, expect, it } from "vitest";

import {
	type CommunityAccessProfile,
	resolveCommunityAccess,
} from "./bambi-community-access";

const base: CommunityAccessProfile = {
	gender: null,
	isAdvertiser: false,
	role: "job_seeker",
	status: "active",
};

describe("resolveCommunityAccess", () => {
	it("allows female members", () => {
		expect(resolveCommunityAccess({ ...base, gender: "female" })).toEqual({
			canAccess: true,
			notice: null,
		});
	});

	it("allows advertiser employers", () => {
		expect(
			resolveCommunityAccess({
				...base,
				gender: "male",
				isAdvertiser: true,
				role: "employer",
			})
		).toEqual({ canAccess: true, notice: null });
	});

	it("allows admins regardless of gender", () => {
		expect(resolveCommunityAccess({ ...base, role: "admin" })).toEqual({
			canAccess: true,
			notice: null,
		});
	});

	it("blocks non-advertiser employers", () => {
		expect(
			resolveCommunityAccess({ ...base, gender: "male", role: "employer" })
		).toEqual({ canAccess: false, notice: "male_employer" });
	});

	it("blocks male job seekers", () => {
		expect(resolveCommunityAccess({ ...base, gender: "male" })).toEqual({
			canAccess: false,
			notice: "male_seeker",
		});
	});

	it("returns unverified notice when gender is unknown", () => {
		expect(resolveCommunityAccess(base)).toEqual({
			canAccess: false,
			notice: "unverified",
		});
	});

	it("blocks suspended members even when female", () => {
		expect(
			resolveCommunityAccess({
				...base,
				gender: "female",
				status: "suspended",
			}).canAccess
		).toBe(false);
	});
});

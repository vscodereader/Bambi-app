import { describe, expect, it } from "vitest";
import { resolveReviewDrawRewardDecision } from "../../src/services/bambi-review-draw-policy";

const eligibleAt = new Date("2026-08-24T00:00:00.000Z");

describe("resolveReviewDrawRewardDecision", () => {
	it("waits until the exact 72-hour boundary", () => {
		expect(
			resolveReviewDrawRewardDecision({
				accountActive: true,
				eligibleAt,
				now: new Date(eligibleAt.getTime() - 1),
				recipientRole: "employer",
				reviewStatus: "published",
			})
		).toBe("wait");
	});

	it("awards at the boundary when the review and recipient remain eligible", () => {
		expect(
			resolveReviewDrawRewardDecision({
				accountActive: true,
				eligibleAt,
				now: eligibleAt,
				recipientRole: "employer",
				reviewStatus: "published",
			})
		).toBe("award");
	});

	it("disqualifies a hidden review or inactive recipient", () => {
		expect(
			resolveReviewDrawRewardDecision({
				accountActive: true,
				eligibleAt,
				now: eligibleAt,
				recipientRole: "employer",
				reviewStatus: "hidden",
			})
		).toBe("disqualify");
		expect(
			resolveReviewDrawRewardDecision({
				accountActive: false,
				eligibleAt,
				now: eligibleAt,
				recipientRole: "employer",
				reviewStatus: "published",
			})
		).toBe("disqualify");
	});
});

import { describe, expect, it } from "vitest";
import {
	adjustPointJobCooldown,
	isPointJobRewardEligible,
	isPointJobSelectionActive,
	pickPointJobCandidate,
	pointJobRewardNextEligibleAt,
} from "@/services/bambi-point-job-rewards";

describe("point job reward", () => {
	it("resets short cooldowns and subtracts the new hours from longer cooldowns", () => {
		const now = new Date("2026-08-20T00:00:00.000Z");
		expect(
			adjustPointJobCooldown(
				new Date("2026-08-20T18:00:00.000Z"),
				now,
				15
			).toISOString()
		).toBe("2026-08-20T03:00:00.000Z");
		expect(
			adjustPointJobCooldown(
				new Date("2026-08-20T07:00:00.000Z"),
				now,
				15
			).toISOString()
		).toBe(now.toISOString());
		expect(
			adjustPointJobCooldown(
				new Date("2026-08-20T15:00:00.000Z"),
				now,
				15
			).toISOString()
		).toBe(now.toISOString());
	});
	it("starts a precise rolling 24 hour cooldown at reward time", () => {
		const rewardedAt = new Date("2026-08-20T01:00:00.000Z");
		const cooldownUntil = pointJobRewardNextEligibleAt(rewardedAt, 24);
		expect(cooldownUntil?.toISOString()).toBe("2026-08-21T01:00:00.000Z");
		expect(
			isPointJobRewardEligible(
				cooldownUntil,
				new Date("2026-08-21T00:59:59.999Z")
			)
		).toBe(false);
		expect(
			isPointJobRewardEligible(
				cooldownUntil,
				new Date("2026-08-21T01:00:00.000Z")
			)
		).toBe(true);
	});

	it("expires each selection using its configured rotation hours", () => {
		const selectedAt = new Date("2026-08-20T01:00:00.000Z");
		expect(
			isPointJobSelectionActive(
				selectedAt,
				15,
				new Date("2026-08-20T15:59:59.999Z")
			)
		).toBe(true);
		expect(
			isPointJobSelectionActive(
				selectedAt,
				15,
				new Date("2026-08-20T16:00:00.000Z")
			)
		).toBe(false);
	});

	it("does not start a cooldown before the first reward", () => {
		expect(isPointJobRewardEligible(null, new Date())).toBe(true);
	});

	it("picks one stable candidate from the supplied random value", () => {
		const candidates = ["premium-a", "premium-b", "premium-c"];
		expect(pickPointJobCandidate(candidates, 0)).toBe("premium-a");
		expect(pickPointJobCandidate(candidates, 0.5)).toBe("premium-b");
		expect(pickPointJobCandidate(candidates, 0.999)).toBe("premium-c");
		expect(pickPointJobCandidate([], 0.5)).toBeNull();
	});
});

import { describe, expect, it } from "vitest";
import { expiryLabel, remainingDays } from "./exposure";

const DAY_MS = 24 * 60 * 60 * 1000;

const daysFromNow = (days: number): Date =>
	new Date(Date.now() + days * DAY_MS);

describe("remainingDays", () => {
	it("returns null when there is no expiry date", () => {
		expect(remainingDays(null)).toBeNull();
	});

	it("returns a positive count for a future expiry", () => {
		const value = remainingDays(daysFromNow(10));

		expect(value).not.toBeNull();
		expect(value as number).toBeGreaterThan(0);
		expect(value as number).toBeLessThanOrEqual(10);
	});

	it("returns zero or negative for a past expiry", () => {
		const value = remainingDays(daysFromNow(-5));

		expect(value).not.toBeNull();
		expect(value as number).toBeLessThanOrEqual(0);
	});

	it("accepts ISO strings as well as Date objects", () => {
		const iso = daysFromNow(3).toISOString();

		expect(remainingDays(iso)).toBeGreaterThan(0);
	});
});

describe("expiryLabel", () => {
	it("labels a missing expiry as 해당 없음", () => {
		expect(expiryLabel(null)).toBe("해당 없음");
	});

	it("labels a future expiry as 진행중", () => {
		expect(expiryLabel(daysFromNow(7))).toBe("진행중");
	});

	it("labels a past expiry as 만료", () => {
		expect(expiryLabel(daysFromNow(-1))).toBe("만료");
	});
});

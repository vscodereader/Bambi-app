import { describe, expect, it } from "vitest";

import { formatAdDuration, formatAdPrice } from "./ad-catalog";

describe("ad-catalog format helpers", () => {
	it("formats KRW amount with thousands separator and 원", () => {
		expect(formatAdPrice(330_000)).toBe("330,000원");
	});
	it("formats duration days", () => {
		expect(formatAdDuration(30)).toBe("30일");
	});
});

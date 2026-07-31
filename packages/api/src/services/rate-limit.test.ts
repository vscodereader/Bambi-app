import { describe, expect, it } from "vitest";
import { takeRateLimit } from "./rate-limit";

const WINDOW = 60_000;

describe("takeRateLimit", () => {
	it("한도까지 허용하고 초과분은 막는다", () => {
		const base = { key: "ip-a", limit: 3, windowMs: WINDOW };

		expect(takeRateLimit({ ...base, now: 0 })).toBe(true);
		expect(takeRateLimit({ ...base, now: 1 })).toBe(true);
		expect(takeRateLimit({ ...base, now: 2 })).toBe(true);
		expect(takeRateLimit({ ...base, now: 3 })).toBe(false);
	});

	it("윈도가 지나면 다시 허용한다", () => {
		const base = { key: "ip-b", limit: 1, windowMs: WINDOW };

		expect(takeRateLimit({ ...base, now: 0 })).toBe(true);
		expect(takeRateLimit({ ...base, now: 1 })).toBe(false);
		expect(takeRateLimit({ ...base, now: WINDOW + 1 })).toBe(true);
	});

	it("키가 다르면 서로 영향이 없다", () => {
		expect(
			takeRateLimit({ key: "ip-c", limit: 1, now: 0, windowMs: WINDOW })
		).toBe(true);
		expect(
			takeRateLimit({ key: "ip-d", limit: 1, now: 0, windowMs: WINDOW })
		).toBe(true);
	});
});

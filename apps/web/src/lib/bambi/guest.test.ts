import { describe, expect, it } from "vitest";
import { GUEST_COOKIE_NAME, readGuestFromCookieString } from "./guest";

describe("readGuestFromCookieString", () => {
	it("detects guest cookie", () => {
		expect(readGuestFromCookieString(`${GUEST_COOKIE_NAME}=1`)).toBe(true);
	});
	it("returns false when absent", () => {
		expect(readGuestFromCookieString("other=1")).toBe(false);
	});
	it("returns false for empty", () => {
		expect(readGuestFromCookieString("")).toBe(false);
	});
});

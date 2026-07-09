import { describe, expect, it } from "vitest";
import {
	adultSexToGender,
	GUEST_COOKIE_NAME,
	genderToAdultSex,
	readGuestFromCookieString,
} from "./guest";

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

describe("genderToAdultSex", () => {
	it("maps male to adultsex 1", () => {
		expect(genderToAdultSex("male")).toBe("1");
	});
	it("maps female to adultsex 2", () => {
		expect(genderToAdultSex("female")).toBe("2");
	});
});

describe("adultSexToGender", () => {
	it("maps adultsex 1 to male", () => {
		expect(adultSexToGender("1")).toBe("male");
	});
	it("maps adultsex 2 to female", () => {
		expect(adultSexToGender("2")).toBe("female");
	});
	it("returns null for unknown values", () => {
		expect(adultSexToGender("0")).toBeNull();
		expect(adultSexToGender("")).toBeNull();
	});
	it("round-trips gender through adultsex", () => {
		expect(adultSexToGender(genderToAdultSex("male"))).toBe("male");
		expect(adultSexToGender(genderToAdultSex("female"))).toBe("female");
	});
});

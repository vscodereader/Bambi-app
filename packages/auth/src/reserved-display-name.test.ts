import { describe, expect, it } from "vitest";

import {
	findReservedDisplayNameTerm,
	normalizeReservedDisplayName,
} from "./reserved-display-name";

const entries = [
	{ normalizedTerm: "admin", term: "Admin" },
	{ normalizedTerm: "관리자", term: "관리자" },
];

describe("reserved display name", () => {
	it.each([
		["Admin", "admin"],
		["ADMIN", "admin"],
		["myAdmin", "admin"],
		["A d-m_i.n", "admin"],
		["관리자", "관리자"],
		["관 리-자", "관리자"],
	] as const)("%s에서 예약어를 찾는다", (value, expected) => {
		expect(findReservedDisplayNameTerm(value, entries)?.toLowerCase()).toBe(
			expected
		);
	});

	it.each(["ㅇㅇ", "밤비", ""])("%s는 허용한다", (value) => {
		expect(findReservedDisplayNameTerm(value, entries)).toBeNull();
	});

	it("대소문자·공백·구두점·기호를 정규화한다", () => {
		expect(normalizeReservedDisplayName(" A d-m_i.n! ")).toBe("admin");
	});
});

import { describe, expect, it } from "vitest";
import { parseNonNegativeInteger, popupSaveErrorMessage } from "./main-popup";

describe("main popup form helpers", () => {
	it("allows an empty number draft without coercing it to zero", () => {
		expect(parseNonNegativeInteger("")).toBeNull();
		expect(parseNonNegativeInteger("34")).toBe(34);
		expect(parseNonNegativeInteger("-1")).toBeNull();
	});

	it("replaces request-size failures with an actionable image message", () => {
		expect(popupSaveErrorMessage("Failed to fetch")).toContain("이미지 용량");
		expect(popupSaveErrorMessage("413 Request Body Too Large")).toContain(
			"이미지 용량"
		);
		expect(popupSaveErrorMessage("Request body is too large")).toContain(
			"이미지 용량"
		);
		expect(popupSaveErrorMessage("revision conflict")).toBe(
			"revision conflict"
		);
	});
});

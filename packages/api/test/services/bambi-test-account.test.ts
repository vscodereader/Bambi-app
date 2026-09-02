import { describe, expect, it } from "vitest";

import {
	formatTestAccountBirthInput,
	formatTestAccountPhoneInput,
	normalizeTestAccountPhone,
	TEST_ACCOUNT_PHONE_PLACEHOLDER,
} from "../../src/services/bambi-test-account-policy";

describe("bambi test account policy", () => {
	it("keeps direct birth input as eight digits", () => {
		expect(formatTestAccountBirthInput("1995-04-12")).toBe("19950412");
		expect(formatTestAccountBirthInput("1995041234")).toBe("19950412");
	});

	it("formats and normalizes the supported fake phone number", () => {
		expect(TEST_ACCOUNT_PHONE_PLACEHOLDER).toBe("010-0000-0000");
		expect(formatTestAccountPhoneInput("01012345678")).toBe("010-1234-5678");
		expect(normalizeTestAccountPhone("010-1234-5678")).toBe("01012345678");
	});

	it("rejects non-010 and incomplete values", () => {
		expect(normalizeTestAccountPhone("011-1234-5678")).toBeNull();
		expect(normalizeTestAccountPhone("010-123-5678")).toBeNull();
	});
});

import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/bambi-format";

describe("formatPhone", () => {
	it("휴대폰은 11자리 3-4-4, 10자리 3-3-4", () => {
		expect(formatPhone("01012345678")).toBe("010-1234-5678");
		expect(formatPhone("01112345678")).toBe("011-1234-5678");
		expect(formatPhone("0111234567")).toBe("011-123-4567");
	});

	it("서울은 9자리 2-3-4, 10자리 2-4-4", () => {
		expect(formatPhone("021234567")).toBe("02-123-4567");
		expect(formatPhone("0212345678")).toBe("02-1234-5678");
	});

	it("지역·070은 10자리 3-3-4, 11자리 3-4-4", () => {
		expect(formatPhone("0311234567")).toBe("031-123-4567");
		expect(formatPhone("0511234567")).toBe("051-123-4567");
		expect(formatPhone("07012345678")).toBe("070-1234-5678");
	});

	it("050X 안심번호는 12자리 4-4-4", () => {
		expect(formatPhone("050412345678")).toBe("0504-1234-5678");
	});

	it("대표번호는 8자리 4-4", () => {
		expect(formatPhone("15661945")).toBe("1566-1945");
		expect(formatPhone("16881234")).toBe("1688-1234");
		expect(formatPhone("18001234")).toBe("1800-1234");
	});

	it("이미 하이픈이 있으면 같은 결과(멱등)", () => {
		expect(formatPhone("010-1234-5678")).toBe("010-1234-5678");
		expect(formatPhone(formatPhone("0504 1234 5678"))).toBe("0504-1234-5678");
	});

	it("알려진 패턴이 아니면 원문 그대로", () => {
		expect(formatPhone("1566-1945 + 0000")).toBe("1566-1945 + 0000");
		expect(formatPhone("+821012345678")).toBe("+821012345678");
		expect(formatPhone("TODO_PHONE")).toBe("TODO_PHONE");
		expect(formatPhone("")).toBe("");
		// 11자리 050은 0505-123-4567/050-5123-4567 어느 쪽인지 확정되지 않아 손대지 않는다.
		expect(formatPhone("05051234567")).toBe("05051234567");
	});

	it("영문이 섞인 자유 입력(카카오 ID 등)은 손대지 않는다", () => {
		expect(formatPhone("bambi01012345678")).toBe("bambi01012345678");
	});
});

import { describe, expect, it } from "vitest";

import {
	formatPayAmountInput,
	getFirstErrorField,
	shouldWarnOnLeave,
} from "./job-form-ux";

describe("formatPayAmountInput", () => {
	it("천단위로 끊어 보여 준다", () => {
		expect(formatPayAmountInput("1500000")).toBe("1,500,000");
	});

	// 저장값은 순수 숫자다 — 표시 포맷이 state로 새어 들어가면 서버로 콤마가 간다.
	it("숫자가 아닌 문자는 버린다", () => {
		expect(formatPayAmountInput("1,2a3")).toBe("123");
	});

	it("빈 값은 빈 문자열", () => {
		expect(formatPayAmountInput("")).toBe("");
	});
});

describe("getFirstErrorField", () => {
	// 화면에 그려진 순서대로 첫 오류를 고른다 — 객체 키 순서에 기대면 안 된다.
	it("폼 순서상 가장 먼저 나오는 오류를 고른다", () => {
		expect(getFirstErrorField({ payAmount: "필수", title: "필수" })).toBe(
			"title"
		);
	});

	it("오류가 없으면 null", () => {
		expect(getFirstErrorField({})).toBeNull();
	});
});

describe("shouldWarnOnLeave", () => {
	it("작성한 내용이 있으면 경고한다", () => {
		expect(shouldWarnOnLeave({ isDirty: true, isSubmitting: false })).toBe(
			true
		);
	});

	// 빈 폼에서 뒤로가기마다 확인창이 뜨면 방해만 된다.
	it("건드리지 않은 폼은 그냥 나간다", () => {
		expect(shouldWarnOnLeave({ isDirty: false, isSubmitting: false })).toBe(
			false
		);
	});

	// 제출이 성공해 화면을 떠나는 것까지 막으면 안 된다.
	it("제출 중에는 경고하지 않는다", () => {
		expect(shouldWarnOnLeave({ isDirty: true, isSubmitting: true })).toBe(
			false
		);
	});
});

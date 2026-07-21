import { describe, expect, it } from "vitest";
import { emptyJobForm, validateJobForm } from "./bambi-job-form";

const baseForm = {
	...emptyJobForm,
	description: "상세 설명 열 글자 이상.",
	industryCategory: "클럽",
	organizationId: "o1",
	payAmount: "20000",
	payUnit: "시급",
	region: "서울",
	teamId: "",
	title: "공고",
	workSchedule: "협의",
};

const options = { teamScopes: [{ organizationId: "o1", teamId: "" }] };

describe("validateJobForm 세부지역", () => {
	it("세부지역 있는 시/도에서 district 비면 검증 실패", () => {
		const result = validateJobForm({ ...baseForm, district: "" }, options);

		expect(result.ok).toBe(false);
	});

	it("세부지역 없는 시/도는 district 비어도 통과", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "", region: "기타" },
			options
		);

		expect(result.ok).toBe(true);
	});

	it("district를 입력하면 통과하고 input에 실린다", () => {
		const result = validateJobForm({ ...baseForm, district: "강남" }, options);

		expect(result.ok && result.input.district).toBe("강남");
	});
});

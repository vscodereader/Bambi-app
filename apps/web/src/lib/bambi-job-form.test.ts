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

describe("validateJobForm taxonomy 화이트리스트", () => {
	// 구 표기 공고를 수정 폼에서 열면 Select가 빈칸이 되는데, 길이만 검사하면
	// 그대로 재저장돼 지역 필터에 영영 걸리지 않는다.
	it("구 taxonomy 지역 값은 걸러진다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "", region: "서울 강남구" },
			options
		);

		expect(result.ok).toBe(false);
	});

	it("목록에 없는 업종은 걸러진다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "강남", industryCategory: "노래방바" },
			options
		);

		expect(result.ok).toBe(false);
	});

	it("선택한 시/도에 속하지 않는 세부지역은 걸러진다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "해운대", region: "서울" },
			options
		);

		expect(result.ok).toBe(false);
	});
});

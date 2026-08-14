import { describe, expect, it } from "vitest";
import { parseBannedWordsCsv } from "@/lib/bambi/banned-words-csv";

describe("parseBannedWordsCsv", () => {
	it("개행·쉼표를 모두 구분자로 쓴다", () => {
		expect(parseBannedWordsCsv("가,나\n다")).toEqual(["가", "나", "다"]);
	});
	it("공백을 trim하고 빈 항목을 버린다", () => {
		expect(parseBannedWordsCsv(" 가 , ,나\n\n")).toEqual(["가", "나"]);
	});
	it("배치 내 중복을 제거한다", () => {
		expect(parseBannedWordsCsv("가,가,나")).toEqual(["가", "나"]);
	});
});

import { describe, expect, it } from "vitest";
import { parseBannedWordCsv } from "@/src/lib/moderation/banned-word-csv";

describe("parseBannedWordCsv", () => {
	it("개행·쉼표를 나누고 공백·빈값·같은 단어를 제거한다", () => {
		expect(parseBannedWordCsv(" 금칙어,중복\n중복\n\n세 번째 ")).toEqual([
			"금칙어",
			"중복",
			"세 번째",
		]);
	});
});

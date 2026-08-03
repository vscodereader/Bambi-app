import { describe, expect, it } from "vitest";
import { industryOptions } from "./bambi-options";

describe("bambi-options taxonomy", () => {
	it("업종은 확정 9종(기타는 맨 끝)", () => {
		expect([...industryOptions]).toEqual([
			"룸싸롱",
			"텐프로/쩜오",
			"노래주점",
			"단란주점",
			"다방",
			"BAR",
			"마사지",
			"요정",
			"기타",
		]);
	});
});

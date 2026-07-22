import { describe, expect, it } from "vitest";
import {
	districtsForRegion,
	industryOptions,
	regionOptions,
} from "./bambi-options";

describe("bambi-options taxonomy", () => {
	it("시/도 목록은 서울·경기·인천·부산·기타", () => {
		expect([...regionOptions]).toEqual([
			"서울",
			"경기",
			"인천",
			"부산",
			"기타",
		]);
	});
	it("districtsForRegion은 시/도별 세부지역을 반환", () => {
		expect([...districtsForRegion("서울")]).toEqual([
			"강남",
			"서초",
			"송파",
			"마포",
			"용산",
			"강북",
		]);
		expect([...districtsForRegion("부산")]).toEqual(["해운대", "서면", "연제"]);
	});
	it("세부지역 없는 시/도·미정의 값은 빈 배열", () => {
		expect(districtsForRegion("기타")).toHaveLength(0);
		expect(districtsForRegion("없는값")).toHaveLength(0);
	});
	it("업종은 확정 8종", () => {
		expect([...industryOptions]).toEqual([
			"룸싸롱",
			"텐프로/쩜오",
			"노래주점",
			"단란주점",
			"다방",
			"BAR",
			"마사지",
			"요정",
		]);
	});
});

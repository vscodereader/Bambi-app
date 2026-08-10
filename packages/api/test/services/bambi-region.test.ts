import { describe, expect, it } from "vitest";

import { matchRegionCodes, type RegionIndex } from "@/services/bambi-region";

const index: RegionIndex = {
	byLabel: new Map([
		["서울", "1100000000"],
		["부산", "2600000000"],
		["경기", "4100000000"],
	]),
	bySigungu: new Map([
		["서울|강남구", "1168000000"],
		["서울|중구", "1114000000"],
		["부산|중구", "2611000000"],
		["부산|부산진구", "2623000000"],
		["경기|부천시", "4119000000"],
		["경기|가평군", "4182000000"],
	]),
};

describe("matchRegionCodes", () => {
	it("접미사가 붙은 원문을 그대로 맞춘다", () => {
		expect(
			matchRegionCodes(index, { district: "강남구", region: "서울" })
		).toEqual({ districtCode: "1168000000", regionCode: "1100000000" });
	});

	it("접미사가 빠진 구 데이터에 구·시·군을 붙여 맞춘다", () => {
		expect(
			matchRegionCodes(index, { district: "강남", region: "서울" })
		).toEqual({
			districtCode: "1168000000",
			regionCode: "1100000000",
		});
		expect(
			matchRegionCodes(index, { district: "부천", region: "경기" })
		).toEqual({
			districtCode: "4119000000",
			regionCode: "4100000000",
		});
		expect(
			matchRegionCodes(index, { district: "가평", region: "경기" })
		).toEqual({
			districtCode: "4182000000",
			regionCode: "4100000000",
		});
	});

	it("같은 이름의 시군구는 시/도 안에서만 고른다", () => {
		expect(
			matchRegionCodes(index, { district: "중구", region: "부산" })
		).toEqual({
			districtCode: "2611000000",
			regionCode: "2600000000",
		});
	});

	it("상권명 별칭을 행정구역으로 바꿔 맞춘다", () => {
		expect(
			matchRegionCodes(index, { district: "서면", region: "부산" })
		).toEqual({
			districtCode: "2623000000",
			regionCode: "2600000000",
		});
	});

	it("시/도를 못 찾으면 세부지역도 붙이지 않는다", () => {
		expect(
			matchRegionCodes(index, { district: "강남", region: "기타" })
		).toEqual({
			districtCode: null,
			regionCode: null,
		});
	});

	it("세부지역만 못 찾으면 시/도 코드는 살린다", () => {
		expect(
			matchRegionCodes(index, { district: "없는동네", region: "서울" })
		).toEqual({ districtCode: null, regionCode: "1100000000" });
		expect(matchRegionCodes(index, { district: null, region: "서울" })).toEqual(
			{
				districtCode: null,
				regionCode: "1100000000",
			}
		);
	});
});

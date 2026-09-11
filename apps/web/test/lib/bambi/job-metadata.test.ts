import { describe, expect, it } from "vitest";

import { buildJobMetadataItems } from "@/lib/bambi/job-metadata";

describe("공고 메타데이터 뱃지 항목", () => {
	it("지역·세부지역·업종·원문 세부업종을 순서대로 분리한다", () => {
		expect(
			buildJobMetadataItems({
				district: "성남시",
				industryCategory: "룸싸롱",
				industryRaw: "룸싸롱 - 퍼블릭",
				region: "경기",
			})
		).toEqual([
			{ kind: "region", label: "경기" },
			{ kind: "district", label: "성남시" },
			{ kind: "industry", label: "룸싸롱" },
			{ kind: "industry", label: "퍼블릭" },
		]);
	});

	it("빈 값과 정규화 업종 중복을 제거한다", () => {
		expect(
			buildJobMetadataItems({
				district: null,
				industryCategory: "다방",
				industryRaw: " 다방 ",
				region: "서울",
			})
		).toEqual([
			{ kind: "region", label: "서울" },
			{ kind: "industry", label: "다방" },
		]);
	});

	it("가운데점 원문의 세부 조각도 값 하드코딩 없이 보존한다", () => {
		expect(
			buildJobMetadataItems({
				industryCategory: "룸싸롱",
				industryRaw: "룸싸롱 · 퍼블릭 · 주말",
			})
		).toEqual([
			{ kind: "industry", label: "룸싸롱" },
			{ kind: "industry", label: "퍼블릭" },
			{ kind: "industry", label: "주말" },
		]);
	});
});

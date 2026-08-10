import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatMinimumWageLabel } from "@/lib/bambi/minimum-wage";
import { srcPath } from "../../../src-path";

const source = readFileSync(
	srcPath("components/bambi/screens/seeker-job-detail-responsive.tsx"),
	"utf8"
);

const MINIMUM_WAGE_LABEL_PATTERN = /^\d{4}년 최저시급 [\d,]+원$/;

describe("공고 상세 구인자 번호", () => {
	it("근무시간·고용형태 사이에 구인자 인증번호 안내를 렌더한다", () => {
		expect(source).toContain("employerVerifiedPhone");
		expect(source).toContain("밤비알바 보고 연락드렸다고 하시면");
	});
});

describe("급여 옆 최저시급 표기", () => {
	it("운영자 설정값을 천 단위 구분과 함께 표기한다", () => {
		expect(
			formatMinimumWageLabel({
				minimumWageHourly: 10_030,
				minimumWageYear: 2025,
			})
		).toBe("2025년 최저시급 10,030원");
	});

	it("미설정·로딩 중에도 기본값으로 표기가 유지된다", () => {
		const fallback = formatMinimumWageLabel(undefined);
		expect(fallback).toMatch(MINIMUM_WAGE_LABEL_PATTERN);
		expect(
			formatMinimumWageLabel({ minimumWageHourly: null, minimumWageYear: null })
		).toBe(fallback);
	});

	it("모바일 타일과 데스크톱 사이드바 두 곳 모두에 붙인다", () => {
		const occurrences = source.split("{minimumWageLabel}").length - 1;
		expect(occurrences).toBe(2);
		// 좁은 화면에서 급여 금액이 잘리지 않도록 wrap 되는 baseline 정렬을 유지한다.
		expect(source).toContain("flex flex-wrap items-baseline gap-x-2");
	});
});

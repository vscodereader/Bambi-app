import { describe, expect, it } from "vitest";

import {
	contentBoardLabel,
	contentUnavailableLabel,
	formatContentDate,
} from "./me-content";

describe("formatContentDate", () => {
	it("KST 기준 YYYY.MM.DD로 찍는다", () => {
		// UTC 자정 직전이라도 한국은 이미 다음 날 — 웹 목록과 같은 날짜여야 한다.
		expect(formatContentDate(new Date("2026-03-05T15:30:00Z"))).toBe(
			"2026.03.06"
		);
		expect(formatContentDate("2026-11-09T01:00:00Z")).toBe("2026.11.09");
	});
});

describe("contentBoardLabel", () => {
	it("게시판이 지워져 라벨이 null이면 폴백 문구를 쓴다", () => {
		expect(contentBoardLabel(null)).toBe("삭제된 게시판");
	});

	it("라벨이 있으면 그대로 쓴다", () => {
		expect(contentBoardLabel("자유수다")).toBe("자유수다");
	});
});

describe("contentUnavailableLabel", () => {
	it("published는 배지를 달지 않는다", () => {
		expect(contentUnavailableLabel("published")).toBeNull();
	});

	it("hidden·deleted를 구분해 라벨을 준다", () => {
		expect(contentUnavailableLabel("hidden")).toBe("숨김 처리된 글");
		expect(contentUnavailableLabel("deleted")).toBe("삭제된 글");
	});

	it("missing 등 모르는 값은 삭제된 글로 떨어뜨린다", () => {
		expect(contentUnavailableLabel("missing")).toBe("삭제된 글");
		expect(contentUnavailableLabel("archived")).toBe("삭제된 글");
	});
});

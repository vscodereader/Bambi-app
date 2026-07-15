import { describe, expect, it } from "vitest";

import {
	COMMUNITY_BOARDS,
	communityPostPath,
	formatCommunityDate,
	getBoardBySlug,
	getCommunityPageItems,
	getCommunityTotalPages,
} from "./community";

const DATE_FORMAT_RE = /^\d{4}\.\d{2}\.\d{2}$/;

describe("community boards meta", () => {
	it("slug로 게시판을 찾고 잘못된 slug는 undefined", () => {
		expect(getBoardBySlug("work-talk")?.key).toBe("work_talk");
		expect(getBoardBySlug("best")?.writable).toBe(false);
		expect(getBoardBySlug("nope")).toBeUndefined();
	});

	it("게시판은 베스트·자유·일·중고 4개다", () => {
		expect(COMMUNITY_BOARDS.map((board) => board.key)).toEqual([
			"best",
			"free",
			"work_talk",
			"market",
		]);
	});

	it("상세 경로를 만든다", () => {
		expect(communityPostPath("free", "abc")).toBe("/seeker/community/free/abc");
	});
});

describe("community list helpers", () => {
	it("날짜를 YYYY.MM.DD로 포맷한다", () => {
		expect(formatCommunityDate("2026-07-15T09:30:00.000Z")).toMatch(
			DATE_FORMAT_RE
		);
		expect(formatCommunityDate(new Date(2026, 0, 5))).toBe("2026.01.05");
	});

	it("전체 페이지 수는 최소 1", () => {
		expect(getCommunityTotalPages(0, 20)).toBe(1);
		expect(getCommunityTotalPages(20, 20)).toBe(1);
		expect(getCommunityTotalPages(21, 20)).toBe(2);
	});

	it("페이지 아이템은 현재 주변 + 양 끝 + 말줄임으로 구성된다", () => {
		expect(getCommunityPageItems(1, 1)).toEqual([1]);
		expect(getCommunityPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(getCommunityPageItems(5, 9)).toEqual([
			1,
			"ellipsis-start",
			4,
			5,
			6,
			"ellipsis-end",
			9,
		]);
		expect(getCommunityPageItems(9, 9)).toEqual([1, "ellipsis-start", 7, 8, 9]);
	});
});

import { describe, expect, it } from "vitest";

import {
	COMMUNITY_AUTHOR_FALLBACK,
	COMMUNITY_BOARDS,
	communityAuthorName,
	communityPostPath,
	formatCommunityDate,
	getBoardBySlug,
	getCommunityPageItems,
	getCommunityTotalPages,
	isGuestWritableBoardKey,
	isNewCommunityPost,
} from "./community";

describe("community boards meta", () => {
	it("slug로 게시판을 찾고 잘못된 slug는 undefined", () => {
		expect(getBoardBySlug("work-talk")?.key).toBe("work_talk");
		expect(getBoardBySlug("best")?.writable).toBe(false);
		expect(getBoardBySlug("nope")).toBeUndefined();
	});

	it("게시판은 공지·베스트·자유·일·중고 5개이고 공지가 맨 앞이다", () => {
		expect(COMMUNITY_BOARDS.map((board) => board.key)).toEqual([
			"notice",
			"best",
			"free",
			"work_talk",
			"market",
		]);
	});

	it("비회원 글쓰기는 자유수다·밤문화 이야기만 열린다", () => {
		expect(isGuestWritableBoardKey("free")).toBe(true);
		expect(isGuestWritableBoardKey("work_talk")).toBe(true);
		expect(isGuestWritableBoardKey("notice")).toBe(false);
		expect(isGuestWritableBoardKey("market")).toBe(false);
		expect(isGuestWritableBoardKey("best")).toBe(false);
	});

	it("일 이야기 게시판은 표시명만 밤문화 이야기로 바뀐다", () => {
		const board = COMMUNITY_BOARDS.find((item) => item.key === "work_talk");

		expect(board).toMatchObject({
			key: "work_talk",
			label: "밤문화 이야기",
			slug: "work-talk",
		});
	});

	it("공지사항만 운영자 전용(adminOnly) 게시판이다", () => {
		expect(getBoardBySlug("notice")?.adminOnly).toBe(true);
		expect(getBoardBySlug("free")?.adminOnly).toBeUndefined();
	});

	it("상세 경로를 만든다", () => {
		expect(communityPostPath("free", "abc")).toBe("/seeker/community/free/abc");
	});

	it("작성인 표시명은 null·공백일 때 기본값으로 폴백한다", () => {
		expect(communityAuthorName("밤비")).toBe("밤비");
		expect(communityAuthorName("  밤비  ")).toBe("밤비");
		expect(communityAuthorName(null)).toBe(COMMUNITY_AUTHOR_FALLBACK);
		expect(communityAuthorName(undefined)).toBe(COMMUNITY_AUTHOR_FALLBACK);
		expect(communityAuthorName("")).toBe(COMMUNITY_AUTHOR_FALLBACK);
		expect(communityAuthorName("   ")).toBe(COMMUNITY_AUTHOR_FALLBACK);
	});
});

describe("community list helpers", () => {
	it("로컬 타임존 기준으로 YYYY.MM.DD를 만든다(월·일 0 패딩)", () => {
		// 로컬 구성요소로 만든 Date는 러너 타임존과 무관하게 같은 결과를 낸다.
		expect(formatCommunityDate(new Date(2026, 0, 5))).toBe("2026.01.05");
		expect(formatCommunityDate(new Date(2026, 11, 31))).toBe("2026.12.31");
		// 자정 근처 시각이어도 로컬 날짜 구성요소만 쓰므로 하루가 밀리지 않는다.
		expect(formatCommunityDate(new Date(2026, 8, 9, 0, 5))).toBe("2026.09.09");
		expect(formatCommunityDate(new Date(2026, 8, 9, 23, 59))).toBe(
			"2026.09.09"
		);
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

describe("isNewCommunityPost", () => {
	const now = new Date(2026, 6, 28, 12, 0).getTime();
	const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000);

	it("이틀이 지나지 않은 글에 N을 단다", () => {
		expect(isNewCommunityPost(hoursAgo(0), now)).toBe(true);
		expect(isNewCommunityPost(hoursAgo(47), now)).toBe(true);
	});

	it("이틀이 지난 글에는 N을 달지 않는다", () => {
		// 정확히 48시간이 되는 순간부터 배지가 사라진다.
		expect(isNewCommunityPost(hoursAgo(48), now)).toBe(false);
		expect(isNewCommunityPost(hoursAgo(72), now)).toBe(false);
	});

	it("문자열 날짜도 받고, 파싱 실패는 N 없음으로 둔다", () => {
		expect(isNewCommunityPost(hoursAgo(1).toISOString(), now)).toBe(true);
		expect(isNewCommunityPost("not-a-date", now)).toBe(false);
	});
});

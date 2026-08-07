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
	isBuiltinBoardKey,
	isGuestWritableBoardKey,
	isLegalAdvisorAllowedPath,
	isLegalBoardKey,
	isNewCommunityPost,
	toBoardMetas,
} from "./community";

describe("community boards meta", () => {
	it("slug로 게시판을 찾고 잘못된 slug는 undefined", () => {
		expect(getBoardBySlug("work-talk")?.key).toBe("work_talk");
		expect(getBoardBySlug("best")?.writable).toBe(false);
		expect(getBoardBySlug("nope")).toBeUndefined();
	});

	it("빌트인 목록은 공지·베스트·자유·일·중고·법률 6개이고 공지가 맨 앞이다", () => {
		expect(COMMUNITY_BOARDS.map((board) => board.key)).toEqual([
			"notice",
			"best",
			"free",
			"work_talk",
			"market",
			"legal",
		]);
	});

	it("비회원 글쓰기는 자유수다·밤문화 이야기·무료 법률 자문만 열린다", () => {
		expect(isGuestWritableBoardKey("free")).toBe(true);
		expect(isGuestWritableBoardKey("work_talk")).toBe(true);
		expect(isGuestWritableBoardKey("legal")).toBe(true);
		expect(isGuestWritableBoardKey("notice")).toBe(false);
		expect(isGuestWritableBoardKey("market")).toBe(false);
		expect(isGuestWritableBoardKey("best")).toBe(false);
	});

	it("무료 법률 자문 게시판만 잠금·연락처 규칙을 탄다", () => {
		expect(getBoardBySlug("legal")).toMatchObject({
			key: "legal",
			label: "무료 법률 자문",
			writable: true,
		});
		expect(isLegalBoardKey("legal")).toBe(true);
		expect(isLegalBoardKey("free")).toBe(false);
	});

	it("법률자문은 수다방 홈·legal 경로만 통과하고 다른 게시판 링크는 막힌다", () => {
		expect(isLegalAdvisorAllowedPath("/seeker/community")).toBe(true);
		expect(isLegalAdvisorAllowedPath("/seeker/community/legal")).toBe(true);
		expect(isLegalAdvisorAllowedPath("/seeker/community/legal/abc")).toBe(true);
		expect(isLegalAdvisorAllowedPath("/seeker/community/free")).toBe(false);
		expect(isLegalAdvisorAllowedPath("/seeker/community/notice/abc")).toBe(
			false
		);
		expect(isLegalAdvisorAllowedPath("/seeker/community/crawled/abc")).toBe(
			false
		);
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

	it("DB 게시판 행을 화면 메타로 옮기고 베스트를 선두에 얹는다", () => {
		const boards = toBoardMetas([
			{
				description: "밤비알바 수다방 공지",
				icon: null,
				isWritable: true,
				key: "notice",
				label: "공지사항",
				slug: "notice",
			},
			{
				description: "새 게시판",
				icon: "Sparkles",
				isWritable: false,
				key: "beauty-talk",
				label: "뷰티 수다",
				slug: "beauty-talk",
			},
		]);

		expect(boards.map((board) => board.key)).toEqual([
			"best",
			"notice",
			"beauty-talk",
		]);
		// 운영자 전용은 DB에 없는 빌트인 규칙이라 key로 얹힌다 — 새 게시판은 표준 동작이다.
		expect(boards[1]?.adminOnly).toBe(true);
		expect(boards[2]?.adminOnly).toBeUndefined();
		// 글쓰기 허용(is_writable)은 DB 값을 그대로 따른다.
		expect(boards[2]?.writable).toBe(false);
		expect(boards[2]?.label).toBe("뷰티 수다");
		// 아이콘도 DB 값 그대로 통과한다(미지정은 null → 화면은 기존 모양).
		expect(boards[1]?.icon).toBeNull();
		expect(boards[2]?.icon).toBe("Sparkles");
	});

	it("빌트인 게시판만 삭제 금지로 판정한다(가상 best 제외)", () => {
		expect(isBuiltinBoardKey("notice")).toBe(true);
		expect(isBuiltinBoardKey("work_talk")).toBe(true);
		expect(isBuiltinBoardKey("legal")).toBe(true);
		expect(isBuiltinBoardKey("best")).toBe(false);
		expect(isBuiltinBoardKey("beauty-talk")).toBe(false);
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

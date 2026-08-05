import { describe, expect, it } from "vitest";
import {
	communityBodyText,
	getPublicBoardBySlug,
	isGuestWritableBoard,
	PUBLIC_BOARDS,
	parsePageParam,
	publicBoardPath,
	publicEditPath,
	publicPostPath,
	publicWritePath,
} from "./public-community";

describe("public community boards", () => {
	it("exposes only notice/free/work_talk", () => {
		expect(PUBLIC_BOARDS.map((board) => board.key)).toEqual([
			"notice",
			"free",
			"work_talk",
		]);
	});
	it("hides market and the best curation", () => {
		expect(getPublicBoardBySlug("market")).toBeUndefined();
		expect(getPublicBoardBySlug("best")).toBeUndefined();
		expect(getPublicBoardBySlug("work-talk")?.key).toBe("work_talk");
	});
});

describe("public community paths", () => {
	it("omits ?page for the first page", () => {
		expect(publicBoardPath("free")).toBe("/board/free");
		expect(publicBoardPath("free", 1)).toBe("/board/free");
		expect(publicBoardPath("free", 3)).toBe("/board/free?page=3");
		expect(publicPostPath("free", "abc")).toBe("/board/free/abc");
	});
	it("builds the guest write/edit paths under the same board", () => {
		expect(publicWritePath("free")).toBe("/board/free/write");
		expect(publicEditPath("work-talk", "abc")).toBe(
			"/board/work-talk/abc/edit"
		);
	});
	it("opens participation on free/work_talk but not notice", () => {
		expect(isGuestWritableBoard("free")).toBe(true);
		expect(isGuestWritableBoard("work_talk")).toBe(true);
		expect(isGuestWritableBoard("notice")).toBe(false);
	});
	it("folds bad ?page values into page 1", () => {
		expect(parsePageParam("2")).toBe(2);
		expect(parsePageParam(["2", "5"])).toBe(2);
		expect(parsePageParam("0")).toBe(1);
		expect(parsePageParam("1.5")).toBe(1);
		expect(parsePageParam("abc")).toBe(1);
		expect(parsePageParam(undefined)).toBe(1);
	});
});

describe("communityBodyText", () => {
	it("flattens a tiptap doc into one line", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "첫 줄" }] },
				{ type: "paragraph", content: [{ type: "text", text: "둘째 줄" }] },
			],
		});
		expect(communityBodyText(body)).toBe("첫 줄 둘째 줄");
	});
	it("falls back to plain text and truncates", () => {
		expect(communityBodyText("그냥  평문\n입니다")).toBe("그냥 평문 입니다");
		expect(communityBodyText("가나다라마", 3)).toBe("가나…");
	});
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = fs.readFileSync(
	path.join(srcPath("app"), "board", "[boardSlug]", "page.tsx"),
	"utf8"
);

describe("public board list gate", () => {
	it("shows the shared popular five first and excludes them from pagination", () => {
		expect(source).toContain("PUBLIC_BOARD_POPULAR_POST_LIMIT");
		expect(source).toContain("popular: true");
		expect(source).toContain("excludeIds: popularPosts.map");
		expect(source).toContain("const visiblePopularPosts = popularPosts");
		expect(source).not.toContain("parsePageParam");
		expect(source).toContain("getPublicBoardByKey(post.board)?.slug");
	});

	it("blurs all remaining rows and sends them to the shared login path", () => {
		expect(source).toContain('blurred && "blur-sm"');
		expect(source).toContain("? SEEKER_LOGIN_PATH");
		expect(source).toContain("renderPostRow(post, true)");
		expect(source).not.toContain(">인기 글<");
		expect(source).not.toContain(">전체 글<");
		expect(source).toContain("flex flex-col divide-y divide-border");
	});

	it("caps the combined list at ten and replaces pagination with a login CTA", () => {
		expect(source).toContain("PUBLIC_BOARD_VISIBLE_POST_LIMIT");
		expect(source).toContain("visibleBlurredPosts");
		expect(source).not.toContain("function BoardPagination");
		expect(source).toContain("내용을 더 확인하고 싶으신가요?");
		expect(source).toContain("로그인하고 더 보기");
		expect(source).toContain("bg-primary/10 text-foreground");
		expect(source).toContain("MoveRightIcon");
		expect(source).toContain("hidden size-4 shrink-0 text-primary sm:block");
		expect(source).toContain("mt-4 flex flex-wrap items-center justify-center");
	});
});

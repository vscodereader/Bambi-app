import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = fs.readFileSync(
	path.join(srcPath("app"), "board", "page.tsx"),
	"utf8"
);
const iconSource = fs.readFileSync(
	path.join(srcPath("lib"), "bambi", "community-board-icons.ts"),
	"utf8"
);
const layoutSource = fs.readFileSync(
	path.join(srcPath("app"), "board", "layout.tsx"),
	"utf8"
);

describe("public board index design", () => {
	it("uses the public jobs coral introduction style", () => {
		expect(source).toContain("border-primary/20 bg-primary/5");
		expect(source).toContain("md:p-8");
	});

	it("keeps every board and guide destination accessible", () => {
		expect(source).toContain("PUBLIC_BOARDS.map");
		expect(source).toContain("{board.label} 전체 보기");
		expect(source).toContain('href={"/jobs/guide" as Route}');
		expect(source).toContain(
			'render={<Link href={"/jobs/guide" as Route}>알바 가이드 보기</Link>}'
		);
	});

	it("requests exactly the board popularity ordering before taking five posts", () => {
		expect(source).toContain("popular: true");
		expect(source).toContain(".slice(0, PUBLIC_BOARD_POPULAR_POST_LIMIT)");
		expect(source).toContain("PUBLIC_BOARD_POPULAR_POST_LIMIT");
	});

	it("gives cards distinct headers, post rows, and footers", () => {
		expect(source).toContain("<CardFooter");
		expect(source).toContain("gap-0 overflow-hidden py-0");
		expect(source).toContain(
			"flex items-center gap-0 border-border border-b bg-primary/5 py-4"
		);
		expect(source).toContain('className="flex-1 py-4"');
		expect(source).toContain("divide-y divide-border");
		expect(source).toContain("hover:bg-muted");
	});

	it("shows existing board icons and soft-primary footer actions", () => {
		expect(source).toContain("builtinCommunityBoardIcon(board.key)");
		expect(source).toContain("size-8 shrink-0 text-primary");
		expect(source).toContain(
			"bg-primary/10 text-foreground hover:bg-primary/20"
		);
	});

	it("uses the moon icon for the work-talk board", () => {
		expect(iconSource).toContain('Moon: { icon: MoonIcon, label: "달" }');
		expect(iconSource).toContain('work_talk: "Moon"');
	});

	it("reuses the public side ad rails without a center banner", () => {
		expect(layoutSource).toContain("<PublicSideAdRailLayout");
		expect(layoutSource).toContain("PUBLIC_AD_RAIL_SURFACE.board");
		expect(layoutSource).not.toContain("PremiumAdBannerSection");
	});
});

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = fs.readFileSync(
	srcPath("components/bambi/screens/my-content-screen.tsx"),
	"utf8"
);

describe("내 글 관리 목록", () => {
	it("좋아요·작성 글을 각각 기본 닫힌 아코디언으로 표시한다", () => {
		expect(source).toContain('<ContentList kind="liked" />');
		expect(source).toContain('<ContentList kind="authored" />');
		expect(source).toContain("useState<string[]>([])");
		expect(source).toContain("enabled: open");
	});

	it("포인트 내역과 같은 반응형 3열 표와 10건 페이지네이션을 쓴다", () => {
		expect(source.indexOf("게시판</th>")).toBeLessThan(
			source.indexOf("제목</th>")
		);
		expect(source.indexOf("제목</th>")).toBeLessThan(
			source.indexOf("날짜</th>")
		);
		expect(source).toContain("text-[11px] sm:text-xs md:text-sm");
		expect(source).toContain("border-b text-center text-muted-foreground");
		expect(source).toContain("const PAGE_SIZE = 10");
		expect(source).toContain("PageControls");
		expect(source).not.toContain("bg-primary/5");
	});
});

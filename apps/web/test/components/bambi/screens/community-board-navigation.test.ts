import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../../src-path";

const source = readFileSync(
	srcPath("components/bambi/screens/community-board.tsx"),
	"utf8"
);

describe("community board navigation", () => {
	it("페이지 이동은 PageControls의 replace로, 필터·클램프도 replace로 처리한다", () => {
		// 페이지 이동은 <Link> push가 아니라 PageControls onPageChange에서 replace한다.
		expect(source).toContain("router.replace(pageHref(nextPage))");
		expect(source).not.toContain("router.push(pageHref(nextPage))");
		// 필터·검색·범위 초과 클램프는 replace(검색 유지를 위해 query 인자가 붙는다).
		expect(source).toContain("router.replace(buildHref(next, 1, query))");
		expect(source).toContain(
			"buildHref({ mine, showEmployer, showPromotion }, totalPages, query)"
		);
	});
});

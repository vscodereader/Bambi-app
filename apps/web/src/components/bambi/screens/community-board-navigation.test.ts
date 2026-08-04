import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./community-board.tsx", import.meta.url),
	"utf8"
);

describe("community board navigation", () => {
	it("페이지 링크는 기본 push 이동을 사용하고 필터·클램프만 replace한다", () => {
		expect(source).not.toContain("router.replace(pageHref(nextPage))");
		expect(source).not.toContain("router.push(pageHref(nextPage))");
		expect(source.match(/render=\{<Link href=\{pageHref\(/g)).toHaveLength(3);
		// 필터·검색·범위 초과 클램프는 replace(검색 유지를 위해 query 인자가 붙는다).
		expect(source).toContain("router.replace(buildHref(next, 1, query))");
		expect(source).toContain(
			"buildHref({ mine, showEmployer, showPromotion }, totalPages, query)"
		);
	});
});

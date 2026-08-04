import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./community-board.tsx", import.meta.url),
	"utf8"
);

describe("community board navigation", () => {
	it("페이지 링크는 기본 push 이동을 사용하고 필터·클램프만 replace한다", () => {
		expect(source).not.toContain("router.replace(pageHref(nextPage))");
		expect(source.match(/render=\{<Link href=\{pageHref\(/g)).toHaveLength(3);
		expect(source).toContain("router.replace(buildHref(next, 1))");
		expect(source).toContain(
			"router.replace(buildHref({ showEmployer, showPromotion }, totalPages))"
		);
	});
});

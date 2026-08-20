import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = fs.readFileSync(
	srcPath("components/bambi/site-footer.tsx"),
	"utf8"
);

describe("사이트 푸터 설정 렌더", () => {
	it("마운트 전에는 DB 사업자 설정을 렌더하지 않는다", () => {
		expect(source).toContain("const settings = mounted ? data : undefined");
		expect(source).toContain("settings?.ceo?.trim() || null");
		expect(source).toContain("settings?.bizRegNo?.trim() || null");
		expect(source).toContain("settings?.address?.trim() || null");
	});

	it("고객센터 전화가 없으면 TEL 조각을 숨긴다", () => {
		expect(source).toContain("settings?.tel?.trim() || null");
		expect(source).toContain("{tel ? (");
		expect(source).not.toContain("BAMBI_COMPANY.tel;");
	});
});

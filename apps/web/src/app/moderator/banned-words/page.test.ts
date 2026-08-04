import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("금칙어 관리 페이지", () => {
	it("DataTable로 정렬 가능한 목록을 렌더한다", () => {
		expect(source).toContain("DataTable");
		expect(source).toContain("sortValue");
	});
	it("검색 입력을 제공한다", () => {
		expect(source).toContain("useMemo");
	});
	it("CSV 파일 업로드로 일괄 추가한다", () => {
		expect(source).toContain("parseBannedWordsCsv");
		expect(source).toContain("createMany");
		expect(source).toContain('accept=".csv');
	});
	it("기존 UI를 본문·닉네임 범위에 각각 재사용한다", () => {
		expect(source).toContain('title="금칙어 관리"');
		expect(source).toContain('scope="content"');
		expect(source).toContain('title="닉네임 금칙어"');
		expect(source).toContain('scope="display_name"');
	});
});

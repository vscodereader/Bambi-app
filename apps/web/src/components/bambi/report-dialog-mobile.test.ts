import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialogSource = readFileSync(
	new URL("./report-dialog.tsx", import.meta.url),
	"utf8"
);
const safetyKitSource = readFileSync(
	new URL("./safety-kit.tsx", import.meta.url),
	"utf8"
);

describe("모바일 신고 입력창", () => {
	it("키보드가 열린 동적 뷰포트 안에서 신고창을 스크롤할 수 있다", () => {
		expect(dialogSource).toContain("max-h-[calc(100dvh-2rem)]");
	});

	it("상세 입력란에 포커스하면 가려지지 않는 위치로 이동한다", () => {
		expect(safetyKitSource).toContain("scroll-mb-24");
		expect(safetyKitSource).toContain("scrollIntoView");
	});
});

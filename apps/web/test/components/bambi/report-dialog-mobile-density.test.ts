import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const dialogSource = readFileSync(
	srcPath("components/bambi/report-dialog.tsx"),
	"utf8"
);
const formSource = readFileSync(
	srcPath("components/bambi/safety-kit.tsx"),
	"utf8"
);

describe("모바일 신고창 밀도", () => {
	it("모바일 폭과 여백을 줄이고 데스크톱 기본 Dialog를 유지한다", () => {
		expect(dialogSource).toContain(
			'className="max-md:w-80 max-md:gap-3 max-md:p-4"'
		);
	});

	it("사유 터치 높이를 유지하면서 간격·입력창·액션 높이를 줄인다", () => {
		expect(formSource).toContain("flex min-h-11 cursor-pointer");
		expect(formSource).toContain('"min-h-16 md:min-h-20"');
		expect(formSource).toContain('className="grid grid-cols-2 gap-2.5"');
	});
});

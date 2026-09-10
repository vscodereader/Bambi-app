import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./main-popup-layer.tsx", import.meta.url),
	"utf8"
);

describe("PC 다중 팝업 배치", () => {
	it("너비 초과 팝업을 다음 flex 행으로 내리지 않는다", () => {
		expect(source).not.toContain("flex-wrap content-start");
		expect(source).toContain("DesktopPopupStack");
	});

	it("팝업 개수와 무관하게 같은 계단 간격을 재귀적으로 누적한다", () => {
		expect(source).toContain("items.slice(1)");
		expect(source).toContain("pt-8 pl-8");
	});
});

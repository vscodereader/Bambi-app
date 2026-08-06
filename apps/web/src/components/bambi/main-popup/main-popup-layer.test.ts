import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./main-popup-layer.tsx", import.meta.url),
	"utf8"
);
const managementSource = readFileSync(
	new URL("./popup-management.tsx", import.meta.url),
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

describe("팝업 운영자 라벨", () => {
	it("중복 단계 번호 없이 필드 이름만 표시한다", () => {
		expect(managementSource).toContain("게시 구분");
		expect(managementSource).toContain("링크 삽입 (밤비 내부 주소)");
		expect(managementSource).toContain("시작 일시 (KST)");
		expect(managementSource).not.toContain("5. 게시 구분");
		expect(managementSource).not.toContain("5. 링크 삽입");
		expect(managementSource).not.toContain("4. 시작 일시");
	});
});

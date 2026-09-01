import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	fileURLToPath(new URL("./page.tsx", import.meta.url)),
	"utf8"
);

describe("moderator attendance grade anchor", () => {
	it("adds grade change to the row menu and submits without point adjustment", () => {
		expect(source).toContain(">등급 변경</DropdownMenuItem>");
		expect(source).toContain("adminSetGradeAnchor");
		expect(source).toContain("포인트 잔액은 유지하고 등급 계산 출발점만 변경");
	});
});

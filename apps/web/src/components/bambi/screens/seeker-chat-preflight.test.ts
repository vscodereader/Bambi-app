import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
	path.join(import.meta.dirname, "seeker-chat-preflight.tsx"),
	"utf8"
);

describe("seeker chat preflight screen", () => {
	it("aligns the body container to the shared seeker fixed width", () => {
		// 본문 폭은 헤더(SeekerAppShell → SEEKER_CONTENT_MAX_W)와 동일한 고정폭 상수를
		// 공유해야 데스크톱에서 헤더와 넓이·여백이 맞는다.
		expect(source).toContain("SEEKER_CONTENT_WIDTH");
		// 기존 단독 80% 폭은 헤더(min(92%,1120px))와 어긋나 제거됐다.
		expect(source).not.toContain("max-w-[80%]");
	});
});

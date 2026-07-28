import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
	path.join(import.meta.dirname, "page.tsx"),
	"utf8"
);

describe("seeker job detail page", () => {
	it("starts the page at the top when the viewed job changes", () => {
		// App Router의 스크롤 초기화는 세그먼트 첫 커밋 시점의 DOM 노드 하나에만 걸려
		// 있어 조기 이탈하면 직전 목록의 스크롤 오프셋이 그대로 남고, 하드 로드에서는
		// 아예 동작하지 않는다. 상세는 어느 경로로 들어오든 맨 위에서 시작해야 한다.
		expect(source).toContain("window.scrollTo(0, 0);");
		// 재실행 키는 공고 id다 — 사이드 광고 배너로 상세→상세 이동이 가능하다.
		expect(source).toContain("}, [id]);");
	});
});

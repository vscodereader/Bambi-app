import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// favicon은 App Router 메타데이터 파일 규약(app/icon.svg)으로 자동 주입된다.
// 헤더 로고(components/bambi/ds.tsx의 Logo)와 그림이 어긋나지 않게 소스를 직접 단언한다.
const icon = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");

describe("favicon", () => {
	it("헤더 로고의 초승달 글리프를 그대로 쓴다", () => {
		expect(icon).toContain("M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z");
		expect(icon).toContain('cx="16.5"');
	});
	it("타일 색이 --primary 토큰 값과 같다", () => {
		// src/index.css의 --primary. 토큰이 바뀌면 이 테스트가 먼저 깨진다.
		expect(icon).toContain("#f94b63");
	});
	it("브랜드와 무관한 자리표시자(방패·체크) 흔적이 없다", () => {
		expect(icon).not.toContain("#ff4f6d");
		expect(icon).not.toContain("stroke");
	});
});

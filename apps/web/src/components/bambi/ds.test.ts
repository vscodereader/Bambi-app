import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
	path.join(import.meta.dirname, "ds.tsx"),
	"utf8"
);

describe("Logo", () => {
	it("keeps the wordmark on one line beside the icon", () => {
		// "밤비알바"는 CJK라 기본 line-break가 글자 사이를 끊을 수 있다. 폭이 모자라면
		// 워드마크가 세로로 쌓여 로고가 깨지므로 nowrap이 필요하다 —
		// 구인자·운영자 헤더에서 실제로 세로로 쌓였던 원인이다.
		expect(source).toContain("inline-flex items-center whitespace-nowrap");
	});
});

describe("InfoTile", () => {
	it("keeps the value on one line without overflowing narrow grid tracks", () => {
		// value는 truncate로 한 줄 유지한다(공용 컴팩트 타일 관례).
		expect(source).toContain("truncate font-bold text-base text-foreground");
		// 안쪽 텍스트 래퍼는 min-w-0으로 줄어들 수 있어야 truncate가 동작한다.
		expect(source).toContain("flex min-w-0 flex-col gap-0.5");
		// 루트(그리드/플렉스 아이템)도 min-w-0이어야 모바일 단일 열(auto 트랙)에서
		// 값이 UI 밖으로 넘치지 않는다 — 이 min-w-0 누락이 근무시간 오버플로의 원인이었다.
		expect(source).toContain(
			'cn("flex min-w-0 items-center gap-3", className)'
		);
	});
});

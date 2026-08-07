import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 운영자 본문 폭은 ModeratorShell이 단독으로 담당한다(APP_CONTENT_WIDTH = 헤더와 동일한 고정폭).
// 페이지가 자체 max-width를 얹으면 헤더보다 좁아져 어긋나므로, 페이지는 헤더와 맞춘
// 좌우 여백(px-5 md:px-6)만 쓴다 — payments.test의 폭 단언과 같은 규칙이다.
const readPageSource = (relativePath: string) =>
	fs.readFileSync(path.join(import.meta.dirname, relativePath), "utf8");

const PAGES = [
	{ name: "게시물 조치", source: readPageSource("content/page.tsx") },
	{ name: "고객센터 관리", source: readPageSource("support/page.tsx") },
	// 후기 관리는 이 규약이 생기기 전에 만들어져 max-w-3xl(768px)을 스스로 얹고 있었다.
	// 헤더는 1120px이라 눈에 띄게 좁았고 여백도 px-6 단독이라 모바일에서 형제들과 달랐다.
	{ name: "후기 관리", source: readPageSource("reviews/page.tsx") },
	{ name: "면접 일정", source: readPageSource("interviews/page.tsx") },
	{ name: "게시판 관리", source: readPageSource("community-boards/page.tsx") },
];

describe("moderator page content width", () => {
	for (const page of PAGES) {
		it(`aligns ${page.name} to the shell width with header-matched padding`, () => {
			expect(page.source).toContain(
				'className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6"'
			);
		});

		it(`does not narrow ${page.name} with its own max-width`, () => {
			// 루트 컨테이너 한정 검사가 아니라 파일 전체 부재 단언 — 되살아나면 바로 잡힌다.
			expect(page.source).not.toContain("max-w-3xl");
			expect(page.source).not.toContain("max-w-5xl");
		});
	}
});

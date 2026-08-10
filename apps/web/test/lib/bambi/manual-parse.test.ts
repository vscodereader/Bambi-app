import { describe, expect, it } from "vitest";
import { githubSlug, parseManual } from "@/lib/bambi/manual-parse";

// 매뉴얼 본문에 이미 적혀 있는 GitHub식 앵커와 반드시 일치해야 한다.
// (docs/manual/*.md의 수기 목차 링크가 실제 사례다)
describe("githubSlug", () => {
	it("lowercases and hyphenates ascii", () => {
		expect(githubSlug("FAQ")).toBe("faq");
	});
	it("matches the seeker manual's own anchor style", () => {
		// seeker-manual.md 목차: #3-1-공고-탐색-채용정보
		expect(githubSlug("3-1. 공고 탐색 (채용정보)")).toBe(
			"3-1-공고-탐색-채용정보"
		);
	});
	it("matches em-dash and middle-dot anchors", () => {
		// employer-manual.md 목차: #2-시작하기--가입로그인사업자-인증
		// — 는 제거되고 양옆 공백 2칸이 하이픈 2개가 된다. ·는 공백 없이 제거된다.
		expect(githubSlug("2. 시작하기 — 가입·로그인·사업자 인증")).toBe(
			"2-시작하기--가입로그인사업자-인증"
		);
	});
});

const SAMPLE = [
	"# 샘플 매뉴얼",
	"",
	"> 최종 갱신: 2026-08-06",
	"",
	"소개 문단입니다.",
	"",
	"## 목차",
	"",
	"1. [첫 장](#1-첫-장)",
	"",
	"---",
	"",
	"## 1. 첫 장",
	"",
	"본문.",
	"",
	"### 1-1. 절 (예시)",
	"",
	"```",
	"## 코드 안 헤딩",
	"```",
].join("\n");

describe("parseManual", () => {
	it("extracts the h1 title and drops it from the body", () => {
		const parsed = parseManual(SAMPLE);
		expect(parsed.title).toBe("샘플 매뉴얼");
		expect(parsed.markdown).not.toContain("# 샘플 매뉴얼");
	});
	it("drops the handwritten 목차 section", () => {
		const parsed = parseManual(SAMPLE);
		expect(parsed.markdown).not.toContain("## 목차");
		expect(parsed.markdown).not.toContain("[첫 장]");
		// 다음 섹션부터는 남는다
		expect(parsed.markdown).toContain("## 1. 첫 장");
	});
	it("collects h2/h3 headings with slugs, ignoring code fences", () => {
		const parsed = parseManual(SAMPLE);
		expect(parsed.headings).toEqual([
			{ depth: 2, slug: "1-첫-장", text: "1. 첫 장" },
			{ depth: 3, slug: "1-1-절-예시", text: "1-1. 절 (예시)" },
		]);
		// 코드펜스 안 헤딩은 목차에 안 잡히지만 본문에는 남는다
		expect(parsed.markdown).toContain("## 코드 안 헤딩");
	});
	it("keeps intro paragraphs before the first section", () => {
		const parsed = parseManual(SAMPLE);
		expect(parsed.markdown).toContain("소개 문단입니다.");
	});
});

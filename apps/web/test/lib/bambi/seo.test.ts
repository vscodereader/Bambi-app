import { describe, expect, it } from "vitest";
import {
	bambiSiteJsonLd,
	breadcrumbJsonLd,
	mergeSeoKeywords,
	SITE_KEYWORDS,
	SITE_TITLE,
	siteOpenGraph,
	toJsonLdScriptContent,
} from "@/lib/bambi/seo";

const ABSOLUTE_HTTPS = /^https:\/\//;
const nodes = bambiSiteJsonLd["@graph"];
const nodeOf = (type: string) => nodes.find((node) => node["@type"] === type);

describe("SITE_KEYWORDS", () => {
	it("keeps the researched keyword inventory unique and complete", () => {
		expect(SITE_KEYWORDS).toHaveLength(99);
		expect(new Set(SITE_KEYWORDS).size).toBe(SITE_KEYWORDS.length);
		expect(SITE_KEYWORDS).toEqual(
			expect.arrayContaining([
				"유흥알바",
				"밤비알바",
				"밤알바",
				"여우알바",
				"퀸알바",
				"레이디알바",
				"구인구직 사이트",
				"알바 채용 정보",
			])
		);
	});

	// 경쟁 서비스명 노출 순서는 퀸알바 → 여우알바 → 밤알바(사용자 확정 정책, 2026-08-20).
	it("leads title and keywords with 퀸알바·여우알바·밤알바 in that order", () => {
		expect(SITE_TITLE).toBe(
			"밤비알바 - 퀸알바·여우알바·밤알바 | 유흥알바 구인구직"
		);
		expect(SITE_KEYWORDS.slice(0, 3)).toEqual(["퀸알바", "여우알바", "밤알바"]);
	});

	it("keeps 구인구직 사이트 as one phrase", () => {
		expect(
			SITE_KEYWORDS.filter((keyword) => keyword === "구인구직 사이트")
		).toHaveLength(1);
		expect(SITE_KEYWORDS).not.toContain("구인구직");
		expect(SITE_KEYWORDS).not.toContain("사이트");
	});

	it("merges inherited and page keywords without blanks or duplicates", () => {
		expect(
			mergeSeoKeywords(["밤알바", "  "], ["밤알바", "서울 밤알바"])
		).toEqual(["밤알바", "서울 밤알바"]);
	});
});

describe("siteOpenGraph", () => {
	it("페이지 값은 덮고 기본 필드는 보존한다", () => {
		const og = siteOpenGraph({
			title: "서울 밤알바",
			description: "서울 지역 공개 공고",
			url: "/jobs/seoul",
		});
		expect(og.title).toBe("서울 밤알바");
		expect(og.description).toBe("서울 지역 공개 공고");
		expect(og.url).toBe("/jobs/seoul");
		expect(og.type).toBe("website");
		expect(og.locale).toBe("ko_KR");
		expect(og.siteName).toBeTruthy();
		expect(og.images).toHaveLength(1);
	});
});

describe("bambiSiteJsonLd", () => {
	it("Organization·WebSite 두 노드를 schema.org 컨텍스트로 낸다", () => {
		expect(bambiSiteJsonLd["@context"]).toBe("https://schema.org");
		expect(nodes.map((node) => node["@type"]).sort()).toEqual([
			"Organization",
			"WebSite",
		]);
	});

	it("WebSite.publisher가 Organization의 @id를 가리킨다", () => {
		const organization = nodeOf("Organization");
		const website = nodeOf("WebSite");
		expect(organization?.["@id"]).toBeTruthy();
		expect(
			website && "publisher" in website ? website.publisher : null
		).toEqual({
			"@id": organization?.["@id"],
		});
	});

	it("절대 URL만 싣는다", () => {
		const organization = nodeOf("Organization");
		const logo =
			organization && "logo" in organization ? organization.logo : null;
		expect(logo).toMatch(ABSOLUTE_HTTPS);
	});

	it("TODO_ 자리표시자를 포함하지 않는다", () => {
		expect(JSON.stringify(bambiSiteJsonLd)).not.toContain("TODO_");
	});
});

describe("breadcrumbJsonLd", () => {
	it("1부터 시작하는 position과 절대 URL을 낸다", () => {
		const data = breadcrumbJsonLd([
			{ name: "채용 정보", path: "/jobs" },
			{ name: "서울", path: "/jobs/seoul" },
		]);
		expect(data["@type"]).toBe("BreadcrumbList");
		expect(data.itemListElement.map((item) => item.position)).toEqual([1, 2]);
		for (const item of data.itemListElement) {
			expect(item.item).toMatch(ABSOLUTE_HTTPS);
		}
	});
});

describe("toJsonLdScriptContent", () => {
	it("`<`를 이스케이프해 script 태그 조기 종료를 막는다", () => {
		const content = toJsonLdScriptContent({ name: "</script><img>" });
		expect(content).not.toContain("</script>");
		expect(content).toContain("\\u003c/script");
	});

	it("이스케이프 후에도 원래 JSON으로 되돌아온다", () => {
		const data = { name: "a<b" };
		expect(JSON.parse(toJsonLdScriptContent(data))).toEqual(data);
	});
});

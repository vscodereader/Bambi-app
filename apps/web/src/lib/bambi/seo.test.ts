import { describe, expect, it } from "vitest";
import {
	bambiSiteJsonLd,
	breadcrumbJsonLd,
	SITE_KEYWORDS,
	toJsonLdScriptContent,
} from "./seo";

const ABSOLUTE_HTTPS = /^https:\/\//;

const nodes = bambiSiteJsonLd["@graph"];
const nodeOf = (type: string) => nodes.find((node) => node["@type"] === type);

const ORIGINAL_KEYWORDS = [
	"유흥알바",
	"밤비알바",
	"밤알바",
	"룸알바",
	"노래주점알바",
	"룸싸롱알바",
	"유흥구인구직",
	"고소득알바",
	"여성알바",
	"접객알바",
] as const;

const REQUESTED_KEYWORDS = [
	"여성알바",
	"퀸알바",
	"밤알바",
	"룸알바",
	"밤일알바",
	"여우알바",
	"악녀알바",
	"노래방도우미",
	"보도알바",
	"유흥알바",
	"텐프로",
	"안마",
	"마사지",
	"주점",
	"유흥업소알바",
	"아가씨알바",
	"구인구직 사이트",
	"이브알바",
	"고소득알바",
] as const;

describe("SITE_KEYWORDS", () => {
	it("기존 목록과 요청 목록의 합집합을 중복 없이 유지한다", () => {
		const expectedKeywords = [
			...new Set([...ORIGINAL_KEYWORDS, ...REQUESTED_KEYWORDS]),
		];

		expect(new Set(SITE_KEYWORDS).size).toBe(SITE_KEYWORDS.length);
		expect(SITE_KEYWORDS).toEqual(expectedKeywords);
	});

	it("구인구직 사이트를 분리하지 않은 하나의 키워드로 유지한다", () => {
		expect(
			SITE_KEYWORDS.filter((keyword) => keyword === "구인구직 사이트")
		).toHaveLength(1);
		expect(SITE_KEYWORDS).not.toContain("구인구직");
		expect(SITE_KEYWORDS).not.toContain("사이트");
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
		).toEqual({ "@id": organization?.["@id"] });
	});

	it("절대 URL만 싣는다(크롤러는 상대 경로를 해석하지 못한다)", () => {
		const organization = nodeOf("Organization");
		const logo =
			organization && "logo" in organization ? organization.logo : null;
		expect(logo).toMatch(ABSOLUTE_HTTPS);
	});

	// company.ts의 대표자·사업자번호·주소·전화는 아직 `TODO_` 자리표시자다.
	// 구조화 데이터로 색인되면 되돌리기 어려우니 유출을 막는다.
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
		expect(data.itemListElement.at(-1)?.item).toContain("/jobs/seoul");
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

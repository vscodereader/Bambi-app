// 사이트 공통 SEO 문구와 구조화 데이터(JSON-LD). 루트 레이아웃의 metadata와
// <script type="application/ld+json">이 같은 원본을 공유해 문구가 어긋나지 않게 한다.

import { BAMBI_COMPANY } from "./company";

export const SITE_TITLE = "밤비알바 - 밤알바·유흥알바·룸알바 | 여성 구인구직";

export const SITE_DESCRIPTION =
	"밤비알바는 밤알바·유흥알바·룸알바 등 지역·업종별 여성 구인구직 정보를 제공하고 구직자와 구인자를 1:1 채팅으로 연결하는 플랫폼입니다.";

export const SITE_KEYWORDS = [
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
	"퀸알바",
	"밤일알바",
	"여우알바",
	"악녀알바",
	"노래방도우미",
	"보도알바",
	"텐프로",
	"안마",
	"마사지",
	"주점",
	"유흥업소알바",
	"아가씨알바",
	"구인구직 사이트",
	"이브알바",
	"레이디알바",
	"하루이야기",
	"하루이야기 알바",
	"전국밤알바",
	"나나알바",
	"피에스타",
	"피에스타 알바",
	"미소알바",
	"오빠야알바",
	"버블알바",
	"소라알바",
	"꿀알바",
	"캣알바",
	"채리알바",
	"러브알바",
	"미수다알바",
	"이지알바",
	"구미호알바",
	"알바걸스",
	"호박알바",
	"루비알바",
	"초이스알바",
	"여우알바 사이트",
	"퀸알바 사이트",
	"유흥알바 사이트",
	"밤알바 사이트",
	"룸알바 사이트",
	"여성알바 사이트",
	"고소득알바 사이트",
	"유흥구인",
	"유흥구직",
	"유흥알바 구인구직",
	"밤알바 구인구직",
	"룸알바 구인구직",
	"여성알바 구인구직",
	"여성구인구직",
	"여성구인",
	"여자알바",
	"여자밤알바",
	"여성밤알바",
	"여성유흥알바",
	"고수입알바",
	"고페이알바",
	"업소알바",
	"업소 구인구직",
	"당일알바",
	"단기알바",
	"초보알바",
	"주말알바",
	"알바 채용 정보",
	"노래방알바",
	"노래방도우미알바",
	"노래방도우미 구인",
	"룸살롱알바",
	"단란주점알바",
	"다방알바",
	"요정알바",
	"텐프로알바",
	"쩜오알바",
	"텐프로 쩜오 알바",
	"텐카페알바",
	"가라오케알바",
	"퍼블릭알바",
	"하이퍼블릭알바",
	"셔츠룸알바",
	"바알바",
	"BAR알바",
	"마사지알바",
	"안마알바",
	"주점알바",
	"고소득 여성알바",
	"유흥업소 구인",
	"유흥업소 구직",
	"밤알바 후기",
	"유흥알바 후기",
];

export const mergeSeoKeywords = (
	...groups: readonly (readonly string[])[]
): string[] => [
	...new Set(
		groups
			.flat()
			.map((keyword) => keyword.trim())
			.filter(Boolean)
	),
];

// OG 배너를 로고로 겸용한다. schema.org logo는 래스터(PNG/JPG)만 인정돼
// app/icon.svg는 쓸 수 없다. 정사각 브랜드 로고가 생기면 이 경로만 교체한다
// (OG 이미지와 용도가 달라 레이아웃의 openGraph.images와는 일부러 묶지 않는다).
const SITE_LOGO_PATH = "/og-image.png";

// @id는 노드 간 참조용 URI다. WebSite.publisher가 Organization을 값 복제 대신
// 이 id로 가리켜, 크롤러가 두 노드를 같은 주체로 병합한다.
const ORGANIZATION_ID = `${BAMBI_COMPANY.url}/#organization`;
const WEBSITE_ID = `${BAMBI_COMPANY.url}/#website`;

// 회사 정보 중 `TODO_` 자리표시자(대표자·사업자번호·주소·전화)는 구조화 데이터에
// 절대 싣지 않는다. 검색엔진에 가짜 값이 색인되면 되돌리기 어렵다.
// 실제 값으로 교체되면 Organization에 address·telephone을 추가한다.
export const bambiSiteJsonLd = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Organization",
			"@id": ORGANIZATION_ID,
			name: BAMBI_COMPANY.serviceName,
			url: BAMBI_COMPANY.url,
			logo: `${BAMBI_COMPANY.url}${SITE_LOGO_PATH}`,
			description: SITE_DESCRIPTION,
			email: BAMBI_COMPANY.email,
			contactPoint: {
				"@type": "ContactPoint",
				contactType: "customer support",
				email: BAMBI_COMPANY.email,
				areaServed: "KR",
				availableLanguage: ["ko"],
			},
		},
		// potentialAction(SearchAction)은 넣지 않는다. 공고 검색은 로그인 게이트
		// 뒤라(resolve-gate) 크롤러가 따라갈 수 없는 URL을 광고하는 꼴이 된다.
		{
			"@type": "WebSite",
			"@id": WEBSITE_ID,
			name: BAMBI_COMPANY.serviceName,
			alternateName: SITE_TITLE,
			url: BAMBI_COMPANY.url,
			description: SITE_DESCRIPTION,
			inLanguage: "ko-KR",
			publisher: { "@id": ORGANIZATION_ID },
		},
	],
};

export interface BreadcrumbItem {
	name: string;
	// 사이트 루트 기준 경로("/board/notice") — 절대 URL은 여기서 붙인다.
	path: string;
}

// 공개 계층(공고 랜딩·게시판)의 BreadcrumbList. 화면에 그린 브레드크럼과 같은 순서를
// 넘겨야 한다 — 구조화 데이터가 화면에 없는 경로를 주장하면 리치 결과에서 빠진다.
export const breadcrumbJsonLd = (items: readonly BreadcrumbItem[]) => ({
	"@context": "https://schema.org",
	"@type": "BreadcrumbList",
	itemListElement: items.map((item, index) => ({
		"@type": "ListItem",
		position: index + 1,
		name: item.name,
		item: `${BAMBI_COMPANY.url}${item.path}`,
	})),
});

// script 본문에 "</script>"가 섞이면 태그가 조기에 닫혀 뒤 내용이 마크업으로 실행된다.
// `<`를 유니코드 이스케이프하면 JSON 의미는 그대로 두고 파서 탈출만 막는다.
export const toJsonLdScriptContent = (data: object): string =>
	JSON.stringify(data).replaceAll("<", "\\u003c");

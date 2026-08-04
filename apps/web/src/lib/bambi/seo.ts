// 사이트 공통 SEO 문구와 구조화 데이터(JSON-LD). 루트 레이아웃의 metadata와
// <script type="application/ld+json">이 같은 원본을 공유해 문구가 어긋나지 않게 한다.

import { BAMBI_COMPANY } from "./company";

export const SITE_TITLE = "밤비알바 - 유흥·접객 | 룸알바·구인구직 사이트";

export const SITE_DESCRIPTION =
	"밤비알바는 유흥·접객 구인구직 플랫폼입니다. 룸알바, 밤알바, 노래주점, 룸싸롱 등 고소득 채용 정보를 1:1 채팅으로 빠르고 안전하게 연결합니다.";

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

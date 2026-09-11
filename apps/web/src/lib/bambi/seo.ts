// 사이트 공통 SEO 문구와 구조화 데이터(JSON-LD). 루트 레이아웃의 metadata와
// <script type="application/ld+json">이 같은 원본을 공유해 문구가 어긋나지 않게 한다.

import { BAMBI_COMPANY } from "@bambi-app/api/services/bambi-company";

// 경쟁 서비스명 노출 순서는 퀸알바 → 여우알바 → 밤알바로 고정한다(사용자 확정 정책,
// 2026-08-20). title·description·keywords 선두가 모두 이 순서를 따른다.
export const SITE_TITLE =
	"밤비알바 - 퀸알바·여우알바·밤알바 | 유흥알바 구인구직";

export const SITE_DESCRIPTION =
	"밤비알바는 퀸알바·여우알바·밤알바 관련 유흥알바·룸알바를 비롯해 룸싸롱·노래방도우미·텐프로·쩜오 등 지역·업종별 여성 구인구직 정보를 제공하고 구직자와 구인자를 1:1 채팅으로 연결하는 플랫폼입니다.";

export const SITE_KEYWORDS = [
	"퀸알바",
	"여우알바",
	"밤알바",
	"밤비알바",
	"유흥알바",
	"룸알바",
	"노래주점알바",
	"룸싸롱알바",
	"유흥구인구직",
	"고소득알바",
	"여성알바",
	"접객알바",
	"밤일알바",
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

// Next metadata의 openGraph는 최상위 키 단위 shallow-merge라, 페이지가 openGraph를
// 부분 정의하면 루트의 images·siteName·locale·type이 통째로 사라진다. 이 헬퍼로
// 기본 필드를 항상 실어 보존하고, 페이지 값(title·description·url)만 덮는다.
//
// type은 base에 넣지 않는다 — article 등 다른 type과 publishedTime 같은 헬퍼 시그니처
// 밖 필드를 쓰는 페이지(게시글 상세)는 이 base를 직접 스프레드하고 자기 필드를 얹는다.
// 헬퍼에 type 유니온을 받으면 Metadata의 판별 유니온과 어긋나 리터럴 타입이 깨진다.
export const SITE_OPEN_GRAPH_BASE = {
	locale: "ko_KR",
	siteName: BAMBI_COMPANY.serviceName,
	images: [{ url: "/og-image.png", width: 1200, height: 630, alt: SITE_TITLE }],
};

export const siteOpenGraph = (page: {
	title: string;
	description: string;
	url: string;
}) => ({
	type: "website" as const,
	...SITE_OPEN_GRAPH_BASE,
	...page,
});

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
			// 회사소개 페이지 — 이 조직을 주 대상으로 서술하는 페이지라 mainEntityOfPage로 잇는다.
			mainEntityOfPage: `${BAMBI_COMPANY.url}/about`,
			logo: `${BAMBI_COMPANY.url}${SITE_LOGO_PATH}`,
			description: SITE_DESCRIPTION,
			// 직업정보제공사업 신고번호. 사업 신고 단위로 발급된 실측값이라 구조화 데이터에
			// 싣는다(TODO_ 자리표시자인 사업자등록번호 등과 달리 안전).
			identifier: {
				"@type": "PropertyValue",
				name: "직업정보제공사업 신고번호",
				value: BAMBI_COMPANY.jobInfoProviderNo,
			},
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

// 공개 랜딩의 CollectionPage + 내부 ItemList. 화면에 보이는 공고 카드와 같은 상세 경로를
// itemListElement로 실어(화면에 없는 URL을 구조화 데이터가 주장하면 리치 결과에서 빠진다),
// numberOfItems는 실제 배열 길이로 낸다(하드코딩 금지). isPartOf로 WebSite 노드에 잇는다.
export const collectionPageJsonLd = ({
	description,
	items,
	name,
	path,
}: {
	description: string;
	// 사이트 루트 기준 상세 경로 목록 — 절대 URL은 여기서 붙인다.
	items: readonly string[];
	name: string;
	path: string;
}) => {
	const url = `${BAMBI_COMPANY.url}${path}`;

	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		"@id": `${url}#collection`,
		url,
		name,
		description,
		inLanguage: "ko-KR",
		isPartOf: { "@id": WEBSITE_ID },
		mainEntity: {
			"@type": "ItemList",
			numberOfItems: items.length,
			itemListElement: items.map((itemPath, index) => ({
				"@type": "ListItem",
				position: index + 1,
				url: `${BAMBI_COMPANY.url}${itemPath}`,
			})),
		},
	};
};

// 가이드 콘텐츠(/jobs/guide/*)의 Article. 화면 본문(h1 + 섹션)과 같은 headline·description을
// 실어 크롤러가 문서를 기사 단위로 인식하게 한다. isPartOf/publisher로 WebSite·Organization
// 노드에 잇는다. FAQPage/HowTo JSON-LD는 정책상 넣지 않는다(화면 h2/h3 + p 구조만으로 읽힌다).
export const articleJsonLd = ({
	description,
	headline,
	path,
}: {
	description: string;
	headline: string;
	// 사이트 루트 기준 경로("/jobs/guide/ten-pro-alba") — 절대 URL은 여기서 붙인다.
	path: string;
}) => {
	const url = `${BAMBI_COMPANY.url}${path}`;

	return {
		"@context": "https://schema.org",
		"@type": "Article",
		headline,
		description,
		inLanguage: "ko-KR",
		mainEntityOfPage: { "@type": "WebPage", "@id": url },
		isPartOf: { "@id": WEBSITE_ID },
		publisher: { "@id": ORGANIZATION_ID },
	};
};

// script 본문에 "</script>"가 섞이면 태그가 조기에 닫혀 뒤 내용이 마크업으로 실행된다.
// `<`를 유니코드 이스케이프하면 JSON 의미는 그대로 두고 파서 탈출만 막는다.
export const toJsonLdScriptContent = (data: object): string =>
	JSON.stringify(data).replaceAll("<", "\\u003c");

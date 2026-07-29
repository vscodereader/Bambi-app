import { load } from "cheerio";

import { maskContacts, normalizeText } from "./bambi-crawl-normalize";
import {
	isQueenalbaGateStub,
	QUEENALBA_DETAIL_LINK_SELECTOR,
	QUEENALBA_ORIGIN,
	queenalbaDetailUrl,
	readQueenalbaDetailNum,
	toQueenalbaAbsoluteUrl,
} from "./bambi-crawl-queenalba";

// 퀸알바 메인페이지의 유료 노출 자리(광고 배너·우대채용·스페셜채용) 파서.
//
// 왜 따로 긁나: 같은 공고여도 일반 목록에 있는 것과 돈을 내고 메인 상단에 걸린 것은 값어치가
// 다르다. "그 사이트가 지금 무엇을 밀고 있는가"가 곧 시장 신호라서, 어느 자리에서 왔는지를
// listingType으로 남긴다(crawled_job_post.listing_type).
//
// 다른 퀸알바 파서와 같은 규약이다 — HTML 문자열만 받는 순수 함수, 네트워크·DB 없음.
// 결과가 0건이어도 예외를 던지지 않는다: 상위 수집기의 수율 판정이 예외를 "셀렉터 파손"으로
// 읽고 회차를 통째로 중단시키기 때문이다.

// 메인페이지 주소. 게이트가 /adult_index.php로 보낸다는 것만 확인했고, 인증 후 실제 메인이
// index.php인지 루트인지는 확인하지 못했다 — 루트는 어느 쪽이든 유효하다.
export const queenalbaMainUrl = (): string => `${QUEENALBA_ORIGIN}/`;

export const QUEENALBA_LISTING_TYPES = [
	"ad_banner",
	"premium",
	"special",
] as const;

// 유료 노출 자리. ad_banner=광고 배너, premium=우대채용, special=스페셜채용.
// 이 문자열이 crawled_job_post.listing_type에 그대로 들어간다.
export type QueenalbaListingType = (typeof QUEENALBA_LISTING_TYPES)[number];

// ---------------------------------------------------------------------------
// ⚠ 미검증 가정 블록 — 여기부터 아래 상수 두 개만 실물과 다를 수 있다
//
// 퀸알바는 전 페이지가 KCB 성인인증 게이트 뒤에 있어, 인증 쿠키 없이는 메인페이지 대신
// adult_index.php로 보내는 116바이트 스텁만 돌아온다. 그래서 메인페이지의 실제 마크업
// (섹션 id·class, 배너 이미지 경로)을 한 번도 보지 못했고, 아래 값은 전부 추측이다.
//
// 쿠키가 생기면: 인증된 브라우저로 메인페이지를 저장 → 세 섹션의 컨테이너 id/class와 배너
// 이미지 src를 확인 → 이 블록의 값만 고치고 __fixtures__/crawl-html.ts의 queenalbaMainHtml을
// 실물 모양으로 바꾼다. 파싱 로직 자체는 손댈 필요가 없도록 여기에 격리해 두었다.
// 확인이 끝나면 이 ⚠ 경고 주석을 지워라.
// ---------------------------------------------------------------------------

const MAIN_SECTION_SELECTORS: Readonly<Record<QueenalbaListingType, string>> = {
	ad_banner: "#main_banner, .main_banner, .banner_zone",
	premium: "#main_udae, .udae_list, .premium_list",
	special: "#main_special, .special_list, .sp_list",
};

// 장식 이미지 경로. 상세 이미지와 달리 여기서는 화이트리스트를 쓸 수 없다 — 배너 이미지가
// 어느 경로에 올라가는지 모르는데 화이트리스트로 막으면 정작 목표인 배너를 전부 버린다.
// 그래서 실물에서 확인된 장식 경로(img/icon_*.gif, upload/happy_config/*)만 제외한다.
const DECORATION_PATH_PATTERN =
	/^\/(?:img|images|css|js|upload\/happy_config)\//i;

// ---------------------------------------------------------------------------

export interface QueenalbaMainListing {
	// 광고 배너 자리에서 온 공고의 배너 이미지(절대 URL). 다른 자리는 null이다.
	bannerImageUrl: string | null;
	listingType: QueenalbaListingType;
	sourceExternalId: string;
	sourceUrl: string;
	// 카드 썸네일(절대 URL). 이미지 없이 텍스트만 걸리는 자리가 있어 null이 정상이다.
	thumbnailUrl: string | null;
	// 배너는 이미지 한 장뿐이라 제목이 없을 수 있다. 상세 파서가 채우는 제목이 정본이고,
	// 여기 값은 상세를 받기 전 운영자 화면에 뭐라도 보여주기 위한 것이다.
	title: string | null;
}

// 카드 하나의 경계. 링크 안에 이미지가 없을 때 같은 카드에서만 이미지를 찾기 위한 스코프다.
const CARD_CONTAINER_SELECTOR = "dl, li, td";

// 카드의 두 링크 중 공고 제목을 담은 쪽. 나머지 하나(dt)는 업소 닉네임이라 같은 num을 가리키면서
// 글자가 다르다 — 목록 픽스처에서 확인된 실물 클래스이고, 둘을 접을 때 어느 쪽 글자를 남길지의
// 기준이 된다.
const TITLE_LINK_CLASS = "title_ellipse";

const firstImageUrl = (
	$: ReturnType<typeof load>,
	$scope: ReturnType<ReturnType<typeof load>>
): string | null => {
	for (const element of $scope.find("img").toArray()) {
		const url = toQueenalbaAbsoluteUrl($(element).attr("src"));

		if (url && !DECORATION_PATH_PATTERN.test(new URL(url).pathname)) {
			return url;
		}
	}

	return null;
};

// 제목. 배너처럼 이미지만 있는 링크는 텍스트가 없어 alt를 대신 쓴다.
// 마스킹하는 이유: 카드 제목에 카톡 아이디·번호를 그대로 박아두는 공고가 흔하다.
const readTitle = (
	$link: ReturnType<ReturnType<typeof load>>
): string | null => {
	const text =
		normalizeText($link.text()) ||
		normalizeText($link.find("img").first().attr("alt") ?? "");

	return text.length > 0 ? maskContacts(text) : null;
};

// 메인페이지의 세 유료 섹션에서 공고를 뽑는다.
//
// 한 카드가 이미지 링크와 제목 링크 두 개로 갈라져 있는 구조가 흔해(둘 다 같은 num을 가리킨다)
// ID로 접되 뒤 등장이 채워 줄 수 있는 값은 메운다. 여러 섹션에 겹쳐 걸린 공고는 먼저 만난
// 섹션의 자리로 본다 — 배너 > 우대 > 스페셜 순으로 훑으므로 더 비싼 자리가 이긴다.
export const parseQueenalbaMainSections = (
	html: string
): QueenalbaMainListing[] => {
	if (isQueenalbaGateStub(html)) {
		return [];
	}

	const $ = load(html);
	const byId = new Map<string, QueenalbaMainListing>();

	for (const listingType of QUEENALBA_LISTING_TYPES) {
		$(MAIN_SECTION_SELECTORS[listingType])
			.find(QUEENALBA_DETAIL_LINK_SELECTOR)
			.each((_, element) => {
				const $link = $(element);
				const sourceExternalId = readQueenalbaDetailNum($link.attr("href"));

				if (!sourceExternalId) {
					return;
				}

				const image =
					firstImageUrl($, $link) ??
					firstImageUrl($, $link.closest(CARD_CONTAINER_SELECTOR).first());
				const title = readTitle($link);
				const existing = byId.get(sourceExternalId);

				if (existing) {
					// 제목 링크가 뒤에 와도 닉네임 링크가 선점한 글자를 밀어낸다.
					if (title && $link.hasClass(TITLE_LINK_CLASS)) {
						existing.title = title;
					} else {
						existing.title ??= title;
					}

					if (existing.listingType === "ad_banner") {
						existing.bannerImageUrl ??= image;
					} else {
						existing.thumbnailUrl ??= image;
					}

					return;
				}

				byId.set(sourceExternalId, {
					// 배너 자리의 이미지는 목록 썸네일과 크기·디자인이 다른 별개 소재라 따로 담는다.
					// 이 공고의 썸네일·상세 이미지는 목록·상세 패스가 채운다.
					bannerImageUrl: listingType === "ad_banner" ? image : null,
					listingType,
					sourceExternalId,
					sourceUrl: queenalbaDetailUrl(sourceExternalId),
					thumbnailUrl: listingType === "ad_banner" ? null : image,
					title,
				});
			});
	}

	return [...byId.values()];
};

import { load } from "cheerio";

import { maskContacts, normalizeText } from "./bambi-crawl-normalize";
import {
	isQueenalbaGateStub,
	isQueenalbaJobImageUrl,
	QUEENALBA_DETAIL_LINK_SELECTOR,
	QUEENALBA_ORIGIN,
	queenalbaDetailUrl,
	readQueenalbaDetailNum,
	toQueenalbaAbsoluteUrl,
} from "./bambi-crawl-queenalba";

// 퀸알바 메인페이지의 유료 노출 자리(가로·세로 광고 배너, 우대·스페셜 채용) 파서.
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
// 이 문자열이 crawled_job_post.listing_type에 그대로 들어간다. null은 "유료 자리가 아님"
// (메인에 실렸지만 일반 채용 카드)이라는 뜻이다.
export type QueenalbaListingType = (typeof QUEENALBA_LISTING_TYPES)[number];

// ---------------------------------------------------------------------------
// 검증된 앵커 — 컨테이너 ID. 운영자가 실물 DOM에서 확인해 준 값이다.
//
// DevTools "Copy selector"가 뱉는 nth-child 사슬(`> div:nth-child(14) > table > ...`)은
// 일부러 버렸다. 광고 칸이 하나 늘고 줄 때마다 사슬이 통째로 어긋나는데, 그 파손은
// "이미지 0장"으로만 드러나고 이 레포의 수율 판정은 목록 0건만 잡는다 — 즉 조용히 썩는다.
// 그래서 안 깨지는 부분(ID)만 앵커로 쓰고, 그 안에서는 구조(상세 링크 href + img)로 찾는다.
// ---------------------------------------------------------------------------

// 메인 상단 가로형 배너 영역.
const HORIZONTAL_BANNER_SELECTOR = "#main_top_center";

// 좌·우 세로형 배너 영역. 둘 다 훑는다(한쪽만 보면 반대편 배너를 통째로 놓친다).
const VERTICAL_BANNER_SELECTORS = ["#divMenu2", "#divMenu12"] as const;

// 일반 채용공고 카드 영역. 우대·스페셜 섹션도 이 안에 함께 있는 것으로 본다(아래 가정 3).
const JOB_CARD_SELECTOR = "#content1";

// 세로 배너는 한쪽에 최대 3칸이다(운영자 확인). 상한을 두는 이유는 아래 가정 2 때문이다 —
// 배너 이미지 경로를 몰라 화이트리스트를 못 쓰므로, 같은 컨테이너의 메뉴 이미지가 새어
// 들어올 여지가 있다. 상한이 그 피해를 3장으로 묶는다.
const MAX_VERTICAL_BANNERS_PER_COLUMN = 3;

// ---------------------------------------------------------------------------
// ⚠ 여전히 미검증 가정 — 위 컨테이너 ID를 뺀 나머지는 전부 추측이다
//
// 1) 컨테이너 안의 세부 마크업: `a > img`라는 것만 확인됐고 그 사이 래퍼(table/div 중첩)는
//    모른다. 그래서 자손 선택자와 closest()로만 훑고 직계 자식 관계를 가정하지 않는다.
// 2) 배너 이미지의 경로: 어느 디렉터리에 올라가는지 모른다. 화이트리스트를 쓰면 정작 목표인
//    배너를 전부 버리므로, 배너 자리에서는 "위치가 곧 의미"로 보고 경로 대신 알려진 장식만
//    제외한다(아래 DECORATION_PATH_PATTERN·스페이서 크기).
// 3) 섹션 제목 문구("우대채용"·"스페셜채용"): #content1 안에 유료 섹션이 함께 있다는 추정이고,
//    제목 글자도 추정이다. 못 찾으면 listingType은 null(일반)로 둔다 — 틀린 유료 표시보다
//    표시 없음이 낫다.
//
// 쿠키가 생기면: 인증된 브라우저로 메인을 저장 → 위 세 가지를 대조하고 __fixtures__/
// crawl-html.ts의 queenalbaMainHtml을 실물로 갈아끼운다.
// ---------------------------------------------------------------------------

// 장식 이미지 경로. 실물에서 확인된 장식 경로(img/icon_*.gif, upload/happy_config/*)만 뺀다.
const DECORATION_PATH_PATTERN =
	/^\/(?:img|images|css|js|upload\/happy_config)\//i;

// 1x1 스페이서. 배너 자리는 경로로 못 거르니 크기로 거른다 — 투명 gif가 배너로 저장되면
// 운영자 화면에 빈 칸이 뜬다.
const SPACER_MAX_PIXELS = 2;

// 섹션 제목 → 유료 자리. nth-child 위치보다 제목 글자가 훨씬 덜 깨진다(칸이 늘고 줄어도
// 제목은 그대로다). 제목을 못 찾으면 null이다.
const SECTION_TITLES: readonly {
	label: string;
	listingType: QueenalbaListingType;
}[] = [
	{ label: "스페셜채용", listingType: "special" },
	{ label: "스페셜", listingType: "special" },
	{ label: "우대채용", listingType: "premium" },
	{ label: "추천채용", listingType: "premium" },
];

export interface QueenalbaMainListing {
	// 메인 상단 가로형 배너(절대 URL). 다른 자리에서 온 공고는 null이다.
	bannerHorizontalUrl: string | null;
	// 좌·우 세로형 배너(절대 URL). 가로형과 크기·디자인이 다른 별개 소재라 칸을 나눈다.
	bannerVerticalUrl: string | null;
	// 유료 자리가 아니면 null이다(메인에 실린 일반 채용 카드).
	listingType: QueenalbaListingType | null;
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

type Cheerio = ReturnType<ReturnType<typeof load>>;

// 배너 자리의 이미지 판정. 경로 화이트리스트를 쓰지 않는 이유는 위 가정 2다 —
// 이 이미지는 "어느 경로에 있는가"가 아니라 "어느 칸에 걸려 있는가"로 광고 배너가 된다.
const isBannerImageUrl = (url: string): boolean =>
	!DECORATION_PATH_PATTERN.test(new URL(url).pathname);

const readImageUrl = (
	$img: Cheerio,
	accept: (url: string) => boolean
): string | null => {
	for (const attribute of ["height", "width"]) {
		const size = Number.parseInt($img.attr(attribute) ?? "", 10);

		if (Number.isFinite(size) && size <= SPACER_MAX_PIXELS) {
			return null;
		}
	}

	const url = toQueenalbaAbsoluteUrl($img.attr("src"));

	return url && accept(url) ? url : null;
};

const firstImageUrl = (
	$: ReturnType<typeof load>,
	$scope: Cheerio,
	accept: (url: string) => boolean
): string | null => {
	for (const element of $scope.find("img").toArray()) {
		const url = readImageUrl($(element), accept);

		if (url) {
			return url;
		}
	}

	return null;
};

// 이미지 alt. 배너처럼 이미지만 있는 링크는 이게 유일한 제목 후보다.
// 마스킹하는 이유: 카드 제목·alt에 카톡 아이디·번호를 그대로 박아두는 공고가 흔하다.
const readImageAlt = ($img: Cheerio): string | null => {
	const text = normalizeText($img.attr("alt") ?? "");

	return text.length > 0 ? maskContacts(text) : null;
};

const readTitle = ($link: Cheerio): string | null => {
	const text = normalizeText($link.text());

	return text.length > 0
		? maskContacts(text)
		: readImageAlt($link.find("img").first());
};

// 카드가 어느 섹션 아래 있는지. 조상을 한 칸씩 올라가며 앞 형제의 글자에서 섹션 제목을 찾는다.
// 가까운 형제부터 보므로 여러 섹션이 이어져 있어도 바로 위 제목이 이긴다.
const readSectionListingType = (
	$link: Cheerio
): QueenalbaListingType | null => {
	let $node = $link;

	while ($node.length > 0 && !$node.is(JOB_CARD_SELECTOR)) {
		for (
			let $sibling = $node.prev();
			$sibling.length > 0;
			$sibling = $sibling.prev()
		) {
			const text = normalizeText($sibling.text());
			const hit = SECTION_TITLES.find((row) => text.includes(row.label));

			if (hit) {
				return hit.listingType;
			}
		}

		$node = $node.parent();
	}

	return null;
};

interface BannerHit {
	imageUrl: string;
	sourceExternalId: string;
	title: string | null;
}

interface BannerScan {
	hits: BannerHit[];
	skipped: number;
}

// 배너 영역 하나를 훑는다. 링크가 아니라 이미지부터 잡고 감싼 a를 거슬러 올라가는 이유는,
// 같은 컨테이너에 배너가 아닌 텍스트 링크(메뉴)가 섞여 있어도 그쪽을 배너로 세지 않기 위해서다.
const collectBanners = (
	$: ReturnType<typeof load>,
	containerSelector: string,
	limit: number
): BannerScan => {
	const hits: BannerHit[] = [];
	let skipped = 0;

	for (const element of $(`${containerSelector} img`).toArray()) {
		const $img = $(element);
		const imageUrl = readImageUrl($img, isBannerImageUrl);

		if (!imageUrl) {
			continue;
		}

		const sourceExternalId = readQueenalbaDetailNum(
			$img.closest("a").attr("href")
		);

		// 배너 링크가 공고 상세가 아니라 이벤트·외부 페이지로 가는 경우가 있다. 붙일 공고가
		// 없으므로 조용히 건너뛰되(예외를 던지면 회차가 통째로 죽는다) 몇 건인지는 돌려준다.
		if (!sourceExternalId) {
			skipped += 1;
			continue;
		}

		hits.push({ imageUrl, sourceExternalId, title: readImageAlt($img) });

		if (hits.length >= limit) {
			break;
		}
	}

	return { hits, skipped };
};

type ListingPatch = Partial<
	Omit<QueenalbaMainListing, "sourceExternalId" | "sourceUrl">
>;

// 같은 공고가 배너와 카드에 겹쳐 걸리는 게 흔하다. ID로 접되 먼저 만난 자리가 이기고
// (배너 → 카드 순으로 훑으므로 더 비싼 자리가 남는다) 비어 있는 칸만 뒤 등장이 메운다.
const mergeListing = (
	byId: Map<string, QueenalbaMainListing>,
	sourceExternalId: string,
	patch: ListingPatch
): QueenalbaMainListing => {
	const existing = byId.get(sourceExternalId);

	if (existing) {
		existing.bannerHorizontalUrl ??= patch.bannerHorizontalUrl ?? null;
		existing.bannerVerticalUrl ??= patch.bannerVerticalUrl ?? null;
		existing.listingType ??= patch.listingType ?? null;
		existing.thumbnailUrl ??= patch.thumbnailUrl ?? null;
		existing.title ??= patch.title ?? null;

		return existing;
	}

	const created: QueenalbaMainListing = {
		bannerHorizontalUrl: patch.bannerHorizontalUrl ?? null,
		bannerVerticalUrl: patch.bannerVerticalUrl ?? null,
		listingType: patch.listingType ?? null,
		sourceExternalId,
		sourceUrl: queenalbaDetailUrl(sourceExternalId),
		thumbnailUrl: patch.thumbnailUrl ?? null,
		title: patch.title ?? null,
	};

	byId.set(sourceExternalId, created);

	return created;
};

export interface QueenalbaMainResult {
	listings: QueenalbaMainListing[];
	// 상세 링크가 아니어서 공고에 붙이지 못한 배너 수. 조용히 건너뛰되 0이 아니라는 사실은
	// 드러나야 한다 — 이벤트 배너가 섞였다는 뜻일 수도, 셀렉터가 메뉴 이미지를 배너로 읽고
	// 있다는 뜻일 수도 있어 호출자가 로그로 보고 판단한다.
	skippedBanners: number;
}

// 메인페이지의 유료 노출 자리를 훑는다.
export const parseQueenalbaMain = (html: string): QueenalbaMainResult => {
	if (isQueenalbaGateStub(html)) {
		return { listings: [], skippedBanners: 0 };
	}

	const $ = load(html);
	const byId = new Map<string, QueenalbaMainListing>();
	let skippedBanners = 0;

	// 가로형은 칸 수를 모른다. 상한을 두면 실제 칸이 더 많을 때 조용히 잘리므로 두지 않는다 —
	// 어차피 컨테이너 안에서만 찾고 ID로 접힌다.
	const horizontal = collectBanners(
		$,
		HORIZONTAL_BANNER_SELECTOR,
		Number.POSITIVE_INFINITY
	);

	skippedBanners += horizontal.skipped;

	for (const hit of horizontal.hits) {
		mergeListing(byId, hit.sourceExternalId, {
			bannerHorizontalUrl: hit.imageUrl,
			listingType: "ad_banner",
			title: hit.title,
		});
	}

	for (const selector of VERTICAL_BANNER_SELECTORS) {
		const column = collectBanners($, selector, MAX_VERTICAL_BANNERS_PER_COLUMN);

		skippedBanners += column.skipped;

		for (const hit of column.hits) {
			mergeListing(byId, hit.sourceExternalId, {
				bannerVerticalUrl: hit.imageUrl,
				listingType: "ad_banner",
				title: hit.title,
			});
		}
	}

	for (const element of $(
		`${JOB_CARD_SELECTOR} ${QUEENALBA_DETAIL_LINK_SELECTOR}`
	).toArray()) {
		const $link = $(element);
		const sourceExternalId = readQueenalbaDetailNum($link.attr("href"));

		if (!sourceExternalId) {
			continue;
		}

		const title = readTitle($link);
		// 카드 썸네일은 배너와 달리 공고 이미지 화이트리스트를 그대로 쓴다 — 이 자리는 위치가
		// 곧 광고를 뜻하지 않아서(일반 카드도 여기 있다) 경로로 걸러야 아이콘이 안 섞인다.
		const listing = mergeListing(byId, sourceExternalId, {
			listingType: readSectionListingType($link),
			thumbnailUrl:
				firstImageUrl($, $link, isQueenalbaJobImageUrl) ??
				firstImageUrl(
					$,
					$link.closest(CARD_CONTAINER_SELECTOR).first(),
					isQueenalbaJobImageUrl
				),
			title,
		});

		// 제목 링크가 뒤에 와도 닉네임 링크가 선점한 글자를 밀어낸다.
		if (title && $link.hasClass(TITLE_LINK_CLASS)) {
			listing.title = title;
		}
	}

	return { listings: [...byId.values()], skippedBanners };
};

// 배너 수를 안 보는 호출자를 위한 얇은 껍데기.
export const parseQueenalbaMainSections = (
	html: string
): QueenalbaMainListing[] => parseQueenalbaMain(html).listings;

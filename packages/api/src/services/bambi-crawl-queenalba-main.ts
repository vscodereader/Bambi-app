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
	"urgent",
	"recommended",
] as const;

// 유료 노출 자리. 실물 메인의 섹션 제목 이미지 alt에서 확인한 네 섹션 + 배너다.
// ad_banner=광고 배너, premium=프리미엄 채용정보, special=스페셜 채용정보,
// urgent=급구채용, recommended=추천채용.
// 이 문자열이 crawled_job_post.listing_type에 그대로 들어간다. null은 "유료 자리가 아님"
// (메인에 실렸지만 일반 채용 카드)이라는 뜻이다.
export type QueenalbaListingType = (typeof QUEENALBA_LISTING_TYPES)[number];

// 배너 클릭 주소. 상세로 바로 가지 않고 `banner_link.php?number=NN`이라는 리다이렉터를
// 거치며, 그 응답은 guin_detail 주소를 담은 한 줄짜리 스크립트다. 즉 배너를 공고에 붙이려면
// 요청이 한 번 더 필요하다 — 파서는 순수 함수라 번호만 넘기고 수집기가 해석한다.
export const queenalbaBannerLinkUrl = (linkNumber: string): string =>
	`${QUEENALBA_ORIGIN}/banner_link.php?number=${linkNumber}`;

const BANNER_LINK_NUMBER_PATTERN = /banner_link\.php\?number=(\d+)/;

const readBannerLinkNumber = (href: string | null | undefined): string | null =>
	href?.match(BANNER_LINK_NUMBER_PATTERN)?.[1] ?? null;

// 리다이렉터 응답에서 공고 번호를 뽑는다. 응답은 90바이트 내외의
// `<script>window.location.href = '/guin_detail.php?num=12864';</script>`다.
export const readQueenalbaBannerTargetId = (html: string): string | null =>
	readQueenalbaDetailNum(html);

// ---------------------------------------------------------------------------
// 앵커는 전부 실물 응답(인증 쿠키로 받은 메인 364KB)에서 확인했다.
//
// DevTools "Copy selector"가 뱉는 nth-child 사슬(`> div:nth-child(14) > table > ...`)은
// 일부러 버렸다. 광고 칸이 하나 늘고 줄 때마다 사슬이 통째로 어긋나는데, 그 파손은
// "이미지 0장"으로만 드러나고 이 레포의 수율 판정은 목록 0건만 잡는다 — 즉 조용히 썩는다.
// 그래서 안 깨지는 부분(ID·이미지 경로·제목 alt)만 앵커로 쓴다.
// ---------------------------------------------------------------------------

// 메인 상단 가로형 배너 영역.
const HORIZONTAL_BANNER_SELECTOR = "#main_top_center";

// 좌·우 세로형 배너 영역. 둘 다 훑는다(한쪽만 보면 반대편 배너를 통째로 놓친다).
// 실물에서 좌 3칸·우 4칸이었다 — 칸 수 상한은 두지 않는다. 상한을 두면 칸이 늘어난 날
// 조용히 잘리고, 경로 화이트리스트가 이미 메뉴 이미지를 걸러 준다.
const VERTICAL_BANNER_SELECTORS = ["#divMenu2", "#divMenu12"] as const;

// 일반 채용공고 카드 영역. 유료 섹션(프리미엄·스페셜·급구·추천)도 이 안에 함께 있다.
const JOB_CARD_SELECTOR = "#content1";

// 배너 이미지 경로. 실물에서 확인했다 — 확장자가 없고 md5 같은 이름이며, 서버가
// content-type을 text/plain으로 준다(그래서 이미지 판정을 헤더에 맡길 수 없다).
// 같은 컨테이너에 회원가입·TOP 버튼(img/right_btn_*.png)이 섞여 있어 경로로 걸러야 한다.
const BANNER_IMAGE_PATH_PATTERN = /^\/mobile_img\/banner\//i;

// 섹션 제목 → 유료 자리. 이 사이트의 섹션 제목은 텍스트가 아니라 이미지이고, 사람이 읽을
// 이름은 alt에만 있다. 파일명(title_premium_use1.gif 등)보다 alt가 뜻을 담고 있어 이쪽을 쓴다.
// 순서가 우선순위다 — 한 공고가 두 섹션에 걸리면 앞쪽이 이긴다.
const SECTION_TITLES: readonly {
	label: RegExp;
	listingType: QueenalbaListingType;
}[] = [
	{ label: /프리미엄/, listingType: "premium" },
	{ label: /스페셜/, listingType: "special" },
	{ label: /급구/, listingType: "urgent" },
	{ label: /추천/, listingType: "recommended" },
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

const isBannerImageUrl = (url: string): boolean =>
	BANNER_IMAGE_PATH_PATTERN.test(new URL(url).pathname);

const readImageUrl = (
	$img: Cheerio,
	accept: (url: string) => boolean
): string | null => {
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

// 섹션 제목 이미지가 덮는 카드 범위. 제목 이미지에서 조상을 올라가 **상세 링크를 처음 품는
// 조상**이 그 섹션이다(실물에서 프리미엄=table 40건, 스페셜=table 36건, 급구=td 9건,
// 추천=td 16건으로 정확히 갈린다). 앞 형제의 글자를 훑던 예전 방식은 제목이 이미지라
// 한 건도 못 잡았다.
const readSectionScope = (titleImage: Cheerio): Cheerio | null => {
	for (
		let $node = titleImage.parent();
		$node.length > 0 && !$node.is("body");
		$node = $node.parent()
	) {
		if ($node.find(QUEENALBA_DETAIL_LINK_SELECTOR).length > 0) {
			return $node;
		}
	}

	return null;
};

// 공고 번호 → 유료 자리. 섹션을 우선순위 순으로 훑어 먼저 담긴 값이 이긴다.
const readListingTypesBySection = (
	$: ReturnType<typeof load>
): Map<string, QueenalbaListingType> => {
	const byId = new Map<string, QueenalbaListingType>();

	for (const section of SECTION_TITLES) {
		for (const element of $(`${JOB_CARD_SELECTOR} img[alt]`).toArray()) {
			const $image = $(element);

			if (!section.label.test($image.attr("alt") ?? "")) {
				continue;
			}

			const $scope = readSectionScope($image);

			if (!$scope) {
				continue;
			}

			for (const link of $scope
				.find(QUEENALBA_DETAIL_LINK_SELECTOR)
				.toArray()) {
				const id = readQueenalbaDetailNum($(link).attr("href"));

				if (id && !byId.has(id)) {
					byId.set(id, section.listingType);
				}
			}
		}
	}

	return byId;
};

// 배너 한 칸. 공고 번호가 아니라 리다이렉터 번호를 담는다 — 배너 a의 href는
// banner_link.php?number=NN이고 공고 번호는 그 응답에만 있다.
export interface QueenalbaMainBanner {
	direction: "horizontal" | "vertical";
	imageUrl: string;
	linkNumber: string;
	title: string | null;
}

interface BannerScan {
	hits: QueenalbaMainBanner[];
	skipped: number;
}

// 배너 영역 하나를 훑는다. 링크가 아니라 이미지부터 잡고 감싼 a를 거슬러 올라가는 이유는,
// 같은 컨테이너에 배너가 아닌 링크(회원가입·TOP 버튼)가 섞여 있어도 배너로 세지 않기 위해서다.
const collectBanners = (
	$: ReturnType<typeof load>,
	containerSelector: string,
	direction: "horizontal" | "vertical"
): BannerScan => {
	const hits: QueenalbaMainBanner[] = [];
	let skipped = 0;

	for (const element of $(`${containerSelector} img`).toArray()) {
		const $img = $(element);
		const imageUrl = readImageUrl($img, isBannerImageUrl);

		if (!imageUrl) {
			continue;
		}

		const linkNumber = readBannerLinkNumber($img.closest("a").attr("href"));

		// 배너 이미지인데 리다이렉터 링크가 아닌 경우다(외부 링크·이벤트). 붙일 공고를 찾을
		// 방법이 없으므로 조용히 건너뛰되(예외를 던지면 회차가 통째로 죽는다) 개수는 돌려준다.
		if (!linkNumber) {
			skipped += 1;
			continue;
		}

		hits.push({
			direction,
			imageUrl,
			linkNumber,
			title: readImageAlt($img),
		});
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
	// 아직 공고에 붙지 않은 배너들. linkNumber를 리다이렉터로 한 번 더 조회해야 공고를 알 수
	// 있어(queenalbaBannerLinkUrl) 파서는 여기까지만 한다.
	banners: QueenalbaMainBanner[];
	listings: QueenalbaMainListing[];
	// 리다이렉터 링크가 아니어서 공고에 붙일 수 없는 배너 수. 조용히 건너뛰되 0이 아니라는
	// 사실은 드러나야 한다 — 외부·이벤트 배너가 섞였다는 뜻일 수도, 셀렉터가 엉뚱한 이미지를
	// 배너로 읽고 있다는 뜻일 수도 있어 호출자가 로그로 보고 판단한다.
	skippedBanners: number;
}

// 메인페이지의 유료 노출 자리를 훑는다.
export const parseQueenalbaMain = (html: string): QueenalbaMainResult => {
	if (isQueenalbaGateStub(html)) {
		return { banners: [], listings: [], skippedBanners: 0 };
	}

	const $ = load(html);
	const byId = new Map<string, QueenalbaMainListing>();
	const scans = [
		collectBanners($, HORIZONTAL_BANNER_SELECTOR, "horizontal"),
		...VERTICAL_BANNER_SELECTORS.map((selector) =>
			collectBanners($, selector, "vertical")
		),
	];
	const listingTypeById = readListingTypesBySection($);

	for (const element of $(
		`${JOB_CARD_SELECTOR} ${QUEENALBA_DETAIL_LINK_SELECTOR}`
	).toArray()) {
		const $link = $(element);
		const sourceExternalId = readQueenalbaDetailNum($link.attr("href"));

		if (!sourceExternalId) {
			continue;
		}

		const title = readTitle($link);
		// 카드 썸네일은 배너와 다른 화이트리스트(공고 이미지 경로)를 쓴다 — 이 자리는 위치가
		// 곧 광고를 뜻하지 않아서(일반 카드도 여기 있다) 경로로 걸러야 아이콘이 안 섞인다.
		const listing = mergeListing(byId, sourceExternalId, {
			listingType: listingTypeById.get(sourceExternalId) ?? null,
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

	return {
		banners: scans.flatMap((scan) => scan.hits),
		listings: [...byId.values()],
		skippedBanners: scans.reduce((total, scan) => total + scan.skipped, 0),
	};
};

// 리다이렉터로 알아낸 공고 번호를 배너에 붙여 목록 항목으로 만든다. 파서가 순수 함수로
// 남으려면 네트워크 단계가 밖에 있어야 해서, 그 결과를 되먹이는 자리를 여기 둔다.
export const attachResolvedBanners = (
	listings: QueenalbaMainListing[],
	resolved: readonly { banner: QueenalbaMainBanner; sourceExternalId: string }[]
): QueenalbaMainListing[] => {
	const byId = new Map(
		listings.map((listing) => [listing.sourceExternalId, listing])
	);

	for (const { banner, sourceExternalId } of resolved) {
		const listing = mergeListing(byId, sourceExternalId, {
			...(banner.direction === "horizontal"
				? { bannerHorizontalUrl: banner.imageUrl }
				: { bannerVerticalUrl: banner.imageUrl }),
			title: banner.title,
		});

		// 배너 자리가 섹션보다 세다. 같은 공고가 프리미엄 섹션에도 있으면 mergeListing의
		// "먼저 담긴 값이 이긴다" 규칙 때문에 섹션 값이 남으므로 여기서 덮어쓴다.
		listing.listingType = "ad_banner";
	}

	return [...byId.values()];
};

// 배너 수를 안 보는 호출자를 위한 얇은 껍데기.
export const parseQueenalbaMainSections = (
	html: string
): QueenalbaMainListing[] => parseQueenalbaMain(html).listings;

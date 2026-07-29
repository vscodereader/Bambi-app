import { describe, expect, it } from "vitest";
import {
	queenalbaGateStubHtml as GATE_STUB,
	queenalbaMainHtml as mainHtml,
} from "./__fixtures__/crawl-html";
import {
	parseQueenalbaMain,
	parseQueenalbaMainSections,
	queenalbaMainUrl,
} from "./bambi-crawl-queenalba-main";

// ⚠ 이 테스트가 검증하는 건 "컨테이너 안을 구조로 훑는 로직"이지 "퀸알바 메인 마크업을 그대로
// 읽는가"가 아니다. 컨테이너 ID(#main_top_center·#divMenu2·#divMenu12·#content1)는 운영자가
// 실물 DOM에서 확인해 준 값이지만, 그 안의 세부 마크업과 배너 이미지 경로는 여전히 가정이고
// 픽스처가 그 가정 위에 서 있다(순환). 쿠키가 생기면 실물 HTML로 픽스처를 갈아끼워야 한다.

describe("queenalbaMainUrl", () => {
	it("points at the site root", () => {
		expect(queenalbaMainUrl()).toBe("https://queenalba.net/");
	});
});

describe("parseQueenalbaMain", () => {
	const result = parseQueenalbaMain(mainHtml);
	const byId = new Map(
		result.listings.map((row) => [row.sourceExternalId, row])
	);

	// 어느 자리에 걸렸는지가 이 파서의 존재 이유다. 자리를 못 가리면 일반 목록과 구분이 없다.
	it("labels each paid slot", () => {
		expect(byId.get("50001")?.listingType).toBe("ad_banner");
		expect(byId.get("51001")?.listingType).toBe("ad_banner");
		expect(byId.get("36659")?.listingType).toBe("premium");
		expect(byId.get("25073")?.listingType).toBe("special");
	});

	// 섹션 제목을 못 찾은 카드까지 유료로 표시하면 시장 신호가 통째로 거짓이 된다.
	it("leaves an unlabelled card without a listing type", () => {
		expect(byId.get("40001")?.listingType).toBeNull();
		expect(byId.get("40001")?.thumbnailUrl).toBe(
			"https://queenalba.net/offerphoto/40001.jpg"
		);
	});

	it("builds the detail url from the listing id", () => {
		expect(byId.get("25073")?.sourceUrl).toBe(
			"https://queenalba.net/guin_detail.php?num=25073"
		);
	});

	// 가로형과 세로형은 크기·디자인이 다른 별개 소재다. 한 칸에 섞으면 어느 쪽이 왔는지
	// 알 수 없어 운영자 화면에서 못 쓴다.
	it("keeps the horizontal and vertical banners in separate fields", () => {
		expect(byId.get("50001")?.bannerHorizontalUrl).toBe(
			"https://queenalba.net/upload/banner/50001_top.jpg"
		);
		expect(byId.get("50001")?.bannerVerticalUrl).toBeNull();
		expect(byId.get("51001")?.bannerVerticalUrl).toBe(
			"https://queenalba.net/upload/banner/51001_side.jpg"
		);
		expect(byId.get("51001")?.bannerHorizontalUrl).toBeNull();
	});

	// 배너 이미지는 카드 썸네일과 다른 소재라 썸네일 칸을 채우면 안 된다.
	it("does not put a banner in the thumbnail field", () => {
		expect(byId.get("50001")?.thumbnailUrl).toBeNull();
		expect(byId.get("51001")?.thumbnailUrl).toBeNull();
	});

	// 좌·우 두 컨테이너를 다 훑지 않으면 반대편 배너를 통째로 놓친다.
	it("reads both vertical banner columns", () => {
		expect(byId.get("51002")?.bannerVerticalUrl).toBe(
			"https://queenalba.net/upload/banner/51002_side.jpg"
		);
		expect(byId.get("52001")?.bannerVerticalUrl).toBe(
			"https://queenalba.net/upload/banner/52001_side.jpg"
		);
	});

	// 한쪽 컨테이너는 3칸까지다. 더 걸리면 배너가 아닌 이미지를 배너로 읽고 있는 것이다.
	it("caps each vertical column at three banners", () => {
		expect(byId.has("52003")).toBe(true);
		expect(byId.has("52004")).toBe(false);
	});

	// 배너 링크가 이벤트·외부 페이지로 가면 붙일 공고가 없다. 예외를 던지면 회차가 통째로
	// 죽으므로 조용히 건너뛰되, 몇 건이었는지는 드러나야 한다.
	it("skips a banner that does not link to a listing, and counts it", () => {
		expect(result.skippedBanners).toBe(1);
		expect(
			result.listings.every(
				(row) => !row.bannerVerticalUrl?.includes("event_summer")
			)
		).toBe(true);
	});

	// 상대경로는 저장한 뒤에 해석할 기준이 사라진다.
	it("normalises relative image paths", () => {
		expect(byId.get("50002")?.bannerHorizontalUrl).toBe(
			"https://queenalba.net/upload/banner/50002_top.jpg"
		);
	});

	// 배너 링크 안에 아이콘 gif가 먼저 오는 경우가 있다. 그걸 집으면 배너 자리에 화살표가 뜬다.
	it("skips decoration images", () => {
		expect(
			result.listings.every(
				(row) => !row.bannerHorizontalUrl?.includes("/img/")
			)
		).toBe(true);
	});

	// 1x1 스페이서는 경로로는 못 거른다(배너와 같은 디렉터리에 있을 수 있다). 크기로 거르지
	// 않으면 배너 자리에 투명 gif가 저장된다.
	it("skips a 1x1 spacer that sits in the banner directory", () => {
		expect(byId.get("52003")?.bannerVerticalUrl).toBe(
			"https://queenalba.net/upload/banner/52003_side.jpg"
		);
	});

	// 카드 하나가 이미지 링크와 제목 링크로 갈라져 있다. 접지 않으면 같은 공고가 두 건이 되고,
	// 제목 없는 이미지 링크만 남으면 운영자 화면에 빈 줄이 뜬다.
	it("folds the image link and the title link of one card", () => {
		expect(
			result.listings.filter((row) => row.sourceExternalId === "36659")
		).toHaveLength(1);
		expect(byId.get("36659")?.title).toBe("❤️에밀리❤️ 초보환영");
		expect(byId.get("36659")?.thumbnailUrl).toBe(
			"https://queenalba.net/offerphoto/36659.jpg"
		);
	});

	// 등급 아이콘이 카드 링크 안에 먼저 오는 경우가 있다. 썸네일 자리가 메달 gif가 된다.
	it("does not mistake a card icon for a thumbnail", () => {
		expect(byId.get("25073")?.thumbnailUrl).toBe(
			"https://queenalba.net/offerphoto/25073.jpg"
		);
	});

	// 우대·스페셜에 겹쳐 걸린 공고는 먼저 훑는 쪽(더 비싼 자리)으로 남는다.
	it("keeps the first slot a listing appears in", () => {
		expect(byId.get("36659")?.listingType).toBe("premium");
	});

	// 이미지뿐인 배너는 링크 텍스트가 없어 alt가 유일한 제목 후보다.
	it("falls back to the image alt for a text-less banner", () => {
		expect(byId.get("50001")?.title).toBe("❤️에밀리❤️ 강남 최고대우");
	});

	// 카드 제목·배너 alt에 카톡 아이디를 그대로 박아두는 공고가 흔하다.
	it("masks contacts in the card title and the banner alt", () => {
		expect(byId.get("16100")?.title).toBe("급구 [연락처 비공개]");
		expect(byId.get("51002")?.title).toBe("세로배너 [연락처 비공개]");
	});

	// 컨테이너 밖(헤더·푸터)의 상세 링크는 메인 노출 자리가 아니다.
	it("ignores listing links outside the known containers", () => {
		expect(byId.has("99999")).toBe(false);
	});

	// 0건일 때 예외를 던지면 상위 수집기가 "셀렉터 파손"으로 읽고 회차를 통째로 중단시킨다.
	it("returns an empty result instead of throwing", () => {
		expect(parseQueenalbaMain(GATE_STUB)).toEqual({
			listings: [],
			skippedBanners: 0,
		});
		expect(
			parseQueenalbaMain("<html><body>없음</body></html>").listings
		).toEqual([]);
	});
});

describe("parseQueenalbaMainSections", () => {
	it("returns just the listings", () => {
		expect(parseQueenalbaMainSections(mainHtml)).toEqual(
			parseQueenalbaMain(mainHtml).listings
		);
	});
});

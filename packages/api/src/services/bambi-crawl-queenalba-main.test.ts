import { describe, expect, it } from "vitest";
import {
	queenalbaGateStubHtml as GATE_STUB,
	queenalbaMainHtml as mainHtml,
} from "./__fixtures__/crawl-html";
import {
	parseQueenalbaMainSections,
	queenalbaMainUrl,
} from "./bambi-crawl-queenalba-main";

// ⚠ 이 테스트가 검증하는 건 섹션 → listingType 매핑·이미지 정규화·중복 접기 로직이지,
// "퀸알바 메인페이지 마크업을 제대로 읽는가"가 아니다. 메인페이지는 성인인증 게이트 뒤라
// 실물을 보지 못했고 픽스처와 셀렉터가 같은 가정 위에 서 있다(순환). 실제 쿠키가 생기면
// 실물 HTML로 픽스처를 갈아끼워야 이 테스트가 의미를 갖는다.

describe("queenalbaMainUrl", () => {
	it("points at the site root", () => {
		expect(queenalbaMainUrl()).toBe("https://queenalba.net/");
	});
});

describe("parseQueenalbaMainSections", () => {
	const listings = parseQueenalbaMainSections(mainHtml);
	const byId = new Map(listings.map((row) => [row.sourceExternalId, row]));

	// 어느 자리에 걸렸는지가 이 파서의 존재 이유다. 자리를 못 가리면 일반 목록과 구분이 없다.
	it("labels each paid section", () => {
		expect(byId.get("50001")?.listingType).toBe("ad_banner");
		expect(byId.get("36659")?.listingType).toBe("premium");
		expect(byId.get("25073")?.listingType).toBe("special");
	});

	it("builds the detail url from the listing id", () => {
		expect(byId.get("25073")?.sourceUrl).toBe(
			"https://queenalba.net/guin_detail.php?num=25073"
		);
	});

	// 배너 이미지는 카드 썸네일과 크기·디자인이 다른 별개 소재라 따로 담는다.
	it("keeps the banner image apart from the thumbnail", () => {
		const banner = byId.get("50001");

		expect(banner?.bannerImageUrl).toBe(
			"https://queenalba.net/upload/banner/50001_top.jpg"
		);
		expect(banner?.thumbnailUrl).toBeNull();
	});

	// 상대경로는 저장한 뒤에 해석할 기준이 사라진다.
	it("normalises relative image paths", () => {
		expect(byId.get("50002")?.bannerImageUrl).toBe(
			"https://queenalba.net/upload/banner/50002_top.jpg"
		);
	});

	// 배너 링크 안에 아이콘 gif가 먼저 오는 경우가 있다. 그걸 집으면 배너 자리에 화살표가 뜬다.
	it("skips decoration images", () => {
		expect(
			listings.every((row) => !row.bannerImageUrl?.includes("/img/"))
		).toBe(true);
	});

	// 카드 하나가 이미지 링크와 제목 링크로 갈라져 있다. 접지 않으면 같은 공고가 두 건이 되고,
	// 제목 없는 이미지 링크만 남으면 운영자 화면에 빈 줄이 뜬다.
	it("folds the image link and the title link of one card", () => {
		expect(
			listings.filter((row) => row.sourceExternalId === "36659")
		).toHaveLength(1);
		expect(byId.get("36659")?.title).toBe("❤️에밀리❤️ 초보환영");
		expect(byId.get("36659")?.thumbnailUrl).toBe(
			"https://queenalba.net/offerphoto/36659.jpg"
		);
	});

	// 우대·스페셜에 겹쳐 걸린 공고는 먼저 훑는 쪽(더 비싼 자리)으로 남는다.
	it("keeps the first section a listing appears in", () => {
		expect(byId.get("36659")?.listingType).toBe("premium");
	});

	// 이미지뿐인 배너는 링크 텍스트가 없어 alt가 유일한 제목 후보다.
	it("falls back to the image alt for a text-less banner", () => {
		expect(byId.get("50001")?.title).toBe("❤️에밀리❤️ 강남 최고대우");
	});

	// 카드 제목에 카톡 아이디를 그대로 박아두는 공고가 흔하다.
	it("masks contacts in the card title", () => {
		expect(byId.get("16100")?.title).toBe("급구 [연락처 비공개]");
	});

	// 섹션 밖(헤더·푸터)의 상세 링크는 유료 자리가 아니다.
	it("ignores listing links outside the paid sections", () => {
		expect(byId.has("99999")).toBe(false);
	});

	// 0건일 때 예외를 던지면 상위 수집기가 "셀렉터 파손"으로 읽고 회차를 통째로 중단시킨다.
	it("returns an empty array instead of throwing", () => {
		expect(parseQueenalbaMainSections(GATE_STUB)).toEqual([]);
		expect(
			parseQueenalbaMainSections("<html><body>없음</body></html>")
		).toEqual([]);
	});
});

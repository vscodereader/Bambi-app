import { describe, expect, it } from "vitest";
import {
	queenalbaGateStubHtml as GATE_STUB,
	queenalbaMainHtml as mainHtml,
} from "./__fixtures__/crawl-html";
import {
	attachResolvedBanners,
	parseQueenalbaMain,
	parseQueenalbaMainSections,
	queenalbaBannerLinkUrl,
	queenalbaMainUrl,
	readQueenalbaBannerTargetId,
} from "./bambi-crawl-queenalba-main";

// 픽스처는 인증 쿠키로 받은 실물 메인에서 확인한 구조다(배너 경로 mobile_img/banner/,
// banner_link.php 리다이렉터, alt에만 있는 섹션 제목). 앞선 판이 전부 가정 위에 서 있어
// 테스트는 통과하는데 실물에서 0건이 나왔으므로, 이 세 가지는 고쳐 쓰지 말 것.

describe("queenalbaMainUrl", () => {
	it("points at the site root", () => {
		expect(queenalbaMainUrl()).toBe("https://queenalba.net/");
	});
});

describe("queenalbaBannerLinkUrl", () => {
	it("builds the redirector url", () => {
		expect(queenalbaBannerLinkUrl("63")).toBe(
			"https://queenalba.net/banner_link.php?number=63"
		);
	});
});

describe("readQueenalbaBannerTargetId", () => {
	// 리다이렉터 응답은 90바이트 남짓의 스크립트 한 줄이다.
	it("reads the job id out of the script redirect", () => {
		expect(
			readQueenalbaBannerTargetId(
				"<script>window.location.href = '/guin_detail.php?num=12864';</script>"
			)
		).toBe("12864");
		expect(
			readQueenalbaBannerTargetId(
				"<script>window.location.href = 'https://queenalba.net/guin_detail.php?num=38062';</script>"
			)
		).toBe("38062");
	});

	it("returns null when the redirect does not point at a job", () => {
		expect(
			readQueenalbaBannerTargetId(
				"<script>window.location.href = 'https://sponsor.example/';</script>"
			)
		).toBeNull();
	});
});

describe("parseQueenalbaMain", () => {
	const result = parseQueenalbaMain(mainHtml);
	const byId = new Map(
		result.listings.map((row) => [row.sourceExternalId, row])
	);

	// 어느 자리에 걸렸는지가 이 파서의 존재 이유다. 자리를 못 가리면 일반 목록과 구분이 없다.
	// 값은 원본 섹션 이름이 아니라 우리 자리 어휘다(스페셜채용→추천, 프리미엄채용→급구,
	// 우대등록→스페셜).
	it("maps each section title to our own slot vocabulary", () => {
		expect(byId.get("29431")?.listingType).toBe("recommended");
		expect(byId.get("16100")?.listingType).toBe("urgent");
		expect(byId.get("37428")?.listingType).toBe("urgent");
		expect(byId.get("25073")?.listingType).toBe("special");
	});

	// 한 공고 = 한 자리. 원본에서 칸이 희소한 자리가 이긴다(스페셜 12칸 > 우대등록 72칸).
	it("gives a job listed in two sections the scarcer slot", () => {
		expect(byId.get("36659")?.listingType).toBe("recommended");
	});

	// 우리 자리에 대응이 없는 섹션이다. 라벨을 붙이면 급구 자리에 두 종류가 섞인다.
	it("leaves queenalba's own 급구·추천 sections unlabelled", () => {
		expect(byId.get("41001")?.listingType).toBeNull();
		expect(byId.get("41002")?.listingType).toBeNull();
	});

	// 구직자 섹션이다. alt 매칭이 `채용`을 요구하지 않으면 여기가 스페셜로 라벨된다.
	it("does not mistake the 스페셜인재정보 job-seeker section for 스페셜 채용", () => {
		expect(byId.get("50501")?.listingType).toBeNull();
	});

	it("leaves a card outside every section without a listing type", () => {
		expect(byId.get("40001")?.listingType).toBeNull();
		expect(byId.get("40001")?.thumbnailUrl).toBe(
			"https://queenalba.net/upload/happy_member/2026/07/20/40001.gif"
		);
	});

	it("keeps the header link outside the card area out of the result", () => {
		expect(byId.has("99999")).toBe(false);
	});

	// 배너는 파서 단계에서 공고를 알 수 없다. 번호까지만 뽑아 내보내야 한다.
	it("collects banners with their redirector number and direction", () => {
		const horizontal = result.banners.filter(
			(banner) => banner.direction === "horizontal"
		);
		const vertical = result.banners.filter(
			(banner) => banner.direction === "vertical"
		);

		// #main_center 3칸 중 외부 링크 1건 제외.
		expect(horizontal.map((banner) => banner.linkNumber)).toEqual(["77", "78"]);
		// 좌(#divMenu2) 1칸 + 우(#divMenu12) 2칸. 칸 수 상한은 두지 않는다.
		expect(vertical.map((banner) => banner.linkNumber)).toEqual([
			"53",
			"74",
			"60",
		]);
	});

	// 기준 컨테이너는 가로 #main_center·세로 #divMenu2·#divMenu12뿐이다. 기준 밖 배너가
	// 섞이면 우리 프리미엄 배너 자리에 값어치가 다른 광고가 오른다.
	it("ignores banners from containers outside the paid slots", () => {
		expect(
			result.banners.map((banner) => banner.linkNumber).includes("11")
		).toBe(false);
		expect(
			result.banners.map((banner) => banner.linkNumber).includes("12")
		).toBe(false);
	});

	it("normalises relative banner paths to absolute urls", () => {
		expect(result.banners[0]?.imageUrl).toBe(
			"https://queenalba.net/mobile_img/banner/8b68d5e4425482c53bc6c819192cc562"
		);
	});

	// 배너 칸에는 회원가입·TOP 버튼이 함께 들어 있다. 경로로 걸러야 배너로 세지 않는다.
	it("ignores the menu buttons that share the banner column", () => {
		expect(
			result.banners.some((banner) => banner.imageUrl.includes("right_btn"))
		).toBe(false);
	});

	// 배너 이미지인데 리다이렉터가 아닌 링크(외부·이벤트)는 붙일 공고가 없다.
	it("counts banners it cannot attach instead of throwing", () => {
		expect(result.skippedBanners).toBe(1);
	});

	it("falls back to the image alt for a text-less banner", () => {
		expect(result.banners[0]?.title).toBe("❤️에밀리❤️ 강남 최고대우");
	});

	// 배너 alt에 카톡 아이디를 박아두는 광고가 흔하다.
	it("masks contacts in the banner alt", () => {
		expect(
			result.banners.find((banner) => banner.linkNumber === "60")?.title
		).toBe("세로배너 [연락처 비공개]");
	});

	// 같은 공고가 두 섹션에 네 링크로 걸려 있다(섹션마다 이미지 링크 + 제목 링크).
	it("folds the image link and the title link of one card", () => {
		expect(
			result.listings.filter((row) => row.sourceExternalId === "36659")
		).toHaveLength(1);
		expect(byId.get("36659")?.title).toBe("❤️에밀리❤️ 초보환영");
		expect(byId.get("36659")?.thumbnailUrl).toBe(
			"https://queenalba.net/upload/happy_member/2026/07/20/36659.gif"
		);
	});

	it("does not mistake a card icon for a thumbnail", () => {
		expect(byId.get("25073")?.thumbnailUrl).toBe(
			"https://queenalba.net/upload/happy_member/2026/07/20/25073.gif"
		);
	});

	it("masks contacts in the card title", () => {
		expect(byId.get("16100")?.title).toBe("급구 [연락처 비공개]");
	});

	it("returns an empty result instead of throwing on the gate stub", () => {
		expect(parseQueenalbaMain(GATE_STUB)).toEqual({
			banners: [],
			listings: [],
			skippedBanners: 0,
		});
		expect(parseQueenalbaMainSections(GATE_STUB)).toEqual([]);
	});
});

describe("attachResolvedBanners", () => {
	const { banners, listings } = parseQueenalbaMain(mainHtml);
	const horizontal = banners.find(
		(banner) => banner.direction === "horizontal"
	);
	const vertical = banners.find((banner) => banner.direction === "vertical");

	it("puts the two directions in separate fields", () => {
		const attached = attachResolvedBanners(listings, [
			{ banner: horizontal as never, sourceExternalId: "50001" },
			{ banner: vertical as never, sourceExternalId: "51001" },
		]);
		const byId = new Map(attached.map((row) => [row.sourceExternalId, row]));

		expect(byId.get("50001")?.bannerHorizontalUrl).toBe(horizontal?.imageUrl);
		expect(byId.get("50001")?.bannerVerticalUrl).toBeNull();
		expect(byId.get("51001")?.bannerVerticalUrl).toBe(vertical?.imageUrl);
		expect(byId.get("51001")?.bannerHorizontalUrl).toBeNull();
	});

	// 배너 이미지가 썸네일 칸에 새면 카드가 광고 배너를 대표 사진으로 쓴다.
	it("does not put a banner in the thumbnail field", () => {
		const attached = attachResolvedBanners(listings, [
			{ banner: horizontal as never, sourceExternalId: "50001" },
		]);

		expect(
			attached.find((row) => row.sourceExternalId === "50001")?.thumbnailUrl
		).toBeNull();
	});

	// 배너 자리가 섹션보다 세다 — 같은 공고가 섹션에도 걸려 있으면 배너로 표기해야 한다.
	it("overrides a section label with the banner slot", () => {
		const attached = attachResolvedBanners(listings, [
			{ banner: horizontal as never, sourceExternalId: "36659" },
		]);

		expect(
			attached.find((row) => row.sourceExternalId === "36659")?.listingType
		).toBe("ad_banner");
	});
});

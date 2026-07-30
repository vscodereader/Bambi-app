import { describe, expect, it } from "vitest";
import {
	queenalbaGuinDetailCallpinHtml as callpinDetailHtml,
	queenalbaBbsDetailHtml as communityDetailHtml,
	queenalbaBbsDetailNoViewsHtml as communityDetailNoViewsHtml,
	queenalbaBbsListHtml as communityHtml,
	queenalbaGuinDetailHtml as detailHtml,
	queenalbaGateStubHtml as GATE_STUB,
	queenalbaGuinListHtml as listHtml,
	queenalbaGuinDetailManyImagesHtml as manyImagesDetailHtml,
} from "./__fixtures__/crawl-html";
import {
	isQueenalbaGateStub,
	parseQueenalbaCommunityDetail,
	parseQueenalbaCommunityList,
	parseQueenalbaDetail,
	parseQueenalbaList,
	QUEENALBA_MAX_DETAIL_IMAGES,
	queenalbaCommunityListUrl,
	queenalbaDetailUrl,
	queenalbaListUrl,
} from "./bambi-crawl-queenalba";

const NUMERIC_ID_PATTERN = /^\d+$/;
const PHONE_PATTERN = /01[016-9][-\s.]?\d{3,4}/;
const COMMUNITY_ID_PATTERN = /^comm_board2:\d+$/;

describe("queenalba urls", () => {
	it("builds list and detail urls", () => {
		expect(queenalbaListUrl()).toBe("https://queenalba.net/guin_list.php");
		expect(queenalbaDetailUrl("16100")).toBe(
			"https://queenalba.net/guin_detail.php?num=16100"
		);
		expect(queenalbaCommunityListUrl(2)).toBe(
			"https://queenalba.net/bbs_list.php?tb=comm_board2&pg=2"
		);
	});
});

describe("isQueenalbaGateStub", () => {
	it("recognises the age-gate redirect stub", () => {
		expect(isQueenalbaGateStub(GATE_STUB)).toBe(true);
	});

	it("does not flag a real page", () => {
		expect(isQueenalbaGateStub(listHtml)).toBe(false);
		expect(isQueenalbaGateStub(detailHtml)).toBe(false);
	});
});

describe("parseQueenalbaList", () => {
	const items = parseQueenalbaList(listHtml);

	it("collects every listing id on the page", () => {
		expect(items.length).toBeGreaterThan(0);
		expect(
			items.every((item) => NUMERIC_ID_PATTERN.test(item.sourceExternalId))
		).toBe(true);
	});

	it("folds the same listing appearing in several sections", () => {
		const ids = items.map((item) => item.sourceExternalId);

		expect(new Set(ids).size).toBe(ids.length);
	});

	// 저장한 뒤에는 어느 페이지에서 읽었는지 알 수 없어 상대경로가 쓸모없어진다.
	it("normalises card thumbnails to absolute urls", () => {
		const item = items.find((row) => row.sourceExternalId === "36659");

		expect(item?.thumbnailUrl).toBe(
			"https://queenalba.net/upload/happy_member/2026/07/20/36659.gif"
		);
	});

	// 등급 아이콘·버튼 gif가 썸네일 자리에 들어가면 목록 카드가 아이콘으로 도배된다.
	it("does not mistake an icon for a thumbnail", () => {
		expect(items.every((row) => !row.thumbnailUrl?.includes("/img/"))).toBe(
			true
		);
	});

	// 표형 섹션 카드는 이미지 없이 텍스트만이다. 이미지가 없는 게 정상이라 실패로 보면 안 된다.
	it("leaves the thumbnail null for a text-only row", () => {
		const item = items.find((row) => row.sourceExternalId === "37428");

		expect(item).toBeDefined();
		expect(item?.thumbnailUrl).toBeNull();
	});

	// 게이트에 막힌 응답을 공고 0건으로 읽으면 수율 판정이 "셀렉터 파손"으로 오진한다.
	it("returns nothing for the gate stub", () => {
		expect(parseQueenalbaList(GATE_STUB)).toEqual([]);
	});
});

// 유흥 공고는 조건 대부분을 이미지로만 적어두는 경우가 많아, 본문 텍스트만 저장하면 정작
// 핵심 정보가 빠진다.
describe("parseQueenalbaDetail — 본문 이미지", () => {
	it("collects only real posting images, absolute and deduplicated", () => {
		expect(parseQueenalbaDetail(detailHtml, "16100")?.detailImageUrls).toEqual([
			"https://queenalba.net/wys2/file_attach/2025/12/06/sample.jpg",
			"https://queenalba.net/img_up/shop_pds/2026/07/29/detail_01.jpg",
		]);
	});

	// 본문 이미지 48장이 전부 /img_up/shop_pds/에 있는 공고가 실재했고, 그 경로가 화이트리스트에
	// 없어서 0장이 수집됐다(그래서 상세 화면이 썸네일 폴백으로 빠졌다). 반대로 남의 서버에 있는
	// 장식 gif는 계속 걸러야 한다 — 핫링크한 장식이 공고 이미지 자리에 저장된다.
	it("collects /img_up/ images but not external decorations", () => {
		const urls =
			parseQueenalbaDetail(detailHtml, "16100")?.detailImageUrls ?? [];

		expect(urls).toContain(
			"https://queenalba.net/img_up/shop_pds/2026/07/29/detail_01.jpg"
		);
		expect(urls.every((url) => url.startsWith("https://queenalba.net/"))).toBe(
			true
		);
	});

	// 위에서부터 읽는 순서가 곧 공고의 구성이다(조건표 → 사진 순서가 뒤집히면 뜻이 달라진다).
	it("keeps the source order", () => {
		expect(
			parseQueenalbaDetail(callpinDetailHtml, "36659")?.detailImageUrls
		).toEqual([
			"https://queenalba.net/wys2/file_attach/2025/12/06/a.jpg",
			"https://queenalba.net/wys2/file_attach/2025/12/06/b.jpg",
		]);
	});

	// 썸네일은 본문 이미지와 별개 자리에 있다(운영자 확인). 본문 목록에 섞이면 같은 공고
	// 상세에 같은 그림이 두 번 뜨고, 목록 썸네일을 채울 때 쓸 값도 못 고른다.
	it("reads the detail thumbnail without mixing it into the body images", () => {
		const record = parseQueenalbaDetail(detailHtml, "16100");

		expect(record?.thumbnailUrl).toBe(
			"https://queenalba.net/upload/happy_member/2026/07/20/16100_main.gif"
		);
		expect(record?.detailImageUrls).not.toContain(
			"https://queenalba.net/upload/happy_member/2026/07/20/16100_main.gif"
		);
	});

	// 썸네일 없는 공고가 있다. 라벨 표의 아이콘 gif를 대신 집으면 상세 카드가 화살표가 된다.
	it("leaves the thumbnail null when the detail has none", () => {
		expect(
			parseQueenalbaDetail(callpinDetailHtml, "36659")?.thumbnailUrl
		).toBeNull();
	});

	// 이상 공고 하나가 행 크기를 흔들지 않도록 천장을 둔다.
	it("caps the number of stored images", () => {
		const urls =
			parseQueenalbaDetail(manyImagesDetailHtml, "1")?.detailImageUrls ?? [];

		expect(urls).toHaveLength(QUEENALBA_MAX_DETAIL_IMAGES);
		expect(urls[0]).toBe(
			"https://queenalba.net/wys2/file_attach/2025/12/06/img0.jpg"
		);
	});
});

describe("parseQueenalbaDetail", () => {
	const record = parseQueenalbaDetail(detailHtml, "16100");

	it("reads the labelled fields of a known listing", () => {
		expect(record).not.toBeNull();
		expect(record?.title).toBe(
			"❤TC인상❤급구❤7T~9T❤빠른회전❤서류無송파구방이동잠실셔츠룸레깅스가락동"
		);
		expect(record?.shopName).toBe("♥The Day♥");
		expect(record?.bizName).toBe("주식회사 제이유니언");
		expect(record?.region).toBe("서울");
		expect(record?.district).toBe("송파구");
		expect(record?.address).toBe("서울특별시 송파구 송파대로28길 11, 지하1층");
		expect(record?.industryRaw).toBe("룸싸롱 - 클럽");
		expect(record?.industryCategory).toBe("룸싸롱");
		expect(record?.sourceUrl).toBe(
			"https://queenalba.net/guin_detail.php?num=16100"
		);
	});

	// 사이트가 급여 칸에 최저임금 안내를 덧붙인다. 잘라내지 않으면 안내 문구의 10,320원을
	// 급여로 읽는다.
	it("strips the minimum-wage notice from the pay field", () => {
		expect(record?.payRaw).toBe("150,000원");
		expect(record?.payAmount).toBe(150_000);
	});

	// 단위는 텍스트가 아니라 급여 칸의 gif 파일명(WantMoneyArrImgN)에만 있다. 이걸 안 읽으면
	// 수집한 공고의 payUnit이 전부 빈다.
	it("reads the pay unit from the unit image", () => {
		expect(record?.payUnit).toBe("시급");
	});

	// 우리 payUnitOptions 5종에 없는 단위(6=건당, 7=연봉)도 원문 의미 그대로 둔다 —
	// 연봉을 월급으로 뭉개면 같은 금액이 다른 뜻이 된다.
	it("keeps units outside our five options as the source means them", () => {
		const perCase = detailHtml.replace("WantMoneyArrImg2", "WantMoneyArrImg6");

		expect(parseQueenalbaDetail(perCase, "16100")?.payUnit).toBe("건당");
	});

	// 1은 "면접 후 협의"다. 금액이 함께 적혀 있어도 사이트가 협의라고 표기했으면 그게 정본이다.
	it("reads the negotiable unit image even when an amount is present", () => {
		const negotiable = detailHtml.replace(
			"WantMoneyArrImg2",
			"WantMoneyArrImg1"
		);

		expect(parseQueenalbaDetail(negotiable, "16100")?.payUnit).toBe("협의");
	});

	// 사이트가 단위를 늘리면 모르는 N이 온다. 그때는 텍스트 폴백에 맡긴다(금액만 있으므로 null).
	it("falls back to the text when the unit image is unknown", () => {
		const unknown = detailHtml.replace("WantMoneyArrImg2", "WantMoneyArrImg9");

		expect(parseQueenalbaDetail(unknown, "16100")?.payUnit).toBeNull();
	});

	it("keeps operator-only lead fields", () => {
		expect(record?.contactName).toBe("홍길동");
		expect(record?.contactKakao).toBe("kakaosample");
	});

	// 실물 다수는 "전화번호" 라벨에 직통 번호를 적어둔다. 콜핀 라벨만 찾던 예전 방식은
	// 그 라벨이 실물에 없어서 contactPhone이 전부 null이었다.
	it("reads the direct phone number from its label", () => {
		expect(record?.contactPhone).toBe("010-9876-5432");
	});

	// 마감일자 값에는 D-day 표기가 뒤에 붙는다("2026-08-05 D-12").
	it("reads the deadline, ignoring the d-day suffix", () => {
		expect(record?.sourceDeadlineAt?.toISOString()).toBe(
			"2026-08-05T00:00:00.000Z"
		);
	});

	// "정보없음"은 값이 아니라 값이 없다는 뜻이다.
	it("drops the placeholder text the site uses for empty fields", () => {
		expect(record?.workSchedule).toBeNull();
	});

	it("reads the posting date from the application period", () => {
		expect(record?.sourcePostedAt).toBeInstanceOf(Date);
	});

	it("masks contacts embedded in the body", () => {
		expect(record?.body ?? "").not.toMatch(PHONE_PATTERN);
	});

	it("returns null for a page that is not a listing", () => {
		expect(
			parseQueenalbaDetail("<html><body>없음</body></html>", "1")
		).toBeNull();
		expect(parseQueenalbaDetail(GATE_STUB, "1")).toBeNull();
	});
});

describe("parseQueenalbaDetail — 콜핀·이미지 본문", () => {
	const record = parseQueenalbaDetail(callpinDetailHtml, "36659");

	// 전화는 직통이 아니라 대표번호 + 내선(콜핀)이라, 안내 문구 자리에 핀을 끼워야 걸린다.
	it("composes the call-pin number", () => {
		expect(record?.contactPhone).toBe("1566-1945 + 0000");
	});

	// 카톡 칸이 비고 텔레그램에만 아이디를 남기는 공고가 흔하다. 버리면 연락 수단이 없어진다.
	it("falls back to another messenger id, labelled", () => {
		expect(record?.contactKakao).toBe("텔레그램 tgsample");
	});

	// 본문을 이미지로만 올리는 공고가 절반 이상이다. 파싱 실패로 보면 멀쩡한 회차가 중단된다.
	it("treats an image-only posting as a valid record with an empty body", () => {
		expect(record).not.toBeNull();
		expect(record?.body).toBe("");
	});

	// 단위 이미지가 없는 공고. 그때는 텍스트 판정으로 떨어지고, 금액을 읽었는데 단위 표기가
	// 없으면 "협의"가 아니라 모르는 것이므로 비운다.
	it("falls back to the text unit rules without a unit image", () => {
		expect(record?.payAmount).toBe(500_000);
		expect(record?.payUnit).toBeNull();
	});

	// 마감일자 행이 없는 공고도 있다.
	it("leaves the deadline null when the row is absent", () => {
		expect(record?.sourceDeadlineAt).toBeNull();
	});

	// 업종 매핑에 실패하면 버리지 않고 null로 남겨 수집기가 needs_review로 넣는다.
	it("leaves an unmappable industry null", () => {
		expect(record?.industryRaw).toBe("기타 - 기타업종");
		expect(record?.industryCategory).toBeNull();
	});
});

describe("parseQueenalbaCommunityList", () => {
	const topics = parseQueenalbaCommunityList(communityHtml);

	it("reads the topics of the board", () => {
		expect(topics.length).toBeGreaterThan(0);
		expect(topics[0]?.boardName).toBe("밤문화이야기");
		expect(topics[0]?.sourceExternalId).toMatch(COMMUNITY_ID_PATTERN);
		expect(topics[0]?.title.length).toBeGreaterThan(0);
	});

	// 일반 글은 댓글수 칸이 비어 있고 제목 뒤 "[21]"이 유일한 반응 지표다.
	it("reads the comment count from the title suffix and strips it", () => {
		const topic = topics.find(
			(row) => row.sourceExternalId === "comm_board2:1370389"
		);

		expect(topic?.commentCount).toBe(21);
		expect(topic?.title).toBe("일할때 술 안먹는 비결 알려주실 언니..");
	});

	// 상단 고정 공지는 운영자 안내문이고 조회수가 20만을 넘는다. 섞이면 상위권을 차지한다.
	it("skips pinned notices", () => {
		expect(topics.every((topic) => (topic.viewCount ?? 0) < 100_000)).toBe(
			true
		);
	});

	it("returns nothing for the gate stub", () => {
		expect(parseQueenalbaCommunityList(GATE_STUB)).toEqual([]);
	});
});

describe("parseQueenalbaCommunityDetail", () => {
	const detail = parseQueenalbaCommunityDetail(communityDetailHtml);

	// 본문·조회수는 목록에 없어 상세를 따로 받아야 나온다.
	it("reads the body and the view count the list does not show", () => {
		expect(detail).not.toBeNull();
		expect(detail?.body).toContain("저는 뭔 ㄴㄷ 다니는데도 술을 먹네요");
		expect(detail?.viewCount).toBe(2377);
	});

	// 조회수 칸에 추천 수가 같이 들어 있다("조회 : 2,377 추천: 1"). 라벨로 끊지 않으면 섞인다.
	it("does not read the recommend count as the view count", () => {
		expect(detail?.viewCount).not.toBe(1);
	});

	it("reads the post title, not the board name", () => {
		expect(detail?.title).toBe("일할때 술 안먹는 비결 알려주실 언니..");
	});

	// 커뮤니티 글도 본문에 번호·카톡을 그대로 박아둔다. 공고와 같은 기준으로 가린다.
	it("masks contacts embedded in the body", () => {
		expect(detail?.body).not.toContain("010-1234-5678");
		expect(detail?.body).toContain("[연락처 비공개]");
	});

	// 댓글창은 업소 홍보글이 대부분이라 주제 신호로 쓸모가 없고, 그만큼 남의 글을 더 복제한다.
	it("leaves comments out of the body", () => {
		expect(detail?.body).not.toContain("여의도 하퍼 오세요");
	});

	it("returns null for a deleted post or the gate stub", () => {
		expect(
			parseQueenalbaCommunityDetail("<html><body>없음</body></html>")
		).toBeNull();
		expect(parseQueenalbaCommunityDetail(GATE_STUB)).toBeNull();
	});
});

// 조회수 칸이 비는 글이 실측에서 흔했다. 본문이 있는데 조회수가 없다고 실패로 보면
// 멀쩡한 글을 매 회차 다시 받게 된다.
describe("parseQueenalbaCommunityDetail — 조회수 없는 글", () => {
	const detail = parseQueenalbaCommunityDetail(communityDetailNoViewsHtml);

	it("keeps the body and leaves the view count null", () => {
		expect(detail).not.toBeNull();
		expect(detail?.body.length).toBeGreaterThan(0);
		expect(detail?.viewCount).toBeNull();
	});
});

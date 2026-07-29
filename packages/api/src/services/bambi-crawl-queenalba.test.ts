import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
	isQueenalbaGateStub,
	parseQueenalbaCommunityList,
	parseQueenalbaDetail,
	parseQueenalbaList,
	queenalbaCommunityListUrl,
	queenalbaDetailUrl,
	queenalbaListUrl,
} from "./bambi-crawl-queenalba";

// 픽스처는 실제 응답을 개인정보(담당자 실명·연락처·메신저 아이디)만 치환해 저장한 것이다.
// 손으로 만든 HTML로는 셀렉터가 실제로 맞는지 검증할 수 없다 — 이 파일이 상대 마크업 변경을
// 감지하는 유일한 장치다.
const readFixture = (name: string): string =>
	readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

const listHtml = readFixture("queenalba-guin-list.html");
const detailHtml = readFixture("queenalba-guin-detail.html");
const callpinDetailHtml = readFixture("queenalba-guin-detail-callpin.html");
const communityHtml = readFixture("queenalba-bbs-list.html");

// 성인인증 게이트가 돌려주는 실제 응답 전문(116바이트).
const GATE_STUB = `<script type="text/javascript">
                document.location.replace("/adult_index.php");
            </script>`;

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

	// 게이트에 막힌 응답을 공고 0건으로 읽으면 수율 판정이 "셀렉터 파손"으로 오진한다.
	it("returns nothing for the gate stub", () => {
		expect(parseQueenalbaList(GATE_STUB)).toEqual([]);
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

	// 금액은 읽었는데 단위 표기가 없으면 "협의"가 아니라 모르는 것이다.
	it("leaves the pay unit empty when the source gives no unit", () => {
		expect(record?.payUnit).toBeNull();
	});

	it("keeps operator-only lead fields", () => {
		expect(record?.contactName).toBe("홍길동");
		expect(record?.contactKakao).toBe("kakaosample");
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

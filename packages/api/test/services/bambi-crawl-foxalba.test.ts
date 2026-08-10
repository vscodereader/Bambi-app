import { describe, expect, it } from "vitest";
import {
	foxalbaDetailHtml as detailHtml,
	FOXALBA_SAMPLE_ID,
	foxalbaListHtml as listHtml,
} from "@/services/__fixtures__/crawl-html";
import {
	foxalbaDetailUrl,
	foxalbaListUrl,
	parseFoxalbaDetail,
	parseFoxalbaList,
	parseFoxalbaTotalCount,
} from "@/services/bambi-crawl-foxalba";

const SAMPLE_ID = FOXALBA_SAMPLE_ID;

describe("foxalba urls", () => {
	it("omits the page parameter on the first page", () => {
		expect(foxalbaListUrl(1)).toBe("https://m.foxalba.com/all.asp");
		expect(foxalbaListUrl(3)).toBe("https://m.foxalba.com/all.asp?intpage=3");
	});

	it("builds a detail url from the list data-id", () => {
		expect(foxalbaDetailUrl(SAMPLE_ID)).toBe(
			`https://m.foxalba.com/view.asp?o_idx=${SAMPLE_ID}`
		);
	});
});

describe("parseFoxalbaList", () => {
	const items = parseFoxalbaList(listHtml);

	it("reads every listing on the page", () => {
		expect(items).toHaveLength(50);
		expect(items.every((item) => item.sourceExternalId.length > 0)).toBe(true);
		expect(items.every((item) => item.title.length > 0)).toBe(true);
	});

	it("reads the summary fields of a known listing", () => {
		const item = items.find((row) => row.sourceExternalId === SAMPLE_ID);

		expect(item).toBeDefined();
		expect(item?.title).toBe("★하남시 도우미 모집★");
		expect(item?.shopName).toBe("벤츠");
		// span.add는 &nbsp;(U+00A0)로 시/도와 시/군구를 잇는다. 정규화가 빠지면 여기서 깨진다.
		expect(item?.region).toBe("경기 하남시");
	});

	it("maps the pay unit from the icon class rather than text", () => {
		const item = items.find((row) => row.sourceExternalId === SAMPLE_ID);

		expect(item?.payText).toBe("60,000");
		expect(item?.payUnit).toBe("TC");
	});

	it("covers the negotiable and hourly icon variants too", () => {
		const units = new Set(items.map((item) => item.payUnit));

		expect(units).toContain("협의");
		expect(units).toContain("시급");
	});
});

describe("parseFoxalbaTotalCount", () => {
	it("reads the total so paging does not depend on the pager widget", () => {
		// 페이저는 앞쪽 5개와 "다음"만 노출해서 마지막 페이지를 알려주지 않는다.
		expect(parseFoxalbaTotalCount(listHtml)).toBe(3283);
	});

	it("returns null when the counter is missing", () => {
		expect(parseFoxalbaTotalCount("<html><body></body></html>")).toBeNull();
	});
});

describe("parseFoxalbaDetail", () => {
	const record = parseFoxalbaDetail(detailHtml, SAMPLE_ID);

	it("reads the title from the hidden div, not the JS-filled span", () => {
		// #spnTitle은 빈 채로 서빙되고 클라이언트 JS가 채운다. 거기서 읽으면 항상 빈 문자열이다.
		expect(record?.title).toBe("★하남시 도우미 모집★");
	});

	it("reads labeled fields by label text", () => {
		expect(record?.shopName).toBe("벤츠");
		expect(record?.industryRaw).toBe("노래주점");
		expect(record?.workSchedule).toBe("추후협의");
		expect(record?.gender).toBe("여");
		expect(record?.ageRange).toBe("20~49세");
	});

	it("splits the chip pairs into region and district", () => {
		expect(record?.region).toBe("경기");
		expect(record?.district).toBe("하남시");
	});

	it("keeps TC as the pay unit instead of forcing it into our five options", () => {
		// TC는 테이블당이라 "일급"으로 바꾸면 금액의 의미가 달라진다.
		expect(record?.payRaw).toBe("TC 60,000원");
		expect(record?.payUnit).toBe("TC");
		expect(record?.payAmount).toBe(60_000);
	});

	it("maps the source industry onto our fixed category enum", () => {
		expect(record?.industryCategory).toBe("노래주점");
	});

	it("reads the kakao id that sits as a bare text node", () => {
		// 값이 span으로 감싸여 있지 않고 "복사" 버튼이 뒤따른다. 값 전용 셀렉터로는 못 읽는다.
		expect(record?.contactKakao).toBe("testkakao");
	});

	it("collects operator-only lead fields", () => {
		expect(record?.contactName).toBe("홍길동");
		expect(record?.contactPhone).toBe("010-0000-0000");
		expect(record?.bizName).toBe("오페라노래");
		expect(record?.address).toContain("하남시");
	});

	it("masks contacts embedded in the body", () => {
		// 필드만 가리고 본문을 그대로 두면 아무것도 가린 게 아니다.
		expect(record?.body).toContain("초보 환영");
		expect(record?.body).not.toContain("010-1234-5678");
		expect(record?.body).not.toContain("shopkakao");
		expect(record?.body).toContain("[연락처 비공개]");
	});

	it("drops markup and external images from the body", () => {
		expect(record?.body).not.toContain("<font");
		expect(record?.body).not.toContain("fox2.kr");
	});

	it("returns null for a page that is not a listing detail", () => {
		// 삭제된 공고·오류 페이지·마크업 변경이 여기로 온다. null이라야 수집기의
		// 수율 판정에 실패로 잡혀 전량 만료 사고를 막는다.
		expect(
			parseFoxalbaDetail("<html><body>없음</body></html>", "x")
		).toBeNull();
	});
});

import { describe, expect, it } from "vitest";

import {
	type CrawledJobRecord,
	computeContentHash,
	mapIndustryCategory,
	maskContacts,
	NEGOTIABLE_PAY_UNIT,
	normalizeText,
	parsePay,
} from "./bambi-crawl-normalize";

const createRecord = (
	overrides: Partial<CrawledJobRecord> = {}
): CrawledJobRecord => ({
	address: null,
	ageRange: null,
	bizName: null,
	body: "본문",
	contactKakao: null,
	contactName: null,
	contactPhone: null,
	district: null,
	gender: null,
	industryCategory: null,
	industryRaw: null,
	payAmount: null,
	payRaw: null,
	payUnit: null,
	region: null,
	shopName: null,
	sourceDeadlineAt: null,
	sourceExternalId: "1",
	sourcePostedAt: null,
	sourceUrl: "https://example.test/1",
	title: "제목",
	workSchedule: null,
	...overrides,
});

describe("parsePay", () => {
	it("reads 만 notation as ten thousands with the matching unit", () => {
		expect(parsePay("일 15만원")).toEqual({ amount: 150_000, unit: "일급" });
		expect(parsePay("월급 500만원")).toEqual({
			amount: 5_000_000,
			unit: "월급",
		});
		expect(parsePay("시급 1.5만")).toEqual({ amount: 15_000, unit: "시급" });
	});

	it("reads plain won amounts with separators", () => {
		expect(parsePay("일급 150,000원")).toEqual({
			amount: 150_000,
			unit: "일급",
		});
	});

	it("takes the lower bound of a range so listings never overstate pay", () => {
		expect(parsePay("일 15~20만원")).toEqual({ amount: 150_000, unit: "일급" });
	});

	it("returns a null amount for negotiable pay instead of zero", () => {
		// 0으로 저장하면 목록에서 "무급"으로 읽히고 금액 정렬에서도 맨 아래로 밀린다.
		expect(parsePay("협의")).toEqual({
			amount: null,
			unit: NEGOTIABLE_PAY_UNIT,
		});
		expect(parsePay("면접 후 결정")).toEqual({
			amount: null,
			unit: NEGOTIABLE_PAY_UNIT,
		});
		expect(parsePay("")).toEqual({ amount: null, unit: NEGOTIABLE_PAY_UNIT });
		expect(parsePay(null)).toEqual({ amount: null, unit: NEGOTIABLE_PAY_UNIT });
	});
});

describe("mapIndustryCategory", () => {
	it("maps source job titles onto the fixed nine categories", () => {
		expect(mapIndustryCategory("룸살롱")).toBe("룸싸롱");
		expect(mapIndustryCategory("가라오케")).toBe("노래주점");
		expect(mapIndustryCategory("단란주점 홀서빙")).toBe("단란주점");
		expect(mapIndustryCategory("스웨디시 마사지")).toBe("마사지");
	});

	it("prefers the narrower category when both patterns match", () => {
		expect(mapIndustryCategory("텐프로 룸싸롱")).toBe("텐프로/쩜오");
	});

	// 원본이 "기타 - 기타업종"으로 내보내는 공고. 운영자 손을 안 거치고 기타로 들어가야 한다.
	it("maps the source's own catch-all onto 기타", () => {
		expect(mapIndustryCategory("기타 - 기타업종")).toBe("기타");
		expect(mapIndustryCategory("기타")).toBe("기타");
	});

	// 기타 규칙이 맨 끝인 근거. 구체 업종이 함께 적혀 있으면 그쪽이 이겨야 한다.
	it("prefers the specific category over 기타 when both appear", () => {
		expect(mapIndustryCategory("기타 룸싸롱")).toBe("룸싸롱");
		expect(mapIndustryCategory("기타 - 마사지")).toBe("마사지");
	});

	it("returns null for unmapped input so the row lands in needs_review", () => {
		// 버리면 공고가 조용히 사라진다. null로 남겨야 운영자가 손으로 이을 수 있다.
		expect(mapIndustryCategory("미분류업종")).toBeNull();
		expect(mapIndustryCategory("")).toBeNull();
		expect(mapIndustryCategory(null)).toBeNull();
	});
});

describe("maskContacts", () => {
	it("masks phone numbers regardless of separator", () => {
		expect(maskContacts("문의 010-1234-5678 주세요")).toBe(
			"문의 [연락처 비공개] 주세요"
		);
		expect(maskContacts("01012345678")).toBe("[연락처 비공개]");
		expect(maskContacts("02-123-4567")).toBe("[연락처 비공개]");
	});

	it("masks messenger ids", () => {
		expect(maskContacts("카톡 bambi123")).toBe("[연락처 비공개]");
		expect(maskContacts("카톡ID: shop_kr")).toBe("[연락처 비공개]");
	});

	it("leaves ordinary numbers alone", () => {
		// 급여·시간 숫자까지 지우면 본문이 못 읽게 된다.
		expect(maskContacts("일급 150,000원")).toBe("일급 150,000원");
		expect(maskContacts("근무 20시~05시")).toBe("근무 20시~05시");
	});
});

describe("normalizeText", () => {
	it("collapses whitespace so unchanged posts keep a stable hash", () => {
		expect(normalizeText("  제목 \r\n\r\n\r\n  본문   내용  ")).toBe(
			"제목\n\n본문 내용"
		);
	});
});

describe("computeContentHash", () => {
	it("stays the same when nothing meaningful changed", () => {
		expect(computeContentHash(createRecord())).toBe(
			computeContentHash(createRecord())
		);
	});

	it("changes when a tracked field changes", () => {
		expect(computeContentHash(createRecord({ title: "다른 제목" }))).not.toBe(
			computeContentHash(createRecord())
		);
	});

	it("ignores fields that the crawler derives rather than reads", () => {
		// payAmount·industryCategory는 원문이 아니라 우리 파싱 결과다. 파싱 규칙을 고쳤다고
		// 전체 행이 "변경됨"으로 뒤집히면 안 되므로 해시 재료에서 뺀다. 날짜 필드도 같은
		// 이유로 빼는데, 그래서 수집기가 해시 동일 분기에서 따로 백필한다.
		expect(
			computeContentHash(
				createRecord({
					industryCategory: "룸싸롱",
					payAmount: 150_000,
					sourceDeadlineAt: new Date("2026-08-05T00:00:00Z"),
				})
			)
		).toBe(computeContentHash(createRecord()));
	});
});

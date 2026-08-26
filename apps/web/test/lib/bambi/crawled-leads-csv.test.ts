import { describe, expect, it } from "vitest";

import {
	buildCrawledLeadsCsv,
	type CrawledLeadRow,
} from "@/lib/bambi/crawled-leads-csv";

const row = (overrides: Partial<CrawledLeadRow>): CrawledLeadRow => ({
	contactPhone: null,
	district: null,
	industryCategory: null,
	industryRaw: null,
	region: null,
	shopName: null,
	...overrides,
});

describe("buildCrawledLeadsCsv", () => {
	it("BOM·헤더·CRLF로 시작하고 행을 4컬럼으로 잇는다", () => {
		const csv = buildCrawledLeadsCsv([
			row({
				contactPhone: "010-1234-5678",
				district: "강남구",
				industryCategory: "룸싸롱",
				region: "서울",
				shopName: "밤비 라운지",
			}),
		]);

		expect(csv).toBe(
			"\uFEFF업소명,전화번호,지역,업종\r\n밤비 라운지,010-1234-5678,서울 강남구,룸싸롱\r\n"
		);
	});

	it("하이픈 없는 번호는 자리수에 맞게 하이픈을 넣는다(Excel 앞자리 0 보존)", () => {
		const lines = buildCrawledLeadsCsv([
			row({ contactPhone: "01012345678" }),
			row({ contactPhone: "0212345678" }),
			row({ contactPhone: "021234567" }),
			row({ contactPhone: "0311234567" }),
			row({ contactPhone: "15881234" }),
			// 패턴 밖 자리수·이미 서식 있는 값은 그대로 둔다
			row({ contactPhone: "12345" }),
			row({ contactPhone: "010.1234.5678" }),
		]).split("\r\n");

		expect(lines.slice(1, 8).map((line) => line.split(",")[1])).toEqual([
			"010-1234-5678",
			"02-1234-5678",
			"02-123-4567",
			"031-123-4567",
			"1588-1234",
			"12345",
			"010.1234.5678",
		]);
	});

	it("쉼표·따옴표·줄바꿈이 든 값은 따옴표로 감싼다", () => {
		const csv = buildCrawledLeadsCsv([
			row({ industryRaw: '유흥,"기타"', shopName: "가,나\n다" }),
		]);

		expect(csv.split("\r\n")[1]).toBe('"가,나\n다",,,"유흥,""기타"""');
	});

	it("업종은 분류값이 없으면 원본 문구로 폴백하고, 빈 값은 빈칸으로 남긴다", () => {
		const csv = buildCrawledLeadsCsv([
			row({ industryCategory: "마사지", industryRaw: "스웨디시" }),
			row({ industryRaw: "스웨디시" }),
			row({ region: "인천" }),
		]);

		const lines = csv.split("\r\n");
		expect(lines[1]).toBe(",,,마사지");
		expect(lines[2]).toBe(",,,스웨디시");
		expect(lines[3]).toBe(",,인천,");
	});
});

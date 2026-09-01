import { describe, expect, it } from "vitest";

import {
	buildMonthWeeks,
	formatPointAmount,
	formatPointDate,
	isAbsoluteIconUrl,
	isBenefitExpired,
	monthLabel,
	shiftMonth,
} from "./me-attendance";

describe("buildMonthWeeks", () => {
	it("1일이 일요일이고 28일인 달은 빈 칸 없이 4주로 떨어진다", () => {
		// 2026-02-01은 일요일이고 2026은 윤년이 아니라 28일이다.
		const weeks = buildMonthWeeks("2026-02");

		expect(weeks).toHaveLength(4);
		expect(weeks[0][0].date).toBe("2026-02-01");
		expect(weeks[3][6].date).toBe("2026-02-28");
		expect(weeks.every((week) => week.length === 7)).toBe(true);
	});

	it("31일 달은 마지막 주 뒤쪽을 빈 칸으로 채워 7칸을 유지한다", () => {
		// 2026-03-01도 일요일이라 앞 패딩은 없고 뒤에만 4칸이 남는다.
		const weeks = buildMonthWeeks("2026-03");

		expect(weeks).toHaveLength(5);
		expect(weeks.every((week) => week.length === 7)).toBe(true);
		expect(weeks[4][0].date).toBe("2026-03-29");
		expect(weeks[4].slice(3).every((cell) => cell.date === null)).toBe(true);
		// 빈 칸도 렌더 key가 서로 겹치지 않아야 한다.
		const keys = weeks.flat().map((cell) => cell.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("1일이 일요일이 아니면 앞쪽 빈 칸을 채운다", () => {
		// 2026-09-01은 화요일 → 일·월 두 칸이 비어야 한다.
		const [firstWeek] = buildMonthWeeks("2026-09");

		expect(firstWeek.slice(0, 2).every((cell) => cell.date === null)).toBe(
			true
		);
		expect(firstWeek[2].date).toBe("2026-09-01");
	});
});

describe("shiftMonth", () => {
	it("12월에서 앞으로 가면 다음 해 1월이 된다", () => {
		expect(shiftMonth("2026-12", 1)).toBe("2027-01");
		expect(shiftMonth("2026-01", -1)).toBe("2025-12");
	});
});

describe("monthLabel", () => {
	it("0을 떼고 한국어 월 표기로 만든다", () => {
		expect(monthLabel("2026-09")).toBe("2026년 9월");
	});
});

describe("formatPointAmount", () => {
	it("적립에만 + 접두를 붙이고 사용은 음수 그대로 둔다", () => {
		expect(formatPointAmount(1000)).toBe("+1,000P");
		expect(formatPointAmount(-500)).toBe("-500P");
		expect(formatPointAmount(0)).toBe("0P");
	});
});

describe("formatPointDate", () => {
	it("UTC 15시는 KST로 다음 날이다", () => {
		expect(formatPointDate("2026-08-31T15:00:00.000Z")).toBe("2026.09.01");
		expect(formatPointDate(new Date("2026-08-31T14:59:59.000Z"))).toBe(
			"2026.08.31"
		);
	});
});

describe("isBenefitExpired", () => {
	it("기한이 지났으면 만료, 무기한(null)은 만료가 아니다", () => {
		expect(isBenefitExpired(new Date(Date.now() - 1000))).toBe(true);
		expect(isBenefitExpired(null)).toBe(false);
	});

	it("아직 남은 기한은 만료가 아니다", () => {
		expect(
			isBenefitExpired(new Date(Date.now() + 60 * 60 * 1000).toISOString())
		).toBe(false);
	});
});

describe("isAbsoluteIconUrl", () => {
	it("절대 URL만 통과시킨다", () => {
		expect(
			isAbsoluteIconUrl("https://storage.googleapis.com/bucket/icon.gif")
		).toBe(true);
	});

	it("웹 오리진 상대 경로는 거른다", () => {
		// builtin 아이콘·개발 폴백은 apps/web 자산이라 native가 가리킬 곳이 없다.
		expect(isAbsoluteIconUrl("/grade-icons/vip-v2.gif")).toBe(false);
		expect(isAbsoluteIconUrl("/bambi/local-grade-icons?key=a%2Fb.gif")).toBe(
			false
		);
	});

	it("null·undefined는 거른다", () => {
		expect(isAbsoluteIconUrl(null)).toBe(false);
		expect(isAbsoluteIconUrl(undefined)).toBe(false);
	});
});

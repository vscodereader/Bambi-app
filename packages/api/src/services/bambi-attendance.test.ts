import { describe, expect, it } from "vitest";

import {
	countAttendanceStreak,
	getKstDateString,
	shiftKstDate,
} from "./bambi-attendance";

describe("bambi attendance KST 날짜", () => {
	it("UTC가 아니라 서울 달력일을 돌려준다", () => {
		// 2026-08-06T15:30Z = 2026-08-07 00:30 KST — 서울에서는 이미 다음 날이다.
		expect(getKstDateString(new Date("2026-08-06T15:30:00.000Z"))).toBe(
			"2026-08-07"
		);
		// 2026-08-06T14:59Z = 2026-08-06 23:59 KST — 아직 같은 날이다.
		expect(getKstDateString(new Date("2026-08-06T14:59:00.000Z"))).toBe(
			"2026-08-06"
		);
	});

	it("월·연 경계를 넘겨 날짜를 이동한다", () => {
		expect(shiftKstDate("2026-08-01", -1)).toBe("2026-07-31");
		expect(shiftKstDate("2026-01-01", -1)).toBe("2025-12-31");
		expect(shiftKstDate("2026-02-28", 1)).toBe("2026-03-01");
		expect(shiftKstDate("2026-08-06", 0)).toBe("2026-08-06");
	});
});

describe("bambi attendance 연속 출석일", () => {
	it("오늘로 끝나는 연속 구간을 센다", () => {
		expect(
			countAttendanceStreak(
				["2026-08-06", "2026-08-05", "2026-08-04"],
				"2026-08-06"
			)
		).toBe(3);
	});

	it("오늘 출석 전에도 어제까지의 연속은 살아 있다", () => {
		expect(
			countAttendanceStreak(["2026-08-05", "2026-08-04"], "2026-08-06")
		).toBe(2);
	});

	it("마지막 출석이 그저께 이전이면 0이다", () => {
		expect(countAttendanceStreak(["2026-08-03"], "2026-08-06")).toBe(0);
	});

	it("첫 구멍에서 멈춘다", () => {
		expect(
			countAttendanceStreak(
				["2026-08-06", "2026-08-05", "2026-08-03"],
				"2026-08-06"
			)
		).toBe(2);
	});

	it("기록이 없으면 0이다", () => {
		expect(countAttendanceStreak([], "2026-08-06")).toBe(0);
	});
});

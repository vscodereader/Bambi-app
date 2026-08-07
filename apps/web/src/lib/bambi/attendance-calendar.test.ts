import { describe, expect, it } from "vitest";

import { buildMonthGrid, shiftMonth } from "./attendance-calendar";

describe("attendance calendar", () => {
	it("연 경계를 넘겨 달을 이동한다", () => {
		expect(shiftMonth("2026-01", -1)).toBe("2025-12");
		expect(shiftMonth("2026-12", 1)).toBe("2027-01");
		expect(shiftMonth("2026-08", 0)).toBe("2026-08");
	});

	it("일요일 시작 그리드에 선행 공백 칸을 넣는다", () => {
		// 2026-08-01은 토요일이라 앞에 빈 칸 6개가 붙는다(31일 + 6 = 37칸).
		const cells = buildMonthGrid("2026-08");

		expect(cells).toHaveLength(37);
		expect(cells.slice(0, 6).every((cell) => cell.date === null)).toBe(true);
		expect(cells[6]?.date).toBe("2026-08-01");
		expect(cells.at(-1)?.date).toBe("2026-08-31");
	});

	it("1일이 일요일이면 선행 공백이 없다", () => {
		// 2026-02-01은 일요일, 2026년은 윤년이 아니라 28일이다.
		const cells = buildMonthGrid("2026-02");

		expect(cells).toHaveLength(28);
		expect(cells[0]?.date).toBe("2026-02-01");
		expect(cells.at(-1)?.date).toBe("2026-02-28");
	});

	it("모든 칸의 key가 유일하다", () => {
		const cells = buildMonthGrid("2026-08");

		expect(new Set(cells.map((cell) => cell.key)).size).toBe(cells.length);
	});
});

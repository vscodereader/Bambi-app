import { describe, expect, it } from "vitest";
import { resolveAttendanceRewardRun } from "../../src/services/bambi-attendance";

describe("resolveAttendanceRewardRun", () => {
	it("earns one claim on seven consecutive eligible dates", () => {
		const dates = [
			"2026-08-12",
			"2026-08-13",
			"2026-08-14",
			"2026-08-15",
			"2026-08-16",
			"2026-08-17",
			"2026-08-18",
		];
		expect(resolveAttendanceRewardRun(dates, "2026-08-18")).toEqual({
			endOn: "2026-08-18",
			entitledClaims: 1,
			length: 7,
			startOn: "2026-08-12",
		});
	});

	it("earns repeated claims at fourteen days", () => {
		const dates = Array.from({ length: 14 }, (_, index) => {
			const day = String(index + 1).padStart(2, "0");
			return `2026-08-${day}`;
		});
		expect(
			resolveAttendanceRewardRun(dates, "2026-08-14")?.entitledClaims
		).toBe(2);
	});

	it("resets at a missing day", () => {
		const dates = ["2026-08-01", "2026-08-02", "2026-08-04", "2026-08-05"];
		expect(resolveAttendanceRewardRun(dates, "2026-08-05")?.length).toBe(2);
	});

	it("can build a historical run from restored eligible dates", () => {
		const dates = [
			"2025-01-01",
			"2025-01-02",
			"2025-01-03",
			"2025-01-04",
			"2025-01-05",
			"2025-01-06",
			"2025-01-07",
		];
		expect(
			resolveAttendanceRewardRun(dates, "2025-01-07")?.entitledClaims
		).toBe(1);
	});
});

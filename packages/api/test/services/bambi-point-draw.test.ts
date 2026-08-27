import { describe, expect, it } from "vitest";
import {
	formatProbabilityPercent,
	parseProbabilityPercent,
	resolvePrizeProbabilities,
	selectProbabilityPrize,
	TOTAL_PROBABILITY_UNITS,
} from "../../src/services/bambi-point-draw";

const prizes = [
	{
		appliedProbabilityUnits: 1,
		id: "a",
		points: 1000,
		probabilityUnits: 1,
	},
	{
		appliedProbabilityUnits: TOTAL_PROBABILITY_UNITS - 1,
		id: "b",
		points: 10,
		probabilityUnits: TOTAL_PROBABILITY_UNITS - 1,
	},
];

describe("point draw probabilities", () => {
	it("parses and formats percentage input without floating-point rounding", () => {
		expect(parseProbabilityPercent("0.0001")).toBe(100);
		expect(formatProbabilityPercent(100)).toBe("0.0001");
		expect(parseProbabilityPercent("33.333333")).toBe(33_333_333);
		expect(parseProbabilityPercent("0.0000001")).toBeNull();
	});

	it("keeps fixed probabilities and evenly shares the remainder", () => {
		const resolved = resolvePrizeProbabilities([
			{ id: "fixed", points: 1000, probabilityUnits: 100 },
			{ id: "auto-a", points: 10, probabilityUnits: null },
			{ id: "auto-b", points: 20, probabilityUnits: null },
			{ id: "auto-c", points: 30, probabilityUnits: null },
		]);
		expect(resolved.map((prize) => prize.appliedProbabilityUnits)).toEqual([
			100, 33_333_300, 33_333_300, 33_333_300,
		]);
		expect(
			resolved.reduce((sum, prize) => sum + prize.appliedProbabilityUnits, 0)
		).toBe(TOTAL_PROBABILITY_UNITS);
	});

	it("assigns indivisible remainder units to the last automatic prize", () => {
		const resolved = resolvePrizeProbabilities([
			{ id: "auto-a", points: 10, probabilityUnits: null },
			{ id: "auto-b", points: 20, probabilityUnits: null },
			{ id: "auto-c", points: 30, probabilityUnits: null },
		]);
		expect(resolved.map((prize) => prize.appliedProbabilityUnits)).toEqual([
			33_333_333, 33_333_333, 33_333_334,
		]);
	});

	it("selects exact cumulative boundaries", () => {
		expect(selectProbabilityPrize(prizes, 0).id).toBe("a");
		expect(selectProbabilityPrize(prizes, 1).id).toBe("b");
		expect(selectProbabilityPrize(prizes, TOTAL_PROBABILITY_UNITS - 1).id).toBe(
			"b"
		);
	});

	it("rejects an out-of-range offset", () => {
		expect(() =>
			selectProbabilityPrize(prizes, TOTAL_PROBABILITY_UNITS)
		).toThrow("난수 범위");
	});

	it("rejects fixed probabilities that do not total 100%", () => {
		expect(() =>
			resolvePrizeProbabilities([
				{ id: "a", points: 10, probabilityUnits: 50_000_000 },
			])
		).toThrow("합계는 100%");
	});
});

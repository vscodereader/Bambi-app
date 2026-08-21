import { describe, expect, it } from "vitest";
import {
	selectWeightedPrize,
	sumPrizeWeights,
} from "../../src/services/bambi-point-draw";

const prizes = [
	{ id: "a", points: 10, weight: 2 },
	{ id: "b", points: 100, weight: 3 },
];

describe("selectWeightedPrize", () => {
	it("selects exact cumulative boundaries", () => {
		expect(selectWeightedPrize(prizes, 0).id).toBe("a");
		expect(selectWeightedPrize(prizes, 1).id).toBe("a");
		expect(selectWeightedPrize(prizes, 2).id).toBe("b");
		expect(selectWeightedPrize(prizes, 4).id).toBe("b");
	});

	it("rejects an out-of-range offset", () => {
		expect(() => selectWeightedPrize(prizes, 5)).toThrow("난수 범위");
	});

	it("sums configured weights", () => {
		expect(sumPrizeWeights(prizes)).toBe(5);
	});
});

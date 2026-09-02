import { describe, expect, it } from "vitest";
import {
	groupDetailMediaBySlice,
	planDetailSlices,
} from "@/lib/bambi/detail-image-slicing";

describe("planDetailSlices", () => {
	it("임계값 이하는 자르지 않는다", () => {
		expect(planDetailSlices(3500, 3500)).toEqual([]);
		expect(planDetailSlices(100, 3500)).toEqual([]);
	});

	it("임계값을 넘으면 균등 조각으로 나누고 합이 원본 높이와 같다", () => {
		const plans = planDetailSlices(6000, 3500);

		expect(plans).toHaveLength(2);
		expect(plans.map((p) => p.height).reduce((a, b) => a + b, 0)).toBe(6000);
		expect(plans.map((p) => p.index)).toEqual([0, 1]);
		// offsetY는 앞 조각들의 높이 누적이어야 한다.
		expect(plans[0].offsetY).toBe(0);
		expect(plans[1].offsetY).toBe(plans[0].height);
	});

	it("모든 조각이 maxHeight 이하다", () => {
		for (const height of [3501, 4097, 7000, 8000, 20_000]) {
			const plans = planDetailSlices(height, 3500);

			expect(plans.length).toBeGreaterThan(0);
			for (const plan of plans) {
				expect(plan.height).toBeLessThanOrEqual(3500);
			}
			expect(plans.map((p) => p.height).reduce((a, b) => a + b, 0)).toBe(
				height
			);
		}
	});

	it("나머지를 앞 조각에 분배해 조각 간 높이 차가 1 이하다", () => {
		const plans = planDetailSlices(8000, 3500); // 3조각
		const heights = plans.map((p) => p.height);

		expect(heights).toHaveLength(3);
		expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
	});
});

describe("groupDetailMediaBySlice", () => {
	const media = (
		storageKey: string,
		sliceGroupId?: string,
		sliceIndex?: number
	) => ({ sliceGroupId, sliceIndex, storageKey });

	it("비-슬라이스는 각각 단독 그룹", () => {
		const groups = groupDetailMediaBySlice([media("a"), media("b")]);

		expect(groups).toHaveLength(2);
		expect(groups[0]).toHaveLength(1);
		expect(groups[1]).toHaveLength(1);
	});

	it("같은 그룹 id는 한 그룹으로 묶고 sliceIndex 순으로 정렬한다", () => {
		const groups = groupDetailMediaBySlice([
			media("a1", "g", 1),
			media("a0", "g", 0),
		]);

		expect(groups).toHaveLength(1);
		expect(groups[0].map((m) => m.storageKey)).toEqual(["a0", "a1"]);
	});

	it("그룹 위치는 첫 조각의 등장 순서를 따른다", () => {
		const groups = groupDetailMediaBySlice([
			media("solo"),
			media("g0", "g", 0),
			media("g1", "g", 1),
		]);

		expect(groups).toHaveLength(2);
		expect(groups[0][0].storageKey).toBe("solo");
		expect(groups[1].map((m) => m.storageKey)).toEqual(["g0", "g1"]);
	});
});

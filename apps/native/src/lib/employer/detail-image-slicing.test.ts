import { describe, expect, it } from "vitest";

import { toSliceCropRegions } from "./detail-image-slicing";

describe("toSliceCropRegions", () => {
	it("계획을 crop 사각형으로 옮긴다", () => {
		const regions = toSliceCropRegions(1000, 8000, 3500);

		expect(regions).toHaveLength(3);
		expect(regions[0]).toEqual({
			height: regions[0].height,
			originX: 0,
			originY: 0,
			sliceIndex: 0,
			width: 1000,
		});
		expect(regions[1].originY).toBe(regions[0].height);
		expect(regions[2].sliceIndex).toBe(2);
	});

	it("자를 필요가 없으면 빈 배열", () => {
		expect(toSliceCropRegions(1000, 2000, 3500)).toEqual([]);
	});
});

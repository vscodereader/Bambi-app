import { describe, expect, it } from "vitest";

import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import { buildJobUpdateData } from "@/src/lib/employer/job-update";

const base: NativeJobPostInput = {
	description: "충분히 긴 상세 설명",
	industryCategory: "BAR",
	organizationId: "o1",
	payAmount: 12_000,
	payUnit: "시급",
	regionCode: "1111000000",
	title: "공고",
	workSchedule: "주 5일",
};

describe("buildJobUpdateData", () => {
	it("광고가 없는 공고(adProductId null)는 입력을 그대로 둔다", () => {
		const result = buildJobUpdateData(base, {
			adProductId: null,
			exposureAmount: null,
			exposureDurationDays: null,
			paymentMethod: null,
		});

		expect(result.adProductId).toBeUndefined();
		expect(result).toEqual(base);
	});

	it("광고가 붙은 공고는 광고 4필드를 패스스루한다", () => {
		const result = buildJobUpdateData(base, {
			adProductId: "ad1",
			exposureAmount: 50_000,
			exposureDurationDays: 30,
			paymentMethod: "card",
		});

		expect(result.adProductId).toBe("ad1");
		expect(result.exposureDurationDays).toBe(30);
		expect(result.exposureAmount).toBe(50_000);
		expect(result.paymentMethod).toBe("card");
		// 표준 필드는 보존
		expect(result.title).toBe("공고");
	});
});

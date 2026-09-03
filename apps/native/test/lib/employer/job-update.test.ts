import { describe, expect, it } from "vitest";

import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";
import { buildJobUpdateData } from "@/src/lib/employer/job-update";

const banner = (storageKey: string): JobMediaUploadItem => ({
	altText: "",
	byteSize: 10,
	fileName: "b.gif",
	mimeType: "image/gif",
	storageKey,
});

const adSource = {
	adProductId: "ad1",
	exposureAmount: 50_000,
	exposureDurationDays: 30,
	paymentMethod: "card" as const,
};

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

	it("배너(가로·세로)가 있으면 media에 실어 보존한다(GIF mime 유지)", () => {
		const result = buildJobUpdateData(
			{ ...base, media: { detail: [] } },
			adSource,
			{ adHorizontal: banner("h"), adVertical: banner("v") }
		);

		expect(result.media?.adHorizontal?.storageKey).toBe("h");
		expect(result.media?.adVertical?.storageKey).toBe("v");
		expect(result.media?.adHorizontal?.mimeType).toBe("image/gif");
	});

	it("배너가 없으면 media에 배너 키를 넣지 않는다", () => {
		const result = buildJobUpdateData(
			{ ...base, media: { detail: [] } },
			adSource,
			{ adHorizontal: null, adVertical: null }
		);

		expect(result.media && "adHorizontal" in result.media).toBe(false);
		expect(result.media && "adVertical" in result.media).toBe(false);
	});
});

import { describe, expect, it } from "vitest";

import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import { createEmptyBannerLayout } from "@/src/lib/employer/ad-banner-layout";
import { buildJobUpdateData, type EditableAdSource } from "./job-update";

const input: NativeJobPostInput = {
	description: "상세 설명입니다.",
	industryCategory: "룸싸롱",
	organizationId: "org1",
	payAmount: 3000,
	payUnit: "시급",
	regionCode: "1111000000",
	title: "홀 서빙",
	workSchedule: "평일 저녁",
};

// 유료 광고 공고(수정 시 광고 4필드를 되돌려 보내는 경로).
const editable: EditableAdSource = {
	adProductId: "p1",
	exposureAmount: 330_000,
	exposureDurationDays: 30,
	paymentMethod: "bank_transfer",
};

describe("buildJobUpdateData 상세 디자인", () => {
	it("상세 디자인을 안 건드렸으면 키를 보내지 않는다", () => {
		const data = buildJobUpdateData(input, editable, undefined, {
			detailDesignPrice: 50_000,
			nextRequested: true,
			previousRequested: true,
		});

		expect("detailDesignRequested" in data).toBe(false);
		expect("detailDesignAmount" in data).toBe(false);
	});

	it("신청을 켰으면 값과 가격을 함께 보낸다", () => {
		const data = buildJobUpdateData(input, editable, undefined, {
			detailDesignPrice: 50_000,
			nextRequested: true,
			previousRequested: false,
		});

		expect(data.detailDesignRequested).toBe(true);
		expect(data.detailDesignAmount).toBe(50_000);
	});

	it("신청을 껐으면 false를 보낸다", () => {
		const data = buildJobUpdateData(input, editable, undefined, {
			detailDesignPrice: 50_000,
			nextRequested: false,
			previousRequested: true,
		});

		expect(data.detailDesignRequested).toBe(false);
	});
});

describe("buildJobUpdateData 배너 레이아웃", () => {
	it("바뀐 경우에만 adBannerLayout을 싣는다", () => {
		const layout = createEmptyBannerLayout();

		const unchanged = buildJobUpdateData(
			input,
			editable,
			undefined,
			undefined,
			{ changed: false, next: layout }
		);
		expect("adBannerLayout" in unchanged).toBe(false);

		const changed = buildJobUpdateData(input, editable, undefined, undefined, {
			changed: true,
			next: layout,
		});
		expect(changed.adBannerLayout).toBe(layout);
	});
});

describe("buildJobUpdateData 광고 필드 보존", () => {
	it("인자를 안 넘기면 광고 4필드만 되돌려 보낸다", () => {
		const data = buildJobUpdateData(input, editable);

		expect(data.adProductId).toBe("p1");
		expect(data.exposureAmount).toBe(330_000);
		expect("detailDesignRequested" in data).toBe(false);
		expect("adBannerLayout" in data).toBe(false);
	});
});

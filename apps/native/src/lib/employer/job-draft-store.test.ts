import { afterEach, describe, expect, it } from "vitest";

import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import { withSlotBackground } from "@/src/lib/employer/ad-banner-layout";
import type { NativeExposureState } from "@/src/lib/employer/ad-exposure";
import {
	buildDraftSubmission,
	emptyJobDraft,
	getJobDraft,
	hasMissingRequiredBanners,
	type JobBannerMedia,
	resetJobDraft,
	setJobDraft,
} from "./job-draft-store";

const baseInput: NativeJobPostInput = {
	description: "설명입니다 설명입니다",
	industryCategory: "룸싸롱",
	media: { cover: { storageKey: "cover" } as never, detail: [] },
	organizationId: "org-1",
	payAmount: 15_000,
	payUnit: "시급",
	regionCode: "1111000000",
	title: "제목",
	workSchedule: "주 3일",
};

const paidExposure: NativeExposureState = {
	detailDesignAmount: null,
	detailDesignRequested: false,
	paymentMethod: "bank_transfer",
	pointsToUse: 5000,
	selection: {
		adProductId: "p1",
		amount: 330_000,
		durationDays: 30,
		previewTemplate: "premium-top",
		productName: "프리미엄",
	},
};

const banners: JobBannerMedia = {
	adHorizontal: { storageKey: "h" } as never,
	adVertical: { storageKey: "v" } as never,
};

afterEach(() => {
	resetJobDraft();
});

describe("emptyJobDraft", () => {
	it("무료·무통장입금·포인트 0의 빈 초안이다", () => {
		expect(emptyJobDraft()).toEqual({
			base: null,
			banners: {},
			bannerLayout: null,
			exposure: {
				detailDesignAmount: null,
				detailDesignRequested: false,
				paymentMethod: "bank_transfer",
				pointsToUse: 0,
				selection: null,
			},
		});
	});
});

describe("buildDraftSubmission", () => {
	it("무료 선택이면 base를 그대로 둔다(배너·결제 필드 없음)", () => {
		const free = emptyJobDraft().exposure;

		expect(buildDraftSubmission(baseInput, free, banners, null)).toEqual(
			baseInput
		);
	});

	it("유료 선택이면 노출·결제 필드와 배너를 media에 병합하고 cover/detail은 보존한다", () => {
		const result = buildDraftSubmission(baseInput, paidExposure, banners, null);

		expect(result.adProductId).toBe("p1");
		expect(result.exposureAmount).toBe(330_000);
		expect(result.exposureDurationDays).toBe(30);
		expect(result.paymentMethod).toBe("bank_transfer");
		expect(result.pointsToUse).toBe(5000);
		expect(result.media?.cover).toEqual(baseInput.media?.cover);
		expect(result.media?.detail).toEqual([]);
		expect(result.media?.adHorizontal).toEqual(banners.adHorizontal);
		expect(result.media?.adVertical).toEqual(banners.adVertical);
		// 레이아웃을 안 만졌으면 키를 생략한다(서버 기본 = 이미지 배경).
		expect("adBannerLayout" in result).toBe(false);
	});

	it("상세 디자인을 신청하면 값과 가격을 함께 싣는다", () => {
		const result = buildDraftSubmission(
			baseInput,
			{
				...paidExposure,
				detailDesignAmount: 50_000,
				detailDesignRequested: true,
			},
			banners,
			null
		);

		expect(result.detailDesignRequested).toBe(true);
		expect(result.detailDesignAmount).toBe(50_000);
	});

	it("배너 레이아웃을 만졌으면 adBannerLayout을 싣는다", () => {
		const layout = withSlotBackground(null, "ad_horizontal", {
			color: "#1f2937",
			type: "color",
		});
		const result = buildDraftSubmission(
			baseInput,
			paidExposure,
			banners,
			layout
		);

		expect(result.adBannerLayout).toBe(layout);
	});
});

describe("hasMissingRequiredBanners", () => {
	const required = ["ad_horizontal", "ad_vertical"] as const;

	it("유료인데 필수 배너가 비면 true다", () => {
		expect(
			hasMissingRequiredBanners(
				paidExposure,
				{ adHorizontal: banners.adHorizontal },
				required,
				null
			)
		).toBe(true);
	});

	it("유료라도 필수 배너를 모두 채우면 false다", () => {
		expect(
			hasMissingRequiredBanners(paidExposure, banners, required, null)
		).toBe(false);
	});

	it("무료(선택 없음)면 요구 슬롯과 무관하게 false다", () => {
		expect(
			hasMissingRequiredBanners(emptyJobDraft().exposure, {}, required, null)
		).toBe(false);
	});

	// 단색 배경 슬롯은 이미지가 없어도 통과한다 — 이미지가 빈 세로형만 남으면 그것만 막는다.
	it("단색 배경 슬롯은 이미지 없이도 통과다", () => {
		const layout = withSlotBackground(null, "ad_horizontal", {
			color: "#1f2937",
			type: "color",
		});

		expect(
			hasMissingRequiredBanners(
				paidExposure,
				{ adVertical: banners.adVertical },
				required,
				layout
			)
		).toBe(false);
	});
});

describe("store", () => {
	it("setJobDraft는 직전 값을 받아 갱신하고, reset은 빈 초안으로 되돌린다", () => {
		setJobDraft((prev) => ({ ...prev, base: baseInput }));
		expect(getJobDraft().base).toEqual(baseInput);

		setJobDraft((prev) => ({ ...prev, exposure: paidExposure }));
		expect(getJobDraft().base).toEqual(baseInput);
		expect(getJobDraft().exposure).toEqual(paidExposure);

		resetJobDraft();
		expect(getJobDraft()).toEqual(emptyJobDraft());
	});
});

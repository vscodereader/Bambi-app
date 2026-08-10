import { describe, expect, it } from "vitest";
import { createEmptyAdBannerLayout } from "@/lib/bambi/ad-banner-layout";
import { emptyJobForm, validateJobForm } from "@/lib/bambi-job-form";

const baseForm = {
	...emptyJobForm,
	description: "상세 설명 열 글자 이상.",
	industryCategory: "BAR",
	organizationId: "o1",
	payAmount: "20000",
	payUnit: "시급",
	// 지역 마스터 코드(서울 / 강남구). 실제 존재 여부는 서버가 대조하므로 폼 검증은
	// 선택 여부만 본다.
	regionCode: "1100000000",
	teamId: "",
	title: "공고",
	workSchedule: "협의",
};

const options = { teamScopes: [{ organizationId: "o1", teamId: "" }] };

describe("validateJobForm 세부지역", () => {
	it("세부지역 미선택은 통과하고 districtCode를 싣지 않는다(= 지역 전체)", () => {
		const result = validateJobForm({ ...baseForm, districtCode: "" }, options);

		expect(result.ok).toBe(true);
		expect(result.ok && result.input.districtCode).toBeUndefined();
	});

	it("districtCode를 고르면 input에 실린다", () => {
		const result = validateJobForm(
			{ ...baseForm, districtCode: "1168000000" },
			options
		);

		expect(result.ok && result.input.districtCode).toBe("1168000000");
	});
});

describe("validateJobForm 급여 협의", () => {
	it("협의 단위는 금액이 비어도 통과하고 payAmount를 null로 싣는다", () => {
		const result = validateJobForm(
			{ ...baseForm, payAmount: "", payUnit: "협의" },
			options
		);

		expect(result.ok && result.input.payAmount).toBeNull();
	});

	it("협의 단위에 금액이 남아 있어도 저장하지 않는다", () => {
		const result = validateJobForm(
			{ ...baseForm, payAmount: "20000", payUnit: "협의" },
			options
		);

		expect(result.ok && result.input.payAmount).toBeNull();
	});

	it("금액 단위는 금액이 비면 여전히 실패한다", () => {
		const result = validateJobForm(
			{ ...baseForm, payAmount: "", payUnit: "시급" },
			options
		);

		expect(result.ok).toBe(false);
	});

	it("목록에 없는 급여 단위는 걸러진다", () => {
		const result = validateJobForm({ ...baseForm, payUnit: "연봉" }, options);

		expect(result.ok).toBe(false);
	});
});

describe("validateJobForm taxonomy 화이트리스트", () => {
	// 지역 코드가 실제 지역인지(존재·활성·소속)는 서버가 마스터와 대조한다. 폼은
	// 미선택만 막는다 — 여기서 빠지면 시/도 없는 공고가 그대로 제출된다.
	it("지역 미선택은 걸러진다", () => {
		const result = validateJobForm({ ...baseForm, regionCode: "" }, options);

		expect(result.ok).toBe(false);
	});

	it("목록에 없는 업종은 걸러진다", () => {
		const result = validateJobForm(
			{ ...baseForm, industryCategory: "노래방바" },
			options
		);

		expect(result.ok).toBe(false);
	});
});

describe("validateJobForm 프리미엄 광고 필수 배너", () => {
	// 규격에 맞는 배너 아이템(형식·크기·비율 통과). 필수 검사만 보려는 픽스처.
	const horizontalItem = {
		altText: "",
		byteSize: 1000,
		fileName: "h.png",
		height: 600,
		mimeType: "image/png",
		width: 1400,
	};
	const verticalItem = {
		altText: "",
		byteSize: 1000,
		fileName: "v.png",
		height: 900,
		mimeType: "image/png",
		width: 400,
	};
	const paidForm = {
		...baseForm,
		adProductId: "premium-1",
		exposureDurationDays: 7,
		exposureType: "premium-banner" as const,
		paymentMethod: "card" as const,
	};
	const requiredBannerUsages = ["ad_horizontal", "ad_vertical"] as const;

	it("유료 + 두 종 필수인데 이미지가 없으면 media 오류로 실패한다", () => {
		const result = validateJobForm(paidForm, {
			...options,
			requiredBannerUsages: [...requiredBannerUsages],
		});

		expect(result.ok).toBe(false);
		expect(!result.ok && result.errors.media).toBe(
			"프리미엄 광고는 가로형·세로형 광고 배너 이미지를 모두 등록해야 합니다."
		);
	});

	it("가로형만 있으면 세로형 누락으로 실패한다", () => {
		const result = validateJobForm(paidForm, {
			...options,
			media: {
				adHorizontal: horizontalItem,
				adVertical: null,
				cover: null,
				detail: [],
			},
			requiredBannerUsages: [...requiredBannerUsages],
		});

		expect(result.ok).toBe(false);
		expect(!result.ok && result.errors.media).toBe(
			"프리미엄 광고는 가로형·세로형 광고 배너 이미지를 모두 등록해야 합니다."
		);
	});

	it("가로형·세로형을 모두 등록하면 통과한다", () => {
		const result = validateJobForm(paidForm, {
			...options,
			media: {
				adHorizontal: horizontalItem,
				adVertical: verticalItem,
				cover: null,
				detail: [],
			},
			requiredBannerUsages: [...requiredBannerUsages],
		});

		expect(result.ok).toBe(true);
	});

	it("무료(adProductId null)면 필수 배너가 있어도 통과한다", () => {
		const result = validateJobForm(
			{ ...baseForm, adProductId: null },
			{
				...options,
				requiredBannerUsages: [...requiredBannerUsages],
			}
		);

		expect(result.ok).toBe(true);
	});

	// 단색 배경 슬롯은 업로드 이미지가 렌더러의 색에 완전히 덮여 화면에 나오지 않는다.
	// 그래서 이미지를 요구하지 않는다 — 요구하면 단색을 고른 구인자가 저장할 방법이 없다.
	const colorBackground = { color: "#1f2937", type: "color" } as const;
	const withColorSlots = (...slots: ("horizontal" | "vertical")[]) => {
		const layout = createEmptyAdBannerLayout();

		for (const slot of slots) {
			layout[slot].background = colorBackground;
		}

		return layout;
	};

	it("두 슬롯 모두 단색 배경이면 이미지 없이도 통과한다", () => {
		const result = validateJobForm(
			{ ...paidForm, adBannerLayout: withColorSlots("horizontal", "vertical") },
			{ ...options, requiredBannerUsages: [...requiredBannerUsages] }
		);

		expect(result.ok).toBe(true);
	});

	it("한 슬롯만 단색이면 나머지 슬롯 이미지는 여전히 필수다", () => {
		const result = validateJobForm(
			{ ...paidForm, adBannerLayout: withColorSlots("horizontal") },
			{ ...options, requiredBannerUsages: [...requiredBannerUsages] }
		);

		expect(result.ok).toBe(false);
		expect(!result.ok && result.errors.media).toBe(
			"프리미엄 광고는 가로형·세로형 광고 배너 이미지를 모두 등록해야 합니다."
		);
	});

	it("단색 슬롯은 이미지가 남아 있어도 비율·최소 크기로 막지 않는다", () => {
		// 단색을 고른 뒤 규격 밖 이미지가 남아 있으면, 보이지도 않는 이미지 때문에
		// "비율이 규격과 크게 달라 등록할 수 없습니다"로 또 막히는 막다른 길이 된다.
		const result = validateJobForm(
			{ ...paidForm, adBannerLayout: withColorSlots("horizontal", "vertical") },
			{
				...options,
				media: {
					adHorizontal: { ...horizontalItem, height: 100, width: 100 },
					adVertical: null,
					cover: null,
					detail: [],
				},
				requiredBannerUsages: [...requiredBannerUsages],
			}
		);

		expect(result.ok).toBe(true);
	});

	it("배경이 이미지인 슬롯은 규격 밖 이미지를 여전히 반려한다", () => {
		// 종전 동작 보존.
		const result = validateJobForm(
			{ ...paidForm, adBannerLayout: createEmptyAdBannerLayout() },
			{
				...options,
				media: {
					adHorizontal: { ...horizontalItem, height: 100, width: 100 },
					adVertical: verticalItem,
					cover: null,
					detail: [],
				},
				requiredBannerUsages: [...requiredBannerUsages],
			}
		);

		expect(result.ok).toBe(false);
	});

	it("레이아웃이 null이면 종전대로 두 이미지가 모두 필수다", () => {
		const result = validateJobForm(
			{ ...paidForm, adBannerLayout: null },
			{ ...options, requiredBannerUsages: [...requiredBannerUsages] }
		);

		expect(result.ok).toBe(false);
	});
});

describe("validateJobForm 상세이미지 디자인 제작 애드온", () => {
	const addonForm = {
		...baseForm,
		adProductId: "premium-1",
		exposureAmount: 50_000,
		exposureDurationDays: 30,
		paymentMethod: "bank_transfer" as const,
	};

	it("유료 상품에 옵션을 신청하면 신청 여부와 금액을 그대로 넘긴다", () => {
		const result = validateJobForm(
			{ ...addonForm, detailDesignAmount: 30_000, detailDesignRequested: true },
			options
		);

		expect(result.ok).toBe(true);
		expect(result.ok && result.input.detailDesignRequested).toBe(true);
		expect(result.ok && result.input.detailDesignAmount).toBe(30_000);
	});

	it("무료 공고(상품 미선택)면 옵션 값을 모두 비운다", () => {
		const result = validateJobForm(
			{
				...addonForm,
				adProductId: null,
				detailDesignAmount: 30_000,
				detailDesignRequested: true,
				exposureAmount: null,
				exposureDurationDays: null,
				paymentMethod: null,
			},
			options
		);

		expect(result.ok).toBe(true);
		expect(result.ok && result.input.detailDesignRequested).toBe(false);
		expect(result.ok && result.input.detailDesignAmount).toBeNull();
	});

	it("신청하지 않으면 금액이 남아 있어도 싣지 않는다", () => {
		const result = validateJobForm(
			{
				...addonForm,
				detailDesignAmount: 30_000,
				detailDesignRequested: false,
			},
			options
		);

		expect(result.ok && result.input.detailDesignAmount).toBeNull();
	});
});

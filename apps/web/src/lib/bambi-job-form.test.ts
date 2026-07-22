import { describe, expect, it } from "vitest";
import { emptyJobForm, validateJobForm } from "./bambi-job-form";

const baseForm = {
	...emptyJobForm,
	description: "상세 설명 열 글자 이상.",
	industryCategory: "클럽",
	organizationId: "o1",
	payAmount: "20000",
	payUnit: "시급",
	region: "서울",
	teamId: "",
	title: "공고",
	workSchedule: "협의",
};

const options = { teamScopes: [{ organizationId: "o1", teamId: "" }] };

describe("validateJobForm 세부지역", () => {
	it("세부지역 있는 시/도에서 district 비면 검증 실패", () => {
		const result = validateJobForm({ ...baseForm, district: "" }, options);

		expect(result.ok).toBe(false);
	});

	it("세부지역 없는 시/도는 district 비어도 통과", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "", region: "기타" },
			options
		);

		expect(result.ok).toBe(true);
	});

	it("district를 입력하면 통과하고 input에 실린다", () => {
		const result = validateJobForm({ ...baseForm, district: "강남" }, options);

		expect(result.ok && result.input.district).toBe("강남");
	});
});

describe("validateJobForm 급여 협의", () => {
	it("협의 단위는 금액이 비어도 통과하고 payAmount를 null로 싣는다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "강남", payAmount: "", payUnit: "협의" },
			options
		);

		expect(result.ok && result.input.payAmount).toBeNull();
	});

	it("협의 단위에 금액이 남아 있어도 저장하지 않는다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "강남", payAmount: "20000", payUnit: "협의" },
			options
		);

		expect(result.ok && result.input.payAmount).toBeNull();
	});

	it("금액 단위는 금액이 비면 여전히 실패한다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "강남", payAmount: "", payUnit: "시급" },
			options
		);

		expect(result.ok).toBe(false);
	});

	it("목록에 없는 급여 단위는 걸러진다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "강남", payUnit: "연봉" },
			options
		);

		expect(result.ok).toBe(false);
	});
});

describe("validateJobForm taxonomy 화이트리스트", () => {
	// 구 표기 공고를 수정 폼에서 열면 Select가 빈칸이 되는데, 길이만 검사하면
	// 그대로 재저장돼 지역 필터에 영영 걸리지 않는다.
	it("구 taxonomy 지역 값은 걸러진다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "", region: "서울 강남구" },
			options
		);

		expect(result.ok).toBe(false);
	});

	it("목록에 없는 업종은 걸러진다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "강남", industryCategory: "노래방바" },
			options
		);

		expect(result.ok).toBe(false);
	});

	it("선택한 시/도에 속하지 않는 세부지역은 걸러진다", () => {
		const result = validateJobForm(
			{ ...baseForm, district: "해운대", region: "서울" },
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
		district: "강남",
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
			{ ...baseForm, district: "강남", adProductId: null },
			{
				...options,
				requiredBannerUsages: [...requiredBannerUsages],
			}
		);

		expect(result.ok).toBe(true);
	});
});

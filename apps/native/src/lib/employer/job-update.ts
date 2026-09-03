import type { NativeJobPostInput } from "@/src/lib/bambi-native";

// getEditableById가 내려주는 공고 행에서 광고 축만 좁힌 것.
export interface EditableAdSource {
	adProductId: null | string;
	exposureAmount: null | number;
	exposureDurationDays: null | number;
	paymentMethod: null | string;
}

/**
 * 수정 payload를 만든다. native는 광고 상품을 편집하지 않지만, 서버 update는 jobPostInput
 * 전체를 받고 resolveJobPostExposure(data.adProductId)가 adProductId를 안 보내면 노출을
 * "standard"로 되돌려 유료 광고를 무료로 강등하고 결제 상태를 미결제로 리셋한다. 그래서
 * web에서 만든 광고 공고를 native에서 수정할 때는 광고 4필드(adProductId·기간·금액·결제수단)를
 * getEditableById 값 그대로 되돌려 보낸다. adBannerLayout·boostOptionTypes·detailDesignRequested는
 * 키를 생략하면 서버가 기존 값을 보존하므로 보내지 않는다.
 */
export const buildJobUpdateData = (
	input: NativeJobPostInput,
	editable: EditableAdSource
): NativeJobPostInput => {
	if (!editable.adProductId) {
		return input;
	}

	return {
		...input,
		adProductId: editable.adProductId,
		exposureAmount: editable.exposureAmount,
		exposureDurationDays: editable.exposureDurationDays,
		paymentMethod:
			editable.paymentMethod === "bank_transfer" ||
			editable.paymentMethod === "card"
				? editable.paymentMethod
				: null,
	};
};

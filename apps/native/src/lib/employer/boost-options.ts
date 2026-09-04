import { AD_BANNER_EXPOSURE_TYPES } from "@bambi-app/api/services/bambi-ad-exposure";
import type { JobBoostOptionTypeKey } from "@bambi-app/api/services/bambi-job-boost";

// jobs.getEditableById가 내려주는 구매 요약의 최소 형태.
export interface BoostPurchaseSummary {
	amount: number;
	id: string;
	optionType: JobBoostOptionTypeKey;
	paymentStatus: string;
	purchaseSource: string;
}

// 배너 광고 공고는 서버가 옵션 판매 자체를 거부한다(BANNER_REJECT_MESSAGE).
// 구매 검증의 정본은 서버지만, 진입 버튼은 열어 둘 이유가 없어 여기서 감춘다.
export const canOpenBoostPurchase = (exposureType: string): boolean =>
	!(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType);

// 취소 버튼을 붙일 구매 = 미결제 + 단독 구매. 공고 등록과 함께 산 건(purchaseSource !==
// "standalone")은 서버가 취소를 거부하므로 목록에 올리지 않는다.
export const getCancelableBoostPurchases = (
	purchases: BoostPurchaseSummary[] | undefined
): BoostPurchaseSummary[] =>
	(purchases ?? []).filter(
		(purchase) =>
			purchase.paymentStatus === "unpaid" &&
			purchase.purchaseSource === "standalone"
	);

export const canSubmitBoostPurchase = ({
	isPending,
	paymentMethod,
	selectedType,
}: {
	isPending: boolean;
	paymentMethod: string;
	selectedType: JobBoostOptionTypeKey | null;
}): boolean =>
	selectedType !== null && paymentMethod === "bank_transfer" && !isPending;

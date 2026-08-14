// GA4 프로모션 계측 헬퍼 — 자체 결제 프리미엄·스페셜·추천 광고의 노출/클릭을
// view_promotion / select_promotion 이벤트로 보낸다.
// gtag는 프로덕션 레이아웃(app/layout.tsx)에서만 로드되므로 없으면 전부 no-op —
// 로컬·프리뷰·GA 차단 브라우저에서 앱 동작에 영향이 없다.

import { sendGaEvent } from "./ga";

export interface PromotionBanner {
	company?: string;
	crawled?: boolean;
	id: string;
	title: string;
}

export interface PromotionDefinition {
	id: string;
	name: string;
}

export const PREMIUM_PROMOTION = {
	id: "premium-banner",
	name: "프리미엄 배너",
} as const satisfies PromotionDefinition;

export const SPECIAL_PROMOTION = {
	id: "special-list",
	name: "스페셜 채용",
} as const satisfies PromotionDefinition;

export const RECOMMENDED_PROMOTION = {
	id: "recommended-list",
	name: "추천 채용",
} as const satisfies PromotionDefinition;

// 기존 테스트·호출부가 참조하는 이름은 프리미엄 정의에서 파생해 유지한다.
export const PREMIUM_PROMOTION_ID = PREMIUM_PROMOTION.id;
export const PREMIUM_PROMOTION_NAME = PREMIUM_PROMOTION.name;

// 계측 대상 판정 — 빈 슬롯(null)과 크롤링 채움 배너는 이벤트를 보내지 않는다.
export const shouldTrackPromotion = (
	item: PromotionBanner | null | undefined
): item is PromotionBanner => Boolean(item && !item.crawled);

// GA 스펙상 creative_slot 등 프로모션 파라미터는 item 레벨이 이벤트 레벨을
// 덮어쓰므로 슬롯 구분은 item 레벨에 싣는다. index는 0-base 슬롯 순번.
export const buildPromotionParams = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number,
	promotion: PromotionDefinition = PREMIUM_PROMOTION
): Record<string, unknown> => ({
	items: [
		{
			creative_slot: creativeSlot,
			index,
			...(item.company ? { item_brand: item.company } : {}),
			item_id: item.id,
			item_name: item.title,
			promotion_id: promotion.id,
			promotion_name: promotion.name,
		},
	],
	promotion_id: promotion.id,
	promotion_name: promotion.name,
});

const sendPromotionEvent = (
	eventName: "select_promotion" | "view_promotion",
	item: PromotionBanner,
	creativeSlot: string,
	index: number,
	promotion: PromotionDefinition
): void => {
	// 게이트(shouldTrackPromotion)를 안 거친 미래 콜사이트 방어 — 크롤링 배너는 계측 제외.
	if (item.crawled) {
		return;
	}
	sendGaEvent(
		eventName,
		buildPromotionParams(item, creativeSlot, index, promotion)
	);
};

export const trackPromotionView = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number,
	promotion: PromotionDefinition = PREMIUM_PROMOTION
): void =>
	sendPromotionEvent("view_promotion", item, creativeSlot, index, promotion);

export const trackPromotionSelect = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number,
	promotion: PromotionDefinition = PREMIUM_PROMOTION
): void =>
	sendPromotionEvent("select_promotion", item, creativeSlot, index, promotion);

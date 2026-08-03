// GA4 프로모션 계측 헬퍼 — 순수(자체 결제) 프리미엄 배너의 노출/클릭을
// view_promotion / select_promotion 이벤트로 보낸다(이슈 #59).
// gtag는 프로덕션 레이아웃(app/layout.tsx)에서만 로드되므로 없으면 전부 no-op —
// 로컬·프리뷰·GA 차단 브라우저에서 앱 동작에 영향이 없다.

export interface PromotionBanner {
	crawled: boolean;
	id: string;
	title: string;
}

export const PREMIUM_PROMOTION_ID = "premium-banner";
export const PREMIUM_PROMOTION_NAME = "프리미엄 배너";

type GtagFn = (
	command: "event",
	eventName: string,
	params: Record<string, unknown>
) => void;

const getGtag = (): GtagFn | null => {
	if (typeof window === "undefined") {
		return null;
	}
	const gtag = (window as { gtag?: unknown }).gtag;
	return typeof gtag === "function" ? (gtag as GtagFn) : null;
};

// 계측 대상 판정 — 빈 슬롯(null)과 크롤링 채움 배너는 이벤트를 보내지 않는다.
export const shouldTrackPromotion = (
	item: PromotionBanner | null | undefined
): item is PromotionBanner => Boolean(item && !item.crawled);

// GA 스펙상 creative_slot 등 프로모션 파라미터는 item 레벨이 이벤트 레벨을
// 덮어쓰므로 슬롯 구분은 item 레벨에 싣는다. index는 0-base 슬롯 순번.
export const buildPromotionParams = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number
): Record<string, unknown> => ({
	items: [
		{
			creative_slot: creativeSlot,
			index,
			item_id: item.id,
			item_name: item.title,
		},
	],
	promotion_id: PREMIUM_PROMOTION_ID,
	promotion_name: PREMIUM_PROMOTION_NAME,
});

const sendPromotionEvent = (
	eventName: "select_promotion" | "view_promotion",
	item: PromotionBanner,
	creativeSlot: string,
	index: number
): void => {
	// 게이트(shouldTrackPromotion)를 안 거친 미래 콜사이트 방어 — 크롤링 배너는 계측 제외.
	if (item.crawled) {
		return;
	}
	const gtag = getGtag();
	if (!gtag) {
		return;
	}
	try {
		gtag("event", eventName, buildPromotionParams(item, creativeSlot, index));
	} catch {
		// 계측 실패가 렌더·내비게이션을 깨면 안 된다.
	}
};

export const trackPromotionView = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number
): void => sendPromotionEvent("view_promotion", item, creativeSlot, index);

export const trackPromotionSelect = (
	item: PromotionBanner,
	creativeSlot: string,
	index: number
): void => sendPromotionEvent("select_promotion", item, creativeSlot, index);

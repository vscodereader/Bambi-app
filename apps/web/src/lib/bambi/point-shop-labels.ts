// 라벨은 packages/api로 옮겨 native와 공유한다 — web 호출부 import 경로는 유지.
// biome-ignore lint/performance/noBarrelFile: 정본(packages/api) 이전에 따른 경로 호환용 재수출.
export {
	pointShopAudienceLabel,
	pointShopBenefitTypeLabel,
	pointShopBuyerStatusLabel,
	pointShopOrderStatusLabel,
} from "@bambi-app/api/services/bambi-point-shop-labels";

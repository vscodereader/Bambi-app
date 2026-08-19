// 포인트몰 주문 상태(bambi_point_shop_order.status) 표시 라벨. 원값 화면 노출 금지 —
// 표시 텍스트 전용, 필터 값·API 입력은 원값 유지(moderation-labels.ts 관례).
const POINT_SHOP_ORDER_STATUS_LABELS: Record<string, string> = {
	canceled: "취소·환불",
	completed: "지급 완료",
	pending: "처리 대기",
};

export function pointShopOrderStatusLabel(status: string): string {
	return POINT_SHOP_ORDER_STATUS_LABELS[status] ?? "상태 확인 필요";
}

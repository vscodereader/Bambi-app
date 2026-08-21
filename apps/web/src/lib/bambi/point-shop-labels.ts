// 포인트몰 주문 상태(bambi_point_shop_order.status) 표시 라벨. 원값 화면 노출 금지 —
// 표시 텍스트 전용, 필터 값·API 입력은 원값 유지(moderation-labels.ts 관례).
// 운영자용(처리 대기 등)과 구매자용(주문완료 등)을 분리한다 — 같은 status라도
// 화면 주체에 따라 문구가 다르다(spec §6 라벨 맵 분리).
const POINT_SHOP_ORDER_STATUS_LABELS: Record<string, string> = {
	canceled: "취소·환불",
	completed: "지급 완료",
	owned: "보유 중",
	pending: "처리 대기",
	used: "사용 완료",
};

export function pointShopOrderStatusLabel(status: string): string {
	return POINT_SHOP_ORDER_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 구매자 화면(보유함·구매 내역)용 라벨. pending은 구매자 시점에서 "주문완료"로 읽힌다.
const POINT_SHOP_BUYER_STATUS_LABELS: Record<string, string> = {
	canceled: "취소·환불",
	completed: "지급완료",
	owned: "보유 중",
	pending: "주문완료",
	used: "사용 완료",
};

export function pointShopBuyerStatusLabel(status: string): string {
	return POINT_SHOP_BUYER_STATUS_LABELS[status] ?? "상태 확인 필요";
}

// 혜택 유형(point_shop_benefit_type) 라벨. 카드·다이얼로그·운영자 폼 공용.
const POINT_SHOP_BENEFIT_TYPE_LABELS: Record<string, string> = {
	ad_extend: "광고 기간 연장",
	attendance_restore_ticket: "출석 복구권",
	boost_auto_period: "자동 끌어올리기(기간)",
	boost_manual_count: "끌어올리기 횟수권",
	boost_manual_period: "끌어올리기(기간)",
	coupon: "쿠폰 발송",
	draw_ticket: "포인트 랜덤 뽑기권",
	none: "직접 지급",
};

export function pointShopBenefitTypeLabel(benefitType: string): string {
	return POINT_SHOP_BENEFIT_TYPE_LABELS[benefitType] ?? "혜택 확인 필요";
}

// 구매 자격 대상(point_shop_audience) 라벨. 운영자 폼·목록 공용(enum 원값 노출 금지).
const POINT_SHOP_AUDIENCE_LABELS: Record<string, string> = {
	all: "전체 회원",
	employer: "구인 회원",
	job_seeker: "구직 회원",
};

export function pointShopAudienceLabel(audience: string): string {
	return POINT_SHOP_AUDIENCE_LABELS[audience] ?? "대상 확인 필요";
}

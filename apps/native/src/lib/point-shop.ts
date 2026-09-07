// 포인트몰 화면의 표시 판정. 구매 가부의 정본은 서버 pointShop.purchase(계정 락 안에서
// 재검증)이고, 여기서는 같은 순수 함수 resolvePurchase를 불러 사유 코드만 문구로 바꾼다 —
// 판정 규칙을 native에 복제하지 않는다(web PurchaseDialogBody와 같은 결론, 로직은 공유).
import {
	isUsableBenefit,
	type PointShopAudience,
	type PointShopBenefitType,
	resolveOrderCancellation,
	resolvePurchase,
} from "@bambi-app/api/services/bambi-point-shop-rules";

export type PurchaseMode =
	| "audience"
	| "buy"
	| "identity"
	| "insufficient"
	| "soldout";

export const pointText = (points: number): string =>
	`${points.toLocaleString("ko-KR")}P`;

// balance=null은 잔액 조회 전/실패다 — 0P로 오판해 막지 않고 서버 판정에 맡긴다.
export function resolvePurchaseMode(args: {
	audience: PointShopAudience;
	balance: null | number;
	benefitType: PointShopBenefitType;
	isPhoneVerified: boolean;
	pricePoints: number;
	role: string;
	soldOut: boolean;
}): PurchaseMode {
	const verdict = resolvePurchase({
		audience: args.audience,
		balance: args.balance ?? Number.POSITIVE_INFINITY,
		benefitType: args.benefitType,
		isActive: true,
		isPhoneVerified: args.isPhoneVerified,
		pricePoints: args.pricePoints,
		role: args.role,
		soldOut: args.soldOut,
	});
	if (verdict.ok) {
		return "buy";
	}
	// inactive는 목록(listItems가 isActive만 내려줌)에 없다 — 방어적으로 품절 취급.
	return verdict.code === "inactive" ? "soldout" : verdict.code;
}

const audienceRoleLabel = (audience: string): string =>
	audience === "job_seeker" ? "구직 회원" : "구인 회원";

export function purchaseBlockMessage(
	mode: PurchaseMode,
	audience: string
): null | string {
	switch (mode) {
		case "soldout":
			return "지금은 품절된 아이템이에요.";
		case "audience":
			return `${audienceRoleLabel(audience)} 전용 혜택이에요.`;
		case "identity":
			return "본인인증을 완료하면 구매할 수 있어요.";
		case "insufficient":
			return "포인트가 부족해요.";
		default:
			return null;
	}
}

export function benefitNoticeMessage(item: {
	benefitType: PointShopBenefitType;
	usageLimitDays: null | number;
}): string {
	if (isUsableBenefit(item.benefitType)) {
		const limit =
			item.usageLimitDays === null
				? "구매 후 보유함에서 기한 없이 사용할 수 있어요. "
				: `구매 후 ${item.usageLimitDays}일 이내에 보유함에서 사용해야 하며, 기한이 지나면 소멸돼요(환불 불가). `;
		return `${limit}사용 후에는 취소·환불이 불가하고, 사용 전에는 취소·환불할 수 있어요.`;
	}
	if (item.benefitType === "coupon") {
		return "본인인증 시 등록된 휴대폰 번호로 발송돼요. 지급완료 전에는 취소·환불할 수 있어요.";
	}
	return "운영자가 확인한 뒤 순서대로 지급해요. 지급완료 전에는 취소·환불할 수 있어요.";
}

export const canCancelOrder = (
	order: {
		benefitType: PointShopBenefitType;
		status: string;
		usableUntil: Date | null;
		usedAt: Date | null;
	},
	now: Date
): boolean =>
	resolveOrderCancellation({
		benefitType: order.benefitType,
		now,
		status: order.status,
		usableUntil: order.usableUntil,
		usedAt: order.usedAt,
	}).ok;

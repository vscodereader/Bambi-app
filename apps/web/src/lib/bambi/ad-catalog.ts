import type { AppRouterClient } from "@bambi-app/api/routers/index";
// 할인가 계산의 단일 소스(순수·무 import 모듈). 서버 스냅샷도 같은 함수로 계산해
// 웹 미리보기 금액과 서버 저장 금액이 어긋나지 않는다.
import { discountedAdAmount } from "@bambi-app/api/services/bambi-ad-pricing";

// oRPC 반환 타입에서 카탈로그 타입 파생(단일 소스).
export type AdCatalogPlacement = Awaited<
	ReturnType<AppRouterClient["bambi"]["adProducts"]["getCatalog"]>
>[number];
export type AdCatalogProduct = AdCatalogPlacement["products"][number];

const wonFormatter = new Intl.NumberFormat("ko-KR");

export function formatAdPrice(amount: number): string {
	return `${wonFormatter.format(amount)}원`;
}

export function formatAdDuration(days: number): string {
	return `${days}일`;
}

// 할인 표시용 파생값. discountPercent가 0이거나 계산 결과가 원가와 같으면 hasDiscount=false.
export interface AdPriceDisplay {
	amount: number;
	discountedAmount: number;
	discountPercent: number;
	hasDiscount: boolean;
}

export function resolveAdPrice(
	amount: number,
	discountPercent: number
): AdPriceDisplay {
	const percent =
		discountPercent > 0 ? Math.min(100, Math.floor(discountPercent)) : 0;
	const discountedAmount = discountedAdAmount(amount, percent);

	return {
		amount,
		discountPercent: percent,
		discountedAmount,
		hasDiscount: percent > 0 && discountedAmount < amount,
	};
}

// Select 트리거처럼 문자열만 받는 곳의 라벨. 할인 시 할인가 + "N% 할인"을 병기한다
// (취소선은 문자열로 표현할 수 없어 값 표기로 대체).
export function formatAdPriceLabel(
	amount: number,
	discountPercent: number
): string {
	const price = resolveAdPrice(amount, discountPercent);

	return price.hasDiscount
		? `${formatAdPrice(price.discountedAmount)} (${price.discountPercent}% 할인)`
		: formatAdPrice(amount);
}

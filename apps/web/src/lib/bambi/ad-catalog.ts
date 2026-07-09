import type { AppRouterClient } from "@bambi-app/api/routers/index";

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

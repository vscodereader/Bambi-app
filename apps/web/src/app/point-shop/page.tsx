import type { Metadata } from "next";
import { PointShopScreen } from "@/components/bambi/point-shop/point-shop-screen";

// 포인트몰은 비로그인도 목록을 볼 수 있는 공개 경로지만 검색 유입 가치가 없어
// 색인하지 않는다. 링크 따라가기는 허용해 크롤이 여기서 끊기지 않게 한다.
export const metadata: Metadata = {
	robots: { index: false, follow: true },
};

export default function PointShopPage() {
	return <PointShopScreen />;
}

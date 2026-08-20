// 누적 광고일수 등급 아이콘 — 카드 배지·운영자 설정·구인자 안내가 공유한다.
// 운영자가 올린 이미지가 있으면 이미지가 이기고, 없으면 프리셋(메달·왕관)을 그린다.

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import { CrownIcon, MedalIcon } from "@/components/bambi/icons";
import type { AdPeriodTier } from "@/lib/bambi/ad-period";

// 16px 자리에 그리지만 고해상도 화면에서 뭉개지지 않게 2배로 요청한다.
const ICON_RENDER_PX = 32;

export function AdPeriodTierIcon({
	className,
	icon,
	iconImageUrl,
}: {
	className?: string;
	icon: AdPeriodTier["icon"];
	iconImageUrl?: null | string;
}) {
	if (iconImageUrl) {
		return (
			<Image
				// 등급명이 항상 옆에 붙어 있어(배지·목록·안내 전부) 아이콘은 장식이다.
				alt=""
				className={cn("size-4 shrink-0 object-contain", className)}
				height={ICON_RENDER_PX}
				src={iconImageUrl}
				// GIF 애니메이션을 살리려면 필수 — next/image 최적화기를 거치면 정지 이미지가 된다.
				unoptimized
				width={ICON_RENDER_PX}
			/>
		);
	}

	return (
		<span className={cn("inline-flex size-4 shrink-0", className)}>
			{icon === "crown" ? <CrownIcon /> : <MedalIcon />}
		</span>
	);
}

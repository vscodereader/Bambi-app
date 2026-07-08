"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Badge, Card } from "./ds";

interface AdBannerProps {
	className?: string;
	label?: string;
}

// 세로형 광고 배너 목업 — 공고 카드와 유사한 폭(w-[236px]).
// 이미지 없이 색/텍스트 플레이스홀더로 광고 자리만 표시한다.
export function AdBanner({ className, label = "광고" }: AdBannerProps) {
	return (
		<Card
			className={cn("flex w-[236px] flex-col gap-3 rounded-lg", className)}
			pad="md"
			tone="outline"
		>
			<Badge className="self-start" tone="neutral">
				{label}
			</Badge>
			<div className="flex aspect-[3/4] w-full items-center justify-center rounded-md bg-secondary">
				<span className="font-bold text-muted-foreground text-xs">
					광고 배너
				</span>
			</div>
			<div className="flex flex-col gap-1">
				<span className="font-extrabold text-sm">스폰서 광고</span>
				<span className="text-muted-foreground text-xs">
					이곳에 광고가 노출됩니다.
				</span>
			</div>
		</Card>
	);
}

// 목업 배너 슬롯 id — 배열 인덱스 key 대신 안정 키로 사용.
const AD_RAIL_SLOTS = ["ad-1", "ad-2", "ad-3"] as const;

interface AdBannerRailProps {
	className?: string;
	count?: number;
}

// 세로 배너 여러 개를 스택으로 묶고 sticky로 스크롤을 따라오게 한다.
// 데스크톱 전용 노출(hidden 등)은 사용처에서 className으로 제어한다.
export function AdBannerRail({ className, count = 2 }: AdBannerRailProps) {
	const slots = AD_RAIL_SLOTS.slice(0, count);
	return (
		<div className={cn("sticky top-20 flex flex-col gap-4", className)}>
			{slots.map((slot) => (
				<AdBanner key={slot} />
			))}
		</div>
	);
}

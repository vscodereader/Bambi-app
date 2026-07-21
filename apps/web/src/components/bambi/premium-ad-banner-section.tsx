"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";
import { AdSlotPlaceholder, HorizontalAdBanner } from "./ad-banner";
import { Badge } from "./ds";

const PREMIUM_COLUMNS = 2;
const PREMIUM_PLACEHOLDER_KEYS = ["premium-slot-1", "premium-slot-2"] as const;

// 목록 상단 프리미엄 광고 섹션. 결제완료된 프리미엄 배너 공고를 한 행 2열(모바일 1열)로
// 배치한다. 판매분이 없어도 섹션을 렌더하고, 2열 기준 마지막 행의 빈 칸을 "광고 모집중"
// 자리표시로 채운다(0개면 2개).
export function PremiumAdBannerSection({
	className,
	items,
}: {
	className?: string;
	items: AdBannerItem[];
}) {
	// 마지막 행 빈 칸 수: 0개면 한 행(2개), 그 외엔 2열 나머지를 채운다.
	const emptyCount =
		items.length === 0
			? PREMIUM_COLUMNS
			: (PREMIUM_COLUMNS - (items.length % PREMIUM_COLUMNS)) % PREMIUM_COLUMNS;
	const placeholderKeys = PREMIUM_PLACEHOLDER_KEYS.slice(0, emptyCount);
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
			</div>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{items.map((item) => (
					<HorizontalAdBanner item={item} key={item.id} />
				))}
				{placeholderKeys.map((key) => (
					<AdSlotPlaceholder className="flex aspect-[7/3] w-full" key={key} />
				))}
			</div>
		</section>
	);
}

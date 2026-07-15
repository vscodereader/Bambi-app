"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";
import { HorizontalAdBanner } from "./ad-banner";
import { Badge } from "./ds";

// 목록 상단 프리미엄 광고 섹션. 결제완료된 프리미엄 배너 공고를 공고 카드와 동일한
// 반응형 그리드(xl 4열)로 배치한다. 판매분이 없으면 섹션 자체를 숨긴다.
export function PremiumAdBannerSection({
	className,
	items,
}: {
	className?: string;
	items: AdBannerItem[];
}) {
	if (items.length === 0) {
		return null;
	}
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
			</div>
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((item) => (
					<HorizontalAdBanner item={item} key={item.id} />
				))}
			</div>
		</section>
	);
}

"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";
import { AdSlotPlaceholder, HorizontalAdBanner } from "./ad-banner";
import { Badge } from "./ds";

const PREMIUM_PLACEHOLDER_KEYS = ["premium-slot-1", "premium-slot-2"] as const;

// 목록 상단 프리미엄 광고 섹션. 서버가 고정 길이 2칸 배열을 내려주고, 화면 전체에서 광고는
// 언제나 딱 한 칸에만 노출되므로 이 두 칸도 활성 칸(non-null)만 배너, 나머지는 자리표시다
// (1행 2열, 모바일 1열). 로딩 중에는 스켈레톤을, 로드 후 null인 칸은 자리표시로 채운다.
export function PremiumAdBannerSection({
	className,
	isLoading,
	items,
}: {
	className?: string;
	// 로딩 중이면 슬롯을 스켈레톤으로 채운다 — 광고 있는 칸도 응답 대기 동안 문의 배너가
	// 번쩍이는 걸 막는다(로딩 vs "광고 없음" 구분은 useAdBannerJobs.isLoading).
	isLoading?: boolean;
	items: (AdBannerItem | null)[];
}) {
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
			</div>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{PREMIUM_PLACEHOLDER_KEYS.map((key, index) => {
					if (isLoading) {
						return (
							<Skeleton className="aspect-[7/3] w-full rounded-lg" key={key} />
						);
					}
					const item = items[index];
					return item ? (
						<HorizontalAdBanner item={item} key={item.id} />
					) : (
						<AdSlotPlaceholder className="flex aspect-[7/3] w-full" key={key} />
					);
				})}
			</div>
		</section>
	);
}

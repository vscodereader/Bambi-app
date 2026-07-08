"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Badge, Card } from "./ds";

// 상단 프리미엄 슬롯 id — 안정 key.
const PREMIUM_SLOTS = ["premium-1", "premium-2", "premium-3"] as const;

// 목록 상단 프리미엄 가로 광고 섹션 목업.
// 데스크톱·모바일 모두 노출(모바일 1열 → sm 2열 → lg 3열).
export function PremiumAdBannerSection({ className }: { className?: string }) {
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{PREMIUM_SLOTS.map((slot) => (
					<Card
						className="flex items-center gap-3 rounded-lg"
						key={slot}
						pad="md"
						tone="outline"
					>
						<div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-coral-50 font-extrabold text-coral-700 text-xs">
							AD
						</div>
						<div className="flex min-w-0 flex-col gap-1">
							<span className="truncate font-extrabold text-sm">
								프리미엄 스폰서
							</span>
							<span className="truncate text-muted-foreground text-xs">
								프리미엄 광고 노출 영역입니다.
							</span>
						</div>
					</Card>
				))}
			</div>
		</section>
	);
}

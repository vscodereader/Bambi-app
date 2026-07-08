"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { HorizontalAdBanner } from "./ad-banner";
import { Badge } from "./ds";

// 상단 프리미엄 가로 배너 슬롯 키(결정적) — 각 키가 가로형 공고 썸네일 샘플로 매핑됨.
const PREMIUM_KEYS = [
	"premium-1",
	"premium-2",
	"premium-3",
	"premium-4",
	"premium-5",
];

// 목록 상단 프리미엄 광고 섹션. 가로형 배너(공고 카드 크기)를 가로로 나열한다.
// 데스크톱·모바일 모두 노출(가로 스크롤).
export function PremiumAdBannerSection({ className }: { className?: string }) {
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
			</div>
			<div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
				{PREMIUM_KEYS.map((key) => (
					<HorizontalAdBanner
						adKey={key}
						className="w-[272px] shrink-0"
						key={key}
					/>
				))}
			</div>
		</section>
	);
}

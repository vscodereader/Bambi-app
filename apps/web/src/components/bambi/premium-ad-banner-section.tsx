"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import { SAMPLE_BANNERS } from "./ad-banner";
import { Badge } from "./ds";

// 목록 상단 프리미엄 광고 섹션. 세로형 배너 샘플을 가로로 나열한다.
// 데스크톱·모바일 모두 노출(가로 스크롤).
export function PremiumAdBannerSection({ className }: { className?: string }) {
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
			</div>
			<div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
				{SAMPLE_BANNERS.map((src) => (
					<Image
						alt="프리미엄 광고 배너"
						className="h-52 w-auto shrink-0 rounded-lg"
						height={180}
						key={src}
						sizes="120px"
						src={src}
						unoptimized
						width={80}
					/>
				))}
			</div>
		</section>
	);
}

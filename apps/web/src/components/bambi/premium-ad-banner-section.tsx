"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { HorizontalAdBanner } from "./ad-banner";
import { Badge } from "./ds";

// 상단 프리미엄 가로 배너 슬롯 키(결정적) — 각 키가 가로형 공고 썸네일 샘플로 매핑됨.
// 한 행 4개(xl)에 맞춰 4개를 둔다.
const PREMIUM_KEYS = ["premium-1", "premium-2", "premium-3", "premium-4"];

// 목록 상단 프리미엄 광고 섹션. 공고 카드와 동일한 반응형 그리드(xl 4열)로
// 가로형 배너(공고 카드 크기)를 배치한다 — 배너가 아래 공고 카드와 열·크기가 정렬된다.
export function PremiumAdBannerSection({ className }: { className?: string }) {
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
			</div>
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4">
				{PREMIUM_KEYS.map((key) => (
					<HorizontalAdBanner adKey={key} key={key} />
				))}
			</div>
		</section>
	);
}

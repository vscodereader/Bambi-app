import { cn } from "@bambi-app/ui/lib/utils";
import type { AdPlacementDiagram as AdPlacementDiagramData } from "@/lib/bambi/ad-products";

// 광고 노출 위치를 축약해 보여주는 장식용 다이어그램.
// 마켓플레이스 공고 목록을 막대 스택으로 표현하고, 해당 등급이 노출되는 슬롯을 accent로 강조한다.
export function AdPlacementDiagram({
	accentClassName,
	highlightRows,
	totalRows,
}: AdPlacementDiagramData) {
	const highlight = new Set(highlightRows);
	const rows = Array.from({ length: totalRows }, (_, index) => index);

	return (
		<div
			aria-hidden="true"
			className="flex w-full max-w-52 flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-2.5"
		>
			{/* 상단 검색/헤더 자리 */}
			<div className="mb-0.5 flex items-center gap-1.5">
				<span className="size-2 rounded-full bg-coral-400" />
				<span className="h-2 w-14 rounded-full bg-border" />
			</div>
			{rows.map((row) => {
				const isHighlighted = highlight.has(row);
				return (
					<div
						className={cn(
							"flex items-center gap-1.5 rounded-md px-1.5 py-1",
							isHighlighted ? cn(accentClassName, "text-white") : "bg-card"
						)}
						key={row}
					>
						<span
							className={cn(
								"size-4 shrink-0 rounded-sm",
								isHighlighted ? "bg-white/40" : "bg-border"
							)}
						/>
						<span className="flex flex-1 flex-col gap-0.5">
							<span
								className={cn(
									"h-1.5 w-3/4 rounded-full",
									isHighlighted ? "bg-white/70" : "bg-border"
								)}
							/>
							<span
								className={cn(
									"h-1.5 w-1/2 rounded-full",
									isHighlighted ? "bg-white/40" : "bg-border/60"
								)}
							/>
						</span>
					</div>
				);
			})}
		</div>
	);
}

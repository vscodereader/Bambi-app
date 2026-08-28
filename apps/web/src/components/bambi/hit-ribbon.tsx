import { cn } from "@bambi-app/ui/lib/utils";

// 공고 카드 공용 HIT 코너 리본. 부모 카드는 relative·overflow-hidden이어야 한다.
export function HitRibbon({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"pointer-events-none absolute top-4 -right-6 z-10 w-24 rotate-45 py-0.5 text-center font-extrabold text-[10px] leading-none tracking-wider",
				className
			)}
			data-hit-ribbon=""
		>
			<span aria-hidden="true">HIT</span>
			<span className="sr-only">인기 공고</span>
		</span>
	);
}

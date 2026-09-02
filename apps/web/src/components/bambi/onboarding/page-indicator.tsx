import { cn } from "@bambi-app/ui/lib/utils";

export function PageIndicator({
	currentIndex,
	pageIds,
}: {
	currentIndex: number;
	pageIds: readonly string[];
}) {
	return (
		<div
			aria-label={`현재 ${currentIndex + 1}/${pageIds.length} 페이지`}
			className="flex items-center justify-center gap-2"
			role="status"
		>
			{pageIds.map((pageId, index) => (
				<span
					aria-hidden="true"
					className={cn(
						"size-2 rounded-full transition-colors motion-reduce:transition-none",
						index === currentIndex ? "bg-primary" : "bg-muted-foreground/25"
					)}
					key={pageId}
				/>
			))}
		</div>
	);
}

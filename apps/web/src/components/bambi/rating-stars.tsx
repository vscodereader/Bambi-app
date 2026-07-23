import { cn } from "@bambi-app/ui/lib/utils";

// 표시 전용 별점(1~5). 채워진 별·빈 별을 ★ 텍스트로 그린다.
// 입력용 별점은 review-form.tsx의 버튼을 그대로 쓴다(이건 읽기 전용).
export function RatingStars({
	className,
	rating,
}: {
	className?: string;
	rating: number;
}) {
	const filled = Math.max(0, Math.min(5, Math.round(rating)));

	return (
		<span
			aria-label={`별점 ${filled}점`}
			className={cn(
				"inline-flex items-center gap-0.5 font-bold text-sm",
				className
			)}
			role="img"
		>
			<span className="text-amber-500">{"★".repeat(filled)}</span>
			<span className="text-muted-foreground">{"★".repeat(5 - filled)}</span>
		</span>
	);
}

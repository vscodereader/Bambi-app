import { cn } from "@bambi-app/ui/lib/utils";
import { formatAdPrice, resolveAdPrice } from "@/lib/bambi/ad-catalog";

// 최종가 + 취소선 원가 + 차분한 "N% 할인" 텍스트. 할인이 없으면 원가만 평범하게 노출한다.
// priceClassName은 소비처가 강조 색·크기를 지정한다(코럴·프라이머리 등).
export function AdPriceTag({
	amount,
	className,
	discountPercent,
	priceClassName,
}: {
	amount: number;
	className?: string;
	discountPercent: number;
	priceClassName?: string;
}) {
	const price = resolveAdPrice(amount, discountPercent);

	if (!price.hasDiscount) {
		return <span className={cn(priceClassName)}>{formatAdPrice(amount)}</span>;
	}

	return (
		<span
			className={cn(
				"inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
				className
			)}
		>
			<span className={cn(priceClassName)}>
				{formatAdPrice(price.discountedAmount)}
			</span>
			<span className="inline-flex items-baseline gap-1 whitespace-nowrap">
				<span className="text-muted-foreground text-xs line-through">
					{formatAdPrice(price.amount)}
				</span>
				<span className="font-medium text-coral-600 text-xs">
					{price.discountPercent}% 할인
				</span>
			</span>
		</span>
	);
}

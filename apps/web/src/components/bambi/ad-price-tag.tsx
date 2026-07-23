import { Badge } from "@bambi-app/ui/components/badge";
import { cn } from "@bambi-app/ui/lib/utils";
import { formatAdPrice, resolveAdPrice } from "@/lib/bambi/ad-catalog";

// 원가 취소선 + 할인가 + "N% 할인" 뱃지. 할인이 없으면 원가만 평범하게 노출한다.
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
			className={cn("inline-flex flex-wrap items-baseline gap-1.5", className)}
		>
			<span className="text-muted-foreground text-xs line-through">
				{formatAdPrice(price.amount)}
			</span>
			<span className={cn(priceClassName)}>
				{formatAdPrice(price.discountedAmount)}
			</span>
			<Badge variant="destructive">{price.discountPercent}% 할인</Badge>
		</span>
	);
}

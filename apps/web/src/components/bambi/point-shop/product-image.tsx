import { cn } from "@bambi-app/ui/lib/utils";
import { GiftIcon } from "lucide-react";
import Image from "next/image";

export function PointShopProductImage({
	className,
	imageUrl,
	name,
	sizes = "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw",
}: {
	className?: string;
	imageUrl: null | string;
	name: string;
	sizes?: string;
}): React.JSX.Element {
	return (
		<div
			className={cn(
				"relative flex size-full items-center justify-center overflow-hidden bg-secondary",
				className
			)}
		>
			{imageUrl ? (
				<Image
					alt={`${name} 상품 이미지`}
					className="object-contain"
					fill
					sizes={sizes}
					src={imageUrl}
					unoptimized
				/>
			) : (
				<GiftIcon className="size-10 text-coral-300" />
			)}
		</div>
	);
}

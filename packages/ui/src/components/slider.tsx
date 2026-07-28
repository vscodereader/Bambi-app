"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";

// 단일 값 슬라이더. base-ui는 값이 배열이면 범위 슬라이더가 되지만 이 레포에는 범위가 필요한
// 곳이 없어 썸을 하나만 그린다(원본 shadcn 코드는 숫자 값을 넘겨도 썸을 둘 그린다).
// aria-label은 루트 div가 아니라 실제 role="slider"인 내부 input에 걸려야 읽힌다.
function Slider({
	"aria-label": ariaLabel,
	className,
	...props
}: SliderPrimitive.Root.Props<number>) {
	return (
		<SliderPrimitive.Root
			className={cn("data-vertical:h-full data-horizontal:w-full", className)}
			data-slot="slider"
			thumbAlignment="edge"
			{...props}
		>
			<SliderPrimitive.Control className="relative flex w-full touch-none select-none items-center data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col data-disabled:opacity-50">
				<SliderPrimitive.Track
					className="relative grow select-none overflow-hidden rounded-full bg-muted data-horizontal:h-1.5 data-vertical:h-full data-horizontal:w-full data-vertical:w-1.5"
					data-slot="slider-track"
				>
					<SliderPrimitive.Indicator
						className="select-none bg-primary data-horizontal:h-full data-vertical:w-full"
						data-slot="slider-range"
					/>
				</SliderPrimitive.Track>
				<SliderPrimitive.Thumb
					className="relative block size-4 shrink-0 select-none rounded-full border border-border bg-background shadow-sm ring-ring/50 transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-2 focus-visible:outline-hidden focus-visible:ring-2 active:ring-2 disabled:pointer-events-none disabled:opacity-50"
					data-slot="slider-thumb"
					getAriaLabel={ariaLabel ? () => ariaLabel : undefined}
				/>
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	);
}

export { Slider };

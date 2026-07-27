"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import {
	type AdBannerSlot,
	type AdBannerSlotLayout,
	type AdBannerTextBlock,
	clampPercent,
} from "@/lib/bambi/ad-banner-layout";
import { useBlockDrag } from "./use-block-drag";

const WEIGHT_CLASS_NAMES = {
	bold: "font-bold",
	extrabold: "font-extrabold",
	normal: "font-normal",
} as const;

const ALIGN_CLASS_NAMES = {
	center: "text-center",
	left: "text-left",
	right: "text-right",
} as const;

// 실제 슬롯과 같은 비율만 지킨다. 세로 슬롯의 h-52는 손가락으로 끌기엔 너무 작아 더 키우되
// 4:9를 유지해 편집 결과가 실제 슬롯에 비례로 재현된다.
const SLOT_CLASS_NAMES = {
	horizontal: "aspect-[7/3] w-full",
	vertical: "aspect-[4/9] h-80 sm:h-96",
} as const;

// 드래그만 있으면 포인터가 없는 사용자는 블록을 옮길 수 없다. 방향키(Shift로 5%씩)를 대안으로 둔다.
const ARROW_STEPS: Record<string, { x: number; y: number }> = {
	ArrowDown: { x: 0, y: 1 },
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
};

// 문구 블록. 드래그 핸들 자체라서 shadcn Button이 아니라 네이티브 button을 쓴다 — 버튼 룩이
// 필요한 컨트롤이 아니라 캔버스 위의 자유 배치 요소이고, button 엘리먼트라야 포커스·방향키가 따라온다.
function CanvasBlock({
	block,
	onMove,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onSelect,
	selected,
}: {
	block: AdBannerTextBlock;
	onMove: (id: string, x: number, y: number) => void;
	onPointerDown: (event: PointerEvent<HTMLElement>) => void;
	onPointerMove: (event: PointerEvent<HTMLElement>) => void;
	onPointerUp: (event: PointerEvent<HTMLElement>) => void;
	onSelect: () => void;
	selected: boolean;
}) {
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		const step = ARROW_STEPS[event.key];

		if (!step) {
			return;
		}

		event.preventDefault();
		const distance = event.shiftKey ? 5 : 1;
		onMove(
			block.id,
			clampPercent(block.x + step.x * distance),
			clampPercent(block.y + step.y * distance)
		);
	};

	return (
		<button
			// 좌표를 라벨에 넣어야 방향키로 옮길 때마다 스크린리더가 바뀐 위치를 읽어 준다.
			// 선택 여부도 ring 색만으로는 전달되지 않으므로 aria-pressed로 함께 알린다.
			aria-label={`문구 "${block.content}" 위치 조정, 가로 ${Math.round(block.x)}% 세로 ${Math.round(block.y)}%`}
			aria-pressed={selected}
			className={cn(
				"absolute top-[var(--block-y)] left-[var(--block-x)] max-w-full -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-md px-1 leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
				selected && "ring-2 ring-primary",
				ALIGN_CLASS_NAMES[block.align],
				WEIGHT_CLASS_NAMES[block.weight]
			)}
			onFocus={onSelect}
			onKeyDown={handleKeyDown}
			onPointerDown={(event) => {
				onSelect();
				onPointerDown(event);
			}}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			// 좌표·크기·색은 구인자가 정한 런타임 값이라 Tailwind 클래스로 표현할 수 없다.
			// CSS 변수 주입에만 한정한다(배치·상태 스타일은 전부 className).
			style={
				{
					"--block-color": block.color,
					"--block-size": `${block.fontSize}cqw`,
					"--block-x": `${block.x}%`,
					"--block-y": `${block.y}%`,
				} as React.CSSProperties
			}
			type="button"
		>
			{/* 편집 중에는 연출을 재생하지 않는다 — 매 입력마다 gsap이 DOM을 다시 쪼개면 드래그가 끊긴다. */}
			<span className="text-[color:var(--block-color)] text-[length:var(--block-size)]">
				{block.content}
			</span>
		</button>
	);
}

// 편집 캔버스. 실제 슬롯과 같은 비율·같은 CSS 변수 방식으로 그려 렌더러와 결과가 어긋나지 않는다.
export function EditorCanvas({
	backgroundUrl,
	onMove,
	onSelect,
	selectedId,
	slot,
	slotLayout,
}: {
	backgroundUrl?: string;
	onMove: (id: string, x: number, y: number) => void;
	onSelect: (id: string) => void;
	selectedId: null | string;
	slot: AdBannerSlot;
	slotLayout: AdBannerSlotLayout;
}) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const { handlePointerDown, handlePointerMove, handlePointerUp } =
		useBlockDrag({ canvasRef, onMove });
	const showScrim =
		slotLayout.background.type === "image" && slotLayout.scrim.enabled;

	return (
		// cqw의 기준이 되는 컨테이너다. @container가 없으면 조상 컨테이너를 찾아 엉뚱한 크기가 된다.
		<div
			className={cn(
				"@container relative max-w-full overflow-hidden rounded-xl border border-border bg-muted",
				SLOT_CLASS_NAMES[slot]
			)}
			ref={canvasRef}
		>
			{slotLayout.background.type === "color" ? (
				<div
					className="absolute inset-0 bg-[var(--canvas-bg)]"
					style={
						{
							"--canvas-bg": slotLayout.background.color,
						} as React.CSSProperties
					}
				/>
			) : (
				backgroundUrl && (
					<Image
						alt=""
						className="object-cover"
						fill
						sizes="(max-width: 1024px) 100vw, 40rem"
						src={backgroundUrl}
						unoptimized
					/>
				)
			)}

			{showScrim ? (
				<div
					className="absolute inset-0 bg-ink-900 opacity-[var(--scrim-opacity)]"
					style={
						{
							"--scrim-opacity": slotLayout.scrim.opacity / 100,
						} as React.CSSProperties
					}
				/>
			) : null}

			{slotLayout.background.type === "image" && !backgroundUrl ? (
				<p className="absolute inset-0 flex items-center justify-center p-4 text-center text-muted-foreground text-xs">
					배경 이미지를 아직 올리지 않았습니다. 문구 배치는 지금도 할 수
					있습니다.
				</p>
			) : null}

			{slotLayout.texts.map((block) => (
				<CanvasBlock
					block={block}
					key={block.id}
					onMove={onMove}
					onPointerDown={handlePointerDown(block.id)}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onSelect={() => onSelect(block.id)}
					selected={block.id === selectedId}
				/>
			))}
		</div>
	);
}

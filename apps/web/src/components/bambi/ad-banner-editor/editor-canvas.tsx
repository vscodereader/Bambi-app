"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { ImageOff } from "lucide-react";
import Image from "next/image";
import { type KeyboardEvent, useRef } from "react";
import {
	AD_BANNER_WIDTH_MAX,
	AD_BANNER_WIDTH_MIN,
	type AdBannerSlot,
	type AdBannerSlotLayout,
	type AdBannerTextBlock,
	clampPercent,
	formatAdBannerBlockLabel,
} from "@/lib/bambi/ad-banner-layout";
import { useBlockDrag } from "./use-block-drag";
import {
	type BlockResizeEdge,
	resizeBlockWidth,
	useBlockResize,
} from "./use-block-resize";

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

const RESIZE_EDGE_LABELS: Record<BlockResizeEdge, string> = {
	left: "왼쪽",
	right: "오른쪽",
};

// 히트 영역(size-6 = 24px)을 블록 **바깥**에 붙인다. 모서리에 걸치게 두면 세로 캔버스(폭
// 약 142px)에서 최소 너비 10% = 14px일 때 두 핸들이 서로를 덮어 뒤 DOM(오른쪽)이 왼쪽
// 핸들을 통째로 가린다 — 24px 손잡이 둘이 14px 안에 들어갈 방법은 없다. 바깥에 두면 너비와
// 무관하게 절대 겹치지 않는다. 블록이 캔버스 가장자리에 딱 붙어 핸들이 잘리는 극단(폭 100%)
// 에서는 속성 패널의 '문구 폭' 슬라이더가 같은 조절을 대신한다.
const RESIZE_EDGE_CLASS_NAMES: Record<BlockResizeEdge, string> = {
	left: "right-full",
	right: "left-full",
};

const RESIZE_ARROW_DIRECTIONS: Record<string, number> = {
	ArrowLeft: -1,
	ArrowRight: 1,
};

// 너비 핸들. 드래그만으로는 포인터가 없는 사용자가 폭을 못 바꾸므로 방향키를 같이 받는다
// (블록 이동과 같은 보폭 — 1%, Shift 5%). 잡은 쪽으로 끌면 넓어지는 감각을 방향키도 따른다.
function ResizeHandle({
	block,
	blockLabel,
	edge,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onResize,
}: {
	block: AdBannerTextBlock;
	blockLabel: string;
	edge: BlockResizeEdge;
	onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
	onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
	onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
	onResize: (id: string, width: number, x: number) => void;
}) {
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		const direction = RESIZE_ARROW_DIRECTIONS[event.key];

		if (!direction) {
			return;
		}

		event.preventDefault();
		const next = resizeBlockWidth({
			edge,
			width: block.width,
			// 왼쪽 핸들은 왼쪽으로 갈수록 넓어진다 — 부호를 뒤집어야 핸들을 끄는 감각과 같다.
			widthDelta:
				(edge === "left" ? -direction : direction) * (event.shiftKey ? 5 : 1),
			x: block.x,
		});
		onResize(block.id, next.width, next.x);
	};

	return (
		<button
			// 값은 라벨이 아니라 aria-valuenow로 알린다. 포커스된 요소의 aria-label을 바꿔도
			// NVDA·JAWS는 다시 읽지 않아 방향키를 눌러도 아무 피드백이 없다 — role="slider"의
			// 값 변경은 브라우저가 직접 announce 한다.
			aria-label={`${blockLabel} ${RESIZE_EDGE_LABELS[edge]} 너비 조절`}
			aria-valuemax={AD_BANNER_WIDTH_MAX}
			aria-valuemin={AD_BANNER_WIDTH_MIN}
			aria-valuenow={Math.round(block.width)}
			aria-valuetext={`${Math.round(block.width)}%`}
			className={cn(
				"absolute top-1/2 flex size-6 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
				RESIZE_EDGE_CLASS_NAMES[edge]
			)}
			onKeyDown={handleKeyDown}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			role="slider"
			type="button"
		>
			{/* 보이는 손잡이는 얇게, 히트 영역(size-6)은 손가락에 맞춘다. */}
			<span
				aria-hidden="true"
				className="pointer-events-none block h-5 w-1.5 rounded-full bg-primary shadow-sm ring-1 ring-background"
			/>
		</button>
	);
}

// 문구 블록. 바깥 상자는 렌더러(ad-banner-layout-renderer)의 TextBlockView와 **같은 클래스**여야
// 한다 — 폭·줄바꿈 기준이 조금이라도 다르면 "에디터에서 맞춰 놨는데 실제 배너는 다른 모양"이
// 된다. 그래서 padding 같은 폭을 먹는 스타일은 절대 넣지 않고, 선택 표시는 폭에 영향이 없는
// ring으로만 한다.
function CanvasBlock({
	block,
	index,
	drag,
	onMove,
	onResize,
	onSelect,
	resize,
	selected,
	shadowed,
}: {
	block: AdBannerTextBlock;
	drag: ReturnType<typeof useBlockDrag>;
	index: number;
	onMove: (id: string, x: number, y: number) => void;
	onResize: (id: string, width: number, x: number) => void;
	onSelect: () => void;
	resize: ReturnType<typeof useBlockResize>;
	selected: boolean;
	shadowed: boolean;
}) {
	const blockLabel = formatAdBannerBlockLabel(block, index);

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
		<div
			className={cn(
				"absolute top-[var(--block-y)] left-[var(--block-x)] w-[var(--block-width)] max-w-full -translate-x-1/2 -translate-y-1/2 break-words",
				ALIGN_CLASS_NAMES[block.align],
				WEIGHT_CLASS_NAMES[block.weight]
			)}
			// 좌표·크기·색·너비는 구인자가 정한 런타임 값이라 Tailwind 클래스로 표현할 수 없다.
			// CSS 변수 주입에만 한정한다(배치·상태 스타일은 전부 className).
			style={
				{
					"--block-color": block.color,
					"--block-size": `${block.fontSize}cqw`,
					"--block-width": `${block.width}%`,
					"--block-x": `${block.x}%`,
					"--block-y": `${block.y}%`,
				} as React.CSSProperties
			}
		>
			<button
				// 좌표는 라벨이 아니라 캔버스 아래 상태줄(aria-live)이 알린다 — 포커스된 요소의
				// aria-label 변경은 스크린리더가 재낭독하지 않아 방향키를 눌러도 조용하다.
				// 선택은 aria-pressed(토글)가 아니라 aria-current다: 목록에서 하나만 고를 수 있고
				// 같은 블록을 다시 눌러 해제할 수 없다.
				aria-current={selected ? "true" : undefined}
				aria-label={`${blockLabel} 위치 조정`}
				className={cn(
					"block w-full cursor-grab touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
					selected && "ring-2 ring-primary",
					ALIGN_CLASS_NAMES[block.align]
				)}
				onFocus={onSelect}
				onKeyDown={handleKeyDown}
				onPointerDown={(event) => {
					onSelect();
					drag.handlePointerDown(block.id)(event);
				}}
				onPointerMove={drag.handlePointerMove}
				onPointerUp={drag.handlePointerUp}
				type="button"
			>
				{/* 편집 중에는 연출을 재생하지 않는다 — 매 입력마다 gsap이 DOM을 다시 쪼개면 드래그가 끊긴다.
				    drop-shadow 조건은 렌더러(ad-banner-layout-renderer)와 **같아야** 한다: 사진 배경 +
				    오버레이 끔에서만 그림자가 붙는데, 캔버스에만 없으면 바로 그 상태에서 편집 화면과
				    실제 배너의 글자가 다르게 보인다. */}
				<span
					className={cn(
						"text-[color:var(--block-color)] text-[length:var(--block-size)] leading-tight",
						shadowed && "drop-shadow-md"
					)}
				>
					{block.content}
				</span>
			</button>

			{/* 핸들은 선택된 블록에만 붙인다. 전부 띄우면 캔버스가 손잡이로 뒤덮인다. */}
			{selected
				? (["left", "right"] as const).map((edge) => (
						<ResizeHandle
							block={block}
							blockLabel={blockLabel}
							edge={edge}
							key={edge}
							onPointerDown={resize.handlePointerDown(block, edge)}
							onPointerMove={resize.handlePointerMove}
							onPointerUp={resize.handlePointerUp}
							onResize={onResize}
						/>
					))
				: null}
		</div>
	);
}

// 편집 캔버스. 실제 슬롯과 같은 비율·같은 CSS 변수 방식으로 그려 렌더러와 결과가 어긋나지 않는다.
export function EditorCanvas({
	backgroundUrl,
	onMove,
	onResize,
	onSelect,
	selectedId,
	slot,
	slotLayout,
}: {
	backgroundUrl?: string;
	onMove: (id: string, x: number, y: number) => void;
	onResize: (id: string, width: number, x: number) => void;
	onSelect: (id: string) => void;
	selectedId: null | string;
	slot: AdBannerSlot;
	slotLayout: AdBannerSlotLayout;
}) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const drag = useBlockDrag({ canvasRef, onMove });
	const resize = useBlockResize({ canvasRef, onResize });
	const showScrim =
		slotLayout.background.type === "image" && slotLayout.scrim.enabled;
	const selectedIndex = slotLayout.texts.findIndex(
		(block) => block.id === selectedId
	);
	const selectedBlock =
		selectedIndex === -1 ? null : slotLayout.texts[selectedIndex];

	return (
		<>
			{/* cqw의 기준이 되는 컨테이너다. @container가 없으면 조상 컨테이너를 찾아 엉뚱한 크기가 된다.
			    select-none은 드래그·리사이즈 중 문구가 통째로 선택되는 것을 막는다(캔버스에서 글자를
			    긁어 복사할 일은 없다). 탭 하이라이트는 끈다 — 모바일에서 문구를 누를 때마다 회색
			    사각형이 배너 미리보기 위에 번쩍여 실제 배너와 다르게 보인다. */}
			<div
				className={cn(
					"@container relative max-w-full select-none overflow-hidden rounded-xl border border-border bg-muted [-webkit-tap-highlight-color:transparent]",
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
					<p className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground text-xs">
						<ImageOff aria-hidden="true" className="size-5" />
						옆(모바일은 아래) 패널에서 배너 이미지를 골라 주십시오. 문구 배치는
						지금도 할 수 있습니다.
					</p>
				) : null}

				{slotLayout.texts.map((block, index) => (
					<CanvasBlock
						block={block}
						drag={drag}
						index={index}
						key={block.id}
						onMove={onMove}
						onResize={onResize}
						onSelect={() => onSelect(block.id)}
						resize={resize}
						selected={block.id === selectedId}
						shadowed={slotLayout.background.type === "image" && !showScrim}
					/>
				))}
			</div>

			{/* 좌표·폭 변화를 알리는 상태줄. 캔버스 안의 시각적 위치는 스크린리더로 전달되지
			    않고, 포커스된 블록의 aria-label을 바꿔도 재낭독되지 않는다. 리전은 값이 없어도
			    **항상 렌더**해 둔다 — 갱신 시점에 없거나 숨겨져 있으면 삽입을 놓친다. */}
			<p
				aria-live="polite"
				className="text-center text-muted-foreground text-xs tabular-nums"
			>
				{selectedBlock
					? `${formatAdBannerBlockLabel(selectedBlock, selectedIndex)} · 가로 ${Math.round(selectedBlock.x)}% 세로 ${Math.round(selectedBlock.y)}% · 폭 ${Math.round(selectedBlock.width)}%`
					: "문구를 고르면 여기에 위치와 폭이 표시됩니다."}
			</p>
		</>
	);
}

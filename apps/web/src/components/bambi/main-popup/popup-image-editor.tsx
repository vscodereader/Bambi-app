"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Copy, Crop, Download, RotateCcw, Trash2, Undo2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { PopupImageAsset } from "@/lib/bambi/main-popup";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const handleClass = (handle: Handle) => {
	const base =
		"absolute z-20 size-4 touch-none rounded-full border-2 border-background bg-primary";
	const position = {
		e: "top-1/2 -right-2 -translate-y-1/2 cursor-ew-resize",
		n: "-top-2 left-1/2 -translate-x-1/2 cursor-ns-resize",
		ne: "-top-2 -right-2 cursor-nesw-resize",
		nw: "-top-2 -left-2 cursor-nwse-resize",
		s: "-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize",
		se: "-right-2 -bottom-2 cursor-nwse-resize",
		sw: "-bottom-2 -left-2 cursor-nesw-resize",
		w: "top-1/2 -left-2 -translate-y-1/2 cursor-ew-resize",
	}[handle];
	return `${base} ${position}`;
};

const resize = (
	handle: Handle,
	startWidth: number,
	startHeight: number,
	dx: number,
	dy: number
) => {
	if (handle.length === 2) {
		const ratio = startWidth / startHeight;
		const widthDelta = handle.includes("w") ? -dx : dx;
		const heightDeltaAsWidth = (handle.includes("n") ? -dy : dy) * ratio;
		const width = Math.max(
			50,
			Math.round(
				startWidth +
					(Math.abs(widthDelta) > Math.abs(heightDeltaAsWidth)
						? widthDelta
						: heightDeltaAsWidth)
			)
		);
		return { height: Math.max(50, Math.round(width / ratio)), width };
	}
	let heightDelta = 0;
	if (handle === "n") {
		heightDelta = -dy;
	} else if (handle === "s") {
		heightDelta = dy;
	}
	let widthDelta = 0;
	if (handle === "w") {
		widthDelta = -dx;
	} else if (handle === "e") {
		widthDelta = dx;
	}
	return {
		height: Math.max(50, Math.round(startHeight + heightDelta)),
		width: Math.max(50, Math.round(startWidth + widthDelta)),
	};
};

interface CropRect {
	height: number;
	width: number;
	x: number;
	y: number;
}

async function cropAsset(
	asset: PopupImageAsset,
	rect: CropRect
): Promise<PopupImageAsset> {
	const image = new window.Image();
	image.src = asset.dataUrl;
	await image.decode();
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(rect.width);
	canvas.height = Math.round(rect.height);
	canvas
		.getContext("2d")
		?.drawImage(
			image,
			rect.x,
			rect.y,
			rect.width,
			rect.height,
			0,
			0,
			canvas.width,
			canvas.height
		);
	return {
		dataUrl: canvas.toDataURL(
			asset.mimeType,
			asset.mimeType === "image/png" ? undefined : 0.92
		),
		height: canvas.height,
		mimeType: asset.mimeType,
		width: canvas.width,
	};
}

function CropDialog({
	asset,
	onClose,
	onComplete,
}: {
	asset: PopupImageAsset | null;
	onClose: () => void;
	onComplete: (asset: PopupImageAsset) => void;
}) {
	const svgRef = useRef<SVGSVGElement>(null);
	const dragRef = useRef<{
		handle: Handle;
		rect: CropRect;
		x: number;
		y: number;
	} | null>(null);
	const [rect, setRect] = useState<CropRect>({
		height: 1,
		width: 1,
		x: 0,
		y: 0,
	});
	useEffect(() => {
		if (asset) {
			setRect({ height: asset.height, width: asset.width, x: 0, y: 0 });
		}
	}, [asset]);
	if (!asset) {
		return null;
	}
	const move = (event: React.PointerEvent<SVGElement>) => {
		const drag = dragRef.current;
		const bounds = svgRef.current?.getBoundingClientRect();
		if (!(drag && bounds)) {
			return;
		}
		const dx = ((event.clientX - drag.x) * asset.width) / bounds.width;
		const dy = ((event.clientY - drag.y) * asset.height) / bounds.height;
		let { x, y, width, height } = drag.rect;
		if (drag.handle.includes("w")) {
			const right = x + width;
			x = Math.max(0, Math.min(right - 32, x + dx));
			width = right - x;
		}
		if (drag.handle.includes("e")) {
			width = Math.max(32, Math.min(asset.width - x, width + dx));
		}
		if (drag.handle.includes("n")) {
			const bottom = y + height;
			y = Math.max(0, Math.min(bottom - 32, y + dy));
			height = bottom - y;
		}
		if (drag.handle.includes("s")) {
			height = Math.max(32, Math.min(asset.height - y, height + dy));
		}
		setRect({ height, width, x, y });
	};
	const points: Record<Handle, [number, number]> = {
		nw: [rect.x, rect.y],
		n: [rect.x + rect.width / 2, rect.y],
		ne: [rect.x + rect.width, rect.y],
		e: [rect.x + rect.width, rect.y + rect.height / 2],
		se: [rect.x + rect.width, rect.y + rect.height],
		s: [rect.x + rect.width / 2, rect.y + rect.height],
		sw: [rect.x, rect.y + rect.height],
		w: [rect.x, rect.y + rect.height / 2],
	};
	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open>
			<DialogContent className="w-[min(94vw,900px)] max-w-none">
				<DialogTitle>이미지 자르기</DialogTitle>
				<DialogDescription>
					밝은 영역만 남습니다. 모서리와 네 면을 끌어 자유롭게 조절하세요.
				</DialogDescription>
				<div className="flex max-h-[70vh] justify-center overflow-auto rounded-lg bg-muted p-4">
					<svg
						aria-label="이미지 자르기 영역"
						className="h-auto max-h-[65vh] max-w-full touch-none"
						onPointerMove={move}
						onPointerUp={() => {
							dragRef.current = null;
						}}
						ref={svgRef}
						role="img"
						viewBox={`0 0 ${asset.width} ${asset.height}`}
					>
						<image
							height={asset.height}
							href={asset.dataUrl}
							width={asset.width}
						/>
						<path
							d={`M0 0H${asset.width}V${asset.height}H0Z M${rect.x} ${rect.y}V${rect.y + rect.height}H${rect.x + rect.width}V${rect.y}Z`}
							fill="rgb(0 0 0 / 0.58)"
							fillRule="evenodd"
						/>
						<rect
							fill="none"
							height={rect.height}
							stroke="white"
							strokeWidth="4"
							width={rect.width}
							x={rect.x}
							y={rect.y}
						/>
						{HANDLES.map((handle) => (
							<circle
								aria-label={`${handle} 자르기 조절`}
								cx={points[handle][0]}
								cy={points[handle][1]}
								fill="white"
								key={handle}
								onPointerDown={(event) => {
									event.preventDefault();
									event.currentTarget.setPointerCapture(event.pointerId);
									dragRef.current = {
										handle,
										rect,
										x: event.clientX,
										y: event.clientY,
									};
								}}
								r={Math.max(8, Math.min(asset.width, asset.height) * 0.012)}
							/>
						))}
					</svg>
				</div>
				<p className="text-center text-muted-foreground text-sm">
					{Math.round(rect.width)} × {Math.round(rect.height)} px
				</p>
				<div className="flex justify-end gap-2">
					<Button onClick={onClose} variant="outline">
						취소
					</Button>
					<Button
						onClick={async () => onComplete(await cropAsset(asset, rect))}
					>
						완료
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function PopupImageEditor({
	asset,
	height,
	onChange,
	onCopy,
	onDelete,
	onReset,
	onResize,
	onResizeStart,
	onUndo,
	width,
}: {
	asset: PopupImageAsset | null;
	height: number;
	onChange: (asset: PopupImageAsset) => void;
	onCopy: () => void;
	onDelete: () => void;
	onReset: () => void;
	onResize: (width: number, height: number) => void;
	onResizeStart: () => void;
	onUndo: () => void;
	width: number;
}) {
	const dragRef = useRef<{
		handle: Handle;
		height: number;
		width: number;
		x: number;
		y: number;
	} | null>(null);
	const [selected, setSelected] = useState(false);
	const [menu, setMenu] = useState(false);
	const [crop, setCrop] = useState(false);
	if (!asset) {
		return (
			<div className="flex min-h-40 items-center justify-center rounded-md border border-dashed text-muted-foreground">
				이미지를 추가해 주세요.
			</div>
		);
	}
	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="font-medium">표시 크기</span>
				<Input
					aria-label="이미지 표시 너비"
					className="w-24"
					min={50}
					onChange={(event) =>
						onResize(Math.max(50, Number(event.target.value)), height)
					}
					type="number"
					value={width}
				/>
				<span>×</span>
				<Input
					aria-label="이미지 표시 높이"
					className="w-24"
					min={50}
					onChange={(event) =>
						onResize(width, Math.max(50, Number(event.target.value)))
					}
					type="number"
					value={height}
				/>
				<span>px</span>
			</div>
			<div
				className="relative flex min-h-48 justify-center overflow-auto rounded-md bg-muted p-8"
				onPointerDown={(event) => {
					if (event.currentTarget === event.target) {
						setSelected(false);
						setMenu(false);
					}
				}}
			>
				{/* biome-ignore lint/a11y/useSemanticElements: the selectable canvas contains resize and menu buttons, which cannot be nested in a semantic button */}
				<div
					aria-label="팝업 이미지 선택"
					className={`relative h-fit w-fit ${selected ? "outline outline-2 outline-primary" : ""}`}
					onContextMenu={(event) => {
						event.preventDefault();
						setSelected(true);
						setMenu(true);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							setSelected(true);
						}
					}}
					onPointerDown={(event) => {
						event.stopPropagation();
						setSelected(true);
					}}
					role="button"
					tabIndex={0}
				>
					<Image
						alt="팝업 이미지 미리보기"
						draggable={false}
						height={height}
						src={asset.dataUrl}
						unoptimized
						width={width}
					/>
					{selected
						? HANDLES.map((handle) => (
								<button
									aria-label={`${handle} 크기 조절`}
									className={handleClass(handle)}
									key={handle}
									onPointerDown={(event) => {
										event.preventDefault();
										event.stopPropagation();
										event.currentTarget.setPointerCapture(event.pointerId);
										onResizeStart();
										dragRef.current = {
											handle,
											height,
											width,
											x: event.clientX,
											y: event.clientY,
										};
									}}
									onPointerMove={(event) => {
										const drag = dragRef.current;
										if (!drag) {
											return;
										}
										const next = resize(
											drag.handle,
											drag.width,
											drag.height,
											event.clientX - drag.x,
											event.clientY - drag.y
										);
										onResize(next.width, next.height);
									}}
									onPointerUp={() => {
										dragRef.current = null;
										setSelected(true);
									}}
									type="button"
								/>
							))
						: null}
					{menu ? (
						<div className="absolute top-3 right-3 z-30 grid min-w-40 rounded-md border bg-popover p-1 shadow-lg">
							<Button
								onClick={() => {
									setCrop(true);
									setMenu(false);
								}}
								size="sm"
								variant="ghost"
							>
								<Crop />
								자르기
							</Button>
							<Button
								onClick={() => {
									onCopy();
									setMenu(false);
								}}
								size="sm"
								variant="ghost"
							>
								<Copy />
								복사
							</Button>
							<Button
								onClick={() => {
									const link = document.createElement("a");
									link.href = asset.dataUrl;
									link.download = `popup.${asset.mimeType === "image/jpeg" ? "jpg" : asset.mimeType.split("/")[1]}`;
									link.click();
									setMenu(false);
								}}
								size="sm"
								variant="ghost"
							>
								<Download />
								다운로드
							</Button>
							<Button
								onClick={() => {
									onDelete();
									setMenu(false);
								}}
								size="sm"
								variant="ghost"
							>
								<Trash2 />
								삭제
							</Button>
							<Button
								onClick={() => {
									onUndo();
									setMenu(false);
								}}
								size="sm"
								variant="ghost"
							>
								<Undo2 />
								실행 취소
							</Button>
							<Button
								onClick={() => {
									onReset();
									setMenu(false);
								}}
								size="sm"
								variant="ghost"
							>
								<RotateCcw />
								원본으로 초기화
							</Button>
						</div>
					) : null}
				</div>
				<CropDialog
					asset={crop ? asset : null}
					onClose={() => setCrop(false)}
					onComplete={(next) => {
						onChange(next);
						onResize(
							Math.min(width, next.width),
							Math.min(height, next.height)
						);
						setCrop(false);
					}}
				/>
			</div>
		</div>
	);
}

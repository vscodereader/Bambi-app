"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CrawledImageAsset } from "@/lib/bambi/crawled-image-editor";
import { imageMime } from "@/lib/bambi/crawled-image-editor";

interface CropRect {
	height: number;
	width: number;
	x: number;
	y: number;
}
interface CropDialogProps {
	asset: CrawledImageAsset | null;
	onClose: () => void;
	onComplete: (asset: CrawledImageAsset) => void;
}
type Corner = "ne" | "nw" | "se" | "sw";

const cropImage = async (
	asset: CrawledImageAsset,
	rect: CropRect
): Promise<CrawledImageAsset> => {
	const source = new window.Image();
	source.src = asset.dataUrl;
	await source.decode();
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(rect.width);
	canvas.height = Math.round(rect.height);
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("이미지 편집 화면을 준비하지 못했습니다.");
	}
	context.drawImage(
		source,
		Math.round(rect.x),
		Math.round(rect.y),
		canvas.width,
		canvas.height,
		0,
		0,
		canvas.width,
		canvas.height
	);
	const mime = imageMime(asset.dataUrl);
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(result) =>
				result
					? resolve(result)
					: reject(new Error("이미지를 자르지 못했습니다.")),
			mime,
			mime === "image/png" ? undefined : 0.92
		);
	});
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
		reader.onload = () => resolve(String(reader.result));
		reader.readAsDataURL(blob);
	});
	return {
		dataUrl,
		height: canvas.height,
		id: crypto.randomUUID(),
		width: canvas.width,
	};
};

export function CropDialog({ asset, onClose, onComplete }: CropDialogProps) {
	const imageRef = useRef<HTMLImageElement>(null);
	const dragRef = useRef<{
		corner: Corner;
		pointerId: number;
		start: CropRect;
		x: number;
		y: number;
	} | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
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

	const minimumWidth = Math.min(
		asset.width,
		Math.max(32, Math.round(asset.width * 0.02))
	);
	const minimumHeight = Math.min(
		asset.height,
		Math.max(32, Math.round(asset.height * 0.02))
	);
	const selectionStyle = {
		height: `${(rect.height / asset.height) * 100}%`,
		left: `${(rect.x / asset.width) * 100}%`,
		top: `${(rect.y / asset.height) * 100}%`,
		width: `${(rect.width / asset.width) * 100}%`,
	};
	const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		const drag = dragRef.current;
		const image = imageRef.current;
		if (!drag || drag.pointerId !== event.pointerId || !image) {
			return;
		}
		const bounds = image.getBoundingClientRect();
		const dx = ((event.clientX - drag.x) * asset.width) / bounds.width;
		const dy = ((event.clientY - drag.y) * asset.height) / bounds.height;
		let { height, width, x, y } = drag.start;
		if (drag.corner.includes("w")) {
			const right = x + width;
			x = Math.max(0, Math.min(right - minimumWidth, x + dx));
			width = right - x;
		} else {
			width = Math.max(minimumWidth, Math.min(asset.width - x, width + dx));
		}
		if (drag.corner.includes("n")) {
			const bottom = y + height;
			y = Math.max(0, Math.min(bottom - minimumHeight, y + dy));
			height = bottom - y;
		} else {
			height = Math.max(minimumHeight, Math.min(asset.height - y, height + dy));
		}
		setRect({ height, width, x, y });
	};

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open>
			<DialogContent className="w-[min(94vw,900px)] max-w-none">
				<DialogTitle>이미지 자르기</DialogTitle>
				<DialogDescription>
					밝은 영역만 남습니다. 네 모서리를 끌어 자유 비율로 조절하세요.
				</DialogDescription>
				<div className="flex max-h-[70vh] justify-center overflow-auto rounded-lg bg-muted p-4">
					<div className="relative h-fit max-w-full overflow-hidden">
						<Image
							alt="자를 이미지"
							className="block h-auto max-w-full select-none object-contain"
							height={asset.height}
							ref={imageRef}
							src={asset.dataUrl}
							unoptimized
							width={asset.width}
						/>
						<div
							className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.58)]"
							style={selectionStyle}
						>
							{(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
								<button
									aria-label={`${corner} 모서리 조절`}
									className={`absolute z-10 size-8 touch-none bg-black/10 drop-shadow-md ${corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"} ${corner.includes("n") ? "top-1 border-t-4" : "bottom-1 border-b-4"} ${corner.includes("w") ? "left-1 border-l-4" : "right-1 border-r-4"} border-white`}
									key={corner}
									onPointerCancel={(event) => {
										event.stopPropagation();
										dragRef.current = null;
									}}
									onPointerDown={(event) => {
										event.preventDefault();
										event.stopPropagation();
										event.currentTarget.setPointerCapture(event.pointerId);
										dragRef.current = {
											corner,
											pointerId: event.pointerId,
											start: rect,
											x: event.clientX,
											y: event.clientY,
										};
									}}
									onPointerMove={handlePointerMove}
									onPointerUp={(event) => {
										event.stopPropagation();
										dragRef.current = null;
									}}
									type="button"
								/>
							))}
						</div>
					</div>
				</div>
				<p className="m-0 text-center text-muted-foreground text-sm">
					{Math.round(rect.width)} × {Math.round(rect.height)} px
				</p>
				<div className="flex justify-end gap-2">
					<Button disabled={isProcessing} onClick={onClose} variant="outline">
						취소
					</Button>
					<Button
						disabled={isProcessing}
						onClick={async () => {
							setIsProcessing(true);
							try {
								onComplete(await cropImage(asset, rect));
							} finally {
								setIsProcessing(false);
							}
						}}
					>
						{isProcessing ? "처리 중…" : "완료"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

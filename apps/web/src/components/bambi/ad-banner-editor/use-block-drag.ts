"use client";

import { type RefObject, useCallback, useRef } from "react";
import { clampPercent } from "@/lib/bambi/ad-banner-layout";

// 캔버스 기준 백분율 드래그. setPointerCapture로 포인터를 잡아 캔버스 밖으로 나가도 이벤트가
// 계속 들어오게 한다 — 이게 없으면 빠르게 끌 때 블록이 중간에 멈춘다.
export const useBlockDrag = ({
	canvasRef,
	onMove,
}: {
	canvasRef: RefObject<HTMLDivElement | null>;
	onMove: (id: string, x: number, y: number) => void;
}) => {
	const draggingIdRef = useRef<string | null>(null);

	const handlePointerDown = useCallback(
		(id: string) => (event: React.PointerEvent<HTMLElement>) => {
			draggingIdRef.current = id;
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[]
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			const id = draggingIdRef.current;
			const canvas = canvasRef.current;

			if (!(id && canvas)) {
				return;
			}

			const rect = canvas.getBoundingClientRect();
			// rect.width가 0인 순간(슬롯 탭이 아직 레이아웃되기 전)의 0/0 = NaN을 clampPercent가 접는다.
			const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
			const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
			onMove(id, x, y);
		},
		[canvasRef, onMove]
	);

	const handlePointerUp = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			draggingIdRef.current = null;
			event.currentTarget.releasePointerCapture(event.pointerId);
		},
		[]
	);

	return { handlePointerDown, handlePointerMove, handlePointerUp };
};

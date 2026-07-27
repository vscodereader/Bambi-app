"use client";

import { type RefObject, useCallback, useRef } from "react";
// 상대 경로 import를 쓴다 — web 전용 vitest config가 없어 테스트에서 `@/` alias가 풀리지 않는다.
// 아래 resizeBlockWidth가 이 화면에서 가장 틀리기 쉬운 계산이라 테스트로 고정해 둔다.
import {
	clampBlockWidth,
	clampPercent,
} from "../../../lib/bambi/ad-banner-layout";

export type BlockResizeEdge = "left" | "right";

// 블록 좌표는 '중심' 기준이다(-translate-x-1/2). 너비만 바꾸면 양쪽이 같이 벌어져 잡고 있던
// 모서리가 함께 움직인다 — 왼쪽 핸들을 끄는데 오른쪽 모서리가 도망가는 셈이다. 잡은 쪽의
// 반대 모서리를 제자리에 두려면 너비 변화량의 절반만큼 중심 x를 함께 민다.
//   왼쪽 핸들  → 오른쪽 모서리(x + w/2) 고정 → x -= 변화량/2
//   오른쪽 핸들 → 왼쪽 모서리(x - w/2) 고정 → x += 변화량/2
// 요청한 변화량이 아니라 '클램프 뒤 실제로 반영된 변화량'을 쓴다. 최소·최대 너비에 닿은 뒤에도
// 요청값으로 밀면 너비는 그대로인 채 중심만 계속 흘러 블록이 옆으로 미끄러진다.
export const resizeBlockWidth = ({
	edge,
	width,
	widthDelta,
	x,
}: {
	edge: BlockResizeEdge;
	width: number;
	widthDelta: number;
	x: number;
}): { width: number; x: number } => {
	const nextWidth = clampBlockWidth(width + widthDelta);
	const applied = nextWidth - width;

	return {
		width: nextWidth,
		x: clampPercent(edge === "left" ? x - applied / 2 : x + applied / 2),
	};
};

interface ResizeStart {
	edge: BlockResizeEdge;
	id: string;
	pointerPercent: number;
	width: number;
	x: number;
}

// 캔버스 기준 백분율 리사이즈. use-block-drag와 같은 Pointer Events 패턴이다 —
// setPointerCapture로 포인터를 잡아 캔버스 밖으로 나가도 이벤트가 계속 들어온다.
// 드래그 시작 시점의 너비·좌표를 스냅샷으로 잡고 매번 그 값에서 다시 계산한다. 증분으로 더하면
// 클램프에 닿을 때마다 오차가 쌓여 손을 뗀 위치와 결과가 어긋난다.
export const useBlockResize = ({
	canvasRef,
	onResize,
}: {
	canvasRef: RefObject<HTMLDivElement | null>;
	onResize: (id: string, width: number, x: number) => void;
}) => {
	const startRef = useRef<ResizeStart | null>(null);

	const toPercent = useCallback(
		(clientX: number): number => {
			const canvas = canvasRef.current;

			if (!canvas) {
				return Number.NaN;
			}

			const rect = canvas.getBoundingClientRect();

			return ((clientX - rect.left) / rect.width) * 100;
		},
		[canvasRef]
	);

	const handlePointerDown = useCallback(
		(block: { id: string; width: number; x: number }, edge: BlockResizeEdge) =>
			(event: React.PointerEvent<HTMLElement>) => {
				// 핸들은 블록 위에 얹혀 있다. 전파를 멈추지 않으면 아래 블록의 드래그가 함께
				// 시작돼 너비를 줄이는 동안 블록이 포인터를 따라다닌다.
				event.stopPropagation();
				startRef.current = {
					edge,
					id: block.id,
					pointerPercent: toPercent(event.clientX),
					width: block.width,
					x: block.x,
				};
				event.currentTarget.setPointerCapture(event.pointerId);
			},
		[toPercent]
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			const start = startRef.current;

			if (!start) {
				return;
			}

			const delta = toPercent(event.clientX) - start.pointerPercent;

			// 레이아웃 전(rect.width가 0)의 0/0 = NaN. 흘리면 clampBlockWidth가 기본값 60%로
			// 되돌려 잡고 있던 너비가 통째로 튄다.
			if (Number.isNaN(delta)) {
				return;
			}

			const next = resizeBlockWidth({
				edge: start.edge,
				width: start.width,
				// 왼쪽 핸들은 포인터가 왼쪽으로 갈수록(음수 delta) 넓어진다.
				widthDelta: start.edge === "left" ? -delta : delta,
				x: start.x,
			});
			onResize(start.id, next.width, next.x);
		},
		[onResize, toPercent]
	);

	const handlePointerUp = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			startRef.current = null;
			event.currentTarget.releasePointerCapture(event.pointerId);
		},
		[]
	);

	return { handlePointerDown, handlePointerMove, handlePointerUp };
};

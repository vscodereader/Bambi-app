"use client";

import { useEffect, useState } from "react";

const KEYBOARD_HEIGHT_THRESHOLD_PX = 120;

interface MobileKeyboardState {
	isKeyboardOpen: boolean;
	visualViewportHeight: number | null;
}

export const getMobileKeyboardState = ({
	innerHeight,
	viewportHeight,
}: {
	innerHeight: number;
	viewportHeight: number;
}): MobileKeyboardState => ({
	isKeyboardOpen: innerHeight - viewportHeight > KEYBOARD_HEIGHT_THRESHOLD_PX,
	visualViewportHeight: viewportHeight,
});

/** VisualViewport 기준으로 모바일 키보드 노출과 실제 가용 높이를 추적한다. */
export const useMobileKeyboardState = (): MobileKeyboardState => {
	const [state, setState] = useState<MobileKeyboardState>({
		isKeyboardOpen: false,
		visualViewportHeight: null,
	});

	useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) {
			return;
		}

		const update = () => {
			setState(
				getMobileKeyboardState({
					innerHeight: window.innerHeight,
					viewportHeight: viewport.height,
				})
			);
		};

		update();
		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);

		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
		};
	}, []);

	return state;
};

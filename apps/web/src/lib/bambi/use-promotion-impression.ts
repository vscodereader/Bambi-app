"use client";

import { useCallback, useRef } from "react";

// 뷰포트 50% 이상 진입 시 onImpress를 1회 호출하는 옵저버.
// GTM Element Visibility 트리거 기본값(가시 50%·요소당 1회)을 따른다.
// 훅과 분리해 둔 이유: React 렌더 없이 노출 판정 로직만 단위 테스트하기 위해서다.
export const createImpressionObserver = (
	onImpress: () => void
): IntersectionObserver | null => {
	if (typeof IntersectionObserver === "undefined") {
		return null;
	}
	let fired = false;
	const observer = new IntersectionObserver(
		(entries) => {
			if (fired || !entries.some((entry) => entry.isIntersecting)) {
				return;
			}
			fired = true;
			observer.disconnect();
			onImpress();
		},
		{ threshold: 0.5 }
	);
	return observer;
};

// 배너 요소에 붙이는 ref 콜백을 돌려준다. onImpress가 null이면(계측 대상 아님)
// 관측하지 않는다. 마운트당 1회만 발화하고(firedRef), ref가 null로 호출되면
// (언마운트·요소 교체) 옵저버를 해제한다 — 라우트를 떠났다 돌아오면 컴포넌트가
// 다시 마운트되므로 노출도 다시 1회 잡힌다.
// onImpress가 바뀌면 ref 콜백도 새로 만들어져 React가 detach 후 재attach한다.
// 그래야 처음엔 null이었다가(예: 계측 대상 판정이 늦게 확정) 나중에 콜백이 생긴
// 경우에도 관측을 다시 시도한다. 재생성된 IntersectionObserver는 현재 가시 상태로
// 초기 콜백을 주므로 이미 화면에 떠 있는 배너도 놓치지 않는다.
export function usePromotionImpression(
	onImpress: (() => void) | null
): (element: HTMLElement | null) => void {
	const firedRef = useRef(false);
	const observerRef = useRef<IntersectionObserver | null>(null);

	return useCallback(
		(element: HTMLElement | null) => {
			observerRef.current?.disconnect();
			observerRef.current = null;
			if (!element || firedRef.current || !onImpress) {
				return;
			}
			observerRef.current = createImpressionObserver(() => {
				firedRef.current = true;
				onImpress();
			});
			observerRef.current?.observe(element);
		},
		[onImpress]
	);
}

"use client";

import { useEffect } from "react";

/**
 * 작성 중 이탈 방지: enabled가 true인 동안 브라우저 탭 닫기·새로고침·주소 이동 시
 * 기본 확인 경고를 띄운다. (앱 내부 링크 이동은 각 화면에서 별도 확인 처리)
 */
export function useUnsavedChangesWarning(enabled: boolean) {
	useEffect(() => {
		if (!enabled) {
			return;
		}

		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [enabled]);
}

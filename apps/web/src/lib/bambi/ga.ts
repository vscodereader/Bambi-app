type GtagFn = (
	command: "event",
	eventName: string,
	params: Record<string, unknown>
) => void;

const getGtag = (): GtagFn | null => {
	if (typeof window === "undefined") {
		return null;
	}

	const gtag = (window as { gtag?: unknown }).gtag;
	return typeof gtag === "function" ? (gtag as GtagFn) : null;
};

// GA는 제품 동작의 보조 계층이다. 로컬·프리뷰·차단 브라우저에서 gtag가 없거나
// 확장 프로그램이 호출을 가로채 예외를 던져도 렌더링과 내비게이션은 계속돼야 한다.
export const sendGaEvent = (
	eventName: string,
	params: Record<string, unknown> = {}
): void => {
	const gtag = getGtag();
	if (!gtag) {
		return;
	}

	try {
		gtag("event", eventName, params);
	} catch {
		// 분석 실패는 사용자 기능을 막지 않는다.
	}
};

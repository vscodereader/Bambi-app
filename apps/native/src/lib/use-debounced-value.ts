import { useEffect, useState } from "react";

// 웹 useDebouncedValue 이식 — 타이핑 사이 250ms 쉴 때만 값을 확정한다.
// 공고 검색과 운영자 사용자 목록이 공유한다.
export function useDebouncedValue(value: string, delayMs = 250): string {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);

		return () => clearTimeout(timer);
	}, [value, delayMs]);

	return debounced;
}

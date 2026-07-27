"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useEffect, useState } from "react";

const TYPING_INTERVAL_MS = 110;

// 의존성 없는 타이핑 연출. 커서는 Tailwind animate-pulse로 대신한다.
export function TypingText({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const [visibleCount, setVisibleCount] = useState(0);

	useEffect(() => {
		setVisibleCount(0);
		const timer = setInterval(() => {
			setVisibleCount((count) => {
				if (count >= text.length) {
					clearInterval(timer);
					return count;
				}
				return count + 1;
			});
		}, TYPING_INTERVAL_MS);

		return () => clearInterval(timer);
	}, [text]);

	return (
		<span className={cn("inline-flex items-center", className)}>
			{text.slice(0, visibleCount)}
			<span aria-hidden="true" className="ml-0.5 animate-pulse">
				|
			</span>
		</span>
	);
}

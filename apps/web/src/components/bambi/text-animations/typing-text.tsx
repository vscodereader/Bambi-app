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

	// 아직 안 친 부분도 invisible로 자리를 잡아 둔다 — 한 글자씩 늘어나며 줄바꿈·폭이 튀는 걸 막고
	// (광고 8칸이면 그만큼 CLS다) DOM·복사·크롤러에는 문구 전체가 남는다.
	// 다만 **문구는 한 번 사라진다**: 서버 HTML이 문구 전체를 그린 뒤 하이드레이션에서 이 컴포넌트가
	// visibleCount=0으로 마운트되므로, 보이던 글자가 지워졌다가 타이핑된다(막는 건 레이아웃 점프뿐이다).
	return (
		<span className={cn("inline-flex items-center", className)}>
			{text.slice(0, visibleCount)}
			<span aria-hidden="true" className="ml-0.5 animate-pulse">
				|
			</span>
			<span className="invisible">{text.slice(visibleCount)}</span>
		</span>
	);
}

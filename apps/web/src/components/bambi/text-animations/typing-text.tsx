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
	// inline-flex로 감싸면 세 조각이 한 줄에 강제로 붙어(flex-wrap 기본값 nowrap) 세로 슬롯처럼
	// 좁은 곳에서 긴 문구가 슬롯 밖으로 잘려 나간다. 일반 인라인 흐름이라야 줄바꿈이 된다.
	// 다 친 뒤에도 커서가 깜빡이면 광고 슬롯 여덟 칸에서 영구히 뛰는 점이 된다. 다만 요소는
	// 남기고 invisible로만 감춘다 — 빼 버리면 그 폭만큼 마지막에 한 번 줄이 밀린다.
	return (
		<span className={cn("inline", className)}>
			{text.slice(0, visibleCount)}
			<span
				aria-hidden="true"
				className={cn(
					"ml-0.5",
					visibleCount < text.length ? "animate-pulse" : "invisible"
				)}
			>
				|
			</span>
			<span className="invisible">{text.slice(visibleCount)}</span>
		</span>
	);
}

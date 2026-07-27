"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useEffect, useState } from "react";
import { AD_BANNER_ANIMATION_PAUSE_MS } from "@/lib/bambi/ad-banner-layout";

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

	// 다 친 뒤 정지 구간만큼 쉬었다가 0으로 되돌려 다시 친다.
	// setInterval이 아니라 매 tick이 다음 tick을 예약하는 방식인 이유: 한 주기 안에 간격이 두
	// 종류(타이핑 110ms · 정지 3s)라 고정 간격 타이머로는 두 번째 타이머를 따로 띄워야 하고,
	// 그러면 언마운트·text 변경 시 정리해야 할 핸들이 둘로 늘어난다. 예약이 항상 하나뿐이라
	// 정리는 clearTimeout 한 번으로 끝나고 예약이 남지 않는다.
	// 진행도를 state가 아니라 이펙트 지역 변수로 두는 것도 같은 이유다 — updater 안에서
	// 타이머를 예약하면 순수하지 않은 updater가 되어 StrictMode의 이중 호출에 타이머가 샌다.
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		let count = 0;

		const tick = () => {
			count = count >= text.length ? 0 : count + 1;
			setVisibleCount(count);
			timer = setTimeout(
				tick,
				count >= text.length ? AD_BANNER_ANIMATION_PAUSE_MS : TYPING_INTERVAL_MS
			);
		};

		setVisibleCount(0);
		timer = setTimeout(tick, TYPING_INTERVAL_MS);

		return () => clearTimeout(timer);
	}, [text]);

	// 아직 안 친 부분도 invisible로 자리를 잡아 둔다 — 한 글자씩 늘어나며 줄바꿈·폭이 튀는 걸 막고
	// (광고 8칸이면 그만큼 CLS다) DOM·복사·크롤러에는 문구 전체가 남는다.
	// 다만 **문구는 한 번 사라진다**: 서버 HTML이 문구 전체를 그린 뒤 하이드레이션에서 이 컴포넌트가
	// visibleCount=0으로 마운트되므로, 보이던 글자가 지워졌다가 타이핑된다(막는 건 레이아웃 점프뿐이다).
	// inline-flex로 감싸면 세 조각이 한 줄에 강제로 붙어(flex-wrap 기본값 nowrap) 세로 슬롯처럼
	// 좁은 곳에서 긴 문구가 슬롯 밖으로 잘려 나간다. 일반 인라인 흐름이라야 줄바꿈이 된다.
	// 다 친 뒤(= 정지 구간)에도 커서가 깜빡이면 광고 슬롯 여덟 칸에서 계속 뛰는 점이 된다.
	// 다만 요소는 남기고 invisible로만 감춘다 — 빼 버리면 그 폭만큼 매 주기 끝에 줄이 밀린다.
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

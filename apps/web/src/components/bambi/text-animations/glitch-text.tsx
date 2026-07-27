"use client";

import { cn } from "@bambi-app/ui/lib/utils";

// React Bits GlitchText를 배너용으로 옮긴 것. 원본은 ::before/::after로 텍스트를 두 벌 복제하고
// 배경색을 깔아 원본을 가린 뒤 clip-path로 잘라 어긋나게 보여준다 — 배경색이 효과의 부품이라
// 투명하게 두면 세 겹이 겹쳐 뭉개진 글자가 된다. 그래서 호출자가 배너 배경색(또는 스크림 색)을
// scrimColor로 넘겨 pseudo 배경에 주입한다.
// 원본의 무한 반복은 슬롯 8칸 상시 리페인트가 되므로 @theme에서 유한 횟수로 바꿨다.
export function GlitchText({
	className,
	scrimColor,
	text,
}: {
	className?: string;
	scrimColor: string;
	text: string;
}) {
	return (
		<span
			className={cn(
				"relative inline-block",
				// 복제본에 w-full을 주는 이유: absolute라 기본이 shrink-to-fit인데, 블록 너비가
				// 고정되면서 본문이 여러 줄로 접힌다. 폭이 다르면 복제본은 다른 지점에서 접혀
				// 잔상이 본문과 어긋난 자리에 찍힌다.
				"before:absolute before:top-0 before:-left-0.5 before:w-full before:animate-glitch-before before:overflow-hidden before:bg-[var(--glitch-bg)] before:text-glitch-cyan before:content-[attr(data-text)]",
				"after:absolute after:top-0 after:left-0.5 after:w-full after:animate-glitch-after after:overflow-hidden after:bg-[var(--glitch-bg)] after:text-glitch-red after:content-[attr(data-text)]",
				className
			)}
			data-text={text}
			// 구인자가 고른 배경색은 값이 무한한 런타임 데이터라 Tailwind 클래스로 표현할 수 없다.
			// CSS 변수 주입에만 한정한다(일반 스타일은 전부 className, 잔상 색도 @theme 토큰이다).
			style={{ "--glitch-bg": scrimColor } as React.CSSProperties}
		>
			{text}
		</span>
	);
}

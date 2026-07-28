"use client";

import { cn } from "@bambi-app/ui/lib/utils";

// React Bits GlitchText를 배너용으로 옮긴 것. 원본은 ::before/::after로 텍스트를 두 벌 복제하고
// 배경색을 깔아 원본을 가린 뒤 clip-path로 잘라 어긋나게 보여준다 — 배경색이 효과의 부품이라
// 투명하게 두면 세 겹이 겹쳐 뭉개진 글자가 된다. 그래서 호출자가 배너 배경색(또는 스크림 색)을
// scrimColor로 넘겨 pseudo 배경에 주입한다.
// 원본의 쉼 없는 무한 반복은 슬롯 8칸 상시 리페인트가 되므로, @theme에서 한 사이클을
// "2s 버스트 + 3s 정지"로 쪼개 반복시킨다(정지 길이는 네 연출이 공유하는 값이다).
//
// 색수차는 "복제본을 통째로 물들이는" 게 아니라 원본과 같이 좌우로 어긋난 그림자로 낸다.
// 복제본 글자색을 cyan/red로 칠하면 잘라낸 가로 띠가 통째로 색면이 되어, 굵은 글자에서는
// 글자 조각이 아니라 "색 직사각형"으로 읽힌다. 원본은 복제본 글자색을 본문과 같게 두고
// left로 어긋낸 뒤 반대 방향 text-shadow로 색을 흘려, 글자가 찢겨 어긋난 것처럼 보이게 한다.
// 어긋남 폭은 em이다 — 배너 문구 크기가 cqw 기반 런타임 값이라 px로 두면 큰 배너에선 안 보이고
// 작은 배너에선 과해진다.
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
				"before:absolute before:top-0 before:-left-[0.15em] before:w-full before:animate-glitch-before before:overflow-hidden before:bg-[var(--glitch-bg)] before:content-[attr(data-text)] before:[text-shadow:0.15em_0_var(--glitch-cyan)]",
				"after:absolute after:top-0 after:left-[0.15em] after:w-full after:animate-glitch-after after:overflow-hidden after:bg-[var(--glitch-bg)] after:content-[attr(data-text)] after:[text-shadow:-0.15em_0_var(--glitch-red)]",
				className
			)}
			data-text={text}
			// 구인자가 고른 배경색은 값이 무한한 런타임 데이터라 Tailwind 클래스로 표현할 수 없다.
			// CSS 변수 주입에만 한정한다(일반 스타일은 전부 className, 색수차 색도 index.css 토큰이다).
			style={{ "--glitch-bg": scrimColor } as React.CSSProperties}
		>
			{text}
		</span>
	);
}

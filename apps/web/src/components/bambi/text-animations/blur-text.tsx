"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";

// React Bits BlurText를 배너용으로 줄인 것. 원본의 IntersectionObserver를 걷어내고
// 마운트 시 1회만 재생한다 — 슬롯이 8칸 동시에 떠도 각자 한 번씩만 돌고 멈춘다.
// gsap 코어만 쓴다(플러그인 없음). 이 파일이 유일한 gsap 진입점이라 ad-banner-text의
// React.lazy가 광고 없는 페이지에서 gsap 청크를 통째로 빼준다.
export function BlurText({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const containerRef = useRef<HTMLSpanElement>(null);
	const words = text.split(" ");

	// useEffect가 아니라 useLayoutEffect다 — 패시브 이펙트는 페인트 뒤에 돌 수 있어
	// 선명한 문구가 한 프레임 보였다가 blur로 되돌아가는 역방향 깜빡임이 생긴다.
	// (게이트 덕에 이 컴포넌트는 클라이언트에서만 마운트돼 SSR 경고 대상이 아니다.)
	useLayoutEffect(() => {
		// context에 스코프를 묶어두면 revert() 한 번으로 트윈 종료 + gsap이 심은 인라인
		// 스타일 원복까지 끝난다 — 언마운트 뒤 blur(10px)로 굳은 잔재가 남지 않는다.
		const ctx = gsap.context(() => {
			gsap.fromTo(
				"span",
				{ filter: "blur(10px)", opacity: 0, y: -12 },
				{
					duration: 0.5,
					ease: "power2.out",
					filter: "blur(0px)",
					opacity: 1,
					stagger: 0.12,
					y: 0,
				}
			);
		}, containerRef);

		return () => ctx.revert();
	}, []);

	return (
		<span
			className={cn("flex flex-wrap justify-center gap-x-1", className)}
			ref={containerRef}
		>
			{words.map((word, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: 같은 단어가 반복될 수 있어 값으로 키를 못 만든다
				<span key={`${word}-${index}`}>{word}</span>
			))}
		</span>
	);
}

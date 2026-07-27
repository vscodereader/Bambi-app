"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

gsap.registerPlugin(SplitText);

// React Bits SplitText를 배너용으로 줄인 것. 원본의 ScrollTrigger는 걷어냈다 — 이 프로젝트는
// 마운트 시 1회 재생 정책이고, 애니메이션 게이트(ad-banner-text.tsx)가 그 역할을 이미 한다.
// @gsap/react(useGSAP)도 쓰지 않는다: gsap.context + useLayoutEffect가 같은 스코핑·정리를 준다.
export function SplitTextAnimation({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const containerRef = useRef<HTMLSpanElement>(null);
	// 폰트 로드 전에 글자를 쪼개면 잘못된 위치로 분리된다(원본이 같은 이유로 기다린다).
	const [fontsReady, setFontsReady] = useState(false);

	useEffect(() => {
		if (document.fonts.status === "loaded") {
			setFontsReady(true);
			return;
		}

		let cancelled = false;
		document.fonts.ready.then(() => {
			if (!cancelled) {
				setFontsReady(true);
			}
		});

		return () => {
			cancelled = true;
		};
	}, []);

	// useEffect가 아니라 useLayoutEffect인 이유: 패시브 이펙트는 페인트 뒤에 돌 수 있어
	// "완성된 문구가 한 프레임 보였다가 from 상태로 되돌아가는" 역방향 깜빡임이 생긴다.
	useLayoutEffect(() => {
		if (!(fontsReady && containerRef.current)) {
			return;
		}

		const element = containerRef.current;
		const split = new SplitText(element, { type: "chars" });
		const ctx = gsap.context(() => {
			gsap.fromTo(
				split.chars,
				{ opacity: 0, y: 24 },
				{ duration: 0.6, ease: "power3.out", opacity: 1, stagger: 0.04, y: 0 }
			);
		}, containerRef);

		return () => {
			ctx.revert();
			split.revert();
		};
	}, [fontsReady]);

	return (
		<span className={cn("inline-block", className)} ref={containerRef}>
			{text}
		</span>
	);
}

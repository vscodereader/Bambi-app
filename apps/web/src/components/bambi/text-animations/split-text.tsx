"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AD_BANNER_ANIMATION_PAUSE_MS } from "@/lib/bambi/ad-banner-layout";

gsap.registerPlugin(SplitText);

// React Bits SplitText를 배너용으로 줄인 것. 원본의 ScrollTrigger는 걷어냈다 — 재생 여부는
// 애니메이션 게이트(ad-banner-text.tsx)가 정한다(모션 최소화 선호면 아예 마운트되지 않는다).
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
	// 초기값을 지연 초기화로 읽는 게 핵심이다 — false로 시작하면 이미 폰트가 로드된 경우에도
	// "정적 문구 페인트 → useEffect → setState → 다음 커밋에서 리셋" 순서라 매번 한 프레임
	// 완성된 문구가 보였다 사라진다(아래 useLayoutEffect가 막으려던 바로 그 깜빡임이다).
	// 이 컴포넌트는 애니메이션 게이트 덕에 클라이언트에서만 마운트돼 document 접근이 안전하다.
	const [fontsReady, setFontsReady] = useState(
		() => document.fonts.status === "loaded"
	);

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
			// repeat: -1 + repeatDelay면 타이머를 직접 굴리지 않아도 "재생 → 정지 → 재생"이 된다.
			// yoyo를 켜지 않았으므로 매 반복은 되감기가 아니라 from 상태(opacity 0 · y 24)로
			// 즉시 되돌아간 뒤 다시 to로 간다 — 글자가 거꾸로 흩어졌다 모이는 역재생이 아니다.
			gsap.fromTo(
				split.chars,
				{ opacity: 0, y: 24 },
				{
					duration: 0.6,
					ease: "power3.out",
					opacity: 1,
					repeat: -1,
					repeatDelay: AD_BANNER_ANIMATION_PAUSE_MS / 1000,
					stagger: 0.04,
					y: 0,
				}
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

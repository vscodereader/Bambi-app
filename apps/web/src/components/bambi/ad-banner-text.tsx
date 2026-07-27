"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { lazy, Suspense, useEffect, useState } from "react";
import type { AdBannerAnimation } from "@/lib/bambi/ad-banner-animations";
import { TypingText } from "./text-animations/typing-text";

// gsap을 쓰는 연출만 별도 청크로 쪼갠다 — 광고가 없는 페이지에는 번들이 실리지 않는다.
// next/dynamic이 아니라 React.lazy를 쓴다: dynamic의 loading 컴포넌트는 props를 못 받아
// 청크가 도착할 때까지 문구 자리가 빈칸이 되지만, Suspense fallback은 호출부라 문구를 넣을 수 있다.
// SSR에서 gsap이 열릴 일은 없다 — 아래 게이트가 마운트 전에는 항상 정적 문구만 그린다(= ssr:false와 동일).
const BlurText = lazy(() =>
	import("./text-animations/blur-text").then((mod) => ({
		default: mod.BlurText,
	}))
);
const DecryptedText = lazy(() =>
	import("./text-animations/decrypted-text").then((mod) => ({
		default: mod.DecryptedText,
	}))
);

// ⚠️ 계약 — 이 두 클래스는 글자 색을 "배경 그라디언트"로 대신 그린다(bg-clip-text + text-transparent).
// 호출자가 className에 text-white·text-ink-900 같은 text-* 색을 넘기면 tailwind-merge가 뒤에 온 색을
// 이기게 두면서 text-transparent를 지우고, 글자가 불투명하게 칠해져 연출이 **소리 없이** 사라진다.
// 에러도 경고도 없고 화면엔 그냥 평범한 글자가 남아 회귀를 알아채기 어렵다.
// → shiny·gradient에는 텍스트 색 클래스를 넘기지 말 것. 색과 연출을 함께 쓰려면 오버레이 분리가 필요하다(후속 태스크).
const SHINY_CLASS_NAME =
	"animate-shiny bg-[linear-gradient(110deg,rgb(255_255_255/0.72)_35%,rgb(255_255_255)_50%,rgb(255_255_255/0.72)_65%)] bg-[length:200%_100%] bg-clip-text text-transparent";
const GRADIENT_CLASS_NAME =
	"animate-gradient bg-[linear-gradient(90deg,var(--color-coral-300),var(--color-coral-500),var(--color-coral-300))] bg-[length:200%_auto] bg-clip-text text-transparent";

// 애니메이션을 켜도 되는 시점인지 알려준다. 마운트 전에는 항상 false다:
// (1) 모션 최소화 선호는 마운트 후에야 읽을 수 있고(접근성),
// (2) 서버 HTML에 문구가 그대로 남아야 광고 8칸이 빈칸으로 시작하지 않는다(CLS·크롤러·JS 비활성).
const useAnimationEnabled = (): boolean => {
	const [enabled, setEnabled] = useState(false);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setEnabled(!query.matches);

		const onChange = (event: MediaQueryListEvent) => {
			setEnabled(!event.matches);
		};
		query.addEventListener("change", onChange);

		return () => query.removeEventListener("change", onChange);
	}, []);

	return enabled;
};

// 애니메이션 값에 맞는 렌더를 고른다. animation이 null이면 정적 텍스트다.
export function AdBannerText({
	animation,
	className,
	text,
}: {
	animation: AdBannerAnimation | null;
	className?: string;
	text: string;
}) {
	const animationEnabled = useAnimationEnabled();
	// 서버·첫 페인트·청크 대기 중에 그려지는 문구. 셋이 같은 자리를 차지해야 레이아웃이 안 튄다.
	const staticText = <span className={className}>{text}</span>;

	if (!(animation && animationEnabled)) {
		return staticText;
	}

	if (animation === "blur-in") {
		return (
			<Suspense fallback={staticText}>
				<BlurText className={className} text={text} />
			</Suspense>
		);
	}

	if (animation === "decrypt") {
		return (
			<Suspense fallback={staticText}>
				<DecryptedText className={className} text={text} />
			</Suspense>
		);
	}

	if (animation === "typing") {
		return <TypingText className={className} text={text} />;
	}

	if (animation === "shiny") {
		return <span className={cn(SHINY_CLASS_NAME, className)}>{text}</span>;
	}

	return <span className={cn(GRADIENT_CLASS_NAME, className)}>{text}</span>;
}

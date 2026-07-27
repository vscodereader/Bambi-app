"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { AdBannerAnimation } from "@/lib/bambi/ad-banner-animations";
import { TypingText } from "./text-animations/typing-text";

// motion을 쓰는 연출만 지연 로드한다 — 광고가 없는 페이지에는 번들이 실리지 않는다.
const BlurText = dynamic(
	() => import("./text-animations/blur-text").then((mod) => mod.BlurText),
	{ ssr: false }
);
const DecryptedText = dynamic(
	() =>
		import("./text-animations/decrypted-text").then((mod) => mod.DecryptedText),
	{ ssr: false }
);

// CSS만으로 되는 연출. 배경을 글자에 클리핑해 흐르게 한다. 밝은 띠가 지나가는 연출이라
// 바탕 색까지 흰색으로 채운다 — 투명한 바탕이면 띠가 지나갈 때만 글자가 보인다.
const SHINY_CLASS_NAME =
	"animate-shiny bg-[linear-gradient(110deg,rgb(255_255_255/0.72)_35%,rgb(255_255_255)_50%,rgb(255_255_255/0.72)_65%)] bg-[length:200%_100%] bg-clip-text text-transparent motion-reduce:animate-none";
const GRADIENT_CLASS_NAME =
	"animate-gradient bg-[linear-gradient(90deg,var(--color-coral-300),var(--color-coral-500),var(--color-coral-300))] bg-[length:200%_auto] bg-clip-text text-transparent motion-reduce:animate-none";

// 시스템이 모션 최소화를 요청하면 애니메이션 없이 최종 상태만 그린다(접근성).
const usePrefersReducedMotion = (): boolean => {
	const [prefersReduced, setPrefersReduced] = useState(false);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setPrefersReduced(query.matches);

		const onChange = (event: MediaQueryListEvent) => {
			setPrefersReduced(event.matches);
		};
		query.addEventListener("change", onChange);

		return () => query.removeEventListener("change", onChange);
	}, []);

	return prefersReduced;
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
	const prefersReducedMotion = usePrefersReducedMotion();

	if (!animation || prefersReducedMotion) {
		return <span className={className}>{text}</span>;
	}

	if (animation === "blur-in") {
		return <BlurText className={className} text={text} />;
	}

	if (animation === "decrypt") {
		return <DecryptedText className={className} text={text} />;
	}

	if (animation === "typing") {
		return <TypingText className={className} text={text} />;
	}

	if (animation === "shiny") {
		return <span className={cn(SHINY_CLASS_NAME, className)}>{text}</span>;
	}

	return <span className={cn(GRADIENT_CLASS_NAME, className)}>{text}</span>;
}

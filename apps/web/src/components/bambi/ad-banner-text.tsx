"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import {
	AD_BANNER_DEFAULT_BACKGROUND_COLOR,
	type AdBannerAnimation,
} from "@/lib/bambi/ad-banner-layout";
import { GlitchText } from "./text-animations/glitch-text";
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
const SplitTextAnimation = lazy(() =>
	import("./text-animations/split-text").then((mod) => ({
		default: mod.SplitTextAnimation,
	}))
);

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
	// 글리치의 pseudo 배경색은 효과의 부품이다(투명하면 세 겹이 뭉개진다).
	// 렌더러가 배너 배경·스크림 색을 넘기지 않으면 기본 배경색으로 대신한다.
	scrimColor = AD_BANNER_DEFAULT_BACKGROUND_COLOR,
	text,
}: {
	animation: AdBannerAnimation | null;
	className?: string;
	scrimColor?: string;
	text: string;
}) {
	const animationEnabled = useAnimationEnabled();
	// 서버·첫 페인트·청크 대기 중에 그려지는 문구. 셋이 같은 자리를 차지해야 레이아웃이 안 튄다.
	const staticText = <span className={className}>{text}</span>;

	if (!(animation && animationEnabled)) {
		return staticText;
	}

	if (animation === "split") {
		return (
			<Suspense fallback={staticText}>
				<SplitTextAnimation className={className} text={text} />
			</Suspense>
		);
	}

	if (animation === "typing") {
		return <TypingText className={className} text={text} />;
	}

	if (animation === "glitch") {
		return (
			<GlitchText className={className} scrimColor={scrimColor} text={text} />
		);
	}

	return (
		<Suspense fallback={staticText}>
			<BlurText className={className} text={text} />
		</Suspense>
	);
}

"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import gsap from "gsap";
import { Fragment, useLayoutEffect, useRef } from "react";
import { AD_BANNER_ANIMATION_PAUSE_MS } from "@/lib/bambi/ad-banner-layout";

// React Bits BlurText를 배너용으로 줄인 것. 원본의 IntersectionObserver를 걷어내고
// "재생 → 정지 → 재생"으로 반복한다 — 슬롯이 8칸 동시에 떠도 대부분의 시간은 정지 구간이라
// 상시 리페인트가 되지 않는다(정지 길이는 네 연출이 같은 상수를 공유한다).
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
			// repeat: -1 + repeatDelay면 타이머를 직접 굴리지 않아도 "재생 → 정지 → 재생"이 된다.
			// yoyo를 켜지 않았으므로 매 반복은 되감기가 아니라 from 상태(blur 10px)로 즉시
			// 되돌아간 뒤 다시 to로 간다 — 선명한 글자가 흐려지는 역재생이 보이지 않는다.
			gsap.fromTo(
				"span",
				{ filter: "blur(10px)", opacity: 0, y: -12 },
				{
					duration: 0.5,
					ease: "power2.out",
					filter: "blur(0px)",
					opacity: 1,
					repeat: -1,
					repeatDelay: AD_BANNER_ANIMATION_PAUSE_MS / 1000,
					stagger: 0.12,
					y: 0,
				}
			);
		}, containerRef);

		return () => ctx.revert();
	}, []);

	// flex 컨테이너로 두면 상위 블록의 정렬(text-left/right)이 단어 배치에 전혀 반영되지 않아
	// 구인자가 고른 정렬이 무시된다. 인라인 흐름으로 두면 text-align이 그대로 먹는다.
	// 단어 사이는 실제 공백 문자로 띄우고, 단어만 inline-block으로 만든다 —
	// 인라인 요소에는 transform이 적용되지 않아 gsap의 y 이동이 죽는다.
	return (
		<span className={cn("inline", className)} ref={containerRef}>
			{words.map((word, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: 같은 단어가 반복될 수 있어 값으로 키를 못 만든다
				<Fragment key={`${word}-${index}`}>
					<span className="inline-block">{word}</span>{" "}
				</Fragment>
			))}
		</span>
	);
}

"use client";

// 매뉴얼 전용 "맨 위로" 플로팅 버튼. 문의하기 FAB(fixed right-4 bottom-20·size-13,
// md부터 bottom-6) 바로 위에 얹는다 — 모바일 bottom-36(=80+52+12px), md부터 bottom-22.
// lg+는 좌측 sticky 목차가 문서 내비를 대신하므로 숨긴다. 매뉴얼 화면(ManualScreen)에서만
// 마운트돼 다른 페이지에는 나타나지 않는다.
import { Button } from "@bambi-app/ui/components/button";
import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

// 등장 임계값 — 이만큼 내려간 뒤에만 보여, 최상단에서의 시각 소음과 문의하기 FAB
// 주변의 버튼 밀집을 피한다.
const SHOW_AFTER_PX = 480;

export function ManualScrollTop() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const onScroll = () => {
			setVisible(window.scrollY > SHOW_AFTER_PX);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	if (!visible) {
		return null;
	}

	return (
		<Button
			aria-label="맨 위로"
			className="fixed right-4 bottom-36 z-50 size-13 rounded-full md:bottom-22 lg:hidden"
			onClick={() => {
				const reduceMotion = window.matchMedia(
					"(prefers-reduced-motion: reduce)"
				).matches;
				window.scrollTo({ behavior: reduceMotion ? "auto" : "smooth", top: 0 });
			}}
			size="icon-lg"
		>
			<ArrowUp className="size-6" />
		</Button>
	);
}

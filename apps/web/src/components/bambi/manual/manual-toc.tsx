"use client";

// 파싱된 h2/h3 목록을 앵커 링크로 렌더한다. 배치(사이드바/접이식)는 부모가 결정.
// key는 slug 하나면 충분하다 — 매뉴얼 3종 모두 파일 내 h2/h3 제목이 유일함을 확인했다.
// scrollspy: 뷰포트 상단(sticky 헤더 오프셋 아래)을 마지막으로 지난 헤딩을 현재
// 섹션으로 보고 하이라이트한다. 교차 이벤트는 재계산 트리거로만 쓴다 — 판정을
// 이벤트 누적으로 하면 빠른 스크롤에서 상태가 어긋난다.
import { cn } from "@bambi-app/ui/lib/utils";
import { useEffect, useState } from "react";
import type { ManualHeading } from "@/lib/bambi/manual-parse";

// 헤딩 scroll-mt-24(96px)와 같은 기준선. 이보다 위로 지나간 헤딩이 "읽는 중"이다.
const TOP_OFFSET = 100;

export function ManualToc({ headings }: { headings: ManualHeading[] }) {
	const [activeSlug, setActiveSlug] = useState<null | string>(null);

	useEffect(() => {
		const elements = headings
			.map((heading) => document.getElementById(heading.slug))
			.filter((el): el is HTMLElement => el !== null);
		if (elements.length === 0) {
			return;
		}
		const recompute = () => {
			let current: null | string = null;
			for (const el of elements) {
				if (el.getBoundingClientRect().top <= TOP_OFFSET) {
					current = el.id;
				} else {
					break;
				}
			}
			setActiveSlug(current);
		};
		const observer = new IntersectionObserver(recompute, {
			rootMargin: "-96px 0px 0px 0px",
		});
		for (const el of elements) {
			observer.observe(el);
		}
		recompute();
		return () => observer.disconnect();
	}, [headings]);

	return (
		<nav aria-label="목차" className="flex flex-col gap-1 text-sm">
			{headings.map((heading) => {
				const isActive = heading.slug === activeSlug;
				return (
					<a
						aria-current={isActive ? "location" : undefined}
						className={cn(
							"border-transparent border-l-2 pl-3 text-muted-foreground no-underline transition-colors hover:text-foreground",
							heading.depth === 3 && "pl-7",
							isActive && "border-primary font-medium text-foreground"
						)}
						href={`#${heading.slug}`}
						key={heading.slug}
					>
						{heading.text}
					</a>
				);
			})}
		</nav>
	);
}

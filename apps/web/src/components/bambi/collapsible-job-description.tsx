"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

export function CollapsibleJobDescription({
	children,
}: {
	children: ReactNode;
}) {
	const contentRef = useRef<HTMLDivElement>(null);
	const sectionRef = useRef<HTMLElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [overflowing, setOverflowing] = useState(false);
	const [collapsedHeight, setCollapsedHeight] = useState<number>();
	const [fadeHeight, setFadeHeight] = useState<number>();

	const measure = useCallback(() => {
		const content = contentRef.current;
		const section = sectionRef.current;
		if (!(content && section)) {
			return;
		}
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		const viewportElements = Array.from(
			document.querySelectorAll<HTMLElement>("body *")
		).filter((element) => {
			const position = window.getComputedStyle(element).position;
			return position === "fixed" || position === "sticky";
		});
		const topInset = viewportElements.reduce((inset, element) => {
			const rect = element.getBoundingClientRect();
			return rect.top <= 0 && rect.bottom > 0
				? Math.max(inset, rect.bottom)
				: inset;
		}, 0);
		const bottomInset = viewportElements.reduce((inset, element) => {
			const rect = element.getBoundingClientRect();
			return rect.top < viewportHeight && rect.bottom >= viewportHeight
				? Math.max(inset, viewportHeight - rect.top)
				: inset;
		}, 0);
		const sectionStyle = window.getComputedStyle(section);
		const contentOffset = content.offsetTop;
		const sectionBottomPadding = Number.parseFloat(sectionStyle.paddingBottom);
		const button = buttonRef.current;
		const buttonBlockHeight = button
			? button.offsetHeight +
				Number.parseFloat(window.getComputedStyle(button).marginTop)
			: 0;
		const nextSection = section.nextElementSibling as HTMLElement | null;
		const nextHeading = nextSection?.querySelector<HTMLElement>("h2") ?? null;
		const nextStyle = nextSection ? window.getComputedStyle(nextSection) : null;
		const nextPeekHeight =
			nextSection && nextHeading
				? nextHeading.getBoundingClientRect().bottom -
					nextSection.getBoundingClientRect().top
				: 0;
		const nextMargin = nextStyle ? Number.parseFloat(nextStyle.marginTop) : 0;
		setFadeHeight(buttonBlockHeight + nextPeekHeight);
		const availableHeight = Math.max(
			0,
			viewportHeight -
				topInset -
				bottomInset -
				contentOffset -
				sectionBottomPadding -
				buttonBlockHeight -
				nextMargin -
				nextPeekHeight
		);
		setCollapsedHeight(availableHeight);
		setOverflowing(content.scrollHeight > availableHeight);
	}, []);

	useEffect(() => {
		const content = contentRef.current;
		const section = sectionRef.current;
		if (!(content && section)) {
			return;
		}
		measure();
		const buttonMeasureFrame = overflowing
			? window.requestAnimationFrame(measure)
			: undefined;
		const observer = new ResizeObserver(measure);
		observer.observe(content);
		observer.observe(section);
		const nextSection = section.nextElementSibling;
		if (nextSection) {
			observer.observe(nextSection);
		}
		window.addEventListener("resize", measure);
		window.visualViewport?.addEventListener("resize", measure);
		return () => {
			if (buttonMeasureFrame !== undefined) {
				window.cancelAnimationFrame(buttonMeasureFrame);
			}
			observer.disconnect();
			window.removeEventListener("resize", measure);
			window.visualViewport?.removeEventListener("resize", measure);
		};
	}, [measure, overflowing]);
	return (
		<section
			className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7"
			ref={sectionRef}
		>
			<h2 className="m-0 font-extrabold text-xl">공고 설명</h2>
			<div className="relative mt-4">
				<div
					className={expanded ? undefined : "overflow-hidden"}
					ref={contentRef}
					style={
						expanded || collapsedHeight === undefined
							? undefined
							: { maxHeight: collapsedHeight }
					}
				>
					{children}
				</div>
				{overflowing && !expanded && fadeHeight ? (
					<div
						className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-card to-transparent"
						style={{ height: fadeHeight }}
					/>
				) : null}
			</div>
			{overflowing && !expanded ? (
				<Button
					className="relative z-10 mx-auto mt-4 flex min-w-36"
					onClick={() => setExpanded(true)}
					ref={buttonRef}
				>
					더보기
				</Button>
			) : null}
		</section>
	);
}

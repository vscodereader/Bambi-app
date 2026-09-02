"use client";

import type { StaticImageData } from "next/image";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
	ONBOARDING_AUTO_SWIPE_PAUSE_MS,
	ONBOARDING_REVIEW_SUBMIT_PRESS_MS,
	ONBOARDING_REVIEW_TYPING_INTERVAL_MS,
	ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS,
} from "@/lib/bambi/onboarding";
import { StarIcon } from "../icons";
import {
	OnboardingCodePreview,
	type OnboardingCodePreviewKind,
} from "./employer-onboarding-preview";

interface ReviewScenario {
	body: string;
	rating: number;
}

type ReviewDemoPhase = "empty" | "pressing" | "rating" | "ready" | "typing";

interface ReviewDemoState {
	phase: ReviewDemoPhase;
	scenarioIndex: number;
	typedLength: number;
}

const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;

const getNextReviewDemoState = (
	current: ReviewDemoState,
	scenario: ReviewScenario,
	scenarioCount: number
): ReviewDemoState => {
	if (current.phase === "empty") {
		return { ...current, phase: "rating" };
	}
	if (current.phase === "rating") {
		return { ...current, phase: "typing" };
	}
	if (current.phase === "typing") {
		const nextLength = current.typedLength + 1;
		return {
			...current,
			phase: nextLength >= scenario.body.length ? "ready" : "typing",
			typedLength: nextLength,
		};
	}
	if (current.phase === "ready") {
		return { ...current, phase: "pressing" };
	}
	return {
		phase: "empty",
		scenarioIndex: (current.scenarioIndex + 1) % scenarioCount,
		typedLength: 0,
	};
};

function ReviewDemoScreen({
	alt,
	scenarios,
	src,
}: {
	alt: string;
	scenarios: readonly ReviewScenario[];
	src: StaticImageData;
}) {
	const [state, setState] = useState<ReviewDemoState>({
		phase: "empty",
		scenarioIndex: 0,
		typedLength: 0,
	});
	const scenario = scenarios[state.scenarioIndex];

	useEffect(() => {
		if (!scenario) {
			return;
		}
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			if (
				state.phase === "ready" &&
				state.typedLength === scenario.body.length
			) {
				return;
			}
			setState((current) => ({
				...current,
				phase: "ready",
				typedLength: scenario.body.length,
			}));
			return;
		}

		let delay = ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS;
		if (state.phase === "typing") {
			delay = ONBOARDING_REVIEW_TYPING_INTERVAL_MS;
		} else if (state.phase === "pressing") {
			delay = ONBOARDING_REVIEW_SUBMIT_PRESS_MS;
		}

		const timer = window.setTimeout(() => {
			setState((current) =>
				getNextReviewDemoState(current, scenario, scenarios.length)
			);
		}, delay);

		return () => window.clearTimeout(timer);
	}, [scenario, scenarios.length, state.phase, state.typedLength]);

	if (!scenario) {
		return null;
	}

	const hasRating = state.phase !== "empty";
	const body = scenario.body.slice(0, state.typedLength);
	const isButtonActive = state.phase === "pressing" || state.phase === "ready";

	return (
		<div className="relative h-full min-h-0 w-auto max-w-full lg:h-auto">
			<Image
				alt=""
				aria-hidden="true"
				className="invisible h-full min-h-0 w-auto max-w-full object-contain object-top lg:h-auto"
				priority
				src={src}
				unoptimized
			/>
			<section
				aria-label={alt}
				className="@container absolute inset-0 overflow-hidden bg-[var(--surface-subtle)] text-foreground"
				data-review-phase={state.phase}
				data-review-scenario={state.scenarioIndex}
			>
				<header className="flex h-[15cqw] items-center gap-[2.5cqw] border-border border-b bg-background px-[5cqw]">
					<span className="inline-flex size-[7cqw] items-center justify-center rounded-[1.8cqw] bg-primary text-[4cqw] text-white">
						◔
					</span>
					<span className="font-extrabold text-[3.8cqw]">밤비알바</span>
				</header>
				<div className="flex flex-col gap-[4cqw] p-[5cqw] pt-[7cqw]">
					<div>
						<p className="m-0 text-[3cqw] text-muted-foreground">‹ 내 정보</p>
						<h2 className="m-0 mt-[1.5cqw] font-extrabold text-[6cqw]">
							후기 남기기
						</h2>
					</div>
					<div className="rounded-[4cqw] border border-border bg-card p-[4cqw] shadow-[var(--shadow-card)]">
						<p className="m-0 font-bold text-[3.8cqw]">루나 라운지 강남점</p>
						<p className="m-0 mt-[1cqw] text-[3cqw] text-muted-foreground">
							2026. 9. 4. 오후 7:00 · 면접 완료
						</p>
					</div>
					<div className="flex flex-col gap-[3cqw] rounded-[4cqw] border border-border bg-card p-[4cqw] shadow-[var(--shadow-card)]">
						<div className="flex items-center justify-between gap-[3cqw]">
							<h3 className="m-0 font-bold text-[4cqw]">면접 후기 작성</h3>
							<span className="rounded-full bg-amber-50 px-[2.5cqw] py-[1cqw] font-semibold text-[2.6cqw] text-amber-700">
								작성 가능
							</span>
						</div>
						<fieldset>
							<legend className="font-bold text-[2.8cqw] text-muted-foreground">
								별점
							</legend>
							<div className="mt-[2cqw] flex gap-[1cqw]">
								{REVIEW_RATINGS.map((rating) => {
									const selected = hasRating && rating <= scenario.rating;
									return (
										<span
											aria-hidden="true"
											className={
												selected
													? "inline-flex size-[9cqw] items-center justify-center rounded-[2.2cqw] border border-coral-200 bg-coral-50 text-coral-500"
													: "inline-flex size-[9cqw] items-center justify-center rounded-[2.2cqw] border border-border bg-background text-muted-foreground"
											}
											key={rating}
										>
											<StarIcon
												className={`size-[4cqw] ${selected ? "fill-coral-500" : ""}`}
											/>
										</span>
									);
								})}
							</div>
						</fieldset>
						<div className="grid gap-[2cqw]">
							<div className="flex items-center justify-between">
								<span className="font-bold text-[2.8cqw] text-muted-foreground">
									후기
								</span>
								<span className="text-[2.8cqw] text-muted-foreground">
									{state.typedLength}/1000
								</span>
							</div>
							<div className="min-h-[31cqw] rounded-[2.2cqw] border border-border bg-background p-[3cqw] text-[3.5cqw] leading-relaxed">
								{state.typedLength > 0 ? (
									body
								) : (
									<span className="text-muted-foreground">
										면접 안내, 공고와 실제 조건 일치 여부, 응대 경험을
										남겨주세요.
									</span>
								)}
								{state.phase === "typing" ? "│" : ""}
							</div>
							<p className="m-0 text-[2.6cqw] text-muted-foreground leading-relaxed">
								후기는 20자 이상 작성해 주세요. 개인 연락처나 외부 메신저
								아이디는 공개되지 않을 수 있어요.
							</p>
						</div>
						<div className="flex items-start gap-[2cqw]">
							<span className="mt-[0.5cqw] size-[4cqw] shrink-0 rounded-full border border-border bg-background" />
							<div>
								<p className="m-0 font-bold text-[3.4cqw]">익명으로 표시</p>
								<p className="m-0 mt-[1cqw] text-[2.6cqw] text-muted-foreground leading-relaxed">
									선택하지 않으면 이름이 마스킹되어 표시돼요(예: 김*지).
								</p>
							</div>
						</div>
						<div
							className={`${isButtonActive ? "bg-coral-500 text-white" : "bg-coral-300 text-white/80"} flex h-[11cqw] items-center justify-center rounded-[3cqw] font-bold text-[3.6cqw] ${state.phase === "pressing" ? "[animation:bambiReviewSubmitPress_var(--dur-slow)_var(--ease-in-out)] motion-reduce:animate-none" : ""}`}
						>
							후기 등록
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}

function ScreenItemSequence({
	alt,
	direction,
	sequence,
	src,
}: {
	alt: string;
	direction: "left" | "up";
	sequence: readonly StaticImageData[];
	src: StaticImageData;
}) {
	const [visibleItemCount, setVisibleItemCount] = useState(0);

	useEffect(() => {
		if (visibleItemCount >= sequence.length) {
			return;
		}

		const timer = window.setTimeout(() => {
			setVisibleItemCount((count) => count + 1);
		}, ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS);

		return () => window.clearTimeout(timer);
	}, [sequence.length, visibleItemCount]);

	const animationClassName =
		direction === "left"
			? "[animation:bambiSlideInFromRight_calc(var(--dur-slow)*2)_var(--ease-out)]"
			: "[animation:bambiSheetUp_var(--dur-slow)_var(--ease-out)]";

	return (
		<div className="relative h-full min-h-0 w-auto max-w-full lg:h-auto">
			<Image
				alt={alt}
				className="h-full min-h-0 w-auto max-w-full object-contain object-top lg:h-auto"
				priority
				src={src}
				unoptimized
			/>
			{sequence.slice(0, visibleItemCount).map((item) => (
				<Image
					alt=""
					aria-hidden="true"
					className={`absolute inset-0 h-full w-full object-contain object-top motion-reduce:animate-none ${animationClassName}`}
					key={item.src}
					src={item}
					unoptimized
				/>
			))}
		</div>
	);
}

export function PhoneScreenMockup({
	alt,
	codePreview,
	reviewScenarios,
	scrollSrc,
	sequence,
	sequenceDirection = "up",
	src,
}: {
	alt: string;
	codePreview?: OnboardingCodePreviewKind;
	reviewScenarios?: readonly ReviewScenario[];
	scrollSrc?: StaticImageData;
	sequence?: readonly StaticImageData[];
	sequenceDirection?: "left" | "up";
	src: StaticImageData;
}) {
	const scrollContainerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!(scrollSrc && container)) {
			return;
		}

		const content = container.querySelector<HTMLElement>(
			"[data-scroll-content]"
		);
		const easing = window
			.getComputedStyle(document.documentElement)
			.getPropertyValue("--ease-out")
			.trim();
		container.scrollTop = 0;
		let timer: number | undefined;
		let animation: Animation | undefined;
		let isAutoPlaying = !window.matchMedia("(prefers-reduced-motion: reduce)")
			.matches;

		const stopAutoPlay = () => {
			isAutoPlaying = false;
			if (timer !== undefined) {
				window.clearTimeout(timer);
			}
			if (animation?.playState === "running") {
				animation.finish();
			}
		};
		const scheduleNextSwipe = () => {
			const end = container.scrollHeight - container.clientHeight;
			if (!(isAutoPlaying && content) || container.scrollTop >= end) {
				return;
			}
			timer = window.setTimeout(() => {
				const start = container.scrollTop;
				const target = Math.min(end, start + container.clientHeight / 2);
				animation = content.animate(
					[
						{ transform: "translateY(0)" },
						{ transform: `translateY(-${target - start}px)` },
					],
					{
						duration: ONBOARDING_AUTO_SWIPE_PAUSE_MS,
						easing,
						fill: "forwards",
					}
				);
				animation.onfinish = () => {
					container.scrollTop = target;
					animation?.cancel();
					animation = undefined;
					scheduleNextSwipe();
				};
			}, ONBOARDING_AUTO_SWIPE_PAUSE_MS);
		};
		const handleWheel = (event: WheelEvent) => {
			stopAutoPlay();
			if (event.target instanceof Node && !container.contains(event.target)) {
				container.scrollBy({ behavior: "smooth", top: event.deltaY });
			}
		};

		container.addEventListener("pointerdown", stopAutoPlay);
		container.addEventListener("touchstart", stopAutoPlay, { passive: true });
		window.addEventListener("wheel", handleWheel, { passive: true });
		scheduleNextSwipe();

		return () => {
			isAutoPlaying = false;
			if (timer !== undefined) {
				window.clearTimeout(timer);
			}
			animation?.cancel();
			container.removeEventListener("pointerdown", stopAutoPlay);
			container.removeEventListener("touchstart", stopAutoPlay);
			window.removeEventListener("wheel", handleWheel);
		};
	}, [scrollSrc]);

	let screenContent = (
		<Image
			alt={alt}
			className="h-full min-h-0 w-auto max-w-full object-contain object-top lg:h-auto"
			priority
			src={src}
			unoptimized
		/>
	);
	if (scrollSrc) {
		screenContent = (
			<div className="relative h-full min-h-0 w-fit max-w-full overflow-hidden max-md:mx-auto max-md:w-full lg:h-auto">
				<Image
					alt=""
					aria-hidden="true"
					className="invisible h-full min-h-0 w-auto max-w-full object-contain object-top lg:h-auto"
					priority
					src={src}
					unoptimized
				/>
				<section
					aria-label={`${alt}. 스와이프 동작으로 자동 이동하며 위아래로 직접 스크롤할 수도 있어요.`}
					className="absolute inset-0 overflow-y-auto overscroll-contain max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
					ref={scrollContainerRef}
				>
					<div data-scroll-content="true">
						<Image
							alt={alt}
							className="h-auto w-full"
							priority
							src={scrollSrc}
							unoptimized
						/>
					</div>
				</section>
			</div>
		);
	}
	if (sequence) {
		screenContent = (
			<ScreenItemSequence
				alt={alt}
				direction={sequenceDirection}
				sequence={sequence}
				src={src}
			/>
		);
	}
	if (reviewScenarios) {
		screenContent = (
			<ReviewDemoScreen alt={alt} scenarios={reviewScenarios} src={src} />
		);
	}
	if (codePreview) {
		screenContent = (
			<OnboardingCodePreview alt={alt} kind={codePreview} src={src} />
		);
	}

	return (
		<div className="relative mx-auto flex h-full max-h-full w-fit max-w-full flex-col overflow-hidden rounded-2xl border-4 border-ink-900 bg-background shadow-[var(--shadow-lg)] lg:h-auto">
			<div
				aria-hidden="true"
				className="flex shrink-0 justify-center bg-background"
			>
				<span className="text-ink-900">●</span>
			</div>
			{screenContent}
		</div>
	);
}

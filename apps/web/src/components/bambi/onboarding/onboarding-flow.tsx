"use client";

import { Button } from "@bambi-app/ui/components/button";
import { useRouter } from "next/navigation";
import {
	type PointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { Logo } from "@/components/bambi/ds";
import {
	clearSignupOnboardingIntent,
	getOnboardingHomePath,
	hasSeenAutomaticOnboarding,
	markAutomaticOnboardingSeen,
	ONBOARDING_ACTION_LABELS,
	type OnboardingAudience,
	type OnboardingRole,
	readSignupOnboardingIntent,
	writeCoachmarkIntent,
} from "@/lib/bambi/onboarding";
import { ONBOARDING_CONTENT } from "@/lib/bambi/onboarding-content";
import { OnboardingSlide } from "./onboarding-slide";
import { PageIndicator } from "./page-indicator";

type OnboardingSource = "replay" | "signup";

interface PointerOrigin {
	x: number;
	y: number;
}

export function OnboardingFlow({
	audience,
	role,
	source,
}: {
	audience: OnboardingAudience;
	role: OnboardingRole;
	source: OnboardingSource;
}) {
	const router = useRouter();
	const { isPending, user } = useBambiAuth();
	const slides = ONBOARDING_CONTENT[audience];
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isAuthorized, setIsAuthorized] = useState(source === "replay");
	const pointerOrigin = useRef<PointerOrigin | null>(null);
	const homePath = getOnboardingHomePath(role);

	useLayoutEffect(() => {
		if (source !== "signup" || isPending || !user) {
			return;
		}
		const intent = readSignupOnboardingIntent();
		const intentMatches = intent?.userId === user.id && intent.role === role;
		const alreadySeen = hasSeenAutomaticOnboarding(user.id, role);
		if (!(intentMatches && !alreadySeen)) {
			clearSignupOnboardingIntent();
			router.replace(homePath);
			return;
		}
		try {
			markAutomaticOnboardingSeen(user.id, role);
		} finally {
			clearSignupOnboardingIntent();
		}
		setIsAuthorized(true);
	}, [homePath, isPending, role, router, source, user]);

	const goPrevious = useCallback(() => {
		setCurrentIndex((index) => Math.max(0, index - 1));
	}, []);
	const goNext = useCallback(() => {
		setCurrentIndex((index) => Math.min(slides.length - 1, index + 1));
	}, [slides.length]);
	const exit = useCallback(
		(withCoachmark: boolean) => {
			if (withCoachmark && audience !== "common" && user) {
				writeCoachmarkIntent({
					role,
					userId: user.id,
				});
			}
			router.replace(homePath);
		},
		[audience, homePath, role, router, user]
	);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "ArrowLeft") {
				goPrevious();
			} else if (event.key === "ArrowRight") {
				goNext();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [goNext, goPrevious]);

	const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest("button,a")) {
			return;
		}
		pointerOrigin.current = { x: event.clientX, y: event.clientY };
	};
	const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
		const origin = pointerOrigin.current;
		pointerOrigin.current = null;
		if (!origin) {
			return;
		}
		const deltaX = event.clientX - origin.x;
		const deltaY = event.clientY - origin.y;
		if (Math.abs(deltaX) <= Math.abs(deltaY)) {
			return;
		}
		if (deltaX > 0) {
			goPrevious();
		} else {
			goNext();
		}
	};

	if (!isAuthorized || isPending || !user) {
		return (
			<div className="flex min-h-dvh items-center justify-center bg-background">
				<p className="text-muted-foreground text-sm">
					{ONBOARDING_ACTION_LABELS.loading}
				</p>
			</div>
		);
	}

	const isLast = currentIndex === slides.length - 1;
	return (
		<div
			className="flex h-dvh flex-col overflow-hidden bg-background px-5 py-4 sm:px-8"
			onPointerCancel={() => {
				pointerOrigin.current = null;
			}}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
		>
			<header className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between">
				<Logo lang="ko" size="md" />
				<Button onClick={() => exit(false)} type="button" variant="ghost">
					{ONBOARDING_ACTION_LABELS.skip}
				</Button>
			</header>
			<main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col py-3 sm:py-4 lg:py-8">
				<OnboardingSlide slide={slides[currentIndex]} />
				<div className="mt-3 flex shrink-0 flex-col gap-3 sm:mt-4 sm:gap-4">
					<PageIndicator
						currentIndex={currentIndex}
						pageIds={slides.map((slide) => slide.id)}
					/>
					<div className="mx-auto grid w-full grid-cols-2 gap-3 lg:w-1/2 lg:gap-4">
						<Button
							disabled={currentIndex === 0}
							onClick={goPrevious}
							size="lg"
							type="button"
							variant="outline"
						>
							{ONBOARDING_ACTION_LABELS.previous}
						</Button>
						<Button
							className="font-bold"
							onClick={isLast ? () => exit(true) : goNext}
							size="lg"
							type="button"
						>
							{isLast
								? ONBOARDING_ACTION_LABELS.start
								: ONBOARDING_ACTION_LABELS.next}
						</Button>
					</div>
				</div>
			</main>
		</div>
	);
}

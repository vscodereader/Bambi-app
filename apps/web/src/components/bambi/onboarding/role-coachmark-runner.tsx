"use client";

import { useCallback, useEffect, useState } from "react";

import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import {
	findVisibleCoachmarkTarget,
	ROLE_COACHMARK_STEPS,
} from "@/lib/bambi/coachmark";
import {
	clearCoachmarkIntent,
	type OnboardingRole,
	readCoachmarkIntent,
} from "@/lib/bambi/onboarding";
import { Coachmark, type SpotlightRect } from "./coachmark";

const resolveSpotlightTarget = (target: HTMLElement): HTMLElement =>
	target.matches("button, a, [role='button']")
		? target
		: (target.querySelector<HTMLElement>("button, a, [role='button']") ??
			target);

const measureTarget = (target: HTMLElement): SpotlightRect => {
	const spotlightTarget = resolveSpotlightTarget(target);
	const rect = spotlightTarget.getBoundingClientRect();
	const parsedRadius = Number.parseFloat(
		window.getComputedStyle(spotlightTarget).borderTopLeftRadius
	);
	return {
		borderRadius: Number.isFinite(parsedRadius)
			? Math.min(parsedRadius, rect.width / 2, rect.height / 2)
			: 0,
		height: rect.height,
		width: rect.width,
		x: rect.left,
		y: rect.top,
	};
};

export function RoleCoachmarkRunner({
	audienceRole,
}: {
	audienceRole: OnboardingRole;
}) {
	const { isPending, user } = useBambiAuth();
	const steps = ROLE_COACHMARK_STEPS[audienceRole];
	const [currentIndex, setCurrentIndex] = useState(0);
	const [rect, setRect] = useState<SpotlightRect | null>(null);
	const [isRunning, setIsRunning] = useState(false);

	const close = useCallback(() => {
		clearCoachmarkIntent();
		setIsRunning(false);
		setRect(null);
	}, []);

	useEffect(() => {
		if (isPending || !user || isRunning) {
			return;
		}
		const intent = readCoachmarkIntent();
		if (
			!(intent && intent.userId === user.id && intent.role === audienceRole)
		) {
			if (intent) {
				clearCoachmarkIntent();
			}
			return;
		}

		let frame = 0;
		const findFirstTarget = () => {
			const target = findVisibleCoachmarkTarget(steps[0].targets);
			if (!target) {
				return false;
			}
			target.scrollIntoView({ behavior: "auto", block: "center" });
			frame = window.requestAnimationFrame(() => {
				setRect(measureTarget(target));
				setIsRunning(true);
			});
			return true;
		};
		if (findFirstTarget()) {
			return () => window.cancelAnimationFrame(frame);
		}
		const observer = new MutationObserver(() => {
			if (findFirstTarget()) {
				observer.disconnect();
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		return () => {
			observer.disconnect();
			window.cancelAnimationFrame(frame);
		};
	}, [audienceRole, isPending, isRunning, steps, user]);

	useEffect(() => {
		if (!isRunning) {
			return;
		}
		let frame = 0;
		const update = () => {
			const target = findVisibleCoachmarkTarget(steps[currentIndex].targets);
			if (!target) {
				return;
			}
			target.scrollIntoView({ behavior: "auto", block: "center" });
			frame = window.requestAnimationFrame(() =>
				setRect(measureTarget(target))
			);
		};
		update();
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [currentIndex, isRunning, steps]);

	if (!(isRunning && rect)) {
		return null;
	}

	return (
		<Coachmark
			currentIndex={currentIndex}
			onClose={close}
			onNext={() => {
				if (currentIndex === steps.length - 1) {
					close();
				} else {
					setCurrentIndex((index) => index + 1);
				}
			}}
			onPrevious={() => setCurrentIndex((index) => Math.max(0, index - 1))}
			rect={rect}
			step={steps[currentIndex]}
			total={steps.length}
		/>
	);
}

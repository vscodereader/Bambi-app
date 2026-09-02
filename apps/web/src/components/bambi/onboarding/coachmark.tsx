"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogDescription,
	DialogPopup,
	DialogPortal,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { useId } from "react";

import {
	COACHMARK_ACTION_LABELS,
	type CoachmarkStep,
} from "@/lib/bambi/coachmark";

export interface SpotlightRect {
	height: number;
	width: number;
	x: number;
	y: number;
}

export function Coachmark({
	currentIndex,
	onClose,
	onNext,
	onPrevious,
	rect,
	step,
	total,
}: {
	currentIndex: number;
	onClose: () => void;
	onNext: () => void;
	onPrevious: () => void;
	rect: SpotlightRect;
	step: CoachmarkStep;
	total: number;
}) {
	const maskId = `coachmark-mask-${useId().replaceAll(":", "")}`;
	const isLast = currentIndex === total - 1;
	return (
		<Dialog onOpenChange={(open: boolean) => !open && onClose()} open>
			<DialogPortal>
				<div className="fixed inset-0">
					<svg
						aria-hidden="true"
						className="absolute inset-0 size-full text-ink-900"
					>
						<defs>
							<mask id={maskId}>
								<rect fill="white" height="100%" width="100%" />
								<rect
									fill="black"
									height={rect.height}
									width={rect.width}
									x={rect.x}
									y={rect.y}
								/>
							</mask>
						</defs>
						<rect
							fill="currentColor"
							height="100%"
							mask={`url(#${maskId})`}
							width="100%"
						/>
					</svg>
					<DialogPopup>
						<div className="flex items-center justify-between">
							<span className="font-semibold text-primary text-xs">
								{currentIndex + 1}/{total}
							</span>
							<Button onClick={onClose} size="sm" type="button" variant="ghost">
								{COACHMARK_ACTION_LABELS.skip}
							</Button>
						</div>
						<div className="flex flex-col">
							<DialogTitle className="font-extrabold">{step.title}</DialogTitle>
							<DialogDescription className="text-muted-foreground text-sm leading-relaxed">
								{step.description}
							</DialogDescription>
						</div>
						<div className="flex">
							<Button
								className="grow"
								disabled={currentIndex === 0}
								onClick={onPrevious}
								type="button"
								variant="outline"
							>
								{COACHMARK_ACTION_LABELS.previous}
							</Button>
							<Button className="grow" onClick={onNext} type="button">
								{isLast
									? COACHMARK_ACTION_LABELS.complete
									: COACHMARK_ACTION_LABELS.next}
							</Button>
						</div>
					</DialogPopup>
				</div>
			</DialogPortal>
		</Dialog>
	);
}

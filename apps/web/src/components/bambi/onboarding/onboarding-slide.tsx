import type { OnboardingSlideContent } from "@/lib/bambi/onboarding-content";
import { PhoneScreenMockup } from "./phone-screen-mockup";

export function OnboardingSlide({ slide }: { slide: OnboardingSlideContent }) {
	const Icon = slide.icon;
	const SecondaryIcon = slide.secondaryIcon;
	return (
		<div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] items-center gap-3 sm:gap-4 lg:grid-cols-2 lg:grid-rows-1 lg:gap-14">
			<div className="relative flex min-h-0 items-center justify-center self-stretch">
				<div
					aria-hidden="true"
					className="absolute top-1/2 left-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-coral-50 sm:size-56 lg:size-72"
				/>
				<PhoneScreenMockup
					alt={slide.screenAlt}
					codePreview={slide.codePreview}
					key={slide.id}
					reviewScenarios={slide.reviewScenarios}
					scrollSrc={slide.screenAfterAction}
					sequence={slide.screenSequence}
					sequenceDirection={slide.screenSequenceDirection}
					src={slide.screen}
				/>
				<div
					aria-hidden="true"
					className="absolute top-8 right-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-card)] sm:size-12 lg:right-0"
				>
					<Icon className="size-5 sm:size-6" />
				</div>
				<div
					aria-hidden="true"
					className="absolute bottom-8 left-2 flex size-9 items-center justify-center rounded-full bg-card text-primary shadow-[var(--shadow-card)] ring-1 ring-border sm:size-10 lg:left-0"
				>
					<SecondaryIcon className="size-5" />
				</div>
			</div>
			<div
				aria-live="polite"
				className="mx-auto flex max-w-xl flex-col gap-2 text-center lg:mx-0 lg:max-w-none lg:gap-3 lg:text-left"
			>
				<h1 className="m-0 text-balance font-extrabold text-2xl text-ink-900 leading-tight sm:text-3xl lg:whitespace-nowrap lg:text-4xl">
					{slide.mobileTitle ? (
						<>
							<span className="whitespace-pre-line sm:hidden">
								{slide.mobileTitle}
							</span>
							<span className="hidden sm:inline">{slide.title}</span>
						</>
					) : (
						slide.title
					)}
				</h1>
				{slide.description || slide.mobileDescription ? (
					<p className="m-0 text-pretty text-base text-muted-foreground leading-relaxed sm:text-lg lg:whitespace-nowrap">
						{slide.mobileDescription ? (
							<>
								<span className="whitespace-pre-line sm:hidden">
									{slide.mobileDescription}
								</span>
								<span className="hidden sm:inline">{slide.description}</span>
							</>
						) : (
							slide.description
						)}
					</p>
				) : null}
			</div>
		</div>
	);
}

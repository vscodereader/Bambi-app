"use client";

import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { getVisualJobExposureSections } from "@/lib/bambi/visual-job-exposure";
import { Card } from "./ds";
import { VisualJobCard } from "./visual-job-card";

const CARD_GRID_CLASS =
	"grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3";

interface VisualJobExposureSectionsProps {
	jobs: Job[];
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	sections: MarketplaceJobSections;
	selectedJobId?: string;
}

export function VisualJobExposureSections({
	jobs,
	onChat,
	onOpen,
	sections,
	selectedJobId,
}: VisualJobExposureSectionsProps) {
	if (jobs.length === 0) {
		return (
			<Card className="rounded-lg text-center" pad="lg" tone="outline">
				<h2 className="m-0 font-extrabold text-lg">
					조건에 맞는 공고가 없어요
				</h2>
				<p className="mt-2 mb-0 text-muted-foreground text-sm">
					지역이나 최소 급여 조건을 조금 낮춰보세요.
				</p>
			</Card>
		);
	}

	const visualSections = getVisualJobExposureSections(sections);

	return (
		<div className="grid gap-5">
			{visualSections.special.length > 0 ? (
				<section className="grid gap-2">
					<div className="flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-base">스페셜 채용</h2>
						<span className="font-semibold text-muted-foreground text-xs">
							{visualSections.special.length}개 · 프리미엄 노출
						</span>
					</div>
					<div className={CARD_GRID_CLASS}>
						{visualSections.special.map((job) => (
							<VisualJobCard
								job={job}
								key={`special-${job.id}`}
								onChat={onChat}
								onOpen={onOpen}
								tone="special"
							/>
						))}
					</div>
				</section>
			) : null}
			{visualSections.urgent.length > 0 ? (
				<section className="grid gap-2">
					<div className="flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-base">급구 채용</h2>
						<span className="font-semibold text-muted-foreground text-xs">
							{visualSections.urgent.length}개 · 최근 끌어올림
						</span>
					</div>
					<div className={CARD_GRID_CLASS}>
						{visualSections.urgent.map((job) => (
							<VisualJobCard
								job={job}
								key={`urgent-${job.id}`}
								onChat={onChat}
								onOpen={onOpen}
								tone="urgent"
							/>
						))}
					</div>
				</section>
			) : null}
			{visualSections.recommended.length > 0 ? (
				<section className="grid gap-2">
					<div className="flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-base">추천 채용</h2>
						<span className="font-semibold text-muted-foreground text-xs">
							{visualSections.recommended.length}개 · 상단 추천
						</span>
					</div>
					<div className={CARD_GRID_CLASS}>
						{visualSections.recommended.map((job) => (
							<VisualJobCard
								job={job}
								key={`recommended-${job.id}`}
								onChat={onChat}
								onOpen={onOpen}
								tone="recommended"
							/>
						))}
					</div>
				</section>
			) : null}
			<section className="grid gap-2">
				<div className="flex items-center justify-between">
					<h2 className="m-0 font-extrabold text-base">전체 공고</h2>
					<span className="font-semibold text-muted-foreground text-xs">
						{visualSections.organic.length}개 · 최신순
					</span>
				</div>
				<div className={CARD_GRID_CLASS}>
					{visualSections.organic.map((job) => (
						<VisualJobCard
							active={job.id === selectedJobId}
							job={job}
							key={`organic-${job.id}`}
							onChat={onChat}
							onOpen={onOpen}
							tone="organic"
						/>
					))}
				</div>
			</section>
		</div>
	);
}

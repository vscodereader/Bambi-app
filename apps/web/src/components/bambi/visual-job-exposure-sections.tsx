"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { getVisualJobExposureSections } from "@/lib/bambi/visual-job-exposure";
import { Card } from "./ds";
import { VisualJobCard } from "./visual-job-card";

const CARD_GRID_CLASS = "grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3";

type ExposureTone = "organic" | "recommended" | "special" | "urgent";

// 등급별 색 액센트 바 — 유료 노출 사다리(스페셜>급구>추천>전체)를 클린하게 시각화한다.
const accentClassName: Record<ExposureTone, string> = {
	special: "bg-coral-500",
	urgent: "bg-amber-500",
	recommended: "bg-sky-400",
	organic: "bg-gray-300",
};

interface ExposureSectionProps {
	jobs: Job[];
	meta: string;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	selectedJobId?: string;
	title: string;
	tone: ExposureTone;
}

function ExposureSection({
	jobs,
	meta,
	onChat,
	onOpen,
	selectedJobId,
	title,
	tone,
}: ExposureSectionProps) {
	return (
		<section className="grid gap-2">
			<div className="flex items-center justify-between">
				<h2 className="m-0 flex items-center gap-2 font-extrabold text-base">
					<span className={cn("h-4 w-1 rounded-full", accentClassName[tone])} />
					{title}
				</h2>
				<span className="font-semibold text-muted-foreground text-xs">
					{jobs.length}개 · {meta}
				</span>
			</div>
			<div className={CARD_GRID_CLASS}>
				{jobs.map((job) => (
					<VisualJobCard
						active={job.id === selectedJobId}
						job={job}
						key={`${tone}-${job.id}`}
						onChat={onChat}
						onOpen={onOpen}
						tone={tone}
					/>
				))}
			</div>
		</section>
	);
}

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
				<ExposureSection
					jobs={visualSections.special}
					meta="프리미엄 노출"
					onChat={onChat}
					onOpen={onOpen}
					title="스페셜 채용"
					tone="special"
				/>
			) : null}
			{visualSections.urgent.length > 0 ? (
				<ExposureSection
					jobs={visualSections.urgent}
					meta="최근 끌어올림"
					onChat={onChat}
					onOpen={onOpen}
					title="급구 채용"
					tone="urgent"
				/>
			) : null}
			{visualSections.recommended.length > 0 ? (
				<ExposureSection
					jobs={visualSections.recommended}
					meta="상단 추천"
					onChat={onChat}
					onOpen={onOpen}
					title="추천 채용"
					tone="recommended"
				/>
			) : null}
			<ExposureSection
				jobs={visualSections.organic}
				meta="최신순"
				onChat={onChat}
				onOpen={onOpen}
				selectedJobId={selectedJobId}
				title="전체 공고"
				tone="organic"
			/>
		</div>
	);
}

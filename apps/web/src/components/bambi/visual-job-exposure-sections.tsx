"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { Card } from "./ds";
import { VisualJobCard } from "./visual-job-card";

const CARD_GRID_CLASS = "grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4";

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
	// 급구·추천 사이(공고 0개 빈 상태에서도)에 끼워 넣을 임의 콘텐츠 슬롯
	communitySlot?: ReactNode;
	jobs: Job[];
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	sections: MarketplaceJobSections;
	selectedJobId?: string;
}

export function VisualJobExposureSections({
	communitySlot,
	jobs,
	onChat,
	onOpen,
	sections,
	selectedJobId,
}: VisualJobExposureSectionsProps) {
	if (jobs.length === 0) {
		const emptyCard = (
			<Card className="rounded-lg text-center" pad="lg" tone="outline">
				<h2 className="m-0 font-extrabold text-lg">
					조건에 맞는 공고가 없어요
				</h2>
				<p className="mt-2 mb-0 text-muted-foreground text-sm">
					지역이나 최소 급여 조건을 조금 낮춰보세요.
				</p>
			</Card>
		);
		// 공고가 없어도 커뮤니티 슬롯은 유지한다. slot이 없으면 기존과 동일한 단일 Card,
		// 있으면 본 분기와 같은 간격(grid gap-5)으로 쌓는다.
		if (!communitySlot) {
			return emptyCard;
		}
		return (
			<div className="grid gap-5">
				{emptyCard}
				{communitySlot}
			</div>
		);
	}

	return (
		<div className="grid gap-5">
			{sections.special.length > 0 ? (
				<ExposureSection
					jobs={sections.special}
					meta="프리미엄 노출"
					onChat={onChat}
					onOpen={onOpen}
					title="스페셜 채용"
					tone="special"
				/>
			) : null}
			{sections.urgent.length > 0 ? (
				<ExposureSection
					jobs={sections.urgent}
					meta="최근 끌어올림"
					onChat={onChat}
					onOpen={onOpen}
					title="급구 채용"
					tone="urgent"
				/>
			) : null}
			{/* 스페셜·급구 뒤, 추천·전체 앞 고정 위치. 급구/추천이 빠져도 이 자리에 항상 렌더된다. */}
			{communitySlot}
			{sections.recommended.length > 0 ? (
				<ExposureSection
					jobs={sections.recommended}
					meta="상단 추천"
					onChat={onChat}
					onOpen={onOpen}
					title="추천 채용"
					tone="recommended"
				/>
			) : null}
			<ExposureSection
				jobs={sections.organic}
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

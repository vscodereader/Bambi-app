"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { AdSlotPlaceholder } from "./ad-banner";
import { Card } from "./ds";
import { VisualJobCard } from "./visual-job-card";

const CARD_GRID_CLASS = "grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4";
// xl 4열 기준으로 빈 자리를 채운다. 자리표시 키는 index-in-key 린트를 피해 상수로 둔다.
const PLACEHOLDER_COLUMNS = 4;
const CARD_PLACEHOLDER_KEYS = ["ph-1", "ph-2", "ph-3", "ph-4"] as const;

// 유료 노출 섹션(스페셜·급구·추천)의 빈 자리표시 개수·breakpoint 표시 규칙.
// 빈 섹션은 한 행만 채운다(모바일 1·lg 3·xl 4). 부분 판매 섹션은 xl(4열) 기준
// 마지막 행 나머지를 채운다(그리드가 반응형이라 lg/모바일 정렬은 단순화 허용).
const cardPlaceholderCount = (jobsLength: number): number => {
	if (jobsLength === 0) {
		return PLACEHOLDER_COLUMNS;
	}
	return (
		(PLACEHOLDER_COLUMNS - (jobsLength % PLACEHOLDER_COLUMNS)) %
		PLACEHOLDER_COLUMNS
	);
};

// 빈 섹션에서 한 행만 남기려고 여분 자리표시를 breakpoint별로 숨긴다. base엔 flex/hidden이
// 없으므로 display 클래스를 여기서 온전히 지정한다(min-h-32는 공고 카드와 비슷한 높이).
const cardPlaceholderClass = (jobsLength: number, index: number): string => {
	if (jobsLength > 0) {
		return "flex min-h-32 w-full";
	}
	if (index === 0) {
		return "flex min-h-32 w-full";
	}
	if (index < 3) {
		return "hidden min-h-32 w-full lg:flex";
	}
	return "hidden min-h-32 w-full xl:flex";
};

type ExposureTone = "organic" | "recommended" | "special" | "urgent";

// 등급별 색 액센트 바 — 유료 노출 사다리(스페셜>급구>추천>전체)를 클린하게 시각화한다.
const accentClassName: Record<ExposureTone, string> = {
	special: "bg-coral-500",
	urgent: "bg-amber-500",
	recommended: "bg-sky-400",
	organic: "bg-gray-300",
};

interface ExposureSectionProps {
	// 유료 노출 섹션(스페셜·급구·추천)은 공고가 없어도 빈 자리를 "광고 모집중"
	// 자리표시로 채운다. 전체(organic) 섹션은 채우지 않는다(기존 동작 유지).
	fillEmpty?: boolean;
	jobs: Job[];
	meta: string;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	selectedJobId?: string;
	title: string;
	tone: ExposureTone;
}

function ExposureSection({
	fillEmpty = false,
	jobs,
	meta,
	onChat,
	onOpen,
	selectedJobId,
	title,
	tone,
}: ExposureSectionProps) {
	const placeholderKeys = fillEmpty
		? CARD_PLACEHOLDER_KEYS.slice(0, cardPlaceholderCount(jobs.length))
		: [];
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
				{placeholderKeys.map((key, index) => (
					<AdSlotPlaceholder
						className={cardPlaceholderClass(jobs.length, index)}
						key={`${tone}-${key}`}
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
			{/* 스페셜·급구·추천은 공고가 0개여도 섹션을 렌더하고 빈 자리를 "광고 모집중"
			    자리표시로 채운다(fillEmpty). */}
			<ExposureSection
				fillEmpty
				jobs={sections.special}
				meta="프리미엄 노출"
				onChat={onChat}
				onOpen={onOpen}
				title="스페셜 채용"
				tone="special"
			/>
			<ExposureSection
				fillEmpty
				jobs={sections.urgent}
				meta="최근 끌어올림"
				onChat={onChat}
				onOpen={onOpen}
				title="급구 채용"
				tone="urgent"
			/>
			{/* 스페셜·급구 뒤, 추천·전체 앞 고정 위치. */}
			{communitySlot}
			<ExposureSection
				fillEmpty
				jobs={sections.recommended}
				meta="상단 추천"
				onChat={onChat}
				onOpen={onOpen}
				title="추천 채용"
				tone="recommended"
			/>
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

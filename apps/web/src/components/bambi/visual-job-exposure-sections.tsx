"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
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
// 이 섹션들의 헤더 meta는 구직자 시점의 "○○ 광고" 고지 표기다(광고 상품 용어 미노출).
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
// 없으므로 display 클래스를 여기서 온전히 지정한다.
// 공고가 있는 행은 min-h를 주지 않는다 — 행 높이는 항상 실제 카드(자연 높이 약 118px)가
// 결정하고 자리표시는 stretch로 따라온다(자리표시가 더 높으면 카드가 늘어나 하단 여백이 생긴다).
// 빈 섹션만 카드 자연 높이에 맞춘 min-h-29(116px)로 스켈레톤 형태를 유지한다.
const cardPlaceholderClass = (jobsLength: number, index: number): string => {
	if (jobsLength > 0) {
		return "flex w-full";
	}
	if (index === 0) {
		return "flex min-h-29 w-full";
	}
	if (index < 3) {
		return "hidden min-h-29 w-full lg:flex";
	}
	return "hidden min-h-29 w-full xl:flex";
};

type ExposureTone = "organic" | "recommended" | "special" | "urgent";

// 등급별 색 액센트 바 — 유료 노출 사다리(스페셜>급구>추천>전체)를 클린하게 시각화한다.
const accentClassName: Record<ExposureTone, string> = {
	special: "bg-coral-500",
	urgent: "bg-amber-500",
	recommended: "bg-sky-400",
	organic: "bg-gray-300",
};

// 첫 로딩 스켈레톤이 미러링할 섹션 목록 — 실제 렌더 순서·제목·톤을 그대로 따른다.
const LOADING_SECTIONS: { title: string; tone: ExposureTone }[] = [
	{ title: "스페셜 채용", tone: "special" },
	{ title: "급구 채용", tone: "urgent" },
	{ title: "추천 채용", tone: "recommended" },
	{ title: "전체 공고", tone: "organic" },
];

// VisualJobCard 마크업(썸네일 h-14 + 2줄 텍스트, 하단 h-9 급여 행, gap-2 + p-2 테두리)을
// 그대로 미러링한다. 구조가 같아 자연 높이가 실제 카드(약 116px)와 일치하므로 임의 min-h가
// 필요 없다 — className으로 받는 breakpoint 표시 규칙만 합성한다.
function JobCardSkeleton({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-2",
				className
			)}
		>
			<div className="flex items-start gap-3">
				<Skeleton className="h-14 w-30 shrink-0 rounded-md" />
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<Skeleton className="h-4 w-3/5" />
					<Skeleton className="h-3 w-4/5" />
				</div>
			</div>
			<div className="mt-auto flex">
				<Skeleton className="h-9 w-28 rounded-md" />
			</div>
		</div>
	);
}

interface ExposureSectionProps {
	// 유료 노출 섹션(스페셜·급구·추천)은 공고가 없어도 빈 자리를 "광고 모집중"
	// 자리표시로 채운다. 전체(organic) 섹션은 채우지 않는다(기존 동작 유지).
	fillEmpty?: boolean;
	jobs: Job[];
	meta: string;
	onOpen: (job: Job) => void;
	selectedJobId?: string;
	title: string;
	tone: ExposureTone;
}

function ExposureSection({
	fillEmpty = false,
	jobs,
	meta,
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
	// 전체 공고를 더 받을 수 있으면 목록 아래에 "더보기" 버튼이 선다. 세 값이 한 세트다
	// (넘기지 않으면 버튼 없음 — 페이징을 쓰지 않는 호출부는 그대로 둔다).
	hasMore?: boolean;
	// 첫 로딩(공고 미도착)에는 빈 상태 카드 대신 섹션 스켈레톤을 보여준다.
	isLoading?: boolean;
	isLoadingMore?: boolean;
	jobs: Job[];
	onLoadMore?: () => void;
	onOpen: (job: Job) => void;
	sections: MarketplaceJobSections;
	selectedJobId?: string;
}

export function VisualJobExposureSections({
	communitySlot,
	hasMore = false,
	isLoading = false,
	isLoadingMore = false,
	jobs,
	onLoadMore,
	onOpen,
	sections,
	selectedJobId,
}: VisualJobExposureSectionsProps) {
	// 첫 로딩엔 jobs가 비어 있어 아래 빈 상태 분기가 "공고가 없어요"를 잠깐 보여준다.
	// 그 앞에서 실제 레이아웃과 같은 골격(grid gap-5 + 4개 섹션)의 스켈레톤으로 가로챈다.
	if (isLoading) {
		return (
			<div className="grid gap-5">
				{LOADING_SECTIONS.map(({ title, tone }) => (
					<section className="grid gap-2" key={tone}>
						<div className="flex items-center justify-between">
							<h2 className="m-0 flex items-center gap-2 font-extrabold text-base">
								<span
									className={cn("h-4 w-1 rounded-full", accentClassName[tone])}
								/>
								{title}
							</h2>
							{/* 개수·meta 자리 — 로딩 중 "0개"를 노출하지 않는다. */}
							<Skeleton className="h-4 w-20" />
						</div>
						<div className={CARD_GRID_CLASS}>
							{/* 빈 섹션 자리표시와 같은 breakpoint 규칙으로 한 행만 채운다
							    (모바일 1 · lg 3 · xl 4). */}
							{CARD_PLACEHOLDER_KEYS.map((key, index) => (
								<JobCardSkeleton
									className={cardPlaceholderClass(0, index)}
									key={`${tone}-${key}`}
								/>
							))}
						</div>
					</section>
				))}
			</div>
		);
	}

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
				meta="스페셜 광고"
				onOpen={onOpen}
				title="스페셜 채용"
				tone="special"
			/>
			<ExposureSection
				fillEmpty
				jobs={sections.urgent}
				meta="급구 광고"
				onOpen={onOpen}
				title="급구 채용"
				tone="urgent"
			/>
			{/* 스페셜·급구 뒤, 추천·전체 앞 고정 위치. */}
			{communitySlot}
			<ExposureSection
				fillEmpty
				jobs={sections.recommended}
				meta="추천 광고"
				onOpen={onOpen}
				title="추천 채용"
				tone="recommended"
			/>
			<ExposureSection
				jobs={sections.organic}
				meta="최신순"
				onOpen={onOpen}
				selectedJobId={selectedJobId}
				title="전체 공고"
				tone="organic"
			/>
			{hasMore && onLoadMore ? (
				<div className="flex justify-center">
					<Button
						className="w-full sm:w-auto"
						disabled={isLoadingMore}
						onClick={onLoadMore}
						variant="outline"
					>
						{isLoadingMore ? "불러오는 중" : "공고 더보기"}
					</Button>
				</div>
			) : null}
		</div>
	);
}

"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { orpc } from "@/utils/orpc";
import { AdSlotPlaceholder } from "./ad-banner";
import { Card } from "./ds";
import { VisualJobCard } from "./visual-job-card";

const CARD_GRID_CLASS = "grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4";
// 스켈레톤이 한 행만 채울 때 쓰는 자리표시 키(모바일 1·lg 3·xl 4). index-in-key 린트를
// 피해 상수로 둔다.
const CARD_PLACEHOLDER_KEYS = ["ph-1", "ph-2", "ph-3", "ph-4"] as const;

// 스페셜/추천 고정 인벤토리 자리표시 키. 슬롯 수만큼 잘라 쓴다(서버 슬롯 상한 60과 맞춰
// 넉넉히 잡음). index-in-key 린트를 피하려고 map 안에서 인덱스로 키를 만들지 않고 상수 배열을
// slice 한다.
const SLOT_PLACEHOLDER_KEYS = Array.from(
	{ length: 60 },
	(_, index) => `slot-${index}`
);

// 모바일(1열)에서 빈 "광고 모집중" 슬롯을 이 개수까지만 그대로 보여주고, 나머지는 접어
// "+N칸 광고 모집중" 한 줄 요약으로 대체한다. 데스크톱 그리드(lg 3·xl 4열)는 인벤토리를
// 그대로 노출한다 — 자리표시가 세로로 최대 60칸 늘어지는 건 모바일에서만 문제다.
const MOBILE_PLACEHOLDER_LIMIT = 2;

// 스페셜/추천 슬롯 수 코드 기본값 — 설정 조회가 도착하기 전(로딩) 폴백. 서버
// getExposureSectionConfig 폴백값(DEFAULT_SPECIAL/RECOMMENDED_CAPACITY)과 같은 12/20이다.
const DEFAULT_SPECIAL_SLOTS = 12;
const DEFAULT_RECOMMENDED_SLOTS = 20;

// 빈 섹션에서 한 행만 남기려고 여분 자리표시를 breakpoint별로 숨긴다. base엔 flex/hidden이
// 없으므로 display 클래스를 여기서 온전히 지정한다.
// 자리표시는 항상 카드 자연 높이(122.25px = 테두리 2 + p-2 16 + 썸네일 행 60.25 + gap-2 8 +
// 급여 행 36) 바로 아래인 min-h-30(120px)을 깐다. 썸네일 행 60.25px은 h-14 썸네일이 아니라
// 옆 텍스트 열(제목 20.25 + 4 + 업소 16 + 4 + 지역 16)이 정한다. 모바일 1열은 자리표시가 자기
// 행에 혼자 있어 min-h가 없으면 카드보다 납작해지고, lg/xl은 같은 행 실제 카드가 더 높아
// stretch가 그대로 이긴다(min-h가 카드 자연 높이를 넘으면 카드가 늘어나 하단 여백이 생기므로
// 120px에서 멈춘다).
const cardPlaceholderClass = (jobsLength: number, index: number): string => {
	if (jobsLength > 0 || index === 0) {
		return "flex min-h-30 w-full";
	}
	if (index < 3) {
		return "hidden min-h-30 w-full lg:flex";
	}
	return "hidden min-h-30 w-full xl:flex";
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
	jobs: Job[];
	meta: string;
	onOpen: (job: Job) => void;
	selectedJobId?: string;
	// 스페셜·추천은 고정 슬롯 인벤토리다: slotCount만큼 항상 칸을 렌더하고, 공고로 채운 뒤
	// 남는 칸은 "광고 모집중"(AdSlotPlaceholder)으로 패딩한다. 공고가 슬롯을 넘으면
	// 슬롯 수에서 컷한다(정원 하향 직후 등 전이 상태 방어). slotCount를 주지 않으면(전체 섹션·
	// 재노출된 급구) 공고 전부를 패딩 없이 렌더한다.
	slotCount?: number;
	title: string;
	tone: ExposureTone;
	trackAnalytics?: boolean;
}

function ExposureSection({
	slotCount,
	jobs,
	meta,
	onOpen,
	selectedJobId,
	trackAnalytics = false,
	title,
	tone,
}: ExposureSectionProps) {
	// 고정 인벤토리: 공고를 슬롯 수에서 컷하고, 남는 칸 수만큼 자리표시 키를 뽑는다.
	const shownJobs = slotCount === undefined ? jobs : jobs.slice(0, slotCount);
	const placeholderKeys =
		slotCount === undefined
			? []
			: SLOT_PLACEHOLDER_KEYS.slice(0, slotCount - shownJobs.length);
	return (
		<section className="grid gap-2">
			<div className="flex items-center justify-between">
				<h2 className="m-0 flex items-center gap-2 font-extrabold text-base">
					<span className={cn("h-4 w-1 rounded-full", accentClassName[tone])} />
					{title}
				</h2>
				{/* 개수 표기는 제거됐다 — 크롤링 주입 상한·슬롯 컷·단기성 크롤링 변동이 겹쳐
				    "몇 개"가 기준마다 달라지므로(배열 vs 카드 vs 자격 총량) 숫자 없이 라벨만 남긴다. */}
				<span className="font-semibold text-muted-foreground text-xs">
					{meta}
				</span>
			</div>
			{/* 리스트 시맨틱: 스크린리더가 "N개 중 k번째"를 읽도록 그리드를 ul/li로 감싼다.
			    li는 grid로 자식(카드·자리표시)을 그대로 스트레치해 카드 렌더 박스를 바꾸지
			    않는다. ul은 기본 마커·패딩·마진을 제거한다. */}
			<ul className={cn(CARD_GRID_CLASS, "m-0 list-none p-0")}>
				{shownJobs.map((job, index) => (
					<li className="grid" key={`${tone}-${job.id}`}>
						<VisualJobCard
							active={job.id === selectedJobId}
							analyticsIndex={index}
							job={job}
							onOpen={onOpen}
							tone={tone}
							trackAnalytics={trackAnalytics}
						/>
					</li>
				))}
				{placeholderKeys.map((key, index) => (
					<li
						className={cn(
							"grid",
							// 한도 넘는 자리표시는 모바일에서 숨기고(요약으로 대체) lg부터 되살린다.
							index >= MOBILE_PLACEHOLDER_LIMIT && "hidden lg:grid"
						)}
						key={`${tone}-${key}`}
					>
						<AdSlotPlaceholder className="flex min-h-30 w-full" />
					</li>
				))}
				{placeholderKeys.length > MOBILE_PLACEHOLDER_LIMIT ? (
					<li className="grid lg:hidden">
						<div
							aria-hidden="true"
							className="flex min-h-14 items-center justify-center rounded-lg border border-coral-300 border-dashed px-3 py-2 font-bold text-destructive text-sm"
						>
							+{placeholderKeys.length - MOBILE_PLACEHOLDER_LIMIT}칸 광고 모집중
						</div>
					</li>
				) : null}
			</ul>
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
	// 넘기면 빈 상태 카드에 "필터 초기화" 액션을 붙인다. 필터가 걸려 결과가 0건일 때만
	// 의미가 있으므로, 필터 상태를 소유한 호출부에서 활성 필터가 있을 때에만 넘긴다.
	onResetFilters?: () => void;
	sections: MarketplaceJobSections;
	selectedJobId?: string;
	trackAnalytics?: boolean;
}

export function VisualJobExposureSections({
	communitySlot,
	hasMore = false,
	isLoading = false,
	isLoadingMore = false,
	jobs,
	onLoadMore,
	onOpen,
	onResetFilters,
	sections,
	selectedJobId,
	trackAnalytics = false,
}: VisualJobExposureSectionsProps) {
	// 운영자 노출 섹션 설정 — 급구 숨김 여부·스페셜/추천 고정 슬롯 수. 조회 전(로딩)에는
	// 안전한 기본값(급구 숨김, 12/20)으로 폴백해 서버 폴백과 일치시킨다.
	const { data: config } = useQuery(
		orpc.bambi.siteSettings.getExposureSectionConfig.queryOptions()
	);
	const urgentHidden = config?.urgentHidden ?? true;
	const specialSlots = config?.specialSlots ?? DEFAULT_SPECIAL_SLOTS;
	const recommendedSlots =
		config?.recommendedSlots ?? DEFAULT_RECOMMENDED_SLOTS;

	// 첫 로딩엔 jobs가 비어 있어 아래 빈 상태 분기가 "공고가 없어요"를 잠깐 보여준다.
	// 그 앞에서 실제 레이아웃과 같은 골격(grid gap-5 + 4개 섹션)의 스켈레톤으로 가로챈다.
	if (isLoading) {
		// 급구가 숨김이면 스켈레톤에서도 급구 섹션을 미러링하지 않는다(실제 렌더와 일치).
		const loadingSections = urgentHidden
			? LOADING_SECTIONS.filter(({ tone }) => tone !== "urgent")
			: LOADING_SECTIONS;
		return (
			<div className="grid gap-5">
				{loadingSections.map(({ title, tone }) => (
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
						<ul className={cn(CARD_GRID_CLASS, "m-0 list-none p-0")}>
							{/* 빈 섹션 자리표시와 같은 breakpoint 규칙으로 한 행만 채운다
							    (모바일 1 · lg 3 · xl 4). display를 제어하는 breakpoint 클래스는
							    그리드 셀인 li에 실어야 숨김 슬롯이 빈 칸을 차지하지 않는다. */}
							{CARD_PLACEHOLDER_KEYS.map((key, index) => (
								<li
									className={cardPlaceholderClass(0, index)}
									key={`${tone}-${key}`}
								>
									<JobCardSkeleton />
								</li>
							))}
						</ul>
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
				{onResetFilters ? (
					<Button
						className="mt-4"
						onClick={onResetFilters}
						type="button"
						variant="outline"
					>
						필터 초기화
					</Button>
				) : null}
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
			{/* 스페셜·추천은 고정 슬롯 인벤토리(운영자 설정값)만큼 항상 렌더하고 남는 칸을
			    "광고 모집중"으로 채운다. 급구는 운영자 토글로 숨김/노출한다. */}
			<ExposureSection
				jobs={sections.special}
				meta="스페셜 광고"
				onOpen={onOpen}
				slotCount={specialSlots}
				title="스페셜 채용"
				tone="special"
				trackAnalytics={trackAnalytics}
			/>
			{/* 급구는 정원·고정 슬롯 대상이 아니다 — 노출 시 공고 전부를 패딩 없이 보여준다. */}
			{urgentHidden ? null : (
				<ExposureSection
					jobs={sections.urgent}
					meta="급구 광고"
					onOpen={onOpen}
					title="급구 채용"
					tone="urgent"
				/>
			)}
			{/* 스페셜·급구 뒤, 추천·전체 앞 고정 위치. */}
			{communitySlot}
			<ExposureSection
				jobs={sections.recommended}
				meta="추천 광고"
				onOpen={onOpen}
				slotCount={recommendedSlots}
				title="추천 채용"
				tone="recommended"
				trackAnalytics={trackAnalytics}
			/>
			<ExposureSection
				jobs={sections.organic}
				meta="최신순"
				onOpen={onOpen}
				selectedJobId={selectedJobId}
				title="전체 공고"
				tone="organic"
				trackAnalytics={trackAnalytics}
			/>
			{hasMore && onLoadMore ? (
				<div className="flex justify-center">
					<Button
						aria-busy={isLoadingMore}
						className="w-full sm:w-auto"
						disabled={isLoadingMore}
						onClick={onLoadMore}
						variant="outline"
					>
						{isLoadingMore ? (
							<>
								<Loader2Icon
									className="size-4 animate-spin"
									data-icon="inline-start"
								/>
								불러오는 중
							</>
						) : (
							"공고 더보기"
						)}
					</Button>
				</div>
			) : null}
		</div>
	);
}

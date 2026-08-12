"use client";

import { Button as UiButton } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
} from "@bambi-app/ui/components/sheet";
import { cn } from "@bambi-app/ui/lib/utils";
import { useEffect, useState } from "react";
import {
	ALL_OPTION,
	applyDiscoveryAxis,
	DEFAULT_MARKETPLACE_FILTERS,
	discoveryAxisForTab,
	MARKETPLACE_CATEGORIES,
	MARKETPLACE_QUICK_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import { findRegion, useRegions } from "@/lib/bambi/regions";
import { SELECTED_JOB_CARD_CLASS } from "@/lib/bambi/selection-style";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { Badge, Button, Card, Input, Tag } from "./ds";
import {
	BriefcaseIcon,
	CheckIcon,
	ClockIcon,
	Filter,
	MapPinIcon,
	Message,
	StarIcon,
	XIcon,
} from "./icons";
import { JobCoverImage } from "./job-cover-image";
import { JobSearchCommand } from "./job-search-command";

type FilterChange = (nextFilters: MarketplaceFilters) => void;

const formatReviewValue = ({
	rating,
	reviews,
}: Pick<Job, "rating" | "reviews">): string =>
	`${reviews}개 · ${reviews > 0 ? rating.toFixed(1) : "신규"}`;

// 기본값과 다른 필터 항목 수. 시트를 열지 않아도 몇 개가 걸려 있는지 배지로 보여주고,
// 초기화 버튼 활성 여부도 이 값으로 판단한다. 키를 순회하므로 MarketplaceFilters에
// 필드가 늘어도 따로 손댈 필요가 없다.
const countActiveFilters = (filters: MarketplaceFilters): number =>
	(
		Object.keys(DEFAULT_MARKETPLACE_FILTERS) as (keyof MarketplaceFilters)[]
	).filter((key) => filters[key] !== DEFAULT_MARKETPLACE_FILTERS[key]).length;

interface MarketplaceFilterControlsProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
	// true면 컨트롤 하단에 "필터 초기화" 버튼을 붙인다(사이드바용). 시트는 자체 하단 바에서
	// 초기화를 제공하므로 이 값을 넘기지 않는다.
	showReset?: boolean;
}

export function MarketplaceFilterControls({
	filters,
	onChange,
	showReset = false,
}: MarketplaceFilterControlsProps) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
	const { isLoading, regions } = useRegions();
	const districts = findRegion(regions, filters.regionCode)?.districts ?? [];
	// 최소시급은 타이핑 즉시 표시하되 300ms 멈춘 뒤에만 필터에 반영해 재조회 난사를 막는다.
	const [payInput, setPayInput] = useState(() =>
		String(filters.minimumPay || "")
	);
	// 초기화 등 외부에서 minimumPay가 바뀌면 로컬 표시값을 다시 맞춘다.
	useEffect(() => {
		setPayInput(String(filters.minimumPay || ""));
	}, [filters.minimumPay]);
	useEffect(() => {
		// 음수·빈값·비숫자는 필터 해제(0)로 떨어뜨린다 — 서버 minPayAmount는 양수만 받는다.
		const parsed = Number(payInput);
		const next = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
		if (next === filters.minimumPay) {
			return;
		}
		const timer = setTimeout(
			() => onChange({ ...filters, minimumPay: next }),
			300
		);
		return () => clearTimeout(timer);
	}, [payInput, filters, onChange]);
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">지역</span>
				<Select
					disabled={isLoading}
					items={[
						{ label: ALL_OPTION, value: ALL_OPTION },
						...regions.map((region) => ({
							label: region.label,
							value: region.code,
						})),
					]}
					onValueChange={(value) => {
						if (value) {
							// 시/도를 바꾸면 세부지역은 남의 시/도 코드라 전체로 되돌린다.
							update({ districtCode: ALL_OPTION, regionCode: value });
						}
					}}
					value={filters.regionCode}
				>
					<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_OPTION}>{ALL_OPTION}</SelectItem>
						{regions.map((region) => (
							<SelectItem key={region.code} value={region.code}>
								{region.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">
					세부지역
				</span>
				<Select
					disabled={districts.length === 0}
					items={[
						{ label: ALL_OPTION, value: ALL_OPTION },
						...districts.map((district) => ({
							label: district.name,
							value: district.code,
						})),
					]}
					onValueChange={(value) => {
						if (value) {
							update({ districtCode: value });
						}
					}}
					value={filters.districtCode}
				>
					<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_OPTION}>{ALL_OPTION}</SelectItem>
						{districts.map((district) => (
							<SelectItem key={district.code} value={district.code}>
								{district.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">업종</span>
				<Select
					onValueChange={(value) => {
						if (value) {
							update({ category: value });
						}
					}}
					value={filters.category}
				>
					<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
						<SelectValue>{(value) => value}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{MARKETPLACE_CATEGORIES.map((category) => (
							<SelectItem key={category} value={category}>
								{category}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">
					최소 시급
				</span>
				<Input
					onChange={(event) => setPayInput(event.target.value)}
					placeholder="예: 17000"
					type="number"
					value={payInput}
				/>
			</div>
			<label
				className="flex items-center gap-2 font-bold text-sm"
				htmlFor="filter-only-verified"
			>
				<Checkbox
					checked={filters.onlyVerified}
					id="filter-only-verified"
					onCheckedChange={(checked) => update({ onlyVerified: checked })}
				/>
				검증 완료만 보기
			</label>
			<label
				className="flex items-center gap-2 font-bold text-sm"
				htmlFor="filter-only-today"
			>
				<Checkbox
					checked={filters.onlyToday}
					id="filter-only-today"
					onCheckedChange={(checked) => update({ onlyToday: checked })}
				/>
				당일면접 가능만 보기
			</label>
			<label
				className="flex items-center gap-2 font-bold text-sm"
				htmlFor="filter-only-beginner"
			>
				<Checkbox
					checked={filters.onlyBeginnerFriendly}
					id="filter-only-beginner"
					onCheckedChange={(checked) =>
						update({ onlyBeginnerFriendly: checked })
					}
				/>
				초보 가능만 보기
			</label>
			{showReset ? (
				<Button
					block
					disabled={countActiveFilters(filters) === 0}
					onClick={() => onChange(DEFAULT_MARKETPLACE_FILTERS)}
					size="md"
					variant="secondary"
				>
					필터 초기화
				</Button>
			) : null}
		</div>
	);
}

interface MarketplaceFilterSheetProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	// 하단 "N건 보기" 버튼에 표시할 현재 결과 총 개수.
	resultCount: number;
}

export function MarketplaceFilterSheet({
	filters,
	onChange,
	onOpenChange,
	open,
	resultCount,
}: MarketplaceFilterSheetProps) {
	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			{/* p-0으로 공용 SheetContent의 p-5를 걷어내고 헤더·본문·푸터 3단으로 나눈다.
			    본문(flex-1)만 스크롤하고 푸터는 시트 flex 컬럼의 형제라 뷰포트 밖으로 밀려나지 않는다.
			    (이전엔 스크롤 컨테이너 안에서 sticky+음수 마진으로 삐져나가 버튼이 화면 밖으로 밀렸다.) */}
			<SheetContent
				className="p-0"
				onKeyDown={(event) => {
					// 입력칸에서 Enter = 시트 닫기(필터 값은 onChange로 이미 반영된 상태).
					// Select·체크박스의 Enter는 조작 키라 닫지 않고, IME 조합 중 Enter도 무시한다.
					if (
						event.key === "Enter" &&
						event.target instanceof HTMLInputElement &&
						!event.nativeEvent.isComposing
					) {
						onOpenChange(false);
					}
				}}
			>
				<div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
					<SheetTitle>빠른 탐색</SheetTitle>
					<SheetClose className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary">
						<span className="inline-flex size-5">
							<XIcon />
						</span>
					</SheetClose>
				</div>
				<div className="flex-1 overflow-y-auto px-5">
					<MarketplaceFilterControls filters={filters} onChange={onChange} />
				</div>
				{/* 하단 고정 바: 초기화 + "N건 보기"(닫기). 필터는 즉시 적용되므로 별도 적용 버튼은 없다.
				    safe-area 인셋만큼 하단 여백을 더해 홈 인디케이터에 버튼이 가리지 않게 한다. */}
				<div className="flex gap-2 border-border border-t bg-card px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
					<Button
						disabled={countActiveFilters(filters) === 0}
						onClick={() => onChange(DEFAULT_MARKETPLACE_FILTERS)}
						size="md"
						variant="secondary"
					>
						초기화
					</Button>
					<Button
						block
						onClick={() => onOpenChange(false)}
						size="md"
						variant="primary"
					>
						{resultCount}건 보기
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}

interface MarketplaceRegionChipsProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
}

interface MarketplaceAxisChipsProps {
	axis: "category" | "region";
	filters: MarketplaceFilters;
	onChange: FilterChange;
}

const MARKETPLACE_AXIS_ICONS = {
	category: BriefcaseIcon,
	region: MapPinIcon,
} as const;

// 지역/업종 공용 퀵칩 — 축에 따라 옵션·아이콘·대상 필드를 바꾼다. 지역 옵션은 DB 지역
// 마스터에서 오므로 값(코드)과 표기(라벨)가 다르다.
export function MarketplaceAxisChips({
	axis,
	filters,
	onChange,
}: MarketplaceAxisChipsProps) {
	const { regions } = useRegions();
	const Icon = MARKETPLACE_AXIS_ICONS[axis];
	const options =
		axis === "region"
			? [
					{ label: ALL_OPTION, value: ALL_OPTION },
					...regions.map((region) => ({
						label: region.label,
						value: region.code,
					})),
				]
			: MARKETPLACE_CATEGORIES.map((category) => ({
					label: category,
					value: category,
				}));
	const selectedValue =
		axis === "region" ? filters.regionCode : filters.category;
	return (
		<div className="flex items-center gap-2">
			<span className="inline-flex size-4 shrink-0 text-coral-600">
				<Icon />
			</span>
			<div className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]">
				{options.map((option) => (
					<Tag
						key={option.value}
						onClick={() =>
							onChange(
								axis === "region"
									? {
											...filters,
											districtCode: ALL_OPTION,
											regionCode: option.value,
										}
									: { ...filters, category: option.value }
							)
						}
						selected={selectedValue === option.value}
					>
						{option.label}
					</Tag>
				))}
			</div>
		</div>
	);
}

export const MARKETPLACE_DISCOVERY_TABS = [
	{ disabled: false, id: "all", label: "전체" },
	{ disabled: false, id: "region", label: "지역별" },
	{ disabled: false, id: "category", label: "업종별" },
	{ disabled: true, id: "map", label: "지도" },
	{ disabled: true, id: "recent", label: "오늘 본 공고" },
] as const;

export type MarketplaceDiscoveryTabId =
	(typeof MARKETPLACE_DISCOVERY_TABS)[number]["id"];

export function useMarketplaceDiscovery(
	filters: MarketplaceFilters,
	onChange: FilterChange
) {
	const [discoveryTabId, setDiscoveryTabId] =
		useState<MarketplaceDiscoveryTabId>("all");
	const selectDiscoveryTab = (tabId: MarketplaceDiscoveryTabId) => {
		setDiscoveryTabId(tabId);
		onChange(applyDiscoveryAxis(filters, discoveryAxisForTab(tabId)));
	};
	return { discoveryTabId, selectDiscoveryTab };
}

// 디스커버리 탭을 코럴 세그먼트 컨트롤로 — 활성 세그먼트만 카드 톤 배경 + 코럴 텍스트로
// 띄운다. disabled(지도·오늘 본 공고)는 opacity-40 + native disabled로 남겨둔다.
function MarketplaceDiscoverySegments({
	onSelect,
	value,
}: {
	onSelect: (tabId: MarketplaceDiscoveryTabId) => void;
	value: MarketplaceDiscoveryTabId;
}) {
	return (
		<div className="inline-flex shrink-0 gap-1 rounded-full bg-secondary p-1">
			{MARKETPLACE_DISCOVERY_TABS.map((tab) => (
				<button
					aria-pressed={value === tab.id}
					className={cn(
						"h-8 shrink-0 rounded-full px-3 font-bold text-sm transition-colors",
						value === tab.id
							? "bg-card text-coral-600 shadow-[var(--shadow-card)]"
							: "text-muted-foreground",
						tab.disabled && "opacity-40"
					)}
					disabled={tab.disabled}
					key={tab.id}
					onClick={() => onSelect(tab.id)}
					type="button"
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}

// 검증 완료/당일면접/초보 가능 퀵칩 — 기존 Tag(selected 스타일) 그대로.
function MarketplaceQuickChips({
	filters,
	onChange,
}: {
	filters: MarketplaceFilters;
	onChange: FilterChange;
}) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
	return (
		<div className="flex shrink-0 gap-2">
			{MARKETPLACE_QUICK_FILTERS.map((filter) => {
				const selected =
					(filter.id === "verified" && filters.onlyVerified) ||
					(filter.id === "today" && filters.onlyToday) ||
					(filter.id === "beginner" && filters.onlyBeginnerFriendly);
				return (
					<Tag
						key={filter.id}
						onClick={() => {
							if (filter.id === "verified") {
								update({ onlyVerified: !filters.onlyVerified });
							}
							if (filter.id === "today") {
								update({ onlyToday: !filters.onlyToday });
							}
							if (filter.id === "beginner") {
								update({ onlyBeginnerFriendly: !filters.onlyBeginnerFriendly });
							}
						}}
						selected={selected}
					>
						{filter.label}
					</Tag>
				);
			})}
		</div>
	);
}

function MarketplaceFilterButton({
	activeFilterCount,
	className,
	onClick,
}: {
	activeFilterCount: number;
	className?: string;
	onClick?: () => void;
}) {
	return (
		<UiButton
			className={cn(
				"h-12 shrink-0 gap-2 rounded-lg bg-card px-4 font-bold text-sm",
				className
			)}
			onClick={onClick}
			variant="outline"
		>
			<Filter />
			필터
			{activeFilterCount > 0 ? (
				<Badge tone="primary">{activeFilterCount}</Badge>
			) : null}
		</UiButton>
	);
}

interface MarketplaceDiscoveryBarProps {
	discoveryTabId: MarketplaceDiscoveryTabId;
	filters: MarketplaceFilters;
	onChange: FilterChange;
	onOpenFilters?: () => void;
	onSelectJob: (job: Job) => void;
	onSelectTab: (tabId: MarketplaceDiscoveryTabId) => void;
}

// 탐색 바 — 세그먼트 탭 + 퀵칩 + 필터 진입을 브레이크포인트별로 압축한다.
// - 모바일(<md): 1행 검색+필터, 2행 [탭·구분선·칩] 가로 스크롤 레일.
// - md~1719: 단일 행 [탭·구분선·칩] + 우측 필터 버튼(ml-auto).
// - 1720px+: 사이드바가 필터를 담당하므로 필터 버튼만 숨기고 탭·칩 레일은 유지.
export function MarketplaceDiscoveryBar({
	discoveryTabId,
	filters,
	onChange,
	onOpenFilters,
	onSelectJob,
	onSelectTab,
}: MarketplaceDiscoveryBarProps) {
	const activeFilterCount = countActiveFilters(filters);
	return (
		<div className="flex flex-col gap-3">
			{/* 모바일 1행: 검색 필드 + 필터. 헤더 검색과 겹치는 md 이상에서는 숨긴다. */}
			<div className="flex items-center gap-2.5 md:hidden">
				<JobSearchCommand
					onSelectJob={onSelectJob}
					trigger="field"
					triggerClassName="flex-1"
				/>
				<MarketplaceFilterButton
					activeFilterCount={activeFilterCount}
					onClick={onOpenFilters}
				/>
			</div>
			{/* 탐색 레일: [세그먼트 탭] · 세로 구분선 · [퀵칩]을 한 줄에 담아 가로 스크롤한다.
			    md~1719에서는 우측에 필터 버튼(ml-auto), 1720px+에서는 그 버튼만 숨는다. */}
			<div className="flex items-center gap-2.5">
				<div className="flex min-w-0 items-center gap-2.5 overflow-x-auto [scrollbar-width:none]">
					<MarketplaceDiscoverySegments
						onSelect={onSelectTab}
						value={discoveryTabId}
					/>
					<span className="h-5 w-px shrink-0 self-center bg-border" />
					<MarketplaceQuickChips filters={filters} onChange={onChange} />
				</div>
				<MarketplaceFilterButton
					activeFilterCount={activeFilterCount}
					className="ml-auto hidden md:inline-flex min-[1720px]:hidden"
					onClick={onOpenFilters}
				/>
			</div>
		</div>
	);
}

export function MarketplaceDiscoveryAxisChips({
	discoveryTabId,
	filters,
	onChange,
}: {
	discoveryTabId: MarketplaceDiscoveryTabId;
	filters: MarketplaceFilters;
	onChange: FilterChange;
}) {
	if (discoveryTabId === "region") {
		return (
			<MarketplaceAxisChips
				axis="region"
				filters={filters}
				onChange={onChange}
			/>
		);
	}
	if (discoveryTabId === "category") {
		return (
			<MarketplaceAxisChips
				axis="category"
				filters={filters}
				onChange={onChange}
			/>
		);
	}
	return null;
}

// 지역 전용 사용처(홈 PublicMarketplaceScreen)를 위한 얇은 래퍼.
export function MarketplaceRegionChips({
	filters,
	onChange,
}: MarketplaceRegionChipsProps) {
	return (
		<MarketplaceAxisChips axis="region" filters={filters} onChange={onChange} />
	);
}

interface ResponsiveJobCardProps {
	active?: boolean;
	job: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
}

export function ResponsiveJobCard({
	active = false,
	job,
	onChat,
	onOpen,
}: ResponsiveJobCardProps) {
	return (
		<article
			className={cn(
				"rounded-lg border bg-card p-3 transition-colors",
				active ? SELECTED_JOB_CARD_CLASS : "border-border"
			)}
		>
			<button
				className="block w-full cursor-pointer border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
				<div className="flex items-start gap-3">
					{job.coverImage ? (
						<JobCoverImage
							className={cn(
								"size-10 shrink-0 rounded-lg border object-cover",
								active ? "border-coral-200" : "border-border"
							)}
							height={40}
							media={job.coverImage}
							width={40}
						/>
					) : (
						<div
							className={cn(
								"flex size-10 shrink-0 items-center justify-center rounded-lg font-extrabold text-sm",
								active
									? "border border-coral-200 bg-coral-50 text-coral-700"
									: "bg-coral-50 text-coral-700"
							)}
						>
							{job.company.slice(0, 2)}
						</div>
					)}
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-1.5">
							<h3
								className={cn(
									"m-0 truncate font-extrabold text-[15px]",
									active ? "text-coral-700" : "text-foreground"
								)}
							>
								{job.company} {job.title}
							</h3>
							{job.promotionLabel ? (
								<Badge tone="pending">{job.promotionLabel}</Badge>
							) : null}
							{job.verified ? (
								<Badge tone="success">
									<span className="inline-flex size-3.5">
										<CheckIcon />
									</span>
									인증 완료
								</Badge>
							) : null}
						</div>
						<div
							className={cn(
								"mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
								"text-muted-foreground"
							)}
						>
							<span className="inline-flex items-center gap-1">
								<span className="inline-flex size-3.5">
									<MapPinIcon />
								</span>
								{job.location}
							</span>
							<span className="inline-flex items-center gap-1">
								<span className="inline-flex size-3.5">
									<ClockIcon />
								</span>
								{job.hours}
							</span>
						</div>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<strong
								className={cn(
									"text-[15px]",
									active ? "text-coral-700" : "text-foreground"
								)}
							>
								{job.pay}
							</strong>
							<span
								className={cn(
									"inline-flex items-center gap-1 text-xs",
									"text-muted-foreground"
								)}
							>
								<span className="inline-flex size-3.5">
									<StarIcon />
								</span>
								후기 {formatReviewValue(job)}
							</span>
						</div>
					</div>
				</div>
			</button>
			<div className="mt-2 flex items-center justify-between gap-3">
				<div className="flex min-w-0 gap-1 overflow-hidden">
					{job.tags.slice(0, 3).map((tag) => (
						<span
							className={cn(
								"shrink-0 rounded-full px-2.5 py-1 font-bold text-xs",
								active
									? "border border-coral-200 bg-secondary text-coral-700"
									: "bg-secondary text-muted-foreground"
							)}
							key={tag}
						>
							{tag}
						</span>
					))}
				</div>
				<Button
					className="shrink-0"
					onClick={() => onChat(job)}
					rightIcon={<Message />}
					size="sm"
					variant="secondary"
				>
					채팅
				</Button>
			</div>
		</article>
	);
}

interface JobListProps {
	jobs: Job[];
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	sections?: MarketplaceJobSections;
	selectedJobId?: string;
}

const marketplaceSectionMeta = [
	{ id: "special", label: "스페셜", tone: "프리미엄 노출" },
	{ id: "urgent", label: "급구", tone: "최근 끌어올림" },
	{ id: "recommended", label: "추천", tone: "상단 노출" },
	{ id: "organic", label: "전체 공고", tone: "최신순" },
] as const;

export function JobList({
	jobs,
	onChat,
	onOpen,
	sections,
	selectedJobId,
}: JobListProps) {
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
	const visibleSections = sections
		? marketplaceSectionMeta
				.map((section) => ({
					...section,
					jobs: sections[section.id],
				}))
				.filter((section) => section.jobs.length > 0)
		: [{ id: "organic", jobs, label: "전체 공고", tone: "최신순" }];

	return (
		<div className="flex flex-col gap-4">
			{visibleSections.map((section) => (
				<section className="space-y-2" key={section.id}>
					<div className="flex items-center justify-between">
						<h3 className="m-0 font-extrabold text-sm">{section.label}</h3>
						<span className="font-semibold text-muted-foreground text-xs">
							{section.jobs.length}개 · {section.tone}
						</span>
					</div>
					<div className="flex flex-col gap-2">
						{section.jobs.map((job) => (
							<ResponsiveJobCard
								active={job.id === selectedJobId}
								job={job}
								key={job.id}
								onChat={onChat}
								onOpen={onOpen}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

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
	SheetContent,
	SheetTitle,
} from "@bambi-app/ui/components/sheet";
import { cn } from "@bambi-app/ui/lib/utils";
import { type ReactNode, useState } from "react";
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
	Search2,
	StarIcon,
} from "./icons";
import { JobCoverImage } from "./job-cover-image";
import { JobSearchCommand } from "./job-search-command";

type FilterChange = (nextFilters: MarketplaceFilters) => void;

const formatReviewValue = ({
	rating,
	reviews,
}: Pick<Job, "rating" | "reviews">): string =>
	`${reviews}개 · ${reviews > 0 ? rating.toFixed(1) : "신규"}`;

interface MarketplaceFilterSidebarProps {
	filters: MarketplaceFilters;
	// 사이드바 하단(sticky 컬럼 안)에 덧붙일 슬롯 — 광고 배너 등.
	footer?: ReactNode;
	onChange: FilterChange;
}

export function MarketplaceFilterControls({
	filters,
	onChange,
}: MarketplaceFilterSidebarProps) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
	const { isLoading, regions } = useRegions();
	const districts = findRegion(regions, filters.regionCode)?.districts ?? [];
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
					onChange={(event) => {
						// 음수·빈값·비숫자는 필터 해제(0)로 떨어뜨린다 — 서버 minPayAmount는 양수만 받는다.
						const parsed = Number(event.target.value);
						update({
							minimumPay: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
						});
					}}
					placeholder="예: 17000"
					type="number"
					value={String(filters.minimumPay || "")}
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
		</div>
	);
}

export function MarketplaceFilterSidebar({
	filters,
	footer,
	onChange,
}: MarketplaceFilterSidebarProps) {
	return (
		<aside className="hidden w-[236px] shrink-0 lg:block">
			<div className="sticky top-20 flex flex-col gap-4">
				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="mb-4 flex items-center gap-2">
						<span className="inline-flex size-5 text-coral-600">
							<Search2 />
						</span>
						<h2 className="m-0 font-extrabold text-base">빠른 탐색</h2>
					</div>
					<MarketplaceFilterControls filters={filters} onChange={onChange} />
				</Card>
				{footer}
			</div>
		</aside>
	);
}

interface MarketplaceFilterSheetProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

export function MarketplaceFilterSheet({
	filters,
	onChange,
	onOpenChange,
	open,
}: MarketplaceFilterSheetProps) {
	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent
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
				<SheetTitle className="mb-4">빠른 탐색</SheetTitle>
				<MarketplaceFilterControls filters={filters} onChange={onChange} />
			</SheetContent>
		</Sheet>
	);
}

// 기본값과 다른 필터 항목 수. 시트를 열지 않아도 몇 개가 걸려 있는지 배지로 보여준다.
// 키를 순회하므로 MarketplaceFilters에 필드가 늘어도 따로 손댈 필요가 없다.
const countActiveFilters = (filters: MarketplaceFilters): number =>
	(
		Object.keys(DEFAULT_MARKETPLACE_FILTERS) as (keyof MarketplaceFilters)[]
	).filter((key) => filters[key] !== DEFAULT_MARKETPLACE_FILTERS[key]).length;

interface MarketplaceSearchProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
	onOpenFilters?: () => void;
	onSelectJob: (job: Job) => void;
	searchFieldClassName?: string;
}

export function MarketplaceSearch({
	filters,
	onChange,
	onOpenFilters,
	onSelectJob,
	searchFieldClassName,
}: MarketplaceSearchProps) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
	const activeFilterCount = countActiveFilters(filters);
	return (
		<div className="flex flex-col gap-3">
			<div className={cn("flex items-center gap-2.5", searchFieldClassName)}>
				<JobSearchCommand
					onSelectJob={onSelectJob}
					trigger="field"
					triggerClassName="flex-1"
				/>
				<UiButton
					className="h-12 gap-2 rounded-lg bg-card px-4 font-bold text-sm lg:hidden"
					onClick={onOpenFilters}
					variant="outline"
				>
					<Filter />
					필터
					{activeFilterCount > 0 ? (
						<Badge tone="primary">{activeFilterCount}</Badge>
					) : null}
				</UiButton>
			</div>
			<div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
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
									update({
										onlyBeginnerFriendly: !filters.onlyBeginnerFriendly,
									});
								}
							}}
							selected={selected}
						>
							{filter.label}
						</Tag>
					);
				})}
			</div>
		</div>
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

export function MarketplaceDiscoveryTabs({
	onSelect,
	value,
}: {
	onSelect: (tabId: MarketplaceDiscoveryTabId) => void;
	value: MarketplaceDiscoveryTabId;
}) {
	return (
		<div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
			{MARKETPLACE_DISCOVERY_TABS.map((tab) => (
				<button
					aria-pressed={value === tab.id}
					className={cn(
						"h-9 shrink-0 rounded-lg px-3 font-bold text-sm disabled:opacity-50",
						value === tab.id
							? "bg-foreground text-background"
							: "border border-border bg-card text-muted-foreground"
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

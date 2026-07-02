"use client";

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
import Image from "next/image";
import { useState } from "react";
import {
	ALL_OPTION,
	applyDiscoveryAxis,
	discoveryAxisForTab,
	MARKETPLACE_CATEGORIES,
	MARKETPLACE_QUICK_FILTERS,
	MARKETPLACE_REGIONS,
	type MarketplaceFilters,
	subcategoriesForCategory,
} from "@/lib/bambi/marketplace";
import { SELECTED_JOB_CARD_CLASS } from "@/lib/bambi/selection-style";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { Badge, Button, Card, Input, Tag } from "./ds";
import {
	BriefcaseIcon,
	CheckIcon,
	ClockIcon,
	MapPinIcon,
	Message,
	Search2,
	StarIcon,
} from "./icons";

type FilterChange = (nextFilters: MarketplaceFilters) => void;

const formatReviewValue = ({
	rating,
	reviews,
}: Pick<Job, "rating" | "reviews">): string =>
	`${reviews}개 · ${reviews > 0 ? rating.toFixed(1) : "신규"}`;

interface MarketplaceFilterSidebarProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
}

export function MarketplaceFilterControls({
	filters,
	onChange,
}: MarketplaceFilterSidebarProps) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
	const subcategoryOptions = subcategoriesForCategory(filters.category);
	const subcategoryDisabled = subcategoryOptions.length <= 1;
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<span className="font-bold text-muted-foreground text-xs">지역</span>
				<Select
					onValueChange={(value) => {
						if (value) {
							update({ region: value });
						}
					}}
					value={filters.region}
				>
					<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
						<SelectValue>{(value) => value}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{MARKETPLACE_REGIONS.map((region) => (
							<SelectItem key={region} value={region}>
								{region}
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
							update({ category: value, subcategory: ALL_OPTION });
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
					세부 업종
				</span>
				<Select
					disabled={subcategoryDisabled}
					onValueChange={(value) => {
						if (value) {
							update({ subcategory: value });
						}
					}}
					value={filters.subcategory}
				>
					<SelectTrigger className="h-11 w-full rounded-lg px-3 font-semibold text-sm">
						<SelectValue>{(value) => value}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{subcategoryOptions.map((subcategory) => (
							<SelectItem key={subcategory} value={subcategory}>
								{subcategory}
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
					defaultValue={String(filters.minimumPay || "")}
					onChange={(event) =>
						update({ minimumPay: Number(event.target.value || 0) })
					}
					placeholder="예: 17000"
					type="number"
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
				오늘 면접 가능만 보기
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
			<SheetContent>
				<SheetTitle className="mb-4">빠른 탐색</SheetTitle>
				<MarketplaceFilterControls filters={filters} onChange={onChange} />
			</SheetContent>
		</Sheet>
	);
}

interface MarketplaceSearchProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
	onOpenFilters?: () => void;
	searchFieldClassName?: string;
}

export function MarketplaceSearch({
	filters,
	onChange,
	onOpenFilters,
	searchFieldClassName,
}: MarketplaceSearchProps) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
	return (
		<div className="flex flex-col gap-3">
			<div className={cn("flex items-center gap-2.5", searchFieldClassName)}>
				<label className="flex h-14 flex-1 items-center gap-3 rounded-lg bg-secondary px-[18px]">
					<span className="inline-flex size-5 text-[color:var(--text-subtle)]">
						<Search2 />
					</span>
					<input
						aria-label="업종, 지역, 공고 제목 검색"
						className="min-w-0 flex-1 border-none bg-transparent font-medium text-base text-foreground outline-none"
						onChange={(event) => update({ query: event.target.value })}
						placeholder="업종, 지역, 공고 제목 검색"
						value={filters.query}
					/>
				</label>
				<button
					aria-label="필터"
					className="inline-flex h-14 flex-[0_0_auto] items-center justify-center rounded-lg border border-border bg-card px-4 font-bold text-sm lg:hidden"
					onClick={onOpenFilters}
					type="button"
				>
					필터
				</button>
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

const MARKETPLACE_AXIS_CONFIG = {
	category: { Icon: BriefcaseIcon, options: MARKETPLACE_CATEGORIES },
	region: { Icon: MapPinIcon, options: MARKETPLACE_REGIONS },
} as const;

// 지역/업종 공용 퀵칩 — 축에 따라 옵션·아이콘·대상 필드를 바꾼다.
export function MarketplaceAxisChips({
	axis,
	filters,
	onChange,
}: MarketplaceAxisChipsProps) {
	const { Icon, options } = MARKETPLACE_AXIS_CONFIG[axis];
	return (
		<div className="flex items-center gap-2">
			<span className="inline-flex size-4 shrink-0 text-coral-600">
				<Icon />
			</span>
			<div className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]">
				{options.map((option) => (
					<Tag
						key={option}
						onClick={() =>
							onChange(
								axis === "region"
									? { ...filters, region: option }
									: { ...filters, category: option, subcategory: ALL_OPTION }
							)
						}
						selected={filters[axis] === option}
					>
						{option}
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
						<Image
							alt={job.coverImage.altText || job.coverImage.fileName}
							className={cn(
								"size-10 shrink-0 rounded-lg border object-cover",
								active ? "border-coral-200" : "border-border"
							)}
							height={40}
							src={job.coverImage.url}
							unoptimized
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
	{ id: "premium", label: "프리미엄", tone: "먼저 확인" },
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

"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import {
	MARKETPLACE_CATEGORIES,
	MARKETPLACE_QUICK_FILTERS,
	MARKETPLACE_REGIONS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import { SELECTED_JOB_CARD_CLASS } from "@/lib/bambi/selection-style";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { Badge, Button, Card, Input, Logo, Tag } from "./ds";
import {
	CheckIcon,
	ChevronRightIcon,
	ClockIcon,
	DollarCircle,
	MapPinIcon,
	Message,
	Search2,
	ShieldIcon,
	StarIcon,
} from "./icons";

type FilterChange = (nextFilters: MarketplaceFilters) => void;

interface MarketplaceFilterSidebarProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
}

export function MarketplaceFilterSidebar({
	filters,
	onChange,
}: MarketplaceFilterSidebarProps) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
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
					<div className="flex flex-col gap-4">
						<label className="flex flex-col gap-2">
							<span className="font-bold text-muted-foreground text-xs">
								지역
							</span>
							<select
								className="h-11 rounded-lg border border-border bg-background px-3 font-semibold text-sm"
								onChange={(event) => update({ region: event.target.value })}
								value={filters.region}
							>
								{MARKETPLACE_REGIONS.map((region) => (
									<option key={region} value={region}>
										{region}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-2">
							<span className="font-bold text-muted-foreground text-xs">
								업종
							</span>
							<select
								className="h-11 rounded-lg border border-border bg-background px-3 font-semibold text-sm"
								onChange={(event) => update({ category: event.target.value })}
								value={filters.category}
							>
								{MARKETPLACE_CATEGORIES.map((category) => (
									<option key={category} value={category}>
										{category}
									</option>
								))}
							</select>
						</label>
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
						<label className="flex items-center gap-2 font-bold text-sm">
							<input
								checked={filters.onlyVerified}
								onChange={(event) =>
									update({ onlyVerified: event.target.checked })
								}
								type="checkbox"
							/>
							검증 완료만 보기
						</label>
						<label className="flex items-center gap-2 font-bold text-sm">
							<input
								checked={filters.onlyBeginnerFriendly}
								onChange={(event) =>
									update({ onlyBeginnerFriendly: event.target.checked })
								}
								type="checkbox"
							/>
							초보 가능만 보기
						</label>
					</div>
				</Card>
				<TrustMiniPanel />
			</div>
		</aside>
	);
}

function TrustMiniPanel() {
	return (
		<Card
			className="rounded-lg border-coral-100 bg-coral-50 text-coral-700"
			pad="lg"
			tone="outline"
		>
			<span className="mb-3 inline-flex size-9 items-center justify-center rounded-lg border border-coral-200 bg-card text-coral-600">
				<span className="inline-flex size-5">
					<ShieldIcon />
				</span>
			</span>
			<h2 className="m-0 font-extrabold text-lg">연락처는 보호돼요</h2>
			<p className="mt-2 mb-0 text-[13px] text-coral-700/80 leading-relaxed">
				면접 일정 확정 전까지 전화번호와 외부 연락처는 공개되지 않아요.
			</p>
		</Card>
	);
}

interface MarketplaceSearchProps {
	filters: MarketplaceFilters;
	onChange: FilterChange;
	onOpenFilters?: () => void;
}

export function MarketplaceSearch({
	filters,
	onChange,
	onOpenFilters,
}: MarketplaceSearchProps) {
	const update = (patch: Partial<MarketplaceFilters>) =>
		onChange({ ...filters, ...patch });
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
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
						(filter.id === "beginner" && filters.onlyBeginnerFriendly);
					return (
						<Tag
							key={filter.id}
							onClick={() => {
								if (filter.id === "verified") {
									update({ onlyVerified: !filters.onlyVerified });
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
								후기 {job.reviews}개 · {job.rating}
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

interface SelectedJobPanelProps {
	job?: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
}

export function SelectedJobPanel({
	job,
	onChat,
	onOpen,
}: SelectedJobPanelProps) {
	if (!job) {
		return null;
	}
	return (
		<aside className="hidden w-[292px] shrink-0 xl:block">
			<div className="sticky top-20">
				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="mb-3 flex items-center justify-between gap-3">
						<Logo lang="ko" size="sm" wordmark={false} />
						<div className="flex flex-wrap justify-end gap-1.5">
							{job.promotionLabel ? (
								<Badge tone="pending">{job.promotionLabel}</Badge>
							) : null}
							{job.verified ? <Badge tone="success">검수 통과</Badge> : null}
						</div>
					</div>
					<h2 className="m-0 font-extrabold text-xl leading-snug">
						{job.company} {job.title}
					</h2>
					<p className="mt-2 mb-4 text-muted-foreground text-sm leading-relaxed">
						{job.desc}
					</p>
					<div className="grid gap-3">
						<div className="flex items-center gap-2 font-bold text-sm">
							<span className="inline-flex size-4 text-coral-600">
								<DollarCircle />
							</span>
							{job.pay}
						</div>
						<div className="flex items-center gap-2 font-bold text-sm">
							<span className="inline-flex size-4 text-coral-600">
								<MapPinIcon />
							</span>
							{job.location}
						</div>
						<div className="flex items-center gap-2 font-bold text-sm">
							<span className="inline-flex size-4 text-coral-600">
								<ClockIcon />
							</span>
							{job.hours}
						</div>
					</div>
					<div className="mt-5 rounded-lg bg-coral-50 p-3 text-coral-700">
						<div className="flex items-center gap-2 font-extrabold text-sm">
							<span className="inline-flex size-4">
								<ShieldIcon />
							</span>
							연락처 보호 중
						</div>
						<p className="mt-1 mb-0 text-xs leading-relaxed">
							면접 확정 전까지 전화번호는 공개되지 않아요.
						</p>
					</div>
					<div className="mt-5 grid gap-2">
						<Button block onClick={() => onChat(job)} size="md">
							1:1 채팅 시작
						</Button>
						<Button
							block
							onClick={() => onOpen(job)}
							rightIcon={<ChevronRightIcon />}
							size="md"
							variant="secondary"
						>
							상세 보기
						</Button>
					</div>
				</Card>
			</div>
		</aside>
	);
}

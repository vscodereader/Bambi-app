# Bambi Responsive Marketplace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved 1-3 redesign: seeker marketplace exploration, shared responsive shell, and public first impression as a mobile-first responsive web experience.

**Architecture:** Keep the existing preview components intact for `/preview`, and add production-oriented responsive components alongside them. Put filter/selection rules in a pure `marketplace.ts` module with tests, then compose UI from `ResponsiveAppShell`, marketplace layout components, and responsive seeker detail components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, existing `@bambi-app/ui` primitives, Vitest for pure logic tests, Ultracite/Biome for lint and format.

---

## Scope And File Structure

This plan implements the three approved redesign targets from `docs/superpowers/specs/2026-06-23-bambi-responsive-marketplace-redesign.md`.

- Target 1: 구직자 탐색 경험
- Target 2: 전체 반응형 뼈대
- Target 3: 서비스 첫인상

### Files To Create

- `apps/web/src/lib/bambi/marketplace.ts`
  - Owns filter options, default filter state, query parsing, job filtering, and selected-job fallback.
- `apps/web/src/lib/bambi/marketplace.test.ts`
  - Verifies filtering and selected-job behavior without rendering React.
- `apps/web/src/components/bambi/responsive-shell.tsx`
  - Production responsive shell with mobile top bar, mobile bottom nav slot, and desktop top nav.
- `apps/web/src/components/bambi/marketplace.tsx`
  - Shared marketplace components: filter sidebar, quick filters, responsive job card, job list, selected job panel, public trust strip.
- `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
  - Route-level seeker marketplace screen that adapts between mobile single-column and PC three-column layout.
- `apps/web/src/components/bambi/screens/public-marketplace.tsx`
  - Public first-impression screen based on the marketplace, with login-gated CTA behavior.
- `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
  - Responsive job detail screen with mobile bottom CTA and PC sticky trust/CTA panel.

### Files To Modify

- `apps/web/src/app/page.tsx`
  - Replace role-picker first screen with the public marketplace first impression.
- `apps/web/src/app/seeker/layout.tsx`
  - Use the production responsive shell and seeker nav instead of the mobile-preview-centered shell.
- `apps/web/src/app/seeker/page.tsx`
  - Render the new seeker marketplace screen.
- `apps/web/src/app/seeker/jobs/[id]/page.tsx`
  - Render responsive job detail.
- `apps/web/src/components/bambi/persona-nav.tsx`
  - Keep mobile bottom nav behavior, but make it compatible with the responsive shell content area.
- `apps/web/src/index.css`
  - Add a small set of production page utility classes only if repeated responsive layout classes become unwieldy.

### Files To Avoid Modifying

- `apps/web/src/app/preview/page.tsx`
- `apps/web/src/components/bambi/screens/seeker.tsx`
- `apps/web/src/components/bambi/app-shell.tsx`

These remain as design preview assets until the product screens are stable.

---

## Task 1: Marketplace Filtering Logic

**Files:**
- Create: `apps/web/src/lib/bambi/marketplace.ts`
- Create: `apps/web/src/lib/bambi/marketplace.test.ts`

- [ ] **Step 1: Write failing filter tests**

Create `apps/web/src/lib/bambi/marketplace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { JOBS } from "./data";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	filterMarketplaceJobs,
	getSelectedMarketplaceJob,
} from "./marketplace";

describe("filterMarketplaceJobs", () => {
	it("returns all jobs for the default filter state", () => {
		const result = filterMarketplaceJobs(JOBS, DEFAULT_MARKETPLACE_FILTERS);

		expect(result).toHaveLength(JOBS.length);
	});

	it("filters jobs by free text across title, company, location, and tags", () => {
		const result = filterMarketplaceJobs(JOBS, {
			...DEFAULT_MARKETPLACE_FILTERS,
			query: "청담",
		});

		expect(result.map((job) => job.id)).toEqual(["j1", "j4"]);
	});

	it("filters jobs by region, category, pay, verification, and beginner-friendly chips", () => {
		const result = filterMarketplaceJobs(JOBS, {
			category: "라운지",
			minimumPay: 17_000,
			onlyBeginnerFriendly: true,
			onlyVerified: true,
			query: "",
			region: "강남",
		});

		expect(result.map((job) => job.id)).toEqual(["j1"]);
	});
});

describe("getSelectedMarketplaceJob", () => {
	it("returns the requested job when it is still visible", () => {
		const result = getSelectedMarketplaceJob(JOBS, "j2");

		expect(result?.id).toBe("j2");
	});

	it("falls back to the first visible job when the selected id is missing", () => {
		const result = getSelectedMarketplaceJob(JOBS, "missing");

		expect(result?.id).toBe("j1");
	});
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm vitest run apps/web/src/lib/bambi/marketplace.test.ts
```

Expected: FAIL because `./marketplace` does not exist.

- [ ] **Step 3: Implement marketplace filtering module**

Create `apps/web/src/lib/bambi/marketplace.ts`:

```ts
import type { Job } from "./types";

export const MARKETPLACE_REGIONS = [
	"전체",
	"강남",
	"서초",
	"송파",
	"마포",
	"부천",
	"인천",
] as const;

export const MARKETPLACE_CATEGORIES = [
	"전체",
	"라운지",
	"바",
	"클럽",
	"호스트바",
	"카페",
] as const;

export const MARKETPLACE_QUICK_FILTERS = [
	{ id: "verified", label: "검증 완료" },
	{ id: "today", label: "오늘 면접 가능" },
	{ id: "beginner", label: "초보 가능" },
	{ id: "nearby", label: "내 주변" },
] as const;

export interface MarketplaceFilters {
	category: string;
	minimumPay: number;
	onlyBeginnerFriendly: boolean;
	onlyVerified: boolean;
	query: string;
	region: string;
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
	category: "전체",
	minimumPay: 0,
	onlyBeginnerFriendly: false,
	onlyVerified: false,
	query: "",
	region: "전체",
};

const NUMBER_RE = /\d[\d,]*/;

export function parsePayAmount(pay: string): number {
	const match = NUMBER_RE.exec(pay);
	if (!match) {
		return 0;
	}
	return Number(match[0].replaceAll(",", ""));
}

function normalizeSearchValue(value: string): string {
	return value.trim().toLocaleLowerCase("ko-KR");
}

function jobMatchesQuery(job: Job, query: string): boolean {
	const normalizedQuery = normalizeSearchValue(query);
	if (!normalizedQuery) {
		return true;
	}
	const haystack = [
		job.title,
		job.company,
		job.location,
		job.pay,
		job.type,
		job.hours,
		job.pref,
		...job.tags,
	]
		.join(" ")
		.toLocaleLowerCase("ko-KR");
	return haystack.includes(normalizedQuery);
}

function jobMatchesCategory(job: Job, category: string): boolean {
	if (category === "전체") {
		return true;
	}
	const text = `${job.title} ${job.company} ${job.type} ${job.tags.join(" ")}`;
	return text.includes(category);
}

function jobMatchesRegion(job: Job, region: string): boolean {
	return region === "전체" || job.location.includes(region);
}

function jobMatchesBeginner(job: Job): boolean {
	const text = `${job.title} ${job.desc} ${job.tags.join(" ")}`;
	return text.includes("초보");
}

export function filterMarketplaceJobs(
	jobs: Job[],
	filters: MarketplaceFilters
): Job[] {
	return jobs.filter((job) => {
		if (!jobMatchesQuery(job, filters.query)) {
			return false;
		}
		if (!jobMatchesRegion(job, filters.region)) {
			return false;
		}
		if (!jobMatchesCategory(job, filters.category)) {
			return false;
		}
		if (filters.onlyVerified && !job.verified) {
			return false;
		}
		if (filters.onlyBeginnerFriendly && !jobMatchesBeginner(job)) {
			return false;
		}
		return parsePayAmount(job.pay) >= filters.minimumPay;
	});
}

export function getSelectedMarketplaceJob(
	jobs: Job[],
	selectedJobId?: string
): Job | undefined {
	return jobs.find((job) => job.id === selectedJobId) ?? jobs[0];
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
pnpm vitest run apps/web/src/lib/bambi/marketplace.test.ts
```

Expected: PASS for all 5 assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bambi/marketplace.ts apps/web/src/lib/bambi/marketplace.test.ts
git commit -m "feat: 마켓플레이스 필터 로직 추가" -m "- 공고 검색과 지역, 업종, 급여, 검증 필터 로직을 추가" -m "- 선택 공고 fallback 규칙을 테스트로 고정"
```

---

## Task 2: Responsive Production Shell

**Files:**
- Create: `apps/web/src/components/bambi/responsive-shell.tsx`
- Modify: `apps/web/src/components/bambi/persona-nav.tsx`
- Modify: `apps/web/src/app/seeker/layout.tsx`

- [ ] **Step 1: Create the responsive shell component**

Create `apps/web/src/components/bambi/responsive-shell.tsx`:

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ds";
import { BellIcon, ShieldIcon } from "./icons";

interface NavItem {
	href: Route;
	label: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
	{ href: "/seeker", label: "채용정보" },
	{ href: "/seeker/chats", label: "채팅" },
	{ href: "/", label: "안전가이드" },
	{ href: "/employer", label: "업체 인증" },
];

interface ResponsiveAppShellProps {
	children: ReactNode;
	className?: string;
	navItems?: NavItem[];
	showDesktopNav?: boolean;
	variant?: "public" | "seeker" | "employer" | "moderator";
}

export function ResponsiveAppShell({
	children,
	className,
	navItems = DEFAULT_NAV_ITEMS,
	showDesktopNav = true,
	variant = "public",
}: ResponsiveAppShellProps) {
	const isPublic = variant === "public";
	return (
		<div className="min-h-[100dvh] bg-secondary text-foreground">
			{showDesktopNav ? (
				<header className="sticky top-0 z-30 hidden border-border border-b bg-background/95 backdrop-blur md:block">
					<div className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-6">
						<Link aria-label="밤비 홈" className="no-underline" href="/">
							<Logo lang="ko" size="md" />
						</Link>
						<nav className="flex items-center gap-1">
							{navItems.map((item) => (
								<Link
									className="rounded-lg px-3 py-2 font-bold text-muted-foreground text-sm no-underline transition-colors hover:bg-secondary hover:text-foreground"
									href={item.href}
									key={`${item.href}-${item.label}`}
								>
									{item.label}
								</Link>
							))}
						</nav>
						<div className="ml-auto flex items-center gap-2">
							<span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-green-50 px-3 font-bold text-green-600 text-xs">
								<span className="inline-flex size-3.5">
									<ShieldIcon />
								</span>
								연락처 보호
							</span>
							<Link
								className={cn(
									"inline-flex h-10 items-center rounded-lg px-4 font-bold text-sm no-underline",
									isPublic
										? "bg-ink-800 text-white"
										: "border border-border bg-card text-foreground"
								)}
								href={isPublic ? "/seeker" : "/seeker/me"}
							>
								{isPublic ? "시작하기" : "내 정보"}
							</Link>
						</div>
					</div>
				</header>
			) : null}
			<header className="sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur md:hidden">
				<div className="flex h-14 items-center justify-between px-5">
					<Link aria-label="밤비 홈" className="no-underline" href="/">
						<Logo lang="ko" size="sm" />
					</Link>
					<div className="flex items-center gap-2">
						<span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 font-bold text-foreground text-xs">
							<span className="inline-flex size-3.5 text-green-600">
								<ShieldIcon />
							</span>
							보호 중
						</span>
						<button
							aria-label="알림"
							className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground"
							type="button"
						>
							<span className="inline-flex size-4">
								<BellIcon />
							</span>
						</button>
					</div>
				</div>
			</header>
			<main className={cn("mx-auto min-h-[calc(100dvh-56px)] w-full", className)}>
				{children}
			</main>
		</div>
	);
}
```

- [ ] **Step 2: Adjust persona content wrappers for responsive pages**

Modify `Content` and `NavBar` in `apps/web/src/components/bambi/persona-nav.tsx`:

```tsx
function Content({ children }: { children: ReactNode }) {
	return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

function NavBar({ children }: { children: ReactNode }) {
	return (
		<div className="sticky bottom-0 z-30 border-border border-t bg-background md:hidden">
			{children}
		</div>
	);
}
```

Expected behavior: bottom tabs remain on mobile and disappear on desktop.

- [ ] **Step 3: Wire seeker layout to the responsive shell**

Modify `apps/web/src/app/seeker/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { SeekerNav } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";

export default function SeekerLayout({ children }: { children: ReactNode }) {
	return (
		<ResponsiveAppShell variant="seeker">
			<SeekerNav>{children}</SeekerNav>
		</ResponsiveAppShell>
	);
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --filter web check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/bambi/responsive-shell.tsx apps/web/src/components/bambi/persona-nav.tsx apps/web/src/app/seeker/layout.tsx
git commit -m "feat: 반응형 앱 셸 추가" -m "- PC 상단 내비와 모바일 보호 상태 헤더를 제공하는 ResponsiveAppShell을 추가" -m "- 구직자 하단 탭을 모바일 전용 내비로 조정"
```

---

## Task 3: Shared Marketplace UI Components

**Files:**
- Create: `apps/web/src/components/bambi/marketplace.tsx`

- [ ] **Step 1: Create shared marketplace components**

Create `apps/web/src/components/bambi/marketplace.tsx`:

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Job } from "@/lib/bambi/types";
import {
	MARKETPLACE_CATEGORIES,
	MARKETPLACE_QUICK_FILTERS,
	MARKETPLACE_REGIONS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import {
	Badge,
	Button,
	Card,
	Input,
	Logo,
	Tag,
} from "./ds";
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

interface FilterChange {
	(nextFilters: MarketplaceFilters): void;
}

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
						<label className="flex flex-col gap-2">
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
						</label>
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
		<Card className="rounded-lg bg-ink-800 text-white" pad="lg">
			<span className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-white/10 text-coral-300">
				<span className="inline-flex size-5">
					<ShieldIcon />
				</span>
			</span>
			<h2 className="m-0 font-extrabold text-lg">연락처는 보호돼요</h2>
			<p className="mt-2 mb-0 text-[13px] text-white/70 leading-relaxed">
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
				"rounded-lg border bg-card p-4 transition-colors",
				active ? "border-ink-800 bg-ink-800 text-white" : "border-border"
			)}
		>
			<button
				className="block w-full border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"flex size-12 shrink-0 items-center justify-center rounded-lg font-extrabold",
							active ? "bg-white text-coral-600" : "bg-coral-50 text-coral-700"
						)}
					>
						{job.company.slice(0, 2)}
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-1.5">
							<h3
								className={cn(
									"m-0 truncate font-extrabold text-base",
									active ? "text-white" : "text-foreground"
								)}
							>
								{job.company} {job.title}
							</h3>
							{job.verified ? (
								<Badge tone="success">
									<CheckIcon />
									인증 완료
								</Badge>
							) : null}
						</div>
						<div
							className={cn(
								"mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
								active ? "text-white/70" : "text-muted-foreground"
							)}
						>
							<span className="inline-flex items-center gap-1">
								<MapPinIcon />
								{job.location}
							</span>
							<span className="inline-flex items-center gap-1">
								<ClockIcon />
								{job.hours}
							</span>
						</div>
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<strong
								className={cn(
									"text-[15px]",
									active ? "text-white" : "text-foreground"
								)}
							>
								{job.pay}
							</strong>
							<span
								className={cn(
									"inline-flex items-center gap-1 text-xs",
									active ? "text-white/70" : "text-muted-foreground"
								)}
							>
								<StarIcon />
								후기 {job.reviews}개 · {job.rating}
							</span>
						</div>
					</div>
				</div>
			</button>
			<div className="mt-3 flex items-center justify-between gap-3">
				<div className="flex min-w-0 gap-1 overflow-hidden">
					{job.tags.slice(0, 3).map((tag) => (
						<span
							className={cn(
								"shrink-0 rounded-full px-2.5 py-1 font-bold text-xs",
								active ? "bg-white/10 text-white/80" : "bg-secondary text-muted-foreground"
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
					variant={active ? "primary" : "secondary"}
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
	selectedJobId?: string;
}

export function JobList({ jobs, onChat, onOpen, selectedJobId }: JobListProps) {
	if (jobs.length === 0) {
		return (
			<Card className="rounded-lg text-center" pad="lg" tone="outline">
				<h2 className="m-0 font-extrabold text-lg">조건에 맞는 공고가 없어요</h2>
				<p className="mt-2 mb-0 text-muted-foreground text-sm">
					지역이나 최소 급여 조건을 조금 낮춰보세요.
				</p>
			</Card>
		);
	}
	return (
		<div className="flex flex-col gap-3">
			{jobs.map((job) => (
				<ResponsiveJobCard
					active={job.id === selectedJobId}
					job={job}
					key={job.id}
					onChat={onChat}
					onOpen={onOpen}
				/>
			))}
		</div>
	);
}

interface SelectedJobPanelProps {
	job?: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
}

export function SelectedJobPanel({ job, onChat, onOpen }: SelectedJobPanelProps) {
	if (!job) {
		return null;
	}
	return (
		<aside className="hidden w-[292px] shrink-0 xl:block">
			<div className="sticky top-20">
				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="mb-3 flex items-center justify-between gap-3">
						<Logo lang="ko" size="sm" wordmark={false} />
						{job.verified ? <Badge tone="success">검수 통과</Badge> : null}
					</div>
					<h2 className="m-0 font-extrabold text-xl leading-snug">
						{job.company} {job.title}
					</h2>
					<p className="mt-2 mb-4 text-muted-foreground text-sm leading-relaxed">
						{job.desc}
					</p>
					<div className="grid gap-3">
						<div className="flex items-center gap-2 font-bold text-sm">
							<DollarCircle />
							{job.pay}
						</div>
						<div className="flex items-center gap-2 font-bold text-sm">
							<MapPinIcon />
							{job.location}
						</div>
						<div className="flex items-center gap-2 font-bold text-sm">
							<ClockIcon />
							{job.hours}
						</div>
					</div>
					<div className="mt-5 rounded-lg bg-coral-50 p-3 text-coral-700">
						<div className="flex items-center gap-2 font-extrabold text-sm">
							<ShieldIcon />
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
						<Button block onClick={() => onOpen(job)} size="md" variant="secondary">
							상세 보기
							<ChevronRightIcon />
						</Button>
					</div>
				</Card>
			</div>
		</aside>
	);
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter web check-types
```

Expected: PASS. If `Badge` rejects icon children layout, wrap icon and text in a `span` with `inline-flex`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/bambi/marketplace.tsx
git commit -m "feat: 마켓플레이스 공통 UI 추가" -m "- 필터 사이드바, 검색 칩, 공고 카드, 선택 공고 패널을 추가" -m "- PC와 모바일 탐색 화면에서 재사용할 공통 컴포넌트를 구성"
```

---

## Task 4: Seeker Marketplace Screen

**Files:**
- Create: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
- Modify: `apps/web/src/app/seeker/page.tsx`

- [ ] **Step 1: Create seeker marketplace screen**

Create `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`:

```tsx
"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	filterMarketplaceJobs,
	getSelectedMarketplaceJob,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import { JOBS } from "@/lib/bambi/data";
import type { Job } from "@/lib/bambi/types";
import {
	JobList,
	MarketplaceFilterSidebar,
	MarketplaceSearch,
	SelectedJobPanel,
} from "../marketplace";
import { Badge } from "../ds";
import { ShieldIcon } from "../icons";

export function SeekerMarketplaceScreen() {
	const router = useRouter();
	const [filters, setFilters] = useState<MarketplaceFilters>(
		DEFAULT_MARKETPLACE_FILTERS
	);
	const [selectedJobId, setSelectedJobId] = useState(JOBS[0]?.id);
	const jobs = useMemo(() => filterMarketplaceJobs(JOBS, filters), [filters]);
	const selectedJob = getSelectedMarketplaceJob(jobs, selectedJobId);

	const openJob = (job: Job) => {
		setSelectedJobId(job.id);
		if (window.matchMedia("(max-width: 1023px)").matches) {
			router.push(`/seeker/jobs/${job.id}` as Route);
		}
	};

	const chatJob = (job: Job) => {
		router.push(`/seeker/chats/${job.id}` as Route);
	};

	return (
		<div className="mx-auto flex w-full max-w-[1180px] gap-5 px-4 py-5 pb-24 md:px-6 md:py-7 lg:pb-8">
			<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
			<section className="min-w-0 flex-1">
				<div className="mb-5 flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Badge className="w-fit" tone="success">
							<ShieldIcon />
							익명 보호 중
						</Badge>
						<h1 className="m-0 font-extrabold text-2xl leading-tight md:text-[30px]">
							조건에 맞는 안전한 자리를 찾아요
						</h1>
						<p className="m-0 max-w-[640px] text-muted-foreground text-sm leading-relaxed md:text-base">
							검수된 공고를 먼저 보고, 면접 확정 전까지 연락처는 비공개로 보호돼요.
						</p>
					</div>
					<MarketplaceSearch filters={filters} onChange={setFilters} />
				</div>
				<div className="mb-3 flex items-center justify-between">
					<h2 className="m-0 font-extrabold text-lg">추천 공고</h2>
					<span className="font-semibold text-muted-foreground text-sm">
						{jobs.length}개
					</span>
				</div>
				<JobList
					jobs={jobs}
					onChat={chatJob}
					onOpen={openJob}
					selectedJobId={selectedJob?.id}
				/>
			</section>
			<SelectedJobPanel job={selectedJob} onChat={chatJob} onOpen={openJob} />
		</div>
	);
}
```

- [ ] **Step 2: Wire seeker page**

Modify `apps/web/src/app/seeker/page.tsx`:

```tsx
import { SeekerMarketplaceScreen } from "@/components/bambi/screens/seeker-marketplace";

export default function SeekerHomePage() {
	return <SeekerMarketplaceScreen />;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter web check-types
```

Expected: PASS.

- [ ] **Step 4: Browser verify `/seeker`**

Run dev server if needed:

```bash
pnpm --filter web dev
```

Open:

```text
http://localhost:23001/seeker
```

Expected:
- 375px: single-column list, bottom nav visible, no horizontal overflow.
- 1280px: desktop top nav, left filter sidebar, central list, right selected job panel.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/bambi/screens/seeker-marketplace.tsx apps/web/src/app/seeker/page.tsx
git commit -m "feat: 구직자 반응형 탐색 화면 적용" -m "- 구직자 홈을 모바일 단일 컬럼과 PC 3열 마켓플레이스 구조로 전환" -m "- 검색, 빠른 필터, 선택 공고 패널을 연결"
```

---

## Task 5: Responsive Job Detail

**Files:**
- Create: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
- Modify: `apps/web/src/app/seeker/jobs/[id]/page.tsx`

- [ ] **Step 1: Create responsive job detail component**

Create `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`:

```tsx
"use client";

import type { Job } from "@/lib/bambi/types";
import { Badge, Button, Card, InfoTile } from "../ds";
import {
	AlertCircle,
	BookmarkIcon,
	BriefcaseIcon,
	CheckIcon,
	ClockIcon,
	DollarCircle,
	MapPinIcon,
	Message,
	ShieldIcon,
	StarIcon,
} from "../icons";

interface SeekerJobDetailResponsiveProps {
	job: Job;
	onBack: () => void;
	onReport: () => void;
	onStartChat: () => void;
}

export function SeekerJobDetailResponsive({
	job,
	onBack,
	onReport,
	onStartChat,
}: SeekerJobDetailResponsiveProps) {
	return (
		<div className="mx-auto w-full max-w-[1120px] px-4 py-5 pb-28 md:px-6 md:py-7 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:pb-8">
			<main className="min-w-0">
				<button
					className="mb-4 rounded-lg border border-border bg-card px-3 py-2 font-bold text-sm"
					onClick={onBack}
					type="button"
				>
					목록으로
				</button>
				<section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge tone="success">
								<CheckIcon />
								검수 통과한 공고
							</Badge>
							<Badge tone="neutral">
								<ShieldIcon />
								연락처 보호
							</Badge>
						</div>
						<div>
							<h1 className="m-0 font-extrabold text-[28px] leading-tight md:text-[34px]">
								{job.company} {job.title}
							</h1>
							<p className="mt-2 mb-0 text-muted-foreground">
								{job.location} · {job.type}
							</p>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<InfoTile icon={<DollarCircle />} label="급여" value={job.pay} />
							<InfoTile icon={<ClockIcon />} label="근무시간" value={job.hours} />
							<InfoTile icon={<BriefcaseIcon />} label="고용형태" value={job.type} />
							<InfoTile icon={<StarIcon />} label="후기" value={`${job.reviews}개 · ${job.rating}`} />
						</div>
					</div>
				</section>
				<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
					<h2 className="m-0 font-extrabold text-xl">공고 설명</h2>
					<p className="mt-3 mb-0 text-[15px] leading-relaxed text-foreground">
						{job.desc}
					</p>
				</section>
				<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
					<h2 className="m-0 font-extrabold text-xl">안전 확인</h2>
					<div className="mt-4 grid gap-3 md:grid-cols-3">
						<Card className="rounded-lg" pad="md" tone="subtle">
							<ShieldIcon />
							<h3 className="my-2 font-extrabold text-base">연락처 비공개</h3>
							<p className="m-0 text-muted-foreground text-sm leading-relaxed">
								면접 확정 전까지 전화번호는 공개되지 않아요.
							</p>
						</Card>
						<Card className="rounded-lg" pad="md" tone="subtle">
							<CheckIcon />
							<h3 className="my-2 font-extrabold text-base">공고 검수</h3>
							<p className="m-0 text-muted-foreground text-sm leading-relaxed">
								위험 표현과 업체 상태를 검수한 공고예요.
							</p>
						</Card>
						<Card className="rounded-lg" pad="md" tone="subtle">
							<AlertCircle />
							<h3 className="my-2 font-extrabold text-base">신고 가능</h3>
							<p className="m-0 text-muted-foreground text-sm leading-relaxed">
								조건 불일치나 외부 연락 유도는 바로 신고할 수 있어요.
							</p>
						</Card>
					</div>
				</section>
			</main>
			<aside className="hidden lg:block">
				<div className="sticky top-20 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
					<Badge tone="success">검증 완료</Badge>
					<h2 className="mt-3 mb-2 font-extrabold text-xl">{job.pay}</h2>
					<div className="grid gap-3 text-sm">
						<div className="flex items-center gap-2 font-bold">
							<MapPinIcon />
							{job.location}
						</div>
						<div className="flex items-center gap-2 font-bold">
							<ClockIcon />
							{job.hours}
						</div>
					</div>
					<div className="mt-5 rounded-lg bg-coral-50 p-3 text-coral-700">
						<div className="flex items-center gap-2 font-extrabold text-sm">
							<ShieldIcon />
							안전하게 채팅 시작
						</div>
						<p className="mt-1 mb-0 text-xs leading-relaxed">
							플랫폼 안에서 먼저 대화하고, 면접 확정 뒤 연락처 공개를 선택해요.
						</p>
					</div>
					<Button block className="mt-5" onClick={onStartChat} rightIcon={<Message />}>
						1:1 채팅 시작
					</Button>
					<Button block className="mt-2" onClick={onReport} size="md" variant="secondary">
						공고 신고
					</Button>
				</div>
			</aside>
			<div className="fixed right-0 bottom-0 left-0 z-30 border-border border-t bg-background p-4 lg:hidden">
				<Button block onClick={onStartChat} rightIcon={<Message />}>
					1:1 채팅 시작
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Wire job detail route**

Modify `apps/web/src/app/seeker/jobs/[id]/page.tsx`:

```tsx
"use client";

import type { Route } from "next";
import { notFound, useParams, useRouter } from "next/navigation";
import { SeekerJobDetailResponsive } from "@/components/bambi/screens/seeker-job-detail-responsive";
import { JOBS } from "@/lib/bambi/data";

export default function SeekerJobPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const job = JOBS.find((item) => item.id === id);
	if (!job) {
		notFound();
	}
	return (
		<SeekerJobDetailResponsive
			job={job}
			onBack={() => router.push("/seeker")}
			onReport={() => router.push(`/seeker/chats/${job.id}` as Route)}
			onStartChat={() => router.push(`/seeker/chats/${job.id}` as Route)}
		/>
	);
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter web check-types
```

Expected: PASS.

- [ ] **Step 4: Browser verify job detail**

Open:

```text
http://localhost:23001/seeker/jobs/j1
```

Expected:
- 375px: one column, bottom CTA fixed, no content hidden under CTA after scrolling to bottom.
- 1280px: two-column layout with sticky right CTA panel.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx 'apps/web/src/app/seeker/jobs/[id]/page.tsx'
git commit -m "feat: 공고 상세 반응형 화면 적용" -m "- 모바일 하단 CTA와 PC sticky 신뢰 패널을 갖춘 상세 화면을 추가" -m "- 공고 상세에서 연락처 보호와 신고 가능성을 명확히 노출"
```

---

## Task 6: Public First Impression Marketplace

**Files:**
- Create: `apps/web/src/components/bambi/screens/public-marketplace.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Create public marketplace screen**

Create `apps/web/src/components/bambi/screens/public-marketplace.tsx`:

```tsx
"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DEFAULT_MARKETPLACE_FILTERS, filterMarketplaceJobs, type MarketplaceFilters } from "@/lib/bambi/marketplace";
import { JOBS } from "@/lib/bambi/data";
import type { Job } from "@/lib/bambi/types";
import {
	JobList,
	MarketplaceFilterSidebar,
	MarketplaceSearch,
	SelectedJobPanel,
} from "../marketplace";
import { Badge, Button } from "../ds";
import { ResponsiveAppShell } from "../responsive-shell";
import { ShieldIcon } from "../icons";

export function PublicMarketplaceScreen() {
	const router = useRouter();
	const [filters, setFilters] = useState<MarketplaceFilters>(
		DEFAULT_MARKETPLACE_FILTERS
	);
	const jobs = useMemo(() => filterMarketplaceJobs(JOBS, filters), [filters]);
	const selectedJob = jobs[0];
	const openJob = (job: Job) => router.push(`/seeker/jobs/${job.id}` as Route);
	const startChat = () => router.push("/seeker" as Route);
	return (
		<ResponsiveAppShell variant="public">
			<div className="mx-auto flex w-full max-w-[1180px] gap-5 px-4 py-6 pb-16 md:px-6 md:py-10">
				<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
				<section className="min-w-0 flex-1">
					<div className="mb-6 rounded-lg bg-background p-5 shadow-sm ring-1 ring-border md:p-8">
						<Badge tone="success">
							<ShieldIcon />
							면접 전 연락처 비공개
						</Badge>
						<h1 className="mt-4 mb-3 font-extrabold text-[30px] leading-tight md:text-[42px]">
							안전하게 비교하고,
							<br />
							밤비 안에서 먼저 대화해요
						</h1>
						<p className="m-0 max-w-[620px] text-muted-foreground leading-relaxed">
							지역, 업종, 급여로 빠르게 찾고 검수된 공고를 먼저 확인하세요.
							채팅 시작 전 필요한 인증과 보호 안내를 함께 제공합니다.
						</p>
						<div className="mt-5 flex flex-col gap-3 sm:flex-row">
							<Button onClick={() => router.push("/seeker")}>공고 둘러보기</Button>
							<Button onClick={() => router.push("/employer")} variant="secondary">
								업체로 시작하기
							</Button>
						</div>
					</div>
					<div className="mb-4">
						<MarketplaceSearch filters={filters} onChange={setFilters} />
					</div>
					<div className="mb-3 flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-lg">지금 확인할 수 있는 공고</h2>
						<span className="font-semibold text-muted-foreground text-sm">
							{jobs.length}개
						</span>
					</div>
					<JobList jobs={jobs} onChat={startChat} onOpen={openJob} />
				</section>
				<SelectedJobPanel job={selectedJob} onChat={startChat} onOpen={openJob} />
			</div>
		</ResponsiveAppShell>
	);
}
```

- [ ] **Step 2: Wire public home**

Modify `apps/web/src/app/page.tsx`:

```tsx
import { PublicMarketplaceScreen } from "@/components/bambi/screens/public-marketplace";

export default function Home() {
	return <PublicMarketplaceScreen />;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter web check-types
```

Expected: PASS.

- [ ] **Step 4: Browser verify `/`**

Open:

```text
http://localhost:23001/
```

Expected:
- First viewport shows brand, safety message, search, filters, and jobs.
- It does not show a marketing-only role picker as the primary experience.
- Chat CTA routes to `/seeker` instead of exposing contact details.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/bambi/screens/public-marketplace.tsx apps/web/src/app/page.tsx
git commit -m "feat: 비로그인 마켓플레이스 홈 적용" -m "- 첫 화면을 역할 선택 랜딩에서 탐색 가능한 채용 홈으로 전환" -m "- 비로그인 채팅 CTA를 구직자 시작 흐름으로 연결"
```

---

## Task 7: Final Verification And Polish

**Files:**
- Modify only files already touched if verification shows layout or type issues.

- [ ] **Step 1: Run full typecheck**

Run:

```bash
pnpm run check-types
```

Expected: PASS across the monorepo.

- [ ] **Step 2: Run Ultracite check**

Run:

```bash
pnpm run check
```

Expected: PASS. If formatting errors appear, run `pnpm dlx ultracite fix`, inspect the diff, then rerun `pnpm run check`.

- [ ] **Step 3: Browser verify desktop and mobile**

Run dev server if needed:

```bash
pnpm --filter web dev
```

Verify:

```text
http://localhost:23001/
http://localhost:23001/seeker
http://localhost:23001/seeker/jobs/j1
```

Viewport checks:

- 375x812: no horizontal overflow, mobile bottom nav visible on `/seeker`, fixed CTA visible on detail.
- 768x900: readable single-to-rail transition, no overlapping panels.
- 1280x900: public and seeker marketplace use desktop width, not centered phone frame.

- [ ] **Step 4: Final commit**

If Task 7 required fixes:

```bash
git add apps/web/src
git commit -m "fix: 반응형 마켓플레이스 검증 이슈 수정" -m "- 타입 검사와 Ultracite 점검에서 발견된 문제를 정리" -m "- 모바일과 PC viewport 레이아웃 깨짐을 보정"
```

If Task 7 required no fixes, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage:
  - 구직자 탐색 경험: Tasks 1, 3, 4, 5.
  - 전체 반응형 뼈대: Task 2.
  - 서비스 첫인상: Task 6.
  - 검증 기준: Task 7.
- Placeholder scan: no banned placeholder markers remain.
- Type consistency:
  - `MarketplaceFilters`, `filterMarketplaceJobs`, and `getSelectedMarketplaceJob` are introduced in Task 1 and reused consistently in Tasks 3, 4, and 6.
  - Route-level screens own navigation callbacks; shared marketplace components remain reusable and receive callbacks as props.

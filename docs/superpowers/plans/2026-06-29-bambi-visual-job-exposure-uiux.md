# Bambi Visual Job Exposure UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Web marketplace presentation so job posts look more visually abundant and promotion-driven while keeping Bambi's safety-first tone.

**Architecture:** Reuse the existing `premium`, `recommended`, and `organic` marketplace sections from the Bambi jobs API. Add Web-only section grouping helpers and focused marketplace components so Queenalba-style visual exposure is introduced without changing DB promotion enums or payment logic.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, TanStack Query, oRPC, Vitest, Ultracite, Playwright/browser smoke.

---

## Source Context

- [Queenalba 채용정보 노출 벤치마킹 정리](../../queenalba-benchmark-2026-06-29.md)
- [Visual Job Exposure UI/UX Design](../specs/2026-06-29-bambi-visual-job-exposure-uiux-design.md)
- [Foxalba 벤치마킹 정리](../../foxalba-benchmark-2026-06-24.md)
- [Web 최종 QA 승인 게이트](./2026-06-26-bambi-web-final-qa-acceptance.md)

## Scope

Included:

- Public home and seeker marketplace visual job exposure sections.
- Compact visual job cards for promoted jobs.
- Dense row refinement for organic jobs.
- Web-only section grouping helper for `special`, `urgent`, `recommended`, and `organic`.
- Employer create/edit listing preview that shows how cover image and title appear in compact marketplace placement.
- Desktop and mobile browser smoke.

Excluded:

- New database migration.
- New payment provider integration.
- New promotion tier enum.
- Native App parity.
- Free-form HTML editing.
- Side fixed ads, blinking ads, or autoplay visual effects.

## File Structure

- Create: `apps/web/src/lib/bambi/visual-job-exposure.ts`
  - Build Web-only display groups from `MarketplaceJobSections`.
  - Export `getVisualJobExposureSections`.
- Create: `apps/web/src/lib/bambi/visual-job-exposure.test.ts`
  - Cover special, urgent, recommended, and organic grouping.
- Create: `apps/web/src/components/bambi/visual-job-card.tsx`
  - Render compact promoted job cards.
- Create: `apps/web/src/components/bambi/dense-job-row.tsx`
  - Render condensed organic rows.
- Create: `apps/web/src/components/bambi/visual-job-components.test.ts`
  - Guard the compact card and dense row source-level structure.
- Create: `apps/web/src/components/bambi/visual-job-exposure-sections.tsx`
  - Compose grouped sections and route click/chat handlers.
- Create: `apps/web/src/components/bambi/employer-listing-preview.tsx`
  - Show cover/title/pay preview inside create/edit pages.
- Modify: `apps/web/src/components/bambi/marketplace.tsx`
  - Keep search/filter/selected panel exports and delegate job list rendering to new components.
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
  - Render visual exposure sections instead of the current plain `JobList`.
- Modify: `apps/web/src/components/bambi/screens/public-marketplace.tsx`
  - Render visual exposure sections on the public home surface.
- Modify: `apps/web/src/app/employer/new/page.tsx`
  - Add listing preview near media/title fields.
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`
  - Add listing preview for existing media/title fields.
- Modify: `docs/result.md`
  - Record this UI/UX improvement as the next Web work after baseline completion.
- Modify: `docs/superpowers/plans/2026-06-23-bambi-post-mvp-roadmap.md`
  - Link this plan as an active Web UI/UX improvement, separate from completed Post-MVP items and deferred Native App.

## Display Group Rules

Use these rules in `visual-job-exposure.ts`:

```ts
import type { Job, MarketplaceJobSections } from "./types";

export interface VisualJobExposureSections {
	organic: Job[];
	recommended: Job[];
	special: Job[];
	urgent: Job[];
}

const getBoostTime = (job: Job): number => {
	if (!job.lastBoostedAt) {
		return 0;
	}

	const value = new Date(job.lastBoostedAt).getTime();
	return Number.isFinite(value) ? value : 0;
};

export const getVisualJobExposureSections = (
	sections: MarketplaceJobSections
): VisualJobExposureSections => {
	const promotedJobs = [...sections.premium, ...sections.recommended];
	const urgent = promotedJobs
		.filter((job) => getBoostTime(job) > 0)
		.toSorted((left, right) => getBoostTime(right) - getBoostTime(left))
		.slice(0, 6);

	return {
		organic: sections.organic,
		recommended: sections.recommended,
		special: sections.premium,
		urgent,
	};
};
```

## Task 1: Visual Exposure Grouping Helper

**Files:**

- Create: `apps/web/src/lib/bambi/visual-job-exposure.ts`
- Create: `apps/web/src/lib/bambi/visual-job-exposure.test.ts`

- [x] **Step 1: Write the failing grouping tests**

Create `apps/web/src/lib/bambi/visual-job-exposure.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getVisualJobExposureSections } from "./visual-job-exposure";
import type { Job, MarketplaceJobSections } from "./types";

const job = (patch: Partial<Job> & Pick<Job, "id">): Job => ({
	company: "테스트업체",
	coverImage: null,
	desc: "검수된 테스트 공고입니다.",
	featured: false,
	hours: "협의",
	isPromoted: false,
	lastBoostedAt: null,
	location: "서울 강남구",
	pay: "시급 150,000원",
	pref: "면접 전 연락처 보호",
	promotionLabel: null,
	promotionTier: null,
	rating: 0,
	reviews: 0,
	status: "published",
	tags: ["검수 완료"],
	title: "테스트 공고",
	type: "라운지",
	verified: true,
	...patch,
});

describe("getVisualJobExposureSections", () => {
	it("maps premium jobs to special exposure", () => {
		const premium = job({
			id: "premium-1",
			isPromoted: true,
			promotionLabel: "프리미엄",
			promotionTier: "premium",
		});
		const sections: MarketplaceJobSections = {
			organic: [],
			premium: [premium],
			recommended: [],
		};

		expect(getVisualJobExposureSections(sections).special).toEqual([premium]);
	});

	it("builds urgent exposure from recently boosted promoted jobs", () => {
		const older = job({
			id: "older",
			isPromoted: true,
			lastBoostedAt: "2026-06-29T01:00:00.000Z",
			promotionTier: "recommended",
		});
		const newer = job({
			id: "newer",
			isPromoted: true,
			lastBoostedAt: "2026-06-29T02:00:00.000Z",
			promotionTier: "premium",
		});
		const sections: MarketplaceJobSections = {
			organic: [],
			premium: [newer],
			recommended: [older],
		};

		expect(getVisualJobExposureSections(sections).urgent.map((item) => item.id))
			.toEqual(["newer", "older"]);
	});

	it("keeps recommended and organic sections unchanged", () => {
		const recommended = job({ id: "recommended-1" });
		const organic = job({ id: "organic-1" });
		const sections: MarketplaceJobSections = {
			organic: [organic],
			premium: [],
			recommended: [recommended],
		};

		const result = getVisualJobExposureSections(sections);

		expect(result.recommended).toEqual([recommended]);
		expect(result.organic).toEqual([organic]);
	});
});
```

- [x] **Step 2: Run grouping tests and verify failure**

Run:

```bash
pnpm vitest run apps/web/src/lib/bambi/visual-job-exposure.test.ts
```

Expected: FAIL because `apps/web/src/lib/bambi/visual-job-exposure.ts` does not exist.

- [x] **Step 3: Implement the grouping helper**

Create `apps/web/src/lib/bambi/visual-job-exposure.ts` using the code from the `Display Group Rules` section.

- [x] **Step 4: Run grouping tests and verify pass**

Run:

```bash
pnpm vitest run apps/web/src/lib/bambi/visual-job-exposure.test.ts
```

Expected: PASS with 3 tests.

## Task 2: Compact Visual Job Components

**Files:**

- Create: `apps/web/src/components/bambi/visual-job-card.tsx`
- Create: `apps/web/src/components/bambi/dense-job-row.tsx`

- [x] **Step 1: Create `VisualJobCard`**

Create `apps/web/src/components/bambi/visual-job-card.tsx`:

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button } from "./ds";
import { CheckIcon, MapPinIcon, Message, ShieldIcon } from "./icons";

interface VisualJobCardProps {
	job: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	tone: "recommended" | "special" | "urgent";
}

const toneClassName = {
	recommended: "border-sky-200 bg-sky-50/50",
	special: "border-coral-200 bg-coral-50/70",
	urgent: "border-amber-200 bg-amber-50/70",
} as const;

const toneLabel = {
	recommended: "추천",
	special: "스페셜",
	urgent: "급구",
} as const;

export function VisualJobCard({
	job,
	onChat,
	onOpen,
	tone,
}: VisualJobCardProps) {
	return (
		<article
			className={cn(
				"grid min-h-[148px] rounded-lg border bg-card p-2.5 transition-colors",
				toneClassName[tone]
			)}
		>
			<button
				className="grid cursor-pointer gap-2 border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
				<div className="flex items-start gap-2">
					{job.coverImage ? (
						<Image
							alt={job.coverImage.altText || job.coverImage.fileName}
							className="size-12 shrink-0 rounded-md border border-white object-cover"
							height={48}
							src={job.coverImage.url}
							unoptimized
							width={48}
						/>
					) : (
						<div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-white bg-card font-extrabold text-coral-700 text-xs">
							{job.company.slice(0, 2)}
						</div>
					)}
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-1">
							<Badge tone="pending">
								{job.promotionLabel ?? toneLabel[tone]}
							</Badge>
							{job.verified ? (
								<Badge tone="success">
									<span className="inline-flex size-3">
										<CheckIcon />
									</span>
									검수
								</Badge>
							) : null}
						</div>
						<h3 className="mt-1 mb-0 line-clamp-2 font-extrabold text-[13px] leading-snug">
							{job.company} {job.title}
						</h3>
					</div>
				</div>
				<div className="grid gap-1 text-xs">
					<span className="truncate font-bold text-foreground">{job.pay}</span>
					<span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
						<span className="inline-flex size-3">
							<MapPinIcon />
						</span>
						<span className="truncate">{job.location}</span>
					</span>
					<span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
						<span className="inline-flex size-3">
							<ShieldIcon />
						</span>
						<span className="truncate">연락처 보호</span>
					</span>
				</div>
			</button>
			<Button
				className="mt-2 h-8 justify-center"
				onClick={() => onChat(job)}
				rightIcon={<Message />}
				size="sm"
				variant="secondary"
			>
				채팅
			</Button>
		</article>
	);
}
```

- [x] **Step 2: Create `DenseJobRow`**

Create `apps/web/src/components/bambi/dense-job-row.tsx`:

```tsx
"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button } from "./ds";
import { CheckIcon, ClockIcon, MapPinIcon, Message } from "./icons";

interface DenseJobRowProps {
	active?: boolean;
	job: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
}

export function DenseJobRow({
	active = false,
	job,
	onChat,
	onOpen,
}: DenseJobRowProps) {
	return (
		<article
			className={cn(
				"grid gap-2 rounded-lg border bg-card p-2.5 transition-colors sm:grid-cols-[1fr_auto] sm:items-center",
				active ? "border-coral-400 ring-2 ring-coral-100" : "border-border"
			)}
		>
			<button
				className="flex min-w-0 cursor-pointer items-start gap-2 border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
				{job.coverImage ? (
					<Image
						alt={job.coverImage.altText || job.coverImage.fileName}
						className="size-10 shrink-0 rounded-md border border-border object-cover"
						height={40}
						src={job.coverImage.url}
						unoptimized
						width={40}
					/>
				) : (
					<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-coral-50 font-extrabold text-coral-700 text-xs">
						{job.company.slice(0, 2)}
					</div>
				)}
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 flex-wrap items-center gap-1.5">
						<h3 className="m-0 max-w-full truncate font-extrabold text-[14px]">
							{job.company} {job.title}
						</h3>
						{job.verified ? (
							<Badge tone="success">
								<span className="inline-flex size-3">
									<CheckIcon />
								</span>
								검수
							</Badge>
						) : null}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
						<span className="inline-flex items-center gap-1">
							<span className="inline-flex size-3">
								<MapPinIcon />
							</span>
							{job.location}
						</span>
						<span className="inline-flex items-center gap-1">
							<span className="inline-flex size-3">
								<ClockIcon />
							</span>
							{job.hours}
						</span>
						<strong className="text-foreground">{job.pay}</strong>
					</div>
				</div>
			</button>
			<Button
				className="h-8 justify-center"
				onClick={() => onChat(job)}
				rightIcon={<Message />}
				size="sm"
				variant="secondary"
			>
				채팅
			</Button>
		</article>
	);
}
```

- [x] **Step 3: Run typecheck for component imports**

Run:

```bash
pnpm run check-types
```

Expected: PASS. If icon or badge tone names differ, adjust to existing exported names rather than adding new UI primitives.

## Task 3: Visual Exposure Sections

**Files:**

- Create: `apps/web/src/components/bambi/visual-job-exposure-sections.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
- Modify: `apps/web/src/components/bambi/marketplace.tsx`

- [ ] **Step 1: Create section composition component**

Create `apps/web/src/components/bambi/visual-job-exposure-sections.tsx`:

```tsx
"use client";

import { getVisualJobExposureSections } from "@/lib/bambi/visual-job-exposure";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { Card } from "./ds";
import { DenseJobRow } from "./dense-job-row";
import { VisualJobCard } from "./visual-job-card";

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
				<section className="grid gap-2">
					<div className="flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-base">스페셜 채용</h2>
						<span className="font-semibold text-muted-foreground text-xs">
							{visualSections.special.length}개 · 프리미엄 노출
						</span>
					</div>
					<div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-4">
						{visualSections.special.map((job) => (
							<VisualJobCard
								job={job}
								key={`special-${job.id}`}
								onChat={onChat}
								onOpen={onOpen}
								tone="special"
							/>
						))}
					</div>
				</section>
			) : null}
			{visualSections.urgent.length > 0 ? (
				<section className="grid gap-2">
					<div className="flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-base">급구 채용</h2>
						<span className="font-semibold text-muted-foreground text-xs">
							{visualSections.urgent.length}개 · 최근 끌어올림
						</span>
					</div>
					<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
						{visualSections.urgent.map((job) => (
							<VisualJobCard
								job={job}
								key={`urgent-${job.id}`}
								onChat={onChat}
								onOpen={onOpen}
								tone="urgent"
							/>
						))}
					</div>
				</section>
			) : null}
			{visualSections.recommended.length > 0 ? (
				<section className="grid gap-2">
					<div className="flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-base">추천 채용</h2>
						<span className="font-semibold text-muted-foreground text-xs">
							{visualSections.recommended.length}개 · 상단 추천
						</span>
					</div>
					<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
						{visualSections.recommended.map((job) => (
							<VisualJobCard
								job={job}
								key={`recommended-${job.id}`}
								onChat={onChat}
								onOpen={onOpen}
								tone="recommended"
							/>
						))}
					</div>
				</section>
			) : null}
			<section className="grid gap-2">
				<div className="flex items-center justify-between">
					<h2 className="m-0 font-extrabold text-base">전체 공고</h2>
					<span className="font-semibold text-muted-foreground text-xs">
						{visualSections.organic.length}개 · 최신순
					</span>
				</div>
				<div className="grid gap-2">
					{visualSections.organic.map((job) => (
						<DenseJobRow
							active={job.id === selectedJobId}
							job={job}
							key={`organic-${job.id}`}
							onChat={onChat}
							onOpen={onOpen}
						/>
					))}
				</div>
			</section>
		</div>
	);
}
```

- [ ] **Step 2: Wire seeker marketplace screen**

Modify `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`:

- Replace `JobList` import with `VisualJobExposureSections`.
- Replace the `<JobList ... />` call with:

```tsx
<VisualJobExposureSections
	jobs={jobs}
	onChat={chatJob}
	onOpen={openJob}
	sections={sections}
	selectedJobId={selectedJob?.id}
/>
```

- [ ] **Step 3: Keep old `JobList` export stable or remove only when unused**

Search:

```bash
rg -n "JobList" apps/web/src
```

If only `marketplace.tsx` defines it and no route imports it, remove `JobList`, `marketplaceSectionMeta`, and `ResponsiveJobCard` from `apps/web/src/components/bambi/marketplace.tsx`. Keep `MarketplaceFilterSidebar`, `MarketplaceSearch`, and `SelectedJobPanel`.

- [ ] **Step 4: Run checks**

Run:

```bash
pnpm vitest run apps/web/src/lib/bambi/visual-job-exposure.test.ts
pnpm run check-types
pnpm run check
```

Expected: all commands pass.

## Task 4: Public Home Visual Exposure

**Files:**

- Modify: `apps/web/src/components/bambi/screens/public-marketplace.tsx`

- [ ] **Step 1: Inspect current public marketplace screen**

Run:

```bash
sed -n '1,260p' apps/web/src/components/bambi/screens/public-marketplace.tsx
```

Expected: `PublicMarketplaceScreen` renders the public home job discovery surface and currently imports `JobList` from `marketplace.tsx`.

- [ ] **Step 2: Reuse the same visual exposure surface**

Modify `apps/web/src/components/bambi/screens/public-marketplace.tsx`:

- Replace `JobList` import with `VisualJobExposureSections`.
- Replace the `<JobList ... />` call with:

```tsx
<VisualJobExposureSections
	jobs={jobs}
	onChat={startChat}
	onOpen={openJob}
	sections={sections}
/>
```

Keep `apps/web/src/app/page.tsx` unchanged unless its only import path changes. The first screen should remain actual job discovery, not a new marketing landing page.

- [ ] **Step 3: Browser smoke public home**

Start dev servers if needed:

```bash
pnpm run dev:server
pnpm run dev:web
```

Open:

```text
http://localhost:23001/
```

Expected: public home renders job discovery with visual exposure sections or intentionally routes to the existing marketplace without a Next.js error page.

## Task 5: Employer Listing Preview

**Files:**

- Create: `apps/web/src/components/bambi/employer-listing-preview.tsx`
- Modify: `apps/web/src/app/employer/new/page.tsx`
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`

- [ ] **Step 1: Create listing preview component**

Create `apps/web/src/components/bambi/employer-listing-preview.tsx`:

```tsx
"use client";

import Image from "next/image";
import { Badge, Card } from "./ds";

interface EmployerListingPreviewProps {
	companyName: string;
	coverImageUrl?: string;
	location: string;
	pay: string;
	title: string;
}

export function EmployerListingPreview({
	companyName,
	coverImageUrl,
	location,
	pay,
	title,
}: EmployerListingPreviewProps) {
	return (
		<Card className="rounded-lg" pad="md" tone="outline">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="m-0 font-extrabold text-sm">목록 노출 미리보기</h2>
				<Badge tone="pending">대표 이미지 반영</Badge>
			</div>
			<div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3">
				{coverImageUrl ? (
					<Image
						alt={`${companyName} 대표 이미지 미리보기`}
						className="size-14 shrink-0 rounded-md border border-border object-cover"
						height={56}
						src={coverImageUrl}
						unoptimized
						width={56}
					/>
				) : (
					<div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-coral-50 font-extrabold text-coral-700 text-sm">
						{companyName.slice(0, 2)}
					</div>
				)}
				<div className="min-w-0 flex-1">
					<h3 className="m-0 line-clamp-2 font-extrabold text-sm">
						{companyName} {title || "공고 제목"}
					</h3>
					<div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
						<span>{location || "지역"}</span>
						<strong className="text-foreground">{pay || "급여"}</strong>
					</div>
					<p className="mt-2 mb-0 text-muted-foreground text-xs">
						대표 이미지는 스페셜/추천 채용 카드와 전체 공고 row에 함께 사용돼요.
					</p>
				</div>
			</div>
		</Card>
	);
}
```

- [ ] **Step 2: Wire preview into create page**

Inspect form state in `apps/web/src/app/employer/new/page.tsx`. Render `EmployerListingPreview` near the media uploader using the current title, region, pay amount/unit, and selected cover preview URL.

Use this pay text format when the page has raw form values:

```ts
const previewPay =
	form.payAmount > 0 ? `${form.payUnit} ${form.payAmount.toLocaleString("ko-KR")}원` : "";
```

- [ ] **Step 3: Wire preview into edit page**

Inspect form state in `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`. Render `EmployerListingPreview` with existing cover image URL when no new local cover preview is selected.

- [ ] **Step 4: Run Web checks**

Run:

```bash
pnpm run check-types
pnpm run check
```

Expected: both commands pass.

## Task 6: Verification And Documentation

**Files:**

- Modify: `docs/result.md`
- Modify: `docs/superpowers/plans/2026-06-23-bambi-post-mvp-roadmap.md`
- Modify this plan with verification notes.

- [ ] **Step 1: Run full Web verification**

Run:

```bash
pnpm vitest run apps/web/src/lib/bambi/visual-job-exposure.test.ts
pnpm run check-types
pnpm run check
pnpm --filter web build
```

Expected: all commands pass.

- [ ] **Step 2: Browser smoke `/` and `/seeker`**

With local API and Web servers running, verify:

```text
http://localhost:23001/
http://localhost:23001/seeker
```

Expected:

- Desktop viewport shows visual exposure sections without text overlap.
- Mobile viewport shows 2-column compact cards or equivalent responsive layout without horizontal page overflow.
- Clicking a visual card opens the same job detail/selection behavior as existing cards.
- Chat button routes to the same chat entry path as before.

- [ ] **Step 3: Browser smoke employer create/edit preview**

Use `owner@bambi.dev` / `Bambi1234!`.

Verify:

```text
http://localhost:23001/employer/new
http://localhost:23001/employer/jobs/[seeded-id]/edit
```

Expected:

- Listing preview renders without blocking form input.
- Cover image preview updates when a cover image is selected.
- Existing edit cover image appears when available.

- [ ] **Step 4: Record verification notes**

Append exact command and browser results under this plan:

```md
## Verification Notes

- 2026-06-29 implementation verification:
  - `pnpm vitest run apps/web/src/lib/bambi/visual-job-exposure.test.ts` passed.
  - `pnpm run check-types` passed.
  - `pnpm run check` passed.
  - `pnpm --filter web build` passed.
  - Browser smoke passed for `/`, `/seeker`, `/employer/new`, and `/employer/jobs/[id]/edit`.
```

- [ ] **Step 5: Update roadmap status after implementation**

After implementation and verification, update:

- `docs/result.md`: mark Visual Job Exposure UI/UX as completed.
- `docs/superpowers/plans/2026-06-23-bambi-post-mvp-roadmap.md`: mark this UI/UX improvement as completed if it is listed as active.

- [ ] **Step 6: Commit**

Commit with Korean Conventional Commit format:

```bash
git add apps/web/src/lib/bambi/visual-job-exposure.ts \
	apps/web/src/lib/bambi/visual-job-exposure.test.ts \
	apps/web/src/components/bambi/visual-job-card.tsx \
	apps/web/src/components/bambi/dense-job-row.tsx \
	apps/web/src/components/bambi/visual-job-exposure-sections.tsx \
	apps/web/src/components/bambi/employer-listing-preview.tsx \
	apps/web/src/components/bambi/marketplace.tsx \
	apps/web/src/components/bambi/screens/seeker-marketplace.tsx \
	apps/web/src/components/bambi/screens/public-marketplace.tsx \
	apps/web/src/app/employer/new/page.tsx \
	apps/web/src/app/employer/jobs/[id]/edit/page.tsx \
	docs/result.md \
	docs/superpowers/plans/2026-06-23-bambi-post-mvp-roadmap.md \
	docs/superpowers/plans/2026-06-29-bambi-visual-job-exposure-uiux.md
git commit -m "feat: 채용정보 시각 노출 UI 개선" \
	-m "- 프로모션 공고를 스페셜/급구/추천 섹션으로 재구성" \
	-m "- 구직자 탐색과 공개 홈에 compact 채용 카드 노출 추가" \
	-m "- 구인자 공고 작성 화면에 목록 노출 미리보기 추가"
```

## Self-Review Notes

- Spec coverage: Queenalba의 광고형 채용 노출, Bambi 톤 유지, 기존 promotion 데이터 재사용, Native 제외, employer preview를 모두 task로 연결했다.
- Completeness scan: 계획 안의 모든 구현 단계는 파일, 명령, 기대 결과를 함께 제시한다.
- Type consistency: `VisualJobExposureSections`, `VisualJobCard`, `DenseJobRow`, `EmployerListingPreview` 이름을 spec과 plan에서 동일하게 사용한다.

## Progress Notes

- 2026-06-30 Task 1 completed:
  - Added `apps/web/src/lib/bambi/visual-job-exposure.test.ts`.
  - Verified RED with `pnpm vitest run apps/web/src/lib/bambi/visual-job-exposure.test.ts`; it failed because `./visual-job-exposure` did not exist.
  - Added `apps/web/src/lib/bambi/visual-job-exposure.ts`.
  - Verified GREEN with `pnpm vitest run apps/web/src/lib/bambi/visual-job-exposure.test.ts`; 1 file and 3 tests passed.
  - Fixed a TypeScript duplicate `id` assignment warning in the test helper.
  - Post-task verification passed: `pnpm vitest run apps/web/src/lib/bambi/visual-job-exposure.test.ts`, `pnpm run check-types`, `pnpm run check`, and `git diff --check`.
- 2026-06-30 Task 2 completed:
  - Added `apps/web/src/components/bambi/visual-job-components.test.ts` and verified RED with missing component files.
  - Added `apps/web/src/components/bambi/visual-job-card.tsx`.
  - Added `apps/web/src/components/bambi/dense-job-row.tsx`.
  - Post-task verification passed: `pnpm vitest run apps/web/src/components/bambi/visual-job-components.test.ts apps/web/src/lib/bambi/visual-job-exposure.test.ts`, `pnpm run check-types`, `pnpm run check`, and `git diff --check`.

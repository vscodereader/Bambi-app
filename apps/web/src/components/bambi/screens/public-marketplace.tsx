"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job } from "@/lib/bambi/types";
import { BOTTOM_NAV_CONTENT_SPACER } from "../bottom-nav-shell";
import { JobSearchCommand } from "../job-search-command";
import {
	MarketplaceDiscoveryAxisChips,
	MarketplaceDiscoveryTabs,
	MarketplaceFilterSheet,
	MarketplaceFilterSidebar,
	MarketplaceSearch,
	useMarketplaceDiscovery,
} from "../marketplace";
import { MobileTabBar } from "../mobile-tab-bar";
import { ResponsiveAppShell } from "../responsive-shell";
import { VisualJobExposureSections } from "../visual-job-exposure-sections";

export function PublicMarketplaceScreen() {
	const router = useRouter();
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [filters, setFilters] = useState<MarketplaceFilters>(
		DEFAULT_MARKETPLACE_FILTERS
	);
	const {
		hasMore,
		isApiBacked,
		isError,
		isLoadingMore,
		jobs,
		loadMore,
		refetch,
		sections,
		totalCount,
	} = useMarketplaceJobs(filters);
	const { discoveryTabId, selectDiscoveryTab } = useMarketplaceDiscovery(
		filters,
		setFilters
	);
	// 수집 공고의 id는 job_post에 없다 — /seeker/jobs/[id]로 보내면 404가 뜬다.
	const openJob = (job: Job) =>
		router.push(
			(job.crawled
				? `/seeker/jobs/crawled/${job.id}`
				: `/seeker/jobs/${job.id}`) as Route
		);
	const headerSearch = (
		<JobSearchCommand onSelectJob={openJob} trigger="header" withHotkey />
	);
	return (
		<ResponsiveAppShell headerSlot={headerSearch} variant="public">
			<div
				className={cn(
					"mx-auto flex w-full gap-5 px-5 py-6 md:max-w-[80%] md:px-6 md:py-10",
					BOTTOM_NAV_CONTENT_SPACER
				)}
			>
				<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
				<section className="min-w-0 flex-1">
					<div className="mb-4 flex flex-col gap-3">
						<MarketplaceDiscoveryTabs
							onSelect={selectDiscoveryTab}
							value={discoveryTabId}
						/>
						<MarketplaceSearch
							filters={filters}
							onChange={setFilters}
							onOpenFilters={() => setFiltersOpen(true)}
							onSelectJob={openJob}
							searchFieldClassName="md:hidden"
						/>
						<MarketplaceDiscoveryAxisChips
							discoveryTabId={discoveryTabId}
							filters={filters}
							onChange={setFilters}
						/>
					</div>
					{isError ? (
						<Alert className="mb-4" variant="warning">
							<AlertDescription className="text-sm">
								서버 공고를 불러오지 못해 샘플 공고를 먼저 보여드려요.
								<Button
									className="ml-2 h-auto p-0 align-baseline font-extrabold text-amber-500 underline"
									onClick={refetch}
									variant="link"
								>
									다시 연결
								</Button>
							</AlertDescription>
						</Alert>
					) : null}
					<div className="mb-3 flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-lg">
							지금 확인할 수 있는 공고
						</h2>
						<span className="font-semibold text-muted-foreground text-sm">
							{totalCount}개{isApiBacked ? " · 실시간" : ""}
						</span>
					</div>
					<VisualJobExposureSections
						hasMore={hasMore}
						isLoadingMore={isLoadingMore}
						jobs={jobs}
						onLoadMore={loadMore}
						onOpen={openJob}
						sections={sections}
					/>
				</section>
			</div>
			<MarketplaceFilterSheet
				filters={filters}
				onChange={setFilters}
				onOpenChange={setFiltersOpen}
				open={filtersOpen}
			/>
			<MobileTabBar homeHref="/" />
		</ResponsiveAppShell>
	);
}

"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job } from "@/lib/bambi/types";
import { Search2 } from "../icons";
import {
	MarketplaceFilterSidebar,
	MarketplaceSearch,
	SelectedJobPanel,
} from "../marketplace";
import { ResponsiveAppShell } from "../responsive-shell";
import { VisualJobExposureSections } from "../visual-job-exposure-sections";

export function PublicMarketplaceScreen() {
	const router = useRouter();
	const [filters, setFilters] = useState<MarketplaceFilters>(
		DEFAULT_MARKETPLACE_FILTERS
	);
	const { isApiBacked, isError, jobs, refetch, sections } =
		useMarketplaceJobs(filters);
	const selectedJob = jobs[0];
	const openJob = (job: Job) => router.push(`/seeker/jobs/${job.id}` as Route);
	const startChat = (job: Job) =>
		router.push(`/seeker/jobs/${job.id}/chat?entry=public` as Route);
	const headerSearch = (
		<label className="flex h-10 w-64 items-center gap-2 rounded-lg bg-secondary px-3">
			<span className="inline-flex size-4 text-[color:var(--text-subtle)]">
				<Search2 />
			</span>
			<input
				aria-label="업종, 지역, 공고 제목 검색"
				className="min-w-0 flex-1 border-none bg-transparent font-medium text-foreground text-sm outline-none"
				onChange={(event) =>
					setFilters({ ...filters, query: event.target.value })
				}
				placeholder="검색"
				value={filters.query}
			/>
		</label>
	);
	return (
		<ResponsiveAppShell headerSlot={headerSearch} variant="public">
			<div className="mx-auto flex w-full max-w-[80%] gap-5 px-4 py-6 pb-16 md:px-6 md:py-10">
				<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
				<section className="min-w-0 flex-1">
					<div className="mb-4">
						<MarketplaceSearch
							filters={filters}
							onChange={setFilters}
							searchFieldClassName="md:hidden"
						/>
					</div>
					{isError ? (
						<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
							서버 공고를 불러오지 못해 샘플 공고를 먼저 보여드려요.
							<button
								className="ml-2 cursor-pointer border-none bg-transparent p-0 font-extrabold text-amber-900 underline"
								onClick={refetch}
								type="button"
							>
								다시 연결
							</button>
						</div>
					) : null}
					<div className="mb-3 flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-lg">
							지금 확인할 수 있는 공고
						</h2>
						<span className="font-semibold text-muted-foreground text-sm">
							{jobs.length}개{isApiBacked ? " · 실시간" : ""}
						</span>
					</div>
					<VisualJobExposureSections
						jobs={jobs}
						onChat={startChat}
						onOpen={openJob}
						sections={sections}
					/>
				</section>
				<SelectedJobPanel
					job={selectedJob}
					onChat={startChat}
					onOpen={openJob}
				/>
			</div>
		</ResponsiveAppShell>
	);
}

"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import { JOBS } from "@/lib/bambi/data";
import { getSelectedMarketplaceJob } from "@/lib/bambi/marketplace";
import type { Job } from "@/lib/bambi/types";
import {
	MarketplaceFilterSidebar,
	MarketplaceRegionChips,
	MarketplaceSearch,
	SelectedJobPanel,
} from "../marketplace";
import { useSeekerFilters } from "../seeker-app-shell";
import { VisualJobExposureSections } from "../visual-job-exposure-sections";

const discoveryTabs = [
	{ id: "all", label: "전체", disabled: false },
	{ id: "region", label: "지역별", disabled: false },
	{ id: "category", label: "업종별", disabled: false },
	{ id: "map", label: "지도", disabled: true },
	{ id: "recent", label: "오늘 본 공고", disabled: true },
] as const;

type DiscoveryTabId = (typeof discoveryTabs)[number]["id"];

export function SeekerMarketplaceScreen() {
	const router = useRouter();
	const [discoveryTabId, setDiscoveryTabId] = useState<DiscoveryTabId>("all");
	// 필터는 헤더 검색창과 공유하기 위해 SeekerAppShell 컨텍스트에서 가져온다
	const { filters, setFilters } = useSeekerFilters();
	const [selectedJobId, setSelectedJobId] = useState(JOBS[0]?.id);
	const { isApiBacked, isError, jobs, refetch, sections } =
		useMarketplaceJobs(filters);
	const selectedJob = getSelectedMarketplaceJob(jobs, selectedJobId);

	const openJob = (job: Job) => {
		setSelectedJobId(job.id);
		if (window.matchMedia("(max-width: 1023px)").matches) {
			router.push(`/seeker/jobs/${job.id}` as Route);
		}
	};

	const chatJob = (job: Job) => {
		router.push(`/seeker/jobs/${job.id}/chat` as Route);
	};

	return (
		<div className="mx-auto flex w-full gap-5 px-5 py-5 pb-24 md:max-w-[80%] md:px-6 md:py-10">
			<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
			<section className="min-w-0 flex-1">
				<div className="mb-5 flex flex-col gap-4">
					<div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
						{discoveryTabs.map((tab) => (
							<button
								aria-pressed={discoveryTabId === tab.id}
								className={
									discoveryTabId === tab.id
										? "h-9 shrink-0 rounded-lg bg-foreground px-3 font-bold text-background text-sm disabled:opacity-50"
										: "h-9 shrink-0 rounded-lg border border-border bg-card px-3 font-bold text-muted-foreground text-sm disabled:opacity-50"
								}
								disabled={tab.disabled}
								key={tab.id}
								onClick={() => setDiscoveryTabId(tab.id)}
								type="button"
							>
								{tab.label}
							</button>
						))}
					</div>
					<MarketplaceSearch
						filters={filters}
						onChange={setFilters}
						searchFieldClassName="md:hidden"
					/>
					<MarketplaceRegionChips filters={filters} onChange={setFilters} />
				</div>
				{isError ? (
					<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
						실제 공고 API를 불러오지 못해 샘플 공고를 표시하고 있어요.
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
					<h2 className="m-0 font-extrabold text-lg">추천 공고</h2>
					<span className="font-semibold text-muted-foreground text-sm">
						{jobs.length}개{isApiBacked ? " · 실시간" : ""}
					</span>
				</div>
				<VisualJobExposureSections
					jobs={jobs}
					onChat={chatJob}
					onOpen={openJob}
					sections={sections}
					selectedJobId={selectedJob?.id}
				/>
			</section>
			<SelectedJobPanel job={selectedJob} onChat={chatJob} onOpen={openJob} />
		</div>
	);
}

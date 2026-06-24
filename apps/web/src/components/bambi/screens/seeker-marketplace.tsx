"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import { JOBS } from "@/lib/bambi/data";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	getSelectedMarketplaceJob,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job } from "@/lib/bambi/types";
import { Badge } from "../ds";
import { ShieldIcon } from "../icons";
import {
	JobList,
	MarketplaceFilterSidebar,
	MarketplaceSearch,
	SelectedJobPanel,
} from "../marketplace";

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
	const [filters, setFilters] = useState<MarketplaceFilters>(
		DEFAULT_MARKETPLACE_FILTERS
	);
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
		<div className="mx-auto flex w-full max-w-[1180px] gap-5 px-4 py-5 pb-24 md:px-6 md:py-7 lg:pb-8">
			<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
			<section className="min-w-0 flex-1">
				<div className="mb-5 flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Badge className="w-fit" tone="success">
							<span className="inline-flex size-3.5">
								<ShieldIcon />
							</span>
							익명 보호 중
						</Badge>
						<h1 className="m-0 font-extrabold text-2xl leading-tight md:text-[30px]">
							조건에 맞는 안전한 자리를 찾아요
						</h1>
						<p className="m-0 max-w-[640px] text-muted-foreground text-sm leading-relaxed md:text-base">
							검수된 공고를 먼저 보고, 면접 확정 전까지 연락처는 비공개로
							보호돼요.
						</p>
					</div>
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
					<MarketplaceSearch filters={filters} onChange={setFilters} />
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
				<JobList
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

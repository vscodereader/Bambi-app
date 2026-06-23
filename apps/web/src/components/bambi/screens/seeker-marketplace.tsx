"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { JOBS } from "@/lib/bambi/data";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	filterMarketplaceJobs,
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

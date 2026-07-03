"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import type { Job } from "@/lib/bambi/types";
import { useBambiAuth } from "../auth-client-provider";
import {
	MarketplaceDiscoveryAxisChips,
	MarketplaceDiscoveryTabs,
	MarketplaceFilterSheet,
	MarketplaceFilterSidebar,
	MarketplaceSearch,
	useMarketplaceDiscovery,
} from "../marketplace";
import { useSeekerFilters } from "../seeker-app-shell";
import { VisualJobExposureSections } from "../visual-job-exposure-sections";

export function SeekerMarketplaceScreen() {
	const router = useRouter();
	const { isGuest } = useBambiAuth();
	const [filtersOpen, setFiltersOpen] = useState(false);
	// 필터는 헤더 검색창과 공유하기 위해 SeekerAppShell 컨텍스트에서 가져온다
	const { filters, setFilters } = useSeekerFilters();
	const { isApiBacked, isError, jobs, refetch, sections } =
		useMarketplaceJobs(filters);
	const { discoveryTabId, selectDiscoveryTab } = useMarketplaceDiscovery(
		filters,
		setFilters
	);

	// 카드를 누르면 우측 드로어 미리보기 없이 상세 페이지로 바로 이동한다.
	// 게스트는 상세 대신 가입 유도 화면으로 보낸다.
	const openJob = (job: Job) => {
		if (isGuest) {
			router.push("/welcome?signup");
			return;
		}
		router.push(`/seeker/jobs/${job.id}` as Route);
	};

	const chatJob = (job: Job) => {
		router.push(`/seeker/jobs/${job.id}/chat` as Route);
	};

	return (
		<div className="mx-auto flex w-full gap-5 px-5 py-5 pb-24 md:max-w-[80%] md:px-6 md:py-10">
			<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
			<section className="min-w-0 flex-1">
				<div className="mb-5 flex flex-col gap-4">
					<MarketplaceDiscoveryTabs
						onSelect={selectDiscoveryTab}
						value={discoveryTabId}
					/>
					<MarketplaceSearch
						filters={filters}
						onChange={setFilters}
						onOpenFilters={() => setFiltersOpen(true)}
						searchFieldClassName="md:hidden"
					/>
					<MarketplaceDiscoveryAxisChips
						discoveryTabId={discoveryTabId}
						filters={filters}
						onChange={setFilters}
					/>
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
				/>
			</section>
			<MarketplaceFilterSheet
				filters={filters}
				onChange={setFilters}
				onOpenChange={setFiltersOpen}
				open={filtersOpen}
			/>
		</div>
	);
}

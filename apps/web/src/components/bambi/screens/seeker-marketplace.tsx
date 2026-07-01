"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import {
	applyDiscoveryAxis,
	discoveryAxisForTab,
} from "@/lib/bambi/marketplace";
import type { Job } from "@/lib/bambi/types";
import {
	MarketplaceAxisChips,
	MarketplaceFilterSidebar,
	MarketplaceSearch,
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
	const { isApiBacked, isError, jobs, refetch, sections } =
		useMarketplaceJobs(filters);

	// 카드를 누르면 우측 드로어 미리보기 없이 상세 페이지로 바로 이동한다.
	const openJob = (job: Job) => {
		router.push(`/seeker/jobs/${job.id}` as Route);
	};

	const chatJob = (job: Job) => {
		router.push(`/seeker/jobs/${job.id}/chat` as Route);
	};

	// 탭 전환 시 비활성 축을 리셋해(축 배타성) 화면 칩과 결과를 일치시킨다.
	const selectDiscoveryTab = (tabId: DiscoveryTabId) => {
		setDiscoveryTabId(tabId);
		setFilters(applyDiscoveryAxis(filters, discoveryAxisForTab(tabId)));
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
								onClick={() => selectDiscoveryTab(tab.id)}
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
					{discoveryTabId === "region" ? (
						<MarketplaceAxisChips
							axis="region"
							filters={filters}
							onChange={setFilters}
						/>
					) : null}
					{discoveryTabId === "category" ? (
						<MarketplaceAxisChips
							axis="category"
							filters={filters}
							onChange={setFilters}
						/>
					) : null}
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
		</div>
	);
}

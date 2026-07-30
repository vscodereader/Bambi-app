"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdBannerJobs, useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import type { Job } from "@/lib/bambi/types";
import { AdBannerRail, HorizontalAdBannerRail } from "../ad-banner";
import { useBambiAuth } from "../auth-client-provider";
import { Card } from "../ds";
import { HomeCommunitySection } from "../home-community-section";
import { Search2 } from "../icons";
import {
	MarketplaceDiscoveryAxisChips,
	MarketplaceDiscoveryTabs,
	MarketplaceFilterControls,
	MarketplaceFilterSheet,
	MarketplaceSearch,
	useMarketplaceDiscovery,
} from "../marketplace";
import { PremiumAdBannerSection } from "../premium-ad-banner-section";
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
	const adBanners = useAdBannerJobs();
	const { discoveryTabId, selectDiscoveryTab } = useMarketplaceDiscovery(
		filters,
		setFilters
	);

	// 카드를 누르면 우측 드로어 미리보기 없이 상세 페이지로 바로 이동한다.
	// 게스트는 상세 대신 가입 유도 화면으로 보낸다.
	const openJob = (job: Job) => {
		if (isGuest) {
			router.push("/seeker?auth=signup");
			return;
		}
		// 수집 공고의 id는 job_post에 없다 — /seeker/jobs/[id]로 보내면 404가 뜬다.
		if (job.crawled) {
			router.push(`/seeker/jobs/crawled/${job.id}` as Route);
			return;
		}
		router.push(`/seeker/jobs/${job.id}` as Route);
	};

	return (
		<>
			{/* 3컬럼: 좌 여백(필터+배너) · 중앙 고정폭 콘텐츠 · 우 여백(배너).
			    콘텐츠를 justify-center로 중앙에 두어 헤더(동일 고정폭)와 정렬한다.
			    좌우 여백 컬럼은 매우 넓은 화면에서만 노출한다. */}
			<div className="mx-auto flex w-full justify-center gap-5 py-5 pb-24 md:py-10">
				<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
					<div className="sticky top-20 flex flex-col gap-4">
						{/* 배너 rail을 "빠른 탐색" 카드 위에 둔다. 빈 슬롯은 rail이 자체
						    "광고 모집중" 자리표시로 채우므로 조건 없이 항상 렌더한다. */}
						<HorizontalAdBannerRail
							isLoading={adBanners.isLoading}
							items={adBanners.leftBanner}
						/>
						<Card className="rounded-lg" pad="lg" tone="outline">
							<div className="mb-4 flex items-center gap-2">
								<span className="inline-flex size-5 text-coral-600">
									<Search2 />
								</span>
								<h2 className="m-0 font-extrabold text-base">빠른 탐색</h2>
							</div>
							<MarketplaceFilterControls
								filters={filters}
								onChange={setFilters}
							/>
						</Card>
					</div>
				</aside>
				<div
					className={cn("w-full min-w-0 px-5 md:px-6", SEEKER_CONTENT_WIDTH)}
				>
					<PremiumAdBannerSection
						className="mb-6"
						isLoading={adBanners.isLoading}
						items={adBanners.premiumBanner}
					/>
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
						communitySlot={<HomeCommunitySection />}
						jobs={jobs}
						onOpen={openJob}
						sections={sections}
					/>
				</div>
				<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
					{/* 빈 슬롯은 rail이 "광고 모집중" 자리표시로 채우므로 조건 없이 렌더한다. */}
					<div className="sticky top-20">
						<AdBannerRail
							isLoading={adBanners.isLoading}
							items={adBanners.rightBanner}
						/>
					</div>
				</aside>
			</div>
			<MarketplaceFilterSheet
				filters={filters}
				onChange={setFilters}
				onOpenChange={setFiltersOpen}
				open={filtersOpen}
			/>
		</>
	);
}

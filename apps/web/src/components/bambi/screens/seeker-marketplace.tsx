"use client";

import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@bambi-app/ui/components/sheet";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useAdBannerJobs, useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import {
	trackLoadMore,
	trackMarketplaceFilterChanges,
} from "@/lib/bambi/ga-interaction";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job } from "@/lib/bambi/types";
import { AdBannerRail, HorizontalAdBannerRail } from "../ad-banner";
import { useBambiAuth } from "../auth-client-provider";
import { Card } from "../ds";
import { HomeCommunitySection } from "../home-community-section";
import { Filter, Search2 } from "../icons";
import { countActiveFilters, MarketplaceFilterControls } from "../marketplace";
import { PremiumAdBannerSection } from "../premium-ad-banner-section";
import { useSeekerFilters } from "../seeker-app-shell";
import { VisualJobExposureSections } from "../visual-job-exposure-sections";

// 1720px 미만에서는 사이드바 필터(aside)가 사라지므로 목록 상단에 필터 트리거를 둔다.
// 데스크톱 사이드바와 같은 MarketplaceFilterControls를 시트로 그대로 재사용한다(필터는 라이브
// 반영 — 별도 "적용" 없이 SheetClose로 닫기만 한다). 활성 필터 수는 트리거에 배지로 표기한다.
function MarketplaceFilterSheet({
	filters,
	onChange,
}: {
	filters: MarketplaceFilters;
	onChange: (next: MarketplaceFilters) => void;
}) {
	const activeCount = countActiveFilters(filters);
	return (
		<Sheet>
			<SheetTrigger className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 font-bold text-muted-foreground text-sm min-[1720px]:hidden">
				<span className="inline-flex size-4 text-coral-600">
					<Filter />
				</span>
				필터
				{activeCount > 0 ? (
					<span className="inline-flex min-w-5 items-center justify-center rounded-full bg-coral-500 px-1.5 font-extrabold text-white text-xs">
						{activeCount}
					</span>
				) : null}
			</SheetTrigger>
			<SheetContent className="gap-0">
				<SheetTitle className="mb-4">필터</SheetTitle>
				<MarketplaceFilterControls
					filters={filters}
					onChange={onChange}
					showReset
				/>
				<SheetClose className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-coral-500 font-bold text-sm text-white transition-colors hover:bg-coral-600">
					완료
				</SheetClose>
			</SheetContent>
		</Sheet>
	);
}

export function SeekerMarketplaceScreen() {
	const router = useRouter();
	const { isGuest } = useBambiAuth();
	// 필터는 헤더 검색창과 공유하기 위해 SeekerAppShell 컨텍스트에서 가져온다
	const { filters, setFilters } = useSeekerFilters();
	const {
		hasMore,
		isApiBacked,
		isError,
		isLoading,
		isLoadingMore,
		jobs,
		loadMore,
		refetch,
		sections,
		totalCount,
	} = useMarketplaceJobs(filters);
	const adBanners = useAdBannerJobs();
	const handleFiltersChange = useCallback(
		(next: MarketplaceFilters) => {
			trackMarketplaceFilterChanges(filters, next);
			setFilters(next);
		},
		[filters, setFilters]
	);
	const handleLoadMore = () => {
		trackLoadMore(sections.organic.length);
		loadMore();
	};

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

	// 3컬럼: 좌 여백(필터+배너) · 중앙 고정폭 콘텐츠 · 우 여백(배너).
	// 콘텐츠를 justify-center로 중앙에 두어 헤더(동일 고정폭)와 정렬한다.
	// 좌우 여백 컬럼은 매우 넓은 화면에서만 노출한다.
	// 모바일 하단 여백은 셸(SeekerNav)의 BOTTOM_NAV_CONTENT_SPACER가 이미 넣으므로
	// 여기서 pb-24를 겹쳐 주지 않는다 — 겹치면 목록 끝 아래에 ~170px 빈 공간이 생겼다.
	return (
		<div className="mx-auto flex w-full justify-center gap-5 py-5 md:py-10">
			{/* 페이지 h1: 시각적으로 숨기지만 스크린리더·문서 개요에 최상위 제목을 준다.
			    이 아래 가장 상위 제목은 "빠른 탐색" h2였다(h1 부재). */}
			<h1 className="sr-only">밤비알바 채용정보</h1>
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20 flex flex-col gap-4">
					{/* 배너 rail을 "빠른 탐색" 카드 위에 둔다. 빈 슬롯은 rail이 자체
					    "광고 모집중" 자리표시로 채우므로 조건 없이 항상 렌더한다. */}
					<HorizontalAdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.leftBanner}
						promotionSurface="seeker_left"
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
							onChange={handleFiltersChange}
							showReset
						/>
					</Card>
				</div>
			</aside>
			<div className={cn("w-full min-w-0 px-5 md:px-6", SEEKER_CONTENT_WIDTH)}>
				<PremiumAdBannerSection
					className="mb-6"
					isLoading={adBanners.isLoading}
					items={adBanners.premiumBanner}
					promotionSurface="seeker_center"
				/>
				{isError ? (
					<div
						className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm"
						role="status"
					>
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
				<div className="mb-3 flex items-center justify-between gap-3">
					<h2 className="m-0 font-extrabold text-lg">추천 공고</h2>
					<div className="flex items-center gap-2">
						<span className="font-semibold text-muted-foreground text-sm">
							{totalCount}개{isApiBacked ? " · 실시간" : ""}
						</span>
						<MarketplaceFilterSheet
							filters={filters}
							onChange={handleFiltersChange}
						/>
					</div>
				</div>
				<VisualJobExposureSections
					communitySlot={<HomeCommunitySection />}
					hasMore={hasMore}
					isLoading={isLoading}
					isLoadingMore={isLoadingMore}
					jobs={jobs}
					onLoadMore={handleLoadMore}
					onOpen={openJob}
					onResetFilters={
						countActiveFilters(filters) > 0
							? () => handleFiltersChange(DEFAULT_MARKETPLACE_FILTERS)
							: undefined
					}
					sections={sections}
					trackAnalytics
				/>
			</div>
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				{/* 빈 슬롯은 rail이 "광고 모집중" 자리표시로 채우므로 조건 없이 렌더한다. */}
				<div className="sticky top-20">
					<AdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.rightBanner}
						promotionSurface="seeker_right"
					/>
				</div>
			</aside>
		</div>
	);
}

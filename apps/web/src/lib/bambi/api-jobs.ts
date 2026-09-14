"use client";

import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	filterMarketplaceJobs,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job, MarketplaceJobSections } from "@/lib/bambi/types";
import { isIndustryOption } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";
import {
	type AdBannerItem,
	toAdBannerItem,
	toMarketplaceJob,
} from "./api-job-mapper";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 로컬 포트폴리오 촬영은 화면 구조를 유지하고 표시 콘텐츠만 일반 아르바이트 예시로 바꾼다.
const PORTFOLIO_PREVIEW = process.env.NODE_ENV === "development";
const PORTFOLIO_LISTINGS = [
	[
		"카페 평일 오픈",
		"로컬커피 정자점",
		"경기 · 성남시 분당구",
		"시급 12,000원",
		"평일 08:00–13:00",
		"https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"주말 바리스타",
		"오후커피 강남점",
		"서울 · 강남구",
		"시급 13,000원",
		"토·일 12:00–18:00",
		"https://images.unsplash.com/photo-1560463230-1d6803589edf?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"의류매장 판매",
		"데일리웨어 수원점",
		"경기 · 수원시 영통구",
		"시급 12,500원",
		"주 3일 13:00–20:00",
		"https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"매장 진열 보조",
		"라이프숍 잠실점",
		"서울 · 송파구",
		"시급 12,000원",
		"월·수·금 10:00–16:00",
		"https://images.unsplash.com/photo-1721152531778-47bb07d618bc?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"카페 마감 스태프",
		"브루잉룸 성수점",
		"서울 · 성동구",
		"시급 12,500원",
		"화–토 17:00–22:00",
		"https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"주말 매장 관리",
		"클로젯 판교점",
		"경기 · 성남시 분당구",
		"시급 13,000원",
		"토·일 11:00–19:00",
		"https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"베이커리 포장",
		"모닝브레드 서현점",
		"경기 · 성남시 분당구",
		"시급 12,000원",
		"주 4일 09:00–14:00",
		"https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"팝업스토어 운영",
		"스튜디오샵 홍대점",
		"서울 · 마포구",
		"일급 110,000원",
		"10:00–19:00",
		"https://images.unsplash.com/photo-1443884590026-2e4d21aee71c?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"평일 음료 제조",
		"커피가든 역삼점",
		"서울 · 강남구",
		"시급 12,000원",
		"월–금 11:00–16:00",
		"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"매장 재고 정리",
		"오브젝트룸 광교점",
		"경기 · 수원시 영통구",
		"시급 12,500원",
		"주 3일 09:00–15:00",
		"https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"카페 홀 스태프",
		"테라스커피 송도점",
		"인천 · 연수구",
		"시급 12,000원",
		"토·일 10:00–17:00",
		"https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1000&q=85",
	],
	[
		"주말 판매 스태프",
		"에브리웨어 신촌점",
		"서울 · 서대문구",
		"시급 13,000원",
		"토·일 13:00–20:00",
		"https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=1000&q=85",
	],
] as const;

const withPortfolioContent = (job: Job, index: number): Job => {
	if (!PORTFOLIO_PREVIEW) {
		return job;
	}
	const item = PORTFOLIO_LISTINGS[index % PORTFOLIO_LISTINGS.length];
	if (!item) {
		return job;
	}
	const [title, company, location, pay, hours, imageUrl] = item;
	const [region = "", district = ""] = location.split(" · ");
	return {
		...job,
		company,
		coverImage: {
			altText: `${company} 매장 이미지`,
			byteSize: 0,
			fileName: "portfolio-photo.jpg",
			mimeType: "image/jpeg",
			storageKey: `portfolio/${index}`,
			url: imageUrl,
			usage: "cover",
		},
		desc: `${company}에서 함께 근무할 ${title}를 모집합니다. 근무 일정은 협의할 수 있습니다.`,
		district,
		hours,
		location,
		pay,
		region,
		tags: [region, district, "초보 가능"],
		title,
		type: index % 3 === 2 ? "기타" : "다방",
	};
};

// 데스크톱 4열 × 12줄을 한 페이지로 삼는다. 첫 조회와 더보기를 같은 크기로 유지해야
// 사용자가 누를 때마다 예측 가능한 12줄씩 이어지고 커서 소비량도 화면 계약과 일치한다.
export const MARKETPLACE_PAGE_SIZE = 48;

// 전체 공고(organic) 이어받기 커서. 자체 공고 블록과 수집 블록이 순서대로 이어붙는 구조라
// 위치가 블록별로 둘이다(서버 nextOrganicOffset을 그대로 되돌려준다).
interface OrganicOffset {
	crawled: number;
	jobPost: number;
}

interface UseMarketplaceJobsResult {
	hasMore: boolean;
	isApiBacked: boolean;
	isError: boolean;
	isLoading: boolean;
	isLoadingMore: boolean;
	jobs: Job[];
	loadMore: () => void;
	refetch: () => void;
	sections: MarketplaceJobSections;
	// 필터를 만족하는 전체 공고 수(로드된 수가 아니다). 헤더의 "N개" 표기용.
	totalCount: number;
}

interface UseMarketplaceJobResult {
	isApiBacked: boolean;
	isError: boolean;
	isLoading: boolean;
	job?: Job;
	refetch: () => void;
}

export const isApiJobId = (id: string): boolean => UUID_RE.test(id);

const toApiListInput = (filters: MarketplaceFilters) => ({
	// 서버 입력이 업종 enum이라 기본값("전체")이나 목록 밖 값은 필터 없음으로 보낸다.
	industryCategory:
		filters.category !== DEFAULT_MARKETPLACE_FILTERS.category &&
		isIndustryOption(filters.category)
			? filters.category
			: undefined,
	districtCode:
		filters.districtCode === DEFAULT_MARKETPLACE_FILTERS.districtCode
			? undefined
			: filters.districtCode,
	minPayAmount: filters.minimumPay > 0 ? filters.minimumPay : undefined,
	regionCode:
		filters.regionCode === DEFAULT_MARKETPLACE_FILTERS.regionCode
			? undefined
			: filters.regionCode,
});

// 서버 입력에 대응이 없어 화면에서만 거르는 필터들. 이게 켜져 있으면 응답의 전체 건수와
// 실제로 보이는 개수가 갈리므로, 헤더 표기를 전체 건수 대신 화면 개수로 떨어뜨린다.
const hasLocalOnlyFilters = (filters: MarketplaceFilters): boolean =>
	filters.onlyBeginnerFriendly || filters.onlyToday || filters.onlyVerified;

const EMPTY_SECTIONS: MarketplaceJobSections = {
	organic: [],
	recommended: [],
	special: [],
	urgent: [],
};

// urgent는 special/recommended의 부분집합이라 그대로 이으면 같은 공고가 2번 들어가
// 개수 카운트가 부풀 수 있다. id 기준으로 첫 등장만 남겨 중복을 제거한다
// (등장 순서 유지: special→urgent→recommended→organic).
const flattenSections = (sections: MarketplaceJobSections): Job[] => {
	const seen = new Set<string>();
	const merged = [
		...sections.special,
		...sections.urgent,
		...sections.recommended,
		...sections.organic,
	];
	return merged.filter((job) => {
		if (seen.has(job.id)) {
			return false;
		}
		seen.add(job.id);
		return true;
	});
};

const filterSections = (
	sections: MarketplaceJobSections,
	filters: MarketplaceFilters
): MarketplaceJobSections => ({
	organic: filterMarketplaceJobs(sections.organic, filters),
	recommended: filterMarketplaceJobs(sections.recommended, filters),
	special: filterMarketplaceJobs(sections.special, filters),
	urgent: filterMarketplaceJobs(sections.urgent, filters),
});

// 전체 공고는 "더보기"로 이어 받고(offset 누적), 스페셜·급구·추천 섹션은 첫 페이지 응답으로
// 고정한다 — 2페이지부터는 서버도 섹션을 다시 계산하지 않는다.
export function useMarketplaceJobs(
	filters: MarketplaceFilters
): UseMarketplaceJobsResult {
	const jobsQuery = useInfiniteQuery(
		orpc.bambi.jobs.list.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextOrganicOffset ?? undefined,
			initialPageParam: null as null | OrganicOffset,
			input: (organicOffset: null | OrganicOffset) => ({
				...toApiListInput(filters),
				limit: MARKETPLACE_PAGE_SIZE,
				organicOffset: organicOffset ?? undefined,
			}),
		})
	);
	const pages = jobsQuery.data?.pages ?? [];
	const [firstPage] = pages;
	// 페이지 사이 중복을 방어적으로 제거하되 서버는 각 페이지를 48개 정원으로 반환한다.
	const organicRows = [
		...new Map(
			pages
				.flatMap((page) => page.sections.organic)
				.map((item) => [item.id, item] as const)
		).values(),
	];
	const mappedOrganic = organicRows
		.map(toMarketplaceJob)
		.map(withPortfolioContent);
	const mappedRecommended =
		firstPage?.sections.recommended
			.map(toMarketplaceJob)
			.map(withPortfolioContent) ?? [];
	const mappedSpecial =
		firstPage?.sections.special
			.map(toMarketplaceJob)
			.map(withPortfolioContent) ?? [];
	const mappedUrgent =
		firstPage?.sections.urgent
			.map(toMarketplaceJob)
			.map(withPortfolioContent) ?? [];
	const sections = firstPage
		? filterSections(
				{
					organic: mappedOrganic,
					recommended:
						PORTFOLIO_PREVIEW && mappedRecommended.length === 0
							? mappedOrganic.slice(8, 12)
							: mappedRecommended,
					special:
						PORTFOLIO_PREVIEW && mappedSpecial.length === 0
							? mappedOrganic.slice(0, 12)
							: mappedSpecial,
					urgent:
						PORTFOLIO_PREVIEW && mappedUrgent.length === 0
							? mappedOrganic.slice(4, 8)
							: mappedUrgent,
				},
				filters
			)
		: EMPTY_SECTIONS;
	const jobs = flattenSections(sections);
	const hasApiJobs = jobs.length > 0;

	return {
		hasMore: jobsQuery.hasNextPage,
		isApiBacked: jobsQuery.isSuccess && hasApiJobs,
		isError: jobsQuery.isError,
		isLoading: jobsQuery.isLoading,
		isLoadingMore: jobsQuery.isFetchingNextPage,
		jobs,
		loadMore: () => {
			jobsQuery.fetchNextPage().catch(() => undefined);
		},
		refetch: () => {
			jobsQuery.refetch().catch(() => undefined);
		},
		sections,
		totalCount:
			hasLocalOnlyFilters(filters) || firstPage === undefined
				? jobs.length
				: firstPage.availableCount,
	};
}

// 검색 모달 전용. 빈 검색어는 조회하지 않고, 타이핑 사이 이전 결과를 유지해 깜빡임을 줄인다.
export function useJobSearch(query: string): {
	isError: boolean;
	isFetching: boolean;
	jobs: Job[];
	refetch: () => void;
} {
	const trimmed = query.trim();
	const searchQuery = useQuery({
		...orpc.bambi.jobs.search.queryOptions({ input: { query: trimmed } }),
		enabled: trimmed.length > 0,
		placeholderData: keepPreviousData,
	});

	return {
		isError: searchQuery.isError,
		isFetching: searchQuery.isFetching,
		jobs:
			trimmed.length > 0
				? (searchQuery.data?.items ?? []).map(toMarketplaceJob)
				: [],
		refetch: () => {
			searchQuery.refetch().catch(() => undefined);
		},
	};
}

export function useMarketplaceJob(id: string): UseMarketplaceJobResult {
	const canUseApi = isApiJobId(id);
	const jobQuery = useQuery({
		...orpc.bambi.jobs.getById.queryOptions({ input: { id } }),
		enabled: canUseApi,
	});
	const apiJob = jobQuery.data ? toMarketplaceJob(jobQuery.data) : undefined;

	return {
		isApiBacked: Boolean(apiJob),
		isError: jobQuery.isError,
		isLoading: canUseApi && jobQuery.isLoading,
		job: apiJob,
		refetch: () => {
			jobQuery.refetch().catch(() => undefined);
		},
	};
}

// 내가 차단한 상대가 올린 공고인지. 차단한 상대와는 채팅방이 서버에서 막히므로,
// 화면이 미리 채팅 CTA 대신 안내를 보여주는 데 쓴다.
// 비로그인·로딩 중·프로필 없음(listMine이 requireActiveBambiProfile이라 실패할 수 있다)·
// 조회 실패는 전부 "차단 아님"으로 본다 — 오탐으로 채팅을 막는 쪽이 더 나쁘고,
// 최종 판정은 어차피 서버가 한다.
export function useIsBlockedEmployer(employerUserId?: string): boolean {
	const session = authClient.useSession();
	const blocksQuery = useQuery({
		...orpc.bambi.blocks.listMine.queryOptions(),
		enabled: Boolean(employerUserId) && Boolean(session.data?.user),
		retry: false,
	});

	return Boolean(
		employerUserId &&
			blocksQuery.data?.some((block) => block.blockedUserId === employerUserId)
	);
}

// 수집 공고 상세. 우리 공고와 테이블·필드가 달라 목록 매퍼(toMarketplaceJob)를 거치지 않고
// 서버 응답을 그대로 화면에 넘긴다 — Job 모양으로 억지로 맞추면 없는 값(후기·검증)이 딸려온다.
export function useCrawledJob(id: string) {
	const canUseApi = isApiJobId(id);
	const jobQuery = useQuery({
		...orpc.bambi.crawledJobs.getById.queryOptions({ input: { id } }),
		enabled: canUseApi,
	});

	return {
		isError: jobQuery.isError,
		isLoading: canUseApi && jobQuery.isLoading,
		job: jobQuery.data,
		refetch: () => {
			jobQuery.refetch().catch(() => undefined);
		},
	};
}

export interface AdBannerJobGroups {
	// 로딩과 "광고 없음"을 구분 못 하면, 광고가 실제 있는 슬롯도 응답 대기 동안 빈 배열이
	// 되어 문의 배너가 번쩍였다가 광고로 바뀐다. 초기 로딩을 노출해 렌더러가 스켈레톤을 그린다.
	isLoading: boolean;
	// 각 그룹은 고정 길이(좌3·중3·우3) 배열이며 빈 칸은 null이다(렌더러가 자리표시로 채운다).
	leftBanner: (AdBannerItem | null)[];
	premiumBanner: (AdBannerItem | null)[];
	rightBanner: (AdBannerItem | null)[];
}

export function useAdBannerJobs(): AdBannerJobGroups {
	const bannersQuery = useQuery(orpc.bambi.jobs.listAdBanners.queryOptions());
	if (PORTFOLIO_PREVIEW && !bannersQuery.isLoading) {
		const items: AdBannerItem[] = PORTFOLIO_LISTINGS.slice(0, 9).map(
			(listing, index) => ({
				company: listing[1],
				crawled: false,
				href: "/seeker",
				id: `portfolio-banner-${index}`,
				imageUrl: listing[5],
				layout: null,
				title: listing[0],
			})
		);
		return {
			isLoading: false,
			leftBanner: items.slice(0, 3),
			premiumBanner: items.slice(3, 6),
			rightBanner: items.slice(6, 9),
		};
	}
	// 슬롯→배너 규격 매핑은 렌더러 비율과 한 몸이다: 좌측·상단 프리미엄은 가로형(7:3),
	// 우측 레일은 세로형(4:9). 슬롯마다 맞는 usage를 넘겨야 구인자가 올린 배너가 뜬다.
	// 빈 칸(null)은 그대로 null로 두고 렌더러가 자리표시로 채운다.
	return {
		// isLoading = 데이터 없는 첫 로딩(react-query v5). 로드 후 빈 배열("광고 없음")과 구분된다.
		isLoading: bannersQuery.isLoading,
		leftBanner: (bannersQuery.data?.leftBanner ?? []).map((job) =>
			job ? toAdBannerItem(job, "ad_horizontal") : null
		),
		premiumBanner: (bannersQuery.data?.premiumBanner ?? []).map((job) =>
			job ? toAdBannerItem(job, "ad_horizontal") : null
		),
		rightBanner: (bannersQuery.data?.rightBanner ?? []).map((job) =>
			job ? toAdBannerItem(job, "ad_vertical") : null
		),
	};
}

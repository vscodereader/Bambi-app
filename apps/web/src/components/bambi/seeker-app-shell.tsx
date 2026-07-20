"use client";

import { Input } from "@bambi-app/ui/components/input";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import { SEEKER_CONTENT_MAX_W } from "@/lib/bambi/layout";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import { Search2 } from "./icons";
import { ResponsiveAppShell } from "./responsive-shell";

interface SeekerFiltersContextValue {
	filters: MarketplaceFilters;
	setFilters: (filters: MarketplaceFilters) => void;
}

const SeekerFiltersContext = createContext<SeekerFiltersContextValue | null>(
	null
);

export function useSeekerFilters(): SeekerFiltersContextValue {
	const ctx = useContext(SeekerFiltersContext);
	if (!ctx) {
		throw new Error("useSeekerFilters must be used within SeekerAppShell");
	}
	return ctx;
}

function SeekerHeaderSearch() {
	const { filters, setFilters } = useSeekerFilters();
	return (
		// 헤더 행에서 줄어들 수 있는 건 내비뿐이라(min-w-0 + overflow-x-auto) 폭이 모자라면
		// 압축이 전부 내비로 몰려 마지막 항목 "고객센터"의 끝 글자가 잘렸다. 검색창이 가장
		// 큰 고정폭 소비처라 여기를 줄여 내비에 폭을 돌려준다("검색" 2글자 + 아이콘엔 충분).
		<div className="relative w-48">
			<span className="pointer-events-none absolute top-1/2 left-3 inline-flex size-4 -translate-y-1/2 text-muted-foreground">
				<Search2 />
			</span>
			<Input
				aria-label="업종, 지역, 공고 제목 검색"
				className="h-10 rounded-lg border-none bg-secondary pl-9 font-medium"
				onChange={(event) =>
					setFilters({ ...filters, query: event.target.value })
				}
				placeholder="검색"
				value={filters.query}
			/>
		</div>
	);
}

export function SeekerAppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [filters, setFilters] = useState<MarketplaceFilters>(
		DEFAULT_MARKETPLACE_FILTERS
	);
	// 검색창은 마켓플레이스(/seeker)에서만 헤더에 노출하고 채팅·내정보엔 두지 않는다
	const isMarketplace = pathname === "/seeker";
	return (
		<SeekerFiltersContext.Provider value={{ filters, setFilters }}>
			<ResponsiveAppShell
				// 모든 seeker 페이지(채용 목록·상세·채팅·수다방·내 정보) 헤더를
				// /seeker와 동일한 고정폭·여백으로 통일한다.
				contentWidthClassName={SEEKER_CONTENT_MAX_W}
				headerSlot={isMarketplace ? <SeekerHeaderSearch /> : undefined}
				variant="seeker"
			>
				{children}
			</ResponsiveAppShell>
		</SeekerFiltersContext.Provider>
	);
}

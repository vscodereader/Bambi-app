"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import { SEEKER_CONTENT_MAX_W } from "@/lib/bambi/layout";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import { useBambiAuth } from "./auth-client-provider";
import { JobSearchCommand } from "./job-search-command";
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
	const router = useRouter();
	const { isGuest } = useBambiAuth();

	return (
		<JobSearchCommand
			onSelectJob={(job) => {
				// 마켓플레이스 카드 클릭과 같은 규칙: 게스트는 가입 유도, 수집 공고는 수집 상세로.
				if (isGuest) {
					router.push("/seeker?auth=signup");
					return;
				}
				if (job.crawled) {
					router.push(`/seeker/jobs/crawled/${job.id}` as Route);
					return;
				}
				router.push(`/seeker/jobs/${job.id}` as Route);
			}}
			trigger="header"
			withHotkey
		/>
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

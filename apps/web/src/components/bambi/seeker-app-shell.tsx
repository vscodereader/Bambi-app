"use client";

import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
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
		<label className="flex h-10 w-64 items-center gap-2 rounded-lg bg-secondary px-3">
			<span className="inline-flex size-4 text-[color:var(--text-subtle)]">
				<Search2 />
			</span>
			<input
				aria-label="업종, 지역, 공고 제목 검색"
				className="min-w-0 flex-1 border-none bg-transparent font-medium text-foreground text-sm outline-none"
				onChange={(event) =>
					setFilters({ ...filters, query: event.target.value })
				}
				placeholder="검색"
				value={filters.query}
			/>
		</label>
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
				headerSlot={isMarketplace ? <SeekerHeaderSearch /> : undefined}
				variant="seeker"
			>
				{children}
			</ResponsiveAppShell>
		</SeekerFiltersContext.Provider>
	);
}

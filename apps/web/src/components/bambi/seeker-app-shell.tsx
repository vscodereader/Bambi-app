"use client";

import { Input } from "@bambi-app/ui/components/input";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import { Search2 } from "./icons";
import {
	DEFAULT_NAV_ITEMS,
	type NavItem,
	ResponsiveAppShell,
} from "./responsive-shell";

// 구직자 셸 전용 데스크톱 nav — 기본 항목 오른쪽(업체 인증 다음)에 수다방을 노출한다.
const SEEKER_NAV_ITEMS: NavItem[] = [
	...DEFAULT_NAV_ITEMS,
	{ href: "/seeker/community", label: "수다방" },
];

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
		<div className="relative w-64">
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
				headerSlot={isMarketplace ? <SeekerHeaderSearch /> : undefined}
				navItems={SEEKER_NAV_ITEMS}
				variant="seeker"
			>
				{children}
			</ResponsiveAppShell>
		</SeekerFiltersContext.Provider>
	);
}

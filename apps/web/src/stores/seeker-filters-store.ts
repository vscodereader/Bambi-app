import { createStore } from "zustand/vanilla";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";

export interface SeekerFiltersState {
	filters: MarketplaceFilters;
	setFilters: (filters: MarketplaceFilters) => void;
}

export type SeekerFiltersStore = ReturnType<typeof createSeekerFiltersStore>;

// Next.js는 요청 간 스토어 공유를 막아야 해서 모듈 전역 create() 대신
// 팩토리로 만들고, SeekerAppShell이 마운트당 하나 생성해 컨텍스트로 내린다.
export function createSeekerFiltersStore() {
	return createStore<SeekerFiltersState>()((set) => ({
		filters: DEFAULT_MARKETPLACE_FILTERS,
		setFilters: (filters) => set({ filters }),
	}));
}

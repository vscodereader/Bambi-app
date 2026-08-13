"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";
import { SEEKER_CONTENT_MAX_W } from "@/lib/bambi/layout";
import {
	createSeekerFiltersStore,
	type SeekerFiltersState,
	type SeekerFiltersStore,
} from "@/stores/seeker-filters-store";
import { useBambiAuth } from "./auth-client-provider";
import { JobSearchCommand } from "./job-search-command";
import { ResponsiveAppShell } from "./responsive-shell";

// 컨텍스트에는 상태가 아니라 스토어 인스턴스만 담는다 — 상태 변경 시 리렌더는
// useStore 셀렉터를 구독한 컴포넌트로만 좁혀진다.
const SeekerFiltersContext = createContext<SeekerFiltersStore | null>(null);

export function useSeekerFilters<T>(
	selector: (state: SeekerFiltersState) => T
): T {
	const store = useContext(SeekerFiltersContext);
	if (!store) {
		throw new Error("useSeekerFilters must be used within SeekerAppShell");
	}
	return useStore(store, selector);
}

// 데스크톱·모바일 헤더가 각각 자기 인스턴스를 마운트한다. Ctrl/Cmd+K 리스너는
// 두 번 등록되면 모달이 두 개 열리므로 데스크톱 쪽에서만 켠다.
function SeekerHeaderSearch({ withHotkey = false }: { withHotkey?: boolean }) {
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
			withHotkey={withHotkey}
		/>
	);
}

export function SeekerAppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [store] = useState(createSeekerFiltersStore);
	// 검색창은 마켓플레이스(/seeker)에서만 헤더에 노출하고 채팅·내정보엔 두지 않는다
	const isMarketplace = pathname === "/seeker";
	return (
		<SeekerFiltersContext.Provider value={store}>
			<ResponsiveAppShell
				// 모든 seeker 페이지(채용 목록·상세·채팅·수다방·내 정보) 헤더를
				// /seeker와 동일한 고정폭·여백으로 통일한다.
				contentWidthClassName={SEEKER_CONTENT_MAX_W}
				headerSlot={
					isMarketplace ? <SeekerHeaderSearch withHotkey /> : undefined
				}
				mobileHeaderSlot={isMarketplace ? <SeekerHeaderSearch /> : undefined}
				variant="seeker"
			>
				{children}
			</ResponsiveAppShell>
		</SeekerFiltersContext.Provider>
	);
}

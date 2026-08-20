"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { AD_PERIOD_TIERS, type AdPeriodTier } from "./ad-period";

// 운영자 설정 등급을 읽어 카드 배지·구인자 안내 등급표에 공급한다. 행이 없거나(미설정)
// 로딩 중이면 상수 폴백으로 렌더해 깜빡임을 없앤다. orpc react-query 캐시가 여러 카드의
// 중복 요청을 하나로 합친다.
export function useAdPeriodTiers(): readonly AdPeriodTier[] {
	const query = useQuery(orpc.bambi.adPeriodTiers.list.queryOptions());
	const rows = query.data;
	if (!rows || rows.length === 0) {
		return AD_PERIOD_TIERS;
	}
	return rows.map((row) => ({
		borderColorClass: row.borderColorClass,
		colorClass: row.colorClass,
		emphasizeBorder: row.emphasizeBorder,
		icon: row.icon,
		label: row.label,
		maxDays: row.maxDays,
		minDays: row.minDays,
	}));
}

"use client";

import type { RegionTreeNode } from "@bambi-app/api/routers/bambi/regions";
import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

// 지역 마스터는 운영자가 시드를 바꾸기 전에는 움직이지 않는 정적 데이터다. 오래 캐시해
// 화면마다 훅을 불러도 요청은 세션에 한 번만 나가게 한다.
const REGION_STALE_TIME_MS = 24 * 60 * 60 * 1000;

// 시/도 → 세부지역 트리. 공고 폼·마켓 필터·팀 폼이 지역 Select를 그리는 유일한 소스다.
export function useRegions(): {
	isLoading: boolean;
	regions: RegionTreeNode[];
} {
	const query = useQuery({
		...orpc.bambi.regions.list.queryOptions(),
		staleTime: REGION_STALE_TIME_MS,
	});

	return { isLoading: query.isLoading, regions: query.data ?? [] };
}

export const findRegion = (
	regions: RegionTreeNode[],
	regionCode: null | string
): RegionTreeNode | undefined =>
	regionCode ? regions.find((region) => region.code === regionCode) : undefined;

// 코드로 들고 있는 시/도의 표시 라벨(미선택·마스터에 없는 코드는 빈 문자열).
export const regionLabel = (
	regions: RegionTreeNode[],
	regionCode: null | string
): string => findRegion(regions, regionCode)?.label ?? "";

// 저장된 세부지역 코드의 표시 이름. 목록·표에는 시군구명 칸이 따로 없어 여기서 되짚는다.
export const findDistrictName = (
	regions: RegionTreeNode[],
	regionCode: null | string,
	districtCode: null | string
): string =>
	(districtCode
		? findRegion(regions, regionCode)?.districts.find(
				(district) => district.code === districtCode
			)?.name
		: "") ?? "";

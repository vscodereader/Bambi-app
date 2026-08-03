import { db } from "@bambi-app/db";
import { region } from "@bambi-app/db/schema/bambi";
import { asc, eq } from "drizzle-orm";

import { publicProcedure } from "../../index";

// 화면이 쓰는 지역 트리 한 마디. 웹·네이티브가 같은 응답으로 시/도 Select와 세부지역
// Select를 그린다.
export interface RegionTreeNode {
	code: string;
	districts: { code: string; name: string }[];
	label: string;
}

export const regionsRouter = {
	// 활성 지역 전량(245행 수준). 필터·공고 등록 화면이 첫 렌더에 통째로 받아 두고 쓰는
	// 정적 마스터라 페이징·검색을 두지 않는다.
	list: publicProcedure.handler(async (): Promise<RegionTreeNode[]> => {
		const rows = await db
			.select({
				code: region.code,
				label: region.label,
				sigungu: region.sigungu,
			})
			.from(region)
			.where(eq(region.isActive, true))
			// sort_order는 시/도 행에서는 지역 순서, 시/군/구 행에서는 라벨 안 순서라 축이
			// 다르다. 아래에서 두 그룹을 나눠 담으므로 이 한 번의 정렬로 양쪽 순서가 다 선다.
			.orderBy(asc(region.sortOrder));
		const byLabel = new Map<string, RegionTreeNode>();
		const tree: RegionTreeNode[] = [];

		for (const row of rows) {
			if (row.sigungu === null) {
				const node: RegionTreeNode = {
					code: row.code,
					districts: [],
					label: row.label,
				};

				byLabel.set(row.label, node);
				tree.push(node);
			}
		}

		// 자식은 두 번째 패스에서 붙인다 — 정렬이 sort_order 하나뿐이라 시/군/구 행이 자기
		// 시/도 행보다 앞에 나올 수 있다.
		for (const row of rows) {
			if (row.sigungu !== null) {
				byLabel
					.get(row.label)
					?.districts.push({ code: row.code, name: row.sigungu });
			}
		}

		return tree;
	}),
};

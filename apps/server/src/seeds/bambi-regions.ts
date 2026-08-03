// 지역 마스터 시드. 개발 전용인 bambi-dev.ts와 달리 **운영에도 그대로 쓰는 데이터**다 —
// 공고의 region_code·district_code가 이 표를 FK로 잡고 있어, 비어 있으면 공고를 한 건도
// 등록할 수 없다. 배포 때 마이그레이션 직후 한 번 돌린다.
//
// 멱등이다: code 기준 upsert라 몇 번을 돌려도 같은 상태가 되고, 이미 붙어 있는 참조를
// 건드리지 않는다. is_active는 덮지 않는다 — 운영이 내려둔 지역이 시드 재실행으로 조용히
// 되살아나면 안 된다.
import { readFileSync } from "node:fs";

import { db } from "@bambi-app/db";
import { region } from "@bambi-app/db/schema/bambi";
import { sql } from "drizzle-orm";

interface RegionSeedRow {
	code: string;
	label: string;
	sigungu: null | string;
	sortOrder: number;
}

// 법정동코드 원본에서 뽑아 검증한 시/도 16 + 시/군/구 229행. 코드는 정부 표준값이고
// label은 표출용 약칭("서울특별시"가 아니라 "서울")이다.
const rows = JSON.parse(
	readFileSync(new URL("./regions.json", import.meta.url), "utf8")
) as RegionSeedRow[];

const main = async (): Promise<void> => {
	await db
		.insert(region)
		.values(rows)
		.onConflictDoUpdate({
			set: {
				label: sql`excluded.label`,
				sigungu: sql`excluded.sigungu`,
				sortOrder: sql`excluded.sort_order`,
			},
			target: region.code,
		});

	const sido = rows.filter((row) => row.sigungu === null).length;

	console.log(
		`Region seed completed: ${rows.length} rows (${sido} sido, ${rows.length - sido} sigungu).`
	);
};

main()
	.then(() => {
		process.exit(0);
	})
	.catch((error: unknown) => {
		console.error("Region seed failed.");
		console.error(error);
		process.exit(1);
	});

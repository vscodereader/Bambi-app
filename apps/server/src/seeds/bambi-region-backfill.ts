// 기존 행의 자유 텍스트 지역(region·district)을 지역 마스터 코드로 채우는 1회성 스크립트.
// bambi-regions.ts(시드) 다음에 한 번만 돌린다.
//
// 매칭 규칙은 크롤 수집이 쓰는 것과 같은 헬퍼(matchRegionCodes)다 — 여기서 규칙을 따로
// 쓰면 같은 원문이 백필과 수집에서 다른 코드로 굳는다. 매칭에 실패한 행은 코드를 null로
// 두고 원문을 그대로 남긴 뒤 건수만 로그로 보고한다("기타" 지역 등).
import {
	loadRegionIndex,
	matchRegionCodes,
	type RegionIndex,
} from "@bambi-app/api/services/bambi-region";
import { db } from "@bambi-app/db";
import {
	crawledJobPost,
	employerTeamProfile,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { inArray, isNull } from "drizzle-orm";

interface BackfillRow {
	district: null | string;
	id: string;
	region: null | string;
}

interface CodeGroup {
	districtCode: null | string;
	ids: string[];
	regionCode: null | string;
}

interface GroupResult {
	groups: CodeGroup[];
	unmatchedDistrict: number;
	unmatchedRegion: number;
}

// (regionCode, districtCode) 조합별로 id를 모은다. 행마다 UPDATE를 날리면 수천 번이 되지만
// 조합은 많아야 지역 수만큼이라, 묶으면 UPDATE가 수십 번으로 끝난다.
const groupByCodes = (index: RegionIndex, rows: BackfillRow[]): GroupResult => {
	const groups = new Map<string, CodeGroup>();
	let unmatchedDistrict = 0;
	let unmatchedRegion = 0;

	for (const row of rows) {
		const codes = matchRegionCodes(index, row);

		if (!codes.regionCode) {
			unmatchedRegion += 1;
			continue;
		}

		if (row.district && !codes.districtCode) {
			unmatchedDistrict += 1;
		}

		const key = `${codes.regionCode}|${codes.districtCode ?? ""}`;
		const group = groups.get(key);

		if (group) {
			group.ids.push(row.id);
		} else {
			groups.set(key, { ...codes, ids: [row.id] });
		}
	}

	return { groups: [...groups.values()], unmatchedDistrict, unmatchedRegion };
};

const report = (table: string, rowCount: number, result: GroupResult): void => {
	const matched = result.groups.reduce(
		(total, group) => total + group.ids.length,
		0
	);

	console.log(
		`${table}: ${rowCount} rows without codes → ${matched} matched, ${result.unmatchedRegion} region misses, ${result.unmatchedDistrict} district misses (region matched, district left null).`
	);
};

const backfillJobPost = async (index: RegionIndex): Promise<void> => {
	const rows = await db
		.select({
			district: jobPost.district,
			id: jobPost.id,
			region: jobPost.region,
		})
		.from(jobPost)
		.where(isNull(jobPost.regionCode));
	const result = groupByCodes(index, rows);

	for (const group of result.groups) {
		await db
			.update(jobPost)
			.set({
				districtCode: group.districtCode,
				regionCode: group.regionCode,
			})
			.where(inArray(jobPost.id, group.ids));
	}

	report("job_post", rows.length, result);
};

const backfillCrawledJobPost = async (index: RegionIndex): Promise<void> => {
	const rows = await db
		.select({
			district: crawledJobPost.district,
			id: crawledJobPost.id,
			region: crawledJobPost.region,
		})
		.from(crawledJobPost)
		.where(isNull(crawledJobPost.regionCode));
	const result = groupByCodes(index, rows);

	for (const group of result.groups) {
		await db
			.update(crawledJobPost)
			.set({
				districtCode: group.districtCode,
				regionCode: group.regionCode,
			})
			.where(inArray(crawledJobPost.id, group.ids));
	}

	report("crawled_job_post", rows.length, result);
};

const backfillEmployerTeamProfile = async (
	index: RegionIndex
): Promise<void> => {
	// 이 테이블에는 세부지역 문자열 칸이 없다 — 시/도만 채운다.
	const rows = await db
		.select({ id: employerTeamProfile.id, region: employerTeamProfile.region })
		.from(employerTeamProfile)
		.where(isNull(employerTeamProfile.regionCode));
	const result = groupByCodes(
		index,
		rows.map((row) => ({ ...row, district: null }))
	);

	for (const group of result.groups) {
		await db
			.update(employerTeamProfile)
			.set({ regionCode: group.regionCode })
			.where(inArray(employerTeamProfile.id, group.ids));
	}

	report("employer_team_profile", rows.length, result);
};

const main = async (): Promise<void> => {
	const index = await loadRegionIndex();

	if (index.byLabel.size === 0) {
		throw new Error(
			"지역 마스터가 비어 있습니다. bambi-regions.ts 시드를 먼저 실행하세요."
		);
	}

	await backfillJobPost(index);
	await backfillCrawledJobPost(index);
	await backfillEmployerTeamProfile(index);
};

main()
	.then(() => {
		process.exit(0);
	})
	.catch((error: unknown) => {
		console.error("Region backfill failed.");
		console.error(error);
		process.exit(1);
	});

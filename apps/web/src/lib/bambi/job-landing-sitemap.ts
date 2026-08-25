// 사이트맵의 /jobs 랜딩 항목을 지역×업종 집계로 조립하는 순수 로직. sitemap.ts에서 떼어내
// 단위 테스트한다(0건 조합 제외·lastmod 매핑·조회 실패 폴백은 DB 없이 검증 가능해야 한다).

import type { MetadataRoute } from "next";
import {
	JOB_LANDING_INDUSTRIES,
	JOB_LANDING_REGIONS,
	jobLandingPath,
	jobLandingPaths,
} from "./job-landing";

// jobs.landingSummary가 내려주는 지역×업종 집계 한 행. lastModified는 orpc 직렬화 경로에서
// Date 또는 ISO 문자열로 도착할 수 있어 둘 다 받는다.
export interface LandingSummaryRow {
	count: number;
	industryCategory: string;
	lastModified: Date | null | string;
	regionCode: null | string;
}

const comboKey = (regionCode: string, industryCategory: string): string =>
	`${regionCode}::${industryCategory}`;

const toTime = (value: Date | null | string): null | number => {
	if (!value) {
		return null;
	}

	const time = new Date(value).getTime();

	return Number.isNaN(time) ? null : time;
};

const maxDate = (times: number[]): Date | undefined =>
	times.length > 0 ? new Date(Math.max(...times)) : undefined;

// 두 원천(자체·수집)이 같은 조합 행을 각각 내므로 시각을 최댓값으로 합친다.
// null(시각 없음)과 undefined(조합 없음=0건)를 구분해 둔다.
const mergeTime = (
	prev: null | number | undefined,
	next: null | number
): null | number => {
	if (prev === undefined || prev === null) {
		return next;
	}

	return next === null ? prev : Math.max(prev, next);
};

const entry = (
	baseUrl: string,
	path: string,
	lastModified?: Date
): MetadataRoute.Sitemap[number] =>
	lastModified
		? { lastModified, url: `${baseUrl}${path}` }
		: { url: `${baseUrl}${path}` };

// 사이트맵의 /jobs 랜딩 항목을 만든다.
// - summary가 null(조회 실패)이면 현행 폴백(161개 전부·lastmod 없음)을 그대로 낸다.
// - 아니면 (a) 공고 0건인 지역×업종 조합은 빼고, (b) 인덱스·지역·조합 항목에 최신 updatedAt을
//   lastModified로 채운다. 지역 페이지(16개)는 0건이어도 유지한다(콘텐츠 섹션이 있는 허브).
export const buildJobLandingSitemapEntries = (
	summary: LandingSummaryRow[] | null,
	baseUrl: string
): MetadataRoute.Sitemap => {
	if (summary === null) {
		return jobLandingPaths().map((path) => ({ url: `${baseUrl}${path}` }));
	}

	// 조합 키 → 최신 시각(없으면 null). 키가 없으면 0건이다.
	const byCombo = new Map<string, null | number>();
	// 인덱스 lastmod(전체 최신)는 지역 코드가 없는 수집 행까지 포함해 계산한다.
	const allTimes: number[] = [];

	for (const row of summary) {
		if (row.count <= 0) {
			continue;
		}

		const time = toTime(row.lastModified);

		if (time !== null) {
			allTimes.push(time);
		}

		if (row.regionCode) {
			const key = comboKey(row.regionCode, row.industryCategory);
			byCombo.set(key, mergeTime(byCombo.get(key), time));
		}
	}

	const entries: MetadataRoute.Sitemap = [
		entry(baseUrl, "/jobs", maxDate(allTimes)),
	];

	for (const region of JOB_LANDING_REGIONS) {
		const regionTimes: number[] = [];
		const comboEntries: MetadataRoute.Sitemap = [];

		for (const industry of JOB_LANDING_INDUSTRIES) {
			const combo = byCombo.get(comboKey(region.code, industry.label));

			// undefined = 0건 조합 → 사이트맵에서 제외.
			if (combo === undefined) {
				continue;
			}

			if (combo !== null) {
				regionTimes.push(combo);
			}

			comboEntries.push(
				entry(
					baseUrl,
					jobLandingPath({ industry, region }),
					combo === null ? undefined : new Date(combo)
				)
			);
		}

		// 지역 페이지는 0건이어도 유지, lastmod는 지역 내 최신.
		entries.push(
			entry(baseUrl, jobLandingPath({ region }), maxDate(regionTimes))
		);
		entries.push(...comboEntries);
	}

	return entries;
};

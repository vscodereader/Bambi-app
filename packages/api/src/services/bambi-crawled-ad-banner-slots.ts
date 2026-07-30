// 수집 공고를 광고 배너 슬롯 후보로 읽어오는 자리. 대체 규칙 자체는 순수 함수
// (bambi-crawl-ad-banners.ts)에 있고, 여기서는 DB 읽기와 방향별 풀 분리만 한다.

import { db } from "@bambi-app/db";
import { crawledJobPost, jobPost } from "@bambi-app/db/schema/bambi";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";

import {
	type CrawledAdBannerSource,
	resolveCrawledAdBanners,
} from "./bambi-crawl-ad-banners";

// 순환 풀 상한. 링은 8칸뿐이지만 풀이 크면 버킷마다 다른 조합이 돈다. 전량을 읽으면
// 수집 테이블이 커질수록 이 공개 조회가 무거워지므로 최근 것부터 잘라 온다.
const CRAWLED_AD_BANNER_POOL_LIMIT = 60;

// 결제 광고 행과 키를 맞춘 후보 행. 슬롯 배열이 두 출처를 섞어 담으므로 모양이 같아야
// 클라이언트가 분기 없이 렌더한다. 수집 공고에는 없는 축(업로드 미디어·배너 레이아웃)은 null이다.
export interface CrawledAdBannerCandidate {
	adHorizontal: null;
	// 미러링된 이미지 URL. 결제 광고는 storageKey로 오지만 수집 이미지는 이미 완성된 URL이다.
	adHorizontalUrl: null | string;
	adVertical: null;
	adVerticalUrl: null | string;
	coverImage: null;
	employerDisplayName: string;
	id: string;
	layout: null;
	source: "crawled";
	teamDisplayName: null;
	title: string;
	// 세로형을 다른 공고에서 빌렸으면 그 공고 id. 빌린 이미지는 주인과 클릭 대상이 다르므로
	// 이 사실을 응답에 남긴다(화면이 출처를 표기하거나 빼기로 결정할 근거).
	verticalBorrowedFrom: null | string;
}

export interface CrawledAdBannerPools {
	horizontal: CrawledAdBannerCandidate[];
	vertical: CrawledAdBannerCandidate[];
}

const EMPTY_POOLS: CrawledAdBannerPools = { horizontal: [], vertical: [] };

// 수집 공고를 방향별 순환 풀로 나눠 돌려준다. 방향 이미지가 없는 공고는 그 방향 풀에
// 들어가지 않으므로, 링이 빈 칸을 물고 도는 일이 없다.
export const loadCrawledAdBannerPools =
	async (): Promise<CrawledAdBannerPools> => {
		const rows = await db
			.select({
				bannerHorizontalUrl: crawledJobPost.bannerHorizontalUrl,
				bannerVerticalUrl: crawledJobPost.bannerVerticalUrl,
				id: crawledJobPost.id,
				shopName: crawledJobPost.shopName,
				sourceExternalId: crawledJobPost.sourceExternalId,
				thumbnailUrl: crawledJobPost.thumbnailUrl,
				title: crawledJobPost.title,
			})
			.from(crawledJobPost)
			.where(
				and(
					eq(crawledJobPost.status, "active"),
					// 업소명이 없으면 카드·배너에 이름을 붙일 수 없다.
					isNotNull(crawledJobPost.shopName),
					// 이미지가 하나도 없는 공고는 배너 칸을 채울 수 없다.
					or(
						isNotNull(crawledJobPost.bannerHorizontalUrl),
						isNotNull(crawledJobPost.bannerVerticalUrl),
						isNotNull(crawledJobPost.thumbnailUrl)
					),
					// 이미 우리 공고로 전환된 원본은 결제 광고 쪽에서 다뤄진다.
					sql`not exists (select 1 from ${jobPost} where ${jobPost.crawledFromId} = ${crawledJobPost.id})`
				)
			)
			.orderBy(desc(crawledJobPost.firstSeenAt))
			.limit(CRAWLED_AD_BANNER_POOL_LIMIT);

		if (rows.length === 0) {
			return EMPTY_POOLS;
		}

		// 대체 규칙은 "다른 공고의 세로형"을 빌리므로 풀 전체를 알아야 한다.
		const sources: CrawledAdBannerSource[] = rows.map((row) => ({
			bannerHorizontalUrl: row.bannerHorizontalUrl,
			bannerVerticalUrl: row.bannerVerticalUrl,
			sourceExternalId: row.sourceExternalId,
			thumbnailUrl: row.thumbnailUrl,
		}));
		const candidates = rows.map((row, index) => {
			const banners = resolveCrawledAdBanners(
				sources[index] as CrawledAdBannerSource,
				sources
			);

			return {
				adHorizontal: null,
				adHorizontalUrl: banners.horizontalUrl,
				adVertical: null,
				adVerticalUrl: banners.verticalUrl,
				coverImage: null,
				employerDisplayName: row.shopName as string,
				id: row.id,
				layout: null,
				source: "crawled",
				teamDisplayName: null,
				title: row.title,
				verticalBorrowedFrom: banners.verticalBorrowedFrom,
			} satisfies CrawledAdBannerCandidate;
		});

		return {
			horizontal: candidates.filter(
				(candidate) => candidate.adHorizontalUrl !== null
			),
			vertical: candidates.filter(
				(candidate) => candidate.adVerticalUrl !== null
			),
		};
	};

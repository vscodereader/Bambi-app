// 수집 공고를 광고 배너 슬롯 후보로 읽어오는 자리. DB 읽기와 방향별 풀 분리만 한다.
//
// 자격은 **쓰기 기준과 읽기 기준의 이중 방어**다: 파서가 지정 컨테이너(#main_center /
// #divMenu2·#divMenu12)에서 온 공고만 listing_type='ad_banner'로 라벨하고, 여기서 그 라벨과
// 방향별 배너 URL을 다시 요구한다. 예전에는 "이미지가 하나라도 있는 active 공고"가 전부
// 후보였고 썸네일 폴백·다른 공고 세로형 빌려오기까지 있어서, 배너를 산 적도 없는 일반 공고의
// 썸네일이 광고 자리에 올라갔다 — 그 통로를 전부 닫는다.

import { db } from "@bambi-app/db";
import { crawledJobPost, jobPost } from "@bambi-app/db/schema/bambi";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { readCrawledLimits } from "./bambi-crawled-limits";

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
}

export interface CrawledAdBannerPools {
	horizontal: CrawledAdBannerCandidate[];
	vertical: CrawledAdBannerCandidate[];
}

// 방향과 무관한 배너 자격. 두 방향 쿼리가 같은 기준을 쓰도록 한자리에 모아둔다.
const BANNER_CANDIDATE_FILTERS = [
	eq(crawledJobPost.status, "active"),
	// 지정 컨테이너 출신 배너만. 라벨이 없는 공고는 원본에서도 광고 자리가 아니었다.
	eq(crawledJobPost.listingType, "ad_banner"),
	// 업소명이 없으면 카드·배너에 이름을 붙일 수 없다.
	isNotNull(crawledJobPost.shopName),
	// 이미 우리 공고로 전환된 원본은 결제 광고 쪽에서 다뤄진다.
	sql`not exists (select 1 from ${jobPost} where ${jobPost.crawledFromId} = ${crawledJobPost.id})`,
];

// 한 방향의 후보를 최근 것부터 상한만큼 읽는다. 상한은 **방향별**이다 — 수집 쪽
// (bambi-crawl-ingest의 capBannersByDirection)이 이미 "가로 N칸 + 세로 N칸"으로 자르므로
// 읽기도 같은 의미여야 한다. 합쳐서 한 번 자르면 최근 행이 한 방향으로 치우친 순간
// 다른 방향 링이 굶는다(가로만 8건 들어온 회차에 세로 칸이 통째로 비었다).
//
// 전량을 읽지 않는 이유는 그대로다 — 수집 테이블이 커질수록 이 공개 조회가 무거워진다.
const loadDirection = async (
	direction: "horizontal" | "vertical",
	limit: number
): Promise<CrawledAdBannerCandidate[]> => {
	const bannerColumn =
		direction === "horizontal"
			? crawledJobPost.bannerHorizontalUrl
			: crawledJobPost.bannerVerticalUrl;
	const rows = await db
		.select({
			bannerHorizontalUrl: crawledJobPost.bannerHorizontalUrl,
			bannerVerticalUrl: crawledJobPost.bannerVerticalUrl,
			id: crawledJobPost.id,
			shopName: crawledJobPost.shopName,
			title: crawledJobPost.title,
		})
		.from(crawledJobPost)
		.where(
			and(
				...BANNER_CANDIDATE_FILTERS,
				// 그 방향 배너가 없으면 이 링에 들어가지 못한다(썸네일은 배너가 아니다).
				isNotNull(bannerColumn)
			)
		)
		.orderBy(desc(crawledJobPost.firstSeenAt))
		.limit(limit);

	return rows.map(
		(row) =>
			({
				adHorizontal: null,
				adHorizontalUrl: row.bannerHorizontalUrl,
				adVertical: null,
				adVerticalUrl: row.bannerVerticalUrl,
				coverImage: null,
				employerDisplayName: row.shopName as string,
				id: row.id,
				layout: null,
				source: "crawled",
				teamDisplayName: null,
				title: row.title,
			}) satisfies CrawledAdBannerCandidate
	);
};

// 수집 공고를 방향별 순환 풀로 나눠 돌려준다. 방향 이미지가 없는 공고는 그 방향 풀에
// 들어가지 않으므로, 링이 빈 칸을 물고 도는 일이 없다.
export const loadCrawledAdBannerPools =
	async (): Promise<CrawledAdBannerPools> => {
		// 상한은 운영자 설정(미설정이면 코드 기본값).
		const limits = await readCrawledLimits();
		const [horizontal, vertical] = await Promise.all([
			loadDirection("horizontal", limits.adBanner),
			loadDirection("vertical", limits.adBanner),
		]);

		return { horizontal, vertical };
	};

// 운영자가 정하는 수집 상한. 공고는 섹션별 노출 개수(수집 시 요청 절약 + 조회 시 과거 회차가
// 남긴 초과 라벨 방어), 커뮤니티는 한 회차에 담을 글 수다. 어느 쪽이든 수집기와 조회부가 같은
// 값을 봐야 하므로 한 곳에서만 읽는다.

import { db } from "@bambi-app/db";
import { bambiSiteSettings } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";

import { COMMUNITY_TOPICS_PER_RUN } from "./bambi-crawl-policy";

// 키는 우리 자리 어휘(listing_type)를 따른다 — 라우터 입력 키(adBannerLimit…)와 층위가 다르다.
// community만 층위가 다르다: 노출 자리 개수가 아니라 한 회차에 목록에서 담을 글 수다.
export interface CrawledLimits {
	adBanner: number;
	community: number;
	recommended: number;
	special: number;
	urgent: number;
}

// 운영자가 값을 넣지 않았을 때 쓰는 코드 기본값. 배너는 링 슬롯 8칸에 맞추고, 섹션은 원본
// 스페셜(12칸) 크기를 기준으로 잡았다. DB default로 박지 않아 여기서만 바꾸면 된다.
//
// community는 지금까지 상한 없이 돌던 실효 규모를 그대로 옮긴 값이다(목록 5페이지 × 페이지당
// 30건 = 150). 기본값을 그렇게 잡아야 이 상한이 붙는 것만으로 수집량이 바뀌지 않는다.
export const DEFAULT_CRAWLED_LIMITS: CrawledLimits = {
	adBanner: 8,
	community: COMMUNITY_TOPICS_PER_RUN,
	recommended: 12,
	special: 12,
	urgent: 12,
};

export const readCrawledLimits = async (): Promise<CrawledLimits> => {
	const [row] = await db
		.select({
			adBanner: bambiSiteSettings.crawledAdBannerLimit,
			community: bambiSiteSettings.crawledCommunityLimit,
			recommended: bambiSiteSettings.crawledRecommendedLimit,
			special: bambiSiteSettings.crawledSpecialLimit,
			urgent: bambiSiteSettings.crawledUrgentLimit,
		})
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"))
		.limit(1);

	// 설정 행이 없어도(초기 배포) 기본값으로 돈다. 0은 "노출하지 않음"이라 폴백 대상이 아니다.
	return {
		adBanner: row?.adBanner ?? DEFAULT_CRAWLED_LIMITS.adBanner,
		community: row?.community ?? DEFAULT_CRAWLED_LIMITS.community,
		recommended: row?.recommended ?? DEFAULT_CRAWLED_LIMITS.recommended,
		special: row?.special ?? DEFAULT_CRAWLED_LIMITS.special,
		urgent: row?.urgent ?? DEFAULT_CRAWLED_LIMITS.urgent,
	};
};

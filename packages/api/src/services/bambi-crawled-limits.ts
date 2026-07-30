// 섹션별 수집 공고 노출 상한. 수집 시(요청 절약)와 조회 시(과거 회차가 남긴 초과 라벨 방어)
// 양쪽이 같은 값을 봐야 하므로 한 곳에서만 읽는다.

import { db } from "@bambi-app/db";
import { bambiSiteSettings } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";

// 키는 우리 자리 어휘(listing_type)를 따른다 — 라우터 입력 키(adBannerLimit…)와 층위가 다르다.
export interface CrawledLimits {
	adBanner: number;
	recommended: number;
	special: number;
	urgent: number;
}

// 운영자가 값을 넣지 않았을 때 쓰는 코드 기본값. 배너는 링 슬롯 8칸에 맞추고, 섹션은 원본
// 스페셜(12칸) 크기를 기준으로 잡았다. DB default로 박지 않아 여기서만 바꾸면 된다.
export const DEFAULT_CRAWLED_LIMITS: CrawledLimits = {
	adBanner: 8,
	recommended: 12,
	special: 12,
	urgent: 12,
};

export const readCrawledLimits = async (): Promise<CrawledLimits> => {
	const [row] = await db
		.select({
			adBanner: bambiSiteSettings.crawledAdBannerLimit,
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
		recommended: row?.recommended ?? DEFAULT_CRAWLED_LIMITS.recommended,
		special: row?.special ?? DEFAULT_CRAWLED_LIMITS.special,
		urgent: row?.urgent ?? DEFAULT_CRAWLED_LIMITS.urgent,
	};
};

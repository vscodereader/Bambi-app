import type { Metadata } from "next";
import { PublicJobLanding } from "@/components/bambi/public-job-landing";
import {
	jobLandingDescription,
	jobLandingKeywords,
	jobLandingTitle,
} from "@/lib/bambi/job-landing";
import {
	mergeSeoKeywords,
	SITE_KEYWORDS,
	siteOpenGraph,
} from "@/lib/bambi/seo";

// 공개 랜딩 인덱스. 서비스 소개 + 지역·업종 진입 링크 + 최신 공개 공고를 서버에서 그린다.
// publicClient(익명·headers 미전달)로만 조회하므로 ISR로 정적 재생성된다(10분).
export const revalidate = 600;

export const metadata: Metadata = {
	title: jobLandingTitle({}),
	description: jobLandingDescription({}),
	keywords: mergeSeoKeywords(SITE_KEYWORDS, jobLandingKeywords({})),
	alternates: { canonical: "/jobs" },
	openGraph: siteOpenGraph({
		title: jobLandingTitle({}),
		description: jobLandingDescription({}),
		url: "/jobs",
	}),
};

export default function JobsLandingPage() {
	return <PublicJobLanding />;
}

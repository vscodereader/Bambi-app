import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	loadLandingJobs,
	PublicJobLanding,
} from "@/components/bambi/public-job-landing";
import {
	findJobLandingIndustry,
	findJobLandingRegion,
	type JobLandingTarget,
	jobLandingDescription,
	jobLandingKeywords,
	jobLandingPath,
	jobLandingTitle,
} from "@/lib/bambi/job-landing";
import {
	mergeSeoKeywords,
	SITE_KEYWORDS,
	siteOpenGraph,
} from "@/lib/bambi/seo";

interface IndustryLandingProps {
	params: Promise<{ industry: string; region: string }>;
}

// 두 슬러그가 모두 유효할 때만 랜딩이 성립한다(둘 중 하나만 맞으면 404).
const resolveTarget = async (
	params: IndustryLandingProps["params"]
): Promise<JobLandingTarget | null> => {
	const { industry: industrySlug, region: regionSlug } = await params;
	const region = findJobLandingRegion(regionSlug);
	const industry = findJobLandingIndustry(industrySlug);

	return region && industry ? { industry, region } : null;
};

export async function generateMetadata({
	params,
}: IndustryLandingProps): Promise<Metadata> {
	const target = await resolveTarget(params);

	if (!target) {
		return {};
	}

	// 같은 요청에서 페이지 렌더도 loadLandingJobs를 부르지만 React cache로 조회를 공유해
	// 중복 조회가 없다. 지역×업종 144조합은 다수가 빈 상태라, 진짜 0건([])일 때만 thin/도어웨이
	// 색인을 막게 noindex(follow)를 붙인다 — 조회 실패(null)면 robots를 생략해 색인 유지.
	const jobs = await loadLandingJobs(target);

	return {
		title: jobLandingTitle(target),
		description: jobLandingDescription(target),
		keywords: mergeSeoKeywords(SITE_KEYWORDS, jobLandingKeywords(target)),
		alternates: { canonical: jobLandingPath(target) },
		openGraph: siteOpenGraph({
			title: jobLandingTitle(target),
			description: jobLandingDescription(target),
			url: jobLandingPath(target),
		}),
		...(jobs?.length === 0 ? { robots: { index: false, follow: true } } : {}),
	};
}

export default async function IndustryJobsLandingPage({
	params,
}: IndustryLandingProps) {
	const target = await resolveTarget(params);

	if (!target) {
		notFound();
	}

	return <PublicJobLanding industry={target.industry} region={target.region} />;
}

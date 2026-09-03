import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicJobLanding } from "@/components/bambi/public-job-landing";
import {
	findJobLandingIndustry,
	findJobLandingRegion,
	JOB_LANDING_INDUSTRIES,
	JOB_LANDING_REGIONS,
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

// 지역×업종 144조합(16×9)을 빌드 시점에 정적 생성한다. publicClient로만 조회해 ISR(10분)로
// 재생성된다. 표에 없는 조합은 dynamicParams 기본값으로 온디맨드 렌더 후 notFound()가 404를 낸다.
export const revalidate = 600;

export function generateStaticParams() {
	return JOB_LANDING_REGIONS.flatMap((region) =>
		JOB_LANDING_INDUSTRIES.map((industry) => ({
			industry: industry.slug,
			region: region.slug,
		}))
	);
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

	// 0건이어도 업종 정의·FAQ·지역 서술 본문과 폴백 공고가 있어 색인 대상이다(noindex 가드 제거, 2026-09).
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

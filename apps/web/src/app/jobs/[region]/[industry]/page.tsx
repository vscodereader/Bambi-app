import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicJobLanding } from "@/components/bambi/public-job-landing";
import {
	findJobLandingIndustry,
	findJobLandingRegion,
	type JobLandingTarget,
	jobLandingDescription,
	jobLandingPath,
	jobLandingTitle,
} from "@/lib/bambi/job-landing";

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

	return {
		title: jobLandingTitle(target),
		description: jobLandingDescription(target),
		alternates: { canonical: jobLandingPath(target) },
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

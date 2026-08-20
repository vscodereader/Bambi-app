import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicJobLanding } from "@/components/bambi/public-job-landing";
import {
	findJobLandingRegion,
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

interface RegionLandingProps {
	params: Promise<{ region: string }>;
}

export async function generateMetadata({
	params,
}: RegionLandingProps): Promise<Metadata> {
	const region = findJobLandingRegion((await params).region);

	// 없는 슬러그는 페이지가 notFound()로 404를 낸다. Next가 404 응답에 noindex를 붙이므로
	// 여기서는 색인될 제목만 만들지 않으면 된다.
	if (!region) {
		return {};
	}

	return {
		title: jobLandingTitle({ region }),
		description: jobLandingDescription({ region }),
		keywords: mergeSeoKeywords(SITE_KEYWORDS, jobLandingKeywords({ region })),
		alternates: { canonical: jobLandingPath({ region }) },
		openGraph: siteOpenGraph({
			title: jobLandingTitle({ region }),
			description: jobLandingDescription({ region }),
			url: jobLandingPath({ region }),
		}),
	};
}

export default async function RegionJobsLandingPage({
	params,
}: RegionLandingProps) {
	const region = findJobLandingRegion((await params).region);

	if (!region) {
		notFound();
	}

	return <PublicJobLanding region={region} />;
}

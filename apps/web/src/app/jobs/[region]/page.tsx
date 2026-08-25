import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	loadLandingJobs,
	PublicJobLanding,
} from "@/components/bambi/public-job-landing";
import {
	findJobLandingRegion,
	JOB_LANDING_REGIONS,
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

// 16개 시/도 슬러그를 빌드 시점에 정적 생성한다. publicClient로만 조회해 ISR(10분)로 재생성된다.
// 표에 없는 슬러그는 dynamicParams 기본값(true)으로 온디맨드 렌더 후 notFound()가 404를 낸다.
export const revalidate = 600;

export function generateStaticParams() {
	return JOB_LANDING_REGIONS.map((region) => ({ region: region.slug }));
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

	// 같은 요청에서 페이지 렌더도 loadLandingJobs를 부르지만 React cache로 조회를 공유해
	// 중복 조회가 없다. 지역×업종 조합은 다수가 빈 상태로 색인되면 thin/도어웨이 리스크라,
	// 진짜 0건([])일 때만 noindex(follow)를 붙인다 — 조회 실패(null)면 robots를 생략해 색인 유지.
	const jobs = await loadLandingJobs({ region });

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
		...(jobs?.length === 0 ? { robots: { index: false, follow: true } } : {}),
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

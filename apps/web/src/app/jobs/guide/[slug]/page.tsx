import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobGuide } from "@/components/bambi/job-guide";
import {
	findGuide,
	guidePath,
	guideSlugs,
	guideTitle,
} from "@/lib/bambi/guide";
import {
	mergeSeoKeywords,
	SITE_KEYWORDS,
	siteOpenGraph,
} from "@/lib/bambi/seo";

interface GuideProps {
	params: Promise<{ slug: string }>;
}

// 정적 세그먼트 guide/[slug]는 /jobs/[region]/[industry]보다 우선한다(Next 세그먼트 우선순위).
// 레지스트리 slug만 빌드 시점에 생성하고, 표에 없는 slug는 notFound()로 404를 낸다.
export const revalidate = 600;

export function generateStaticParams() {
	return guideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: GuideProps): Promise<Metadata> {
	const guide = findGuide((await params).slug);

	// 없는 slug는 페이지가 notFound()로 404를 낸다. Next가 404에 noindex를 붙이므로
	// 여기서는 색인될 제목만 만들지 않으면 된다.
	if (!guide) {
		return {};
	}

	const title = guideTitle(guide);

	return {
		title,
		description: guide.description,
		keywords: mergeSeoKeywords(SITE_KEYWORDS, guide.keywords),
		alternates: { canonical: guidePath(guide.slug) },
		openGraph: siteOpenGraph({
			title,
			description: guide.description,
			url: guidePath(guide.slug),
		}),
	};
}

export default async function JobGuidePage({ params }: GuideProps) {
	const guide = findGuide((await params).slug);

	if (!guide) {
		notFound();
	}

	return <JobGuide content={guide} />;
}

import type { Metadata } from "next";
import { JobGuideHub } from "@/components/bambi/job-guide";
import {
	mergeSeoKeywords,
	SITE_KEYWORDS,
	siteOpenGraph,
} from "@/lib/bambi/seo";

// 가이드 허브. 정적 콘텐츠(레지스트리)만 그리므로 랜딩과 같은 ISR(10분)로 둔다.
export const revalidate = 600;

const HUB_TITLE = "유흥·접객 알바 가이드 | 퀸알바·여우알바·밤알바 밤비알바";
const HUB_DESCRIPTION =
	"업종별 알바의 뜻과 근무 방식, 정산 구조, 자주 묻는 질문을 정리한 가이드 모음입니다. 텐프로·유흥·주점·화류 알바 등 주제별로 확인하세요.";

export const metadata: Metadata = {
	title: HUB_TITLE,
	description: HUB_DESCRIPTION,
	keywords: mergeSeoKeywords(SITE_KEYWORDS),
	alternates: { canonical: "/jobs/guide" },
	openGraph: siteOpenGraph({
		title: HUB_TITLE,
		description: HUB_DESCRIPTION,
		url: "/jobs/guide",
	}),
};

export default function JobGuideHubPage() {
	return <JobGuideHub />;
}

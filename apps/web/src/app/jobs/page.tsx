import type { Metadata } from "next";
import { PublicJobLanding } from "@/components/bambi/public-job-landing";
import {
	jobLandingDescription,
	jobLandingTitle,
} from "@/lib/bambi/job-landing";

// 공개 랜딩 인덱스. 서비스 소개 + 지역·업종 진입 링크 + 최신 공개 공고를 서버에서 그린다.
export const metadata: Metadata = {
	title: jobLandingTitle({}),
	description: jobLandingDescription({}),
	alternates: { canonical: "/jobs" },
};

export default function JobsLandingPage() {
	return <PublicJobLanding />;
}

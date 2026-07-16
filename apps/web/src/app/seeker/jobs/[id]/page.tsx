"use client";

import type { Route } from "next";
import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ReportDialog } from "@/components/bambi/report-dialog";
import { SeekerJobDetailResponsive } from "@/components/bambi/screens/seeker-job-detail-responsive";
import { isApiJobId, useMarketplaceJob } from "@/lib/bambi/api-jobs";

export default function SeekerJobPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { isError, isLoading, job, refetch } = useMarketplaceJob(id);
	const [isReportOpen, setIsReportOpen] = useState(false);
	if (isLoading) {
		return (
			<div className="mx-auto w-full px-5 py-10 text-center font-bold text-muted-foreground md:max-w-[80%] md:px-6">
				공고 정보를 불러오고 있어요.
			</div>
		);
	}
	if (!job) {
		notFound();
	}
	// 실공고(uuid)만 신고 대상으로 접수한다. 목업(JOBS) 프리뷰 공고는 대상 uuid가
	// 없어 서버가 거부하므로 기존 동작(채팅 이동)을 그대로 유지한다.
	const canReport = isApiJobId(job.id);
	return (
		<>
			{isError ? (
				<div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm md:mx-auto md:max-w-[80%] md:px-6">
					실제 공고 상세를 불러오지 못했어요.
					<button
						className="ml-2 cursor-pointer border-none bg-transparent p-0 font-extrabold text-amber-900 underline"
						onClick={refetch}
						type="button"
					>
						다시 연결
					</button>
				</div>
			) : null}
			<SeekerJobDetailResponsive
				job={job}
				onBack={() => router.push("/seeker")}
				onReport={() => {
					if (canReport) {
						setIsReportOpen(true);
						return;
					}
					router.push(`/seeker/chats/${job.id}` as Route);
				}}
				onStartChat={() => router.push(`/seeker/jobs/${job.id}/chat` as Route)}
			/>
			{canReport ? (
				<ReportDialog
					onOpenChange={setIsReportOpen}
					open={isReportOpen}
					targetId={job.id}
					targetType="job_post"
				/>
			) : null}
		</>
	);
}

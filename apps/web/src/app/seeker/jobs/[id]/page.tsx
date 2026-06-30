"use client";

import type { Route } from "next";
import { notFound, useParams, useRouter } from "next/navigation";
import { SeekerJobDetailResponsive } from "@/components/bambi/screens/seeker-job-detail-responsive";
import { useMarketplaceJob } from "@/lib/bambi/api-jobs";

export default function SeekerJobPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { isError, isLoading, job, refetch } = useMarketplaceJob(id);
	if (isLoading) {
		return (
			<div className="mx-auto w-full max-w-[80%] px-4 py-10 text-center font-bold text-muted-foreground md:px-6">
				공고 정보를 불러오고 있어요.
			</div>
		);
	}
	if (!job) {
		notFound();
	}
	return (
		<>
			{isError ? (
				<div className="mx-auto mt-4 w-full max-w-[80%] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm md:px-6">
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
				onReport={() => router.push(`/seeker/chats/${job.id}` as Route)}
				onStartChat={() => router.push(`/seeker/jobs/${job.id}/chat` as Route)}
			/>
		</>
	);
}

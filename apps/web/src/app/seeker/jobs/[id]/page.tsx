"use client";

import type { Route } from "next";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { ReportDialog } from "@/components/bambi/report-dialog";
import { SeekerJobDetailResponsive } from "@/components/bambi/screens/seeker-job-detail-responsive";
import { isApiJobId, useMarketplaceJob } from "@/lib/bambi/api-jobs";

export default function SeekerJobPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { isError, isLoading, job, refetch } = useMarketplaceJob(id);
	const { role } = useBambiAuth();
	// 채팅 진입은 구직자만 가능하다(/seeker/jobs/[id]/chat 서버 가드와 같은 기준).
	// 역할을 아직 못 읽은 동안(role null)에는 감춰 두는 쪽이 안전하다 — 눌렀다가
	// 가드에 튕기는 것보다 잠깐 안 보이는 편이 낫다.
	const canStartChat = role === "job_seeker";
	const [isReportOpen, setIsReportOpen] = useState(false);
	// 상세로 들어왔는데 목록에서 내려둔 스크롤 위치가 그대로 남는 문제를 막는다.
	// App Router의 스크롤 초기화는 세그먼트가 처음 커밋될 때 잡은 DOM 노드 하나에만
	// 걸려 있고(layout-router의 findDOMNode + scrollRef), 그 앞 조기 이탈 분기에
	// 걸리면 스크롤을 아예 건드리지 않는다. 하드 로드·하이드레이션 경로에서는 설계상
	// 아무것도 하지 않고 브라우저 복원에 맡긴다. 이 라우트는 어느 경로로 들어오든
	// 공고 맨 위에서 읽기 시작해야 하므로 공고가 바뀔 때마다 직접 최상단으로 올린다.
	// 훅 순서 때문에 아래 isLoading/notFound 조기 반환보다 위에 있어야 한다.
	// biome-ignore lint/correctness/useExhaustiveDependencies: id는 값을 읽으려는 게 아니라 "다른 공고로 바뀌면 다시 올린다"는 재실행 키다(사이드 배너로 상세→상세 이동이 가능하다).
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [id]);
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
				canStartChat={canStartChat}
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

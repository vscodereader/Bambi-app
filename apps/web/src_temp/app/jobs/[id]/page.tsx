"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { formatNullable, formatPay } from "@/lib/bambi-format";
import { jobStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

const getJobStatusLabel = (status: string): string =>
	jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status;

const getJobStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "published") {
		return "good";
	}

	if (status === "pending_review") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "default";
};

const getErrorCode = (error: Error): string | undefined =>
	"code" in error && typeof error.code === "string" ? error.code : undefined;

const getChatStartErrorMessage = (error: Error): string => {
	const errorCode = getErrorCode(error);

	if (errorCode === "FORBIDDEN") {
		return "채팅을 시작할 수 없습니다. 로그인, 휴대폰 인증, 계정 상태를 확인해 주세요.";
	}

	if (errorCode === "UNAUTHORIZED") {
		return "로그인 후 채팅을 시작할 수 있습니다.";
	}

	return error.message;
};

export default function JobDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const router = useRouter();
	const jobQuery = useQuery(
		orpc.bambi.jobs.getById.queryOptions({ input: { id } })
	);
	const startChatMutation = useMutation(
		orpc.bambi.chats.startFromJobPost.mutationOptions({
			onError: (error) => {
				toast.error(getChatStartErrorMessage(error));
			},
			onSuccess: (room) => {
				router.push(`/chats/${room.id}` as Route);
			},
		})
	);

	const post = jobQuery.data;

	const handleStartChat = () => {
		startChatMutation.mutate({ jobPostId: id });
	};

	if (jobQuery.isLoading) {
		return <Loader />;
	}

	if (jobQuery.isError && getErrorCode(jobQuery.error) === "NOT_FOUND") {
		return (
			<PageShell
				description="삭제되었거나 공개 상태가 아닌 공고입니다."
				title="공고 상세"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/jobs"
						>
							공고 목록으로
						</Link>
					}
					description="공개된 공고만 상세 내용을 확인할 수 있습니다."
					title="공고를 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (jobQuery.isError) {
		return (
			<PageShell
				description="공고 상세 정보를 불러오지 못했습니다."
				title="공고 상세"
			>
				<EmptyState
					action={
						<Button onClick={() => jobQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="공고 정보를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (!post) {
		return (
			<PageShell
				description="삭제되었거나 공개 상태가 아닌 공고입니다."
				title="공고 상세"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/jobs"
						>
							공고 목록으로
						</Link>
					}
					description="공개된 공고만 상세 내용을 확인할 수 있습니다."
					title="공고를 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="공고 조건을 확인하고 구인자와 채팅을 시작합니다."
			title="공고 상세"
		>
			<section className="grid gap-5 border p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<div className="min-w-0 space-y-6">
					<div className="space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<StatusBadge tone={getJobStatusTone(post.status)}>
								{getJobStatusLabel(post.status)}
							</StatusBadge>
							<p className="text-muted-foreground text-sm">
								{post.industryCategory} · {post.region}
							</p>
						</div>
						<h1 className="break-words font-semibold text-2xl tracking-normal">
							{post.title}
						</h1>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<h2 className="text-muted-foreground text-xs">급여</h2>
							<p className="mt-1 font-medium text-sm">
								{formatPay(post.payAmount, post.payUnit)}
							</p>
						</div>
						<div>
							<h2 className="text-muted-foreground text-xs">근무 일정</h2>
							<p className="mt-1 break-words text-sm">{post.workSchedule}</p>
						</div>
					</div>

					<div className="space-y-2">
						<h2 className="font-medium text-base">상세 설명</h2>
						<p className="whitespace-pre-wrap break-words text-sm leading-6">
							{post.description}
						</p>
					</div>

					<div className="space-y-2">
						<h2 className="font-medium text-base">면접 안내</h2>
						<p className="whitespace-pre-wrap break-words text-sm leading-6">
							{formatNullable(post.interviewNotes)}
						</p>
					</div>
				</div>

				<aside className="space-y-4 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
					<div>
						<h2 className="font-medium text-base">지원 대화</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							관심 있는 공고라면 채팅으로 상세 조건을 확인해 보세요.
						</p>
					</div>
					<Button
						className="w-full"
						disabled={startChatMutation.isPending}
						onClick={handleStartChat}
						type="button"
					>
						{startChatMutation.isPending ? "채팅 시작 중…" : "채팅 시작"}
					</Button>
					<Link
						className={buttonVariants({
							className: "w-full",
							variant: "outline",
						})}
						href="/jobs"
					>
						목록으로
					</Link>
				</aside>
			</section>
		</PageShell>
	);
}

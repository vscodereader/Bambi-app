"use client";

// 밤비 — 운영자 공고 검수 상세의 결제 상태 관리 패널.
// 검수(승인/반려)와 독립적으로 공고 결제 상태를 수동 전환한다.

import { Button } from "@bambi-app/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatusBadge } from "@/components/bambi/status-badge";
import {
	EXPOSURE_TYPE_LABELS,
	expiryLabel,
	PAYMENT_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

// 운영자 검수 큐 쿼리(moderator-context와 동일 입력)와 캐시를 공유한다.
const MODERATION_QUEUE_INPUT = {
	limit: 50,
	status: "pending_review",
} as const;

type Tone = React.ComponentProps<typeof StatusBadge>["tone"];

const getExpiryTone = (label: string): Tone => {
	if (label === "진행중") {
		return "good";
	}

	if (label === "만료") {
		return "danger";
	}

	return "default";
};

export function ModeratorPaymentPanel({ jobPostId }: { jobPostId: string }) {
	const queryClient = useQueryClient();
	const jobPostsQuery = useQuery(
		orpc.bambi.moderation.listJobPosts.queryOptions({
			input: MODERATION_QUEUE_INPUT,
		})
	);
	const setPaymentMutation = useMutation(
		orpc.bambi.moderation.setJobPostPayment.mutationOptions()
	);
	const post = jobPostsQuery.data?.find((item) => item.id === jobPostId);

	if (!post) {
		return null;
	}

	const isPaid = post.paymentStatus === "paid";
	const nextStatus = isPaid ? "unpaid" : "paid";
	const expiry = expiryLabel(post.exposureEndsAt);
	const days = remainingDays(post.exposureEndsAt);
	const durationText = post.exposureDurationDays
		? `${post.exposureDurationDays}일`
		: "해당 없음";
	const endsAtText = post.exposureEndsAt
		? formatDateTime(post.exposureEndsAt)
		: "-";

	const handleToggle = () => {
		setPaymentMutation.mutate(
			{ jobPostId, paymentStatus: nextStatus },
			{
				onError: () =>
					toast("결제 상태를 변경하지 못했어요. 다시 시도해 주세요."),
				onSuccess: async () => {
					await queryClient.invalidateQueries({
						queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
							input: MODERATION_QUEUE_INPUT,
						}),
					});
					toast(
						nextStatus === "paid"
							? "결제완료로 처리했어요"
							: "미결제로 되돌렸어요"
					);
				},
			}
		);
	};

	return (
		<section className="flex shrink-0 flex-col gap-3 border-border border-t bg-card px-6 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-semibold text-foreground text-sm">
						결제 관리
					</span>
					<StatusBadge tone={isPaid ? "good" : "warning"}>
						{PAYMENT_STATUS_LABELS[post.paymentStatus]}
					</StatusBadge>
					<StatusBadge>{EXPOSURE_TYPE_LABELS[post.exposureType]}</StatusBadge>
					<StatusBadge tone={getExpiryTone(expiry)}>{expiry}</StatusBadge>
				</div>
				<Button
					disabled={setPaymentMutation.isPending}
					onClick={handleToggle}
					type="button"
					variant={isPaid ? "outline" : "default"}
				>
					{isPaid ? "미결제로 되돌리기" : "결제완료 처리"}
				</Button>
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
				<span>이용 기간 {durationText}</span>
				<span>만료일 {endsAtText}</span>
				{days === null ? null : <span>남은 기간 {Math.max(0, days)}일</span>}
			</div>
		</section>
	);
}

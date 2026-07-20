"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { orpc } from "@/utils/orpc";

// 후기 검수 상태 필터. "all"은 서버에 status 미전달(전체 조회)로 매핑한다.
type ReviewFilter = "all" | "published" | "pending_review" | "hidden";
type ReviewStatus = "published" | "pending_review" | "hidden";

const REVIEW_FILTERS: { value: ReviewFilter; label: string }[] = [
	{ value: "all", label: "전체" },
	{ value: "published", label: "게시됨" },
	{ value: "pending_review", label: "검수 대기" },
	{ value: "hidden", label: "숨김" },
];

const REVIEW_STATUS_BADGE: Record<
	ReviewStatus,
	{ label: string; variant: "success" | "warning" | "secondary" }
> = {
	published: { label: "게시됨", variant: "success" },
	pending_review: { label: "검수 대기", variant: "warning" },
	hidden: { label: "숨김", variant: "secondary" },
};

const formatDate = (value: Date | string) =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));

// 별점(1~5)을 채워진 별·빈 별로 표시한다.
function RatingStars({ rating }: { rating: number }) {
	const filled = Math.max(0, Math.min(5, rating));
	return (
		<span
			aria-label={`별점 ${filled}점`}
			className="inline-flex items-center gap-0.5 font-bold text-sm"
			role="img"
		>
			<span className="text-amber-500">{"★".repeat(filled)}</span>
			<span className="text-muted-foreground">{"★".repeat(5 - filled)}</span>
		</span>
	);
}

// 인라인 조치 확인 대상(어떤 후기를 어떤 상태로 바꾸는지).
interface PendingAction {
	label: string;
	reviewId: string;
	status: ReviewStatus;
}

export default function ModeratorReviewsPage() {
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<ReviewFilter>("all");
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [reason, setReason] = useState("");

	const reviewsQuery = useQuery(
		orpc.bambi.moderation.listReviews.queryOptions({
			input: {
				limit: 50,
				status: filter === "all" ? undefined : filter,
			},
		})
	);
	const setStatus = useMutation(
		orpc.bambi.moderation.setReviewStatus.mutationOptions({
			onSuccess: async () => {
				toast.success("후기 상태를 변경했어요.");
				setPending(null);
				setReason("");
				// 부분 키(status 생략)로 모든 상태 필터 캐시를 함께 무효화한다.
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listReviews.queryKey({
						input: { limit: 50 },
					}),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);

	const reviews = reviewsQuery.data ?? [];
	const canConfirm = reason.trim().length >= 2 && !setStatus.isPending;

	const openAction = (action: PendingAction) => {
		setPending(action);
		setReason("");
	};

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">후기 관리</h1>
			<Tabs
				onValueChange={(value) => setFilter(value as ReviewFilter)}
				value={filter}
			>
				<TabsList className="max-w-full flex-wrap">
					{REVIEW_FILTERS.map((option) => (
						<TabsTrigger key={option.value} value={option.value}>
							{option.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			{reviews.length === 0 ? (
				<EmptyState
					description="선택한 상태에 해당하는 후기가 없어요."
					title="표시할 후기가 없어요"
				/>
			) : null}
			{reviews.map((item) => {
				const badge = REVIEW_STATUS_BADGE[item.status];
				const isPendingRow = pending?.reviewId === item.id;
				return (
					<Card key={item.id}>
						<CardHeader className="gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<RatingStars rating={item.rating} />
								<Badge variant={badge.variant}>{badge.label}</Badge>
								<span className="ml-auto text-muted-foreground text-xs">
									{formatDate(item.createdAt)}
								</span>
							</div>
							<CardTitle className="text-base">{item.jobPostTitle}</CardTitle>
							<p className="m-0 text-muted-foreground text-sm">
								{item.organizationDisplayName} · 작성자{" "}
								{item.reviewerDisplayName ?? "익명"}
							</p>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<p className="m-0 whitespace-pre-wrap text-foreground text-sm leading-relaxed">
								{item.body}
							</p>
							{isPendingRow ? (
								<div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
									<label
										className="font-bold text-foreground text-sm"
										htmlFor={`reason-${item.id}`}
									>
										{pending.label} 사유 (2자 이상)
									</label>
									<Textarea
										id={`reason-${item.id}`}
										onChange={(event) => setReason(event.target.value)}
										placeholder="조치 사유를 입력하면 감사 로그에 남아요."
										value={reason}
									/>
									<div className="flex justify-end gap-2">
										<Button
											disabled={setStatus.isPending}
											onClick={() => {
												setPending(null);
												setReason("");
											}}
											size="sm"
											variant="ghost"
										>
											취소
										</Button>
										<Button
											disabled={!canConfirm}
											onClick={() =>
												setStatus.mutate({
													reason: reason.trim(),
													reviewId: pending.reviewId,
													status: pending.status,
												})
											}
											size="sm"
											variant={
												pending.status === "hidden" ? "destructive" : "outline"
											}
										>
											{pending.label} 확정
										</Button>
									</div>
								</div>
							) : (
								<div className="flex flex-wrap justify-end gap-2">
									{item.status === "published" ? null : (
										<Button
											onClick={() =>
												openAction({
													label:
														item.status === "hidden" ? "게시 복원" : "게시",
													reviewId: item.id,
													status: "published",
												})
											}
											size="sm"
											variant="outline"
										>
											{item.status === "hidden" ? "게시 복원" : "게시"}
										</Button>
									)}
									{item.status === "hidden" ? null : (
										<Button
											onClick={() =>
												openAction({
													label: "숨김",
													reviewId: item.id,
													status: "hidden",
												})
											}
											size="sm"
											variant="destructive"
										>
											숨김
										</Button>
									)}
								</div>
							)}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}

"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Button } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { isApiJobId } from "@/lib/bambi/api-jobs";
import { formatDate } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";
import { EmptyState } from "./empty-state";
import { RatingStars } from "./rating-stars";

const PAGE_SIZE = 5;

interface JobReviewSectionProps {
	jobPostId: string;
	ratingAverage: number;
	reviewCount: number;
}

// 공고 상세의 후기 본문 목록. 회원 전용(서버 requireActiveBambiProfile)이며 게시된
// 후기만 노출한다. 작성자는 익명 또는 마스킹된 표시명으로만 내려온다.
// "더보기"는 offset 누적(useInfiniteQuery)으로 처리해 개수 제한 없이 이어 볼 수 있다.
export function JobReviewSection({
	jobPostId,
	ratingAverage,
	reviewCount,
}: JobReviewSectionProps) {
	const canQuery = isApiJobId(jobPostId);
	const [unlocked, setUnlocked] = useState(
		new Map<string, { body: string; rating: number }>()
	);
	const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
	const unlockMutation = useMutation(
		orpc.bambi.reviews.unlock.mutationOptions({
			onError: (error) => toast.error(error.message || "후기를 열지 못했어요."),
			onSuccess: (data, variables) => {
				setUnlocked((current) =>
					new Map(current).set(variables.reviewId, data)
				);
				setPendingReviewId(null);
			},
		})
	);
	const reviewsQuery = useInfiniteQuery({
		...orpc.bambi.reviews.listByJobPost.infiniteOptions({
			getNextPageParam: (lastPage, _allPages, lastOffset) =>
				lastPage.hasMore ? lastOffset + PAGE_SIZE : undefined,
			initialPageParam: 0,
			input: (offset: number) => ({ jobPostId, limit: PAGE_SIZE, offset }),
		}),
		enabled: canQuery,
	});

	// 목업(비-uuid) 공고는 실제 후기가 없으므로 섹션 자체를 감춘다.
	if (!canQuery) {
		return null;
	}

	// 페이지 사이에 새 후기가 끼어들면 offset이 밀려 같은 후기가 중복될 수 있어 id로 걸러낸다.
	const items = [
		...new Map(
			(reviewsQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
				(item) => [item.id, item] as const
			)
		).values(),
	];
	const reviewViewPoints = reviewsQuery.data?.pages[0]?.reviewViewPoints ?? 0;

	return (
		<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="m-0 font-extrabold text-xl">후기</h2>
				{reviewCount > 0 ? (
					<div className="flex items-center gap-2">
						<RatingStars rating={ratingAverage} />
						<span className="font-bold text-sm">
							{ratingAverage.toFixed(1)}
						</span>
						<span className="text-muted-foreground text-sm">
							후기 {reviewCount}개
						</span>
					</div>
				) : null}
			</div>

			{reviewsQuery.isError ? (
				<p className="mt-4 mb-0 text-muted-foreground text-sm">
					후기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
				</p>
			) : null}

			{!reviewsQuery.isError && items.length === 0 && reviewsQuery.isLoading ? (
				<p className="mt-4 mb-0 text-muted-foreground text-sm">
					후기를 불러오고 있어요.
				</p>
			) : null}

			{!(reviewsQuery.isError || reviewsQuery.isLoading) &&
			items.length === 0 ? (
				<EmptyState
					className="mt-2"
					description="면접을 마친 구직자가 남긴 후기가 여기에 표시돼요."
					title="아직 후기가 없어요"
				/>
			) : null}

			{items.length > 0 ? (
				<ul className="mt-4 grid list-none gap-3 p-0">
					{items.map((item) => {
						const paid = unlocked.get(item.id);
						const body = item.body ?? paid?.body ?? null;
						const rating = item.rating ?? paid?.rating ?? null;
						return (
							<li
								className="rounded-lg border border-border bg-background"
								key={item.id}
							>
								<button
									className="w-full cursor-pointer p-4 text-left disabled:cursor-default"
									disabled={!item.locked || Boolean(paid)}
									onClick={() => {
										if (item.locked && !paid) {
											setPendingReviewId(item.id);
										}
									}}
									type="button"
								>
									<div className="flex flex-wrap items-center gap-2">
										{rating === null ? null : (
											<RatingStars
												className={cn(
													"transition-opacity",
													item.locked &&
														!paid &&
														"select-none opacity-35 blur-[1px]"
												)}
												rating={rating}
											/>
										)}
										<span className="font-bold text-foreground text-sm">
											{item.reviewerDisplayName}
										</span>
										<span className="ml-auto text-muted-foreground text-xs">
											{formatDate(item.createdAt)}
										</span>
									</div>
									{body === null ? (
										<p className="mt-2 mb-0 select-none text-sm blur-md">
											후기를 확인하려면 포인트를 사용해 주세요.
										</p>
									) : (
										<p className="mt-2 mb-0 whitespace-pre-wrap text-foreground text-sm leading-relaxed">
											{body}
										</p>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			) : null}

			{reviewsQuery.hasNextPage ? (
				<div className="mt-4 flex justify-center">
					<Button
						disabled={reviewsQuery.isFetchingNextPage}
						onClick={() => reviewsQuery.fetchNextPage()}
						variant="outline"
					>
						{reviewsQuery.isFetchingNextPage ? "불러오는 중" : "후기 더보기"}
					</Button>
				</div>
			) : null}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingReviewId(null);
					}
				}}
				open={pendingReviewId !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>후기를 확인할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							<span className="block">
								후기를 확인하기 위해서는 {reviewViewPoints}pt를 사용해야합니다!
							</span>
							<span className="block whitespace-nowrap text-xs sm:text-sm">
								이 페이지를 나갔다 오시면 다시 포인트를 사용하셔야 해요.
							</span>
							<span className="block">꼼꼼히 확인하세요!</span>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={unlockMutation.isPending}
							onClick={() => {
								if (pendingReviewId) {
									unlockMutation.mutate({ reviewId: pendingReviewId });
								}
							}}
						>
							확인
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}

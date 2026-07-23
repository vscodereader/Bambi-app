"use client";

import { Button } from "@bambi-app/ui/components/button";
import { useInfiniteQuery } from "@tanstack/react-query";
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
					{items.map((item) => (
						<li
							className="rounded-lg border border-border bg-background p-4"
							key={item.id}
						>
							<div className="flex flex-wrap items-center gap-2">
								<RatingStars rating={item.rating} />
								<span className="font-bold text-foreground text-sm">
									{item.reviewerDisplayName}
								</span>
								<span className="ml-auto text-muted-foreground text-xs">
									{formatDate(item.createdAt)}
								</span>
							</div>
							<p className="mt-2 mb-0 whitespace-pre-wrap text-foreground text-sm leading-relaxed">
								{item.body}
							</p>
						</li>
					))}
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
		</section>
	);
}

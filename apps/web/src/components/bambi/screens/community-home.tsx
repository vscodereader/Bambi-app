"use client";

// 수다방 홈 — 게시판별 최신 글 미리보기 인덱스(레퍼런스: 커뮤니티 인덱스형 홈).

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
	ChevronRightIcon,
	LockIcon,
	MegaphoneIcon,
	MessageSquareIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	COMMUNITY_BOARDS,
	type CommunityBoardKey,
	communityBoardPath,
	communityPostPath,
	formatCommunityDate,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

interface OverviewPost {
	authorName: string | null;
	board: "free" | "market" | "notice" | "work_talk";
	commentCount: number;
	createdAt: Date | string;
	id: string;
	isLocked: boolean;
	likeCount: number;
	title: string;
	viewCount: number;
}

// 게시판별 액센트 바 — visual-job-exposure-sections의 섹션 헤더 문법을 따른다.
const accentClassName: Record<CommunityBoardKey, string> = {
	best: "bg-coral-500",
	free: "bg-sky-400",
	market: "bg-green-500",
	notice: "bg-coral-500",
	work_talk: "bg-amber-500",
};

function BoardPreviewCard({
	boardKey,
	className,
	posts,
}: {
	boardKey: CommunityBoardKey;
	className?: string;
	posts: OverviewPost[];
}) {
	const board = COMMUNITY_BOARDS.find((item) => item.key === boardKey);
	if (!board) {
		return null;
	}

	const isNotice = boardKey === "notice";

	return (
		<Card className={cn(isNotice && "border-coral-500/60", className)}>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="flex items-center gap-2 text-base">
					{isNotice ? (
						<MegaphoneIcon className="size-4 shrink-0 text-coral-500" />
					) : (
						<span
							className={cn("h-4 w-1 rounded-full", accentClassName[boardKey])}
						/>
					)}
					{board.label}
				</CardTitle>
				<Link
					className="flex items-center gap-1 font-semibold text-muted-foreground text-xs hover:text-foreground"
					href={communityBoardPath(board.slug) as Route}
				>
					더보기
					<ChevronRightIcon className="size-3" />
				</Link>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{posts.length === 0 ? (
					<p className="m-0 py-3 text-muted-foreground text-sm">
						아직 글이 없어요. 첫 글을 남겨보세요.
					</p>
				) : (
					posts.map((post) => {
						const boardOfPost = COMMUNITY_BOARDS.find(
							(item) => item.key === post.board
						);
						return (
							<Link
								className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted"
								href={
									communityPostPath(
										boardOfPost?.slug ?? board.slug,
										post.id
									) as Route
								}
								key={post.id}
							>
								<span className="flex min-w-0 items-center gap-1.5">
									{post.isLocked ? (
										<LockIcon className="size-3 shrink-0 text-muted-foreground" />
									) : null}
									<span className="truncate text-sm">{post.title}</span>
									{post.commentCount > 0 ? (
										<span className="flex shrink-0 items-center gap-0.5 font-semibold text-coral-500 text-xs">
											<MessageSquareIcon className="size-3" />
											{post.commentCount}
										</span>
									) : null}
								</span>
								<span className="shrink-0 text-muted-foreground text-xs">
									{post.authorName ?? COMMUNITY_AUTHOR_FALLBACK} ·{" "}
									{formatCommunityDate(post.createdAt)}
								</span>
							</Link>
						);
					})
				)}
			</CardContent>
		</Card>
	);
}

function BoardPreviewSkeleton() {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-24" />
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<Skeleton className="h-5 w-full" />
				<Skeleton className="h-5 w-4/5" />
				<Skeleton className="h-5 w-3/5" />
			</CardContent>
		</Card>
	);
}

export function CommunityHomeScreen() {
	const overviewQuery = useQuery(orpc.bambi.community.overview.queryOptions());

	if (overviewQuery.isError) {
		return (
			<EmptyState
				className="flex-1"
				description="수다방 글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
				title="불러오기 실패"
			/>
		);
	}

	const data = overviewQuery.data;
	const postsByBoard: Record<CommunityBoardKey, OverviewPost[]> = {
		best: data?.best ?? [],
		free: data?.free ?? [],
		market: data?.market ?? [],
		notice: data?.notice ?? [],
		work_talk: data?.workTalk ?? [],
	};
	// 공지사항은 최상단 전폭 섹션으로 따로 렌더하고, 나머지는 2열 그리드로 배치한다.
	const gridBoards = COMMUNITY_BOARDS.filter((board) => board.key !== "notice");
	const noticePosts = postsByBoard.notice;

	return (
		<div className="flex flex-col gap-4">
			<h1 className="m-0 font-extrabold text-xl">수다방</h1>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{overviewQuery.isPending ? (
					gridBoards.map((board) => <BoardPreviewSkeleton key={board.key} />)
				) : (
					<>
						{noticePosts.length > 0 ? (
							<BoardPreviewCard
								boardKey="notice"
								className="md:col-span-2"
								posts={noticePosts}
							/>
						) : null}
						{gridBoards.map((board) => (
							<BoardPreviewCard
								boardKey={board.key}
								key={board.key}
								posts={postsByBoard[board.key]}
							/>
						))}
					</>
				)}
			</div>
		</div>
	);
}

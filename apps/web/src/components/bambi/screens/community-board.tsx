"use client";

// 게시판 목록 — 글 행 리스트 + 번호 페이지네이션(?page= URL 동기화) + 글쓰기 버튼.

import { Button } from "@bambi-app/ui/components/button";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@bambi-app/ui/components/pagination";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
	EyeIcon,
	LockIcon,
	MessageSquareIcon,
	PencilLineIcon,
	ThumbsUpIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, type MouseEvent } from "react";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	communityPostPath,
	communityWritePath,
	formatCommunityDate,
	getBoardBySlug,
	getCommunityPageItems,
	getCommunityTotalPages,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

interface BoardPostItem {
	authorName: string | null;
	commentCount: number;
	createdAt: Date | string;
	id: string;
	isLocked: boolean;
	likeCount: number;
	title: string;
	viewCount: number;
}

function BoardPostRow({
	boardSlug,
	post,
}: {
	boardSlug: string;
	post: BoardPostItem;
}) {
	return (
		<Link
			className="flex flex-col gap-1 rounded-lg px-2 py-3 hover:bg-muted"
			href={communityPostPath(boardSlug, post.id) as Route}
		>
			<span className="flex min-w-0 items-center gap-1.5">
				{post.isLocked ? (
					<LockIcon className="size-3 shrink-0 text-muted-foreground" />
				) : null}
				<span className="truncate font-semibold text-sm">{post.title}</span>
				{post.commentCount > 0 ? (
					<span className="flex shrink-0 items-center gap-0.5 font-semibold text-coral-500 text-xs">
						<MessageSquareIcon className="size-3" />
						{post.commentCount}
					</span>
				) : null}
			</span>
			<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
				<span>{post.authorName ?? COMMUNITY_AUTHOR_FALLBACK}</span>
				<span>{formatCommunityDate(post.createdAt)}</span>
				<span className="flex items-center gap-0.5">
					<EyeIcon className="size-3" />
					{post.viewCount}
				</span>
				<span className="flex items-center gap-0.5">
					<ThumbsUpIcon className="size-3" />
					{post.likeCount}
				</span>
			</span>
		</Link>
	);
}

function BoardPagination({
	onNavigate,
	page,
	pageHref,
	totalPages,
}: {
	onNavigate: (event: MouseEvent<HTMLAnchorElement>, nextPage: number) => void;
	page: number;
	pageHref: (nextPage: number) => Route;
	totalPages: number;
}) {
	const pageItems = getCommunityPageItems(page, totalPages);

	return (
		<Pagination>
			<PaginationContent>
				<PaginationItem>
					<PaginationPrevious
						aria-disabled={page <= 1}
						className={page <= 1 ? "pointer-events-none opacity-50" : ""}
						href={pageHref(Math.max(1, page - 1))}
						onClick={(event) => onNavigate(event, Math.max(1, page - 1))}
					/>
				</PaginationItem>
				{pageItems.map((item) =>
					typeof item === "number" ? (
						<PaginationItem key={item}>
							<PaginationLink
								href={pageHref(item)}
								isActive={item === page}
								onClick={(event) => onNavigate(event, item)}
							>
								{item}
							</PaginationLink>
						</PaginationItem>
					) : (
						<PaginationItem key={item}>
							<PaginationEllipsis />
						</PaginationItem>
					)
				)}
				<PaginationItem>
					<PaginationNext
						aria-disabled={page >= totalPages}
						className={
							page >= totalPages ? "pointer-events-none opacity-50" : ""
						}
						href={pageHref(Math.min(totalPages, page + 1))}
						onClick={(event) =>
							onNavigate(event, Math.min(totalPages, page + 1))
						}
					/>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}

export function CommunityBoardScreen({ boardSlug }: { boardSlug: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const board = getBoardBySlug(boardSlug);
	const pageParam = Number(searchParams.get("page"));
	const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

	const listQuery = useQuery(
		orpc.bambi.community.listPosts.queryOptions({
			enabled: Boolean(board),
			input: { board: board?.key ?? "free", page },
		})
	);

	if (!board) {
		return null;
	}

	// 페이지 이동은 실제 앵커(href)로 접근성을 유지하되, 클릭 시 router.replace로
	// ?page= 쿼리만 교체해 히스토리를 늘리지 않는다.
	const pageHref = (nextPage: number) =>
		`${pathname}?page=${nextPage}` as Route;
	const goToPage = (event: MouseEvent<HTMLAnchorElement>, nextPage: number) => {
		event.preventDefault();
		router.replace(pageHref(nextPage));
	};

	const totalPages = getCommunityTotalPages(
		listQuery.data?.totalCount ?? 0,
		listQuery.data?.pageSize ?? 20
	);
	const items = listQuery.data?.items ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="m-0 font-extrabold text-xl">{board.label}</h1>
					<p className="m-0 text-muted-foreground text-sm">
						{board.description}
					</p>
				</div>
				{board.writable ? (
					<Button
						render={
							<Link href={communityWritePath(board.slug) as Route}>
								<PencilLineIcon data-icon="inline-start" />
								글쓰기
							</Link>
						}
					/>
				) : null}
			</div>

			{listQuery.isPending ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			) : null}

			{listQuery.isError ? (
				<EmptyState
					className="flex-1"
					description="글 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{listQuery.isSuccess && items.length === 0 ? (
				<EmptyState
					className="flex-1"
					description={
						board.writable
							? "아직 글이 없어요. 첫 글을 남겨보세요."
							: "최근 30일 추천 글이 아직 없어요."
					}
					title="글이 없어요"
				/>
			) : null}

			{items.length > 0 ? (
				<div className="flex flex-col">
					{items.map((post, index) => (
						<Fragment key={post.id}>
							{index > 0 ? <Separator /> : null}
							<BoardPostRow boardSlug={board.slug} post={post} />
						</Fragment>
					))}
				</div>
			) : null}

			{listQuery.isSuccess && totalPages > 1 ? (
				<BoardPagination
					onNavigate={goToPage}
					page={page}
					pageHref={pageHref}
					totalPages={totalPages}
				/>
			) : null}
		</div>
	);
}

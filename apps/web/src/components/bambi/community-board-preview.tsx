"use client";

// 게시판별 최신 글 미리보기 카드 — 수다방 홈과 seeker 홈 커뮤니티 섹션이 공유한다.

import type { AppRouter } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import type { InferRouterOutputs } from "@orpc/server";
import {
	ChevronRightIcon,
	LockIcon,
	MegaphoneIcon,
	MessageSquareIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import {
	CommunityNewBadge,
	CommunityRoleBadges,
} from "@/components/bambi/community-post-badges";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	COMMUNITY_BOARDS,
	type CommunityBoardKey,
	communityBoardPath,
	communityCrawledPath,
	communityPostPath,
	formatCommunityDate,
} from "@/lib/bambi/community";

// 서버 응답과의 드리프트를 막기 위해 oRPC 추론 출력에서 미리보기 글 타입을 파생한다.
export type OverviewPost =
	InferRouterOutputs<AppRouter>["bambi"]["community"]["overview"]["free"][number];

// 게시판별 액센트 바 — visual-job-exposure-sections의 섹션 헤더 문법을 따른다.
export const accentClassName: Record<CommunityBoardKey, string> = {
	best: "bg-coral-500",
	free: "bg-sky-400",
	legal: "bg-violet-500",
	market: "bg-green-500",
	notice: "bg-coral-500",
	work_talk: "bg-amber-500",
};

// 글 행 오른쪽 메타. 반폭 카드(compact)는 작성인을 접고 날짜만 남긴다 — 좁은 칸에서
// 제목이 두어 글자로 잘리는 걸 막는다.
const postMetaText = (post: OverviewPost, compact: boolean): string =>
	compact
		? formatCommunityDate(post.createdAt)
		: `${post.authorName ?? COMMUNITY_AUTHOR_FALLBACK} · ${formatCommunityDate(post.createdAt)}`;

export function BoardPreviewCard({
	boardKey,
	className,
	compact = false,
	emptyText,
	onBlockedNavigate,
	posts,
}: {
	boardKey: CommunityBoardKey;
	className?: string;
	// 반폭 칸(중고거래·법률 자문)에 들어가는 카드. 제목이 설 자리를 남기려고 작성인을
	// 접고 날짜만 남긴다 — 좁은 칸에서 제목이 두어 글자로 잘리는 걸 막는다.
	compact?: boolean;
	// 지정 시 수다방으로 가는 링크(글·더보기) 클릭을 가로채 목적지를 넘긴다 — 미자격자
	// 홈 미리보기용. 안내 방식(토스트·본인인증 다이얼로그)은 호출한 화면이 정한다.
	onBlockedNavigate?: (href: string) => void;
	// 빈 상태 문구 — 미지정 시 기존 "첫 글" 안내를 그대로 쓴다(운영자 전용 게시판은 별도 문구 주입).
	emptyText?: string;
	posts: OverviewPost[];
}) {
	const board = COMMUNITY_BOARDS.find((item) => item.key === boardKey);
	if (!board) {
		return null;
	}

	const isNotice = boardKey === "notice";

	return (
		<Card
			className={cn(
				isNotice && "border-coral-500/60 bg-coral-50/50",
				className
			)}
		>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle
					className={cn(
						"flex items-center gap-2 text-base",
						isNotice && "text-coral-600"
					)}
				>
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
					onClick={(event) => {
						if (onBlockedNavigate) {
							event.preventDefault();
							onBlockedNavigate(communityBoardPath(board.slug));
						}
					}}
				>
					더보기
					<ChevronRightIcon className="size-3" />
				</Link>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{posts.length === 0 ? (
					<p className="m-0 py-3 text-muted-foreground text-sm">
						{emptyText ?? "아직 글이 없어요. 첫 글을 남겨보세요."}
					</p>
				) : (
					posts.map((post) => {
						const boardOfPost = COMMUNITY_BOARDS.find(
							(item) => item.key === post.board
						);
						// 수집 글은 전용 상세로 분기한다(순수 글은 기존 게시판 상세 경로 그대로).
						const isCrawled = post.source === "crawled";
						const href = isCrawled
							? communityCrawledPath(post.id)
							: communityPostPath(boardOfPost?.slug ?? board.slug, post.id);
						return (
							<Link
								className={cn(
									"flex items-center justify-between gap-3 rounded-lg px-2 py-1.5",
									isNotice ? "hover:bg-coral-100/60" : "hover:bg-muted"
								)}
								href={href as Route}
								key={post.id}
								onClick={(event) => {
									if (onBlockedNavigate) {
										event.preventDefault();
										onBlockedNavigate(href);
									}
								}}
							>
								<span className="flex min-w-0 items-center gap-1.5">
									{post.isLocked ? (
										<LockIcon className="size-3 shrink-0 text-muted-foreground" />
									) : null}
									{isCrawled ? (
										<Badge className="shrink-0" variant="secondary">
											외부 수집
										</Badge>
									) : null}
									{isNotice ? null : <CommunityRoleBadges post={post} />}
									<CommunityNewBadge createdAt={post.createdAt} />
									<span className="truncate text-sm">{post.title}</span>
									{post.commentCount > 0 ? (
										<span className="flex shrink-0 items-center gap-0.5 font-semibold text-coral-500 text-xs">
											<MessageSquareIcon className="size-3" />
											{post.commentCount}
										</span>
									) : null}
								</span>
								<span className="shrink-0 text-muted-foreground text-xs">
									{postMetaText(post, compact)}
								</span>
							</Link>
						);
					})
				)}
			</CardContent>
		</Card>
	);
}

// 중고거래·무료 법률 자문은 2열 그리드의 한 칸을 좌우로 나눠 쓴다(모바일은 세로 스택).
// 글이 적은 두 게시판이라 각각 한 칸씩 차지하면 홈에서 빈 카드가 두 줄로 늘어진다.
const PAIRED_BOARD_KEYS: CommunityBoardKey[] = ["market", "legal"];

// 수다방 홈과 seeker 홈 커뮤니티 섹션이 공유하는 미리보기 배치. 공지사항은 글 유무와
// 무관하게 항상 최상단 전폭, 나머지 게시판은 그 아래 2열 그리드. 두 화면이 각자 배치를
//들고 있어 홈과 수다방의 같은 섹션이 서로 다르게 보이던 걸 한 컴포넌트로 모은다.
export function CommunityOverviewGrid({
	isPending,
	onBlockedNavigate,
	postsByBoard,
}: {
	isPending: boolean;
	// BoardPreviewCard와 같은 의미 — 지정 시 수다방 링크를 가로채 호출한 화면이 안내한다.
	onBlockedNavigate?: (href: string) => void;
	postsByBoard: Record<CommunityBoardKey, OverviewPost[]>;
}) {
	const soloBoards = COMMUNITY_BOARDS.filter(
		(board) => board.key !== "notice" && !PAIRED_BOARD_KEYS.includes(board.key)
	);

	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
			{isPending ? (
				<>
					<BoardPreviewSkeleton className="md:col-span-2" />
					{soloBoards.map((board) => (
						<BoardPreviewSkeleton key={board.key} />
					))}
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{PAIRED_BOARD_KEYS.map((key) => (
							<BoardPreviewSkeleton key={key} />
						))}
					</div>
				</>
			) : (
				<>
					<BoardPreviewCard
						boardKey="notice"
						className="md:col-span-2"
						emptyText="등록된 공지사항이 없어요."
						onBlockedNavigate={onBlockedNavigate}
						posts={postsByBoard.notice}
					/>
					{soloBoards.map((board) => (
						<BoardPreviewCard
							boardKey={board.key}
							key={board.key}
							onBlockedNavigate={onBlockedNavigate}
							posts={postsByBoard[board.key]}
						/>
					))}
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{PAIRED_BOARD_KEYS.map((key) => (
							<BoardPreviewCard
								boardKey={key}
								compact
								key={key}
								onBlockedNavigate={onBlockedNavigate}
								posts={postsByBoard[key]}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}

export function BoardPreviewSkeleton({ className }: { className?: string }) {
	return (
		<Card className={className}>
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

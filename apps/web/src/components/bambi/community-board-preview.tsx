"use client";

// 게시판별 최신 글 미리보기 카드 — 수다방 홈과 seeker 홈 커뮤니티 섹션이 공유한다.

import type { AppRouter } from "@bambi-app/api/routers/index";
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
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { toast } from "sonner";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import {
	CommunityNewBadge,
	CommunityRoleBadges,
} from "@/components/bambi/community-post-badges";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	COMMUNITY_BOARDS,
	communityBoardPath,
	communityCrawledPath,
	communityPostPath,
	formatCommunityDate,
	isLegalAdvisorAllowedPath,
	LEGAL_ADVISOR_BOARD_NOTICE,
} from "@/lib/bambi/community";
import { communityBoardIcon } from "@/lib/bambi/community-board-icons";
import { trackNavigationClick } from "@/lib/bambi/ga-interaction";

// 서버 응답과의 드리프트를 막기 위해 oRPC 추론 출력에서 미리보기 게시판·글 타입을 파생한다.
// overview는 고정 키 객체가 아니라 배열이다 — 운영자가 게시판을 늘리면 그대로 따라 붙는다.
export type OverviewBoard =
	InferRouterOutputs<AppRouter>["bambi"]["community"]["overview"]["boards"][number];

export type OverviewPost = OverviewBoard["posts"][number];

// 게시판별 액센트 바 — visual-job-exposure-sections의 섹션 헤더 문법을 따른다.
// 운영자가 추가한 게시판은 여기 없으므로 중립 색으로 폴백한다.
export const accentClassName: Record<string, string> = {
	best: "bg-coral-500",
	free: "bg-sky-400",
	legal: "bg-violet-500",
	market: "bg-green-500",
	notice: "bg-coral-500",
	work_talk: "bg-amber-500",
};

const DEFAULT_ACCENT_CLASS = "bg-muted-foreground";

// 글 행 오른쪽 메타. 반폭 카드(compact)는 작성인을 접고 날짜만 남긴다 — 좁은 칸에서
// 제목이 두어 글자로 잘리는 걸 막는다.
const postMetaText = (post: OverviewPost, compact: boolean): string =>
	compact
		? formatCommunityDate(post.createdAt)
		: `${post.authorName ?? COMMUNITY_AUTHOR_FALLBACK} · ${formatCommunityDate(post.createdAt)}`;

// 카드 제목 앞 표식 — 운영자가 지정한 아이콘 > 공지 확성기 > 게시판 액센트 바 순으로
// 하나만 그린다. 아이콘 미지정(빌트인 기본값)이면 기존 모양이 그대로 남는다.
function BoardTitleMark({
	boardKey,
	icon,
}: {
	boardKey: string;
	icon: string | null;
}) {
	const BoardIcon = communityBoardIcon(icon);

	if (BoardIcon) {
		return <BoardIcon className="size-4 shrink-0 text-coral-500" />;
	}
	if (boardKey === "notice") {
		return <MegaphoneIcon className="size-4 shrink-0 text-coral-500" />;
	}
	return (
		<span
			className={cn(
				"h-4 w-1 rounded-full",
				accentClassName[boardKey] ?? DEFAULT_ACCENT_CLASS
			)}
		/>
	);
}

export function BoardPreviewCard({
	analyticsSurface,
	board,
	className,
	compact = false,
	emptyText,
	onBlockedNavigate,
}: {
	analyticsSurface?: "seeker_home_community";
	board: OverviewBoard;
	className?: string;
	// 반폭 칸(중고거래·법률 자문)에 들어가는 카드. 제목이 설 자리를 남기려고 작성인을
	// 접고 날짜만 남긴다 — 좁은 칸에서 제목이 두어 글자로 잘리는 걸 막는다.
	compact?: boolean;
	// 지정 시 수다방으로 가는 링크(글·더보기) 클릭을 가로채 목적지를 넘긴다 — 미자격자
	// 홈 미리보기용. 안내 방식(토스트·본인인증 다이얼로그)은 호출한 화면이 정한다.
	onBlockedNavigate?: (href: string) => void;
	// 빈 상태 문구 — 미지정 시 기존 "첫 글" 안내를 그대로 쓴다(운영자 전용 게시판은 별도 문구 주입).
	emptyText?: string;
}) {
	const posts = board.posts;
	const isNotice = board.key === "notice";

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
					<BoardTitleMark boardKey={board.key} icon={board.icon} />
					{board.label}
				</CardTitle>
				<Link
					className="flex items-center gap-1 font-semibold text-muted-foreground text-xs hover:text-foreground"
					href={communityBoardPath(board.slug) as Route}
					onClick={(event) => {
						if (analyticsSurface) {
							trackNavigationClick({
								contentId: board.key,
								linkType: "board_more",
							});
						}
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
						// 베스트 카드에는 다른 게시판 글이 섞이므로 글의 게시판 slug로 링크를 만든다.
						// 레거시 key(work_talk↔work-talk)만 빌트인 메타로 되짚고, 운영자가 만든
						// 게시판은 key가 곧 slug라 원값을 그대로 쓴다.
						const slugOfPost =
							COMMUNITY_BOARDS.find((item) => item.key === post.board)?.slug ??
							post.board;
						// 수집 글은 전용 상세로 분기한다(순수 글은 기존 게시판 상세 경로 그대로).
						// 출처 배지는 달지 않는다 — 라우팅 판별에만 쓰는 값이다.
						const isCrawled = post.source === "crawled";
						const href = isCrawled
							? communityCrawledPath(post.id)
							: communityPostPath(slugOfPost, post.id);
						return (
							<Link
								className={cn(
									"flex items-center justify-between gap-3 rounded-lg px-2 py-1.5",
									isNotice ? "hover:bg-coral-100/60" : "hover:bg-muted"
								)}
								href={href as Route}
								key={post.id}
								onClick={(event) => {
									if (analyticsSurface) {
										trackNavigationClick({
											contentId: post.id,
											linkType: "post",
										});
									}
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

// 법률자문 계정용 링크 가드. 다른 게시판 카드는 그대로 보여주되(숨기지 않는다) 눌렀을 때
// legal 게시판·수다방 홈만 통과시키고 나머지는 서버 가드와 같은 문구로 안내한다.
// 반환값은 onBlockedNavigate와 같은 시그니처라 화면이 그대로 넘기면 되고, 법률자문이
// 아니면 undefined라 링크가 평소대로 동작한다.
export function useLegalAdvisorNavGuard():
	| ((href: string) => void)
	| undefined {
	const { role } = useBambiAuth();
	const router = useRouter();

	if (role !== "legal_advisor") {
		return;
	}

	return (href: string) => {
		if (isLegalAdvisorAllowedPath(href)) {
			router.push(href as Route);
			return;
		}
		toast(LEGAL_ADVISOR_BOARD_NOTICE);
	};
}

// 수다방 홈과 seeker 홈 커뮤니티 섹션이 공유하는 미리보기 배치. 공지사항은 글 유무와
// 무관하게 항상 최상단 전폭, 나머지 게시판은 그 아래 2열 그리드. 두 화면이 각자 배치를
//들고 있어 홈과 수다방의 같은 섹션이 서로 다르게 보이던 걸 한 컴포넌트로 모은다.
// 운영자가 추가한 게시판은 서버 순서(sort_order) 그대로 solo 카드로 뒤에 붙는다.
export function CommunityOverviewGrid({
	analyticsSurface,
	boards,
	isPending,
	onBlockedNavigate,
}: {
	analyticsSurface?: "seeker_home_community";
	boards: OverviewBoard[];
	isPending: boolean;
	// BoardPreviewCard와 같은 의미 — 지정 시 수다방 링크를 가로채 호출한 화면이 안내한다.
	onBlockedNavigate?: (href: string) => void;
}) {
	const boardsByRow = new Map<number, OverviewBoard[]>();
	for (const board of boards) {
		boardsByRow.set(board.rowIndex, [
			...(boardsByRow.get(board.rowIndex) ?? []),
			board,
		]);
	}
	const rows = [...boardsByRow.entries()].sort(
		([left], [right]) => left - right
	);

	// 로딩 자리표시자는 실제 게시판 수를 모른다(목록도 같이 오는 중) — 빌트인 배치와
	// 같은 모양으로 자리만 잡아 둔다.
	if (isPending) {
		return (
			<div className="flex flex-col gap-4">
				<BoardPreviewSkeleton />
			</div>
		);
	}

	return (
		<div className="flex w-full min-w-0 max-w-full flex-col gap-4 overflow-x-clip">
			{rows.map(([rowIndex, rowBoards]) => (
				<div
					className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-[repeat(var(--community-row-columns),minmax(0,1fr))]"
					key={rowIndex}
					style={
						{
							"--community-row-columns": rowBoards.length,
						} as CSSProperties
					}
				>
					{rowBoards
						.toSorted((left, right) => left.position - right.position)
						.map((board) => (
							<BoardPreviewCard
								analyticsSurface={analyticsSurface}
								board={board}
								className="w-full min-w-0 max-w-full"
								emptyText={
									board.key === "notice"
										? "등록된 공지사항이 없어요."
										: undefined
								}
								key={board.key}
								onBlockedNavigate={onBlockedNavigate}
							/>
						))}
				</div>
			))}
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

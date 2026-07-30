"use client";

// 게시판 목록 — 글 행 리스트 + 번호 페이지네이션(?page= URL 동기화) + 글쓰기 버튼.

import type { AppRouter } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
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
import { cn } from "@bambi-app/ui/lib/utils";
import type { InferRouterOutputs } from "@orpc/server";
import { useQuery } from "@tanstack/react-query";
import {
	EyeIcon,
	ListFilterIcon,
	LockIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	PencilLineIcon,
	ThumbsUpIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, type MouseEvent, useCallback, useEffect } from "react";
import {
	CommunityNewBadge,
	CommunityRoleBadges,
} from "@/components/bambi/community-post-badges";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	communityCrawledPath,
	communityPostPath,
	communityWritePath,
	formatCommunityDate,
	getBoardBySlug,
	getCommunityPageItems,
	getCommunityTotalPages,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

// 목록 필터는 독립 On/Off 토글 2개(광고 글보기·업소 회원 글보기). 기본은 둘 다 off=전체.
interface CommunityListFilters {
	showEmployer: boolean;
	showPromotion: boolean;
}

// 각 토글은 ?promotion=1 / ?employer=1 로 URL에 반영해 단일 진실원으로 삼는다.
const isFlagOn = (value: string | null): boolean => value === "1";

// 서버 응답과의 드리프트를 막기 위해 oRPC 추론 출력에서 목록 글 타입을 파생한다.
type BoardPostItem =
	InferRouterOutputs<AppRouter>["bambi"]["community"]["listPosts"]["items"][number];

function BoardPostRow({
	boardSlug,
	post,
	showBadges,
}: {
	boardSlug: string;
	post: BoardPostItem;
	showBadges: boolean;
}) {
	// 수집 글은 게시판 상세가 아니라 전용 상세로 분기한다(순수 글은 기존 경로 그대로).
	const isCrawled = post.source === "crawled";

	return (
		<Link
			className="flex flex-col gap-1 rounded-lg px-2 py-3 hover:bg-muted"
			href={
				(isCrawled
					? communityCrawledPath(post.id)
					: communityPostPath(boardSlug, post.id)) as Route
			}
		>
			<span className="flex min-w-0 items-center gap-1.5">
				{post.isLocked ? (
					<LockIcon className="size-3 shrink-0 text-muted-foreground" />
				) : null}
				{post.board === "notice" ? (
					<Badge className="shrink-0">공지</Badge>
				) : null}
				{isCrawled ? (
					<Badge className="shrink-0" variant="secondary">
						외부 수집
					</Badge>
				) : null}
				{showBadges ? <CommunityRoleBadges post={post} /> : null}
				<CommunityNewBadge createdAt={post.createdAt} />
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
	const prevDisabled = page <= 1;
	const nextDisabled = page >= totalPages;
	const prevPage = Math.max(1, page - 1);
	const nextPage = Math.min(totalPages, page + 1);

	return (
		<Pagination>
			<PaginationContent>
				<PaginationItem>
					<PaginationPrevious
						aria-disabled={prevDisabled}
						className={cn(prevDisabled && "pointer-events-none opacity-50")}
						href={pageHref(prevPage)}
						onClick={(event) => {
							if (prevDisabled) {
								event.preventDefault();
								return;
							}
							onNavigate(event, prevPage);
						}}
						tabIndex={prevDisabled ? -1 : undefined}
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
						aria-disabled={nextDisabled}
						className={cn(nextDisabled && "pointer-events-none opacity-50")}
						href={pageHref(nextPage)}
						onClick={(event) => {
							if (nextDisabled) {
								event.preventDefault();
								return;
							}
							onNavigate(event, nextPage);
						}}
						tabIndex={nextDisabled ? -1 : undefined}
					/>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}

const getEmptyDescription = (boardKey: string, canWrite: boolean): string => {
	if (canWrite) {
		return "아직 글이 없어요. 첫 글을 남겨보세요.";
	}
	if (boardKey === "best") {
		return "최근 30일 추천 글이 아직 없어요.";
	}
	return "아직 등록된 글이 없어요.";
};

// 필터 아이콘 버튼 → 드롭다운에서 두 토글을 각각 On/Off. 활성 개수는 배지로 표기한다.
function BoardFilterMenu({
	filters,
	onChange,
}: {
	filters: CommunityListFilters;
	onChange: (next: CommunityListFilters) => void;
}) {
	const activeCount =
		Number(filters.showPromotion) + Number(filters.showEmployer);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button size="sm" variant="outline">
						<ListFilterIcon data-icon="inline-start" />
						필터
						{activeCount > 0 ? (
							<Badge className="ml-0.5" variant="secondary">
								{activeCount}
							</Badge>
						) : null}
					</Button>
				}
			/>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuGroup>
					<DropdownMenuLabel>글 필터</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuCheckboxItem
						checked={filters.showPromotion}
						closeOnClick={false}
						onCheckedChange={(checked) =>
							onChange({ ...filters, showPromotion: checked })
						}
					>
						광고 글보기
					</DropdownMenuCheckboxItem>
					<DropdownMenuCheckboxItem
						checked={filters.showEmployer}
						closeOnClick={false}
						onCheckedChange={(checked) =>
							onChange({ ...filters, showEmployer: checked })
						}
					>
						업소 회원 글보기
					</DropdownMenuCheckboxItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function CommunityBoardScreen({ boardSlug }: { boardSlug: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const board = getBoardBySlug(boardSlug);
	// 필터 토글·페이지 모두 URL 쿼리를 단일 진실원으로 파생한다(뒤로가기 복원 부수 이득).
	const showPromotion = isFlagOn(searchParams.get("promotion"));
	const showEmployer = isFlagOn(searchParams.get("employer"));
	const pageParam = Number(searchParams.get("page"));
	const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

	// 필터 토글·page를 한 번의 replace로 원자적으로 갱신하는 쿼리 경로 빌더.
	const buildHref = useCallback(
		(filters: CommunityListFilters, nextPage: number): Route => {
			const params = new URLSearchParams();
			if (filters.showPromotion) {
				params.set("promotion", "1");
			}
			if (filters.showEmployer) {
				params.set("employer", "1");
			}
			if (nextPage > 1) {
				params.set("page", String(nextPage));
			}
			const query = params.toString();
			return (query ? `${pathname}?${query}` : pathname) as Route;
		},
		[pathname]
	);

	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const isAdmin = mineQuery.data?.bambiProfile?.role === "admin";

	const listQuery = useQuery(
		orpc.bambi.community.listPosts.queryOptions({
			enabled: Boolean(board),
			input: { board: board?.key ?? "free", page, showEmployer, showPromotion },
		})
	);

	const totalPages = getCommunityTotalPages(
		listQuery.data?.totalCount ?? 0,
		listQuery.data?.pageSize ?? 20
	);
	const items = listQuery.data?.items ?? [];

	// 데이터 로드 후 ?page가 마지막 페이지를 넘으면 마지막 페이지로 클램프한다.
	useEffect(() => {
		if (listQuery.isSuccess && page > totalPages) {
			router.replace(buildHref({ showEmployer, showPromotion }, totalPages));
		}
	}, [
		listQuery.isSuccess,
		page,
		totalPages,
		showEmployer,
		showPromotion,
		router,
		buildHref,
	]);

	if (!board) {
		return null;
	}

	// 일반 게시판(자유·일·중고)만 필터를 노출한다. 베스트·공지는 필터 없음.
	const showFilter =
		board.key === "free" || board.key === "work_talk" || board.key === "market";
	// 공지 게시판은 글쓰기가 운영자 전용이라 admin에게만 버튼을 노출한다.
	const canWrite = board.writable && (!board.adminOnly || isAdmin);
	// 공지 게시판은 배지(광고·업소)를 생략한다.
	const showBadges = board.key !== "notice";

	const emptyDescription = getEmptyDescription(board.key, canWrite);

	// 필터 토글 변경 시 page=1 리셋을 한 번의 replace로 원자적으로 처리한다.
	const handleFilterChange = (next: CommunityListFilters) => {
		router.replace(buildHref(next, 1));
	};

	// 페이지 이동은 실제 앵커(href)로 접근성을 유지하되, 클릭 시 router.replace로
	// 쿼리만 교체해 히스토리를 늘리지 않는다.
	const pageHref = (nextPage: number) =>
		buildHref({ showEmployer, showPromotion }, nextPage);
	const goToPage = (event: MouseEvent<HTMLAnchorElement>, nextPage: number) => {
		event.preventDefault();
		router.replace(pageHref(nextPage));
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="m-0 flex items-center gap-2 font-extrabold text-xl">
						{board.key === "notice" ? (
							<MegaphoneIcon className="size-5 shrink-0 text-coral-500" />
						) : null}
						{board.label}
					</h1>
					<p className="m-0 text-muted-foreground text-sm">
						{board.description}
					</p>
				</div>
				{canWrite ? (
					<Button
						nativeButton={false}
						render={
							<Link href={communityWritePath(board.slug) as Route}>
								<PencilLineIcon data-icon="inline-start" />
								글쓰기
							</Link>
						}
					/>
				) : null}
			</div>

			{showFilter ? (
				<div className="flex justify-end">
					<BoardFilterMenu
						filters={{ showEmployer, showPromotion }}
						onChange={handleFilterChange}
					/>
				</div>
			) : null}

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
					description={emptyDescription}
					title="글이 없어요"
				/>
			) : null}

			{items.length > 0 ? (
				<div className="flex flex-col">
					{items.map((post, index) => (
						<Fragment key={post.id}>
							{index > 0 ? <Separator /> : null}
							<BoardPostRow
								boardSlug={board.slug}
								post={post}
								showBadges={showBadges}
							/>
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

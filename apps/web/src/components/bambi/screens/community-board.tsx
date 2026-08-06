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
import { Input } from "@bambi-app/ui/components/input";
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
	SearchIcon,
	ThumbsUpIcon,
} from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import {
	CommunityNewBadge,
	CommunityRoleBadges,
} from "@/components/bambi/community-post-badges";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	communityBoardPath,
	communityCrawledPath,
	communityPostPath,
	communityWritePath,
	formatCommunityDate,
	getBoardBySlug,
	getCommunityPageItems,
	getCommunityTotalPages,
	isGuestWritableBoardKey,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

// 목록 필터는 독립 On/Off 토글 3개(광고 글보기·업소 회원 글보기·내가 쓴 글). 기본은 모두 off=전체.
interface CommunityListFilters {
	mine: boolean;
	showEmployer: boolean;
	showPromotion: boolean;
}

// 각 토글은 ?promotion=1 / ?employer=1 / ?mine=1 로, 검색어는 ?q= 로 URL에 반영해
// 단일 진실원으로 삼는다.
const isFlagOn = (value: string | null): boolean => value === "1";

// 필터·검색어·page를 한 경로로 합친다. 기본값(off·빈 검색어·1페이지)은 아예 붙이지
// 않아 목록 첫 화면 주소가 깔끔하게 유지된다.
const buildBoardHref = (
	pathname: string,
	filters: CommunityListFilters,
	page: number,
	query: string
): Route => {
	const params = new URLSearchParams();
	if (filters.showPromotion) {
		params.set("promotion", "1");
	}
	if (filters.showEmployer) {
		params.set("employer", "1");
	}
	if (filters.mine) {
		params.set("mine", "1");
	}
	if (query) {
		params.set("q", query);
	}
	if (page > 1) {
		params.set("page", String(page));
	}
	const search = params.toString();
	return (search ? `${pathname}?${search}` : pathname) as Route;
};

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
			className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted"
			href={
				(isCrawled
					? communityCrawledPath(post.id)
					: communityPostPath(boardSlug, post.id)) as Route
			}
		>
			<span className="flex min-w-0 flex-1 flex-col gap-1">
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
			</span>
			{/* 목록 썸네일은 블러로 가린다 — 스크롤만 하다 수위 높은 사진을 그대로 마주치지
			    않게 하고, 보려면 글을 열게 한다(상세는 원본). unoptimized는 외부 URL 이미지가
			    섞여 있어서다(JobCoverImage와 같은 이유). */}
			{post.thumbnailUrl ? (
				<Image
					alt=""
					className="size-14 shrink-0 rounded-md object-cover blur-sm"
					height={112}
					src={post.thumbnailUrl}
					unoptimized
					width={112}
				/>
			) : null}
		</Link>
	);
}

function BoardPagination({
	page,
	pageHref,
	totalPages,
}: {
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
						onClick={(event) => {
							if (prevDisabled) {
								event.preventDefault();
							}
						}}
						render={<Link href={pageHref(prevPage)} />}
						tabIndex={prevDisabled ? -1 : undefined}
					/>
				</PaginationItem>
				{pageItems.map((item) =>
					typeof item === "number" ? (
						<PaginationItem key={item}>
							<PaginationLink
								isActive={item === page}
								render={<Link href={pageHref(item)} />}
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
						onClick={(event) => {
							if (nextDisabled) {
								event.preventDefault();
							}
						}}
						render={<Link href={pageHref(nextPage)} />}
						tabIndex={nextDisabled ? -1 : undefined}
					/>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}

const getEmptyDescription = (
	boardKey: string,
	canWrite: boolean,
	{ mine, query }: { mine: boolean; query: string }
): string => {
	// 좁혀 놓고 비어 있는 상태에서 "첫 글을 남겨보세요"를 띄우면 검색이 고장 난 줄 안다.
	if (query) {
		return "검색 결과가 없어요. 다른 검색어로 찾아보세요.";
	}
	if (mine) {
		return "이 게시판에 쓴 글이 아직 없어요.";
	}
	if (canWrite) {
		return "아직 글이 없어요. 첫 글을 남겨보세요.";
	}
	if (boardKey === "best") {
		return "최근 30일 추천 글이 아직 없어요.";
	}
	return "아직 등록된 글이 없어요.";
};

// 목록 본문 — 로딩·에러·빈 상태·글 행. 화면 컴포넌트에서 이 분기를 덜어낸다.
function BoardPostList({
	boardSlug,
	emptyDescription,
	isError,
	isPending,
	items,
	showBadges,
}: {
	boardSlug: string;
	emptyDescription: string;
	isError: boolean;
	isPending: boolean;
	items: BoardPostItem[];
	showBadges: boolean;
}) {
	if (isPending) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		);
	}
	if (isError) {
		return (
			<EmptyState
				className="flex-1"
				description="글 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
				title="불러오기 실패"
			/>
		);
	}
	if (items.length === 0) {
		return (
			<EmptyState
				className="flex-1"
				description={emptyDescription}
				title="글이 없어요"
			/>
		);
	}
	return (
		<div className="flex flex-col">
			{items.map((post, index) => (
				<Fragment key={post.id}>
					{index > 0 ? <Separator /> : null}
					<BoardPostRow
						boardSlug={boardSlug}
						post={post}
						showBadges={showBadges}
					/>
				</Fragment>
			))}
		</div>
	);
}

// 제목·본문 검색. 타이핑마다 URL을 갱신하면 히스토리와 요청이 글자 수만큼 쌓이므로
// 제출(Enter) 시에만 반영하고, URL의 q가 바뀌면(뒤로가기·필터 리셋) 입력칸이 따라간다.
function BoardSearchForm({
	onSubmit,
	query,
}: {
	onSubmit: (next: string) => void;
	query: string;
}) {
	const [value, setValue] = useState(query);
	useEffect(() => {
		setValue(query);
	}, [query]);

	return (
		<form
			className="relative flex-1"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit(value.trim());
			}}
		>
			<SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				aria-label="글 검색"
				className="pl-9"
				maxLength={50}
				onChange={(event) => setValue(event.target.value)}
				placeholder="제목·본문 검색"
				type="search"
				value={value}
			/>
		</form>
	);
}

// 필터 아이콘 버튼 → 드롭다운에서 세 토글을 각각 On/Off. 활성 개수는 배지로 표기한다.
function BoardFilterMenu({
	filters,
	onChange,
}: {
	filters: CommunityListFilters;
	onChange: (next: CommunityListFilters) => void;
}) {
	const activeCount =
		Number(filters.showPromotion) +
		Number(filters.showEmployer) +
		Number(filters.mine);
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
					<DropdownMenuCheckboxItem
						checked={filters.mine}
						closeOnClick={false}
						onCheckedChange={(checked) =>
							onChange({ ...filters, mine: checked })
						}
					>
						내가 쓴 글
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
	// 필터 토글·검색어·페이지 모두 URL 쿼리를 단일 진실원으로 파생한다(뒤로가기 복원 부수 이득).
	const showPromotion = isFlagOn(searchParams.get("promotion"));
	const showEmployer = isFlagOn(searchParams.get("employer"));
	const mine = isFlagOn(searchParams.get("mine"));
	const query = (searchParams.get("q") ?? "").trim();
	const pageParam = Number(searchParams.get("page"));
	const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;
	const filters: CommunityListFilters = { mine, showEmployer, showPromotion };

	// 필터 토글·검색어·page를 한 번의 이동으로 원자적으로 갱신하는 쿼리 경로 빌더.
	const buildHref = useCallback(
		(next: CommunityListFilters, nextPage: number, nextQuery: string): Route =>
			buildBoardHref(pathname, next, nextPage, nextQuery),
		[pathname]
	);

	// 비회원(여성 인증 게스트)도 목록을 읽는다 — 프로필 조회는 회원 전용이라 걸지 않는다.
	const { isGuest, role } = useBambiAuth();
	const mineQuery = useQuery(
		orpc.bambi.onboarding.getMine.queryOptions({ enabled: !isGuest })
	);
	const isAdmin = mineQuery.data?.bambiProfile?.role === "admin";

	// 법률자문 계정은 legal 게시판만 이용한다(서버가 다른 보드를 FORBIDDEN으로 막는다).
	// 비-legal 보드 URL로 직접 들어오면 에러 화면 대신 legal 게시판으로 안내한다.
	// 입장 게이트(RequireCommunityAccess)가 isPending 동안 렌더를 막아 role은 확정 상태다.
	const legalAdvisorBlocked =
		role === "legal_advisor" && board !== undefined && board.key !== "legal";
	useEffect(() => {
		if (legalAdvisorBlocked) {
			router.replace(communityBoardPath("legal") as Route);
		}
	}, [legalAdvisorBlocked, router]);

	const listQuery = useQuery(
		orpc.bambi.community.listPosts.queryOptions({
			enabled: Boolean(board) && !legalAdvisorBlocked,
			input: {
				board: board?.key ?? "free",
				mine,
				page,
				q: query,
				showEmployer,
				showPromotion,
			},
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
			router.replace(
				buildHref({ mine, showEmployer, showPromotion }, totalPages, query)
			);
		}
	}, [
		listQuery.isSuccess,
		page,
		totalPages,
		mine,
		query,
		showEmployer,
		showPromotion,
		router,
		buildHref,
	]);

	if (!board || legalAdvisorBlocked) {
		return null;
	}

	// 일반 게시판(자유·일·중고)만 필터를 노출한다. 베스트·공지는 필터 없음.
	const showFilter =
		board.key === "free" || board.key === "work_talk" || board.key === "market";
	// 공지 게시판은 글쓰기가 운영자 전용이라 admin에게만 버튼을 노출한다.
	// 비회원은 읽기만 전체 보드고 쓰기는 자유수다·밤문화 이야기로 좁다(서버 가드와 동일).
	const canWrite =
		board.writable &&
		(!board.adminOnly || isAdmin) &&
		(!isGuest || isGuestWritableBoardKey(board.key));
	// 공지 게시판은 배지(광고·업소)를 생략한다.
	const showBadges = board.key !== "notice";

	const emptyDescription = getEmptyDescription(board.key, canWrite, {
		mine,
		query,
	});

	// 필터 토글·검색은 목록을 좁히는 조작이라 히스토리를 늘리지 않는다(page=1 리셋 포함).
	const handleFilterChange = (next: CommunityListFilters) => {
		router.replace(buildHref(next, 1, query));
	};

	const handleSearchSubmit = (next: string) => {
		router.replace(buildHref(filters, 1, next));
	};

	// 페이지 이동은 실제 앵커의 기본 push 이동을 사용해 각 페이지를 브라우저 history에
	// 남긴다. replace로 갈아끼우면 2페이지에서 뒤로가기가 목록 1페이지가 아니라 그 앞
	// (직전에 보던 글)으로 튄다 — QA가 보고한 뒤로가기 오동작의 원인이다. 필터 변경·
	// 검색·범위 초과 클램프만 위에서 replace를 사용한다.
	const pageHref = (nextPage: number) => buildHref(filters, nextPage, query);

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

			{/* 검색은 모든 게시판에서 쓰고, 필터 메뉴는 일반 게시판에서만 붙는다.
			    모바일에서는 입력칸이 한 줄을 다 쓰도록 세로로 접힌다. */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<BoardSearchForm onSubmit={handleSearchSubmit} query={query} />
				{showFilter ? (
					<BoardFilterMenu filters={filters} onChange={handleFilterChange} />
				) : null}
			</div>

			<BoardPostList
				boardSlug={board.slug}
				emptyDescription={emptyDescription}
				isError={listQuery.isError}
				isPending={listQuery.isPending}
				items={items}
				showBadges={showBadges}
			/>

			{/* 글이 한 페이지뿐이어도 컨트롤을 그대로 둔다(양끝 비활성) — 페이지 수에 따라
			    목록 하단이 있다 없다 하면 어디까지 봤는지 가늠이 안 된다. */}
			{listQuery.isSuccess && items.length > 0 ? (
				<BoardPagination
					page={page}
					pageHref={pageHref}
					totalPages={totalPages}
				/>
			) : null}
		</div>
	);
}

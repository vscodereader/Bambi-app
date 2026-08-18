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
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ExternalLinkIcon,
	ImageIcon,
	MoreHorizontalIcon,
	RotateCcwIcon,
	Trash2Icon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageControls } from "@/components/bambi/page-controls";
import { communityCrawledPath } from "@/lib/bambi/community";
import {
	CRAWLED_JOB_PAGE_SIZE,
	type CrawledJobStatusFilter,
	crawledJobImageEditHref,
	parseCrawledJobListState,
	withCrawledJobListState,
} from "@/lib/bambi/crawled-job-management";
import {
	CRAWLED_POST_STATUS_LABELS,
	CRAWLED_POST_STATUS_VARIANTS,
	formatCrawlTimestamp,
} from "@/lib/bambi/crawler";
import { orpc } from "@/utils/orpc";

// 공고·커뮤니티 카드가 같은 눈금으로 페이지를 넘긴다.
const PAGE_SIZE = CRAWLED_JOB_PAGE_SIZE;
const JOB_LIST_SCROLL_STORAGE_PREFIX = "bambi:crawled-job-list-scroll";

const jobListScrollStorageKey = (page: number, status: StatusFilter) =>
	`${JOB_LIST_SCROLL_STORAGE_PREFIX}:${status}:${page}`;

// 제목은 글자 수로 자른다(CSS truncate가 아니다) — 표 폭이 넓어도 업소명·지역 칸이
// 밀리지 않게 제목 길이를 일정하게 묶어 두려는 것이다. 전체 제목은 title 툴팁에 남긴다.
const TITLE_MAX_LENGTH = 12;

const truncateTitle = (title: string): string =>
	title.length > TITLE_MAX_LENGTH
		? `${title.slice(0, TITLE_MAX_LENGTH)}…`
		: title;

// 공개 상세(/seeker/jobs/crawled/[id])는 status='active'인 행만 조회한다
// (crawled-jobs.ts). needs_review·expired·removed를 링크로 걸면 눌러서 NOT_FOUND를
// 만나게 되므로, active인 행만 링크·「상세 보기」를 내주고 나머지는 일반 텍스트로 둔다.
const crawledDetailHref = (id: string) => `/seeker/jobs/crawled/${id}` as Route;
type StatusFilter = CrawledJobStatusFilter;

// 라벨 맵은 알파벳순이라 그대로 못 쓴다 — 훑는 순서(전체 → 정상 → 손볼 것 → 내려간 것)로 세운다.
const STATUS_FILTERS: readonly { label: string; value: StatusFilter }[] = [
	{ label: "전체", value: "all" },
	{ label: CRAWLED_POST_STATUS_LABELS.active, value: "active" },
	{ label: CRAWLED_POST_STATUS_LABELS.needs_review, value: "needs_review" },
	{ label: CRAWLED_POST_STATUS_LABELS.expired, value: "expired" },
	{ label: CRAWLED_POST_STATUS_LABELS.removed, value: "removed" },
];

// 커뮤니티 글에는 상태 enum이 없고 removedAt 하나뿐이라 필터 축이 셋이다. 서버(listTopics)의
// removed 입력은 생략=전체 / false=노출 중 / true=삭제됨이므로 그 셋에 그대로 맞춘다.
type TopicFilter = "all" | "active" | "removed";

const TOPIC_FILTERS: readonly { label: string; value: TopicFilter }[] = [
	{ label: "전체", value: "all" },
	{ label: CRAWLED_POST_STATUS_LABELS.active, value: "active" },
	{ label: CRAWLED_POST_STATUS_LABELS.removed, value: "removed" },
];

// 수집 글 상세(/seeker/community/crawled/[id])는 removedAt이 비어 있는 글만 연다
// (community.ts getCrawledTopic). 삭제된 글에 링크를 걸면 눌러서 NOT_FOUND를 만나므로,
// 공고 카드와 같은 규칙으로 노출 중인 글에만 링크·「상세 보기」를 준다.
const crawledTopicHref = (id: string) => communityCrawledPath(id) as Route;

// 삭제·복구는 목록과 현황 숫자를 동시에 바꾼다. 커뮤니티 목록까지 한 번에 털어도 손해가
// 없어서(두 카드가 서로의 캐시를 모른다) 한 함수로 묶어 둔다.
function useInvalidateCrawled() {
	const queryClient = useQueryClient();

	return () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.crawler.list.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.crawler.getSummary.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.crawler.listTopics.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.jobs.list.key(),
			}),
		]);
}

export function CrawledJobPostsCard() {
	const invalidate = useInvalidateCrawled();
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { page, status: statusFilter } = parseCrawledJobListState(searchParams);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [isBulkRemoveOpen, setIsBulkRemoveOpen] = useState(false);
	const setListState = useCallback(
		(next: { page: number; status: StatusFilter }) => {
			setSelectedIds(new Set());
			router.replace(
				`${pathname}${withCrawledJobListState(new URLSearchParams(searchParams), next)}` as Route,
				{ scroll: false }
			);
		},
		[pathname, router, searchParams]
	);
	// 확인 창을 띄울 대상. 제목까지 들고 있는 건 "무엇을 지우는지"를 창에서 되짚어 주기 위해서다.
	const [pendingRemove, setPendingRemove] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const listQuery = useQuery(
		orpc.bambi.crawler.list.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: (page - 1) * PAGE_SIZE,
				status: statusFilter === "all" ? null : statusFilter,
			},
		})
	);

	// 삭제는 톰스톤이라 되돌릴 수 있지만, 목록에서 아이콘 하나 잘못 눌러 남의 공고가 내려가는
	// 일은 막아야 해서 확인 창을 한 단계 세운다. 성공했을 때만 창을 닫는다 — 실패하면 열린 채로
	// 남아 다시 누를 수 있어야 한다.
	const removeMutation = useMutation(
		orpc.bambi.crawler.removePost.mutationOptions({
			onError: (error) => toast.error(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast.success("공고를 삭제했어요. 목록·배너에서 바로 빠집니다.");
				setPendingRemove(null);
				await invalidate();
			},
		})
	);
	const restoreMutation = useMutation(
		orpc.bambi.crawler.restorePost.mutationOptions({
			onError: (error) => toast.error(error.message || "복구하지 못했어요."),
			onSuccess: async () => {
				toast.success("공고를 복구했어요.");
				await invalidate();
			},
		})
	);
	const bulkRemoveMutation = useMutation(
		orpc.bambi.crawler.removePosts.mutationOptions({
			onError: (error) => toast.error(error.message || "삭제하지 못했어요."),
			onSuccess: async (result) => {
				toast.success(`${result.count}개 공고를 삭제했어요.`);
				setIsBulkRemoveOpen(false);
				setSelectedIds(new Set());
				await invalidate();
				const refreshed = await listQuery.refetch();
				const nextTotal = refreshed.data?.total ?? 0;
				const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
				if (page > nextTotalPages) {
					setListState({ page: nextTotalPages, status: statusFilter });
				}
			},
		})
	);
	const isPending =
		removeMutation.isPending ||
		restoreMutation.isPending ||
		bulkRemoveMutation.isPending;
	const total = listQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const selectableIds = useMemo(
		() =>
			(listQuery.data?.items ?? [])
				.filter((item) => item.status !== "removed")
				.map((item) => item.id),
		[listQuery.data?.items]
	);
	const allSelected =
		selectableIds.length > 0 &&
		selectableIds.every((id) => selectedIds.has(id));
	const someSelected = selectableIds.some((id) => selectedIds.has(id));
	const showSelection = statusFilter !== "removed";

	useEffect(() => {
		const visible = new Set(selectableIds);
		setSelectedIds((current) => {
			const next = new Set([...current].filter((id) => visible.has(id)));
			return next.size === current.size ? current : next;
		});
	}, [selectableIds]);
	useEffect(() => {
		if (listQuery.data && page > totalPages) {
			setListState({ page: totalPages, status: statusFilter });
		}
	}, [listQuery.data, page, setListState, statusFilter, totalPages]);
	useEffect(() => {
		if (!listQuery.data) {
			return;
		}
		const storageKey = jobListScrollStorageKey(page, statusFilter);
		const savedScrollY = window.sessionStorage.getItem(storageKey);
		if (savedScrollY === null) {
			return;
		}
		window.sessionStorage.removeItem(storageKey);
		const scrollY = Number(savedScrollY);
		if (Number.isFinite(scrollY) && scrollY >= 0) {
			window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
		}
	}, [listQuery.data, page, statusFilter]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>수집 공고 관리</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<p className="m-0 text-muted-foreground text-xs">
					삭제한 공고는 지워지지 않고 「삭제됨」으로 남습니다. 다음 회차가 같은
					글을 다시 만나도 되살아나지 않아요. 잘못 눌렀다면 상태를
					「삭제됨」으로 걸러 복구하면 됩니다. 한 페이지에 {PAGE_SIZE}건씩
					보여줍니다
					{listQuery.data ? ` (조건에 맞는 ${total}건)` : ""}.
				</p>

				<div className="flex flex-wrap items-center justify-between gap-2">
					<ToggleGroup
						aria-label="상태 필터"
						className="flex-wrap"
						onValueChange={(value) => {
							const next = value.at(-1);
							if (next) {
								setListState({ page: 1, status: next as StatusFilter });
							}
						}}
						value={[statusFilter]}
					>
						{STATUS_FILTERS.map((filter) => (
							<ToggleGroupItem key={filter.value} value={filter.value}>
								{filter.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					{showSelection && selectedIds.size > 0 ? (
						<Button
							disabled={isPending}
							onClick={() => setIsBulkRemoveOpen(true)}
							size="sm"
							variant="destructive"
						>
							<Trash2Icon />
							선택 삭제 ({selectedIds.size})
						</Button>
					) : null}
				</div>

				{listQuery.data?.items.length ? (
					<>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										{showSelection ? (
											<TableHead className="w-10">
												<Checkbox
													aria-label="현재 페이지 공고 전체 선택"
													checked={allSelected}
													disabled={isPending || selectableIds.length === 0}
													indeterminate={someSelected && !allSelected}
													onCheckedChange={(checked) =>
														setSelectedIds(
															checked ? new Set(selectableIds) : new Set()
														)
													}
												/>
											</TableHead>
										) : null}
										<TableHead>제목</TableHead>
										<TableHead>업소명</TableHead>
										<TableHead>지역</TableHead>
										<TableHead>상태</TableHead>
										<TableHead>마지막 수집</TableHead>
										<TableHead className="text-right">조치</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{listQuery.data.items.map((item) => (
										<TableRow key={item.id}>
											{showSelection ? (
												<TableCell className="w-10">
													<Checkbox
														aria-label={`${item.title} 선택`}
														checked={selectedIds.has(item.id)}
														disabled={isPending || item.status === "removed"}
														onCheckedChange={(checked) =>
															setSelectedIds((current) => {
																const next = new Set(current);
																if (checked) {
																	next.add(item.id);
																} else {
																	next.delete(item.id);
																}
																return next;
															})
														}
													/>
												</TableCell>
											) : null}
											<TableCell>
												{item.status === "active" ? (
													<Link
														className="font-medium text-foreground underline-offset-4 hover:underline"
														href={crawledDetailHref(item.id)}
														rel="noreferrer"
														// 목록을 훑다가 한 건만 확인하는 흐름이라, 필터·페이지를
														// 잃지 않게 새 탭으로 띄운다.
														target="_blank"
														title={item.title}
													>
														{truncateTitle(item.title)}
													</Link>
												) : (
													<span
														className="font-medium text-foreground"
														title={item.title}
													>
														{truncateTitle(item.title)}
													</span>
												)}
											</TableCell>
											<TableCell>{item.shopName ?? "—"}</TableCell>
											<TableCell className="whitespace-nowrap">
												{[item.region, item.district]
													.filter(Boolean)
													.join(" ") || "—"}
											</TableCell>
											<TableCell>
												<Badge
													variant={CRAWLED_POST_STATUS_VARIANTS[item.status]}
												>
													{CRAWLED_POST_STATUS_LABELS[item.status]}
												</Badge>
											</TableCell>
											<TableCell className="whitespace-nowrap">
												{formatCrawlTimestamp(item.lastSeenAt)}
											</TableCell>
											<TableCell className="text-right">
												<DropdownMenu>
													<DropdownMenuTrigger
														render={
															<Button
																aria-label="조치 메뉴"
																size="icon-sm"
																variant="ghost"
															>
																<MoreHorizontalIcon />
															</Button>
														}
													/>
													<DropdownMenuContent align="end" className="w-36">
														{item.status === "active" ? (
															<>
																<DropdownMenuItem
																	render={
																		<Link
																			href={crawledDetailHref(item.id)}
																			rel="noreferrer"
																			target="_blank"
																		/>
																	}
																>
																	<ExternalLinkIcon />
																	상세 보기
																</DropdownMenuItem>
																<DropdownMenuItem
																	render={
																		<Link
																			href={crawledJobImageEditHref(item.id, {
																				page,
																				status: statusFilter,
																			})}
																			onClick={() =>
																				window.sessionStorage.setItem(
																					jobListScrollStorageKey(
																						page,
																						statusFilter
																					),
																					String(window.scrollY)
																				)
																			}
																		/>
																	}
																>
																	<ImageIcon />
																	이미지 편집
																</DropdownMenuItem>
																<DropdownMenuSeparator />
															</>
														) : null}
														{item.status === "removed" ? (
															<DropdownMenuItem
																disabled={isPending}
																onClick={() =>
																	restoreMutation.mutate({ id: item.id })
																}
															>
																<RotateCcwIcon />
																복구
															</DropdownMenuItem>
														) : (
															<DropdownMenuItem
																disabled={isPending}
																// 바로 지우지 않고 확인 창을 띄운다. 실제 삭제 버튼은
																// 그 창 안에 있다.
																onClick={() =>
																	setPendingRemove({
																		id: item.id,
																		title: item.title,
																	})
																}
																variant="destructive"
															>
																<Trash2Icon />
																삭제
															</DropdownMenuItem>
														)}
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						<div className="flex justify-end">
							<PageControls
								disabled={listQuery.isFetching}
								onPageChange={(nextPage) =>
									setListState({ page: nextPage, status: statusFilter })
								}
								page={page}
								pageCount={totalPages}
							/>
						</div>
					</>
				) : (
					<EmptyState
						description={
							listQuery.isLoading
								? "불러오는 중이에요."
								: "이 상태에 해당하는 수집 공고가 없어요. 필터를 바꾸거나 수집 회차를 돌려 보세요."
						}
						title="보여줄 수집 공고가 없어요"
					/>
				)}

				{/* 확인 창은 표 밖에 하나만 두고 대상만 갈아끼운다 — 행마다 두면 한 페이지에
				    열 개가 함께 마운트된다(moderator/content의 사유 Dialog와 같은 방식). */}
				<AlertDialog
					onOpenChange={(open) => {
						if (!open) {
							setPendingRemove(null);
						}
					}}
					open={pendingRemove !== null}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>이 공고를 삭제할까요?</AlertDialogTitle>
							<AlertDialogDescription>
								「{pendingRemove?.title}」이(가) 목록·배너에서 바로 빠집니다.
								기록은 「삭제됨」으로 남으니 잘못 눌렀다면 상태를 「삭제됨」으로
								걸러 복구하면 됩니다.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>취소</AlertDialogCancel>
							<AlertDialogAction
								disabled={removeMutation.isPending}
								onClick={() => {
									if (pendingRemove) {
										removeMutation.mutate({ id: pendingRemove.id });
									}
								}}
								variant="destructive"
							>
								삭제
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<AlertDialog onOpenChange={setIsBulkRemoveOpen} open={isBulkRemoveOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								선택한 공고 {selectedIds.size}개를 삭제할까요?
							</AlertDialogTitle>
							<AlertDialogDescription>
								선택한 공고는 목록·배너에서 바로 빠지고 「삭제됨」 탭으로
								이동합니다. 잘못 삭제한 공고는 그 탭에서 복구할 수 있습니다.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>취소</AlertDialogCancel>
							<AlertDialogAction
								disabled={bulkRemoveMutation.isPending}
								onClick={() =>
									bulkRemoveMutation.mutate({ ids: [...selectedIds] })
								}
								variant="destructive"
							>
								삭제
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
}

export function CrawledCommunityTopicsCard() {
	const invalidate = useInvalidateCrawled();
	const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
	const [page, setPage] = useState(1);
	// 확인 창을 띄울 대상(공고 카드와 같은 방식 — 제목까지 들고 있어야 창에서 되짚어 준다).
	const [pendingRemove, setPendingRemove] = useState<{
		id: string;
		title: string;
	} | null>(null);
	const listQuery = useQuery(
		orpc.bambi.crawler.listTopics.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: (page - 1) * PAGE_SIZE,
				removed: topicFilter === "all" ? null : topicFilter === "removed",
			},
		})
	);

	const removeMutation = useMutation(
		orpc.bambi.crawler.removeTopic.mutationOptions({
			onError: (error) => toast.error(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast.success("커뮤니티 글을 삭제했어요. 게시판에서 바로 빠집니다.");
				setPendingRemove(null);
				await invalidate();
			},
		})
	);
	const restoreMutation = useMutation(
		orpc.bambi.crawler.restoreTopic.mutationOptions({
			onError: (error) => toast.error(error.message || "복구하지 못했어요."),
			onSuccess: async () => {
				toast.success("커뮤니티 글을 복구했어요.");
				await invalidate();
			},
		})
	);
	const isPending = removeMutation.isPending || restoreMutation.isPending;
	const total = listQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	return (
		<Card>
			<CardHeader>
				<CardTitle>수집 커뮤니티 글 관리</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<p className="m-0 text-muted-foreground text-xs">
					공고와 같은 방식으로, 삭제해도 기록은 남고 다음 회차가 되살리지
					않습니다. 「밤문화 이야기」 게시판과 수다방 미리보기에서 즉시 빠져요.
					잘못 눌렀다면 상태를 「{CRAWLED_POST_STATUS_LABELS.removed}」로 걸러
					복구하면 됩니다. 한 페이지에 {PAGE_SIZE}건씩 보여줍니다
					{listQuery.data ? ` (조건에 맞는 ${total}건)` : ""}.
				</p>

				<ToggleGroup
					aria-label="상태 필터"
					className="w-full flex-wrap"
					onValueChange={(value) => {
						const next = value.at(-1);
						if (next) {
							setTopicFilter(next as TopicFilter);
							// 조건이 바뀌면 건수가 통째로 달라진다 — 3페이지에 머물면 빈 표를 본다.
							setPage(1);
						}
					}}
					value={[topicFilter]}
				>
					{TOPIC_FILTERS.map((filter) => (
						<ToggleGroupItem key={filter.value} value={filter.value}>
							{filter.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>

				{listQuery.data?.items.length ? (
					<>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>제목</TableHead>
										<TableHead>게시판</TableHead>
										<TableHead>원 게시일</TableHead>
										<TableHead className="text-right">댓글</TableHead>
										<TableHead className="text-right">조회</TableHead>
										<TableHead>상태</TableHead>
										<TableHead className="text-right">조치</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{listQuery.data.items.map((topic) => (
										<TableRow key={topic.id}>
											<TableCell>
												{topic.removedAt ? (
													<span
														className="font-medium text-foreground"
														title={topic.title}
													>
														{truncateTitle(topic.title)}
													</span>
												) : (
													<Link
														className="font-medium text-foreground underline-offset-4 hover:underline"
														href={crawledTopicHref(topic.id)}
														rel="noreferrer"
														// 목록을 훑다가 한 건만 확인하는 흐름이라, 필터·페이지를
														// 잃지 않게 새 탭으로 띄운다.
														target="_blank"
														title={topic.title}
													>
														{truncateTitle(topic.title)}
													</Link>
												)}
											</TableCell>
											{/* 게시판명은 상대 사이트가 적어둔 원문 문구다(우리 게시판 enum이 아님). */}
											<TableCell className="whitespace-nowrap">
												{topic.boardName ?? "—"}
											</TableCell>
											<TableCell className="whitespace-nowrap">
												{topic.sourcePostedAt
													? formatCrawlTimestamp(topic.sourcePostedAt)
													: "—"}
											</TableCell>
											<TableCell className="text-right">
												{topic.commentCount ?? "—"}
											</TableCell>
											<TableCell className="text-right">
												{topic.viewCount ?? "—"}
											</TableCell>
											<TableCell>
												{topic.removedAt ? (
													<Badge variant="destructive">
														{CRAWLED_POST_STATUS_LABELS.removed}
													</Badge>
												) : (
													<Badge variant="outline">
														{CRAWLED_POST_STATUS_LABELS.active}
													</Badge>
												)}
											</TableCell>
											<TableCell className="text-right">
												<DropdownMenu>
													<DropdownMenuTrigger
														render={
															<Button
																aria-label="조치 메뉴"
																size="icon-sm"
																variant="ghost"
															>
																<MoreHorizontalIcon />
															</Button>
														}
													/>
													<DropdownMenuContent align="end" className="w-36">
														{topic.removedAt ? (
															<DropdownMenuItem
																disabled={isPending}
																onClick={() =>
																	restoreMutation.mutate({ id: topic.id })
																}
															>
																<RotateCcwIcon />
																복구
															</DropdownMenuItem>
														) : (
															<>
																<DropdownMenuItem
																	render={
																		<Link
																			href={crawledTopicHref(topic.id)}
																			rel="noreferrer"
																			target="_blank"
																		/>
																	}
																>
																	<ExternalLinkIcon />
																	상세 보기
																</DropdownMenuItem>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	disabled={isPending}
																	// 바로 지우지 않고 확인 창을 띄운다. 실제 삭제 버튼은
																	// 그 창 안에 있다.
																	onClick={() =>
																		setPendingRemove({
																			id: topic.id,
																			title: topic.title,
																		})
																	}
																	variant="destructive"
																>
																	<Trash2Icon />
																	삭제
																</DropdownMenuItem>
															</>
														)}
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						<div className="flex justify-end">
							<PageControls
								disabled={listQuery.isFetching}
								onPageChange={setPage}
								page={page}
								pageCount={totalPages}
							/>
						</div>
					</>
				) : (
					<EmptyState
						description={
							listQuery.isLoading
								? "불러오는 중이에요."
								: "이 상태에 해당하는 수집 커뮤니티 글이 없어요. 필터를 바꾸거나, 수집 데이터를 「커뮤니티」로 두고 회차를 돌려 보세요."
						}
						title="보여줄 수집 커뮤니티 글이 없어요"
					/>
				)}

				{/* 확인 창은 표 밖에 하나만 두고 대상만 갈아끼운다(공고 카드와 같은 이유). */}
				<AlertDialog
					onOpenChange={(open) => {
						if (!open) {
							setPendingRemove(null);
						}
					}}
					open={pendingRemove !== null}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>이 커뮤니티 글을 삭제할까요?</AlertDialogTitle>
							<AlertDialogDescription>
								「{pendingRemove?.title}」이(가) 「밤문화 이야기」 게시판과
								수다방 미리보기에서 바로 빠집니다. 기록은 「
								{CRAWLED_POST_STATUS_LABELS.removed}」으로 남으니 잘못 눌렀다면
								상태를 「{CRAWLED_POST_STATUS_LABELS.removed}」로 걸러 복구하면
								됩니다.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>취소</AlertDialogCancel>
							<AlertDialogAction
								disabled={removeMutation.isPending}
								onClick={() => {
									if (pendingRemove) {
										removeMutation.mutate({ id: pendingRemove.id });
									}
								}}
								variant="destructive"
							>
								삭제
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
}

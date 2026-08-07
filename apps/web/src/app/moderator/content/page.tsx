"use client";

// 운영자 통합 게시물 조치 화면. 커뮤니티 글·댓글·고객센터 문의를 한 화면에서 숨김/복구/삭제한다.
// 서버가 유형별 행을 공통 형태({id,targetType,title,excerpt,...})로 내려주므로 표시에는 분기가 없고,
// 조치 mutation의 입력 키(postId/commentId/inquiryId)만 유형별로 갈린다.
//
// 조치는 행 우측 Row Actions(DropdownMenu) → 사유 입력 Dialog → mutation 순서로 나간다.
// 사유 Dialog는 목록 밖에 하나만 두고 대상만 갈아끼운다(행마다 Dialog를 두면 20개가 마운트된다).

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import { Label } from "@bambi-app/ui/components/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronDownIcon,
	ChevronUpIcon,
	MoreHorizontalIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { COMMUNITY_BOARD_LABELS } from "@/lib/bambi/community";
import {
	CONTENT_STATUS_LABELS,
	type ContentStatus,
	SUPPORT_CATEGORY_LABELS,
	type SupportCategory,
} from "@/lib/bambi/support";
import { formatDateTime } from "@/lib/bambi-format";
import { client, orpc } from "@/utils/orpc";

const TARGET_TABS = [
	{ value: "community_post", label: "커뮤니티 글" },
	{ value: "community_comment", label: "커뮤니티 댓글" },
	{ value: "support_inquiry", label: "고객센터 문의" },
] as const;

type TargetType = (typeof TARGET_TABS)[number]["value"];

// 서버 min(2) 거절을 왕복 없이 막기 위한 UI 선제 검사 기준.
const REASON_MIN_LENGTH = 2;

// 목록 셀의 제목·발췌 표시 길이. 길면 행마다 높이가 들쭉날쭉해 훑기 어려워진다.
// 전체 내용은 행을 펼쳐서 본다.
const CELL_TEXT_MAX = 15;

// 코드 유닛(text.length)이 아니라 코드 포인트로 자른다 — 이모지가 든 제목이 쪼개지면
// 깨진 문자가 표시된다(employer-listing-preview의 Array.from 관례와 동일).
const clampCellText = (text: string): string => {
	const chars = Array.from(text);

	if (chars.length <= CELL_TEXT_MAX) {
		return text;
	}

	return `${chars.slice(0, CELL_TEXT_MAX).join("")}…`;
};

const STATUS_ACTIONS: { status: ContentStatus; label: string }[] = [
	{ status: "hidden", label: "숨김" },
	{ status: "published", label: "복구" },
	{ status: "deleted", label: "삭제" },
];

// 현재 상태 배지 톤. 삭제된 행은 목록에서 바로 구분돼야 다시 지우려는 시도를 줄인다.
const STATUS_BADGE_VARIANT: Record<
	ContentStatus,
	"destructive" | "outline" | "secondary"
> = {
	deleted: "destructive",
	hidden: "outline",
	published: "secondary",
};

// 선택 열은 커뮤니티 글 탭에서만 붙는다(다중 선택 + 일괄 삭제 대상).
const TABLE_COLUMN_COUNT = 6;
const SELECTABLE_TARGET_TYPE: TargetType = "community_post";

// 사유 Dialog가 조치를 확정할 때까지 들고 있는 대상. null이면 Dialog가 닫힌 상태다.
// ids가 2건 이상이면 일괄 조치다(커뮤니티 글 전용).
interface PendingAction {
	ids: string[];
	label: string;
	status: ContentStatus;
	title: string;
}

export default function ModeratorContentPage() {
	const queryClient = useQueryClient();
	const [targetType, setTargetType] = useState<TargetType>("community_post");
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [reason, setReason] = useState("");
	const [selectedIds, setSelectedIds] = useState<string[]>([]);

	const listQuery = useQuery(
		orpc.bambi.moderation.listModeratableContent.queryOptions({
			input: { page, targetType },
		})
	);

	// 펼친 행에 대해서만 전체 본문을 조회한다(목록 excerpt는 120자라 내용 판단이 어렵다).
	const detailQuery = useQuery({
		...orpc.bambi.moderation.getModeratableContentDetail.queryOptions({
			input: { id: expandedId ?? "", targetType },
		}),
		enabled: expandedId !== null,
	});

	const closeDialog = () => {
		setPending(null);
		setReason("");
	};

	const invalidate = async () => {
		toast.success("조치했어요.");
		closeDialog();
		await queryClient.invalidateQueries({
			// input 없이 호출해 유형·페이지 전체를 한 번에 무효화한다.
			queryKey: orpc.bambi.moderation.listModeratableContent.key(),
		});
	};
	const onError = (error: Error) => toast.error(error.message);

	const setPostStatus = useMutation(
		orpc.bambi.community.setPostStatusByAdmin.mutationOptions({
			onSuccess: invalidate,
			onError,
		})
	);
	const setCommentStatus = useMutation(
		orpc.bambi.community.setCommentStatusByAdmin.mutationOptions({
			onSuccess: invalidate,
			onError,
		})
	);
	const setInquiryStatus = useMutation(
		orpc.bambi.moderation.setInquiryStatusByAdmin.mutationOptions({
			onSuccess: invalidate,
			onError,
		})
	);
	// 커뮤니티 글 일괄 조치. 서버에 묶음 프로시저가 없어 글 단위 조치를 모아 보내고,
	// 토스트·무효화는 한 번만 낸다(글마다 토스트가 뜨면 화면이 잠긴 것처럼 보인다).
	const bulkSetPostStatus = useMutation({
		mutationFn: async (input: {
			ids: string[];
			reason: string;
			status: ContentStatus;
		}) => {
			const results = await Promise.allSettled(
				input.ids.map((postId) =>
					client.bambi.community.setPostStatusByAdmin({
						postId,
						reason: input.reason,
						status: input.status,
					})
				)
			);

			return {
				failed: results.filter((result) => result.status === "rejected").length,
				total: input.ids.length,
			};
		},
		onError,
		onSuccess: async (result) => {
			if (result.failed > 0) {
				toast.error(
					`${result.total - result.failed}건 처리, ${result.failed}건 실패했어요.`
				);
			} else {
				toast.success(`${result.total}건 조치했어요.`);
			}

			setSelectedIds([]);
			closeDialog();
			await queryClient.invalidateQueries({
				queryKey: orpc.bambi.moderation.listModeratableContent.key(),
			});
		},
	});

	const isPending =
		setPostStatus.isPending ||
		setCommentStatus.isPending ||
		setInquiryStatus.isPending ||
		bulkSetPostStatus.isPending;

	const trimmedReason = reason.trim();
	const canSubmit = trimmedReason.length >= REASON_MIN_LENGTH && !isPending;

	const confirmAction = () => {
		if (!(pending && canSubmit)) {
			return;
		}
		const input = { reason: trimmedReason, status: pending.status };
		if (pending.ids.length > 1) {
			bulkSetPostStatus.mutate({ ids: pending.ids, ...input });
			return;
		}
		const targetId = pending.ids[0];
		if (!targetId) {
			return;
		}
		if (targetType === "community_post") {
			setPostStatus.mutate({ postId: targetId, ...input });
		} else if (targetType === "community_comment") {
			setCommentStatus.mutate({ commentId: targetId, ...input });
		} else {
			setInquiryStatus.mutate({ inquiryId: targetId, ...input });
		}
	};

	const switchTargetType = (value: string) => {
		setTargetType(value as TargetType);
		setPage(1);
		// 유형이 바뀌면 펼친 행의 id가 다른 테이블 것이 되므로 접는다.
		setExpandedId(null);
		setSelectedIds([]);
	};

	const items = listQuery.data?.items ?? [];
	const isSelectable = targetType === SELECTABLE_TARGET_TYPE;
	const toggleSelected = (id: string) =>
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
		);
	// 헤더 체크박스: 현재 페이지가 전부 선택돼 있으면 해제, 아니면 전부 선택한다.
	// 이미 삭제된 글은 선택 대상에서 빼 일괄 삭제로 다시 지워지지 않게 한다(서버도 거절한다).
	const pageIds = items
		.filter((item) => item.status !== "deleted")
		.map((item) => item.id);
	const allSelected =
		pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
	const toggleAllOnPage = () => setSelectedIds(allSelected ? [] : pageIds);
	const totalCount = listQuery.data?.totalCount ?? 0;
	const pageSize = listQuery.data?.pageSize ?? 20;
	const hasNextPage = page * pageSize < totalCount;

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">게시물 조치</h1>

			<Tabs onValueChange={switchTargetType} value={targetType}>
				<TabsList className="max-w-full flex-wrap">
					{TARGET_TABS.map((tab) => (
						<TabsTrigger key={tab.value} value={tab.value}>
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{isSelectable && selectedIds.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
					<span className="font-medium text-foreground text-sm">
						{selectedIds.length}개 선택됨
					</span>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							disabled={isPending}
							onClick={() =>
								setPending({
									ids: selectedIds,
									label: "삭제",
									status: "deleted",
									title: `선택한 커뮤니티 글 ${selectedIds.length}건`,
								})
							}
							size="sm"
							type="button"
							variant="destructive"
						>
							선택 삭제
						</Button>
						<Button
							onClick={() => setSelectedIds([])}
							size="sm"
							type="button"
							variant="ghost"
						>
							선택 해제
						</Button>
					</div>
				</div>
			) : null}

			{items.length === 0 ? (
				<EmptyState
					description="선택한 유형에 조치할 게시물이 없어요."
					title="게시물이 없어요"
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							{isSelectable ? (
								<TableHead className="w-10">
									<Checkbox
										aria-label="이 페이지 전체 선택"
										checked={allSelected}
										onCheckedChange={toggleAllOnPage}
									/>
								</TableHead>
							) : null}
							<TableHead className="w-10">
								<span className="sr-only">상세보기</span>
							</TableHead>
							<TableHead>내용</TableHead>
							<TableHead>작성자</TableHead>
							<TableHead>상태</TableHead>
							<TableHead>등록일</TableHead>
							<TableHead className="w-10">
								<span className="sr-only">조치</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => {
							const isExpanded = expandedId === item.id;
							return (
								<Fragment key={item.id}>
									<TableRow>
										{isSelectable ? (
											<TableCell>
												{/* 삭제된 글은 더 지울 게 없어 선택 자체를 막는다. */}
												<Checkbox
													aria-label={`${item.title} 선택`}
													checked={selectedIds.includes(item.id)}
													disabled={item.status === "deleted"}
													onCheckedChange={() => toggleSelected(item.id)}
												/>
											</TableCell>
										) : null}
										<TableCell>
											<Button
												aria-expanded={isExpanded}
												aria-label={isExpanded ? "상세 접기" : "상세 펼치기"}
												onClick={() =>
													setExpandedId(isExpanded ? null : item.id)
												}
												size="icon-sm"
												variant="ghost"
											>
												{isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
											</Button>
										</TableCell>
										<TableCell className="max-w-64">
											<span className="block font-medium" title={item.title}>
												{clampCellText(item.title)}
											</span>
											<span
												className="block text-muted-foreground"
												title={item.excerpt}
											>
												{clampCellText(item.excerpt)}
											</span>
										</TableCell>
										<TableCell>{item.authorName}</TableCell>
										<TableCell>
											<Badge variant={STATUS_BADGE_VARIANT[item.status]}>
												{CONTENT_STATUS_LABELS[item.status]}
											</Badge>
										</TableCell>
										<TableCell>{formatDateTime(item.createdAt)}</TableCell>
										<TableCell>
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
												<DropdownMenuContent align="end" className="w-32">
													{STATUS_ACTIONS.filter(
														(action) => action.status !== item.status
													).map((action) => (
														<DropdownMenuItem
															key={action.status}
															onClick={() =>
																setPending({
																	ids: [item.id],
																	label: action.label,
																	status: action.status,
																	title: item.title,
																})
															}
															variant={
																action.status === "deleted"
																	? "destructive"
																	: "default"
															}
														>
															{action.label}
														</DropdownMenuItem>
													))}
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
									{isExpanded ? (
										<TableRow>
											<TableCell
												className="whitespace-normal bg-muted/30"
												colSpan={
													isSelectable
														? TABLE_COLUMN_COUNT + 1
														: TABLE_COLUMN_COUNT
												}
											>
												<DetailPanel
													board={detailQuery.data?.board}
													body={detailQuery.data?.body}
													category={detailQuery.data?.category}
													isLoading={detailQuery.isPending}
												/>
											</TableCell>
										</TableRow>
									) : null}
								</Fragment>
							);
						})}
					</TableBody>
				</Table>
			)}

			<div className="flex items-center justify-between gap-2">
				<Button
					disabled={page <= 1}
					onClick={() => {
						setPage((prev) => Math.max(1, prev - 1));
						setSelectedIds([]);
					}}
					variant="outline"
				>
					이전
				</Button>
				<span className="text-muted-foreground text-sm">
					{page} / {Math.max(1, Math.ceil(totalCount / pageSize))}
				</span>
				<Button
					disabled={!hasNextPage}
					onClick={() => {
						setPage((prev) => prev + 1);
						setSelectedIds([]);
					}}
					variant="outline"
				>
					다음
				</Button>
			</div>

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						closeDialog();
					}
				}}
				open={pending !== null}
			>
				<DialogContent>
					<div className="flex flex-col gap-2">
						<DialogTitle>{pending?.label} 조치</DialogTitle>
						<DialogDescription>
							「{pending?.title}」 항목을 {pending?.label} 처리합니다. 사유는
							감사 로그에 남아요.
						</DialogDescription>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="moderation-reason">조치 사유(필수)</Label>
						<Textarea
							id="moderation-reason"
							onChange={(event) => setReason(event.target.value)}
							placeholder="예: 광고성 게시물"
							value={reason}
						/>
						<p className="m-0 text-muted-foreground text-xs">
							{REASON_MIN_LENGTH}자 이상 입력해 주세요.
						</p>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<Button
							disabled={isPending}
							onClick={closeDialog}
							variant="outline"
						>
							취소
						</Button>
						<Button
							disabled={!canSubmit}
							onClick={confirmAction}
							variant={
								pending?.status === "deleted" ? "destructive" : "default"
							}
						>
							{isPending ? "처리 중" : "확인"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

// 상세 뱃지에 쓸 표시 문구. 서버는 유형에 따라 board(커뮤니티) 또는 category(고객센터) 중
// 하나만 채워 주는데, 둘 다 저장 원값이므로 반드시 라벨을 거쳐 표시한다. 게시판 라벨의
// 정본은 DB(communityBoards.list)이고 빌트인 맵은 폴백이다 — 운영자가 라벨을 바꾸거나
// 게시판을 추가해도 따라간다. 둘 다 없으면 원값 폴백(빈 뱃지보다는 낫다).
const resolveMetaLabel = (
	board: string | null | undefined,
	category: string | null | undefined,
	boardLabels: Record<string, string>
): string | null => {
	if (board) {
		return boardLabels[board] ?? COMMUNITY_BOARD_LABELS[board] ?? board;
	}

	if (category) {
		return SUPPORT_CATEGORY_LABELS[category as SupportCategory] ?? category;
	}

	return null;
};

// 펼친 행의 전체 본문 패널. 목록 excerpt와 달리 줄바꿈을 유지해 원문 형태로 보여준다.
function DetailPanel({
	body,
	board,
	category,
	isLoading,
}: {
	body: string | undefined;
	board: string | null | undefined;
	category: string | null | undefined;
	isLoading: boolean;
}) {
	// 게시판 라벨 맵. 목록 전체가 아니라 펼친 행에서만 필요하고, 여러 행을 펼쳐도
	// react-query 캐시가 한 번만 받아 온다.
	const boardsQuery = useQuery(orpc.bambi.communityBoards.list.queryOptions());
	const boardLabels = Object.fromEntries(
		(boardsQuery.data ?? []).map((item) => [item.key, item.label])
	);

	if (isLoading) {
		return (
			<p className="m-0 text-muted-foreground">본문을 불러오는 중이에요.</p>
		);
	}

	const metaLabel = resolveMetaLabel(board, category, boardLabels);

	return (
		<div className="flex flex-col gap-2">
			{metaLabel ? <Badge variant="outline">{metaLabel}</Badge> : null}
			<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">
				{body ?? "본문을 불러오지 못했어요."}
			</p>
		</div>
	);
}

"use client";

// 운영자 통합 게시물 조치 화면. 커뮤니티 글·댓글·고객센터 문의를 한 화면에서 숨김/복구/삭제한다.
// 서버가 유형별 행을 공통 형태({id,targetType,title,excerpt,...})로 내려주므로 표시에는 분기가 없고,
// 조치 mutation의 입력 키(postId/commentId/inquiryId)만 유형별로 갈린다.
//
// 조치는 행 우측 Row Actions(DropdownMenu) → 사유 입력 Dialog → mutation 순서로 나간다.
// 사유 Dialog는 목록 밖에 하나만 두고 대상만 갈아끼운다(행마다 Dialog를 두면 20개가 마운트된다).

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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
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

// 선택 열은 모든 탭에 붙고(유형을 가리지 않고 일괄 조치를 한다), 게시판 열만 커뮤니티 글
// 탭 전용이다(게시판은 글에만 있는 축). 펼친 행의 colSpan도 그만큼 늘어난다.
const TABLE_COLUMN_COUNT = 7;
const BOARD_COLUMN_COUNT = 1;

// 게시판 필터의 "전체" 값. Select는 빈 문자열을 값으로 쓰기 어려워 센티넬을 둔다.
const ALL_BOARDS = "all";

// 사유 Dialog가 조치를 확정할 때까지 들고 있는 대상. null이면 Dialog가 닫힌 상태다.
// ids가 2건 이상이면 일괄 조치다(유형 무관).
interface PendingAction {
	ids: string[];
	label: string;
	status: ContentStatus;
	title: string;
}

// 서버에 묶음 프로시저가 없어 일괄 조치는 건 단위 호출을 모아 보낸다(단건도 같은 경로다).
// 부분 실패가 나올 수 있으므로 건수를 세고, 실패 사유는 첫 건의 서버 문구를 들고 온다 —
// 단건 실패에서는 그 문구(409·404)가 운영자에게 유일한 단서다.
const summarizeSettled = (results: PromiseSettledResult<unknown>[]) => {
	const failed = results.filter(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);

	return {
		failed: failed.length,
		reason:
			failed[0]?.reason instanceof Error ? failed[0].reason.message : null,
		total: results.length,
	};
};

type BulkResult = ReturnType<typeof summarizeSettled>;

// 일괄 결과 토스트. 건마다 띄우면 화면이 잠긴 것처럼 보이므로 한 번만 낸다.
const toastBulkResult = (result: BulkResult, verb: string) => {
	if (result.failed === 0) {
		toast.success(
			result.total === 1 ? `${verb}했어요.` : `${result.total}건 ${verb}했어요.`
		);
		return;
	}

	if (result.total === 1) {
		toast.error(result.reason ?? `${verb}하지 못했어요.`);
		return;
	}

	toast.error(
		`${result.total - result.failed}건 처리, ${result.failed}건 실패했어요.`
	);
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 한 화면이 유형 탭·게시판 필터·다중 선택·사유 Dialog·영구 삭제 확인을 함께 조율하는 최상위 경계다(행 액션·필터는 이미 컴포넌트로 뗐다).
export default function ModeratorContentPage() {
	const queryClient = useQueryClient();
	const [targetType, setTargetType] = useState<TargetType>("community_post");
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [reason, setReason] = useState("");
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [board, setBoard] = useState(ALL_BOARDS);
	// 영구 삭제 확인 대상(제목은 경고 문구에 그대로 쓴다). null이면 확인 창이 닫힌 상태다.
	// ids가 2건 이상이면 일괄 영구 삭제다.
	const [purging, setPurging] = useState<{
		ids: string[];
		title: string;
	} | null>(null);

	// 게시판 필터·게시판 열·영구 삭제는 커뮤니티 글에만 있다(선택·일괄 삭제는 전 탭 공통).
	const isCommunityPost = targetType === "community_post";

	const listQuery = useQuery(
		orpc.bambi.moderation.listModeratableContent.queryOptions({
			input: {
				// 게시판은 커뮤니티 글에만 있는 축이라 다른 탭에서는 보내지 않는다.
				board: isCommunityPost && board !== ALL_BOARDS ? board : undefined,
				page,
				targetType,
			},
		})
	);

	// 게시판 라벨의 정본은 DB다(빌트인 맵은 폴백). 목록 열·필터·펼친 행이 함께 쓰므로
	// 화면 최상단에서 한 번만 받는다.
	const boardsQuery = useQuery(orpc.bambi.communityBoards.list.queryOptions());
	const boardLabels = Object.fromEntries(
		(boardsQuery.data ?? []).map((item) => [item.key, item.label])
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

	const refreshList = () =>
		queryClient.invalidateQueries({
			// input 없이 호출해 유형·페이지 전체를 한 번에 무효화한다.
			queryKey: orpc.bambi.moderation.listModeratableContent.key(),
		});

	// 유형별 단건 조치 프로시저. 입력 키(postId/commentId/inquiryId)만 갈린다.
	const setStatusOnce = (
		id: string,
		input: { reason: string; status: ContentStatus }
	) => {
		if (targetType === "community_post") {
			return client.bambi.community.setPostStatusByAdmin({
				postId: id,
				...input,
			});
		}

		if (targetType === "community_comment") {
			return client.bambi.community.setCommentStatusByAdmin({
				commentId: id,
				...input,
			});
		}

		return client.bambi.moderation.setInquiryStatusByAdmin({
			inquiryId: id,
			...input,
		});
	};

	// 숨김/복구/삭제는 단건도 일괄도 같은 경로를 탄다(건수만 다르다).
	const setStatus = useMutation({
		mutationFn: async (input: {
			ids: string[];
			reason: string;
			status: ContentStatus;
		}) =>
			summarizeSettled(
				await Promise.allSettled(
					input.ids.map((id) =>
						setStatusOnce(id, { reason: input.reason, status: input.status })
					)
				)
			),
		onSuccess: async (result) => {
			toastBulkResult(result, "조치");
			setSelectedIds([]);
			closeDialog();
			await refreshList();
		},
	});

	// 영구 삭제는 사유를 받지 않는다(선행 삭제 조치에 이미 사유가 남아 있다) — 확인 창만 거친다.
	const hardDeletePosts = useMutation({
		mutationFn: async (ids: string[]) =>
			summarizeSettled(
				await Promise.allSettled(
					ids.map((postId) =>
						client.bambi.moderation.hardDeleteCommunityPost({ postId })
					)
				)
			),
		onSuccess: async (result) => {
			toastBulkResult(result, "영구 삭제");
			setPurging(null);
			setSelectedIds([]);
			await refreshList();
		},
	});

	const trimmedReason = reason.trim();
	const canSubmit =
		trimmedReason.length >= REASON_MIN_LENGTH && !setStatus.isPending;

	const confirmAction = () => {
		if (!(pending && canSubmit)) {
			return;
		}

		setStatus.mutate({
			ids: pending.ids,
			reason: trimmedReason,
			status: pending.status,
		});
	};

	const switchTargetType = (value: string) => {
		setTargetType(value as TargetType);
		setPage(1);
		// 유형이 바뀌면 펼친 행의 id가 다른 테이블 것이 되므로 접는다.
		setExpandedId(null);
		setSelectedIds([]);
		setBoard(ALL_BOARDS);
	};

	const switchBoard = (value: string) => {
		setBoard(value);
		setPage(1);
		setExpandedId(null);
		setSelectedIds([]);
	};

	const items = listQuery.data?.items ?? [];
	const targetLabel =
		TARGET_TABS.find((tab) => tab.value === targetType)?.label ?? "";
	// 펼친 행은 헤더 열 수만큼 가로로 뻗는다(게시판 열이 붙는 탭에서는 그만큼 넓다).
	const expandedColSpan =
		TABLE_COLUMN_COUNT + (isCommunityPost ? BOARD_COLUMN_COUNT : 0);
	// 값은 게시판 key 원값, 표시는 DB 라벨(운영자가 이름을 바꾸면 따라간다).
	const boardFilterItems: Record<string, string> = {
		[ALL_BOARDS]: "전체",
		...boardLabels,
	};
	const toggleSelected = (id: string) =>
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
		);
	// 선택은 상태를 가리지 않지만(삭제된 글도 영구 삭제 대상이라 골라야 한다) 조치는 갈린다:
	// 선택 삭제는 아직 삭제 아닌 것만, 선택 영구 삭제는 이미 삭제된 커뮤니티 글만 대상이다
	// (서버도 같은 조건으로 거절한다). 버튼 라벨의 건수가 곧 실제 대상 수다.
	const selectedItems = items.filter((item) => selectedIds.includes(item.id));
	const deletableIds = selectedItems
		.filter((item) => item.status !== "deleted")
		.map((item) => item.id);
	const purgeableIds = isCommunityPost
		? selectedItems
				.filter((item) => item.status === "deleted")
				.map((item) => item.id)
		: [];
	// 헤더 체크박스: 현재 페이지가 전부 선택돼 있으면 해제, 아니면 전부 선택한다.
	const pageIds = items.map((item) => item.id);
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

			{/* 게시판 필터는 커뮤니티 글 탭에서만 의미가 있다(댓글·문의에는 게시판 축이 없다).
			    특정 게시판 글을 모아 비우고 그 게시판을 지우는 흐름의 출발점이다. */}
			{isCommunityPost ? (
				<BoardFilter
					items={boardFilterItems}
					onChange={switchBoard}
					value={board}
				/>
			) : null}

			{selectedIds.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
					<span className="font-medium text-foreground text-sm">
						{selectedIds.length}개 선택됨
					</span>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							disabled={setStatus.isPending || deletableIds.length === 0}
							onClick={() =>
								setPending({
									ids: deletableIds,
									label: "삭제",
									status: "deleted",
									title: `선택한 ${targetLabel} ${deletableIds.length}건`,
								})
							}
							size="sm"
							type="button"
							variant="destructive"
						>
							선택 삭제 ({deletableIds.length})
						</Button>
						{/* 영구 삭제는 커뮤니티 글 전용이고, 이미 삭제 조치한 글만 대상이다.
						    게시판을 비우는 마지막 걸음을 한 건씩 반복하지 않게 한다. */}
						{isCommunityPost ? (
							<Button
								disabled={
									hardDeletePosts.isPending || purgeableIds.length === 0
								}
								onClick={() =>
									setPurging({
										ids: purgeableIds,
										title: `선택한 ${purgeableIds.length}건`,
									})
								}
								size="sm"
								type="button"
								variant="destructive"
							>
								선택 영구 삭제 ({purgeableIds.length})
							</Button>
						) : null}
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
							<TableHead className="w-10">
								{/* 고를 행이 하나도 없으면 눌러도 아무 일이 없는 죽은 컨트롤이 되므로
								    비활성으로 보여준다. */}
								<Checkbox
									aria-label="이 페이지 전체 선택"
									checked={allSelected}
									disabled={pageIds.length === 0}
									onCheckedChange={toggleAllOnPage}
								/>
							</TableHead>
							<TableHead className="w-10">
								<span className="sr-only">상세보기</span>
							</TableHead>
							<TableHead>내용</TableHead>
							{isCommunityPost ? <TableHead>게시판</TableHead> : null}
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
										<TableCell>
											{/* 삭제된 행도 고를 수 있다 — 커뮤니티 글은 그 상태라야 영구 삭제 대상이다. */}
											<Checkbox
												aria-label={`${item.title} 선택`}
												checked={selectedIds.includes(item.id)}
												onCheckedChange={() => toggleSelected(item.id)}
											/>
										</TableCell>
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
										{isCommunityPost ? (
											<TableCell>
												{resolveMetaLabel(item.board, null, boardLabels) ?? "—"}
											</TableCell>
										) : null}
										<TableCell>{item.authorName}</TableCell>
										<TableCell>
											<Badge variant={STATUS_BADGE_VARIANT[item.status]}>
												{CONTENT_STATUS_LABELS[item.status]}
											</Badge>
										</TableCell>
										<TableCell>{formatDateTime(item.createdAt)}</TableCell>
										<TableCell>
											<RowActions
												canHardDelete={
													isCommunityPost && item.status === "deleted"
												}
												onPurge={() =>
													setPurging({
														ids: [item.id],
														title: `「${item.title}」 글`,
													})
												}
												onSelect={(action) =>
													setPending({
														ids: [item.id],
														label: action.label,
														status: action.status,
														title: item.title,
													})
												}
												status={item.status}
											/>
										</TableCell>
									</TableRow>
									{isExpanded ? (
										<TableRow>
											<TableCell
												className="whitespace-normal bg-muted/30"
												colSpan={expandedColSpan}
											>
												<DetailPanel
													board={detailQuery.data?.board}
													boardLabels={boardLabels}
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
							disabled={setStatus.isPending}
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
							{setStatus.isPending ? "처리 중" : "확인"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* 영구 삭제는 복구 경로가 없어 확인 단계를 한 번 둔다(게시판 삭제와 같은 관례).
			    가부는 서버가 판정하고 실패 문구도 서버 것을 그대로 토스트한다. */}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPurging(null);
					}
				}}
				open={purging !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{purging?.title}을 영구 삭제할까요?
						</AlertDialogTitle>
						<AlertDialogDescription>
							되돌릴 수 없습니다. 글과 달린 댓글·추천이 DB에서 함께 사라지고,
							복구할 수 없습니다. 게시판을 비워 삭제하려는 경우에만 쓰세요.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={hardDeletePosts.isPending}
							onClick={() => {
								if (purging) {
									hardDeletePosts.mutate(purging.ids);
								}
							}}
							variant="destructive"
						>
							영구 삭제하기
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// 게시판 필터(커뮤니티 글 탭 전용). 값은 게시판 key 원값, 표시는 DB 라벨이다.
function BoardFilter({
	items,
	onChange,
	value,
}: {
	items: Record<string, string>;
	onChange: (value: string) => void;
	value: string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor="filter-board">게시판</Label>
			<Select
				items={items}
				onValueChange={(next) => onChange(String(next))}
				value={value}
			>
				<SelectTrigger className="w-48" id="filter-board">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{Object.entries(items).map(([key, label]) => (
						<SelectItem key={key} value={key}>
							{label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

// 행 우측 조치 메뉴. 현재 상태와 같은 조치는 빼고, 영구 삭제는 이미 삭제된 커뮤니티
// 글에서만 붙인다(서버도 같은 조건으로 거절한다). 목록 본체에서 떼어 내 행 렌더러의
// 분기 밀도를 낮춘다.
function RowActions({
	canHardDelete,
	onPurge,
	onSelect,
	status,
}: {
	canHardDelete: boolean;
	onPurge: () => void;
	onSelect: (action: { label: string; status: ContentStatus }) => void;
	status: ContentStatus;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button aria-label="조치 메뉴" size="icon-sm" variant="ghost">
						<MoreHorizontalIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-32">
				{STATUS_ACTIONS.filter((action) => action.status !== status).map(
					(action) => (
						<DropdownMenuItem
							key={action.status}
							onClick={() => onSelect(action)}
							variant={action.status === "deleted" ? "destructive" : "default"}
						>
							{action.label}
						</DropdownMenuItem>
					)
				)}
				{canHardDelete ? (
					<DropdownMenuItem onClick={onPurge} variant="destructive">
						영구 삭제하기
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
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
// 게시판 라벨 맵은 목록 열·필터와 같은 것을 위에서 받아 쓴다(쿼리는 화면에 하나뿐이다).
function DetailPanel({
	body,
	board,
	boardLabels,
	category,
	isLoading,
}: {
	body: string | undefined;
	board: string | null | undefined;
	boardLabels: Record<string, string>;
	category: string | null | undefined;
	isLoading: boolean;
}) {
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

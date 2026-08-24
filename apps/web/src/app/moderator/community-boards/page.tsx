"use client";

// 운영자 게시판 관리 — 수다방 게시판을 코드 배포 없이 추가하고, 이름·설명·아이콘·순서·
// 글쓰기 허용·노출을 바꾼다. 삭제는 운영자가 만든 빈 게시판에만 열려 있다: 글이 게시판
// key를 참조하므로 글이 붙은 뒤에는 지울 수 없고, 그때는 노출 스위치를 끈다(글은 그대로
// 남고 목록·홈에서만 빠진다).

import type { AppRouterClient } from "@bambi-app/api/routers/index";
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
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { isBuiltinBoardKey } from "@/lib/bambi/community";
import {
	COMMUNITY_BOARD_ICONS,
	type CommunityBoardIconName,
	communityBoardIcon,
} from "@/lib/bambi/community-board-icons";
import { orpc } from "@/utils/orpc";

type BoardRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["communityBoards"]["list"]>
>[number];

const LABEL_MAX = 30;
const SLUG_MAX = 30;
const DESCRIPTION_MAX = 200;
const SLUG_MIN = 2;
const SORT_ORDER_MAX = 10_000;
const POINTS_MAX = 100_000;
const NOTICE_BOARD_KEY = "notice";
const BEST_BOARD_KEY = "best";
const FIXED_HOME_BOARD_KEYS = new Set([NOTICE_BOARD_KEY, BEST_BOARD_KEY]);

// 서버(community-boards.ts)의 SLUG_PATTERN·RESERVED_SLUGS와 같은 말 — 왕복 전에 알려 준다.
const SLUG_HINT =
	"주소는 영소문자·숫자·하이픈·밑줄 2~30자예요. best·crawled·write와 이미 쓰는 주소는 쓸 수 없고, 만든 뒤에는 바꿀 수 없어요.";

// "아이콘 없음"을 나타내는 Select 전용 센티널. base-ui Select는 빈 문자열을 "미선택"으로
// 보므로 실제 선택지로 둘 값이 필요하다 — 서버에는 undefined(추가)·null(수정)로 나간다.
const ICON_NONE = "none";
const ICON_NONE_LABEL = "없음";

type IconValue = CommunityBoardIconName | typeof ICON_NONE;

// base-ui Select의 items는 값→라벨 맵이라 트리거에 한글 라벨이 뜬다(lucide 이름 원값 비노출).
const ICON_SELECT_ITEMS: Record<string, string> = {
	[ICON_NONE]: ICON_NONE_LABEL,
	...Object.fromEntries(
		Object.entries(COMMUNITY_BOARD_ICONS).map(([name, meta]) => [
			name,
			meta.label,
		])
	),
};

// 추가 폼·수정 다이얼로그가 같이 쓰는 아이콘 선택기. 목록에는 실제 lucide 아이콘을 함께
// 그려서 이름이 아니라 모양을 보고 고르게 한다.
function BoardIconSelect({
	id,
	onChange,
	value,
}: {
	id: string;
	onChange: (next: IconValue) => void;
	value: IconValue;
}) {
	return (
		<Select
			items={ICON_SELECT_ITEMS}
			onValueChange={(next) => onChange(String(next) as IconValue)}
			value={value}
		>
			<SelectTrigger className="w-40" id={id}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ICON_NONE}>{ICON_NONE_LABEL}</SelectItem>
				{Object.entries(COMMUNITY_BOARD_ICONS).map(
					([name, { icon: Icon, label }]) => (
						<SelectItem key={name} value={name}>
							<Icon />
							{label}
						</SelectItem>
					)
				)}
			</SelectContent>
		</Select>
	);
}

// 서버로 나가는 값 — 센티널은 "아이콘 없음"이라 추가에서는 생략, 수정에서는 null(제거)이다.
const toIconInput = (value: IconValue): CommunityBoardIconName | undefined =>
	value === ICON_NONE ? undefined : value;

// 서버에서 받은 값 → 셀렉트 상태. 웹 맵에 없는 이름(서버만 아는 값)은 "없음"으로 그린다 —
// 그릴 수 없는 아이콘을 고른 것처럼 보여 주지 않는다(수정 폼·베스트글 행 공통).
const toIconValue = (icon: string | null | undefined): IconValue =>
	icon && icon in COMMUNITY_BOARD_ICONS
		? (icon as CommunityBoardIconName)
		: ICON_NONE;

function getBoardColumns({
	onDelete,
	onEdit,
	onToggleActive,
	onToggleWritable,
}: {
	onDelete: (row: BoardRow) => void;
	onEdit: (row: BoardRow) => void;
	onToggleActive: (row: BoardRow, isActive: boolean) => void;
	onToggleWritable: (row: BoardRow, isWritable: boolean) => void;
}): DataColumn<BoardRow>[] {
	return [
		{
			id: "icon",
			header: "아이콘",
			cell: (row) => {
				const Icon = communityBoardIcon(row.icon);
				return Icon ? (
					<Icon aria-label={`${row.label} 아이콘`} className="size-4" />
				) : (
					<span className="text-muted-foreground">—</span>
				);
			},
		},
		{
			id: "label",
			header: "게시판",
			sortValue: (row) => row.label,
			cell: (row) => <span className="font-bold">{row.label}</span>,
		},
		{
			id: "slug",
			header: "주소",
			sortValue: (row) => row.slug,
			cell: (row) => (
				<Badge variant="outline">/seeker/community/{row.slug}</Badge>
			),
		},
		{
			id: "description",
			header: "설명",
			cell: (row) => (
				<span className="text-muted-foreground">{row.description || "—"}</span>
			),
		},
		{
			id: "sortOrder",
			header: "순서",
			sortValue: (row) => row.sortOrder,
			cell: (row) => (
				<span className="text-muted-foreground">{row.sortOrder}</span>
			),
		},
		{
			id: "isWritable",
			header: "글쓰기",
			cell: (row) => (
				<Switch
					aria-label={`${row.label} 글쓰기 허용`}
					checked={row.isWritable}
					onCheckedChange={(checked) => onToggleWritable(row, checked)}
				/>
			),
		},
		{
			id: "isActive",
			header: "노출",
			cell: (row) => (
				<Switch
					aria-label={`${row.label} 노출`}
					checked={row.isActive}
					onCheckedChange={(checked) => onToggleActive(row, checked)}
				/>
			),
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (row) => (
				<div className="flex justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button size="icon" type="button" variant="ghost">
									<MoreHorizontal />
									<span className="sr-only">메뉴 열기</span>
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onEdit(row)}>
								수정
							</DropdownMenuItem>
							{/* 빌트인 5종은 서버가 거절하므로 삭제 항목 자체를 감춘다. 글이 붙은
							    게시판은 눌러 봐야 서버가 막지만, 글 수를 여기서 세지 않으므로 항목은
							    남긴다. */}
							{isBuiltinBoardKey(row.key) ? null : (
								<DropdownMenuItem
									onClick={() => onDelete(row)}
									variant="destructive"
								>
									삭제
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			),
		},
	];
}

// 이름·설명·순서 수정 폼. 주소(slug)와 저장 key는 바꾸지 않는다 — 밖으로 나간 링크가 깨지고
// 이미 쓰인 글이 key를 참조한다. 대상 게시판마다 새로 마운트돼(key) 초기값이 따라온다.
function BoardEditForm({
	board,
	isPending,
	onClose,
	onSubmit,
}: {
	board: BoardRow;
	isPending: boolean;
	onClose: () => void;
	onSubmit: (values: {
		commentPoints: number;
		description: string;
		icon: CommunityBoardIconName | null;
		label: string;
		postPoints?: number;
		sortOrder: number;
	}) => void;
}) {
	// 공지는 운영자만 글을 쓰므로 글 작성 적립이 무의미하다 — 입력을 숨기고 저장 시 보내지
	// 않는다(서버도 notice postPoints를 0으로 고정한다).
	const isNotice = board.key === NOTICE_BOARD_KEY;
	const [label, setLabel] = useState(board.label);
	const [description, setDescription] = useState(board.description);
	const [sortOrder, setSortOrder] = useState(String(board.sortOrder));
	const [postPoints, setPostPoints] = useState(String(board.postPoints));
	const [commentPoints, setCommentPoints] = useState(
		String(board.commentPoints)
	);
	// 저장된 이름이 웹 맵에 없으면(서버만 아는 이름) "없음"으로 시작한다 — 그릴 수 없는
	// 값을 고른 것처럼 보여 주지 않는다.
	const [icon, setIcon] = useState<IconValue>(toIconValue(board.icon));

	const parsedSortOrder = Number(sortOrder);
	const parsedPostPoints = Number(postPoints);
	const parsedCommentPoints = Number(commentPoints);
	const canSubmit =
		label.trim().length > 0 &&
		Number.isInteger(parsedSortOrder) &&
		parsedSortOrder >= 0 &&
		parsedSortOrder <= SORT_ORDER_MAX &&
		(isNotice ||
			(Number.isInteger(parsedPostPoints) &&
				parsedPostPoints >= 0 &&
				parsedPostPoints <= POINTS_MAX)) &&
		Number.isInteger(parsedCommentPoints) &&
		parsedCommentPoints >= 0 &&
		parsedCommentPoints <= POINTS_MAX &&
		!isPending;

	return (
		<>
			<div className="flex flex-col gap-2">
				<DialogTitle>게시판 수정</DialogTitle>
				<DialogDescription>
					주소(/seeker/community/{board.slug})는 바꿀 수 없어요.
					이름·설명·아이콘·순서만 바꿉니다.
				</DialogDescription>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-board-edit-label">이름</Label>
				<Input
					id="community-board-edit-label"
					maxLength={LABEL_MAX}
					onChange={(event) => setLabel(event.target.value)}
					value={label}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-board-edit-description">설명</Label>
				<Input
					id="community-board-edit-description"
					maxLength={DESCRIPTION_MAX}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="게시판 목록·상단에 보이는 한 줄 설명"
					value={description}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-board-edit-icon">아이콘</Label>
				<BoardIconSelect
					id="community-board-edit-icon"
					onChange={setIcon}
					value={icon}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					게시판 목록·수다방 홈 카드 제목 앞에 붙습니다. 없음이면 지금처럼
					아이콘 없이 보입니다.
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-board-edit-sort">정렬 순서</Label>
				<Input
					id="community-board-edit-sort"
					inputMode="numeric"
					max={SORT_ORDER_MAX}
					min={0}
					onChange={(event) => setSortOrder(event.target.value)}
					type="number"
					value={sortOrder}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					숫자가 작을수록 앞에 놓입니다(수다방 홈·게시판 목록 공통).
				</p>
			</div>
			{isNotice ? null : (
				<div className="flex flex-col gap-2">
					<Label htmlFor="community-board-edit-post-points">
						글 작성 포인트
					</Label>
					<Input
						id="community-board-edit-post-points"
						inputMode="numeric"
						max={POINTS_MAX}
						min={0}
						onChange={(event) => setPostPoints(event.target.value)}
						type="number"
						value={postPoints}
					/>
				</div>
			)}
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-board-edit-comment-points">
					댓글 작성 포인트
				</Label>
				<Input
					id="community-board-edit-comment-points"
					inputMode="numeric"
					max={POINTS_MAX}
					min={0}
					onChange={(event) => setCommentPoints(event.target.value)}
					type="number"
					value={commentPoints}
				/>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button onClick={onClose} type="button" variant="outline">
					취소
				</Button>
				<Button
					disabled={!canSubmit}
					onClick={() =>
						onSubmit({
							commentPoints: parsedCommentPoints,
							description: description.trim(),
							// 수정은 "없음"을 null로 보내 저장된 아이콘을 지운다.
							icon: toIconInput(icon) ?? null,
							label: label.trim(),
							// 공지는 글 작성 포인트를 보내지 않는다 — 서버가 0으로 고정한다.
							postPoints: isNotice ? undefined : parsedPostPoints,
							sortOrder: parsedSortOrder,
						})
					}
					type="button"
				>
					{isPending ? "저장 중" : "저장"}
				</Button>
			</div>
		</>
	);
}

function NativeBoardDropTarget({
	children,
	className,
	dragKey,
	onBoardDrop,
}: {
	children: ReactNode;
	className: string;
	dragKey?: string;
	onBoardDrop: (boardKey: string) => void;
}) {
	const elementRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const element = elementRef.current;
		if (!element) {
			return;
		}
		const handleDragOver = (event: globalThis.DragEvent) => {
			event.preventDefault();
		};
		const handleDrop = (event: globalThis.DragEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const boardKey = event.dataTransfer?.getData("text/board-key");
			if (boardKey) {
				onBoardDrop(boardKey);
			}
		};
		const handleDragStart = (event: globalThis.DragEvent) => {
			if (dragKey) {
				event.dataTransfer?.setData("text/board-key", dragKey);
			}
		};

		element.addEventListener("dragover", handleDragOver);
		element.addEventListener("drop", handleDrop);
		if (dragKey) {
			element.draggable = true;
			element.addEventListener("dragstart", handleDragStart);
		}
		return () => {
			element.removeEventListener("dragover", handleDragOver);
			element.removeEventListener("drop", handleDrop);
			element.removeEventListener("dragstart", handleDragStart);
		};
	}, [dragKey, onBoardDrop]);

	return (
		<div className={className} ref={elementRef}>
			{children}
		</div>
	);
}

function HomeLayoutEditor({
	boards,
	isPending,
	onSave,
	rows,
	setRows,
}: {
	boards: { key: string; label: string }[];
	isPending: boolean;
	onSave: () => void;
	rows: string[][];
	setRows: (rows: string[][]) => void;
}) {
	const [additions, setAdditions] = useState<Record<number, string>>({});
	const labels = new Map(boards.map((board) => [board.key, board.label]));
	const assigned = new Set(rows.flat());
	const unassigned = boards.filter((board) => !assigned.has(board.key));
	const availableItems = Object.fromEntries(
		unassigned.map((board) => [board.key, board.label])
	);
	const moveBoard = (
		boardKey: string,
		targetRow: number,
		targetIndex?: number
	) => {
		if (FIXED_HOME_BOARD_KEYS.has(boardKey) || targetRow === 0) {
			return;
		}
		const next = rows.map((row) => row.filter((key) => key !== boardKey));
		const requestedInsertion = targetIndex ?? next[targetRow]?.length ?? 0;
		const insertion =
			targetRow === 1 ? Math.max(1, requestedInsertion) : requestedInsertion;
		next[targetRow]?.splice(insertion, 0, boardKey);
		setRows(next.filter((row) => row.length > 0));
	};
	return (
		<section className="flex flex-col gap-3 rounded-xl border border-border p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="m-0 font-bold text-lg">수다방 홈 행 배치</h2>
					<p className="m-0 text-muted-foreground text-sm">
						게시판을 드래그하거나 각 행의 + 선택기로 넣으세요. 행에서 제거해도
						게시판과 글은 삭제되지 않습니다.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						disabled={rows.some((row) => row.length === 0)}
						onClick={() => setRows([...rows, []])}
						type="button"
						variant="outline"
					>
						행 추가
					</Button>
					<Button disabled={isPending} onClick={onSave} type="button">
						{isPending ? "저장 중" : "배치 저장"}
					</Button>
				</div>
			</div>
			<div className="flex flex-col gap-3">
				{rows.map((row, rowIndex) => (
					<NativeBoardDropTarget
						className="flex min-h-20 flex-wrap items-center gap-2 rounded-lg border border-border border-dashed bg-secondary/50 p-3"
						key={row.join("|") || "empty-home-row"}
						onBoardDrop={(boardKey) => moveBoard(boardKey, rowIndex)}
					>
						<span className="mr-1 font-bold text-muted-foreground text-sm">
							{rowIndex + 1}행
						</span>
						{row.map((boardKey, position) => (
							<NativeBoardDropTarget
								className={`flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm ${
									FIXED_HOME_BOARD_KEYS.has(boardKey) ? "" : "cursor-grab"
								}`}
								dragKey={
									FIXED_HOME_BOARD_KEYS.has(boardKey) ? undefined : boardKey
								}
								key={boardKey}
								onBoardDrop={(droppedBoardKey) =>
									moveBoard(droppedBoardKey, rowIndex, position)
								}
							>
								<span aria-hidden>⋮⋮</span>
								<span className="font-bold text-sm">
									{labels.get(boardKey) ?? boardKey}
								</span>
								{FIXED_HOME_BOARD_KEYS.has(boardKey) ? (
									<span className="text-muted-foreground text-xs">고정</span>
								) : (
									<button
										aria-label={`${labels.get(boardKey) ?? boardKey} 홈 배치에서 제거`}
										className="text-muted-foreground hover:text-foreground"
										onClick={() => {
											const next = rows
												.map((item) => item.filter((key) => key !== boardKey))
												.filter((item) => item.length > 0);
											setRows(next);
										}}
										type="button"
									>
										×
									</button>
								)}
							</NativeBoardDropTarget>
						))}
						{unassigned.length > 0 ? (
							<div className="ml-auto flex items-center gap-2">
								<Select
									items={availableItems}
									onValueChange={(value) =>
										setAdditions((current) => ({
											...current,
											[rowIndex]: String(value),
										}))
									}
									value={additions[rowIndex]}
								>
									<SelectTrigger
										aria-label={`${rowIndex + 1}행 게시판 선택`}
										className="w-40"
									>
										<SelectValue placeholder="게시판 선택" />
									</SelectTrigger>
									<SelectContent>
										{unassigned.map((board) => (
											<SelectItem key={board.key} value={board.key}>
												{board.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									disabled={!additions[rowIndex]}
									onClick={() => {
										const key = additions[rowIndex];
										if (key) {
											moveBoard(key, rowIndex);
											setAdditions((current) => ({
												...current,
												[rowIndex]: "",
											}));
										}
									}}
									size="sm"
									type="button"
								>
									+
								</Button>
							</div>
						) : null}
					</NativeBoardDropTarget>
				))}
			</div>
			{unassigned.length > 0 ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-bold text-muted-foreground text-sm">
						미배치 게시판
					</span>
					{unassigned.map((board) => (
						<button
							className="cursor-grab rounded-full border border-border bg-card px-3 py-1 text-sm"
							draggable
							key={board.key}
							onDragStart={(event) =>
								event.dataTransfer.setData("text/board-key", board.key)
							}
							type="button"
						>
							{board.label}
						</button>
					))}
				</div>
			) : null}
		</section>
	);
}

export default function ModeratorCommunityBoardsPage() {
	const queryClient = useQueryClient();
	const [label, setLabel] = useState("");
	const [slug, setSlug] = useState("");
	const [description, setDescription] = useState("");
	const [icon, setIcon] = useState<IconValue>(ICON_NONE);
	const [postPoints, setPostPoints] = useState("0");
	const [commentPoints, setCommentPoints] = useState("0");
	const [editing, setEditing] = useState<BoardRow | null>(null);
	const [deleting, setDeleting] = useState<BoardRow | null>(null);

	const listQuery = useQuery(orpc.bambi.communityBoards.list.queryOptions());
	const homeLayoutQuery = useQuery(
		orpc.bambi.communityBoards.getHomeLayout.queryOptions()
	);
	const [homeRows, setHomeRows] = useState<string[][]>([]);
	useEffect(() => {
		if (!homeLayoutQuery.data) {
			return;
		}
		const grouped = new Map<number, string[]>();
		for (const item of homeLayoutQuery.data) {
			grouped.set(item.rowIndex, [
				...(grouped.get(item.rowIndex) ?? []),
				item.boardKey,
			]);
		}
		const storedRows = [...grouped.entries()]
			.sort(([a], [b]) => a - b)
			.map(([, row]) => row);
		const bestRowIndex = storedRows.findIndex((row) =>
			row.includes(BEST_BOARD_KEY)
		);
		const bestRow =
			bestRowIndex >= 0
				? (storedRows[bestRowIndex]?.filter(
						(key) => !FIXED_HOME_BOARD_KEYS.has(key)
					) ?? [])
				: [];
		const remainingRows = storedRows
			.map((row, index) =>
				index === bestRowIndex
					? []
					: row.filter((key) => !FIXED_HOME_BOARD_KEYS.has(key))
			)
			.filter((row) => row.length > 0);
		setHomeRows([
			[NOTICE_BOARD_KEY],
			[BEST_BOARD_KEY, ...bestRow],
			...remainingRows,
		]);
	}, [homeLayoutQuery.data]);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.communityBoards.key(),
		});
	};

	// 베스트글은 community_board 행이 없는 가상 게시판이라 목록(list) 쿼리에 안 잡힌다 —
	// 아이콘은 site_settings에서 별도로 읽고 쓴다.
	const bestIconQuery = useQuery(
		orpc.bambi.communityBoards.getBestBoardIcon.queryOptions()
	);
	const [bestIcon, setBestIcon] = useState<IconValue>(ICON_NONE);

	useEffect(() => {
		if (bestIconQuery.data) {
			setBestIcon(toIconValue(bestIconQuery.data.icon));
		}
	}, [bestIconQuery.data]);

	const bestIconMutation = useMutation(
		orpc.bambi.communityBoards.updateBestBoardIcon.mutationOptions({
			onError: (error) =>
				toast(error.message || "베스트글 아이콘을 저장하지 못했어요."),
			onSuccess: async () => {
				toast("베스트글 아이콘을 저장했어요.");
				await invalidate();
			},
		})
	);

	const createMutation = useMutation(
		orpc.bambi.communityBoards.create.mutationOptions({
			onError: (error) => toast(error.message || "게시판을 만들지 못했어요."),
			onSuccess: async () => {
				toast("게시판을 만들었어요.");
				setLabel("");
				setSlug("");
				setDescription("");
				setIcon(ICON_NONE);
				setPostPoints("0");
				setCommentPoints("0");
				await invalidate();
			},
		})
	);

	const updateMutation = useMutation(
		orpc.bambi.communityBoards.update.mutationOptions({
			onError: (error) => toast(error.message || "게시판을 수정하지 못했어요."),
			onSuccess: async () => {
				toast("게시판을 수정했어요.");
				setEditing(null);
				await invalidate();
			},
		})
	);
	const homeLayoutMutation = useMutation(
		orpc.bambi.communityBoards.updateHomeLayout.mutationOptions({
			onError: (error) =>
				toast(error.message || "홈 배치를 저장하지 못했어요."),
			onSuccess: async () => {
				toast("수다방 홈 배치를 저장했어요.");
				await invalidate();
			},
		})
	);

	const setActiveMutation = useMutation(
		orpc.bambi.communityBoards.setActive.mutationOptions({
			onError: (error) => toast(error.message || "노출을 바꾸지 못했어요."),
			onSuccess: invalidate,
		})
	);

	// 삭제 거절 사유(기본 게시판·글 있음)는 서버 문구를 그대로 띄운다 — 화면이 같은 판정을
	// 두 벌로 들고 있다가 어긋나는 걸 막는다.
	const removeMutation = useMutation(
		orpc.bambi.communityBoards.remove.mutationOptions({
			onError: (error) => toast(error.message || "게시판을 삭제하지 못했어요."),
			onSuccess: async () => {
				toast("게시판을 삭제했어요.");
				setDeleting(null);
				await invalidate();
			},
		})
	);

	const parsedPostPoints = Number(postPoints);
	const parsedCommentPoints = Number(commentPoints);
	const canCreate =
		label.trim().length > 0 &&
		slug.trim().length >= SLUG_MIN &&
		Number.isInteger(parsedPostPoints) &&
		parsedPostPoints >= 0 &&
		parsedPostPoints <= POINTS_MAX &&
		Number.isInteger(parsedCommentPoints) &&
		parsedCommentPoints >= 0 &&
		parsedCommentPoints <= POINTS_MAX &&
		!createMutation.isPending;

	const boards = listQuery.data ?? [];
	const BestIcon = communityBoardIcon(toIconInput(bestIcon));
	const columns = getBoardColumns({
		onDelete: setDeleting,
		onEdit: setEditing,
		onToggleActive: (row, isActive) =>
			setActiveMutation.mutate({ isActive, key: row.key }),
		onToggleWritable: (row, isWritable) =>
			updateMutation.mutate({ isWritable, key: row.key }),
	});

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">게시판 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					수다방 게시판을 추가하고 이름·설명·아이콘·순서를 정합니다. 글쓰기를
					끄면 읽기 전용이 되고, 노출을 끄면 목록·수다방 홈에서 사라집니다(쓴
					글은 지워지지 않습니다). 새로 만든 게시판은 회원이 읽고 쓰는 일반
					게시판으로, 비회원(본인인증 게스트)은 참여할 수 없습니다. 삭제는 글이
					하나도 없는 새 게시판만 가능하고, 기본 게시판은 지울 수 없습니다.
				</p>
			</div>

			<HomeLayoutEditor
				boards={[
					{ key: BEST_BOARD_KEY, label: "베스트글" },
					...boards.map((board) => ({ key: board.key, label: board.label })),
				]}
				isPending={homeLayoutMutation.isPending}
				onSave={() =>
					homeLayoutMutation.mutate({
						rows: homeRows.filter((row) => row.length > 0),
					})
				}
				rows={homeRows}
				setRows={setHomeRows}
			/>

			<div className="flex flex-col gap-2">
				<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
					<div className="flex flex-col gap-2">
						<Label htmlFor="community-board-new-label">이름</Label>
						<Input
							className="sm:w-48"
							id="community-board-new-label"
							maxLength={LABEL_MAX}
							onChange={(event) => setLabel(event.target.value)}
							placeholder="예: 뷰티 수다"
							value={label}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="community-board-new-slug">주소</Label>
						<Input
							className="sm:w-48"
							id="community-board-new-slug"
							maxLength={SLUG_MAX}
							onChange={(event) => setSlug(event.target.value)}
							placeholder="예: beauty-talk"
							value={slug}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="community-board-new-icon">아이콘</Label>
						<BoardIconSelect
							id="community-board-new-icon"
							onChange={setIcon}
							value={icon}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="community-board-new-post-points">
							글 작성 포인트
						</Label>
						<Input
							className="sm:w-32"
							id="community-board-new-post-points"
							inputMode="numeric"
							max={POINTS_MAX}
							min={0}
							onChange={(event) => setPostPoints(event.target.value)}
							type="number"
							value={postPoints}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="community-board-new-comment-points">
							댓글 작성 포인트
						</Label>
						<Input
							className="sm:w-32"
							id="community-board-new-comment-points"
							inputMode="numeric"
							max={POINTS_MAX}
							min={0}
							onChange={(event) => setCommentPoints(event.target.value)}
							type="number"
							value={commentPoints}
						/>
					</div>
					<div className="flex flex-1 flex-col gap-2">
						<Label htmlFor="community-board-new-description">설명</Label>
						<Input
							id="community-board-new-description"
							maxLength={DESCRIPTION_MAX}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="게시판 상단에 보이는 한 줄 설명"
							value={description}
						/>
					</div>
					<Button
						disabled={!canCreate}
						onClick={() =>
							createMutation.mutate({
								commentPoints: parsedCommentPoints,
								description: description.trim(),
								icon: toIconInput(icon),
								label: label.trim(),
								postPoints: parsedPostPoints,
								slug: slug.trim(),
							})
						}
						type="button"
					>
						{createMutation.isPending ? "추가 중" : "게시판 추가"}
					</Button>
				</div>
				<p className="m-0 text-muted-foreground text-xs">{SLUG_HINT}</p>
			</div>

			{/* 베스트글은 community_board 행이 없는 가상 게시판이라 위 목록에 없다 — 삭제·
			    글쓰기·노출 스위치는 의미가 없고 아이콘 지정만 있다. */}
			<div className="flex flex-col gap-3 rounded-xl border border-border p-4">
				<div className="flex flex-wrap items-center gap-2">
					{BestIcon ? (
						<BestIcon aria-label="베스트글 아이콘" className="size-4" />
					) : (
						<span className="text-muted-foreground">—</span>
					)}
					<span className="font-bold">베스트글</span>
					<Badge variant="outline">가상 게시판</Badge>
				</div>
				<p className="m-0 text-muted-foreground text-sm">
					최근 30일 동안 추천을 많이 받은 글을 모아 보여주는 가상 게시판이라
					목록에 없고 삭제할 수 없어요. 아이콘만 지정할 수 있고, 없음이면 기존
					코럴 액센트 바로 보여요.
				</p>
				<div className="flex flex-wrap items-end gap-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="community-board-best-icon">아이콘</Label>
						<BoardIconSelect
							id="community-board-best-icon"
							onChange={setBestIcon}
							value={bestIcon}
						/>
					</div>
					<Button
						disabled={bestIconMutation.isPending || bestIconQuery.isPending}
						onClick={() =>
							bestIconMutation.mutate({ icon: toIconInput(bestIcon) ?? null })
						}
						type="button"
					>
						{bestIconMutation.isPending ? "저장 중" : "저장"}
					</Button>
				</div>
			</div>

			{listQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{listQuery.isError ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{listQuery.isSuccess ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<DataTable
						columns={columns}
						data={boards}
						emptyMessage="등록된 게시판이 없어요."
						getRowKey={(row) => row.key}
					/>
				</div>
			) : null}

			{/* 수정 폼은 목록 밖에 하나만 두고 대상만 갈아끼운다(행마다 Dialog를 두면
			    게시판 수만큼 마운트된다 — 게시물 조치 화면과 같은 관례). */}
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setEditing(null);
					}
				}}
				open={editing !== null}
			>
				<DialogContent>
					{editing ? (
						<BoardEditForm
							board={editing}
							isPending={updateMutation.isPending}
							key={editing.key}
							onClose={() => setEditing(null)}
							onSubmit={(values) =>
								updateMutation.mutate({ ...values, key: editing.key })
							}
						/>
					) : null}
				</DialogContent>
			</Dialog>

			{/* 삭제는 되돌릴 수 없어 확인 단계를 한 번 둔다(금칙어 전체 삭제와 같은 관례).
			    실제 가부(기본 게시판·글 있음)는 서버가 판정하고 문구도 서버 것을 띄운다. */}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setDeleting(null);
					}
				}}
				open={deleting !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{deleting?.label} 게시판을 삭제할까요?
						</AlertDialogTitle>
						<AlertDialogDescription>
							되돌릴 수 없습니다. 글이 하나라도 있는 게시판은 삭제되지 않으니,
							그럴 때는 노출 스위치를 끄세요.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={removeMutation.isPending}
							onClick={() => {
								if (deleting) {
									removeMutation.mutate({ key: deleting.key });
								}
							}}
							variant="destructive"
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

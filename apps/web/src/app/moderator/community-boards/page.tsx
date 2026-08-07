"use client";

// 운영자 게시판 관리 — 수다방 게시판을 코드 배포 없이 추가하고, 이름·설명·순서·글쓰기 허용·
// 노출을 바꾼다. 삭제 버튼은 없다: 글이 게시판 key를 참조하므로 지우면 과거 글이 함께
// 사라진다. 감출 때는 노출 스위치를 끈다(글은 그대로 남고 목록·홈에서만 빠진다).

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { orpc } from "@/utils/orpc";

type BoardRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["communityBoards"]["list"]>
>[number];

const LABEL_MAX = 30;
const SLUG_MAX = 30;
const DESCRIPTION_MAX = 200;
const SLUG_MIN = 2;
const SORT_ORDER_MAX = 10_000;

// 서버(community-boards.ts)의 SLUG_PATTERN·RESERVED_SLUGS와 같은 말 — 왕복 전에 알려 준다.
const SLUG_HINT =
	"주소는 영소문자·숫자·하이픈·밑줄 2~30자예요. best·crawled·write와 이미 쓰는 주소는 쓸 수 없고, 만든 뒤에는 바꿀 수 없어요.";

function getBoardColumns({
	onEdit,
	onToggleActive,
	onToggleWritable,
}: {
	onEdit: (row: BoardRow) => void;
	onToggleActive: (row: BoardRow, isActive: boolean) => void;
	onToggleWritable: (row: BoardRow, isWritable: boolean) => void;
}): DataColumn<BoardRow>[] {
	return [
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
				<Button
					onClick={() => onEdit(row)}
					size="sm"
					type="button"
					variant="outline"
				>
					수정
				</Button>
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
		description: string;
		label: string;
		sortOrder: number;
	}) => void;
}) {
	const [label, setLabel] = useState(board.label);
	const [description, setDescription] = useState(board.description);
	const [sortOrder, setSortOrder] = useState(String(board.sortOrder));

	const parsedSortOrder = Number(sortOrder);
	const canSubmit =
		label.trim().length > 0 &&
		Number.isInteger(parsedSortOrder) &&
		parsedSortOrder >= 0 &&
		parsedSortOrder <= SORT_ORDER_MAX &&
		!isPending;

	return (
		<>
			<div className="flex flex-col gap-2">
				<DialogTitle>게시판 수정</DialogTitle>
				<DialogDescription>
					주소(/seeker/community/{board.slug})는 바꿀 수 없어요.
					이름·설명·순서만 바꿉니다.
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
			<div className="grid grid-cols-2 gap-2">
				<Button onClick={onClose} type="button" variant="outline">
					취소
				</Button>
				<Button
					disabled={!canSubmit}
					onClick={() =>
						onSubmit({
							description: description.trim(),
							label: label.trim(),
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

export default function ModeratorCommunityBoardsPage() {
	const queryClient = useQueryClient();
	const [label, setLabel] = useState("");
	const [slug, setSlug] = useState("");
	const [description, setDescription] = useState("");
	const [editing, setEditing] = useState<BoardRow | null>(null);

	const listQuery = useQuery(orpc.bambi.communityBoards.list.queryOptions());

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.communityBoards.key(),
		});
	};

	const createMutation = useMutation(
		orpc.bambi.communityBoards.create.mutationOptions({
			onError: (error) => toast(error.message || "게시판을 만들지 못했어요."),
			onSuccess: async () => {
				toast("게시판을 만들었어요.");
				setLabel("");
				setSlug("");
				setDescription("");
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

	const setActiveMutation = useMutation(
		orpc.bambi.communityBoards.setActive.mutationOptions({
			onError: (error) => toast(error.message || "노출을 바꾸지 못했어요."),
			onSuccess: invalidate,
		})
	);

	const boards = listQuery.data ?? [];
	const columns = getBoardColumns({
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
					수다방 게시판을 추가하고 이름·설명·순서를 정합니다. 글쓰기를 끄면 읽기
					전용이 되고, 노출을 끄면 목록·수다방 홈에서 사라집니다(쓴 글은
					지워지지 않습니다). 새로 만든 게시판은 회원이 읽고 쓰는 일반
					게시판으로, 비회원(본인인증 게스트)은 참여할 수 없습니다.
				</p>
			</div>

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
						disabled={
							label.trim().length === 0 ||
							slug.trim().length < SLUG_MIN ||
							createMutation.isPending
						}
						onClick={() =>
							createMutation.mutate({
								description: description.trim(),
								label: label.trim(),
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
		</div>
	);
}

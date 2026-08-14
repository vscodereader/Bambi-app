"use client";

// 운영자 회원 등급 관리 — 누적 포인트 기준(min_points)으로 회원 등급을 코드 배포 없이
// 추가·수정·삭제한다. 목록은 서버가 min_points 오름차순으로 내려준다. 기본 등급(0포인트)이
// 마지막 하나면 서버가 삭제를 막고, 그 문구를 그대로 toast로 띄운다.

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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { GradeBadge } from "@/components/bambi/grade-badge";
import { orpc } from "@/utils/orpc";

type GradeRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["memberGrades"]["list"]>
>[number];

const NAME_MAX = 20;
const MIN_POINTS_MAX = 10_000_000;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// 서버(member-grades.ts)의 createGradeInput과 같은 판정 — 왕복 전에 막는다. color는 비우면
// 화면 기본색이고, 채우면 #rrggbb 6자리여야 한다.
function isValidColor(color: string): boolean {
	return color.trim().length === 0 || HEX_COLOR.test(color.trim());
}

// 비운 color는 서버에 undefined(생략)로 보내 화면 기본색을 쓴다.
function toColorInput(color: string): string | undefined {
	const trimmed = color.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function getGradeColumns({
	onDelete,
	onEdit,
}: {
	onDelete: (row: GradeRow) => void;
	onEdit: (row: GradeRow) => void;
}): DataColumn<GradeRow>[] {
	return [
		{
			id: "badge",
			header: "뱃지",
			cell: (row) => <GradeBadge grade={row} />,
		},
		{
			id: "name",
			header: "등급명",
			sortValue: (row) => row.name,
			cell: (row) => <span className="font-bold">{row.name}</span>,
		},
		{
			id: "minPoints",
			header: "기준 포인트",
			sortValue: (row) => row.minPoints,
			cell: (row) => (
				<span className="tabular-nums">
					{row.minPoints.toLocaleString()}P 이상
				</span>
			),
		},
		{
			id: "color",
			header: "색(hex)",
			cell: (row) => (
				<span className="text-muted-foreground tabular-nums">
					{row.color ?? "—"}
				</span>
			),
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (row) => (
				<div className="flex justify-end gap-2">
					<Button
						onClick={() => onEdit(row)}
						size="sm"
						type="button"
						variant="outline"
					>
						수정
					</Button>
					<Button
						onClick={() => onDelete(row)}
						size="sm"
						type="button"
						variant="destructive"
					>
						삭제
					</Button>
				</div>
			),
		},
	];
}

// 이름·기준 포인트·색 수정 폼. 대상 등급마다 새로 마운트돼(key) 초기값이 따라온다.
function GradeEditForm({
	grade,
	isPending,
	onClose,
	onSubmit,
}: {
	grade: GradeRow;
	isPending: boolean;
	onClose: () => void;
	onSubmit: (values: {
		color: string | undefined;
		minPoints: number;
		name: string;
	}) => void;
}) {
	const [name, setName] = useState(grade.name);
	const [minPoints, setMinPoints] = useState(String(grade.minPoints));
	const [color, setColor] = useState(grade.color ?? "");

	const parsedMinPoints = Number(minPoints);
	const canSubmit =
		name.trim().length > 0 &&
		Number.isInteger(parsedMinPoints) &&
		parsedMinPoints >= 0 &&
		parsedMinPoints <= MIN_POINTS_MAX &&
		isValidColor(color) &&
		!isPending;

	return (
		<>
			<div className="flex flex-col gap-2">
				<DialogTitle>등급 수정</DialogTitle>
				<DialogDescription>
					이름·기준 포인트·뱃지 색을 바꿉니다.
				</DialogDescription>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="member-grade-edit-name">등급명</Label>
				<Input
					id="member-grade-edit-name"
					maxLength={NAME_MAX}
					onChange={(event) => setName(event.target.value)}
					value={name}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="member-grade-edit-points">기준 포인트</Label>
				<Input
					id="member-grade-edit-points"
					inputMode="numeric"
					max={MIN_POINTS_MAX}
					min={0}
					onChange={(event) => setMinPoints(event.target.value)}
					type="number"
					value={minPoints}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					이 포인트 이상을 쌓은 회원에게 부여됩니다. 등급끼리 같은 값은 쓸 수
					없어요.
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="member-grade-edit-color">뱃지 색(hex)</Label>
				<Input
					id="member-grade-edit-color"
					onChange={(event) => setColor(event.target.value)}
					placeholder="예: #ff6b6b"
					value={color}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					비우면 기본색으로 보입니다. 채우려면 #rrggbb 6자리로 입력하세요.
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
							color: toColorInput(color),
							minPoints: parsedMinPoints,
							name: name.trim(),
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

export default function ModeratorMemberGradesPage() {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [minPoints, setMinPoints] = useState("");
	const [color, setColor] = useState("");
	const [editing, setEditing] = useState<GradeRow | null>(null);
	const [deleting, setDeleting] = useState<GradeRow | null>(null);

	const listQuery = useQuery(orpc.bambi.memberGrades.list.queryOptions());

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.memberGrades.key(),
		});
	};

	const createMutation = useMutation(
		orpc.bambi.memberGrades.create.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "등급을 만들지 못했어요."),
			onSuccess: async () => {
				toast.success("등급을 만들었어요.");
				setName("");
				setMinPoints("");
				setColor("");
				await invalidate();
			},
		})
	);

	const updateMutation = useMutation(
		orpc.bambi.memberGrades.update.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "등급을 수정하지 못했어요."),
			onSuccess: async () => {
				toast.success("등급을 수정했어요.");
				setEditing(null);
				await invalidate();
			},
		})
	);

	// 삭제 거절 사유(기본 등급 보호)는 서버 문구를 그대로 띄운다 — 화면이 같은 판정을 두 벌로
	// 들고 있다가 어긋나는 걸 막는다.
	const removeMutation = useMutation(
		orpc.bambi.memberGrades.remove.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "등급을 삭제하지 못했어요."),
			onSuccess: async () => {
				toast.success("등급을 삭제했어요.");
				setDeleting(null);
				await invalidate();
			},
		})
	);

	const grades = listQuery.data ?? [];
	const parsedNewMinPoints = Number(minPoints);
	const canCreate =
		name.trim().length > 0 &&
		Number.isInteger(parsedNewMinPoints) &&
		parsedNewMinPoints >= 0 &&
		parsedNewMinPoints <= MIN_POINTS_MAX &&
		isValidColor(color) &&
		!createMutation.isPending;

	const columns = getGradeColumns({
		onDelete: setDeleting,
		onEdit: setEditing,
	});

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">등급 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					누적 포인트 기준으로 회원 등급을 정합니다. 회원은 자신의 누적 포인트가
					기준 포인트 이상인 등급 중 가장 높은 등급을 받습니다. 기준 포인트가
					0인 기본 등급은 최소 하나 남아 있어야 하며, 그 외 등급은 자유롭게
					추가·수정·삭제할 수 있습니다.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
					<div className="flex flex-col gap-2">
						<Label htmlFor="member-grade-new-name">등급명</Label>
						<Input
							className="sm:w-48"
							id="member-grade-new-name"
							maxLength={NAME_MAX}
							onChange={(event) => setName(event.target.value)}
							placeholder="예: 일반"
							value={name}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="member-grade-new-points">기준 포인트</Label>
						<Input
							className="sm:w-40"
							id="member-grade-new-points"
							inputMode="numeric"
							max={MIN_POINTS_MAX}
							min={0}
							onChange={(event) => setMinPoints(event.target.value)}
							placeholder="예: 1000"
							type="number"
							value={minPoints}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="member-grade-new-color">뱃지 색(hex)</Label>
						<Input
							className="sm:w-40"
							id="member-grade-new-color"
							onChange={(event) => setColor(event.target.value)}
							placeholder="예: #ff6b6b"
							value={color}
						/>
					</div>
					<Button
						disabled={!canCreate}
						onClick={() =>
							createMutation.mutate({
								color: toColorInput(color),
								minPoints: parsedNewMinPoints,
								name: name.trim(),
							})
						}
						type="button"
					>
						{createMutation.isPending ? "추가 중" : "등급 추가"}
					</Button>
				</div>
				<p className="m-0 text-muted-foreground text-xs">
					색은 비우면 기본색으로 보입니다. 채우려면 #rrggbb 6자리로 입력하세요.
					같은 기준 포인트의 등급은 만들 수 없습니다.
				</p>
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
						data={grades}
						emptyMessage="등록된 등급이 없어요."
						getRowKey={(row) => row.id}
					/>
				</div>
			) : null}

			{/* 수정 폼은 목록 밖에 하나만 두고 대상만 갈아끼운다(게시판 관리와 같은 관례). */}
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
						<GradeEditForm
							grade={editing}
							isPending={updateMutation.isPending}
							key={editing.id}
							onClose={() => setEditing(null)}
							onSubmit={(values) =>
								updateMutation.mutate({ ...values, id: editing.id })
							}
						/>
					) : null}
				</DialogContent>
			</Dialog>

			{/* 삭제는 되돌릴 수 없어 확인 단계를 한 번 둔다. 기본 등급 보호는 서버가 판정하고
			    문구도 서버 것을 띄운다. */}
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
							{deleting?.name} 등급을 삭제할까요?
						</AlertDialogTitle>
						<AlertDialogDescription>
							되돌릴 수 없습니다. 이 등급에 해당하던 회원은 다음으로 낮은 등급을
							받게 됩니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={removeMutation.isPending}
							onClick={() => {
								if (deleting) {
									removeMutation.mutate({ id: deleting.id });
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

"use client";

// 댓글 마일스톤 관리 — 회원의 누적 댓글 수가 정해진 회차에 도달하면 보너스 포인트를 한 번
// 지급한다. 회차별 지급 포인트를 코드 배포 없이 추가·수정·삭제한다. 자체 쿼리·상태만 쓴다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
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
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { RowActions } from "@/components/bambi/row-actions";
import { orpc } from "@/utils/orpc";

type MilestoneRow = Awaited<
	ReturnType<
		AppRouterClient["bambi"]["memberGrades"]["commentMilestones"]["list"]
	>
>["milestones"][number];

// 서버(member-grades.ts)의 마일스톤 입력 한계와 같은 값 — 왕복 전에 막는다.
const MILESTONE_COUNT_MAX = 1_000_000;
const MILESTONE_BONUS_MAX = 1_000_000;
const MILESTONE_INPUT_ERROR =
	"댓글 회차와 보너스 포인트는 1 이상의 정수로 입력해 주세요.";
const HANGUL_CHAR = /[가-힣]/;

// orpc 입력 검증 실패는 error.message가 영어로 와서 화면에 그대로 노출하면 안 된다. 서버가
// 명시적으로 던진 한국어 문구(중복 가드 등, 한글 포함)만 그대로 띄우고, 그 외(검증 실패·빈
// 메시지)는 한국어 폴백으로 덮는다.
function localizedMilestoneError(
	message: string | undefined,
	fallback: string
): string {
	return message && HANGUL_CHAR.test(message) ? message : fallback;
}

// 1 이상 상한 이하의 정수만 통과. 최종 범위 검증은 서버 스키마가 맡는다.
function isValidMilestoneValue(raw: string, max: number): boolean {
	const parsed = Number(raw.trim());
	return Number.isInteger(parsed) && parsed >= 1 && parsed <= max;
}

// 정렬 키: 당첨 완료(2) > 지나감(1) > 대기(0). 배지와 같은 판정을 숫자로만 편다.
function milestoneStatusRank(
	row: MilestoneRow,
	totalCommentCount: number
): number {
	if (row.awarded) {
		return 2;
	}
	return row.commentCount <= totalCommentCount ? 1 : 0;
}

// 전역 선착 모델의 달성 상태 배지. award가 있으면 당첨 완료, 없으면 현재 전체 댓글 수와
// 회차를 비교해 이미 지나갔는지(지나감·영구 미달성) 아직 안 왔는지(대기)를 가른다.
function MilestoneStatusBadge({
	awarded,
	commentCount,
	totalCommentCount,
}: {
	awarded: boolean;
	commentCount: number;
	totalCommentCount: number;
}) {
	if (awarded) {
		return <Badge variant="success">당첨 완료</Badge>;
	}
	if (commentCount <= totalCommentCount) {
		return <Badge variant="outline">지나감</Badge>;
	}
	return <Badge variant="secondary">대기</Badge>;
}

function getMilestoneColumns({
	onDelete,
	onEdit,
	totalCommentCount,
}: {
	onDelete: (row: MilestoneRow) => void;
	onEdit: (row: MilestoneRow) => void;
	totalCommentCount: number;
}): DataColumn<MilestoneRow>[] {
	return [
		{
			id: "commentCount",
			header: "댓글 회차",
			sortValue: (row) => row.commentCount,
			cell: (row) => (
				<span className="font-bold tabular-nums">
					전체 {row.commentCount.toLocaleString()}번째
				</span>
			),
		},
		{
			id: "bonusPoints",
			header: "보너스 포인트",
			sortValue: (row) => row.bonusPoints,
			cell: (row) => (
				<span className="tabular-nums">
					{row.bonusPoints.toLocaleString()}P
				</span>
			),
		},
		{
			id: "status",
			header: "달성 상태",
			sortValue: (row) => milestoneStatusRank(row, totalCommentCount),
			cell: (row) => (
				<MilestoneStatusBadge
					awarded={row.awarded}
					commentCount={row.commentCount}
					totalCommentCount={totalCommentCount}
				/>
			),
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-center",
			cellClassName: "text-center",
			cell: (row) => (
				<RowActions
					actions={[
						{ key: "edit", label: "수정", onSelect: () => onEdit(row) },
						{
							key: "delete",
							label: "삭제",
							onSelect: () => onDelete(row),
							variant: "destructive",
						},
					]}
				/>
			),
		},
	];
}

// 댓글 회차·보너스 포인트 수정 폼. 대상 마일스톤마다 새로 마운트돼(key) 초기값이 따라온다.
function MilestoneEditForm({
	isPending,
	milestone,
	onClose,
	onSubmit,
}: {
	isPending: boolean;
	milestone: MilestoneRow;
	onClose: () => void;
	onSubmit: (values: { bonusPoints: number; commentCount: number }) => void;
}) {
	const [commentCount, setCommentCount] = useState(
		String(milestone.commentCount)
	);
	const [bonusPoints, setBonusPoints] = useState(String(milestone.bonusPoints));
	const canSubmit =
		isValidMilestoneValue(commentCount, MILESTONE_COUNT_MAX) &&
		isValidMilestoneValue(bonusPoints, MILESTONE_BONUS_MAX) &&
		!isPending;

	return (
		<>
			<div className="flex flex-col gap-2">
				<DialogTitle>마일스톤 수정</DialogTitle>
				<DialogDescription>
					댓글 회차와 지급할 보너스 포인트를 바꿉니다.
				</DialogDescription>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="milestone-edit-count">댓글 회차</Label>
				<Input
					id="milestone-edit-count"
					inputMode="numeric"
					max={MILESTONE_COUNT_MAX}
					min={1}
					onChange={(event) => setCommentCount(event.target.value)}
					type="number"
					value={commentCount}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					전체 회원 통산 댓글 수가 이 회차에 정확히 도달할 때, 그 댓글을 단 회원
					한 명에게 보너스를 한 번 지급해요. 같은 회차는 중복으로 만들 수
					없어요.
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="milestone-edit-bonus">보너스 포인트</Label>
				<Input
					id="milestone-edit-bonus"
					inputMode="numeric"
					max={MILESTONE_BONUS_MAX}
					min={1}
					onChange={(event) => setBonusPoints(event.target.value)}
					type="number"
					value={bonusPoints}
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
							bonusPoints: Number(bonusPoints.trim()),
							commentCount: Number(commentCount.trim()),
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

// 댓글 마일스톤 관리 섹션. 기타 포인트 설정 페이지에 두되 자체 쿼리·상태만 쓴다.
export function CommentMilestoneSection() {
	const queryClient = useQueryClient();
	const listQuery = useQuery(
		orpc.bambi.memberGrades.commentMilestones.list.queryOptions()
	);
	const [commentCount, setCommentCount] = useState("");
	const [bonusPoints, setBonusPoints] = useState("");
	const [editing, setEditing] = useState<MilestoneRow | null>(null);
	const [deleting, setDeleting] = useState<MilestoneRow | null>(null);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.memberGrades.commentMilestones.list.queryKey(),
		});
	};

	const createMutation = useMutation(
		orpc.bambi.memberGrades.commentMilestones.create.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedMilestoneError(error.message, MILESTONE_INPUT_ERROR)
				),
			onSuccess: async () => {
				toast.success("마일스톤을 만들었어요.");
				setCommentCount("");
				setBonusPoints("");
				await invalidate();
			},
		})
	);

	const updateMutation = useMutation(
		orpc.bambi.memberGrades.commentMilestones.update.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedMilestoneError(error.message, MILESTONE_INPUT_ERROR)
				),
			onSuccess: async () => {
				toast.success("마일스톤을 수정했어요.");
				setEditing(null);
				await invalidate();
			},
		})
	);

	const removeMutation = useMutation(
		orpc.bambi.memberGrades.commentMilestones.remove.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedMilestoneError(
						error.message,
						"마일스톤을 삭제하지 못했어요."
					)
				),
			onSuccess: async () => {
				toast.success("마일스톤을 삭제했어요.");
				setDeleting(null);
				await invalidate();
			},
		})
	);

	const milestones = listQuery.data?.milestones ?? [];
	const totalCommentCount = listQuery.data?.totalCommentCount ?? 0;
	const canCreate =
		isValidMilestoneValue(commentCount, MILESTONE_COUNT_MAX) &&
		isValidMilestoneValue(bonusPoints, MILESTONE_BONUS_MAX) &&
		!createMutation.isPending;

	const columns = getMilestoneColumns({
		onDelete: setDeleting,
		onEdit: setEditing,
		totalCommentCount,
	});

	return (
		<Accordion className="flex flex-col gap-3" multiple>
			<AccordionItem
				className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
				value="comment-milestone"
			>
				<AccordionTrigger className="bg-card px-4 py-4 font-bold hover:bg-muted/50">
					댓글 마일스톤
				</AccordionTrigger>
				<AccordionContent className="flex flex-col gap-2 px-4 pt-4 pb-4">
					<div className="flex flex-col gap-1">
						<p className="m-0 text-muted-foreground text-sm">
							사이트 전체 회원의 통산 댓글 수가 정해진 회차에 정확히 도달할 때,
							그 “전체 N번째 댓글”을 단 회원 한 명이 보너스 포인트를 가져가는
							선착 이벤트예요. 회차별 지급 포인트를 자유롭게 추가·수정·삭제할 수
							있고, 현재 전체 댓글 수는 {totalCommentCount.toLocaleString()}
							개예요.
						</p>
					</div>

					<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
						<div className="flex flex-col gap-2">
							<Label htmlFor="milestone-new-count">댓글 회차</Label>
							<Input
								className="sm:w-40"
								id="milestone-new-count"
								inputMode="numeric"
								max={MILESTONE_COUNT_MAX}
								min={1}
								onChange={(event) => setCommentCount(event.target.value)}
								placeholder="예: 100"
								type="number"
								value={commentCount}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="milestone-new-bonus">보너스 포인트</Label>
							<Input
								className="sm:w-40"
								id="milestone-new-bonus"
								inputMode="numeric"
								max={MILESTONE_BONUS_MAX}
								min={1}
								onChange={(event) => setBonusPoints(event.target.value)}
								placeholder="예: 500"
								type="number"
								value={bonusPoints}
							/>
						</div>
						<Button
							disabled={!canCreate}
							onClick={() =>
								createMutation.mutate({
									bonusPoints: Number(bonusPoints.trim()),
									commentCount: Number(commentCount.trim()),
								})
							}
							type="button"
							variant="outline"
						>
							{createMutation.isPending ? "추가 중" : "마일스톤 추가"}
						</Button>
					</div>
					<p className="m-0 text-muted-foreground text-xs">
						같은 댓글 회차의 마일스톤은 만들 수 없습니다.
					</p>

					{listQuery.isPending ? (
						<div className="flex flex-col gap-2">
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
								data={milestones}
								emptyMessage="등록된 마일스톤이 없어요."
								getRowKey={(row) => row.id}
							/>
						</div>
					) : null}

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
								<MilestoneEditForm
									isPending={updateMutation.isPending}
									key={editing.id}
									milestone={editing}
									onClose={() => setEditing(null)}
									onSubmit={(values) =>
										updateMutation.mutate({ ...values, id: editing.id })
									}
								/>
							) : null}
						</DialogContent>
					</Dialog>

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
									{deleting?.commentCount.toLocaleString()}회 마일스톤을
									삭제할까요?
								</AlertDialogTitle>
								<AlertDialogDescription>
									되돌릴 수 없습니다. 이미 지급된 포인트는 회수되지 않고, 앞으로
									이 회차에서는 보너스가 지급되지 않아요.
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
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

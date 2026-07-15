"use client";

// 글 상세 화면의 리프 서브컴포넌트 모음. 본문 뷰어·헤더·추천/신고/수정/삭제 액션·
// 잠긴 글 게이트·댓글 목록/작성 폼을 각자 낮은 복잡도로 분리한다.

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import {
	EyeIcon,
	FlagIcon,
	LockIcon,
	ThumbsUpIcon,
	Trash2Icon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
	communityEditorExtensions,
	parseCommunityBody,
} from "@/components/bambi/community-editor";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	communityEditPath,
	formatCommunityDate,
} from "@/lib/bambi/community";
import {
	REPORT_REASON_LABELS,
	type ReportReason,
} from "@/lib/bambi/report-labels";
import { orpc } from "@/utils/orpc";

const PASSWORD_MIN = 4;
const DETAILS_MAX = 1000;

// 상세 화면이 소비하는 글 필드(잠금 해제 상태).
export interface CommunityPostDetail {
	authorName: string;
	body: string;
	canDelete: boolean;
	commentCount: number;
	createdAt: Date | string;
	id: string;
	isLiked: boolean;
	isLocked: boolean;
	likeCount: number;
	title: string;
	viewCount: number;
}

export interface CommunityCommentItem {
	authorName: string | null;
	body: string;
	canDelete: boolean;
	createdAt: Date | string;
	id: string;
}

// 읽기 전용 뷰어 타이포그래피 — 에디터 본문과 동일 스키마·시맨틱 토큰만.
const VIEWER_BODY_CLASS = cn(
	"w-full text-foreground text-sm leading-relaxed outline-none",
	"[&_a]:text-primary [&_a]:underline",
	"[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
	"[&_p]:my-1 [&_strong]:font-semibold"
);

// 본문을 편집 확장 세트로 read-only 렌더. JSON 파싱 실패 시 원문 텍스트 폴백.
export function PostBodyViewer({ body }: { body: string }) {
	const parsed = parseCommunityBody(body);
	const editor = useEditor({
		content: parsed,
		editable: false,
		editorProps: { attributes: { class: VIEWER_BODY_CLASS } },
		extensions: communityEditorExtensions,
		immediatelyRender: false,
	});

	if (!parsed) {
		return (
			<p className="m-0 whitespace-pre-wrap text-foreground text-sm leading-relaxed">
				{body}
			</p>
		);
	}

	return <EditorContent editor={editor} />;
}

export function PostHeader({ post }: { post: CommunityPostDetail }) {
	return (
		<div className="flex flex-col gap-2">
			<h1 className="m-0 flex items-center gap-1.5 font-extrabold text-xl">
				{post.isLocked ? (
					<LockIcon
						aria-label="비밀글"
						className="size-4 shrink-0 text-muted-foreground"
					/>
				) : null}
				{post.title}
			</h1>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
				<span>{post.authorName}</span>
				<span>{formatCommunityDate(post.createdAt)}</span>
				<span className="flex items-center gap-0.5">
					<EyeIcon className="size-3" />
					{post.viewCount}
				</span>
				<span className="flex items-center gap-0.5">
					<ThumbsUpIcon className="size-3" />
					{post.likeCount}
				</span>
			</div>
		</div>
	);
}

export function LikeBar({
	disabled,
	isLiked,
	likeCount,
	onToggle,
}: {
	disabled: boolean;
	isLiked: boolean;
	likeCount: number;
	onToggle: () => void;
}) {
	return (
		<div className="flex items-center justify-center py-2">
			<Button
				aria-pressed={isLiked}
				className={cn(isLiked && "border-coral-500 text-coral-500")}
				disabled={disabled}
				onClick={onToggle}
				variant="outline"
			>
				<ThumbsUpIcon data-icon="inline-start" />
				추천 {likeCount}
			</Button>
		</div>
	);
}

// 신고 다이얼로그 — 사유·상세를 자체 상태로 관리하고 moderation.createReport 호출.
export function ReportDialog({ postId }: { postId: string }) {
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState<ReportReason>("other");
	const [details, setDetails] = useState("");

	const reportMutation = useMutation(
		orpc.bambi.moderation.createReport.mutationOptions({
			onError: (error) => toast(error.message || "신고를 접수하지 못했어요."),
			onSuccess: () => {
				toast("신고가 접수됐어요.");
				setOpen(false);
				setDetails("");
			},
		})
	);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger
				render={
					<Button size="sm" variant="ghost">
						<FlagIcon data-icon="inline-start" />
						신고
					</Button>
				}
			/>
			<DialogContent>
				<div className="flex flex-col gap-2">
					<DialogTitle>글 신고</DialogTitle>
					<DialogDescription>
						신고 사유를 선택해 주세요. 운영자가 확인 후 조치해요.
					</DialogDescription>
				</div>
				<div className="flex flex-col gap-3">
					<Select
						onValueChange={(value) => setReason(value as ReportReason)}
						value={reason}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="신고 사유" />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(REPORT_REASON_LABELS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Textarea
						maxLength={DETAILS_MAX}
						onChange={(event) => setDetails(event.target.value)}
						placeholder="상세 내용(선택)"
						value={details}
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button
						disabled={reportMutation.isPending}
						onClick={() =>
							reportMutation.mutate({
								details: details.trim() || undefined,
								reason,
								targetId: postId,
								targetType: "community_post",
							})
						}
					>
						신고 접수
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function EditPostButton({
	boardSlug,
	postId,
}: {
	boardSlug: string;
	postId: string;
}) {
	return (
		<Button
			render={
				<Link href={communityEditPath(boardSlug, postId) as Route}>수정</Link>
			}
			size="sm"
			variant="outline"
		/>
	);
}

// 삭제 다이얼로그 — canDelete면 확인만, 아니면 글 비밀번호 입력 후 deletePost.
export function DeletePostButton({
	canDelete,
	lockPassword,
	onDeleted,
	postId,
}: {
	canDelete: boolean;
	lockPassword?: string;
	onDeleted: () => void | Promise<void>;
	postId: string;
}) {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState(lockPassword ?? "");

	const deleteMutation = useMutation(
		orpc.bambi.community.deletePost.mutationOptions({
			onError: (error) => toast(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast("글이 삭제됐어요.");
				setOpen(false);
				await onDeleted();
			},
		})
	);

	const trimmed = password.trim();
	const needsPassword = !canDelete;
	const disabled =
		deleteMutation.isPending ||
		(needsPassword && trimmed.length < PASSWORD_MIN);

	const handleDelete = () => {
		deleteMutation.mutate({
			postId,
			...(needsPassword && trimmed ? { password: trimmed } : {}),
		});
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger
				render={
					<Button size="sm" variant="outline">
						삭제
					</Button>
				}
			/>
			<DialogContent>
				<div className="flex flex-col gap-2">
					<DialogTitle>글 삭제</DialogTitle>
					<DialogDescription>
						{needsPassword
							? "삭제하려면 글 비밀번호를 입력해 주세요. 삭제한 글은 되돌릴 수 없어요."
							: "이 글을 삭제할까요? 삭제한 글은 되돌릴 수 없어요."}
					</DialogDescription>
				</div>
				{needsPassword ? (
					<div className="flex flex-col gap-2">
						<Label htmlFor="community-delete-password">글 비밀번호</Label>
						<Input
							autoComplete="off"
							id="community-delete-password"
							maxLength={30}
							onChange={(event) => setPassword(event.target.value)}
							placeholder="4자 이상"
							type="password"
							value={password}
						/>
					</div>
				) : null}
				<div className="flex justify-end gap-2">
					<DialogClose
						render={
							<Button type="button" variant="outline">
								취소
							</Button>
						}
					/>
					<Button
						disabled={disabled}
						onClick={handleDelete}
						variant="destructive"
					>
						삭제
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function CommentRow({
	comment,
	deletePending,
	onDelete,
}: {
	comment: CommunityCommentItem;
	deletePending: boolean;
	onDelete: (commentId: string) => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-2">
				<span className="font-semibold text-xs">
					{comment.authorName ?? COMMUNITY_AUTHOR_FALLBACK}
				</span>
				<span className="flex items-center gap-2 text-muted-foreground text-xs">
					{formatCommunityDate(comment.createdAt)}
					{comment.canDelete ? (
						<Button
							aria-label="댓글 삭제"
							disabled={deletePending}
							onClick={() => onDelete(comment.id)}
							size="icon-sm"
							variant="ghost"
						>
							<Trash2Icon />
						</Button>
					) : null}
				</span>
			</div>
			<p className="m-0 whitespace-pre-wrap text-sm">{comment.body}</p>
		</div>
	);
}

export function CommentList({
	comments,
	deletePending,
	onDelete,
}: {
	comments: CommunityCommentItem[];
	deletePending: boolean;
	onDelete: (commentId: string) => void;
}) {
	if (comments.length === 0) {
		return (
			<p className="m-0 py-2 text-muted-foreground text-sm">
				아직 댓글이 없어요. 첫 댓글을 남겨보세요.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{comments.map((comment) => (
				<CommentRow
					comment={comment}
					deletePending={deletePending}
					key={comment.id}
					onDelete={onDelete}
				/>
			))}
		</div>
	);
}

export function CommentForm({
	canSubmit,
	maxLength,
	onChange,
	onSubmit,
	value,
}: {
	canSubmit: boolean;
	maxLength: number;
	onChange: (value: string) => void;
	onSubmit: () => void;
	value: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Textarea
				maxLength={maxLength}
				onChange={(event) => onChange(event.target.value)}
				placeholder="댓글을 입력해 주세요"
				value={value}
			/>
			<div className="flex justify-end">
				<Button disabled={!canSubmit} onClick={onSubmit} size="sm">
					댓글 등록
				</Button>
			</div>
		</div>
	);
}

// 잠긴 글 열람 게이트 — 비밀번호를 입력받아 상위 상태(appliedPassword)로 올린다.
export function LockedGate({
	boardLabel,
	hasError,
	onSubmit,
}: {
	boardLabel: string;
	hasError: boolean;
	onSubmit: (password: string) => void;
}) {
	const [password, setPassword] = useState("");

	return (
		<div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
			<div className="flex items-center gap-2">
				<LockIcon className="size-5 shrink-0 text-muted-foreground" />
				<h1 className="m-0 font-extrabold text-lg">비밀글입니다</h1>
			</div>
			<p className="m-0 text-muted-foreground text-sm">
				{boardLabel} 게시판의 비밀글이에요. 열람하려면 글 비밀번호를 입력해
				주세요.
			</p>
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-lock-password">글 비밀번호</Label>
				<Input
					autoComplete="off"
					id="community-lock-password"
					maxLength={30}
					onChange={(event) => setPassword(event.target.value)}
					placeholder="4자 이상"
					type="password"
					value={password}
				/>
				{hasError ? (
					<p className="m-0 text-destructive text-sm">
						비밀번호가 일치하지 않아요. 다시 확인해 주세요.
					</p>
				) : null}
			</div>
			<div className="flex justify-end">
				<Button
					disabled={password.length < PASSWORD_MIN}
					onClick={() => onSubmit(password)}
					type="button"
				>
					열람
				</Button>
			</div>
		</div>
	);
}

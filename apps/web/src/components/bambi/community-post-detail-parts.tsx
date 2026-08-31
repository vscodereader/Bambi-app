"use client";

import { COMMUNITY_PASSWORD_MIN_LENGTH } from "@bambi-app/api/services/bambi-community-post-policy";

// 글 상세 화면의 리프 서브컴포넌트 모음. 본문 뷰어·헤더·추천/신고/수정/삭제 액션·
// 잠긴 글 게이트·댓글 목록/작성 폼을 각자 낮은 복잡도로 분리한다.

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@bambi-app/ui/components/alert-dialog";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
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
	CornerDownRightIcon,
	EyeIcon,
	FlagIcon,
	LockIcon,
	MegaphoneIcon,
	PencilIcon,
	PhoneIcon,
	ThumbsUpIcon,
	Trash2Icon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	communityEditorExtensions,
	parseCommunityBody,
} from "@/components/bambi/community-editor";
import { Avatar } from "@/components/bambi/ds";
import { GradeBadge } from "@/components/bambi/grade-badge";
import {
	type SecretAuthorGender,
	SecretAuthorMark,
} from "@/components/bambi/secret-author-mark";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	communityAuthorName,
	communityEditPath,
	formatCommunityDate,
} from "@/lib/bambi/community";
import {
	REPORT_REASON_LABELS,
	type ReportReason,
} from "@/lib/bambi/report-labels";
import { formatPhone } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const DETAILS_MAX = 1000;

// 비회원(guest)도 글·댓글을 남길 수 있어 작성자 role 스냅샷에 포함된다. 화면 표시는
// 항상 라벨 맵(communityAuthorRoleLabel)을 거치고, 여기서는 배지 분기에만 쓴다.
export type CommunityAuthorRole =
	| "admin"
	| "employer"
	| "guest"
	| "job_seeker"
	| "legal_advisor";

// 상세 화면이 소비하는 글 필드(잠금 해제 상태).
export interface CommunityPostDetail {
	authorGender?: SecretAuthorGender | null;
	authorGrade: {
		name: string;
		color: string | null;
		iconUrl?: string | null;
	} | null;
	authorImage?: string | null;
	authorName: string;
	authorRole: CommunityAuthorRole;
	board: string;
	body: string;
	canDelete: boolean;
	canEdit: boolean;
	commentCount: number;
	commentsDisabled: boolean;
	// 법률 자문 글에만 실린다. 잠금을 연 열람자(작성자·운영자·법률자문)에게만 서버가 내려준다.
	contactPhone: string | null;
	createdAt: Date | string;
	id: string;
	isLiked: boolean;
	isLocked: boolean;
	isPromotion: boolean;
	likeCount: number;
	title: string;
	viewCount: number;
}

export interface CommunityCommentItem {
	authorGender?: SecretAuthorGender | null;
	authorGrade: {
		name: string;
		color: string | null;
		iconUrl?: string | null;
	} | null;
	authorImage?: string | null;
	authorName: string | null;
	authorRole: CommunityAuthorRole | null;
	body: string;
	// 랜덤 보너스 당첨액(0=꽝). 공개값 — 모든 열람자에게 배지로 보인다.
	bonusPoints: number;
	canDelete: boolean;
	canEdit: boolean;
	createdAt: Date | string;
	id: string;
	isDeleted: boolean;
	// 이 댓글이 딴 전역 마일스톤 회차(없으면 null). "전체 N번째 댓글" 배지 근거.
	milestoneCommentCount: number | null;
	parentCommentId: string | null;
}

// 읽기 전용 뷰어 타이포그래피 — 에디터 본문과 동일 스키마·시맨틱 토큰만.
const VIEWER_BODY_CLASS = cn(
	"w-full text-foreground text-sm leading-relaxed outline-none",
	"[&_a]:text-primary [&_a]:underline",
	"[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
	"[&_p]:my-1 [&_strong]:font-semibold",
	"[&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md"
);

// 본문을 편집 확장 세트로 read-only 렌더. JSON 파싱 실패 시 원문 텍스트 폴백.
// 부모(PostDetailView)가 댓글 입력 등으로 잦게 리렌더되므로 파싱을 body 기준으로 메모한다.
export function PostBodyViewer({ body }: { body: string }) {
	const parsed = useMemo(() => parseCommunityBody(body), [body]);
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

function PostHeaderBadges({ post }: { post: CommunityPostDetail }) {
	const isNotice = post.board === "notice";
	if (post.board === "secret") {
		return null;
	}
	if (!(post.isPromotion || post.authorRole === "employer" || isNotice)) {
		return null;
	}
	return (
		<span className="flex shrink-0 items-center gap-1">
			{post.isPromotion ? <Badge variant="warning">광고</Badge> : null}
			{post.authorRole === "employer" ? (
				<Badge variant="secondary">업소</Badge>
			) : null}
			{isNotice ? (
				<Badge variant="default">
					<MegaphoneIcon data-icon="inline-start" />
					공지
				</Badge>
			) : null}
		</span>
	);
}

export function PostHeader({ post }: { post: CommunityPostDetail }) {
	return (
		<div className="flex flex-col gap-2">
			<h1 className="m-0 flex flex-wrap items-center gap-1.5 font-extrabold text-xl">
				{post.isLocked ? (
					<LockIcon
						aria-label="비밀글"
						className="size-4 shrink-0 text-muted-foreground"
					/>
				) : null}
				<PostHeaderBadges post={post} />
				{post.title}
			</h1>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
				<span className="flex items-center gap-1.5">
					{post.authorGender ? (
						<SecretAuthorMark gender={post.authorGender} />
					) : (
						<>
							<Avatar
								fallbackIcon="user"
								name={communityAuthorName(post.authorName)}
								size="xs"
								src={post.authorImage ?? undefined}
							/>
							{communityAuthorName(post.authorName)}
						</>
					)}
					{post.board === "secret" ? null : (
						<GradeBadge grade={post.authorGrade} />
					)}
				</span>
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
			{/* 연락처는 서버가 잠금을 연 열람자에게만 실어 보낸다 — 여기 도달했다는 건 볼 권한이
			    있다는 뜻이라 화면에서 다시 판정하지 않는다. */}
			{post.contactPhone ? (
				<Alert>
					<PhoneIcon />
					<AlertTitle>연락처 {formatPhone(post.contactPhone)}</AlertTitle>
					<AlertDescription>
						작성자 본인과 운영자·법률자문에게만 보이는 번호예요.
					</AlertDescription>
				</Alert>
			) : null}
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

// 신고 대상 타입 — 글/댓글 공용. moderation.createReport의 targetType과 맞춘다.
type ReportTargetType = "community_comment" | "community_post";

// 신고 다이얼로그 — 사유·상세를 자체 상태로 관리하고 moderation.createReport 호출.
// 대상(글/댓글)에 무관하게 재사용하도록 트리거·타이틀·대상은 props로 받는다.
export function ReportDialog({
	targetId,
	targetType,
	title,
	trigger,
}: {
	targetId: string;
	targetType: ReportTargetType;
	title: string;
	// base-ui DialogTrigger render는 ReactElement를 요구한다(ReactNode 불가).
	trigger: ReactElement;
}) {
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
			<DialogTrigger render={trigger} />
			<DialogContent>
				<div className="flex flex-col gap-2">
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						신고 사유를 선택해 주세요. 운영자가 확인 후 조치해요.
					</DialogDescription>
				</div>
				<div className="flex flex-col gap-3">
					{/* items를 줘야 base-ui Select.Value가 원값 대신 한국어 라벨을 렌더한다. */}
					<Select
						items={REPORT_REASON_LABELS}
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
						onClick={() => {
							setDetails("");
							setReason("other");
							setOpen(false);
						}}
						variant="outline"
					>
						신고 취소
					</Button>
					<Button
						disabled={reportMutation.isPending}
						onClick={() =>
							reportMutation.mutate({
								details: details.trim() || undefined,
								reason,
								targetId,
								targetType,
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
			nativeButton={false}
			render={
				<Link href={communityEditPath(boardSlug, postId) as Route}>수정</Link>
			}
			size="sm"
			variant="outline"
		/>
	);
}

// 삭제 다이얼로그 — 권한자(canDelete)에게만 마운트되므로 확인만 받고 deletePost.
export function DeletePostButton({
	onDeleted,
	postId,
}: {
	onDeleted: () => void | Promise<void>;
	postId: string;
}) {
	const [open, setOpen] = useState(false);

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

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				render={
					<Button size="sm" variant="outline">
						삭제
					</Button>
				}
			/>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>글 삭제</AlertDialogTitle>
					<AlertDialogDescription>
						이 글을 삭제할까요? 삭제한 글은 되돌릴 수 없어요.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>취소</AlertDialogCancel>
					<AlertDialogAction
						disabled={deleteMutation.isPending}
						onClick={() => deleteMutation.mutate({ postId })}
						variant="destructive"
					>
						삭제
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

// 댓글 액션 영역(날짜 옆). 본인 댓글이면 수정/삭제, 타인 댓글이면 신고를 노출한다.
// 삭제된 댓글은 CommentRow에서 이미 걸러지므로 여기 도달하지 않는다.
function CommentActions({
	comment,
	deletePending,
	onDelete,
	onEditOpen,
}: {
	comment: CommunityCommentItem;
	deletePending: boolean;
	onDelete: (commentId: string) => void;
	onEditOpen: (commentId: string) => void;
}) {
	return (
		<span className="flex items-center gap-1 text-muted-foreground text-xs">
			<span className="mr-1">{formatCommunityDate(comment.createdAt)}</span>
			{comment.canEdit ? (
				<>
					<Button
						aria-label="댓글 수정"
						onClick={() => onEditOpen(comment.id)}
						size="icon-sm"
						variant="ghost"
					>
						<PencilIcon />
					</Button>
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
				</>
			) : null}
			{!comment.canEdit && comment.authorRole !== "admin" ? (
				<ReportDialog
					targetId={comment.id}
					targetType="community_comment"
					title="댓글 신고"
					trigger={
						<Button aria-label="댓글 신고" size="icon-sm" variant="ghost">
							<FlagIcon />
						</Button>
					}
				/>
			) : null}
		</span>
	);
}

// 인라인 댓글 수정 폼. 편집 시작 시점의 본문으로 초기화되고 저장/취소를 제공한다.
function CommentEditForm({
	initialBody,
	maxLength,
	onCancel,
	onSubmit,
	pending,
}: {
	initialBody: string;
	maxLength: number;
	onCancel: () => void;
	onSubmit: (body: string) => void;
	pending: boolean;
}) {
	const [body, setBody] = useState(initialBody);
	const trimmed = body.trim();
	const canSubmit = trimmed.length >= 1 && !pending;

	return (
		<div className="flex flex-col gap-2">
			<Textarea
				maxLength={maxLength}
				onChange={(event) => setBody(event.target.value)}
				value={body}
			/>
			<div className="flex justify-end gap-2">
				<Button onClick={onCancel} size="sm" type="button" variant="outline">
					취소
				</Button>
				<Button
					disabled={!canSubmit}
					onClick={() => onSubmit(trimmed)}
					size="sm"
				>
					저장
				</Button>
			</div>
		</div>
	);
}

// 단일 댓글 행. 삭제된 항목은 작성자·본문·액션 없이 muted 플레이스홀더로만 표시한다.
// isEditing이면 본문 대신 인라인 수정 폼을 렌더한다.
// onReply가 있으면(최상위·published 한정) 본문 아래 답글 버튼을 렌더한다.
function CommentRow({
	comment,
	deletePending,
	editPending,
	isEditing,
	maxLength,
	onDelete,
	onEditClose,
	onEditOpen,
	onEditSubmit,
	onReply,
}: {
	comment: CommunityCommentItem;
	deletePending: boolean;
	editPending: boolean;
	isEditing: boolean;
	maxLength: number;
	onDelete: (commentId: string) => void;
	onEditClose: () => void;
	onEditOpen: (commentId: string) => void;
	onEditSubmit: (commentId: string, body: string) => void;
	onReply?: () => void;
}) {
	const rowRef = useRef<HTMLDivElement>(null);
	const [isHighlighted, setIsHighlighted] = useState(false);

	useEffect(() => {
		const highlightedCommentId = new URLSearchParams(
			window.location.search
		).get("highlightComment");
		if (highlightedCommentId !== comment.id) {
			return;
		}
		let secondFrame: number | undefined;
		let timer: number | undefined;
		const firstFrame = window.requestAnimationFrame(() => {
			secondFrame = window.requestAnimationFrame(() => {
				rowRef.current?.scrollIntoView({ block: "center" });
				setIsHighlighted(true);
				timer = window.setTimeout(() => setIsHighlighted(false), 1000);
			});
		});
		return () => {
			window.cancelAnimationFrame(firstFrame);
			if (secondFrame !== undefined) {
				window.cancelAnimationFrame(secondFrame);
			}
			if (timer !== undefined) {
				window.clearTimeout(timer);
			}
		};
	}, [comment.id]);

	if (comment.isDeleted) {
		return (
			<div
				className={cn(
					"-m-2 rounded-xl p-2 transition-[background-color,box-shadow] duration-200",
					isHighlighted && "bg-primary/20 ring-2 ring-primary"
				)}
				id={`comment-${comment.id}`}
				ref={rowRef}
			>
				<p className="m-0 py-1 text-muted-foreground text-sm italic">
					삭제된 댓글입니다
				</p>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"-m-2 rounded-xl p-2 transition-[background-color,box-shadow] duration-200",
				isHighlighted && "bg-primary/20 ring-2 ring-primary"
			)}
			id={`comment-${comment.id}`}
			ref={rowRef}
		>
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between gap-2">
					<span className="flex flex-wrap items-center gap-1.5 font-semibold text-xs">
						{comment.authorGender ? (
							<SecretAuthorMark gender={comment.authorGender} />
						) : (
							<>
								<Avatar
									fallbackIcon="user"
									name={comment.authorName ?? COMMUNITY_AUTHOR_FALLBACK}
									size="xs"
									src={comment.authorImage ?? undefined}
								/>
								{comment.authorName ?? COMMUNITY_AUTHOR_FALLBACK}
							</>
						)}
						{comment.authorGender ? null : (
							<GradeBadge grade={comment.authorGrade} />
						)}
						{!comment.authorGender && comment.authorRole === "employer" ? (
							<Badge variant="secondary">업소</Badge>
						) : null}
						{!comment.authorGender && comment.authorRole === "admin" ? (
							<Badge variant="default">운영자</Badge>
						) : null}
						{/* 법률 자문 게시판의 답변인지 한눈에 보이게 — 질문자와 자문 답변이 섞이면
					    어느 쪽이 전문가 답변인지 알 수 없다. */}
						{!comment.authorGender && comment.authorRole === "legal_advisor" ? (
							<Badge variant="dark">법률자문</Badge>
						) : null}
						{/* 당첨 배지(공개) — 전역 선착 마일스톤과 랜덤 보너스. 익명성과 무관한
						    성취 표시라 비밀글에서도 노출한다(신원을 드러내지 않음). */}
						{comment.milestoneCommentCount === null ? null : (
							<Badge variant="success">
								🏆 전체 {comment.milestoneCommentCount.toLocaleString("ko-KR")}
								번째 댓글 보너스 당첨
							</Badge>
						)}
						{comment.bonusPoints > 0 ? (
							<Badge variant="success">
								🎉 {comment.bonusPoints.toLocaleString("ko-KR")}P 보너스 당첨
							</Badge>
						) : null}
					</span>
					{isEditing ? null : (
						<CommentActions
							comment={comment}
							deletePending={deletePending}
							onDelete={onDelete}
							onEditOpen={onEditOpen}
						/>
					)}
				</div>
				{isEditing ? (
					<CommentEditForm
						initialBody={comment.body}
						maxLength={maxLength}
						onCancel={onEditClose}
						onSubmit={(body) => onEditSubmit(comment.id, body)}
						pending={editPending}
					/>
				) : (
					<p className="m-0 whitespace-pre-wrap text-sm">{comment.body}</p>
				)}
				{onReply && !isEditing ? (
					<div>
						<Button onClick={onReply} size="sm" variant="ghost">
							<CornerDownRightIcon data-icon="inline-start" />
							답글
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}

// 인라인 답글 폼. replyTo 변경으로 mount/unmount되며 입력값은 매 열림마다 초기화된다.
function ReplyForm({
	maxLength,
	onCancel,
	onSubmit,
	pending,
}: {
	maxLength: number;
	onCancel: () => void;
	onSubmit: (body: string) => void;
	pending: boolean;
}) {
	const [body, setBody] = useState("");
	const trimmed = body.trim();
	const canSubmit = trimmed.length >= 1 && !pending;

	return (
		<div className="flex flex-col gap-2">
			<Textarea
				maxLength={maxLength}
				onChange={(event) => setBody(event.target.value)}
				placeholder="답글을 입력해 주세요"
				value={body}
			/>
			<div className="flex justify-end gap-2">
				<Button onClick={onCancel} size="sm" type="button" variant="outline">
					취소
				</Button>
				<Button
					disabled={!canSubmit}
					onClick={() => onSubmit(trimmed)}
					size="sm"
				>
					답글 등록
				</Button>
			</div>
		</div>
	);
}

// 최상위 댓글 + 자식(대댓글) 스레드. 답글 폼과 대댓글은 한 들여쓰기 레일로 묶어
// 시각적으로 부모에 귀속시킨다.
function CommentThread({
	deletePending,
	editPending,
	editingId,
	maxLength,
	onDelete,
	onEditClose,
	onEditOpen,
	onEditSubmit,
	onReplyClose,
	onReplyOpen,
	onReplySubmit,
	parent,
	replies,
	replyPending,
	replyTo,
}: {
	deletePending: boolean;
	editPending: boolean;
	editingId: string | null;
	maxLength: number;
	onDelete: (commentId: string) => void;
	onEditClose: () => void;
	onEditOpen: (commentId: string) => void;
	onEditSubmit: (commentId: string, body: string) => void;
	onReplyClose: () => void;
	onReplyOpen?: (parentId: string) => void;
	onReplySubmit: (parentId: string, body: string) => void;
	parent: CommunityCommentItem;
	replies: CommunityCommentItem[];
	replyPending: boolean;
	replyTo: string | null;
}) {
	const isReplying = replyTo === parent.id;
	const canReply = Boolean(onReplyOpen) && !(parent.isDeleted || isReplying);

	return (
		<div className="flex flex-col gap-3">
			<CommentRow
				comment={parent}
				deletePending={deletePending}
				editPending={editPending}
				isEditing={editingId === parent.id}
				maxLength={maxLength}
				onDelete={onDelete}
				onEditClose={onEditClose}
				onEditOpen={onEditOpen}
				onEditSubmit={onEditSubmit}
				onReply={
					canReply && onReplyOpen ? () => onReplyOpen(parent.id) : undefined
				}
			/>
			{isReplying || replies.length > 0 ? (
				<div className="flex flex-col gap-3 border-border border-l pl-4">
					{isReplying ? (
						<ReplyForm
							maxLength={maxLength}
							onCancel={onReplyClose}
							onSubmit={(body) => onReplySubmit(parent.id, body)}
							pending={replyPending}
						/>
					) : null}
					{replies.map((reply) => (
						<CommentRow
							comment={reply}
							deletePending={deletePending}
							editPending={editPending}
							isEditing={editingId === reply.id}
							key={reply.id}
							maxLength={maxLength}
							onDelete={onDelete}
							onEditClose={onEditClose}
							onEditOpen={onEditOpen}
							onEditSubmit={onEditSubmit}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

// 업소 댓글 숨기기: 업소 최상위 댓글은 스레드째, 업소 답글은 개별로 제외한다.
const isEmployerComment = (comment: CommunityCommentItem): boolean =>
	comment.authorRole === "employer";

export function CommentList({
	allowReplies,
	comments,
	deletePending,
	editPending,
	editingId,
	hideEmployer,
	maxLength,
	onDelete,
	onEditClose,
	onEditOpen,
	onEditSubmit,
	onReplyClose,
	onReplyOpen,
	onReplySubmit,
	replyPending,
	replyTo,
}: {
	allowReplies: boolean;
	comments: CommunityCommentItem[];
	deletePending: boolean;
	editPending: boolean;
	editingId: string | null;
	hideEmployer: boolean;
	maxLength: number;
	onDelete: (commentId: string) => void;
	onEditClose: () => void;
	onEditOpen: (commentId: string) => void;
	onEditSubmit: (commentId: string, body: string) => void;
	onReplyClose: () => void;
	onReplyOpen: (parentId: string) => void;
	onReplySubmit: (parentId: string, body: string) => void;
	replyPending: boolean;
	replyTo: string | null;
}) {
	if (comments.length === 0) {
		return (
			<p className="m-0 py-2 text-muted-foreground text-sm">
				{allowReplies
					? "아직 댓글이 없어요. 첫 댓글을 남겨보세요."
					: "아직 등록된 댓글이 없어요."}
			</p>
		);
	}

	const parents = comments.filter(
		(comment) =>
			comment.parentCommentId === null &&
			!(hideEmployer && isEmployerComment(comment))
	);

	const repliesOf = (parentId: string) =>
		comments.filter(
			(comment) =>
				comment.parentCommentId === parentId &&
				!(hideEmployer && isEmployerComment(comment))
		);

	if (parents.length === 0) {
		return (
			<p className="m-0 py-2 text-muted-foreground text-sm">
				표시할 댓글이 없어요.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{parents.map((parent) => (
				<CommentThread
					deletePending={deletePending}
					editingId={editingId}
					editPending={editPending}
					key={parent.id}
					maxLength={maxLength}
					onDelete={onDelete}
					onEditClose={onEditClose}
					onEditOpen={onEditOpen}
					onEditSubmit={onEditSubmit}
					onReplyClose={onReplyClose}
					onReplyOpen={allowReplies ? onReplyOpen : undefined}
					onReplySubmit={onReplySubmit}
					parent={parent}
					replies={repliesOf(parent.id)}
					replyPending={replyPending}
					replyTo={replyTo}
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
					disabled={password.length < COMMUNITY_PASSWORD_MIN_LENGTH}
					onClick={() => onSubmit(password)}
					type="button"
				>
					열람
				</Button>
			</div>
		</div>
	);
}

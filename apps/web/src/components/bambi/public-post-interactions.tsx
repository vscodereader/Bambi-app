"use client";

// 비회원 참여 UI — 추천·댓글 목록/작성·본인 글·댓글 수정/삭제. 공개 상세
// (/board/[boardSlug]/[postId])와 회원 수다방 상세(/seeker/community, 여성 인증 게스트로
// 들어온 경우)가 함께 쓴다. 회원에게는 마운트하지 않는다(회원 전용 UI가 따로 있다).
// 이동 경로는 신분이 아니라 지금 있는 영역을 따른다(useCommunityAreaPaths).
//
// 비회원의 소유권 증명은 오직 비밀번호다. 쿠키(gid)가 만료돼도 비밀번호만 맞으면 자기
// 글·댓글을 지울 수 있도록 서버가 gid가 아니라 비밀번호로 판정하므로, 화면도 매 요청에
// 비밀번호를 함께 받는다.
//
// 미인증(anon·구 토큰) 방문자에게는 서버가 이미 렌더한 댓글을 그대로 보여주고 참여
// 자리에 본인인증 카드를 세운다 — 추가 요청이 없어 크롤러 방문에도 부담이 없다.

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
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownRightIcon, ThumbsUpIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactElement, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/bambi/ds";
import { GuestVerifyCard } from "@/components/bambi/guest-verify-card";
import { SecretAuthorMark } from "@/components/bambi/secret-author-mark";
import { toastCommentRewards } from "@/lib/bambi/comment-rewards";
import {
	communityAuthorRoleLabel,
	formatCommunityDate,
} from "@/lib/bambi/community";
import { useCommunityAreaPaths } from "@/lib/bambi/community-paths";
import { orpc } from "@/utils/orpc";
import { showWarningRestrictionDialogForError } from "./warning-restriction-guard";

const COMMENT_MAX = 1000;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 30;

// 서버(getPublicPost)가 내려주는 댓글 모양. 인증 전에는 이 값이 그대로 화면이 된다.
export interface PublicCommentSeed {
	authorGender?: "female" | "male" | null;
	authorImage: string | null;
	authorRole: string | null;
	body: string;
	// 랜덤 보너스 당첨액(0=꽝). 공개값 — 게스트에게도 배지로 보인다.
	bonusPoints: number;
	createdAt: Date | string;
	id: string;
	isDeleted: boolean;
	// 이 댓글이 딴 전역 마일스톤 회차(없으면 null).
	milestoneCommentCount: number | null;
	parentCommentId: string | null;
}

interface PublicCommentItem extends PublicCommentSeed {
	canDelete: boolean;
	canEdit: boolean;
}

function PasswordField({
	id,
	onChange,
	value,
}: {
	id: string;
	onChange: (value: string) => void;
	value: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>비밀번호</Label>
			<Input
				autoComplete="new-password"
				id={id}
				maxLength={PASSWORD_MAX}
				onChange={(event) => onChange(event.target.value)}
				placeholder="4자 이상 (수정·삭제할 때 필요해요)"
				type="password"
				value={value}
			/>
		</div>
	);
}

// 삭제처럼 입력이 비밀번호뿐인 액션의 확인 창. onConfirm이 실패(403 등)하면 창을 열어
// 둔 채 비밀번호만 비워 다시 입력받는다(사유는 뮤테이션 onError가 토스트로 낸다).
function PasswordConfirmDialog({
	description,
	onConfirm,
	pending,
	title,
	trigger,
}: {
	description: string;
	onConfirm: (password: string) => Promise<unknown>;
	pending: boolean;
	title: string;
	// base-ui AlertDialogTrigger render는 ReactElement를 요구한다(ReactNode 불가).
	trigger: ReactElement;
}) {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState("");

	const submit = async () => {
		try {
			await onConfirm(password);
			setOpen(false);
			setPassword("");
		} catch {
			setPassword("");
		}
	};

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger render={trigger} />
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<PasswordField
					id="public-confirm-password"
					onChange={setPassword}
					value={password}
				/>
				<AlertDialogFooter>
					<AlertDialogCancel>취소</AlertDialogCancel>
					<AlertDialogAction
						disabled={password.length < PASSWORD_MIN || pending}
						onClick={() => {
							submit().catch(() => setPassword(""));
						}}
						variant="destructive"
					>
						삭제
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function CommentEditForm({
	initialBody,
	onCancel,
	onSubmit,
	pending,
}: {
	initialBody: string;
	onCancel: () => void;
	onSubmit: (body: string, password: string) => void;
	pending: boolean;
}) {
	const [body, setBody] = useState(initialBody);
	const [password, setPassword] = useState("");
	const trimmed = body.trim();
	const canSubmit =
		trimmed.length >= 1 && password.length >= PASSWORD_MIN && !pending;

	return (
		<div className="flex flex-col gap-2">
			<Textarea
				maxLength={COMMENT_MAX}
				onChange={(event) => setBody(event.target.value)}
				value={body}
			/>
			<PasswordField
				id="public-comment-edit-password"
				onChange={setPassword}
				value={password}
			/>
			<div className="flex justify-end gap-2">
				<Button onClick={onCancel} size="sm" type="button" variant="outline">
					취소
				</Button>
				<Button
					disabled={!canSubmit}
					onClick={() => onSubmit(trimmed, password)}
					size="sm"
				>
					저장
				</Button>
			</div>
		</div>
	);
}

// 단일 댓글 행. onReply가 있으면(최상위·미삭제 한정) 본문 아래 답글 버튼을 렌더한다.
function CommentRow({
	comment,
	deletePending,
	editingId,
	editPending,
	onDelete,
	onEditClose,
	onEditOpen,
	onEditSubmit,
	onReply,
}: {
	comment: PublicCommentItem;
	deletePending: boolean;
	editingId: string | null;
	editPending: boolean;
	onDelete: (commentId: string, password: string) => Promise<unknown>;
	onEditClose: () => void;
	onEditOpen: (commentId: string) => void;
	onEditSubmit: (commentId: string, body: string, password: string) => void;
	onReply?: () => void;
}) {
	const isEditing = editingId === comment.id;

	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center justify-between gap-2">
				{/* enum 원값 대신 라벨 맵을 거친다. 공개 경로는 회원 계정명을 싣지 않는다. */}
				<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
					{comment.authorGender ? (
						<SecretAuthorMark gender={comment.authorGender} />
					) : (
						<>
							<Avatar
								fallbackIcon="user"
								name={communityAuthorRoleLabel(comment.authorRole)}
								size="xs"
								src={comment.authorImage ?? undefined}
							/>
							{communityAuthorRoleLabel(comment.authorRole)}
						</>
					)}
					<span>·</span>
					{formatCommunityDate(comment.createdAt)}
					{/* 당첨 배지(공개) — 전역 선착 마일스톤·랜덤 보너스. 삭제 댓글엔 서버가 0/null. */}
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
				{comment.canEdit && !(isEditing || comment.isDeleted) ? (
					<span className="flex items-center gap-1">
						<Button
							onClick={() => onEditOpen(comment.id)}
							size="sm"
							variant="ghost"
						>
							수정
						</Button>
						<PasswordConfirmDialog
							description="댓글 작성 시 입력한 비밀번호를 입력해 주세요."
							onConfirm={(password) => onDelete(comment.id, password)}
							pending={deletePending}
							title="댓글 삭제"
							trigger={
								<Button size="sm" variant="ghost">
									삭제
								</Button>
							}
						/>
					</span>
				) : null}
			</div>
			{isEditing ? (
				<CommentEditForm
					initialBody={comment.body}
					onCancel={onEditClose}
					onSubmit={(body, password) =>
						onEditSubmit(comment.id, body, password)
					}
					pending={editPending}
				/>
			) : (
				<p className="m-0 whitespace-pre-wrap text-foreground text-sm">
					{comment.isDeleted ? "삭제된 댓글이에요." : comment.body}
				</p>
			)}
			{onReply && !(isEditing || comment.isDeleted) ? (
				<div>
					<Button onClick={onReply} size="sm" variant="ghost">
						<CornerDownRightIcon data-icon="inline-start" />
						답글
					</Button>
				</div>
			) : null}
		</div>
	);
}

// 댓글·답글 공용 작성 폼. onCancel이 있으면 답글 모드(취소 가능)로 쓴다.
function CommentComposer({
	onCancel,
	onSubmit,
	passwordId,
	pending,
	placeholder,
	submitLabel,
}: {
	onCancel?: () => void;
	onSubmit: (body: string, password: string) => void;
	passwordId: string;
	pending: boolean;
	placeholder: string;
	submitLabel: string;
}) {
	const [body, setBody] = useState("");
	const [password, setPassword] = useState("");
	const trimmed = body.trim();
	const canSubmit =
		trimmed.length >= 1 && password.length >= PASSWORD_MIN && !pending;

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-border p-4">
			<Textarea
				maxLength={COMMENT_MAX}
				onChange={(event) => setBody(event.target.value)}
				placeholder={placeholder}
				value={body}
			/>
			<PasswordField id={passwordId} onChange={setPassword} value={password} />
			<div className="flex justify-end gap-2">
				{onCancel ? (
					<Button onClick={onCancel} size="sm" type="button" variant="outline">
						취소
					</Button>
				) : null}
				<Button
					disabled={!canSubmit}
					onClick={() => {
						onSubmit(trimmed, password);
						setBody("");
					}}
					size="sm"
				>
					{submitLabel}
				</Button>
			</div>
		</div>
	);
}

// 최상위 댓글 + 그 답글 묶음. 목록이 createdAt 평면 정렬이라 부모 아래로 답글을 모아
// 한 들여쓰기 레일에 넣는다(회원 화면 CommentThread와 같은 방식).
function CommentThread({
	deletePending,
	editingId,
	editPending,
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
	editingId: string | null;
	editPending: boolean;
	onDelete: (commentId: string, password: string) => Promise<unknown>;
	onEditClose: () => void;
	onEditOpen: (commentId: string) => void;
	onEditSubmit: (commentId: string, body: string, password: string) => void;
	onReplyClose: () => void;
	// 참여 자격이 없으면(비인증 방문자) 아예 넘어오지 않아 답글 버튼도 숨는다.
	onReplyOpen?: (parentId: string) => void;
	onReplySubmit: (parentId: string, body: string, password: string) => void;
	parent: PublicCommentItem;
	replies: PublicCommentItem[];
	replyPending: boolean;
	replyTo: string | null;
}) {
	const isReplying = replyTo === parent.id;
	const rowProps = {
		deletePending,
		editingId,
		editPending,
		onDelete,
		onEditClose,
		onEditOpen,
		onEditSubmit,
	};

	return (
		<li className="flex flex-col gap-3">
			<CommentRow
				comment={parent}
				{...rowProps}
				onReply={
					onReplyOpen && !isReplying ? () => onReplyOpen(parent.id) : undefined
				}
			/>
			{isReplying || replies.length > 0 ? (
				<ul className="m-0 flex list-none flex-col gap-3 border-border border-l p-0 pl-4">
					{isReplying ? (
						<li className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">
								{parent.authorGender
									? "밤비"
									: communityAuthorRoleLabel(parent.authorRole)}
								님의 댓글에 답글
							</span>
							<CommentComposer
								onCancel={onReplyClose}
								onSubmit={(body, password) =>
									onReplySubmit(parent.id, body, password)
								}
								passwordId="public-reply-password"
								pending={replyPending}
								placeholder="답글을 입력해 주세요"
								submitLabel="답글 등록"
							/>
						</li>
					) : null}
					{replies.map((reply) => (
						<li key={reply.id}>
							<CommentRow comment={reply} {...rowProps} />
						</li>
					))}
				</ul>
			) : null}
		</li>
	);
}

interface PublicPostInteractionsProps {
	boardSlug: string;
	canLike?: boolean;
	// 댓글 목록을 서버에서 다시 읽을지. 기본은 참여 가능할 때만(공개 상세는 서버가 이미
	// 렌더한 목록을 그대로 쓰고, 미인증 방문자·크롤러에게는 추가 요청을 만들지 않는다).
	// 회원 화면에 얹을 때처럼 씨앗 목록이 없으면 참여 자격과 무관하게 켠다.
	canReadComments?: boolean;
	// 비회원 쓰기 자격(gid 있는 게스트 토큰). 없으면 읽기 + 본인인증 안내만.
	canWrite: boolean;
	commentCount: number;
	commentsDisabled?: boolean;
	initialComments: PublicCommentSeed[];
	// 이미 추천했는지. 공개 상세(getPublicPost)는 내려주지 않아 기본 false지만, 회원 화면
	// 상세(getPost)는 gid 기준으로 알려주므로 첫 클릭이 추천 취소가 되지 않게 넘겨받는다.
	initialIsLiked?: boolean;
	// 비회원이 쓴 글이면 비밀번호로 수정·삭제할 수 있다(회원 글은 회원 화면 몫).
	isGuestAuthored: boolean;
	likeCount: number;
	// 비회원 참여가 열린 게시판(자유수다·밤문화 이야기)인지. 공지는 읽기 전용이다.
	participable: boolean;
	// 비밀글 게이트를 통과한 비밀번호. 댓글 목록도 상세와 같은 열쇠를 요구한다
	// (공개 상세에는 잠긴 글이 없어 undefined).
	password?: string;
	postId: string;
}

export function PublicPostInteractions({
	boardSlug,
	canReadComments,
	canLike = false,
	canWrite,
	commentCount,
	commentsDisabled = false,
	initialComments,
	initialIsLiked = false,
	isGuestAuthored,
	likeCount,
	participable,
	password,
	postId,
}: PublicPostInteractionsProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	// 목록·수정·상세 경로는 지금 있는 영역을 따른다(공개 /board ↔ 회원 수다방).
	const paths = useCommunityAreaPaths();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [replyTo, setReplyTo] = useState<string | null>(null);
	// 공개 상세는 추천 여부를 내려주지 않는다(initialIsLiked 기본 false) — 이미 추천한
	// 방문자의 첫 클릭은 추천 취소로 동작하고, 서버 응답으로 상태가 맞춰진다.
	const [like, setLike] = useState({ isLiked: initialIsLiked, likeCount });

	const canParticipate = canWrite && participable;
	const canComment = canParticipate && !commentsDisabled;
	const showCommentsSection = !commentsDisabled || commentCount > 0;

	// 인증된 비회원만 재조회한다(내 댓글의 수정·삭제 권한 플래그가 필요해서다).
	// 그 외에는 서버가 내려준 목록을 그대로 쓴다.
	const commentsQuery = useQuery(
		orpc.bambi.community.listComments.queryOptions({
			enabled: showCommentsSection && (canReadComments ?? canParticipate),
			input: { password, postId },
		})
	);
	const comments: PublicCommentItem[] =
		commentsQuery.data ??
		initialComments.map((comment) => ({
			...comment,
			canDelete: false,
			canEdit: false,
		}));

	// 서버는 createdAt 오름차순 평면 목록을 준다 — 화면에서 부모별로 답글을 모은다.
	const threads = comments
		.filter((comment) => comment.parentCommentId === null)
		.map((parent) => ({
			parent,
			replies: comments.filter(
				(comment) => comment.parentCommentId === parent.id
			),
		}));

	const refreshComments = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.listComments.key(),
		});
		// 서버 컴포넌트의 댓글 수·본문도 함께 맞춘다.
		router.refresh();
	};

	const likeMutation = useMutation(
		orpc.bambi.community.toggleLike.mutationOptions({
			onError: (error) => toast(error.message || "추천하지 못했어요."),
			onSuccess: (data) => {
				setLike({ isLiked: data.isLiked, likeCount: data.likeCount });
				// 머리말의 추천 수(서버 렌더)도 같이 맞춘다.
				router.refresh();
			},
		})
	);
	const createCommentMutation = useMutation(
		orpc.bambi.community.createComment.mutationOptions({
			onError: (error) => {
				if (!showWarningRestrictionDialogForError(error)) {
					toast(error.message || "댓글을 등록하지 못했어요.");
				}
			},
			onSuccess: async (data) => {
				toastCommentRewards(data);
				setReplyTo(null);
				await refreshComments();
			},
		})
	);
	const updateCommentMutation = useMutation(
		orpc.bambi.community.updateComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 수정하지 못했어요."),
			onSuccess: async () => {
				toast("댓글이 수정됐어요.");
				setEditingId(null);
				await refreshComments();
			},
		})
	);
	const deleteCommentMutation = useMutation(
		orpc.bambi.community.deleteComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 삭제하지 못했어요."),
			onSuccess: refreshComments,
		})
	);
	const deletePostMutation = useMutation(
		orpc.bambi.community.deletePost.mutationOptions({
			onError: (error) => toast(error.message || "글을 삭제하지 못했어요."),
			onSuccess: () => {
				toast("글이 삭제됐어요.");
				router.replace(paths.boardPath(boardSlug) as Route);
			},
		})
	);

	return (
		<div className="flex flex-col gap-4">
			{canWrite ? (
				<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
					<span />
					<Button
						aria-pressed={like.isLiked}
						className={cn(like.isLiked && "border-coral-500 text-coral-500")}
						disabled={!canLike || likeMutation.isPending}
						onClick={() => likeMutation.mutate({ postId })}
						variant="outline"
					>
						<ThumbsUpIcon data-icon="inline-start" />
						추천 {like.likeCount}
					</Button>
					{canParticipate && isGuestAuthored ? (
						<span className="flex items-center gap-2 justify-self-end">
							<Button
								nativeButton={false}
								render={
									<Link href={paths.editPath(boardSlug, postId) as Route}>
										수정
									</Link>
								}
								size="sm"
								variant="outline"
							/>
							<PasswordConfirmDialog
								description="글 작성 시 입력한 비밀번호를 입력해 주세요. 삭제한 글은 되돌릴 수 없어요."
								onConfirm={(password) =>
									deletePostMutation.mutateAsync({ password, postId })
								}
								pending={deletePostMutation.isPending}
								title="글 삭제"
								trigger={
									<Button size="sm" variant="outline">
										삭제
									</Button>
								}
							/>
						</span>
					) : (
						<span />
					)}
				</div>
			) : null}

			<section
				className={cn("flex flex-col gap-3", !showCommentsSection && "hidden")}
			>
				<h2 className="m-0 font-bold text-base">댓글 {commentCount}</h2>
				{comments.length === 0 ? (
					<p className="m-0 text-muted-foreground text-sm">
						아직 댓글이 없어요.
					</p>
				) : (
					<ul className="m-0 flex list-none flex-col gap-4 p-0">
						{threads.map(({ parent, replies }) => (
							<CommentThread
								deletePending={deleteCommentMutation.isPending}
								editingId={editingId}
								editPending={updateCommentMutation.isPending}
								key={parent.id}
								onDelete={(commentId, password) =>
									deleteCommentMutation.mutateAsync({ commentId, password })
								}
								onEditClose={() => setEditingId(null)}
								onEditOpen={setEditingId}
								onEditSubmit={(commentId, body, password) =>
									updateCommentMutation.mutate({ body, commentId, password })
								}
								onReplyClose={() => setReplyTo(null)}
								onReplyOpen={canComment ? setReplyTo : undefined}
								onReplySubmit={(parentCommentId, body, password) =>
									createCommentMutation.mutate({
										body,
										parentCommentId,
										password,
										postId,
									})
								}
								parent={parent}
								replies={replies}
								replyPending={createCommentMutation.isPending}
								replyTo={replyTo}
							/>
						))}
					</ul>
				)}
				{canComment ? (
					<CommentComposer
						onSubmit={(body, password) =>
							createCommentMutation.mutate({ body, password, postId })
						}
						passwordId="public-comment-password"
						pending={createCommentMutation.isPending}
						placeholder="댓글을 입력해 주세요"
						submitLabel="댓글 등록"
					/>
				) : null}
				{commentsDisabled ? (
					<p className="m-0 rounded-md bg-secondary px-3 py-2.5 text-muted-foreground text-sm">
						운영자가 댓글 작성을 제한한 글입니다.
					</p>
				) : null}
			</section>

			{canParticipate || !participable ? null : (
				<GuestVerifyCard
					description="성인 본인인증을 마치면 비회원도 댓글·추천을 남길 수 있어요."
					redirectTo={paths.postPath(boardSlug, postId)}
					title="댓글·추천 남기기"
					triggerLabel="본인인증하고 참여하기"
				/>
			)}
		</div>
	);
}

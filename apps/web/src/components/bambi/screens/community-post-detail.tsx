"use client";

// 글 상세 — 잠긴 글 비밀번호 게이트 → 본문(read-only Tiptap)·추천·신고·수정/삭제·평면 댓글.
// 리프 UI는 community-post-detail-parts로 분리하고, 여기서는 게이트·데이터 흐름만 조율한다.

import { Button } from "@bambi-app/ui/components/button";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	CommentForm,
	CommentList,
	type CommunityPostDetail,
	DeletePostButton,
	EditPostButton,
	LikeBar,
	LockedGate,
	PostBodyViewer,
	PostHeader,
	ReportDialog,
} from "@/components/bambi/community-post-detail-parts";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	type CommunityBoardMeta,
	communityBoardPath,
	getBoardBySlug,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

const COMMENT_MAX = 1000;

interface CommunityPostDetailScreenProps {
	boardSlug: string;
	postId: string;
}

function PostDetailSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-7 w-2/3" />
			<Skeleton className="h-4 w-1/3" />
			<Skeleton className="h-48 w-full" />
		</div>
	);
}

function BackButton({ board }: { board: CommunityBoardMeta }) {
	return (
		<div>
			<Button
				nativeButton={false}
				render={
					<Link href={communityBoardPath(board.slug) as Route}>
						<ChevronLeftIcon data-icon="inline-start" />
						{board.label}
					</Link>
				}
				size="sm"
				variant="ghost"
			/>
		</div>
	);
}

// 잠금 해제된 글의 본문·추천·신고·수정/삭제·댓글을 조립한다.
function PostDetailView({
	appliedPassword,
	board,
	post,
	postId,
}: {
	appliedPassword?: string;
	board: CommunityBoardMeta;
	post: CommunityPostDetail;
	postId: string;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [commentBody, setCommentBody] = useState("");
	const [replyTo, setReplyTo] = useState<string | null>(null);
	const [hideEmployerComments, setHideEmployerComments] = useState(false);

	// 상세(getPost)는 조회 시 view_count를 올리므로 추천·댓글 뮤테이션에서 재요청하지
	// 않는다. getPost 캐시는 setQueryData로 직접 갱신하고, 목록/오버뷰만 무효화한다.
	const getPostQueryKey = orpc.bambi.community.getPost.queryKey({
		input: { password: appliedPassword, postId },
	});
	const invalidateBoards = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.community.listPosts.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.community.overview.key(),
			}),
		]);
	const invalidateComments = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.listComments.key(),
		});
	// getQueryData로 먼저 읽어 잠금 해제 상태를 좁힌 뒤 구체 값으로 갱신한다
	// (setQueryData 업데이터 인자는 판별 유니온 narrowing이 막혀 있어 우회).
	const bumpCommentCount = (delta: number) => {
		const current = queryClient.getQueryData(getPostQueryKey);
		if (current?.locked === false) {
			queryClient.setQueryData(getPostQueryKey, {
				...current,
				commentCount: Math.max(0, current.commentCount + delta),
			});
		}
	};

	const commentsQuery = useQuery(
		orpc.bambi.community.listComments.queryOptions({
			input: { password: appliedPassword, postId },
		})
	);
	const likeMutation = useMutation(
		orpc.bambi.community.toggleLike.mutationOptions({
			onError: (error) => toast(error.message || "추천하지 못했어요."),
			onSuccess: (data) => {
				const current = queryClient.getQueryData(getPostQueryKey);
				if (current?.locked === false) {
					queryClient.setQueryData(getPostQueryKey, {
						...current,
						isLiked: data.isLiked,
						likeCount: data.likeCount,
					});
				}
				return invalidateBoards();
			},
		})
	);
	const createCommentMutation = useMutation(
		orpc.bambi.community.createComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 등록하지 못했어요."),
			onSuccess: () => {
				setCommentBody("");
				setReplyTo(null);
				bumpCommentCount(1);
				return Promise.all([invalidateComments(), invalidateBoards()]);
			},
		})
	);
	const deleteCommentMutation = useMutation(
		orpc.bambi.community.deleteComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 삭제하지 못했어요."),
			onSuccess: () => {
				bumpCommentCount(-1);
				return Promise.all([invalidateComments(), invalidateBoards()]);
			},
		})
	);

	const comments = commentsQuery.data ?? [];
	const hasEmployerComments = comments.some(
		(comment) => comment.authorRole === "employer"
	);
	const trimmedComment = commentBody.trim();
	const canSubmitComment =
		trimmedComment.length >= 1 && !createCommentMutation.isPending;

	// 화면 이탈 후 목록/오버뷰만 무효화한다. getPost는 재요청하지 않아(이탈 전
	// view_count +1 방지) 삭제된 글의 상세를 다시 부르지 않는다.
	const handleDeleted = async () => {
		router.replace(communityBoardPath(board.slug) as Route);
		await invalidateBoards();
	};

	return (
		<div className="flex flex-col gap-4">
			<BackButton board={board} />
			<PostHeader post={post} />
			<Separator />
			<PostBodyViewer body={post.body} />
			<LikeBar
				disabled={likeMutation.isPending}
				isLiked={post.isLiked}
				likeCount={post.likeCount}
				onToggle={() =>
					likeMutation.mutate({ password: appliedPassword, postId })
				}
			/>
			<div className="flex items-center justify-between gap-2">
				<ReportDialog postId={postId} />
				<div className="flex items-center gap-2">
					<EditPostButton boardSlug={board.slug} postId={postId} />
					<DeletePostButton
						canDelete={post.canDelete}
						lockPassword={appliedPassword}
						onDeleted={handleDeleted}
						postId={postId}
					/>
				</div>
			</div>
			<Separator />
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="m-0 font-bold text-base">댓글 {post.commentCount}</h2>
					{hasEmployerComments ? (
						<div className="flex items-center gap-2">
							<Switch
								checked={hideEmployerComments}
								id="community-hide-employer-comments"
								onCheckedChange={setHideEmployerComments}
								size="sm"
							/>
							<Label
								className="text-muted-foreground text-xs"
								htmlFor="community-hide-employer-comments"
							>
								업소 댓글 숨기기
							</Label>
						</div>
					) : null}
				</div>
				<CommentList
					comments={comments}
					deletePending={deleteCommentMutation.isPending}
					hideEmployer={hideEmployerComments}
					maxLength={COMMENT_MAX}
					onDelete={(commentId) => deleteCommentMutation.mutate({ commentId })}
					onReplyClose={() => setReplyTo(null)}
					onReplyOpen={setReplyTo}
					onReplySubmit={(parentCommentId, body) =>
						createCommentMutation.mutate({
							body,
							parentCommentId,
							password: appliedPassword,
							postId,
						})
					}
					replyPending={createCommentMutation.isPending}
					replyTo={replyTo}
				/>
				<CommentForm
					canSubmit={canSubmitComment}
					maxLength={COMMENT_MAX}
					onChange={setCommentBody}
					onSubmit={() =>
						createCommentMutation.mutate({
							body: trimmedComment,
							password: appliedPassword,
							postId,
						})
					}
					value={commentBody}
				/>
			</div>
		</div>
	);
}

export function CommunityPostDetailScreen({
	boardSlug,
	postId,
}: CommunityPostDetailScreenProps) {
	const board = getBoardBySlug(boardSlug);
	const [appliedPassword, setAppliedPassword] = useState<string | undefined>();

	const postQuery = useQuery(
		orpc.bambi.community.getPost.queryOptions({
			input: { password: appliedPassword, postId },
		})
	);

	// 비밀번호 불일치(FORBIDDEN)는 토스트로 안내하고 게이트에서 재입력을 받는다.
	useEffect(() => {
		if (postQuery.isError && appliedPassword) {
			toast("비밀번호를 확인해 주세요.");
		}
	}, [postQuery.isError, appliedPassword]);

	if (!board) {
		return (
			<EmptyState
				className="flex-1"
				description="존재하지 않는 게시판이에요."
				title="게시판을 찾을 수 없어요"
			/>
		);
	}

	if (postQuery.isPending) {
		return <PostDetailSkeleton />;
	}

	const data = postQuery.data;

	if (data?.locked === false) {
		return (
			<PostDetailView
				appliedPassword={appliedPassword}
				board={board}
				post={data}
				postId={postId}
			/>
		);
	}

	if (data?.locked === true) {
		return (
			<LockedGate
				boardLabel={board.label}
				hasError={false}
				onSubmit={setAppliedPassword}
			/>
		);
	}

	if (appliedPassword) {
		return (
			<LockedGate
				boardLabel={board.label}
				hasError={true}
				onSubmit={setAppliedPassword}
			/>
		);
	}

	return (
		<EmptyState
			className="flex-1"
			description="글이 삭제됐거나 불러올 수 없어요."
			title="글을 찾을 수 없어요"
		/>
	);
}

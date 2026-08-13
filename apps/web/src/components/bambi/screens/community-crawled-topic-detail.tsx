"use client";

// 수집 커뮤니티 글 상세 — 외부(퀸알바 "밤문화이야기")에서 수집한 글을 우리 글과 같은 모양으로
// 보여준다. 화면에 출처 표시는 두지 않는다(제목·본문·조회수·원 게시일·댓글만 남는다).
// 원본에 달려 있던 댓글은 익명·읽기 전용이고, 그 아래로 우리 회원·비회원이 우리 글과 같은
// 규칙(대댓글 1단계·비회원 비밀번호·금칙어·도배 방지)으로 댓글을 이어 단다.
// 글 자체의 좋아요·수정·삭제·신고는 없다 — 우리 회원이 쓴 글이 아니라 귀속 대상이 없다.

import type { AppRouter } from "@bambi-app/api/routers/index";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, EyeIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import {
	CommentForm,
	CommentList,
} from "@/components/bambi/community-post-detail-parts";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	communityBoardPath,
	formatCommunityDate,
	getBoardByKey,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

// 수집 글은 밤문화 이야기(work_talk) 게시판에 합류하므로 목록으로 돌아가는 버튼도 그 게시판을 가리킨다.
const CRAWLED_BOARD = getBoardByKey("work_talk");

// 닉네임이 비어 오는 댓글의 폴백. 커뮤니티 기본값("회원")과 달리 수집 원본은 익명 작성이 흔해
// "익명"으로 표기한다.
const CRAWLED_COMMENT_AUTHOR_FALLBACK = "익명";

const COMMENT_MAX = 1000;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 30;

// 서버 응답과의 드리프트를 막기 위해 oRPC 추론 출력에서 상세 타입을 파생한다.
type CrawledTopicDetail =
	InferRouterOutputs<AppRouter>["bambi"]["community"]["getCrawledTopic"];

// 비회원의 쓰기 요청은 전부 비밀번호를 함께 보내야 해(소유권 증명 수단이 그것뿐이다)
// 작성·답글·수정·삭제를 한 다이얼로그로 모아 받는다. 회원은 세션으로 증명되므로 이 경로를
// 타지 않고 곧바로 뮤테이션한다.
type PendingWrite =
	| { body: string; commentId: string; kind: "update" }
	| { body: string; kind: "create" }
	| { body: string; kind: "reply"; parentCommentId: string }
	| { commentId: string; kind: "delete" };

function CrawledTopicSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-7 w-2/3" />
			<Skeleton className="h-4 w-1/3" />
			<Skeleton className="h-48 w-full" />
		</div>
	);
}

function BackButton() {
	return (
		<div>
			<Button
				nativeButton={false}
				render={
					<Link href={communityBoardPath(CRAWLED_BOARD.slug) as Route}>
						<ChevronLeftIcon data-icon="inline-start" />
						{CRAWLED_BOARD.label}
					</Link>
				}
				size="sm"
				variant="ghost"
			/>
		</div>
	);
}

// 원본에 달려 있던 댓글. 우리 쪽 소유자가 없어 수정·삭제·답글이 없고 순서도 원본 그대로다.
function SourceComments({
	comments,
}: {
	comments: CrawledTopicDetail["sourceComments"];
}) {
	return (
		<div className="flex flex-col gap-3">
			{comments.map((comment, index) => (
				<div
					className="flex flex-col gap-1"
					// biome-ignore lint/suspicious/noArrayIndexKey: 수집 댓글은 안정적 id가 없고(원본 파싱 결과) 재정렬 없는 정적 배열이라 순서가 곧 안정 키다.
					key={index}
				>
					<div className="flex items-center justify-between gap-2">
						<span className="font-semibold text-xs">
							{comment.authorName ?? CRAWLED_COMMENT_AUTHOR_FALLBACK}
						</span>
						{comment.sourcePostedAt ? (
							<span className="text-muted-foreground text-xs">
								{formatCommunityDate(comment.sourcePostedAt)}
							</span>
						) : null}
					</div>
					<p className="m-0 whitespace-pre-line text-sm">{comment.body}</p>
				</div>
			))}
		</div>
	);
}

// 비회원 쓰기 비밀번호 입력창. 확인을 누르면 창은 닫히고, 비밀번호가 틀리면(403) 뮤테이션
// onError 토스트로 알린 뒤 같은 동작을 다시 누르게 한다.
function GuestPasswordDialog({
	onCancel,
	onConfirm,
	pending,
}: {
	onCancel: () => void;
	onConfirm: (password: string) => void;
	pending: PendingWrite | null;
}) {
	const [password, setPassword] = useState("");

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					setPassword("");
					onCancel();
				}
			}}
			open={pending !== null}
		>
			<DialogContent>
				<div className="flex flex-col gap-2">
					<DialogTitle>비회원 비밀번호</DialogTitle>
					<DialogDescription>
						{pending?.kind === "create" || pending?.kind === "reply"
							? "나중에 이 댓글을 수정·삭제할 때 쓸 비밀번호를 정해 주세요."
							: "댓글 작성 시 입력한 비밀번호를 입력해 주세요."}
					</DialogDescription>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="crawled-comment-password">비밀번호</Label>
					<Input
						autoComplete="new-password"
						id="crawled-comment-password"
						maxLength={PASSWORD_MAX}
						onChange={(event) => setPassword(event.target.value)}
						placeholder="4자 이상"
						type="password"
						value={password}
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button
						onClick={() => {
							setPassword("");
							onCancel();
						}}
						type="button"
						variant="outline"
					>
						취소
					</Button>
					<Button
						disabled={password.length < PASSWORD_MIN}
						onClick={() => {
							onConfirm(password);
							setPassword("");
						}}
					>
						확인
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// 원본 댓글 + 우리 댓글을 한 목록으로 이어 붙이고, 작성·수정·삭제를 조율한다.
function TopicComments({
	topic,
	topicId,
}: {
	topic: CrawledTopicDetail;
	topicId: string;
}) {
	const { isGuest } = useBambiAuth();
	const queryClient = useQueryClient();
	const [commentBody, setCommentBody] = useState("");
	const [replyTo, setReplyTo] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [pending, setPending] = useState<PendingWrite | null>(null);

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.getCrawledTopic.key(),
		});

	const createMutation = useMutation(
		orpc.bambi.community.createCrawledComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 등록하지 못했어요."),
			onSuccess: () => {
				setCommentBody("");
				setReplyTo(null);
				return refresh();
			},
		})
	);
	const updateMutation = useMutation(
		orpc.bambi.community.updateComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 수정하지 못했어요."),
			onSuccess: () => {
				toast("댓글이 수정됐어요.");
				setEditingId(null);
				return refresh();
			},
		})
	);
	const deleteMutation = useMutation(
		orpc.bambi.community.deleteComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 삭제하지 못했어요."),
			onSuccess: refresh,
		})
	);

	// 회원은 곧바로, 비회원은 비밀번호를 받은 뒤 같은 뮤테이션을 부른다.
	const runWrite = (write: PendingWrite, password?: string) => {
		if (write.kind === "create") {
			createMutation.mutate({ body: write.body, password, topicId });
			return;
		}
		if (write.kind === "reply") {
			createMutation.mutate({
				body: write.body,
				parentCommentId: write.parentCommentId,
				password,
				topicId,
			});
			return;
		}
		if (write.kind === "update") {
			updateMutation.mutate({
				body: write.body,
				commentId: write.commentId,
				password,
			});
			return;
		}
		deleteMutation.mutate({ commentId: write.commentId, password });
	};

	const submit = (write: PendingWrite) => {
		if (isGuest) {
			setPending(write);
			return;
		}
		runWrite(write);
	};

	const trimmedComment = commentBody.trim();
	const hasComments =
		topic.sourceComments.length > 0 || topic.comments.length > 0;

	return (
		<div className="flex flex-col gap-3">
			<h2 className="m-0 font-bold text-base">댓글 {topic.commentCount}</h2>
			{hasComments ? null : (
				<p className="m-0 py-2 text-muted-foreground text-sm">
					아직 댓글이 없어요. 첫 댓글을 남겨보세요.
				</p>
			)}
			{topic.sourceComments.length > 0 ? (
				<SourceComments comments={topic.sourceComments} />
			) : null}
			{topic.comments.length > 0 ? (
				<CommentList
					allowReplies
					comments={topic.comments}
					deletePending={deleteMutation.isPending}
					editingId={editingId}
					editPending={updateMutation.isPending}
					hideEmployer={false}
					maxLength={COMMENT_MAX}
					onDelete={(commentId) => submit({ commentId, kind: "delete" })}
					onEditClose={() => setEditingId(null)}
					onEditOpen={setEditingId}
					onEditSubmit={(commentId, body) =>
						submit({ body, commentId, kind: "update" })
					}
					onReplyClose={() => setReplyTo(null)}
					onReplyOpen={setReplyTo}
					onReplySubmit={(parentCommentId, body) =>
						submit({ body, kind: "reply", parentCommentId })
					}
					replyPending={createMutation.isPending}
					replyTo={replyTo}
				/>
			) : null}
			<CommentForm
				canSubmit={trimmedComment.length >= 1 && !createMutation.isPending}
				maxLength={COMMENT_MAX}
				onChange={setCommentBody}
				onSubmit={() => submit({ body: trimmedComment, kind: "create" })}
				value={commentBody}
			/>
			<GuestPasswordDialog
				onCancel={() => setPending(null)}
				onConfirm={(password) => {
					if (pending) {
						runWrite(pending, password);
					}
					setPending(null);
				}}
				pending={pending}
			/>
		</div>
	);
}

export function CommunityCrawledTopicDetailScreen({
	topicId,
}: {
	topicId: string;
}) {
	const topicQuery = useQuery(
		orpc.bambi.community.getCrawledTopic.queryOptions({
			input: { topicId },
		})
	);

	if (topicQuery.isPending) {
		return <CrawledTopicSkeleton />;
	}

	// 스위치 OFF·부재·삭제는 서버가 NOT_FOUND로 내려주므로 존재하지 않는 글과 같게 취급한다.
	if (topicQuery.isError || !topicQuery.data) {
		return (
			<EmptyState
				className="flex-1"
				description="글이 삭제됐거나 불러올 수 없어요."
				title="글을 찾을 수 없어요"
			/>
		);
	}

	const topic = topicQuery.data;

	return (
		<div className="flex flex-col gap-4">
			<BackButton />
			<div className="flex flex-col gap-2">
				<h1 className="m-0 font-extrabold text-xl">{topic.title}</h1>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					<span>{topic.boardName}</span>
					{topic.sourcePostedAt ? (
						<span>{formatCommunityDate(topic.sourcePostedAt)}</span>
					) : null}
					<span className="flex items-center gap-0.5">
						<EyeIcon className="size-3" />
						{topic.viewCount}
					</span>
				</div>
			</div>
			<Separator />
			<p className="m-0 whitespace-pre-line text-foreground text-sm leading-relaxed">
				{topic.body}
			</p>
			<Separator />
			<TopicComments topic={topic} topicId={topicId} />
		</div>
	);
}

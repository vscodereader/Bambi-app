// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: 댓글 행은 권한별 액션을 한 카드에 함께 표시한다
// biome-ignore-all lint/style/noNestedTernary: 오류, 빈 목록, 목록을 JSX에서 시각 순서대로 표현한다
import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import { JobReportDialog } from "@/src/components/report-dialog";
import { communityDateLabel } from "@/src/lib/community/community";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc, queryClient } from "@/src/lib/orpc";

type Comments = Awaited<
	ReturnType<AppRouterClient["bambi"]["community"]["listComments"]>
>;

export function CommunityComments({
	crawledTopicId,
	initialComments,
	password: postPassword,
	postId,
}: {
	crawledTopicId?: string;
	initialComments?: Comments;
	password?: string;
	postId?: string;
}) {
	const { state } = useVisitor();
	const [body, setBody] = useState("");
	const [guestPassword, setGuestPassword] = useState("");
	const [replyTo, setReplyTo] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingBody, setEditingBody] = useState("");
	const [reportId, setReportId] = useState<string | null>(null);
	const query = useQuery({
		...orpc.bambi.community.listComments.queryOptions({
			input: {
				password: postPassword || undefined,
				postId: postId ?? "00000000-0000-0000-0000-000000000000",
			},
		}),
		enabled: Boolean(postId),
	});
	const comments: Comments = crawledTopicId
		? (initialComments ?? [])
		: (query.data ?? []);
	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.key(),
		});
	};
	const create = useMutation(
		orpc.bambi.community.createComment.mutationOptions({
			onError: (error) =>
				Alert.alert("댓글을 등록하지 못했어요", error.message),
			onSuccess: async () => {
				setBody("");
				setReplyTo(null);
				await invalidate();
			},
		})
	);
	const createCrawled = useMutation(
		orpc.bambi.community.createCrawledComment.mutationOptions({
			onError: (error) =>
				Alert.alert("댓글을 등록하지 못했어요", error.message),
			onSuccess: async () => {
				setBody("");
				setReplyTo(null);
				await invalidate();
			},
		})
	);
	const remove = useMutation(
		orpc.bambi.community.deleteComment.mutationOptions({
			onError: (error) =>
				Alert.alert("댓글을 삭제하지 못했어요", error.message),
			onSuccess: invalidate,
		})
	);
	const update = useMutation(
		orpc.bambi.community.updateComment.mutationOptions({
			onError: (error) =>
				Alert.alert("댓글을 수정하지 못했어요", error.message),
			onSuccess: async () => {
				setEditingId(null);
				setEditingBody("");
				await invalidate();
			},
		})
	);
	const submit = () => {
		if (!body.trim()) {
			return;
		}
		const input = {
			body: body.trim(),
			parentCommentId: replyTo ?? undefined,
			password:
				state === "guest"
					? guestPassword.trim() || undefined
					: postPassword || undefined,
		};
		if (crawledTopicId) {
			createCrawled.mutate({ ...input, topicId: crawledTopicId });
		} else if (postId) {
			create.mutate({ ...input, postId });
		}
	};

	return (
		<View className="gap-3">
			<Text className="font-bold text-foreground text-xl">댓글</Text>
			{!crawledTopicId && query.isError ? (
				<Button onPress={() => query.refetch()} variant="secondary">
					<Button.Label>댓글 다시 불러오기</Button.Label>
				</Button>
			) : comments.length === 0 ? (
				<Text className="text-muted text-sm">아직 댓글이 없어요.</Text>
			) : (
				comments.map((comment) => (
					<Surface
						className={`gap-2 rounded-lg p-3 ${comment.parentCommentId ? "ml-6" : ""}`}
						key={comment.id}
						variant="secondary"
					>
						<Text className="font-semibold text-foreground">
							{comment.authorName}
						</Text>
						{editingId === comment.id ? (
							<TextField>
								<Input
									maxLength={1000}
									onChangeText={setEditingBody}
									value={editingBody}
								/>
							</TextField>
						) : (
							<Text className="text-foreground text-sm" selectable>
								{comment.body}
							</Text>
						)}
						<Text className="text-muted text-xs">
							{communityDateLabel(comment.createdAt)}
						</Text>
						<View className="flex-row gap-2">
							<Button
								onPress={() => setReplyTo(comment.id)}
								size="sm"
								variant="tertiary"
							>
								<Button.Label>답글</Button.Label>
							</Button>
							{comment.canEdit ? (
								<Button
									onPress={() => {
										if (editingId === comment.id) {
											update.mutate({
												body: editingBody.trim(),
												commentId: comment.id,
												password:
													state === "guest"
														? guestPassword.trim() || undefined
														: undefined,
											});
											return;
										}
										setEditingId(comment.id);
										setEditingBody(comment.body);
									}}
									size="sm"
									variant="secondary"
								>
									<Button.Label>
										{editingId === comment.id ? "저장" : "수정"}
									</Button.Label>
								</Button>
							) : null}
							{state === "member" ? (
								<Button
									onPress={() => setReportId(comment.id)}
									size="sm"
									variant="tertiary"
								>
									<Button.Label>신고</Button.Label>
								</Button>
							) : null}
							{comment.canDelete ? (
								<Button
									onPress={() =>
										Alert.alert(
											"댓글을 삭제할까요?",
											"삭제한 댓글은 복구할 수 없어요.",
											[
												{ text: "취소" },
												{
													onPress: () =>
														remove.mutate({
															commentId: comment.id,
															password:
																state === "guest"
																	? guestPassword.trim() || undefined
																	: undefined,
														}),
													style: "destructive",
													text: "삭제",
												},
											]
										)
									}
									size="sm"
									variant="danger"
								>
									<Button.Label>삭제</Button.Label>
								</Button>
							) : null}
						</View>
					</Surface>
				))
			)}
			{replyTo ? (
				<Text className="text-accent text-sm">답글을 작성하고 있어요.</Text>
			) : null}
			<TextField>
				<Input
					maxLength={1000}
					onChangeText={setBody}
					placeholder={replyTo ? "답글을 입력하세요" : "댓글을 입력하세요"}
					value={body}
				/>
			</TextField>
			{state === "guest" ? (
				<TextField>
					<Input
						maxLength={30}
						onChangeText={setGuestPassword}
						placeholder="수정·삭제용 비밀번호 4자 이상"
						secureTextEntry
						value={guestPassword}
					/>
				</TextField>
			) : null}
			<Button
				isDisabled={
					!body.trim() ||
					(state === "guest" && guestPassword.trim().length < 4) ||
					create.isPending ||
					createCrawled.isPending
				}
				onPress={submit}
			>
				<Button.Label>{replyTo ? "답글 등록" : "댓글 등록"}</Button.Label>
			</Button>
			<JobReportDialog
				isOpen={reportId !== null}
				onOpenChange={(open) => !open && setReportId(null)}
				targetId={reportId ?? "00000000-0000-0000-0000-000000000000"}
				targetType="community_comment"
			/>
		</View>
	);
}

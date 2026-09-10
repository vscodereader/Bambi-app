import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { CommunityComments } from "@/src/components/community/community-comments";
import { MemberOnly } from "@/src/components/member-only";
import { MessageBody } from "@/src/components/message-body";
import { JobReportDialog } from "@/src/components/report-dialog";
import {
	communityDateLabel,
	communityPostHref,
} from "@/src/lib/community/community";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc, queryClient } from "@/src/lib/orpc";

function CommunityPostDetail() {
	const { board, postId } = useLocalSearchParams<{
		board: string;
		postId: string;
	}>();
	const [password, setPassword] = useState("");
	const [submittedPassword, setSubmittedPassword] = useState("");
	const [isReportOpen, setIsReportOpen] = useState(false);
	const { state } = useVisitor();
	const query = useQuery(
		orpc.bambi.community.getPost.queryOptions({
			input: {
				password: submittedPassword || undefined,
				postId,
			},
		})
	);
	const navigation = useQuery({
		...orpc.bambi.community.getPostNavigation.queryOptions({
			input: {
				board: query.data && !query.data.locked ? query.data.board : board,
				currentId: postId,
				publicView: false,
				source: "native",
			},
		}),
		enabled: Boolean(query.data && !query.data.locked),
	});
	const like = useMutation(
		orpc.bambi.community.toggleLike.mutationOptions({
			onError: (error) => Alert.alert("추천하지 못했어요", error.message),
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.community.key(),
				});
			},
		})
	);
	const remove = useMutation(
		orpc.bambi.community.deletePost.mutationOptions({
			onError: (error) => Alert.alert("삭제하지 못했어요", error.message),
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.community.key(),
				});
				router.replace(`/(seeker)/community/${board}` as unknown as Href);
			},
		})
	);

	if (query.isPending) {
		return <LoadingState label="게시글을 불러오고 있어요." />;
	}
	if (query.isError || !query.data) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}
	if (query.data.locked) {
		return (
			<BambiScreen>
				<Stack.Screen options={{ title: "비밀글" }} />
				<Surface className="gap-4 rounded-lg p-4" variant="secondary">
					<Text className="font-bold text-foreground text-lg">
						비밀글입니다
					</Text>
					<Text className="text-muted text-sm">
						글을 작성할 때 정한 비밀번호를 입력해 주세요.
					</Text>
					<TextField>
						<Input
							onChangeText={setPassword}
							placeholder="비밀번호"
							secureTextEntry
							value={password}
						/>
					</TextField>
					<Button
						isDisabled={!password.trim()}
						onPress={() => setSubmittedPassword(password.trim())}
					>
						<Button.Label>열기</Button.Label>
					</Button>
				</Surface>
			</BambiScreen>
		);
	}

	const post = query.data;
	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "게시글" }} />
			<View className="gap-2">
				<View className="flex-row flex-wrap gap-2">
					{post.isLocked ? <Pill>비밀글</Pill> : null}
					{post.isPromotion ? <Pill tone="accent">광고</Pill> : null}
					<Pill tone="neutral">{post.authorRole}</Pill>
					{post.authorGrade ? (
						<Pill tone="accent">{post.authorGrade.name}</Pill>
					) : null}
				</View>
				<Text className="font-bold text-3xl text-foreground" selectable>
					{post.title}
				</Text>
				<Text className="text-muted text-sm">
					{post.authorName} · {communityDateLabel(post.createdAt)} · 조회{" "}
					{post.viewCount}
				</Text>
			</View>
			<View className="flex-row gap-2">
				<View className="flex-1">
					<Button
						isDisabled={!navigation.data?.previous}
						onPress={() => {
							const previous = navigation.data?.previous;
							if (previous) {
								router.replace(
									communityPostHref({
										board,
										id: previous.id,
										source: previous.source,
									}) as unknown as Href
								);
							}
						}}
						variant="secondary"
					>
						<Button.Label>이전 글</Button.Label>
					</Button>
				</View>
				<View className="flex-1">
					<Button
						isDisabled={!navigation.data?.next}
						onPress={() => {
							const next = navigation.data?.next;
							if (next) {
								router.replace(
									communityPostHref({
										board,
										id: next.id,
										source: next.source,
									}) as unknown as Href
								);
							}
						}}
						variant="secondary"
					>
						<Button.Label>다음 글</Button.Label>
					</Button>
				</View>
			</View>
			<Surface className="gap-3 rounded-lg p-4" variant="secondary">
				<MessageBody body={post.body} />
				{post.contactPhone ? (
					<Text className="text-accent text-sm" selectable>
						연락처: {post.contactPhone}
					</Text>
				) : null}
			</Surface>
			<View className="flex-row flex-wrap gap-2">
				<Button
					isDisabled={like.isPending}
					onPress={() =>
						like.mutate({
							password: submittedPassword || undefined,
							postId,
						})
					}
					variant="secondary"
				>
					<Button.Label>
						{post.isLiked ? "추천 취소" : "추천"} {post.likeCount}
					</Button.Label>
				</Button>
				{post.canEdit ? (
					<Button
						onPress={() =>
							router.push(
								`/(seeker)/community/${board}/${postId}/edit` as unknown as Href
							)
						}
						variant="secondary"
					>
						<Button.Label>수정</Button.Label>
					</Button>
				) : null}
				{post.canDelete ? (
					<Button
						onPress={() =>
							Alert.alert(
								"게시글을 삭제할까요?",
								"삭제한 글은 복구할 수 없어요.",
								[
									{ text: "취소" },
									{
										onPress: () =>
											remove.mutate({
												password: submittedPassword || undefined,
												postId,
											}),
										style: "destructive",
										text: "삭제",
									},
								]
							)
						}
						variant="danger"
					>
						<Button.Label>삭제</Button.Label>
					</Button>
				) : null}
				{state === "member" ? (
					<Button onPress={() => setIsReportOpen(true)} variant="tertiary">
						<Button.Label>신고</Button.Label>
					</Button>
				) : null}
			</View>
			{post.commentsDisabled ? (
				<Text className="text-muted text-sm">
					이 글은 댓글을 작성할 수 없어요.
				</Text>
			) : (
				<CommunityComments password={submittedPassword} postId={postId} />
			)}
			<JobReportDialog
				isOpen={isReportOpen}
				onOpenChange={setIsReportOpen}
				targetId={postId}
				targetType="community_post"
			/>
		</BambiScreen>
	);
}

export default function CommunityPostScreen() {
	return (
		<MemberOnly allowCommunityGuest allowVerifiedGuest>
			<CommunityPostDetail />
		</MemberOnly>
	);
}

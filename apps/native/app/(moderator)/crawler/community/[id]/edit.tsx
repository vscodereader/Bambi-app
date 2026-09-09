import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Button, Input, Surface, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Alert, Text } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	LoadingState,
} from "@/src/components/bambi-screen";
import { ContentDocumentEditor } from "@/src/components/moderation/content-document-editor";
import {
	directMessageBodyToText,
	parseDirectMessageBody,
} from "@/src/lib/me-messages";
import { useUnsavedChanges } from "@/src/lib/moderation/use-unsaved-changes";
import { orpc } from "@/src/lib/orpc";

export default function CrawledCommunityEditScreen() {
	const [reload, setReload] = useState(0);
	const { id } = useLocalSearchParams<{ id: string }>();
	const query = useQuery(
		orpc.bambi.crawler.getTopicForEdit.queryOptions({ input: { id } })
	);
	if (query.isPending) {
		return <LoadingState label="수집 글을 불러오고 있습니다." />;
	}
	if (!query.data) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}
	return (
		<Editor
			data={query.data}
			key={`${query.data.id}-${reload}`}
			onReload={async () => {
				const result = await query.refetch();
				if (result.error) {
					Alert.alert("불러오기 실패", result.error.message);
					return;
				}
				setReload((value) => value + 1);
			}}
		/>
	);
}
function Editor({
	data,
	onReload,
}: {
	data: NonNullable<ReturnType<typeof useTopicData>>;
	onReload: () => Promise<void>;
}) {
	const [title, setTitle] = useState(data.title);
	const [uploading, setUploading] = useState(false);
	const [body, setBody] = useState({
		json: data.body,
		text: directMessageBodyToText(data.body),
	});
	const [revision, setRevision] = useState(data.revision);
	const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
		{}
	);
	const update = useMutation(orpc.bambi.crawler.updateTopic.mutationOptions());
	const updateComment = useMutation(
		orpc.bambi.crawler.updateSourceComment.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	useUnsavedChanges(
		title !== data.title ||
			body.json !== data.body ||
			Object.entries(commentDrafts).some(
				([id, text]) =>
					data.sourceComments.find((comment) => comment.id === id)?.body !==
					text
			),
		update.isPending || updateComment.isPending
	);
	const saved = async (nextRevision: number, message: string) => {
		setRevision(nextRevision);
		await client.invalidateQueries({ queryKey: orpc.bambi.crawler.key() });
		toast.show({ label: message });
	};
	return (
		<BambiScreen>
			<BambiHeader
				description={`${data.board.label} · 원문은 보존되고 편집본 revision만 갱신됩니다.`}
				title="수집 글 편집"
			/>
			<TextField>
				<Input
					maxLength={200}
					onChangeText={setTitle}
					placeholder="제목"
					value={title}
				/>
			</TextField>
			<ContentDocumentEditor
				allowUpload
				onBusyChange={setUploading}
				onChange={setBody}
				value={data.body}
			/>
			<Button
				isDisabled={
					update.isPending ||
					uploading ||
					title.trim().length < 2 ||
					!(
						body.text.trim() ||
						parseDirectMessageBody(body.json)?.some(
							(block) => block.type === "image"
						)
					)
				}
				onPress={async () => {
					try {
						const result = await update.mutateAsync({
							id: data.id,
							expectedRevision: revision,
							title: title.trim(),
							body: body.json,
						});
						await saved(result.revision, "수집 글을 저장했어요.");
					} catch (error) {
						toast.show({
							label:
								error instanceof Error ? error.message : "저장하지 못했어요.",
							variant: "danger",
						});
					}
				}}
			>
				<Button.Label>글 저장</Button.Label>
			</Button>
			<Text className="font-bold text-foreground">수집 원문 댓글</Text>
			{data.sourceComments.map((comment) => (
				<Surface
					className="gap-2 rounded-lg p-3"
					key={comment.id}
					variant="secondary"
				>
					<Text className="text-muted text-xs">
						{comment.authorName ?? "작성자 미상"}
					</Text>
					<TextField>
						<Input
							onChangeText={(value) =>
								setCommentDrafts((items) => ({ ...items, [comment.id]: value }))
							}
							value={commentDrafts[comment.id] ?? comment.body}
						/>
					</TextField>
					<Button
						isDisabled={updateComment.isPending}
						onPress={async () => {
							try {
								const result = await updateComment.mutateAsync({
									id: data.id,
									expectedRevision: revision,
									sourceCommentId: comment.id,
									body: (commentDrafts[comment.id] ?? comment.body).trim(),
								});
								await saved(result.revision, "댓글 편집본을 저장했어요.");
							} catch (error) {
								toast.show({
									label:
										error instanceof Error
											? error.message
											: "저장하지 못했어요.",
									variant: "danger",
								});
							}
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>댓글 저장</Button.Label>
					</Button>
				</Surface>
			))}
			<Button
				onPress={() => router.replace("/(moderator)/crawler" as Href)}
				variant="secondary"
			>
				<Button.Label>수집 관리로</Button.Label>
			</Button>
			<Button
				isDisabled={update.isPending || updateComment.isPending}
				onPress={() =>
					Alert.alert(
						"최신 저장본 불러오기",
						"현재 편집 내용을 버리고 서버의 최신 내용으로 바꿀까요?",
						[
							{ text: "계속 편집", style: "cancel" },
							{ text: "불러오기", onPress: onReload },
						]
					)
				}
				variant="secondary"
			>
				<Button.Label>최신 저장본 다시 불러오기</Button.Label>
			</Button>
		</BambiScreen>
	);
}
function useTopicData() {
	return useQuery(
		orpc.bambi.crawler.getTopicForEdit.queryOptions({ input: { id: "" } })
	).data;
}

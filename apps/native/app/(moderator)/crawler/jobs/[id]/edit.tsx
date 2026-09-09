import type { AppRouterClient } from "@bambi-app/api/routers/index";
import type { CrawledImageDocument } from "@bambi-app/api/services/bambi-crawled-image-editor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Button, useToast } from "heroui-native";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	LoadingState,
} from "@/src/components/bambi-screen";
import { ImageDocumentEditor } from "@/src/components/moderation/image-document-editor";
import { useUnsavedChanges } from "@/src/lib/moderation/use-unsaved-changes";
import { orpc } from "@/src/lib/orpc";

type Data = Awaited<
	ReturnType<AppRouterClient["bambi"]["crawler"]["getPostImagesForEdit"]>
>;
export default function CrawledJobImageEditScreen() {
	const [reload, setReload] = useState(0);
	const { id } = useLocalSearchParams<{ id: string }>();
	const query = useQuery(
		orpc.bambi.crawler.getPostImagesForEdit.queryOptions({ input: { id } })
	);
	if (query.isPending) {
		return <LoadingState label="이미지를 불러오고 있어요." />;
	}
	if (!query.data) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}
	return (
		<Editor
			data={query.data}
			key={`${id}-${reload}`}
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
	data: Data;
	onReload: () => Promise<void>;
}) {
	const [document, setDocument] = useState<CrawledImageDocument>(data.document);
	const savedDocument = useRef(document);
	const [original, setOriginal] = useState(false);
	const [revision, setRevision] = useState(data.detailImageEditRevision);
	const [loadingOriginal, setLoadingOriginal] = useState(false);
	const save = useMutation(
		orpc.bambi.crawler.updatePostImages.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	useUnsavedChanges(
		document !== savedDocument.current,
		save.isPending || loadingOriginal
	);
	const restore = async () => {
		setLoadingOriginal(true);
		try {
			const source = await client.fetchQuery(
				orpc.bambi.crawler.getOriginalPostImagesForEdit.queryOptions({
					input: { id: data.id },
				})
			);
			setDocument(source);
			setOriginal(true);
		} catch (error) {
			toast.show({
				label:
					error instanceof Error ? error.message : "원본을 불러오지 못했어요.",
				variant: "danger",
			});
		} finally {
			setLoadingOriginal(false);
		}
	};
	return (
		<BambiScreen>
			<BambiHeader
				description="원본을 보존하며 이미지 편집본을 저장합니다."
				title={data.title}
			/>
			<ImageDocumentEditor
				isDisabled={save.isPending || loadingOriginal}
				onChange={(next) => {
					setDocument(next);
					setOriginal(false);
				}}
				value={document}
			/>
			<Button
				isDisabled={save.isPending || loadingOriginal}
				onPress={() =>
					Alert.alert(
						"원본 복귀",
						"현재 편집 내용을 수집 원본으로 바꿀까요? 저장을 눌러야 적용됩니다.",
						[
							{ text: "취소", style: "cancel" },
							{ text: "원본 불러오기", onPress: restore },
						]
					)
				}
				variant="secondary"
			>
				<Button.Label>원본 복귀</Button.Label>
			</Button>
			<Button
				isDisabled={save.isPending || loadingOriginal}
				onPress={async () => {
					try {
						const result = await save.mutateAsync({
							id: data.id,
							expectedRevision: revision,
							document: original ? null : document,
						});
						setRevision(result.detailImageEditRevision);
						savedDocument.current = document;
						await Promise.all([
							client.invalidateQueries({
								queryKey: orpc.bambi.crawler.getPostImagesForEdit.key(),
							}),
							client.invalidateQueries({
								queryKey: orpc.bambi.crawledJobs.getById.key(),
							}),
						]);
						toast.show({ label: "이미지 편집 결과를 저장했어요." });
					} catch (error) {
						toast.show({
							label:
								error instanceof Error ? error.message : "저장하지 못했어요.",
							variant: "danger",
						});
					}
				}}
			>
				<Button.Label>편집 결과 저장</Button.Label>
			</Button>
			<Button
				isDisabled={save.isPending || loadingOriginal}
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

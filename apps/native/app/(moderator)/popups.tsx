import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import {
	type CrawledImageDocument,
	imageMime,
} from "@bambi-app/api/services/bambi-crawled-image-editor";
import { popupPageOptionsForAudience } from "@bambi-app/api/services/bambi-main-popup-pages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Input,
	Surface,
	Switch,
	TextField,
	useToast,
} from "heroui-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { MessageBody } from "@/src/components/message-body";
import { ContentDocumentEditor } from "@/src/components/moderation/content-document-editor";
import { ImageDocumentEditor } from "@/src/components/moderation/image-document-editor";
import { PopupDateTimePicker } from "@/src/components/moderation/popup-date-time-picker";
import {
	PopupPreview,
	type PopupPreviewItem,
} from "@/src/components/moderation/popup-preview";
import { useUnsavedChanges } from "@/src/lib/moderation/use-unsaved-changes";
import { orpc } from "@/src/lib/orpc";

const AUDIENCE_LABEL = {
	common: "공통",
	employer: "구인자",
	job_seeker: "구직자",
} as const;
type Popup = NonNullable<ReturnType<typeof usePopupData>>;
function toImageDocument(image: Popup["originalImage"]): CrawledImageDocument {
	if (!image) {
		return { version: 1, assets: [], items: [] };
	}
	const assetId = generateChatMessageId();
	return {
		version: 1,
		assets: [
			{
				id: assetId,
				dataUrl: image.dataUrl,
				width: image.width,
				height: image.height,
			},
		],
		items: [
			{
				id: generateChatMessageId(),
				assetId,
				displayWidthPx: null,
				displayHeightPx: null,
				offsetX: 0,
				offsetY: 0,
			},
		],
	};
}
function usePopupData() {
	return useQuery(orpc.bambi.mainPopups.listAdmin.queryOptions()).data
		?.items[0];
}

export default function ModeratorPopupsScreen() {
	const [reloads, setReloads] = useState<Record<string, number>>({});
	const previews = useRef(new Map<string, PopupPreviewItem>());
	const registerPreview = useCallback((id: string, item: PopupPreviewItem) => {
		previews.current.set(id, item);
	}, []);
	const query = useQuery(orpc.bambi.mainPopups.listAdmin.queryOptions());
	const client = useQueryClient();
	const { toast } = useToast();
	const [count, setCount] = useState("");
	const setCountMutation = useMutation(
		orpc.bambi.mainPopups.setCount.mutationOptions()
	);
	const remove = useMutation(orpc.bambi.mainPopups.delete.mutationOptions());
	const refresh = () =>
		client.invalidateQueries({ queryKey: orpc.bambi.mainPopups.key() });
	const act = async (action: () => Promise<unknown>, message: string) => {
		try {
			await action();
			await refresh();
			toast.show({ label: message });
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "처리하지 못했어요.",
				variant: "danger",
			});
		}
	};
	if (query.isError && !query.data) {
		return (
			<BambiScreen>
				<BambiHeader title="팝업 관리" />
				<StateCard
					description="잠시 후 다시 시도해 주세요."
					title="팝업을 불러오지 못했어요"
				/>
			</BambiScreen>
		);
	}
	return (
		<BambiScreen>
			<BambiHeader
				description="팝업 개수, 내용, 대상과 노출 상태를 관리하고 앱 화면으로 미리 봅니다."
				title="팝업 관리"
			/>
			<Surface className="gap-2 rounded-lg p-4" variant="secondary">
				<Text className="font-bold text-foreground">팝업 개수</Text>
				<Text className="text-muted text-sm">
					현재 {query.data?.items.length ?? 0}개
				</Text>
				<TextField>
					<Input
						keyboardType="number-pad"
						onChangeText={setCount}
						placeholder="개수"
						value={count}
					/>
				</TextField>
				<Button
					isDisabled={
						!(count.trim() && Number.isInteger(Number(count))) ||
						Number(count) < 0 ||
						setCountMutation.isPending
					}
					onPress={() =>
						Alert.alert(
							"팝업 개수 변경",
							Number(count) < (query.data?.items.length ?? 0)
								? `${(query.data?.items ?? [])
										.slice(Number(count))
										.map((item) => `${item.slotIndex}번`)
										.join(", ")} 팝업과 내용이 삭제됩니다. 변경할까요?`
								: `${Number(count)}개로 변경할까요?`,
							[
								{ text: "취소", style: "cancel" },
								{
									text: "변경",
									onPress: () =>
										act(
											() =>
												setCountMutation.mutateAsync({ count: Number(count) }),
											"팝업 개수를 변경했어요."
										),
								},
							]
						)
					}
				>
					<Button.Label>개수 변경</Button.Label>
				</Button>
			</Surface>
			{query.data?.items.map((popup) => (
				<PopupEditor
					key={`${popup.id}-${reloads[popup.id] ?? 0}`}
					onDelete={() =>
						Alert.alert(
							"팝업 삭제",
							`${popup.slotIndex}번 팝업을 삭제할까요?`,
							[
								{ text: "취소", style: "cancel" },
								{
									text: "삭제",
									style: "destructive",
									onPress: () =>
										act(
											() => remove.mutateAsync({ id: popup.id }),
											"팝업을 삭제했어요."
										),
								},
							]
						)
					}
					onPreviewChange={registerPreview}
					onReload={async () => {
						const result = await query.refetch();
						if (result.error) {
							toast.show({ label: result.error.message, variant: "danger" });
							return;
						}
						setReloads((current) => ({
							...current,
							[popup.id]: (current[popup.id] ?? 0) + 1,
						}));
					}}
					onSaved={refresh}
					popup={popup}
				/>
			))}
			{query.data?.items.length ? (
				<PopupPreview
					getItems={() =>
						(query.data?.items ?? []).flatMap((popup) => {
							const item = previews.current.get(popup.id);
							return item ? [item] : [];
						})
					}
					height={1}
					width={1}
				/>
			) : null}
		</BambiScreen>
	);
}

function PopupEditor({
	popup,
	onPreviewChange,
	onReload,
	onSaved,
	onDelete,
}: {
	popup: Popup;
	onReload: () => Promise<void>;
	onPreviewChange: (id: string, preview: PopupPreviewItem) => void;
	onSaved: () => Promise<void>;
	onDelete: () => void;
}) {
	const [revision, setRevision] = useState(popup.revision);
	const [contentType, setContentType] = useState(popup.contentType);
	const [originalImage, setOriginalImage] = useState(popup.originalImage);
	const [editedImage, setEditedImage] = useState(popup.editedImage);
	const [imageDocument, setImageDocument] = useState(() =>
		toImageDocument(popup.editedImage ?? popup.originalImage)
	);
	const imageOrigins = useRef(
		new Map(
			imageDocument.assets.map((asset) => [asset.id, popup.originalImage])
		)
	);
	const [contentWidth, setContentWidth] = useState(String(popup.contentWidth));
	const [contentHeight, setContentHeight] = useState(
		String(popup.contentHeight)
	);
	const [linkPath, setLinkPath] = useState(popup.linkPath ?? "");
	const [startsAt, setStartsAt] = useState(
		popup.startsAt ? new Date(popup.startsAt).toISOString() : ""
	);
	const [endsAt, setEndsAt] = useState(
		popup.endsAt ? new Date(popup.endsAt).toISOString() : ""
	);
	const boards = useQuery(orpc.bambi.communityBoards.list.queryOptions());
	const [enabled, setEnabled] = useState(popup.enabled);
	const [audience, setAudience] = useState(popup.audience);
	const [targets, setTargets] = useState<string[]>(popup.targetPages);
	const [document, setDocument] = useState({
		json: popup.textDocument ? JSON.stringify(popup.textDocument) : "",
		text: "",
	});
	const { toast } = useToast();
	const save = useMutation(orpc.bambi.mainPopups.save.mutationOptions());
	useEffect(() => {
		onPreviewChange(popup.id, {
			body: contentType === "text" ? document.json : undefined,
			imageUrl:
				contentType === "image"
					? (editedImage ?? originalImage)?.dataUrl
					: undefined,
			width: Number(contentWidth),
			height: Number(contentHeight),
			link: contentType === "image" ? linkPath : undefined,
		});
	}, [
		popup.id,
		onPreviewChange,
		contentType,
		document.json,
		editedImage,
		originalImage,
		contentWidth,
		contentHeight,
		linkPath,
	]);
	const fingerprint = JSON.stringify({
		enabled,
		audience,
		targets,
		document,
		contentType,
		originalImage,
		editedImage,
		contentWidth,
		contentHeight,
		linkPath,
		startsAt,
		endsAt,
	});
	const savedFingerprint = useRef(fingerprint);
	useUnsavedChanges(fingerprint !== savedFingerprint.current, save.isPending);
	const preview =
		contentType === "image"
			? { imageUrl: (editedImage ?? originalImage)?.dataUrl, link: linkPath }
			: { body: document.json };
	const submit = async () => {
		try {
			const result = await save.mutateAsync({
				audience,
				contentHeight: Number(contentHeight),
				contentType,
				contentWidth: Number(contentWidth),
				editedImage: contentType === "image" ? editedImage : null,
				enabled,
				endsAt: endsAt.trim() ? new Date(endsAt) : null,
				expectedRevision: revision,
				id: popup.id,
				linkPath: contentType === "image" ? linkPath.trim() || null : null,
				originalImage: contentType === "image" ? originalImage : null,
				startsAt: startsAt.trim() ? new Date(startsAt) : null,
				targetPages: targets,
				textDocument:
					contentType === "text"
						? JSON.parse(
								document.json ||
									'{"type":"doc","content":[{"type":"paragraph"}]}'
							)
						: null,
			});
			setRevision(result.revision);
			savedFingerprint.current = fingerprint;
			await onSaved();
			toast.show({ label: "팝업을 저장했어요." });
		} catch (error) {
			toast.show({
				label:
					error instanceof Error
						? error.message
						: "저장하지 못했어요. 최신 내용을 다시 확인해 주세요.",
				variant: "danger",
			});
		}
	};
	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<Button
				isDisabled={save.isPending}
				onPress={() =>
					Alert.alert(
						"팝업 유형 변경",
						"다른 유형으로 저장하면 현재 유형의 내용은 저장에서 제외됩니다. 변경할까요?",
						[
							{ text: "취소", style: "cancel" },
							{
								text: "변경",
								onPress: () =>
									setContentType((current) =>
										current === "image" ? "text" : "image"
									),
							},
						]
					)
				}
				size="sm"
				variant="secondary"
			>
				<Button.Label>
					{contentType === "image" ? "글형으로 변경" : "이미지형으로 변경"}
				</Button.Label>
			</Button>
			<TextField>
				<Input
					accessibilityLabel="팝업 너비"
					keyboardType="number-pad"
					onChangeText={setContentWidth}
					placeholder="너비"
					value={contentWidth}
				/>
			</TextField>
			<TextField>
				<Input
					accessibilityLabel="팝업 높이"
					keyboardType="number-pad"
					onChangeText={setContentHeight}
					placeholder="높이"
					value={contentHeight}
				/>
			</TextField>
			<PopupDateTimePicker
				kind="start"
				onChange={setStartsAt}
				value={startsAt}
			/>
			<PopupDateTimePicker kind="end" onChange={setEndsAt} value={endsAt} />
			<View className="flex-row items-center justify-between">
				<Text className="font-bold text-foreground">
					{popup.slotIndex}번 팝업
				</Text>
				<Switch isSelected={enabled} onSelectedChange={setEnabled} />
			</View>
			<View className="flex-row flex-wrap gap-2">
				{(["common", "job_seeker", "employer"] as const).map((value) => (
					<Pressable key={value} onPress={() => setAudience(value)}>
						<Pill tone={audience === value ? "success" : "neutral"}>
							{AUDIENCE_LABEL[value]}
						</Pill>
					</Pressable>
				))}
			</View>
			<View className="flex-row flex-wrap gap-2">
				{popupPageOptionsForAudience(audience, boards.data ?? []).map(
					(page) => (
						<Pressable
							key={page.id}
							onPress={() =>
								setTargets((items) =>
									items.includes(page.id)
										? items.filter((id) => id !== page.id)
										: [...items, page.id]
								)
							}
						>
							<Pill tone={targets.includes(page.id) ? "success" : "neutral"}>
								{page.label}
							</Pill>
						</Pressable>
					)
				)}
			</View>
			{contentType === "text" ? (
				<>
					<ContentDocumentEditor
						allowFontSize
						allowImages={false}
						onChange={setDocument}
						value={popup.textDocument ? JSON.stringify(popup.textDocument) : ""}
					/>
					<Surface className="gap-2 rounded-lg p-3">
						<Text className="font-semibold text-muted text-xs">
							앱 미리보기
						</Text>
						<MessageBody
							body={document.json || JSON.stringify(popup.textDocument)}
						/>
					</Surface>
				</>
			) : (
				<>
					<ImageDocumentEditor
						isDisabled={save.isPending}
						maxInsertBytes={10 * 1024 * 1024}
						maxItems={1}
						mimeTypes={["image/jpeg", "image/png", "image/webp"]}
						onChange={(next) => {
							setImageDocument(next);
							const asset = next.assets[0];
							if (!asset) {
								setEditedImage(null);
								setOriginalImage(null);
								return;
							}
							const mimeType = imageMime(asset.dataUrl);
							if (
								mimeType !== "image/jpeg" &&
								mimeType !== "image/png" &&
								mimeType !== "image/webp"
							) {
								return;
							}
							const image: NonNullable<Popup["originalImage"]> = {
								dataUrl: asset.dataUrl,
								width: asset.width,
								height: asset.height,
								mimeType,
							};
							setEditedImage(image);
							setContentWidth(
								String(next.items[0]?.displayWidthPx ?? asset.width)
							);
							setContentHeight(
								String(next.items[0]?.displayHeightPx ?? asset.height)
							);
							if (!imageOrigins.current.has(asset.id)) {
								const origin =
									next.items[0]?.id === imageDocument.items[0]?.id
										? originalImage
										: image;
								imageOrigins.current.set(asset.id, origin);
							}
							setOriginalImage(imageOrigins.current.get(asset.id) ?? null);
						}}
						value={imageDocument}
					/>
					<Button
						isDisabled={save.isPending || !originalImage}
						onPress={() => {
							setEditedImage(null);
							setImageDocument(toImageDocument(originalImage));
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>이미지 원본 복귀</Button.Label>
					</Button>
					<TextField>
						<Input
							accessibilityLabel="이미지 링크"
							onChangeText={setLinkPath}
							placeholder="이미지 클릭 시 이동할 주소"
							value={linkPath}
						/>
					</TextField>
					<Text className="text-muted text-sm">
						이미지형 팝업입니다. 현재 저장된 원본과 편집본을 보존합니다.
					</Text>
					{editedImage || originalImage ? (
						<Image
							className="w-full rounded-lg"
							resizeMode="contain"
							source={{
								uri: (editedImage ?? originalImage)?.dataUrl,
							}}
							style={{
								aspectRatio: Number(contentWidth) / Number(contentHeight) || 1,
							}}
						/>
					) : null}
				</>
			)}
			<Button
				isDisabled={save.isPending || targets.length === 0}
				onPress={submit}
			>
				<Button.Label>팝업 저장</Button.Label>
			</Button>
			<PopupPreview
				{...preview}
				height={Number(contentHeight)}
				width={Number(contentWidth)}
			/>
			<Button onPress={onDelete} variant="danger-soft">
				<Button.Label>삭제</Button.Label>
			</Button>
			<Button
				isDisabled={save.isPending}
				onPress={() =>
					Alert.alert(
						"최신 저장본 불러오기",
						"저장하지 않은 현재 편집 내용을 버리고 서버의 최신 내용으로 바꿀까요?",
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
		</Surface>
	);
}

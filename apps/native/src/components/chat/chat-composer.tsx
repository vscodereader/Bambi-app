import { Ionicons } from "@expo/vector-icons";
import { getDocumentAsync } from "expo-document-picker";
import {
	launchCameraAsync,
	launchImageLibraryAsync,
	requestCameraPermissionsAsync,
} from "expo-image-picker";
import {
	BottomSheet,
	Button,
	ListGroup,
	Spinner,
	TextArea,
	useThemeColor,
	useToast,
} from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
	isImageMimeType,
	type PickedAttachment,
	toPickedAttachment,
	validatePickedAttachment,
} from "@/src/lib/chat/chat-attachment-picker";
import {
	emitChatTypingStarted,
	emitChatTypingStopped,
} from "@/src/lib/chat/chat-socket";

// 입력이 멎은 뒤 typing:stopped를 보내기까지의 창.
const TYPING_IDLE_MS = 3000;
const MESSAGE_MAX_LENGTH = 2000;
const IMAGE_QUALITY = 0.85;

// 하단 입력바: + 첨부(BottomSheet) / TextArea / 전송. 첨부를 고르면 입력바 위에 미리보기가
// 뜨고, 전송 시 텍스트가 있으면 첨부와 함께 보낸다(서버가 두 말풍선으로 저장).
export function ChatComposer({
	isDisabled,
	isUploading,
	onSendAttachment,
	onSendText,
	roomId,
}: {
	isDisabled: boolean;
	isUploading: boolean;
	onSendAttachment: (picked: PickedAttachment, body: string) => void;
	onSendText: (body: string) => void;
	roomId: string;
}) {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");
	const accentForeground = useThemeColor("accent-foreground");
	const { toast } = useToast();
	const [body, setBody] = useState("");
	const [draft, setDraft] = useState<PickedAttachment | null>(null);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const typingActiveRef = useRef(false);
	const typingTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);

	const stopTyping = () => {
		if (typingTimerRef.current !== null) {
			clearTimeout(typingTimerRef.current);
			typingTimerRef.current = null;
		}
		if (typingActiveRef.current) {
			typingActiveRef.current = false;
			emitChatTypingStopped(roomId);
		}
	};

	const handleChangeText = (next: string) => {
		setBody(next.slice(0, MESSAGE_MAX_LENGTH));
		if (!next.trim()) {
			stopTyping();
			return;
		}
		if (!typingActiveRef.current) {
			typingActiveRef.current = true;
			emitChatTypingStarted(roomId);
		}
		if (typingTimerRef.current !== null) {
			clearTimeout(typingTimerRef.current);
		}
		typingTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
	};

	const stopTypingRef = useRef(stopTyping);
	stopTypingRef.current = stopTyping;
	useEffect(() => () => stopTypingRef.current(), []);

	const acceptDraft = (picked: PickedAttachment) => {
		const validation = validatePickedAttachment(picked);

		if (!validation.ok) {
			toast.show({ label: validation.message, variant: "danger" });
			return;
		}
		setDraft(picked);
	};

	const pickFromLibrary = async () => {
		setIsSheetOpen(false);
		try {
			const result = await launchImageLibraryAsync({
				mediaTypes: ["images"],
				quality: IMAGE_QUALITY,
			});
			const asset = result.canceled ? null : result.assets[0];
			if (asset) {
				acceptDraft(
					toPickedAttachment(
						{
							fileName: asset.fileName,
							mimeType: asset.mimeType,
							size: asset.fileSize,
							uri: asset.uri,
						},
						"image/jpeg"
					)
				);
			}
		} catch {
			toast.show({ label: "사진을 불러오지 못했어요.", variant: "danger" });
		}
	};

	const pickFromCamera = async () => {
		setIsSheetOpen(false);
		try {
			const permission = await requestCameraPermissionsAsync();
			if (!permission.granted) {
				toast.show({ label: "카메라 권한이 필요해요.", variant: "warning" });
				return;
			}
			const result = await launchCameraAsync({ quality: IMAGE_QUALITY });
			const asset = result.canceled ? null : result.assets[0];
			if (asset) {
				acceptDraft(
					toPickedAttachment(
						{
							fileName: asset.fileName,
							mimeType: asset.mimeType,
							size: asset.fileSize,
							uri: asset.uri,
						},
						"image/jpeg"
					)
				);
			}
		} catch {
			toast.show({ label: "사진을 찍지 못했어요.", variant: "danger" });
		}
	};

	const pickDocument = async () => {
		setIsSheetOpen(false);
		try {
			const result = await getDocumentAsync({
				copyToCacheDirectory: true,
				multiple: false,
				type: "application/pdf",
			});
			const asset = result.canceled ? null : result.assets[0];
			if (asset) {
				acceptDraft(
					toPickedAttachment(
						{
							fileName: asset.name,
							mimeType: asset.mimeType,
							size: asset.size,
							uri: asset.uri,
						},
						"application/pdf"
					)
				);
			}
		} catch {
			toast.show({ label: "파일을 불러오지 못했어요.", variant: "danger" });
		}
	};

	const canSend =
		!(isDisabled || isUploading) && (Boolean(draft) || body.trim().length > 0);

	const handleSend = () => {
		if (!canSend) {
			return;
		}
		stopTyping();
		if (draft) {
			onSendAttachment(draft, body);
			setDraft(null);
		} else {
			onSendText(body);
		}
		setBody("");
	};

	return (
		<View
			className="border-border border-t bg-background px-3 pt-2"
			style={{ paddingBottom: insets.bottom + 8 }}
		>
			{draft ? (
				<View className="mb-2 flex-row items-center gap-3 rounded-2xl bg-surface-secondary p-2">
					{isImageMimeType(draft.mimeType) ? (
						<Image
							accessibilityIgnoresInvertColors
							className="h-14 w-14 rounded-xl"
							source={{ uri: draft.uri }}
						/>
					) : (
						<View className="h-14 w-14 items-center justify-center rounded-xl bg-danger/15">
							<Ionicons
								color={foreground}
								name="document-text-outline"
								size={24}
							/>
						</View>
					)}
					<Text className="flex-1 text-foreground text-sm" numberOfLines={2}>
						{draft.fileName}
					</Text>
					<Pressable
						accessibilityLabel="첨부 제거"
						accessibilityRole="button"
						hitSlop={8}
						onPress={() => setDraft(null)}
					>
						<Ionicons color={foreground} name="close-circle" size={22} />
					</Pressable>
				</View>
			) : null}
			<View className="flex-row items-end gap-2">
				<BottomSheet isOpen={isSheetOpen} onOpenChange={setIsSheetOpen}>
					<BottomSheet.Trigger asChild>
						<Pressable
							accessibilityLabel="첨부 추가"
							accessibilityRole="button"
							className="h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary active:opacity-75"
							disabled={isDisabled || isUploading}
						>
							<Ionicons color={foreground} name="add" size={26} />
						</Pressable>
					</BottomSheet.Trigger>
					<BottomSheet.Portal>
						<BottomSheet.Overlay />
						<BottomSheet.Content>
							<BottomSheet.Title>무엇을 보낼까요?</BottomSheet.Title>
							<BottomSheet.Description>
								이미지(JPG·PNG·WebP)와 PDF, 10MB까지
							</BottomSheet.Description>
							<ListGroup className="mt-4" variant="transparent">
								<ListGroup.Item onPress={pickFromLibrary}>
									<ListGroup.ItemPrefix>
										<Ionicons
											color={foreground}
											name="images-outline"
											size={22}
										/>
									</ListGroup.ItemPrefix>
									<ListGroup.ItemContent>
										<ListGroup.ItemTitle>앨범에서 선택</ListGroup.ItemTitle>
									</ListGroup.ItemContent>
								</ListGroup.Item>
								<ListGroup.Item onPress={pickFromCamera}>
									<ListGroup.ItemPrefix>
										<Ionicons
											color={foreground}
											name="camera-outline"
											size={22}
										/>
									</ListGroup.ItemPrefix>
									<ListGroup.ItemContent>
										<ListGroup.ItemTitle>사진 촬영</ListGroup.ItemTitle>
									</ListGroup.ItemContent>
								</ListGroup.Item>
								<ListGroup.Item onPress={pickDocument}>
									<ListGroup.ItemPrefix>
										<Ionicons
											color={foreground}
											name="document-outline"
											size={22}
										/>
									</ListGroup.ItemPrefix>
									<ListGroup.ItemContent>
										<ListGroup.ItemTitle>PDF 파일</ListGroup.ItemTitle>
									</ListGroup.ItemContent>
								</ListGroup.Item>
							</ListGroup>
						</BottomSheet.Content>
					</BottomSheet.Portal>
				</BottomSheet>
				<View className="flex-1">
					<TextArea
						accessibilityLabel="메시지 입력"
						className="h-auto max-h-32 min-h-12"
						editable={!isDisabled}
						maxLength={MESSAGE_MAX_LENGTH}
						onBlur={stopTyping}
						onChangeText={handleChangeText}
						placeholder="메시지를 입력하세요"
						textAlignVertical="center"
						value={body}
						variant="secondary"
					/>
				</View>
				<Button
					accessibilityLabel="보내기"
					isDisabled={!canSend}
					isIconOnly
					onPress={handleSend}
					size="md"
				>
					{isUploading ? (
						<Spinner size="sm" />
					) : (
						<Ionicons color={accentForeground} name="arrow-up" size={20} />
					)}
				</Button>
			</View>
		</View>
	);
}

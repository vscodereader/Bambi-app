import { Ionicons } from "@expo/vector-icons";
import { openBrowserAsync } from "expo-web-browser";
import { cn, Dialog, Spinner, Surface, useThemeColor } from "heroui-native";
import { useEffect, useState } from "react";
import {
	Image,
	Pressable,
	Text,
	useWindowDimensions,
	View,
} from "react-native";

import type { ChatSendStatus } from "@/src/lib/chat/chat-optimistic";
import type { ChatRoomAttachment } from "@/src/lib/chat/chat-types";

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_ASPECT_RATIO = 4 / 3;
// 말풍선 최대 너비(w-4/5)에서 아바타 열을 뺀 이미지 실폭 근사치 비율.
const IMAGE_WIDTH_RATIO = 0.62;

export const formatAttachmentSize = (byteSize: number): string => {
	if (byteSize >= BYTES_PER_MB) {
		return `${(byteSize / BYTES_PER_MB).toFixed(1)} MB`;
	}

	return `${Math.max(1, Math.round(byteSize / BYTES_PER_KB)).toLocaleString("ko-KR")} KB`;
};

// 이미지 크기는 응답에 없어 로드 후 비율을 잰다. 재기 전엔 4:3 자리.
function useImageAspectRatio(uri: null | string): number {
	const [ratio, setRatio] = useState(DEFAULT_ASPECT_RATIO);

	useEffect(() => {
		if (!uri) {
			return;
		}
		let cancelled = false;
		Image.getSize(
			uri,
			(width, height) => {
				if (!cancelled && width > 0 && height > 0) {
					setRatio(width / height);
				}
			},
			() => undefined
		);
		return () => {
			cancelled = true;
		};
	}, [uri]);

	return ratio;
}

// 이미지는 색 말풍선 없이 이미지 자체(web 2026-08-12 첨부 UI와 같은 결정), PDF는 정보 카드.
export function ChatAttachmentMessage({
	attachment,
	isMine,
	localImageUri,
	sendStatus,
}: {
	attachment: ChatRoomAttachment | null;
	isMine: boolean;
	localImageUri: null | string;
	sendStatus?: ChatSendStatus;
}) {
	const { width: windowWidth } = useWindowDimensions();
	const [isViewerOpen, setIsViewerOpen] = useState(false);
	const foreground = useThemeColor("foreground");
	const imageUri =
		attachment?.category === "image" ? attachment.objectUrl : localImageUri;
	const ratio = useImageAspectRatio(imageUri);
	const imageWidth = Math.round(windowWidth * IMAGE_WIDTH_RATIO);

	if (imageUri) {
		return (
			<>
				<Pressable
					accessibilityLabel={attachment?.fileName ?? "전송 중인 이미지"}
					accessibilityRole="imagebutton"
					className={cn(
						"overflow-hidden rounded-xl bg-surface-secondary",
						sendStatus && "opacity-70"
					)}
					disabled={!attachment}
					onPress={() => setIsViewerOpen(true)}
					style={{ aspectRatio: ratio, width: imageWidth }}
				>
					<Image
						accessibilityIgnoresInvertColors
						resizeMode="cover"
						source={{ uri: imageUri }}
						style={{ height: "100%", width: "100%" }}
					/>
					{sendStatus === "sending" ? (
						<View className="absolute inset-0 items-center justify-center">
							<Spinner size="lg" />
						</View>
					) : null}
				</Pressable>
				<Dialog isOpen={isViewerOpen} onOpenChange={setIsViewerOpen}>
					<Dialog.Portal>
						<Dialog.Overlay />
						<Dialog.Content className="h-full w-full bg-black p-0">
							<Pressable
								className="flex-1 items-center justify-center"
								onPress={() => setIsViewerOpen(false)}
							>
								<Image
									accessibilityIgnoresInvertColors
									resizeMode="contain"
									source={{ uri: imageUri }}
									style={{ height: "100%", width: "100%" }}
								/>
							</Pressable>
						</Dialog.Content>
					</Dialog.Portal>
				</Dialog>
			</>
		);
	}

	if (!attachment) {
		return null;
	}

	return (
		<Surface
			className="w-64 flex-row items-center gap-3 rounded-2xl p-3"
			variant={isMine ? "tertiary" : "secondary"}
		>
			<View className="h-10 w-10 items-center justify-center rounded-xl bg-danger/15">
				<Ionicons color={foreground} name="document-text-outline" size={22} />
			</View>
			<View className="flex-1">
				<Text
					className="font-semibold text-foreground text-sm"
					numberOfLines={2}
				>
					{attachment.fileName}
				</Text>
				<Text className="text-muted text-xs">
					{formatAttachmentSize(attachment.byteSize)} · PDF
				</Text>
			</View>
			<Pressable
				accessibilityLabel="PDF 열기"
				accessibilityRole="button"
				hitSlop={8}
				onPress={() => {
					openBrowserAsync(attachment.objectUrl).catch(() => undefined);
				}}
			>
				<Ionicons color={foreground} name="open-outline" size={20} />
			</Pressable>
		</Surface>
	);
}

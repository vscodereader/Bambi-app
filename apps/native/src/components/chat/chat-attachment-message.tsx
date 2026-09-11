import { Ionicons } from "@expo/vector-icons";
import { openBrowserAsync } from "expo-web-browser";
import {
	Button,
	cn,
	Dialog,
	Spinner,
	Surface,
	useThemeColor,
} from "heroui-native";
import { useEffect, useState } from "react";
import {
	Alert,
	Image,
	Pressable,
	Text,
	useWindowDimensions,
	View,
} from "react-native";

import type { ChatSendStatus } from "@/src/lib/chat/chat-optimistic";
import { resolveWebUrl } from "@/src/lib/dev-web-url";
import { saveManagedFile } from "@/src/lib/managed-file";

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
	attachment: null | {
		byteSize: number;
		category: "image" | "pdf";
		fileName: string;
		id: string;
		mimeType: string;
		objectUrl: string;
	};
	isMine: boolean;
	localImageUri: null | string;
	sendStatus?: ChatSendStatus;
}) {
	const { height: windowHeight, width: windowWidth } = useWindowDimensions();
	const [isViewerOpen, setIsViewerOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const foreground = useThemeColor("foreground");
	// dev 서버는 objectUrl로 web 로컬 라우트 상대 URL을 내려주므로 앱이 닿을 절대 URL로 푼다.
	const imageUri =
		attachment?.category === "image"
			? resolveWebUrl(attachment.objectUrl)
			: localImageUri;
	const ratio = useImageAspectRatio(imageUri);
	const imageWidth = Math.round(windowWidth * IMAGE_WIDTH_RATIO);
	const download = async () => {
		if (!attachment || saving) {
			return;
		}
		const url = resolveWebUrl(attachment.objectUrl);
		if (!url) {
			Alert.alert("저장하지 못했어요", "첨부파일 주소를 확인할 수 없어요.");
			return;
		}
		setSaving(true);
		try {
			const result = await saveManagedFile({
				fileName: attachment.fileName,
				mimeType: attachment.mimeType,
				url,
			});
			if (result.status === "saved") {
				Alert.alert("저장했어요", "선택한 위치에 파일을 저장했어요.");
			}
			if (result.status === "failed") {
				Alert.alert("저장하지 못했어요", result.message);
			}
		} finally {
			setSaving(false);
		}
	};

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
					<Dialog.Portal className="p-0">
						<Dialog.Overlay />
						<Dialog.Content
							className="rounded-none bg-black p-0"
							isSwipeable={false}
							style={{ height: windowHeight, width: windowWidth }}
						>
							<Pressable
								accessibilityLabel="이미지 닫기"
								accessibilityRole="button"
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
							<Button isDisabled={saving} onPress={download}>
								<Button.Label>
									{saving ? "저장 중" : "이미지 저장"}
								</Button.Label>
							</Button>
						</Dialog.Content>
					</Dialog.Portal>
				</Dialog>
			</>
		);
	}

	if (!attachment) {
		return null;
	}

	// 못 풀면(운영 비https 등) 열기 비활성 — 종전엔 상대 URL 그대로 열려 실패했다.
	const openUrl = resolveWebUrl(attachment.objectUrl);

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
				disabled={!openUrl}
				hitSlop={8}
				onPress={() => {
					if (openUrl) {
						openBrowserAsync(openUrl).catch(() => undefined);
					}
				}}
			>
				<Ionicons color={foreground} name="open-outline" size={20} />
			</Pressable>
			<Pressable
				accessibilityLabel="PDF 저장"
				accessibilityRole="button"
				disabled={!openUrl}
				hitSlop={8}
				onPress={() => {
					if (!openUrl) {
						return;
					}
					saveManagedFile({
						fileName: attachment.fileName,
						mimeType: attachment.mimeType,
						url: openUrl,
					})
						.then((result) => {
							if (result.status === "saved") {
								Alert.alert("저장했어요", "선택한 폴더에 파일을 저장했어요.");
							} else if (result.status === "failed") {
								Alert.alert("저장하지 못했어요", result.message);
							}
						})
						.catch(() => undefined);
				}}
			>
				<Ionicons color={foreground} name="download-outline" size={20} />
			</Pressable>
		</Surface>
	);
}

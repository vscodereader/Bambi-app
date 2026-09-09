import { launchImageLibraryAsync } from "expo-image-picker";
import { Button, useToast } from "heroui-native";
import { useState } from "react";
import { Image, View } from "react-native";
import { resolveUploadUrl } from "@/src/lib/dev-web-url";
import { readLocalFileBytes } from "@/src/lib/local-file-bytes";
import { bytesToBase64 } from "@/src/lib/managed-file-policy";

interface Pick {
	bytes: Uint8Array<ArrayBuffer>;
	fileName: string;
	height: number;
	mimeType: string;
	uri: string;
	width: number;
}
export async function uploadAdminImage(
	pick: Pick,
	intent: { uploadUrl: string; mimeType: string }
) {
	const url = resolveUploadUrl(intent.uploadUrl);
	if (!url) {
		throw new Error(
			"업로드 주소를 사용할 수 없어요. 서버 설정을 확인해 주세요."
		);
	}
	const response = await fetch(url, {
		method: "PUT",
		headers: { "Content-Type": intent.mimeType },
		body: pick.bytes,
	});
	if (!response.ok) {
		throw new Error("이미지를 올리지 못했어요. 다시 시도해 주세요.");
	}
}

export function AdminImagePicker({
	value,
	onChange,
	upload,
	maxBytes,
	mimeTypes = ["image/jpeg", "image/png", "image/webp"],
	onBusyChange,
}: {
	value?: string | null;
	onChange: (value: string | null) => void;
	upload?: (pick: Pick) => Promise<string>;
	maxBytes: number;
	mimeTypes?: readonly string[];
	onBusyChange?: (busy: boolean) => void;
}) {
	const [busy, setBusy] = useState(false);
	const { toast } = useToast();
	const choose = async () => {
		setBusy(true);
		onBusyChange?.(true);
		try {
			const result = await launchImageLibraryAsync({
				mediaTypes: ["images"],
				quality: 1,
			});
			const asset = result.canceled ? null : result.assets[0];
			if (!asset) {
				return;
			}
			const mimeType = asset.mimeType ?? "";
			if (!mimeTypes.includes(mimeType)) {
				throw new Error("지원하는 이미지 형식을 선택해 주세요.");
			}
			const { bytes } = await readLocalFileBytes(asset.uri);
			if (!bytes.length || bytes.length > maxBytes) {
				throw new Error(
					`이미지 크기는 ${(maxBytes / 1024 / 1024).toLocaleString("ko-KR")}MB 이하여야 해요.`
				);
			}
			const pick = {
				width: asset.width,
				height: asset.height,
				bytes,
				mimeType,
				fileName: asset.fileName ?? `image.${mimeType.split("/")[1]}`,
				uri: asset.uri,
			};
			onChange(
				upload
					? await upload(pick)
					: `data:${mimeType};base64,${bytesToBase64(bytes)}`
			);
		} catch (error) {
			toast.show({
				label:
					error instanceof Error
						? error.message
						: "이미지를 선택하지 못했어요.",
				variant: "danger",
			});
		} finally {
			setBusy(false);
			onBusyChange?.(false);
		}
	};
	return (
		<View className="gap-2">
			{value ? (
				<Image
					accessibilityLabel="이미지 미리보기"
					className="h-40 w-full rounded-lg"
					resizeMode="contain"
					source={{ uri: value }}
				/>
			) : null}
			<Button isDisabled={busy} onPress={choose} size="sm" variant="secondary">
				<Button.Label>{busy ? "이미지 처리 중" : "이미지 선택"}</Button.Label>
			</Button>
			{value ? (
				<Button
					isDisabled={busy}
					onPress={() => onChange(null)}
					size="sm"
					variant="danger-soft"
				>
					<Button.Label>이미지 제거</Button.Label>
				</Button>
			) : null}
		</View>
	);
}

import { useMutation } from "@tanstack/react-query";
import {
	type ImagePickerResult,
	launchImageLibraryAsync,
} from "expo-image-picker";
import { Button } from "heroui-native";
import { useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import {
	JOB_DETAIL_LIMIT,
	type JobMediaUploadItem,
	resolveJobImagePick,
	toJobMediaItem,
} from "@/src/lib/employer/job-media";
import { orpc } from "@/src/lib/orpc";

interface Props {
	cover: JobMediaUploadItem | null;
	detail: JobMediaUploadItem[];
	// 수정 프리필용 storageKey→원격 미리보기 URL. 없으면 파일명으로 폴백한다.
	initialPreviews?: Record<string, string>;
	onChange: (next: {
		cover: JobMediaUploadItem | null;
		detail: JobMediaUploadItem[];
	}) => void;
	organizationId: string;
	teamId: null | string;
}

// 미리보기 uri는 payload에 담지 않는다 — 화면 표시용으로만 storageKey에 매핑해 둔다.
type PreviewMap = Record<string, string>;

export function JobImagePickerSection({
	cover,
	detail,
	initialPreviews,
	onChange,
	organizationId,
	teamId,
}: Props) {
	const [isBusy, setIsBusy] = useState(false);
	const [previews, setPreviews] = useState<PreviewMap>(initialPreviews ?? {});
	const uploadMutation = useMutation(
		orpc.bambi.jobs.createMediaUpload.mutationOptions()
	);

	const pickAndUpload = async (
		usage: "cover" | "detail"
	): Promise<null | { item: JobMediaUploadItem; previewUri: string }> => {
		let picked: ImagePickerResult;

		try {
			picked = await launchImageLibraryAsync({
				mediaTypes: ["images"],
				quality: 0.9,
			});
		} catch {
			Alert.alert("사진을 불러오지 못했어요", "잠시 후 다시 시도해 주세요.");
			return null;
		}

		const asset = picked.canceled ? null : picked.assets[0];

		if (!asset) {
			return null;
		}

		// 서명 content-length에 blob.size가 묶인다 — asset.fileSize가 아니라 실측 바이트.
		const blob = await (await fetch(asset.uri)).blob();
		const resolved = resolveJobImagePick(
			{
				fileName: asset.fileName,
				height: asset.height,
				mimeType: asset.mimeType,
				uri: asset.uri,
				width: asset.width,
			},
			blob.size
		);

		if ("error" in resolved) {
			Alert.alert("등록할 수 없는 이미지예요", resolved.error);
			return null;
		}

		const intent = await uploadMutation.mutateAsync({
			byteSize: resolved.byteSize,
			fileName: resolved.fileName,
			mimeType: resolved.mimeType,
			organizationId,
			teamId: teamId ?? undefined,
			usage,
		});

		if (!intent.uploadUrl.startsWith("https://")) {
			Alert.alert(
				"지금은 이미지를 등록할 수 없어요",
				"잠시 후 다시 시도해 주세요."
			);
			return null;
		}

		const response = await fetch(intent.uploadUrl, {
			body: blob,
			headers: { "Content-Type": intent.mimeType },
			method: "PUT",
		});

		if (!response.ok) {
			throw new Error("upload failed");
		}

		return {
			item: toJobMediaItem(resolved, intent.storageKey),
			previewUri: asset.uri,
		};
	};

	const handleCoverPick = async () => {
		setIsBusy(true);

		try {
			const result = await pickAndUpload("cover");

			if (result) {
				setPreviews((prev) => ({
					...prev,
					[result.item.storageKey]: result.previewUri,
				}));
				onChange({ cover: result.item, detail });
			}
		} catch {
			Alert.alert("이미지 업로드에 실패했어요", "잠시 후 다시 시도해 주세요.");
		} finally {
			setIsBusy(false);
		}
	};

	const handleDetailPick = async () => {
		if (detail.length >= JOB_DETAIL_LIMIT) {
			Alert.alert(
				"상세 이미지는 최대 5장",
				"이미 5장을 등록했어요. 기존 이미지를 제거한 뒤 추가해 주세요."
			);
			return;
		}

		setIsBusy(true);

		try {
			const result = await pickAndUpload("detail");

			if (result) {
				setPreviews((prev) => ({
					...prev,
					[result.item.storageKey]: result.previewUri,
				}));
				onChange({ cover, detail: [...detail, result.item] });
			}
		} catch {
			Alert.alert("이미지 업로드에 실패했어요", "잠시 후 다시 시도해 주세요.");
		} finally {
			setIsBusy(false);
		}
	};

	const previewFor = (item: JobMediaUploadItem): string =>
		previews[item.storageKey] ?? "";

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-foreground text-sm" selectable>
					공고 이미지 (선택)
				</Text>
				<Text className="text-muted text-xs" selectable>
					대표 이미지 1장과 상세 이미지 최대 5장을 등록할 수 있어요.
					JPG·PNG·WebP, 한 장당 10MB 이하.
				</Text>
			</View>

			<View className="gap-2">
				<Text className="text-muted text-xs">대표 이미지</Text>
				{cover ? (
					<View className="gap-2">
						{previewFor(cover) ? (
							<Image
								accessibilityLabel="대표 이미지 미리보기"
								className="h-40 w-full rounded-lg"
								source={{ uri: previewFor(cover) }}
							/>
						) : (
							<Text className="text-muted text-xs" selectable>
								{`등록된 대표 이미지 (${cover.fileName})`}
							</Text>
						)}
						<Pressable
							className="self-start rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() => onChange({ cover: null, detail })}
						>
							<Text className="text-danger-soft-foreground text-sm dark:text-danger">
								대표 이미지 제거
							</Text>
						</Pressable>
					</View>
				) : (
					<Button
						isDisabled={isBusy}
						onPress={handleCoverPick}
						variant="secondary"
					>
						<Button.Label>
							{isBusy ? "처리 중" : "대표 이미지 선택"}
						</Button.Label>
					</Button>
				)}
			</View>

			<View className="gap-2">
				<Text className="text-muted text-xs">{`상세 이미지 (${detail.length}/${JOB_DETAIL_LIMIT})`}</Text>
				{detail.map((item, index) => (
					<View className="gap-2" key={item.storageKey}>
						{previewFor(item) ? (
							<Image
								accessibilityLabel={`상세 이미지 ${index + 1} 미리보기`}
								className="h-40 w-full rounded-lg"
								source={{ uri: previewFor(item) }}
							/>
						) : (
							<Text className="text-muted text-xs" selectable>
								{`등록된 상세 이미지 ${index + 1} (${item.fileName})`}
							</Text>
						)}
						<Pressable
							className="self-start rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() =>
								onChange({
									cover,
									detail: detail.filter(
										(x) => x.storageKey !== item.storageKey
									),
								})
							}
						>
							<Text className="text-danger-soft-foreground text-sm dark:text-danger">
								{`상세 이미지 ${index + 1} 제거`}
							</Text>
						</Pressable>
					</View>
				))}
				{detail.length < JOB_DETAIL_LIMIT ? (
					<Button
						isDisabled={isBusy}
						onPress={handleDetailPick}
						variant="secondary"
					>
						<Button.Label>
							{isBusy ? "처리 중" : "상세 이미지 추가"}
						</Button.Label>
					</Button>
				) : null}
			</View>
		</View>
	);
}

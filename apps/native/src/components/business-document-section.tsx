import { useMutation } from "@tanstack/react-query";
import { getDocumentAsync } from "expo-document-picker";
import { openBrowserAsync } from "expo-web-browser";
import { Button } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { businessErrorMessage } from "@/src/lib/employer/business";
import { orpc } from "@/src/lib/orpc";

export interface BusinessDocumentItem {
	byteSize: number;
	category: "image" | "pdf";
	fileName: string;
	id: string;
	mimeType: string;
}

const MAX_BUSINESS_DOCUMENTS = 5;
const BUSINESS_DOC_MAX_BYTES = 10_485_760; // 10MB, 서버 CHAT_MEDIA_MAX_BYTES
const BUSINESS_DOC_MIME_TYPES = new Set([
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
]);

interface Props {
	canDelete: boolean;
	documents: BusinessDocumentItem[];
	onChanged: () => Promise<void>;
	// 조직이 아직 없으면(none 상태) 부모가 prepareEmployerBusinessDocuments로 만든 뒤 id를 준다.
	onEnsureOrganizationId: () => Promise<string>;
}

export function BusinessDocumentSection({
	canDelete,
	documents,
	onChanged,
	onEnsureOrganizationId,
}: Props) {
	const [isBusy, setIsBusy] = useState(false);
	const uploadMutation = useMutation(
		orpc.bambi.onboarding.createBusinessDocumentUpload.mutationOptions()
	);
	const addMutation = useMutation(
		orpc.bambi.onboarding.addBusinessDocument.mutationOptions()
	);
	const deleteMutation = useMutation(
		orpc.bambi.onboarding.deleteBusinessDocument.mutationOptions()
	);
	const viewMutation = useMutation(
		orpc.bambi.onboarding.createBusinessDocumentViewUrl.mutationOptions()
	);

	const handleAdd = async () => {
		if (documents.length >= MAX_BUSINESS_DOCUMENTS) {
			Alert.alert(
				"서류는 최대 5개",
				`서류는 최대 ${MAX_BUSINESS_DOCUMENTS}개까지 올릴 수 있어요.`
			);
			return;
		}

		const picked = await getDocumentAsync({
			copyToCacheDirectory: true,
			multiple: false,
			type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
		});

		const asset = picked.canceled ? null : picked.assets[0];

		if (!asset) {
			return;
		}

		setIsBusy(true);

		try {
			const blob = await (await fetch(asset.uri)).blob();
			const mimeType = asset.mimeType ?? blob.type;

			if (!BUSINESS_DOC_MIME_TYPES.has(mimeType)) {
				Alert.alert(
					"등록할 수 없는 파일",
					"JPG, PNG, WebP, PDF 파일만 올릴 수 있어요."
				);
				return;
			}

			if (blob.size < 1 || blob.size > BUSINESS_DOC_MAX_BYTES) {
				Alert.alert("등록할 수 없는 파일", "파일 크기는 10MB 이하여야 해요.");
				return;
			}

			const organizationId = await onEnsureOrganizationId();
			const intent = await uploadMutation.mutateAsync({
				byteSize: blob.size,
				fileName: asset.name,
				mimeType,
				organizationId,
			});

			if (!intent.uploadUrl.startsWith("https://")) {
				Alert.alert(
					"지금은 서류를 올릴 수 없어요",
					"잠시 후 다시 시도해 주세요."
				);
				return;
			}

			const response = await fetch(intent.uploadUrl, {
				body: blob,
				headers: { "Content-Type": intent.mimeType },
				method: "PUT",
			});

			if (!response.ok) {
				throw new Error("upload failed");
			}

			await addMutation.mutateAsync({
				byteSize: blob.size,
				fileName: asset.name,
				mimeType,
				organizationId,
				storageKey: intent.storageKey,
			});
			await onChanged();
			Alert.alert("올렸어요", "사업자 인증 서류를 올렸어요.");
		} catch (error) {
			Alert.alert("올리지 못했어요", businessErrorMessage(error));
		} finally {
			setIsBusy(false);
		}
	};

	const handleView = async (documentId: string) => {
		try {
			const { url } = await viewMutation.mutateAsync({
				documentId,
				download: false,
			});
			await openBrowserAsync(url);
		} catch (error) {
			Alert.alert("열지 못했어요", businessErrorMessage(error));
		}
	};

	const handleDelete = (documentId: string) => {
		Alert.alert("서류를 삭제할까요?", "삭제한 서류는 되돌릴 수 없어요.", [
			{ style: "cancel", text: "취소" },
			{
				onPress: async () => {
					try {
						await deleteMutation.mutateAsync({ documentId });
						await onChanged();
					} catch (error) {
						Alert.alert("삭제하지 못했어요", businessErrorMessage(error));
					}
				},
				style: "destructive",
				text: "삭제",
			},
		]);
	};

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-base text-foreground">
					사업자 인증 서류
				</Text>
				<Text className="text-muted text-xs">
					{`JPG, PNG, WebP, PDF · 파일당 10MB · 최대 ${MAX_BUSINESS_DOCUMENTS}개`}
				</Text>
			</View>

			{documents.length === 0 ? (
				<Text className="text-muted text-sm">
					등록된 사업자 인증 서류가 없어요.
				</Text>
			) : (
				documents.map((document) => (
					<View
						className="flex-row items-center gap-3 rounded-lg border border-border p-3"
						key={document.id}
					>
						<Text className="flex-1 text-foreground text-sm" numberOfLines={1}>
							{document.fileName}
						</Text>
						<Pressable
							className="rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() => handleView(document.id)}
						>
							<Text className="text-foreground text-sm">보기</Text>
						</Pressable>
						{canDelete ? (
							<Pressable
								className="rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
								onPress={() => handleDelete(document.id)}
							>
								<Text className="text-danger-soft-foreground text-sm dark:text-danger">
									삭제
								</Text>
							</Pressable>
						) : null}
					</View>
				))
			)}

			{canDelete ? null : (
				<Text className="text-muted text-xs">
					심사 중에도 서류를 추가할 수 있지만, 기존 서류는 삭제할 수 없어요.
				</Text>
			)}

			<Button
				isDisabled={isBusy || documents.length >= MAX_BUSINESS_DOCUMENTS}
				onPress={handleAdd}
				variant="secondary"
			>
				<Button.Label>
					{isBusy ? "업로드 중" : "이미지 또는 PDF 추가"}
				</Button.Label>
			</Button>
		</View>
	);
}

import { useMutation } from "@tanstack/react-query";
import { getDocumentAsync } from "expo-document-picker";
import { openBrowserAsync } from "expo-web-browser";
import { Button } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { businessErrorMessage } from "@/src/lib/employer/business";
import { readLocalFileBytes } from "@/src/lib/local-file-bytes";
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
	organizationId: null | string;
	// verified·changes_unsubmitted면 서류 추가·삭제가 서버에서 인증 상태를 강등하므로 먼저 확인받는다.
	requiresConfirmation: boolean;
}

// Alert.alert(콜백형)을 await 가능한 확인 다이얼로그로 감싼다.
const confirmAsync = (title: string, message: string): Promise<boolean> =>
	new Promise((resolve) => {
		Alert.alert(title, message, [
			{ onPress: () => resolve(false), style: "cancel", text: "취소" },
			{ onPress: () => resolve(true), text: "계속" },
		]);
	});

export function BusinessDocumentSection({
	canDelete,
	documents,
	onChanged,
	onEnsureOrganizationId,
	organizationId,
	requiresConfirmation,
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

	// 파일 선택 → 바이트 실측 → MIME·크기 검증 → (강등 상태면) 확인. 통과하면 업로드에 필요한
	// 값을 돌려주고, 취소·검증 실패·거절이면 null. setIsBusy(true)는 파일이 실제로 잡힌 뒤에만
	// 켜고, 끄는 것은 호출부 handleAdd의 finally가 맡는다.
	const pickDocument = async (): Promise<null | {
		bytes: Uint8Array<ArrayBuffer>;
		mimeType: string;
		name: string;
	}> => {
		const picked = await getDocumentAsync({
			copyToCacheDirectory: true,
			multiple: false,
			type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
		});

		const asset = picked.canceled ? null : picked.assets[0];

		if (!asset) {
			return null;
		}

		setIsBusy(true);

		const { bytes, mimeType: detectedMimeType } = await readLocalFileBytes(
			asset.uri
		);
		// 피커 MIME가 정본이고, 없으면 파일 읽기가 추정한 MIME → 그래도 없으면 ""로 둬 아래 검증이 거른다.
		const mimeType = asset.mimeType ?? detectedMimeType ?? "";

		if (!BUSINESS_DOC_MIME_TYPES.has(mimeType)) {
			Alert.alert(
				"등록할 수 없는 파일",
				"JPG, PNG, WebP, PDF 파일만 올릴 수 있어요."
			);
			return null;
		}

		if (bytes.byteLength < 1 || bytes.byteLength > BUSINESS_DOC_MAX_BYTES) {
			Alert.alert("등록할 수 없는 파일", "파일 크기는 10MB 이하여야 해요.");
			return null;
		}

		if (
			requiresConfirmation &&
			!(await confirmAsync(
				"서류를 추가하시겠습니까?",
				"인증 서류를 추가하면 인증 대기 상태로 전환되며, 운영자 승인 전까지 기존 공고와 광고가 비공개 처리되고 채팅 송수신이 제한됩니다."
			))
		) {
			return null;
		}

		return { bytes, mimeType, name: asset.name };
	};

	const handleAdd = async () => {
		if (documents.length >= MAX_BUSINESS_DOCUMENTS) {
			Alert.alert(
				"서류는 최대 5개",
				`서류는 최대 ${MAX_BUSINESS_DOCUMENTS}개까지 올릴 수 있어요.`
			);
			return;
		}

		try {
			const doc = await pickDocument();

			if (!doc) {
				return;
			}

			const orgId = organizationId ?? (await onEnsureOrganizationId());
			const intent = await uploadMutation.mutateAsync({
				byteSize: doc.bytes.byteLength,
				fileName: doc.name,
				mimeType: doc.mimeType,
				organizationId: orgId,
			});

			if (!intent.uploadUrl.startsWith("https://")) {
				Alert.alert(
					"지금은 서류를 올릴 수 없어요",
					"잠시 후 다시 시도해 주세요."
				);
				return;
			}

			const response = await fetch(intent.uploadUrl, {
				body: doc.bytes,
				headers: { "Content-Type": intent.mimeType },
				method: "PUT",
			});

			if (!response.ok) {
				throw new Error("upload failed");
			}

			await addMutation.mutateAsync({
				byteSize: doc.bytes.byteLength,
				fileName: doc.name,
				mimeType: doc.mimeType,
				organizationId: orgId,
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
		const message = requiresConfirmation
			? "삭제한 서류는 되돌릴 수 없어요. 인증 완료된 업체는 서류를 삭제하면 인증 대기 상태로 전환되며, 승인 전까지 공고·광고가 비공개 처리되고 채팅 송수신이 제한됩니다."
			: "삭제한 서류는 되돌릴 수 없어요.";
		Alert.alert("서류를 삭제할까요?", message, [
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

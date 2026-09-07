"use client";

import { MAX_BUSINESS_DOCUMENTS } from "@bambi-app/api/services/bambi-business-document-policy";
import {
	ALLOWED_CHAT_MEDIA_MIME_TYPES,
	CHAT_MEDIA_MAX_BYTES,
} from "@bambi-app/api/services/bambi-media-policy";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
	type Ref,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	type BusinessDocument,
	BusinessDocumentFileRow,
} from "@/components/bambi/business-document-file-row";
import {
	detectImageSignature,
	isPdfSignature,
	isSignatureMismatch,
} from "@/lib/bambi/image-signature";
import { uploadFileToSignedUrl } from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

const ACCEPTED_MIME_TYPES = new Set(ALLOWED_CHAT_MEDIA_MIME_TYPES);
const MAX_FILE_BYTES = CHAT_MEDIA_MAX_BYTES;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_FILE_MEGABYTES = CHAT_MEDIA_MAX_BYTES / BYTES_PER_MEGABYTE;

interface BusinessDocumentUploaderProps {
	documents: BusinessDocument[];
	onPendingFilesChange?: (hasPendingFiles: boolean) => void;
	organizationId: null | string;
	ref?: Ref<BusinessDocumentUploaderHandle>;
	verificationStatus: string;
}

export interface BusinessDocumentUploaderHandle {
	hasPendingFiles: () => boolean;
	uploadPendingFiles: (organizationId: string) => Promise<void>;
}

const validateFile = async (file: File): Promise<string | null> => {
	if (!ACCEPTED_MIME_TYPES.has(file.type)) {
		return `${file.name}: JPG, PNG, WEBP, PDF 파일만 올릴 수 있습니다.`;
	}

	if (file.size > MAX_FILE_BYTES) {
		return `${file.name}: 파일 크기는 10MB 이하여야 합니다.`;
	}

	if (file.type === "application/pdf") {
		return (await isPdfSignature(file))
			? null
			: `${file.name}: 실제 PDF 파일인지 확인해 주세요.`;
	}

	const signature = await detectImageSignature(file);
	if (!signature || isSignatureMismatch(file.type, signature)) {
		return `${file.name}: 파일 확장자와 실제 이미지 형식이 일치하지 않습니다.`;
	}

	return null;
};

function StagedBusinessDocumentRow({
	file,
	onRemove,
}: {
	file: File;
	onRemove: () => void;
}) {
	const [objectUrl, setObjectUrl] = useState<string>();

	useEffect(() => {
		const nextObjectUrl = URL.createObjectURL(file);
		setObjectUrl(nextObjectUrl);
		return () => URL.revokeObjectURL(nextObjectUrl);
	}, [file]);

	return (
		<BusinessDocumentFileRow
			actions={
				<Button
					aria-label={`${file.name} 삭제`}
					onClick={onRemove}
					size="icon"
					type="button"
					variant="ghost"
				>
					<Trash2 aria-hidden />
				</Button>
			}
			document={{
				byteSize: file.size,
				category: file.type === "application/pdf" ? "pdf" : "image",
				fileName: file.name,
			}}
			downloadUrl={objectUrl}
			viewUrl={objectUrl}
		/>
	);
}

export function BusinessDocumentUploader({
	documents,
	onPendingFilesChange,
	organizationId,
	ref,
	verificationStatus,
}: BusinessDocumentUploaderProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();
	const [isUploading, setIsUploading] = useState(false);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [stagedFiles, setStagedFiles] = useState<File[]>([]);
	const [pendingDeleteId, setPendingDeleteId] = useState<null | string>(null);
	useEffect(() => {
		onPendingFilesChange?.(stagedFiles.length > 0);
	}, [onPendingFilesChange, stagedFiles.length]);
	const isDeleteLocked = verificationStatus === "pending";
	const requiresConfirmation =
		verificationStatus === "verified" ||
		verificationStatus === "changes_unsubmitted";

	const refreshMine = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.onboarding.getMine.queryKey(),
		});
	};

	const createUploadMutation = useMutation(
		orpc.bambi.onboarding.createBusinessDocumentUpload.mutationOptions()
	);
	const addDocumentMutation = useMutation(
		orpc.bambi.onboarding.addBusinessDocument.mutationOptions()
	);
	const deleteDocumentMutation = useMutation(
		orpc.bambi.onboarding.deleteBusinessDocument.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "서류를 삭제하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("서류를 삭제했습니다.");
				await refreshMine();
			},
		})
	);

	const uploadFiles = async (
		selectedFiles: File[],
		targetOrganizationId: string
	) => {
		const remainingCount = MAX_BUSINESS_DOCUMENTS - documents.length;
		if (selectedFiles.length > remainingCount) {
			toast.error(
				`서류는 최대 ${MAX_BUSINESS_DOCUMENTS}개까지 올릴 수 있습니다.`
			);
			return;
		}

		setIsUploading(true);
		try {
			for (const file of selectedFiles) {
				const validationMessage = await validateFile(file);
				if (validationMessage) {
					throw new Error(validationMessage);
				}

				const uploadIntent = await createUploadMutation.mutateAsync({
					byteSize: file.size,
					fileName: file.name,
					mimeType: file.type,
					organizationId: targetOrganizationId,
				});
				await uploadFileToSignedUrl({ file, uploadIntent });
				await addDocumentMutation.mutateAsync({
					byteSize: file.size,
					fileName: file.name,
					mimeType: file.type,
					organizationId: targetOrganizationId,
					storageKey: uploadIntent.storageKey,
				});
			}

			toast.success("사업자 인증 서류를 올렸습니다.");
			setStagedFiles([]);
			await refreshMine();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "사업자 인증 서류를 올리지 못했습니다."
			);
			throw error;
		} finally {
			setIsUploading(false);
			if (inputRef.current) {
				inputRef.current.value = "";
			}
		}
	};
	useImperativeHandle(ref, () => ({
		hasPendingFiles: () => stagedFiles.length > 0,
		uploadPendingFiles: async (targetOrganizationId) => {
			await uploadFiles(stagedFiles, targetOrganizationId);
		},
	}));
	const stageFiles = (files: File[]) => {
		const remainingCount =
			MAX_BUSINESS_DOCUMENTS - documents.length - stagedFiles.length;
		if (files.length > remainingCount) {
			toast.error(
				`서류는 최대 ${MAX_BUSINESS_DOCUMENTS}개까지 올릴 수 있습니다.`
			);
			return;
		}
		setStagedFiles((current) => [...current, ...files]);
	};
	const handleFileInputChange = async (
		event: React.ChangeEvent<HTMLInputElement>
	) => {
		const files = Array.from(event.target.files ?? []);
		for (const file of files) {
			const validationMessage = await validateFile(file);
			if (validationMessage) {
				toast.error(validationMessage);
				return;
			}
		}
		if (requiresConfirmation && files.length > 0) {
			setPendingFiles(files);
			return;
		}
		stageFiles(files);
	};

	return (
		<>
			<section
				aria-labelledby="business-documents"
				className="flex flex-col gap-3"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<h3 className="font-medium text-sm" id="business-documents">
							사업자 인증 서류
						</h3>
						<p className="mt-1 text-muted-foreground text-xs">
							{`JPG, PNG, WEBP, PDF · 파일당 ${MAX_FILE_MEGABYTES}MB · 최대 ${MAX_BUSINESS_DOCUMENTS}개`}
						</p>
					</div>
					<Badge variant="secondary">
						{documents.length + stagedFiles.length}/{MAX_BUSINESS_DOCUMENTS}
					</Badge>
				</div>

				{documents.length > 0 ? (
					<ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
						{documents.map((document) => (
							<li className="min-w-0" key={document.id}>
								<BusinessDocumentFileRow
									actions={
										<Button
											aria-label={`${document.fileName} 삭제`}
											disabled={
												isDeleteLocked || deleteDocumentMutation.isPending
											}
											onClick={() => {
												if (requiresConfirmation) {
													setPendingDeleteId(document.id);
													return;
												}
												deleteDocumentMutation.mutate({
													documentId: document.id,
												});
											}}
											size="icon"
											type="button"
											variant="ghost"
										>
											<Trash2 aria-hidden />
										</Button>
									}
									document={document}
									downloadUrl={`${document.objectUrl}?download=1`}
									viewUrl={document.objectUrl}
								/>
							</li>
						))}
					</ul>
				) : (
					<p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
						등록된 사업자 인증 서류가 없습니다.
					</p>
				)}
				{stagedFiles.length > 0 ? (
					<ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
						{stagedFiles.map((file) => (
							<li
								className="min-w-0"
								key={`${file.name}-${file.size}-${file.lastModified}`}
							>
								<StagedBusinessDocumentRow
									file={file}
									onRemove={() =>
										setStagedFiles((current) =>
											current.filter((currentFile) => currentFile !== file)
										)
									}
								/>
							</li>
						))}
					</ul>
				) : null}

				<input
					accept={ALLOWED_CHAT_MEDIA_MIME_TYPES.join(",")}
					className="sr-only"
					multiple
					onChange={handleFileInputChange}
					ref={inputRef}
					type="file"
				/>
				<Button
					disabled={
						isUploading ||
						documents.length + stagedFiles.length >= MAX_BUSINESS_DOCUMENTS
					}
					onClick={() => inputRef.current?.click()}
					type="button"
					variant="outline"
				>
					{isUploading ? "업로드 중..." : "이미지 또는 PDF 추가"}
				</Button>
				{organizationId ? null : (
					<p className="text-muted-foreground text-xs">
						선택한 파일은 업체 정보 제출을 누를 때 업로드됩니다.
					</p>
				)}
				{isDeleteLocked ? (
					<p className="text-muted-foreground text-xs">
						심사 중에도 서류를 추가할 수 있지만, 기존 서류는 삭제할 수 없습니다.
					</p>
				) : null}
			</section>
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingFiles([]);
					}
				}}
				open={pendingFiles.length > 0}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							사업자 인증 서류를 추가하시겠습니까?
						</AlertDialogTitle>
						<AlertDialogDescription>
							현재 승인된 파일에 서류를 하나라도 추가하면 변경사항 미제출 상태로
							전환되고, 기존 공고·광고 비공개 및 채팅 송수신 제한이 즉시
							적용됩니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								const files = pendingFiles;
								setPendingFiles([]);
								stageFiles(files);
							}}
						>
							추가
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingDeleteId(null);
					}
				}}
				open={pendingDeleteId !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							사업자 인증 서류를 삭제하시겠습니까?
						</AlertDialogTitle>
						<AlertDialogDescription>
							현재 승인된 파일 중 하나라도 삭제하면 변경사항 미제출 상태로
							전환되고, 기존 공고·광고 비공개 및 채팅 송수신 제한이 즉시
							적용됩니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingDeleteId) {
									deleteDocumentMutation.mutate({
										documentId: pendingDeleteId,
									});
								}
								setPendingDeleteId(null);
							}}
							variant="destructive"
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

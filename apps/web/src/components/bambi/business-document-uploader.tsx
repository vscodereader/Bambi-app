"use client";

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
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Download,
	ExternalLink,
	FileText,
	ImageIcon,
	Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	detectImageSignature,
	isPdfSignature,
	isSignatureMismatch,
} from "@/lib/bambi/image-signature";
import { uploadFileToSignedUrl } from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

const ACCEPTED_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENT_COUNT = 5;

export interface BusinessDocument {
	byteSize: number;
	category: "image" | "pdf";
	fileName: string;
	id: string;
	mimeType: string;
	objectUrl: string;
}

interface BusinessDocumentUploaderProps {
	documents: BusinessDocument[];
	organizationId: null | string;
	verificationStatus: string;
}

const formatBytes = (bytes: number): string => {
	if (bytes < 1024 * 1024) {
		return `${Math.max(1, Math.round(bytes / 1024))}KB`;
	}

	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

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

export function BusinessDocumentUploader({
	documents,
	organizationId,
	verificationStatus,
}: BusinessDocumentUploaderProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();
	const [isUploading, setIsUploading] = useState(false);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [pendingDeleteId, setPendingDeleteId] = useState<null | string>(null);
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

	const uploadFiles = async (selectedFiles: File[]) => {
		if (!organizationId) {
			return;
		}

		const remainingCount = MAX_DOCUMENT_COUNT - documents.length;
		if (selectedFiles.length > remainingCount) {
			toast.error(`서류는 최대 ${MAX_DOCUMENT_COUNT}개까지 올릴 수 있습니다.`);
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
					organizationId,
				});
				await uploadFileToSignedUrl({ file, uploadIntent });
				await addDocumentMutation.mutateAsync({
					byteSize: file.size,
					fileName: file.name,
					mimeType: file.type,
					organizationId,
					storageKey: uploadIntent.storageKey,
				});
			}

			toast.success("사업자 인증 서류를 올렸습니다.");
			await refreshMine();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "사업자 인증 서류를 올리지 못했습니다."
			);
		} finally {
			setIsUploading(false);
			if (inputRef.current) {
				inputRef.current.value = "";
			}
		}
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
		await uploadFiles(files);
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
							JPG, PNG, WEBP, PDF · 파일당 10MB · 최대 5개
						</p>
					</div>
					<Badge variant="secondary">
						{documents.length}/{MAX_DOCUMENT_COUNT}
					</Badge>
				</div>

				{documents.length > 0 ? (
					<ul className="grid gap-2">
						{documents.map((document) => (
							<li
								className="flex min-w-0 items-center justify-between gap-2 rounded-lg border p-3"
								key={document.id}
							>
								<div className="flex min-w-0 items-center gap-2">
									{document.category === "image" ? (
										<ImageIcon aria-hidden className="size-4 shrink-0" />
									) : (
										<FileText aria-hidden className="size-4 shrink-0" />
									)}
									<div className="min-w-0">
										<p className="truncate text-sm">{document.fileName}</p>
										<p className="text-muted-foreground text-xs">
											{formatBytes(document.byteSize)}
										</p>
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<a
										aria-label={`${document.fileName} 새 창에서 열기`}
										className={buttonVariants({
											size: "icon",
											variant: "ghost",
										})}
										href={document.objectUrl}
										rel="noreferrer"
										target="_blank"
									>
										<ExternalLink aria-hidden />
									</a>
									<a
										aria-label={`${document.fileName} 다운로드`}
										className={buttonVariants({
											size: "icon",
											variant: "ghost",
										})}
										download={document.fileName}
										href={`${document.objectUrl}?download=1`}
									>
										<Download aria-hidden />
									</a>
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
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
						등록된 사업자 인증 서류가 없습니다.
					</p>
				)}

				<input
					accept="image/jpeg,image/png,image/webp,application/pdf"
					className="sr-only"
					disabled={!organizationId}
					multiple
					onChange={handleFileInputChange}
					ref={inputRef}
					type="file"
				/>
				<Button
					disabled={
						!organizationId ||
						isUploading ||
						documents.length >= MAX_DOCUMENT_COUNT
					}
					onClick={() => inputRef.current?.click()}
					type="button"
					variant="outline"
				>
					{isUploading ? "업로드 중..." : "이미지 또는 PDF 추가"}
				</Button>
				{organizationId ? null : (
					<p className="text-muted-foreground text-xs">
						업체 정보를 먼저 제출한 뒤 인증 서류를 추가할 수 있습니다.
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
							onClick={async () => {
								const files = pendingFiles;
								setPendingFiles([]);
								await uploadFiles(files);
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

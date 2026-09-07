"use client";

import { buttonVariants } from "@bambi-app/ui/components/button";
import { Download, FileText, ImageIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface BusinessDocumentFile {
	byteSize: number;
	category: "image" | "pdf";
	fileName: string;
}

export interface BusinessDocument extends BusinessDocumentFile {
	id: string;
	mimeType: string;
	objectUrl: string;
}

interface BusinessDocumentFileRowProps {
	actions: ReactNode;
	document: BusinessDocumentFile;
	downloadUrl?: string;
	viewUrl?: string;
}

export const formatBusinessDocumentBytes = (bytes: number): string => {
	if (bytes < 1024 * 1024) {
		return `${Math.max(1, Math.round(bytes / 1024))}KB`;
	}

	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

export function BusinessDocumentFileRow({
	actions,
	document,
	downloadUrl,
	viewUrl,
}: BusinessDocumentFileRowProps) {
	const categoryLabel = document.category === "image" ? "이미지" : "PDF";
	const fileInformation = (
		<>
			<span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-700">
				{document.category === "image" ? (
					<ImageIcon aria-hidden />
				) : (
					<FileText aria-hidden />
				)}
			</span>
			<span className="min-w-0 flex-1">
				<span
					className="block truncate font-semibold text-sm"
					title={document.fileName}
				>
					{document.fileName}
				</span>
				<span className="block text-muted-foreground text-xs">
					{categoryLabel} · {formatBusinessDocumentBytes(document.byteSize)}
				</span>
			</span>
		</>
	);

	return (
		<div className="flex min-w-0 items-center gap-2 rounded-lg border p-3">
			{viewUrl ? (
				<a
					aria-label={`${document.fileName} 원본 열기`}
					className="flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					href={viewUrl}
					rel="noopener"
					target="_blank"
				>
					{fileInformation}
				</a>
			) : (
				<span className="flex min-w-0 flex-1 items-center gap-2">
					{fileInformation}
				</span>
			)}
			<div className="flex shrink-0 items-center gap-1">
				{downloadUrl ? (
					<a
						aria-label={`${document.fileName} 다운로드`}
						className={buttonVariants({ size: "icon", variant: "ghost" })}
						download={document.fileName}
						href={downloadUrl}
					>
						<Download aria-hidden />
					</a>
				) : null}
				{actions}
			</div>
		</div>
	);
}

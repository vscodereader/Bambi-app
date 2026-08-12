"use client";

import { DownloadIcon, FileTextIcon } from "lucide-react";

export interface ChatAttachmentPreviewItem {
	byteSize: number;
	category: "image" | "pdf";
	fileName: string;
	id: string;
	mimeType: string;
	objectUrl: string;
}

interface ChatAttachmentPreviewProps {
	attachment: ChatAttachmentPreviewItem;
	mine?: boolean;
}

const formatAttachmentSize = (byteSize: number): string => {
	if (byteSize >= 1024 * 1024) {
		return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
	}

	return `${Math.max(1, Math.round(byteSize / 1024)).toLocaleString("ko-KR")} KB`;
};

export function ChatAttachmentPreview({
	attachment,
}: ChatAttachmentPreviewProps) {
	if (attachment.category === "image") {
		return (
			<a
				className="block w-fit max-w-[320px] overflow-hidden rounded-xl max-md:max-w-[min(60vw,240px)]"
				href={attachment.objectUrl}
				rel="noopener"
				target="_blank"
			>
				{/* biome-ignore lint/performance/noImgElement: signed chat images need their intrinsic ratio. */}
				{/* biome-ignore lint/correctness/useImageSize: dimensions are unknown until the signed image loads. */}
				<img
					alt={attachment.fileName}
					className="block h-auto max-h-[70vh] w-auto max-w-full object-contain max-md:max-h-[50vh]"
					src={attachment.objectUrl}
				/>
			</a>
		);
	}

	return (
		<div className="group relative flex w-[320px] max-w-[min(60vw,240px)] items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-foreground transition-colors hover:bg-secondary/60 md:max-w-[320px]">
			<a
				aria-label={`${attachment.fileName} 열기`}
				className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				href={attachment.objectUrl}
				rel="noopener"
				target="_blank"
			>
				<span className="sr-only">{attachment.fileName} 열기</span>
			</a>
			<span className="inline-flex size-9 flex-none items-center justify-center rounded-lg bg-coral-50 text-coral-700">
				<FileTextIcon aria-hidden="true" className="size-5" />
			</span>
			<span className="min-w-0 flex-1 overflow-hidden">
				<span
					className="block truncate font-semibold text-sm"
					title={attachment.fileName}
				>
					{attachment.fileName}
				</span>
				<span className="block truncate text-muted-foreground text-xs">
					PDF · {formatAttachmentSize(attachment.byteSize)}
				</span>
			</span>
			<a
				aria-label={`${attachment.fileName} 다운로드`}
				className="relative z-10 inline-flex size-8 flex-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
				download={attachment.fileName}
				href={attachment.objectUrl}
			>
				<DownloadIcon aria-hidden="true" className="size-4" />
			</a>
		</div>
	);
}

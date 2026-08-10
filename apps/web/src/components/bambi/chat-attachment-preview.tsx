"use client";

import Image from "next/image";
import { FileTextIcon, ImageIcon } from "./icons";

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
	mine: boolean;
}

const formatAttachmentSize = (byteSize: number): string => {
	if (byteSize >= 1024 * 1024) {
		return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
	}

	return `${Math.max(1, Math.round(byteSize / 1024)).toLocaleString("ko-KR")} KB`;
};

export function ChatAttachmentPreview({
	attachment,
	mine,
}: ChatAttachmentPreviewProps) {
	const meta = `${attachment.mimeType} · ${formatAttachmentSize(attachment.byteSize)}`;

	if (attachment.category === "image") {
		return (
			<a
				className="group mt-2 block overflow-hidden rounded-lg border border-black/10 bg-white text-foreground shadow-sm max-md:w-full max-md:min-w-0 max-md:max-w-full"
				href={attachment.objectUrl}
				rel="noopener"
				target="_blank"
			>
				<div className="relative aspect-[16/9] w-full min-w-52 bg-secondary max-md:min-w-0">
					<Image
						alt={attachment.fileName}
						className="object-cover"
						fill
						loading="eager"
						sizes="(max-width: 768px) 70vw, 280px"
						src={attachment.objectUrl}
						unoptimized
					/>
				</div>
				<div className="flex min-w-0 items-center gap-2 px-3 py-2">
					<span className="inline-flex size-4 flex-none text-coral-600">
						<ImageIcon />
					</span>
					<div className="min-w-0 flex-1 overflow-hidden">
						<p className="m-0 truncate font-bold text-xs">
							{attachment.fileName}
						</p>
						<p className="m-0 truncate text-[11px] text-muted-foreground">
							{meta}
						</p>
					</div>
				</div>
			</a>
		);
	}

	return (
		<a
			className={
				mine
					? "mt-2 flex items-center gap-3 rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-white max-md:w-full max-md:min-w-0 max-md:max-w-full max-md:gap-2 max-md:overflow-hidden max-md:px-2"
					: "mt-2 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-foreground max-md:w-full max-md:min-w-0 max-md:max-w-full max-md:gap-2 max-md:overflow-hidden max-md:px-2"
			}
			href={attachment.objectUrl}
			rel="noopener"
			target="_blank"
		>
			<span className="inline-flex size-8 flex-none items-center justify-center rounded-md bg-coral-50 text-coral-700 max-md:size-7 max-md:rounded-full">
				<FileTextIcon className="size-full max-md:size-4" />
			</span>
			<span className="min-w-0 flex-1 overflow-hidden">
				<span className="block truncate font-bold text-xs">
					{attachment.fileName}
				</span>
				<span className="block truncate text-[11px] opacity-75">{meta}</span>
			</span>
		</a>
	);
}

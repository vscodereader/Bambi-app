"use client";

import { DownloadIcon, FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface ChatAttachmentPreviewItem {
	byteSize: number;
	category: "image" | "pdf";
	fileName: string;
	id: string;
	mimeType: string;
	objectUrl: string;
}

interface ChatAttachmentPreviewProps {
	// 호출 화면 전용 추가 액션(운영자 심사 화면의 삭제 버튼 등). PDF 카드는 다운로드
	// 아이콘 오른쪽에, 이미지에는 우상단 오버레이로 붙는다. 채팅은 넘기지 않아 무변화.
	actions?: ReactNode;
	attachment: ChatAttachmentPreviewItem;
	// 다운로드 아이콘이 가리킬 URL 오버라이드. 사업자 문서처럼 열람 URL(objectUrl)과
	// 강제 다운로드 URL(?download=1)이 다른 화면에서 쓴다.
	downloadUrl?: string;
	mine?: boolean;
}

const formatAttachmentSize = (byteSize: number): string => {
	if (byteSize >= 1024 * 1024) {
		return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
	}

	return `${Math.max(1, Math.round(byteSize / 1024)).toLocaleString("ko-KR")} KB`;
};

export function ChatAttachmentPreview({
	actions,
	attachment,
	downloadUrl,
}: ChatAttachmentPreviewProps) {
	if (attachment.category === "image") {
		const image = (
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

		if (!actions) {
			return image;
		}

		return (
			<div className="relative w-fit">
				{image}
				<div className="absolute top-2 right-2 flex items-center gap-1">
					{actions}
				</div>
			</div>
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
				href={downloadUrl ?? attachment.objectUrl}
			>
				<DownloadIcon aria-hidden="true" className="size-4" />
			</a>
			{actions ? (
				// 카드 전체를 덮는 열기 링크(absolute inset-0) 위로 올려 클릭이 액션에 닿게 한다.
				<span className="relative z-10 flex flex-none items-center gap-1">
					{actions}
				</span>
			) : null}
		</div>
	);
}

"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { ImageIcon, Trash2 } from "lucide-react";
import Image from "next/image";

import type { JobFormMedia, JobFormMediaItem } from "@/lib/bambi-job-form";

interface JobPostMediaUploaderProps {
	error?: string;
	media: JobFormMedia;
	onChange: (media: JobFormMedia) => void;
}

const acceptImageTypes = "image/jpeg,image/png,image/webp";
const detailSlots = [
	{ index: 0, key: "detail-image-slot-1" },
	{ index: 1, key: "detail-image-slot-2" },
	{ index: 2, key: "detail-image-slot-3" },
	{ index: 3, key: "detail-image-slot-4" },
	{ index: 4, key: "detail-image-slot-5" },
] as const;

const createMediaItemFromFile = (
	file: File,
	altText = ""
): JobFormMediaItem => ({
	altText,
	byteSize: file.size,
	file,
	fileName: file.name,
	mimeType: file.type,
	previewUrl: URL.createObjectURL(file),
});

const updateDetailAt = (
	media: JobFormMedia,
	index: number,
	item: JobFormMediaItem | null
): JobFormMedia => {
	const detail = [...media.detail];

	if (item) {
		detail[index] = item;
	} else {
		detail.splice(index, 1);
	}

	return {
		...media,
		detail: detail.filter(Boolean),
	};
};

interface MediaSlotProps {
	id: string;
	item: JobFormMediaItem | null;
	label: string;
	onAltTextChange: (altText: string) => void;
	onFileChange: (file: File) => void;
	onRemove: () => void;
}

function MediaSlot({
	id,
	item,
	label,
	onAltTextChange,
	onFileChange,
	onRemove,
}: MediaSlotProps) {
	return (
		<div className="space-y-3 border p-3">
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor={id}>{label}</Label>
				{item ? (
					<Button
						aria-label={`${label} 삭제`}
						onClick={onRemove}
						size="icon-xs"
						title={`${label} 삭제`}
						type="button"
						variant="destructive"
					>
						<Trash2 />
					</Button>
				) : null}
			</div>
			<div className="grid gap-3 sm:grid-cols-[112px_1fr]">
				<div className="flex aspect-square items-center justify-center overflow-hidden border bg-muted/30">
					{item?.previewUrl ? (
						<Image
							alt={item.altText || item.fileName}
							className="h-full w-full object-cover"
							height={112}
							src={item.previewUrl}
							unoptimized
							width={112}
						/>
					) : (
						<div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
							<ImageIcon className="size-4" />
							<span>{item?.fileName ?? "이미지 없음"}</span>
						</div>
					)}
				</div>
				<div className="space-y-2">
					<Input
						accept={acceptImageTypes}
						id={id}
						onChange={(event) => {
							const file = event.target.files?.[0];

							if (file) {
								onFileChange(file);
							}
						}}
						type="file"
					/>
					<Input
						aria-label={`${label} 설명`}
						maxLength={120}
						onChange={(event) => onAltTextChange(event.target.value)}
						placeholder="이미지 설명"
						value={item?.altText ?? ""}
					/>
				</div>
			</div>
		</div>
	);
}

export function JobPostMediaUploader({
	error,
	media,
	onChange,
}: JobPostMediaUploaderProps) {
	return (
		<section aria-label="공고 이미지" className="space-y-3">
			<div className="space-y-1">
				<h2 className="font-medium text-sm">공고 이미지</h2>
				<p className="text-muted-foreground text-xs">
					대표 이미지 1장과 상세 이미지 최대 5장을 등록할 수 있습니다.
				</p>
			</div>
			<MediaSlot
				id="job-cover-image"
				item={media.cover}
				label="대표 이미지"
				onAltTextChange={(altText) =>
					onChange({
						...media,
						cover: media.cover ? { ...media.cover, altText } : null,
					})
				}
				onFileChange={(file) =>
					onChange({
						...media,
						cover: createMediaItemFromFile(file, media.cover?.altText),
					})
				}
				onRemove={() => onChange({ ...media, cover: null })}
			/>
			<div className="grid gap-3 lg:grid-cols-2">
				{detailSlots.map(({ index, key }) => {
					const item = media.detail[index] ?? null;

					return (
						<MediaSlot
							id={`job-detail-image-${index}`}
							item={item}
							key={key}
							label={`상세 이미지 ${index + 1}`}
							onAltTextChange={(altText) =>
								onChange(
									updateDetailAt(
										media,
										index,
										item ? { ...item, altText } : null
									)
								)
							}
							onFileChange={(file) =>
								onChange(
									updateDetailAt(
										media,
										index,
										createMediaItemFromFile(file, item?.altText)
									)
								)
							}
							onRemove={() => onChange(updateDetailAt(media, index, null))}
						/>
					);
				})}
			</div>
			{error ? <p className="text-destructive text-xs">{error}</p> : null}
		</section>
	);
}

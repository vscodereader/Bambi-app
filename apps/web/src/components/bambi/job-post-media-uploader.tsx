"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { cn } from "@bambi-app/ui/lib/utils";
import { ImageIcon, Trash2 } from "lucide-react";
import Image from "next/image";
import {
	formatJobAdBannerSpec,
	JOB_AD_BANNER_SPECS,
	type JobAdBannerUsage,
	readImageDimensions,
} from "@/lib/bambi/job-ad-banner-spec";
import {
	getFileAcceptForUsage,
	type JobFormMedia,
	type JobFormMediaItem,
} from "@/lib/bambi-job-form";

interface JobPostMediaUploaderProps {
	error?: string;
	media: JobFormMedia;
	onChange: (media: JobFormMedia) => void;
}

// 썸네일·상세는 정적 이미지만, 광고 배너는 GIF까지 받는다.
const staticImageAccept = getFileAcceptForUsage("cover");
const detailSlots = [
	{ index: 0, key: "detail-image-slot-1" },
	{ index: 1, key: "detail-image-slot-2" },
	{ index: 2, key: "detail-image-slot-3" },
	{ index: 3, key: "detail-image-slot-4" },
	{ index: 4, key: "detail-image-slot-5" },
] as const;

// 배너는 비율 검증이 필요하므로 원본 치수를 함께 읽는다. 치수를 못 읽어도(손상된 파일 등)
// 업로드 자체는 막지 않고, 폼 검증이 "크기를 확인하지 못했습니다"로 잡아준다.
const createMediaItemFromFile = async (
	file: File,
	altText = ""
): Promise<JobFormMediaItem> => {
	const base: JobFormMediaItem = {
		altText,
		byteSize: file.size,
		file,
		fileName: file.name,
		mimeType: file.type,
		previewUrl: URL.createObjectURL(file),
	};

	try {
		const { height, width } = await readImageDimensions(file);

		return { ...base, height, width };
	} catch {
		return base;
	}
};

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
	accept: string;
	hint?: string;
	id: string;
	item: JobFormMediaItem | null;
	label: string;
	onAltTextChange: (altText: string) => void;
	onFileChange: (file: File) => void;
	onRemove: () => void;
	previewClassName?: string;
}

function MediaSlot({
	accept,
	hint,
	id,
	item,
	label,
	onAltTextChange,
	onFileChange,
	onRemove,
	previewClassName,
}: MediaSlotProps) {
	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="flex flex-col gap-1">
					<Label htmlFor={id}>{label}</Label>
					{hint ? (
						<span className="text-muted-foreground text-xs">{hint}</span>
					) : null}
				</div>
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
			<div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
				<div
					className={cn(
						"flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30",
						previewClassName
					)}
				>
					{item?.previewUrl ? (
						<Image
							alt={item.altText || item.fileName}
							className="size-full object-cover"
							height={112}
							src={item.previewUrl}
							unoptimized
							width={112}
						/>
					) : (
						<div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
							<ImageIcon className="size-4" />
							<span>이미지 없음</span>
						</div>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<Input
						accept={accept}
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

interface AdBannerSlotProps {
	item: JobFormMediaItem | null;
	onChange: (item: JobFormMediaItem | null) => void;
	usage: JobAdBannerUsage;
}

// 미리보기 박스를 실제 노출 슬롯과 같은 비율로 보여준다. 여기서 이상해 보이면 실제 광고도
// 이상하게 나간다.
function AdBannerSlot({ item, onChange, usage }: AdBannerSlotProps) {
	const { aspectClassName, description, label } = JOB_AD_BANNER_SPECS[usage];

	return (
		<MediaSlot
			accept={getFileAcceptForUsage(usage)}
			hint={`${description} ${formatJobAdBannerSpec(usage)}`}
			id={`job-${usage.replace("_", "-")}-image`}
			item={item}
			label={label}
			onAltTextChange={(altText) =>
				onChange(item ? { ...item, altText } : null)
			}
			onFileChange={async (file) => {
				onChange(await createMediaItemFromFile(file, item?.altText));
			}}
			onRemove={() => onChange(null)}
			previewClassName={cn("aspect-auto w-full", aspectClassName)}
		/>
	);
}

export function JobPostMediaUploader({
	error,
	media,
	onChange,
}: JobPostMediaUploaderProps) {
	return (
		<section aria-label="공고 이미지" className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm">공고 이미지</h2>
				<p className="text-muted-foreground text-xs">
					공고 썸네일 1장과 상세 이미지 최대 5장을 등록할 수 있습니다.
				</p>
			</div>
			<MediaSlot
				accept={staticImageAccept}
				hint="목록 카드에 노출되는 이미지입니다."
				id="job-cover-image"
				item={media.cover}
				label="공고 썸네일 이미지"
				onAltTextChange={(altText) =>
					onChange({
						...media,
						cover: media.cover ? { ...media.cover, altText } : null,
					})
				}
				onFileChange={async (file) => {
					onChange({
						...media,
						cover: await createMediaItemFromFile(file, media.cover?.altText),
					});
				}}
				onRemove={() => onChange({ ...media, cover: null })}
			/>
			<div className="grid gap-3 lg:grid-cols-2">
				{detailSlots.map(({ index, key }) => {
					const item = media.detail[index] ?? null;

					return (
						<MediaSlot
							accept={staticImageAccept}
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
							onFileChange={async (file) => {
								onChange(
									updateDetailAt(
										media,
										index,
										await createMediaItemFromFile(file, item?.altText)
									)
								);
							}}
							onRemove={() => onChange(updateDetailAt(media, index, null))}
						/>
					);
				})}
			</div>
			<div className="flex flex-col gap-1 pt-2">
				<h2 className="font-medium text-sm">광고 배너 이미지</h2>
				<p className="text-muted-foreground text-xs">
					광고 상품을 신청한 공고에만 노출됩니다. 규격 비율과 다르면 등록할 수
					없습니다. 움직이는 GIF도 등록할 수 있습니다.
				</p>
			</div>
			<div className="grid gap-3 lg:grid-cols-2">
				<AdBannerSlot
					item={media.adHorizontal}
					onChange={(item) => onChange({ ...media, adHorizontal: item })}
					usage="ad_horizontal"
				/>
				<AdBannerSlot
					item={media.adVertical}
					onChange={(item) => onChange({ ...media, adVertical: item })}
					usage="ad_vertical"
				/>
			</div>
			{error ? <p className="text-destructive text-xs">{error}</p> : null}
		</section>
	);
}

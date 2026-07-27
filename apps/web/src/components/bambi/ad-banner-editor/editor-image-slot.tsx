"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { cn } from "@bambi-app/ui/lib/utils";
import { ImagePlus, Trash2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import type { RefObject } from "react";
import { toast } from "sonner";
import { FieldHint } from "@/components/bambi/form-message";
import {
	formatJobAdBannerSpec,
	isAllowedJobAdBannerAspect,
	isAllowedJobAdBannerSize,
	JOB_AD_BANNER_SPECS,
	type JobAdBannerUsage,
} from "@/lib/bambi/job-ad-banner-spec";
import {
	createMediaItemFromFile,
	MEDIA_ITEM_FAILURE_MESSAGES,
	revokeMediaItemPreview,
} from "@/lib/bambi/job-media-item";
import {
	getFileAcceptForUsage,
	IMAGE_ALT_TEXT_MAX_LENGTH,
	type JobFormMediaItem,
} from "@/lib/bambi-job-form";

// 세로형은 4:9라 패널 폭을 그대로 주면 미리보기 높이가 화면을 넘어간다. 폭을 묶어 둔다.
const PREVIEW_WIDTH_CLASS_NAMES: Record<JobAdBannerUsage, string> = {
	ad_horizontal: "w-full",
	ad_vertical: "w-32",
};

// 에디터 안에서 배너 이미지를 받는 슬롯. 폼(AdBannerSlot)이 하던 일을 편집 맥락으로 옮긴 것이라
// 검증도 그대로 따라온다 — 비율·최소 크기는 경고가 아니라 실제 반려 사유이므로, 여기서 바로
// 알려 주지 않으면 구인자는 공고를 제출할 때까지 이유를 모른다.
export function EditorImageSlot({
	error,
	inputRef,
	item,
	onChange,
	required,
	usage,
}: {
	error?: null | string;
	inputRef?: RefObject<HTMLInputElement | null>;
	item: JobFormMediaItem | null;
	onChange: (item: JobFormMediaItem | null) => void;
	required: boolean;
	usage: JobAdBannerUsage;
}) {
	const { aspectClassName, aspectLabel, label, minHeight, minWidth } =
		JOB_AD_BANNER_SPECS[usage];
	const inputId = `ad-banner-image-${usage.replace("_", "-")}`;
	const errorId = `${inputId}-error`;
	const measured =
		item?.width && item.height
			? { height: item.height, width: item.width }
			: null;
	const aspectRejected = measured
		? !isAllowedJobAdBannerAspect({ ...measured, usage })
		: false;
	const sizeRejected = measured
		? !isAllowedJobAdBannerSize({ ...measured, usage })
		: false;

	const handleFile = async (file: File) => {
		// altText는 교체해도 이어 간다 — 사진만 바꾸는 경우가 대부분이라 매번 다시 쓰게 하면 는다.
		const created = await createMediaItemFromFile(file, item?.altText);

		if ("reason" in created) {
			toast.error(MEDIA_ITEM_FAILURE_MESSAGES[created.reason]);
			return;
		}

		// 교체가 확정된 뒤에 이전 blob을 놓아준다. 안 놓으면 이미지를 바꿀 때마다 원본 파일이
		// 문서 수명 내내 메모리에 남는다.
		revokeMediaItemPreview(item);
		onChange(created.item);
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex items-center gap-2">
						<Label htmlFor={inputId}>{label}</Label>
						{required ? <Badge variant="secondary">필수</Badge> : null}
					</div>
					<FieldHint>{formatJobAdBannerSpec(usage)}</FieldHint>
				</div>
				{item ? (
					<Button
						aria-label={`${label} 삭제`}
						onClick={() => {
							revokeMediaItemPreview(item);
							onChange(null);
						}}
						size="icon-sm"
						variant="ghost"
					>
						<Trash2 aria-hidden="true" />
					</Button>
				) : null}
			</div>

			{/* 파일 입력은 label이 클릭 영역을 대신한다. 입력 자체는 sr-only라 포커스 링이 보이지
			    않으므로 peer로 라벨에 링을 옮겨 준다(포커스가 안 보이면 키보드로 못 쓴다). */}
			<Input
				accept={getFileAcceptForUsage(usage)}
				aria-describedby={error ? errorId : undefined}
				aria-invalid={error ? true : undefined}
				className="peer sr-only"
				id={inputId}
				onChange={async (event) => {
					const file = event.target.files?.[0];

					if (file) {
						await handleFile(file);
					}
				}}
				ref={inputRef}
				type="file"
			/>
			<Label
				className={cn(
					"relative mx-auto flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border border-dashed bg-muted/40 transition-colors hover:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
					aspectClassName,
					PREVIEW_WIDTH_CLASS_NAMES[usage],
					error && "border-destructive"
				)}
				htmlFor={inputId}
			>
				{item?.previewUrl ? (
					<Image
						alt={item.altText || item.fileName}
						className="object-cover"
						fill
						sizes="(max-width: 1024px) 100vw, 24rem"
						src={item.previewUrl}
						unoptimized
					/>
				) : (
					<span className="flex flex-col items-center gap-1 p-4 text-center text-muted-foreground text-xs">
						<ImagePlus aria-hidden="true" className="size-5" />
						이미지를 선택해 주세요
					</span>
				)}
			</Label>

			<FieldHint>
				{item
					? `${item.fileName}${measured ? ` · ${measured.width}×${measured.height}px` : ""} · 미리보기를 누르면 다른 이미지로 바꿉니다.`
					: "미리보기 영역을 누르면 파일을 고를 수 있습니다. 움직이는 GIF도 됩니다."}
			</FieldHint>

			{/* 배너 이미지가 폼에서 여기로 옮겨오면서 대체 텍스트를 적을 자리가 이 화면밖에 없다.
			    빠뜨리면 화면 낭독기 사용자에게 광고 배너가 파일명으로 읽힌다. */}
			{item ? (
				<div className="flex flex-col gap-1">
					<Label htmlFor={`${inputId}-alt`}>대체 텍스트</Label>
					<Input
						id={`${inputId}-alt`}
						maxLength={IMAGE_ALT_TEXT_MAX_LENGTH}
						onChange={(event) =>
							onChange({ ...item, altText: event.target.value })
						}
						placeholder="배너 내용을 한 줄로 설명해 주세요"
						value={item.altText}
					/>
					<FieldHint>
						이미지를 볼 수 없는 사용자에게 읽어 주는 설명입니다.{" "}
						{IMAGE_ALT_TEXT_MAX_LENGTH}자 이내.
					</FieldHint>
				</div>
			) : null}

			<div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
				{error ? (
					<p className="text-destructive text-xs" id={errorId}>
						{error}
					</p>
				) : null}
				{aspectRejected ? (
					<Alert variant="destructive">
						<TriangleAlert />
						<AlertDescription>
							이 이미지({measured?.width}×{measured?.height})는 요구 비율{" "}
							{aspectLabel}과 크게 달라 등록할 수 없습니다. {aspectLabel} 비율에
							맞춰 다시 골라 주세요.
						</AlertDescription>
					</Alert>
				) : null}
				{sizeRejected ? (
					<Alert variant="destructive">
						<TriangleAlert />
						<AlertDescription>
							이 이미지({measured?.width}×{measured?.height})는 최소 크기{" "}
							{minWidth}×{minHeight}px보다 작아 등록할 수 없습니다. 더 큰
							원본으로 다시 골라 주세요.
						</AlertDescription>
					</Alert>
				) : null}
			</div>
		</div>
	);
}

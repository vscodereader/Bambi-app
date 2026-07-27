"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Trash2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import type { AdBannerLayout } from "@/lib/bambi/ad-banner-layout";
import { getAdBannerUsagesForPreviewTemplate } from "@/lib/bambi/ad-preview-templates";
import {
	detectImageSignature,
	isSignatureMismatch,
} from "@/lib/bambi/image-signature";
import {
	formatJobAdBannerSpec,
	isAllowedJobAdBannerAspect,
	JOB_AD_BANNER_SPECS,
	type JobAdBannerUsage,
	readImageDimensions,
} from "@/lib/bambi/job-ad-banner-spec";
import {
	getFileAcceptForUsage,
	type JobFormMedia,
	type JobFormMediaItem,
} from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";
import { AdBannerEditorLauncher } from "./ad-banner-editor/editor-launcher";

interface JobPostMediaUploaderProps {
	// 배너 에디터가 만든 레이아웃. 필수 prop이라 세 호출부(등록·구인자 수정·운영자 수정)가
	// 모두 값을 잇도록 강제된다 — 잇지 않으면 저장 시 기존 배너가 지워진다.
	adBannerLayout: AdBannerLayout | null;
	// 선택한 노출 상품 id. 상품마다 쓰는 배너 슬롯이 달라서 어떤 업로드 칸을 열지 결정한다.
	adProductId: null | string;
	// false면 새 파일 선택을 숨긴다(운영자 편집: 업로드 인텐트가 조직 멤버십을 요구해 admin은
	// 새 이미지를 못 올린다). 기존 이미지 삭제·설명 수정은 계속 가능.
	allowUpload?: boolean;
	error?: string;
	media: JobFormMedia;
	onAdBannerLayoutChange: (layout: AdBannerLayout) => void;
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

const IMAGE_SIGNATURE_MISMATCH_MESSAGE =
	"이미지 형식이 올바르지 않습니다. PNG·JPG·WebP·GIF만 업로드할 수 있어요.";

// 배너는 크기 검증·잘림 경고에 원본 치수가 필요해서 함께 읽는다. 치수를 못 읽어도
// (손상된 파일 등) 업로드 자체는 막지 않고, 폼 검증이 "크기를 확인하지 못했습니다"로 잡아준다.
// 파일 앞바이트(매직넘버)가 선언 mime과 어긋나면(확장자·File.type 위조) null을 돌려 업로드를
// 차단한다 — 세 슬롯(썸네일·상세·광고 배너)이 모두 이 함수를 거치므로 여기서 한 번만 막는다.
const createMediaItemFromFile = async (
	file: File,
	altText = ""
): Promise<JobFormMediaItem | null> => {
	if (file.type.startsWith("image/")) {
		const detected = await detectImageSignature(file);

		if (isSignatureMismatch(file.type, detected)) {
			toast.error(IMAGE_SIGNATURE_MISMATCH_MESSAGE);

			return null;
		}
	}

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
	allowUpload?: boolean;
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
	allowUpload = true,
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
					{allowUpload ? (
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
					) : null}
					{allowUpload || item ? (
						<Input
							aria-label={`${label} 설명`}
							maxLength={120}
							onChange={(event) => onAltTextChange(event.target.value)}
							placeholder="이미지 설명"
							value={item?.altText ?? ""}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}

interface AdBannerSlotProps {
	allowUpload?: boolean;
	item: JobFormMediaItem | null;
	onChange: (item: JobFormMediaItem | null) => void;
	// 프리미엄 광고처럼 가로·세로 배너를 모두 요구하는 상품이면 라벨에 "(필수)"를 붙인다.
	required?: boolean;
	usage: JobAdBannerUsage;
}

// 미리보기 박스를 실제 노출 슬롯과 같은 비율로 보여준다. 여기서 이상해 보이면 실제 광고도
// 이상하게 나간다.
function AdBannerSlot({
	allowUpload,
	item,
	onChange,
	required,
	usage,
}: AdBannerSlotProps) {
	const {
		aspectClassName,
		aspectLabel,
		description,
		label,
		minHeight,
		minWidth,
	} = JOB_AD_BANNER_SPECS[usage];
	// 비율이 허용 오차를 크게 벗어나면 슬롯에서 로고·문구가 잘려 나가므로 반려한다. 폼
	// 검증(bambi-job-form)이 같은 규칙으로 제출을 막고, 여기선 그 이유를 바로 알려 준다.
	const aspectRejected =
		item?.height && item.width
			? !isAllowedJobAdBannerAspect({
					height: item.height,
					usage,
					width: item.width,
				})
			: false;

	return (
		<div className="flex flex-col gap-2">
			<MediaSlot
				accept={getFileAcceptForUsage(usage)}
				allowUpload={allowUpload}
				hint={`${description} ${formatJobAdBannerSpec(usage)}`}
				id={`job-${usage.replace("_", "-")}-image`}
				item={item}
				label={required ? `${label} (필수)` : label}
				onAltTextChange={(altText) =>
					onChange(item ? { ...item, altText } : null)
				}
				onFileChange={async (file) => {
					const created = await createMediaItemFromFile(file, item?.altText);

					if (created) {
						onChange(created);
					}
				}}
				onRemove={() => onChange(null)}
				previewClassName={cn("aspect-auto w-full", aspectClassName)}
			/>
			{aspectRejected ? (
				<Alert variant="destructive">
					<TriangleAlert />
					<AlertDescription>
						{label} 이미지({item?.width}×{item?.height})는 요구 비율{" "}
						{aspectLabel}과 크게 달라 등록할 수 없습니다. {aspectLabel} 비율에
						맞춰 최소 {minWidth}×{minHeight}px 이상으로 다시 등록해 주세요.
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	);
}

// 배너 문구 편집 진입. 배너 슬롯 업로드와 같은 조건으로만 보여준다 — 운영자 편집
// (allowUpload=false)에서 열면 팝업이 /employer/ad-banner-editor로 가는데, 그 라우트는 운영자를
// 자기 홈으로 되돌려 보내 엉뚱한 새 창만 뜨고 부모는 영영 결과를 기다린다. 운영자는 여기서
// 배너 이미지도 못 올리므로 버튼 자체를 감춘다.
function AdBannerTextEditorCard({
	allowUpload,
	layout,
	media,
	onLayoutChange,
}: {
	allowUpload: boolean;
	layout: AdBannerLayout | null;
	media: JobFormMedia;
	onLayoutChange: (next: AdBannerLayout) => void;
}) {
	if (!allowUpload) {
		return null;
	}

	return (
		<div className="flex flex-col items-start gap-2 rounded-lg border border-border p-3">
			<div className="flex flex-col gap-1">
				<h3 className="font-medium text-sm">배너 문구</h3>
				<p className="text-muted-foreground text-xs">
					업로드한 배너 이미지 위에 문구를 원하는 위치로 배치하고 색·크기·연출을
					고를 수 있습니다. 편집하지 않으면 이미지만 그대로 노출됩니다.
				</p>
			</div>
			{/* 아직 업로드 전인 파일(files)이 이미 올라간 이미지(backgroundUrls)보다
			    우선한다 — 새 이미지를 고른 직후에도 편집 캔버스가 그 이미지를 쓴다. */}
			<AdBannerEditorLauncher
				backgroundUrls={{
					horizontal: media.adHorizontal?.previewUrl,
					vertical: media.adVertical?.previewUrl,
				}}
				files={{
					horizontal: media.adHorizontal?.file,
					vertical: media.adVertical?.file,
				}}
				layout={layout}
				onChange={onLayoutChange}
			/>
		</div>
	);
}

export function JobPostMediaUploader({
	adBannerLayout,
	adProductId,
	allowUpload = true,
	error,
	media,
	onAdBannerLayoutChange,
	onChange,
}: JobPostMediaUploaderProps) {
	// 노출 상품 카탈로그는 JobExposureFields도 같은 키로 조회하므로 react-query가 캐시를
	// 공유한다(추가 요청 없음). 상품의 previewTemplate이 곧 배너 슬롯을 정한다.
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.getCatalog.queryOptions()
	);
	const selectedProduct = (catalogQuery.data ?? [])
		.flatMap((placement) => placement.products)
		.find((product) => product.id === adProductId);
	const allowedUsages = getAdBannerUsagesForPreviewTemplate(
		selectedProduct?.previewTemplate
	);
	// 상품을 골랐는데 카탈로그가 아직 안 왔으면 "이 상품은 배너를 안 쓴다"고 단정할 수 없다.
	// 이때 경고를 띄우면 로딩 동안 잘못된 안내가 번쩍인다.
	const isProductResolved = !adProductId || Boolean(selectedProduct);
	// 선택 상품이 쓰지 않는 슬롯이라도 이미 올린 이미지가 있으면 계속 보여준다. 상품을 바꿨다고
	// 결제한 이미지를 조용히 지우면 되돌릴 수 없고, 폼 상태에만 남겨두면 보이지 않는 고아가 된다.
	// 구인자가 직접 삭제하거나 상품을 되돌릴 수 있게 경고와 함께 노출한다.
	const unusedBannerLabels = [
		media.adHorizontal && !allowedUsages.includes("ad_horizontal")
			? JOB_AD_BANNER_SPECS.ad_horizontal.label
			: null,
		media.adVertical && !allowedUsages.includes("ad_vertical")
			? JOB_AD_BANNER_SPECS.ad_vertical.label
			: null,
	].filter((label): label is string => label !== null);
	const showHorizontalBanner =
		allowedUsages.includes("ad_horizontal") || Boolean(media.adHorizontal);
	const showVerticalBanner =
		allowedUsages.includes("ad_vertical") || Boolean(media.adVertical);
	// 프리미엄 광고는 가로·세로 배너를 모두 요구한다(allowedUsages 2개). 이때 두 슬롯을
	// 필수로 표시한다. 레거시 side 상품도 프리미엄으로 흡수돼 같은 두 usage를 돌려받는다.
	const bothBannersRequired = allowedUsages.length === 2;

	return (
		<section aria-label="공고 이미지" className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm">공고 이미지</h2>
				<p className="text-muted-foreground text-xs">
					공고 썸네일 1장과 상세 이미지 최대 5장을 등록할 수 있습니다.
				</p>
			</div>
			{allowUpload ? null : (
				<Alert>
					<TriangleAlert />
					<AlertDescription>
						운영자 편집에서는 새 이미지를 올릴 수 없습니다. 기존 이미지 삭제와
						설명 수정만 가능해요.
					</AlertDescription>
				</Alert>
			)}
			<MediaSlot
				accept={staticImageAccept}
				allowUpload={allowUpload}
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
					const created = await createMediaItemFromFile(
						file,
						media.cover?.altText
					);

					if (created) {
						onChange({ ...media, cover: created });
					}
				}}
				onRemove={() => onChange({ ...media, cover: null })}
			/>
			<div className="grid gap-3 lg:grid-cols-2">
				{detailSlots.map(({ index, key }) => {
					const item = media.detail[index] ?? null;

					// 업로드 불가(운영자) + 빈 슬롯이면 아무것도 못 하는 빈 칸이라 숨긴다.
					if (!(allowUpload || item)) {
						return null;
					}

					return (
						<MediaSlot
							accept={staticImageAccept}
							allowUpload={allowUpload}
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
								const created = await createMediaItemFromFile(
									file,
									item?.altText
								);

								if (created) {
									onChange(updateDetailAt(media, index, created));
								}
							}}
							onRemove={() => onChange(updateDetailAt(media, index, null))}
						/>
					);
				})}
			</div>
			{showHorizontalBanner || showVerticalBanner ? (
				<>
					<div className="flex flex-col gap-1 pt-2">
						<h2 className="font-medium text-sm">광고 배너 이미지</h2>
						<p className="text-muted-foreground text-xs">
							프리미엄 광고는 가로형(상단·좌측 슬롯)과 세로형(우측 슬롯) 배너
							이미지를 모두 등록해야 합니다. 비율(가로형 7:3 · 세로형 4:9)이
							크게 어긋나면 슬롯에서 잘려 등록할 수 없고, 조금 다른 정도는 노출
							슬롯에 맞춰 가운데를 기준으로 잘립니다. 움직이는 GIF도 등록할 수
							있습니다.
						</p>
					</div>
					{isProductResolved && unusedBannerLabels.length > 0 ? (
						<Alert variant="warning">
							<TriangleAlert />
							<AlertDescription>
								{unusedBannerLabels.join(", ")}는 지금 선택한 노출 상품이 쓰지
								않습니다. 이미지는 그대로 보관되니 상품을 다시 바꾸면 사용할 수
								있고, 필요 없으면 삭제해 주세요.
							</AlertDescription>
						</Alert>
					) : null}
					<div className="grid gap-3 lg:grid-cols-2">
						{showHorizontalBanner ? (
							<AdBannerSlot
								allowUpload={allowUpload}
								item={media.adHorizontal}
								onChange={(item) => onChange({ ...media, adHorizontal: item })}
								required={bothBannersRequired}
								usage="ad_horizontal"
							/>
						) : null}
						{showVerticalBanner ? (
							<AdBannerSlot
								allowUpload={allowUpload}
								item={media.adVertical}
								onChange={(item) => onChange({ ...media, adVertical: item })}
								required={bothBannersRequired}
								usage="ad_vertical"
							/>
						) : null}
					</div>
					<AdBannerTextEditorCard
						allowUpload={allowUpload}
						layout={adBannerLayout}
						media={media}
						onLayoutChange={onAdBannerLayoutChange}
					/>
				</>
			) : null}
			{error ? <p className="text-destructive text-xs">{error}</p> : null}
		</section>
	);
}

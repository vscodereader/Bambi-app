"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Trash2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import {
	type AdBannerLayout,
	type AdBannerSlot,
	isAdBannerImageRequired,
} from "@/lib/bambi/ad-banner-layout";
import { getAdBannerUsagesForPreviewTemplate } from "@/lib/bambi/ad-preview-templates";
import {
	formatJobAdBannerSpec,
	isAllowedJobAdBannerAspect,
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
	type JobFormMedia,
	type JobFormMediaItem,
} from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";
import { AdBannerEditorLauncher } from "./ad-banner-editor/editor-launcher";
import { AdBannerLayoutRenderer } from "./ad-banner-layout-renderer";

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
	// 배너 에디터 한 번의 저장에 레이아웃과 배너 이미지가 함께 실려 온다. 둘을 따로 흘리면
	// 저장 사이에 한쪽만 반영된 상태가 생긴다.
	onAdBannerChange: (next: {
		layout: AdBannerLayout;
		media: JobFormMedia;
	}) => void;
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

// 배너 슬롯 두 개. 폼 미디어 키(key)·레이아웃 슬롯 키(slot)·규격 usage가 이름이 다 달라서
// 세 곳을 따로 쓰면 가로/세로가 엇갈려도 타입이 안 잡는다.
const AD_BANNER_SLOTS = [
	{ key: "adHorizontal", slot: "horizontal", usage: "ad_horizontal" },
	{ key: "adVertical", slot: "vertical", usage: "ad_vertical" },
] as const satisfies readonly {
	key: keyof JobFormMedia;
	slot: AdBannerSlot;
	usage: JobAdBannerUsage;
}[];

// 슬롯 하나가 새 파일을 받았을 때의 처리. 실패 사유는 화면에서 문구로 바뀌고(모듈은 UI를
// 모른다), 교체가 확정된 뒤에 이전 blob preview를 놓아준다 — 안 놓으면 이미지를 바꿀 때마다
// 원본 파일이 문서 수명 내내 메모리에 남는다.
const pickMediaItem = async (
	file: File,
	previous: JobFormMediaItem | null
): Promise<JobFormMediaItem | null> => {
	const created = await createMediaItemFromFile(file, previous?.altText);

	if ("reason" in created) {
		toast.error(MEDIA_ITEM_FAILURE_MESSAGES[created.reason]);

		return null;
	}

	revokeMediaItemPreview(previous);

	return created.item;
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
						size="icon-sm"
						title={`${label} 삭제`}
						type="button"
						variant="ghost"
					>
						<Trash2 aria-hidden="true" />
					</Button>
				) : null}
			</div>
			<div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
				<div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
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
							<ImageIcon aria-hidden="true" className="size-4" />
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
							placeholder="가게 외관 사진…"
							value={item?.altText ?? ""}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}

// 단색 배경 슬롯은 이미지를 아예 그리지 않는다 — 렌더러가 색으로 덮어 보이지 않는데
// "이미지 없음" 자리표시만 남으면 배너를 등록하지 않은 것처럼 읽힌다(노출 슬롯도 같은 이유로
// 이미지를 건너뛴다).
const renderAdBannerBackground = (
	item: JobFormMediaItem | null,
	usesImage: boolean
) => {
	if (!usesImage) {
		return null;
	}

	if (item?.previewUrl) {
		return (
			<Image
				alt={item.altText || item.fileName}
				className="size-full object-cover"
				height={112}
				src={item.previewUrl}
				unoptimized
				width={112}
			/>
		);
	}

	return (
		<div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
			<ImageIcon aria-hidden="true" className="size-4" />
			<span>이미지 없음</span>
		</div>
	);
};

const getAdBannerImageStateLabel = (
	usesImage: boolean,
	hasItem: boolean
): string => {
	if (!usesImage) {
		return "단색 배경";
	}

	return hasItem ? "이미지 등록됨" : "이미지 없음";
};

const getAdBannerImageHint = (usesImage: boolean): string =>
	usesImage
		? "편집기에서 이미지를 등록해 주십시오."
		: "단색 배경이라 이미지 없이 노출됩니다.";

interface AdBannerStatusProps {
	item: JobFormMediaItem | null;
	// 에디터가 돌려준 레이아웃 전체. 미리보기가 노출 렌더러와 같은 값을 받아야 폼에서 본 배너와
	// 실제 광고가 같아진다.
	layout: AdBannerLayout | null;
	// 운영자 편집(allowUpload=false)은 에디터를 열 수 없으므로 여기서만 배너를 내릴 수 있다.
	onRemove: null | (() => void);
	slot: AdBannerSlot;
	usage: JobAdBannerUsage;
}

// 배너 이미지는 이제 에디터에서만 고른다. 폼에는 그 결과를 요약해 보여준다 — 썸네일·이미지
// 유무·문구 개수가 없으면 에디터를 열기 전엔 배너가 어떤 상태인지 폼에서 전혀 안 보인다.
// 미리보기는 실제 노출 슬롯과 같은 비율로, 노출 화면과 **같은 렌더러**(AdBannerLayoutRenderer)로
// 그린다. 이미지만 그리면 단색 배경 배너는 폼에서 통째로 사라지고, 문구·연출도 저장했는데
// 안 보인다 — 여기서 이상해 보이면 실제 광고도 그렇다.
function AdBannerStatus({
	item,
	layout,
	onRemove,
	slot,
	usage,
}: AdBannerStatusProps) {
	const {
		aspectClassName,
		aspectLabel,
		description,
		label,
		minHeight,
		minWidth,
	} = JOB_AD_BANNER_SPECS[usage];
	// 이 슬롯이 업로드 이미지를 실제로 쓰는가. 배경이 단색이면 렌더러가 색으로 덮어 이미지가
	// 화면에 나오지 않으므로, "이미지 없음" 표시도 비율 반려 경고도 거짓말이 된다(에디터의
	// 저장 가드와 같은 판정 — isAdBannerImageRequired 하나만 본다).
	const usesImage = isAdBannerImageRequired(layout, usage);
	const textCount = layout?.[slot].texts.length ?? 0;
	// 비율이 허용 오차를 크게 벗어나면 슬롯에서 로고·문구가 잘려 나가므로 반려한다. 폼
	// 검증(bambi-job-form)이 같은 규칙으로 제출을 막고, 여기선 그 이유를 바로 알려 준다.
	const aspectRejected =
		usesImage && item?.height && item.width
			? !isAllowedJobAdBannerAspect({
					height: item.height,
					usage,
					width: item.width,
				})
			: false;

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col gap-1">
					<h4 className="font-medium text-sm">{label}</h4>
					<span className="text-muted-foreground text-xs">
						{description} {formatJobAdBannerSpec(usage)}
					</span>
				</div>
				{onRemove && item ? (
					<Button
						aria-label={`${label} 삭제`}
						onClick={onRemove}
						size="icon-sm"
						title={`${label} 삭제`}
						type="button"
						variant="ghost"
					>
						<Trash2 aria-hidden="true" />
					</Button>
				) : null}
			</div>
			<div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
				{/* 레이아웃 오버레이가 absolute inset-0이라 relative가 필요하다(없으면 엉뚱한
				    조상 기준으로 배치된다) — 노출 슬롯(ad-banner.tsx)과 같은 구성이다. */}
				<div
					className={cn(
						"relative flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30",
						aspectClassName
					)}
				>
					{renderAdBannerBackground(item, usesImage)}
					<AdBannerLayoutRenderer layout={layout} slot={slot} />
				</div>
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex flex-wrap gap-2">
						<Badge variant={usesImage && !item ? "outline" : "success"}>
							{getAdBannerImageStateLabel(usesImage, Boolean(item))}
						</Badge>
						<Badge variant="outline">문구 {textCount}개</Badge>
					</div>
					<p className="break-words text-muted-foreground text-xs">
						{item?.fileName ?? getAdBannerImageHint(usesImage)}
					</p>
				</div>
			</div>
			{aspectRejected ? (
				<Alert variant="destructive">
					<TriangleAlert aria-hidden="true" />
					<AlertDescription className="text-pretty">
						{label} 이미지({item?.width}×{item?.height})는 요구 비율{" "}
						{aspectLabel}과 크게 달라 등록할 수 없습니다. {aspectLabel} 비율에
						맞춰 최소 {minWidth}×{minHeight}px 이상으로 다시 등록해 주십시오.
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	);
}

// 상세 이미지 5칸 그리드. 공고 폼과 운영자 "디자인 제작 관리" 다이얼로그가 같은 UI·같은
// 파일 검증(pickMediaItem)을 쓰도록 컴포넌트로 뽑았다.
export function JobDetailImageSlots({
	allowUpload = true,
	media,
	onChange,
}: {
	allowUpload?: boolean;
	media: JobFormMedia;
	onChange: (media: JobFormMedia) => void;
}) {
	return (
		<div className="grid gap-3 lg:grid-cols-2">
			{detailSlots.map(({ index, key }) => {
				const item = media.detail[index] ?? null;

				// 업로드 불가(운영자 공고 편집) + 빈 슬롯이면 아무것도 못 하는 빈 칸이라 숨긴다.
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
								updateDetailAt(media, index, item ? { ...item, altText } : null)
							)
						}
						onFileChange={async (file) => {
							const created = await pickMediaItem(file, item);

							if (created) {
								onChange(updateDetailAt(media, index, created));
							}
						}}
						onRemove={() => {
							revokeMediaItemPreview(item);
							onChange(updateDetailAt(media, index, null));
						}}
					/>
				);
			})}
		</div>
	);
}

export function JobPostMediaUploader({
	adBannerLayout,
	adProductId,
	allowUpload = true,
	error,
	media,
	onAdBannerChange,
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
					<TriangleAlert aria-hidden="true" />
					<AlertDescription className="text-pretty">
						운영자 편집에서는 새 이미지를 올릴 수 없습니다. 기존 이미지 삭제와
						설명 수정만 가능합니다.
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
					const created = await pickMediaItem(file, media.cover);

					if (created) {
						onChange({ ...media, cover: created });
					}
				}}
				onRemove={() => {
					revokeMediaItemPreview(media.cover);
					onChange({ ...media, cover: null });
				}}
			/>
			<JobDetailImageSlots
				allowUpload={allowUpload}
				media={media}
				onChange={onChange}
			/>
			<AdBannerSection
				adBannerLayout={adBannerLayout}
				allowedUsages={allowedUsages}
				allowUpload={allowUpload}
				isProductResolved={isProductResolved}
				media={media}
				onAdBannerChange={onAdBannerChange}
				onChange={onChange}
			/>
			{error ? <p className="text-destructive text-xs">{error}</p> : null}
		</section>
	);
}

interface AdBannerSectionProps {
	adBannerLayout: AdBannerLayout | null;
	allowedUsages: JobAdBannerUsage[];
	allowUpload: boolean;
	isProductResolved: boolean;
	media: JobFormMedia;
	onAdBannerChange: JobPostMediaUploaderProps["onAdBannerChange"];
	onChange: (media: JobFormMedia) => void;
}

// 배너 이미지·문구는 에디터가 한 번에 돌려주므로 폼에서는 현재 상태만 요약해 보여주고 편집
// 진입만 둔다.
function AdBannerSection({
	adBannerLayout,
	allowedUsages,
	allowUpload,
	isProductResolved,
	media,
	onAdBannerChange,
	onChange,
}: AdBannerSectionProps) {
	// 선택 상품이 쓰지 않는 슬롯이라도 이미 올린 이미지가 있으면 계속 보여준다. 상품을 바꿨다고
	// 결제한 이미지를 조용히 지우면 되돌릴 수 없고, 폼 상태에만 남겨두면 보이지 않는 고아가 된다.
	// 구인자가 직접 삭제하거나 상품을 되돌릴 수 있게 경고와 함께 노출한다. 그래서 "보여줄
	// 슬롯"은 상품이 요구하는 슬롯 ∪ 이미지가 남아 있는 슬롯이다.
	// 단 이 목록을 에디터의 requiredUsages로 넘기면 안 된다 — 에디터는 그걸 저장 차단 게이트로
	// 쓰는데, 그러면 "상품에서 빠진 세로형을 지우세요"라고 안내해 놓고 막상 지우면 "세로형을
	// 등록해 주십시오"로 저장을 막는 막다른 길이 된다. 에디터는 requiredUsages와 무관하게 두 슬롯
	// 탭을 모두 그리므로, 편집·삭제 경로는 allowedUsages를 넘겨도 그대로 살아 있다.
	const shownSlots = AD_BANNER_SLOTS.filter(
		({ key, usage }) => allowedUsages.includes(usage) || Boolean(media[key])
	);
	const unusedBannerLabels = shownSlots
		.filter(({ usage }) => !allowedUsages.includes(usage))
		.map(({ usage }) => JOB_AD_BANNER_SPECS[usage].label);

	if (shownSlots.length === 0) {
		return null;
	}

	return (
		<>
			<div className="flex flex-col gap-1 pt-2">
				<h2 className="font-medium text-sm">광고 배너</h2>
				<p className="text-muted-foreground text-xs">
					프리미엄 광고는 가로형(상단·좌측 슬롯)과 세로형(우측 슬롯) 배너를 모두
					등록해야 합니다. 이미지 등록과 문구 배치는 배너 편집기에서 함께
					합니다. 비율(가로형 7:3 · 세로형 4:9)이 크게 어긋나면 슬롯에서 잘려
					등록할 수 없고, 조금 다른 정도는 노출 슬롯에 맞춰 가운데를 기준으로
					잘립니다. 움직이는 GIF도 등록할 수 있습니다.
				</p>
			</div>
			{isProductResolved && unusedBannerLabels.length > 0 ? (
				<Alert variant="warning">
					<TriangleAlert aria-hidden="true" />
					<AlertDescription className="text-pretty">
						{unusedBannerLabels.join(", ")}는 지금 선택한 노출 상품이 쓰지
						않습니다. 이미지는 그대로 보관되니 상품을 다시 바꾸면 사용할 수
						있고, 필요 없으면 삭제해 주십시오.
					</AlertDescription>
				</Alert>
			) : null}
			<div className="grid gap-3 lg:grid-cols-2">
				{shownSlots.map(({ key, slot, usage }) => (
					<AdBannerStatus
						item={media[key]}
						key={key}
						layout={adBannerLayout}
						onRemove={
							allowUpload
								? null
								: () => {
										revokeMediaItemPreview(media[key]);
										onChange({ ...media, [key]: null });
									}
						}
						slot={slot}
						usage={usage}
					/>
				))}
			</div>
			{/* 편집 진입은 구인자만. 운영자 편집(allowUpload=false)에서 열면 팝업이
			    /ad-banner-editor로 가는데 그 라우트는 구인자 게이트라 운영자를 자기 홈으로
			    되돌려 보내고, 부모는 영영 결과를 기다린다. 운영자는 위 카드에서 배너를
			    확인하고 내리는 것까지만 한다. */}
			{allowUpload ? (
				<AdBannerEditorLauncher
					layout={adBannerLayout}
					media={{
						adHorizontal: media.adHorizontal,
						adVertical: media.adVertical,
					}}
					onChange={({ layout, media: nextBannerMedia }) =>
						onAdBannerChange({
							layout,
							media: { ...media, ...nextBannerMedia },
						})
					}
					requiredUsages={allowedUsages}
				/>
			) : null}
		</>
	);
}

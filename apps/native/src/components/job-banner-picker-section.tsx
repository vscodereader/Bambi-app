import type { AdBannerLayoutInput } from "@bambi-app/api/services/bambi-ad-banner-layout";
import { useMutation } from "@tanstack/react-query";
import { Button, Input, Label, TextField } from "heroui-native";
import { type ReactElement, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import {
	BANNER_COLOR_PRESETS,
	DEFAULT_BANNER_BACKGROUND_COLOR,
	getSlotBackground,
	isBannerImageRequired,
	withSlotBackground,
} from "@/src/lib/employer/ad-banner-layout";
import {
	AD_BANNER_USAGE_HINTS,
	AD_BANNER_USAGE_LABELS,
	type JobAdBannerUsage,
} from "@/src/lib/employer/ad-exposure";
import { pickAndUploadJobImage } from "@/src/lib/employer/job-image-upload";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";
import { orpc } from "@/src/lib/orpc";

interface BannerMedia {
	adHorizontal?: JobMediaUploadItem;
	adVertical?: JobMediaUploadItem;
}

interface Props {
	// 현재 배너 레이아웃(단색 배경 등). 없으면(미편집) 두 슬롯 모두 이미지 배경이 기본이다.
	layout: AdBannerLayoutInput | null;
	media: BannerMedia;
	onChange: (next: BannerMedia) => void;
	// background만 바꿔 되돌린다 — 웹에서 만든 문구 블록은 그대로 보존된다.
	onLayoutChange: (next: AdBannerLayoutInput | null) => void;
	organizationId: string;
	requiredUsages: readonly JobAdBannerUsage[];
	teamId: null | string;
}

// 미리보기 uri는 payload에 담지 않는다 — 화면 표시용으로만 storageKey에 매핑해 둔다.
type PreviewMap = Record<string, string>;

// usage 두 값과 media 두 키를 매핑한다 — 슬롯이 둘뿐이라 표로 두지 않고 여기서 바로 고른다.
const mediaKeyFor = (usage: JobAdBannerUsage): "adHorizontal" | "adVertical" =>
	usage === "ad_horizontal" ? "adHorizontal" : "adVertical";

// 6자리 hex만 받는다(서버 정규식과 동일). 8자리를 허용하면 웹의 대비 경고가 조용히 꺼진다.
const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/;
const NON_HEX = /[^0-9a-f]/g;
const LEADING_HASH = /^#/;

// 입력값을 "#" + 소문자 hex로 정규화한다. 6자리를 다 채우면 정식 색, 아니면 부분 입력 문자열.
const normalizeHexInput = (raw: string): string =>
	`#${raw.replace(LEADING_HASH, "").toLowerCase().replace(NON_HEX, "").slice(0, 6)}`;

const isBackgroundTypeToggle = (selected: boolean): string =>
	selected
		? "min-h-11 flex-1 justify-center rounded-lg border-2 border-accent bg-surface-secondary px-3 py-2"
		: "min-h-11 flex-1 justify-center rounded-lg border-2 border-border bg-surface px-3 py-2";

// 슬롯 하나의 배경(이미지/단색) 선택 + 색 팔레트. 색은 runtime 값이라 스와치 배경만 inline
// style로 준다(Uniwind className은 정적 토큰만 처리).
function BannerBackgroundControl({
	color,
	hexDraft,
	onHexDraftChange,
	onPickColor,
	onSelectImage,
	usesImage,
}: {
	color: string;
	hexDraft: string;
	onHexDraftChange: (raw: string) => void;
	onPickColor: (color: string) => void;
	onSelectImage: () => void;
	usesImage: boolean;
}): ReactElement {
	return (
		<View className="gap-2">
			<View className="flex-row gap-2">
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ selected: usesImage }}
					className={isBackgroundTypeToggle(usesImage)}
					onPress={onSelectImage}
				>
					<Text className="text-center text-foreground text-sm">이미지</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ selected: !usesImage }}
					className={isBackgroundTypeToggle(!usesImage)}
					onPress={() => onPickColor(color)}
				>
					<Text className="text-center text-foreground text-sm">단색</Text>
				</Pressable>
			</View>

			{usesImage ? null : (
				<View className="gap-2">
					<View className="flex-row flex-wrap gap-2">
						{BANNER_COLOR_PRESETS.map((preset) => (
							<Pressable
								accessibilityLabel={`배경색 ${preset}`}
								accessibilityRole="button"
								accessibilityState={{ selected: color === preset }}
								className={
									color === preset
										? "size-11 rounded-lg border-2 border-accent"
										: "size-11 rounded-lg border-2 border-border"
								}
								key={preset}
								onPress={() => onPickColor(preset)}
								style={{ backgroundColor: preset }}
							/>
						))}
					</View>
					<TextField>
						<Label>배경색 직접 입력</Label>
						<Input
							autoCapitalize="none"
							autoCorrect={false}
							maxLength={7}
							onChangeText={onHexDraftChange}
							placeholder="#1f2937"
							value={hexDraft}
						/>
					</TextField>
				</View>
			)}
		</View>
	);
}

export function JobBannerPickerSection({
	layout,
	media,
	onChange,
	onLayoutChange,
	organizationId,
	requiredUsages,
	teamId,
}: Props): ReactElement | null {
	const [isBusy, setIsBusy] = useState(false);
	const [previews, setPreviews] = useState<PreviewMap>({});
	// 슬롯별 hex 입력 중간값. 6자리를 다 채우기 전 부분 입력을 화면에 유지한다.
	const [hexDrafts, setHexDrafts] = useState<
		Partial<Record<JobAdBannerUsage, string>>
	>({});
	const uploadMutation = useMutation(
		orpc.bambi.jobs.createMediaUpload.mutationOptions()
	);

	// 무료·리스팅 상품은 배너 슬롯이 없다. 훅 호출 뒤에 분기해야 렌더 간 훅 순서가 안 어긋난다.
	if (requiredUsages.length === 0) {
		return null;
	}

	const handlePick = async (usage: JobAdBannerUsage) => {
		setIsBusy(true);
		const result = await pickAndUploadJobImage({
			createUpload: uploadMutation.mutateAsync,
			organizationId,
			teamId,
			usage,
		});
		setIsBusy(false);

		if ("cancelled" in result) {
			return;
		}

		if ("error" in result) {
			// 규격(비율·최소 크기) 판정은 서버 몫이라 그 사유를 그대로 띄운다.
			Alert.alert("등록할 수 없는 이미지예요", result.error);
			return;
		}

		setPreviews((prev) => ({
			...prev,
			[result.item.storageKey]: result.previewUri,
		}));
		onChange({ ...media, [mediaKeyFor(usage)]: result.item });
	};

	const handleRemove = (usage: JobAdBannerUsage) => {
		const next = { ...media };
		delete next[mediaKeyFor(usage)];
		onChange(next);
	};

	const setSlotColor = (usage: JobAdBannerUsage, color: string) => {
		onLayoutChange(withSlotBackground(layout, usage, { color, type: "color" }));
	};

	const setSlotImage = (usage: JobAdBannerUsage) => {
		onLayoutChange(withSlotBackground(layout, usage, { type: "image" }));
	};

	const handleHexDraft = (usage: JobAdBannerUsage, raw: string) => {
		const normalized = normalizeHexInput(raw);
		setHexDrafts((prev) => ({ ...prev, [usage]: normalized }));

		// 6자리를 다 채웠을 때만 레이아웃에 반영한다(부분 입력이 저장값을 흔들지 않게).
		if (SIX_DIGIT_HEX.test(normalized)) {
			setSlotColor(usage, normalized);
		}
	};

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-foreground text-sm" selectable>
					광고 배너
				</Text>
				<Text className="text-muted text-xs" selectable>
					슬롯마다 이미지 또는 단색 배경을 고릅니다. 단색이면 이미지 없이
					노출돼요. 이미지 규격은 등록 시 서버가 확인해요.
				</Text>
			</View>

			{requiredUsages.map((usage) => {
				const item = media[mediaKeyFor(usage)];
				const previewUri = item ? (previews[item.storageKey] ?? "") : "";
				const isVertical = usage === "ad_vertical";
				const label = AD_BANNER_USAGE_LABELS[usage];
				const background = getSlotBackground(layout, usage);
				const usesImage = background.type === "image";
				const imageRequired = isBannerImageRequired(layout, usage);
				const color =
					background.type === "color"
						? background.color
						: DEFAULT_BANNER_BACKGROUND_COLOR;
				const slot = usage === "ad_horizontal" ? "horizontal" : "vertical";
				const textCount = layout?.[slot].texts.length ?? 0;

				return (
					<View className="gap-2" key={usage}>
						<View className="flex-row items-center gap-2">
							<Text className="font-medium text-foreground text-sm" selectable>
								{label}
							</Text>
							{imageRequired && !item ? (
								<Text className="text-danger-soft-foreground text-xs dark:text-danger">
									필수
								</Text>
							) : null}
						</View>
						<Text className="text-muted text-xs" selectable>
							{AD_BANNER_USAGE_HINTS[usage]}
						</Text>

						<BannerBackgroundControl
							color={color}
							hexDraft={hexDrafts[usage] ?? color}
							onHexDraftChange={(raw) => handleHexDraft(usage, raw)}
							onPickColor={(next) => setSlotColor(usage, next)}
							onSelectImage={() => setSlotImage(usage)}
							usesImage={usesImage}
						/>

						{textCount > 0 ? (
							<Text className="text-muted text-xs" selectable>
								{`문구 ${textCount}개는 웹에서 편집할 수 있어요.`}
							</Text>
						) : null}

						{usesImage ? (
							renderImageArea({
								isBusy,
								isVertical,
								item,
								label,
								onPick: () => handlePick(usage),
								onRemove: () => handleRemove(usage),
								previewUri,
							})
						) : (
							<Text className="text-muted text-xs" selectable>
								단색 배경이라 이미지 없이 노출됩니다.
							</Text>
						)}
					</View>
				);
			})}
		</View>
	);
}

// 이미지 업로드/미리보기 영역. 단색 슬롯에서는 렌더하지 않는다(이미지가 화면에 안 나온다).
function renderImageArea({
	isBusy,
	isVertical,
	item,
	label,
	onPick,
	onRemove,
	previewUri,
}: {
	isBusy: boolean;
	isVertical: boolean;
	item: JobMediaUploadItem | undefined;
	label: string;
	onPick: () => void;
	onRemove: () => void;
	previewUri: string;
}): ReactElement {
	if (!item) {
		return (
			<Button isDisabled={isBusy} onPress={onPick} variant="secondary">
				<Button.Label>{isBusy ? "처리 중" : "이미지 등록"}</Button.Label>
			</Button>
		);
	}

	return (
		<View className="gap-2">
			{previewUri ? (
				<Image
					accessibilityLabel={`${label} 미리보기`}
					className={
						isVertical ? "h-64 w-40 rounded-lg" : "h-32 w-full rounded-lg"
					}
					source={{ uri: previewUri }}
				/>
			) : (
				<Text className="text-muted text-xs" selectable>
					{`등록된 ${label}`}
				</Text>
			)}
			<Button isDisabled={isBusy} onPress={onPick} variant="secondary">
				<Button.Label>{isBusy ? "처리 중" : "다른 이미지로 변경"}</Button.Label>
			</Button>
			<Pressable
				className="min-h-11 justify-center self-start rounded-lg border border-border bg-background px-3 active:opacity-75"
				onPress={onRemove}
			>
				<Text className="text-danger-soft-foreground text-sm dark:text-danger">
					제거
				</Text>
			</Pressable>
		</View>
	);
}

import type { AdBannerLayoutInput } from "@bambi-app/api/services/bambi-ad-banner-layout";
import { useMutation } from "@tanstack/react-query";
import {
	Button,
	Chip,
	Input,
	Label,
	Slider,
	Switch,
	TextField,
} from "heroui-native";
import { type ReactElement, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { AdBannerSlotCanvas } from "@/src/components/ad-banner-slot-canvas";
import {
	AD_BANNER_ANIMATION_DESCRIPTIONS,
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_FONT_SIZE_MAX,
	AD_BANNER_FONT_SIZE_MIN,
	AD_BANNER_MAX_BLOCKS,
	AD_BANNER_SCRIM_OPACITY_MAX,
	AD_BANNER_SCRIM_OPACITY_MIN,
	AD_BANNER_TEXT_ALIGN_OPTIONS,
	AD_BANNER_TEXT_MAX_LENGTH,
	AD_BANNER_TEXT_WEIGHT_OPTIONS,
	AD_BANNER_WIDTH_MAX,
	AD_BANNER_WIDTH_MIN,
	type AdBannerAnimation,
	type AdBannerSlot,
	type AdBannerSlotLayout,
	type AdBannerTextBlock,
	addTextBlock,
	BANNER_COLOR_PRESETS,
	createEmptyBannerLayout,
	DEFAULT_BANNER_BACKGROUND_COLOR,
	getSlotBackground,
	isBannerImageRequired,
	isLowContrast,
	removeTextBlock,
	SLOT_FOR_USAGE,
	TEXT_COLOR_PRESETS,
	updateTextBlock,
	withSlot,
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
	// 현재 배너 레이아웃(배경·스크림·문구). 없으면(미편집) 두 슬롯 모두 이미지 배경이 기본이다.
	layout: AdBannerLayoutInput | null;
	media: BannerMedia;
	onChange: (next: BannerMedia) => void;
	// 배경·스크림·문구 변경 모두 이 콜백 하나로 draft에 반영한다 — 로컬 복사본을 두지 않는다.
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

// 6자리 hex만 받는다(서버 정규식과 동일). 8자리를 허용하면 대비 경고가 조용히 꺼진다.
const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/;
const NON_HEX = /[^0-9a-f]/g;
const LEADING_HASH = /^#/;

// 입력값을 "#" + 소문자 hex로 정규화한다. 6자리를 다 채우면 정식 색, 아니면 부분 입력 문자열.
const normalizeHexInput = (raw: string): string =>
	`#${raw.replace(LEADING_HASH, "").toLowerCase().replace(NON_HEX, "").slice(0, 6)}`;

// heroui Slider는 단일 값이어도 number | number[]로 콜백을 준다 — 한 값만 꺼낸다.
const singleValue = (value: number | number[]): number =>
	Array.isArray(value) ? value[0] : value;

const isBackgroundTypeToggle = (selected: boolean): string =>
	selected
		? "min-h-11 flex-1 justify-center rounded-lg border-2 border-accent bg-surface-secondary px-3 py-2"
		: "min-h-11 flex-1 justify-center rounded-lg border-2 border-border bg-surface px-3 py-2";

// 색 프리셋 스와치 + hex 직접 입력. 배경색·글자색이 같은 형태라 한 컴포넌트로 뽑아 둘 다 쓴다.
// 색은 runtime 값이라 스와치 배경만 inline style로 준다(Uniwind className은 정적 토큰만 처리).
function ColorSwatchField({
	color,
	hexDraft,
	label,
	onHexDraftChange,
	onPickColor,
	presets,
	swatchLabelPrefix,
}: {
	color: string;
	hexDraft: string;
	label: string;
	onHexDraftChange: (raw: string) => void;
	onPickColor: (color: string) => void;
	presets: readonly string[];
	swatchLabelPrefix: string;
}): ReactElement {
	return (
		<View className="gap-2">
			<View className="flex-row flex-wrap gap-2">
				{presets.map((preset) => (
					<Pressable
						accessibilityLabel={`${swatchLabelPrefix} ${preset}`}
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
				<Label>{label}</Label>
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
	);
}

// 슬롯 하나의 배경(이미지/단색) 선택 + 단색 팔레트.
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
				<ColorSwatchField
					color={color}
					hexDraft={hexDraft}
					label="배경색 직접 입력"
					onHexDraftChange={onHexDraftChange}
					onPickColor={onPickColor}
					presets={BANNER_COLOR_PRESETS}
					swatchLabelPrefix="배경색"
				/>
			)}
		</View>
	);
}

// 굵기·정렬·연출처럼 값 하나를 고르는 토글 묶음. 연출만 deselectable — 고른 걸 다시 누르면 해제.
function OptionChips<T extends string>({
	deselectable,
	onSelect,
	options,
	value,
}: {
	deselectable?: boolean;
	onSelect: (value: T | null) => void;
	options: readonly { label: string; value: T }[];
	value: T | null;
}): ReactElement {
	return (
		<View className="flex-row flex-wrap gap-2">
			{options.map((option) => {
				const selected = option.value === value;

				return (
					<Chip
						accessibilityRole="button"
						accessibilityState={{ selected }}
						color={selected ? "accent" : "default"}
						key={option.value}
						onPress={() =>
							onSelect(deselectable && selected ? null : option.value)
						}
						variant={selected ? "primary" : "soft"}
					>
						<Chip.Label>{option.label}</Chip.Label>
					</Chip>
				);
			})}
		</View>
	);
}

// 슬라이더 한 줄(라벨 + 현재 값 + 트랙). 값 라벨을 직접 그려 "%"·단위를 자유롭게 붙인다.
function SliderRow({
	isDisabled,
	label,
	max,
	min,
	onChange,
	step,
	value,
	valueLabel,
}: {
	isDisabled?: boolean;
	label: string;
	max: number;
	min: number;
	onChange: (value: number) => void;
	step?: number;
	value: number;
	valueLabel: string;
}): ReactElement {
	return (
		<View className="gap-1">
			<View className="flex-row items-center justify-between">
				<Text className="font-medium text-foreground text-sm">{label}</Text>
				<Text className="text-muted text-xs">{valueLabel}</Text>
			</View>
			<Slider
				isDisabled={isDisabled}
				maxValue={max}
				minValue={min}
				onChange={(next) => onChange(singleValue(next))}
				step={step}
				value={value}
			>
				<Slider.Track>
					<Slider.Fill />
					<Slider.Thumb />
				</Slider.Track>
			</Slider>
		</View>
	);
}

// 선택된 문구 블록 편집 패널. 갱신은 전부 onChange(패치) 하나로 상위 updateTextBlock을 거친다.
function SlotTextPanel({
	backgroundColor,
	block,
	colorHexDraft,
	isColorBackground,
	onChange,
	onColorHexDraftChange,
	onDelete,
	scrimEnabled,
}: {
	backgroundColor: string;
	block: AdBannerTextBlock;
	colorHexDraft: string;
	isColorBackground: boolean;
	onChange: (patch: Partial<AdBannerTextBlock>) => void;
	onColorHexDraftChange: (raw: string) => void;
	onDelete: () => void;
	scrimEnabled: boolean;
}): ReactElement {
	// 경고일 뿐 저장을 막지 않는다 — 배경 사진에 따라 성립하는 조합도 있다.
	const lowContrast =
		isColorBackground && isLowContrast(backgroundColor, block.color);
	const unprotectedImage = !(isColorBackground || scrimEnabled);
	const animationDescription = block.animation
		? AD_BANNER_ANIMATION_DESCRIPTIONS[block.animation]
		: null;

	return (
		<View className="gap-3 rounded-lg border border-border bg-surface p-3">
			<TextField>
				<Label>문구</Label>
				<Input
					maxLength={AD_BANNER_TEXT_MAX_LENGTH}
					onChangeText={(content) => onChange({ content })}
					placeholder="주말 알바 급구…"
					value={block.content}
				/>
				<Text className="text-muted text-xs" selectable>
					{`${AD_BANNER_TEXT_MAX_LENGTH}자 이내`}
				</Text>
			</TextField>

			<SliderRow
				label="글자 크기"
				max={AD_BANNER_FONT_SIZE_MAX}
				min={AD_BANNER_FONT_SIZE_MIN}
				onChange={(fontSize) => onChange({ fontSize })}
				value={block.fontSize}
				valueLabel={`${block.fontSize}%`}
			/>

			<SliderRow
				label="문구 폭"
				max={AD_BANNER_WIDTH_MAX}
				min={AD_BANNER_WIDTH_MIN}
				onChange={(width) => onChange({ width })}
				value={block.width}
				valueLabel={`${block.width}%`}
			/>

			<ColorSwatchField
				color={block.color}
				hexDraft={colorHexDraft}
				label="글자색 직접 입력"
				onHexDraftChange={onColorHexDraftChange}
				onPickColor={(color) => onChange({ color })}
				presets={TEXT_COLOR_PRESETS}
				swatchLabelPrefix="글자색"
			/>

			<View className="gap-1">
				<Text className="font-medium text-foreground text-sm">굵기</Text>
				<OptionChips
					onSelect={(weight) => onChange({ weight: weight ?? block.weight })}
					options={AD_BANNER_TEXT_WEIGHT_OPTIONS}
					value={block.weight}
				/>
			</View>

			<View className="gap-1">
				<Text className="font-medium text-foreground text-sm">정렬</Text>
				<OptionChips
					onSelect={(align) => onChange({ align: align ?? block.align })}
					options={AD_BANNER_TEXT_ALIGN_OPTIONS}
					value={block.align}
				/>
			</View>

			<View className="gap-1">
				<Text className="font-medium text-foreground text-sm">연출</Text>
				<OptionChips<AdBannerAnimation>
					deselectable
					onSelect={(animation) => onChange({ animation })}
					options={AD_BANNER_ANIMATION_OPTIONS}
					value={block.animation}
				/>
				{animationDescription ? (
					<View className="gap-0.5">
						<Text className="text-muted text-xs" selectable>
							{animationDescription}
						</Text>
						<Text className="text-muted text-xs" selectable>
							연출은 웹·앱 노출 화면에서 재생되며, 여기 미리보기는 정지
							상태예요.
						</Text>
					</View>
				) : null}
			</View>

			{lowContrast ? (
				<Text className="text-danger-soft-foreground text-xs dark:text-danger">
					이 조합은 읽기 어려울 수 있어요. 배경색이나 글자색을 바꿔 주세요.
				</Text>
			) : null}

			{unprotectedImage ? (
				<Text className="text-danger-soft-foreground text-xs dark:text-danger">
					사진에 따라 글자가 안 보일 수 있어요. 어두운 오버레이를 켜면
					안정적이에요.
				</Text>
			) : null}

			<Button onPress={onDelete} size="sm" variant="danger">
				<Button.Label>문구 삭제</Button.Label>
			</Button>
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
	// 화면 전용 값만 로컬 state로 둔다. hex 초안(부분 입력)과 슬롯별 선택 블록 id.
	const [hexDrafts, setHexDrafts] = useState<Record<string, string>>({});
	const [selectedByUsage, setSelectedByUsage] = useState<
		Partial<Record<JobAdBannerUsage, null | string>>
	>({});
	const uploadMutation = useMutation(
		orpc.bambi.jobs.createMediaUpload.mutationOptions()
	);

	// 무료·리스팅 상품은 배너 슬롯이 없다. 훅 호출 뒤에 분기해야 렌더 간 훅 순서가 안 어긋난다.
	if (requiredUsages.length === 0) {
		return null;
	}

	// 갱신은 항상 실제 layout(널 허용)을 넘겨 헬퍼가 기본값에서 시작하게 한다. 조회·클램프가
	// 필요한 곳(슬롯 스크림·문구 갱신)은 널을 접은 사본을 쓴다.
	const layoutOrEmpty = layout ?? createEmptyBannerLayout();

	const setSelected = (usage: JobAdBannerUsage, id: null | string) => {
		setSelectedByUsage((prev) => ({ ...prev, [usage]: id }));
	};

	// hex 부분 입력을 화면에 유지하고, 6자리를 다 채웠을 때만 실제 색으로 반영한다.
	const applyHexDraft = (
		key: string,
		raw: string,
		apply: (hex: string) => void
	) => {
		const normalized = normalizeHexInput(raw);
		setHexDrafts((prev) => ({ ...prev, [key]: normalized }));

		if (SIX_DIGIT_HEX.test(normalized)) {
			apply(normalized);
		}
	};

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

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-foreground text-sm" selectable>
					광고 배너
				</Text>
				<Text className="text-muted text-xs" selectable>
					슬롯마다 배경(이미지/단색)을 고르고 문구를 얹어 배치합니다. 이미지
					규격은 등록 시 서버가 확인해요.
				</Text>
			</View>

			{requiredUsages.map((usage) => (
				<BannerSlotEditor
					applyHexDraft={applyHexDraft}
					hexDrafts={hexDrafts}
					isBusy={isBusy}
					item={media[mediaKeyFor(usage)]}
					key={usage}
					layout={layout}
					layoutOrEmpty={layoutOrEmpty}
					onLayoutChange={onLayoutChange}
					onPick={() => handlePick(usage)}
					onRemove={() => handleRemove(usage)}
					onSelect={(id) => setSelected(usage, id)}
					previews={previews}
					selectedId={selectedByUsage[usage] ?? null}
					usage={usage}
				/>
			))}
		</View>
	);
}

// 슬롯 하나(가로형/세로형)의 편집 묶음: 배경·캔버스·스크림·이미지·문구 목록·선택 패널.
// map 콜백에 그대로 두면 렌더 함수 복잡도가 상한을 넘어, 슬롯 단위 컴포넌트로 뽑았다.
function BannerSlotEditor({
	applyHexDraft,
	hexDrafts,
	isBusy,
	item,
	layout,
	layoutOrEmpty,
	onLayoutChange,
	onPick,
	onRemove,
	onSelect,
	previews,
	selectedId,
	usage,
}: {
	applyHexDraft: (
		key: string,
		raw: string,
		apply: (hex: string) => void
	) => void;
	hexDrafts: Record<string, string>;
	isBusy: boolean;
	item: JobMediaUploadItem | undefined;
	layout: AdBannerLayoutInput | null;
	layoutOrEmpty: AdBannerLayoutInput;
	onLayoutChange: (next: AdBannerLayoutInput | null) => void;
	onPick: () => void;
	onRemove: () => void;
	onSelect: (id: null | string) => void;
	previews: PreviewMap;
	selectedId: null | string;
	usage: JobAdBannerUsage;
}): ReactElement {
	const previewUri = item ? (previews[item.storageKey] ?? "") : "";
	const isVertical = usage === "ad_vertical";
	const label = AD_BANNER_USAGE_LABELS[usage];
	const slot: AdBannerSlot = SLOT_FOR_USAGE[usage];
	const slotLayout: AdBannerSlotLayout = layoutOrEmpty[slot];
	const background = getSlotBackground(layout, usage);
	const usesImage = background.type === "image";
	const imageRequired = isBannerImageRequired(layout, usage);
	const color =
		background.type === "color"
			? background.color
			: DEFAULT_BANNER_BACKGROUND_COLOR;
	const canAddBlock = slotLayout.texts.length < AD_BANNER_MAX_BLOCKS;
	const selectedBlock =
		slotLayout.texts.find((b) => b.id === selectedId) ?? null;

	return (
		<View className="gap-2">
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
				hexDraft={hexDrafts[`bg:${usage}`] ?? color}
				onHexDraftChange={(raw) =>
					applyHexDraft(`bg:${usage}`, raw, (hex) =>
						onLayoutChange(
							withSlotBackground(layout, usage, { color: hex, type: "color" })
						)
					)
				}
				onPickColor={(next) =>
					onLayoutChange(
						withSlotBackground(layout, usage, { color: next, type: "color" })
					)
				}
				onSelectImage={() =>
					onLayoutChange(withSlotBackground(layout, usage, { type: "image" }))
				}
				usesImage={usesImage}
			/>

			{/* 캔버스: 이 슬롯의 배경·문구를 슬롯 폭 전체로 그린다. 드래그 결과는 %
			    좌표로 updateTextBlock을 거쳐 draft에 반영한다. */}
			<AdBannerSlotCanvas
				imageUri={previewUri}
				layout={slotLayout}
				onMoveBlock={(id, x, y) =>
					onLayoutChange(updateTextBlock(layoutOrEmpty, slot, id, { x, y }))
				}
				onSelectBlock={onSelect}
				selectedId={selectedBlock?.id ?? null}
				usage={usage}
			/>

			{usesImage ? (
				<View className="gap-2">
					<View className="flex-row items-center justify-between gap-2">
						<Text className="font-medium text-foreground text-sm">
							어두운 오버레이
						</Text>
						<Switch
							isSelected={slotLayout.scrim.enabled}
							onSelectedChange={(enabled) =>
								onLayoutChange(
									withSlot(layout, slot, {
										scrim: { ...slotLayout.scrim, enabled },
									})
								)
							}
						/>
					</View>
					<SliderRow
						isDisabled={!slotLayout.scrim.enabled}
						label="오버레이 강도"
						max={AD_BANNER_SCRIM_OPACITY_MAX}
						min={AD_BANNER_SCRIM_OPACITY_MIN}
						onChange={(opacity) =>
							onLayoutChange(
								withSlot(layout, slot, {
									scrim: { ...slotLayout.scrim, opacity },
								})
							)
						}
						step={5}
						value={slotLayout.scrim.opacity}
						valueLabel={`${slotLayout.scrim.opacity}%`}
					/>
					{renderImageArea({
						isBusy,
						isVertical,
						item,
						label,
						onPick,
						onRemove,
						previewUri,
					})}
				</View>
			) : (
				<Text className="text-muted text-xs" selectable>
					단색 배경이라 이미지 없이 노출됩니다.
				</Text>
			)}

			{/* 문구 목록: 칩을 눌러 선택하고, 추가 버튼으로 새 문구를 얹는다. */}
			<View className="gap-2">
				<View className="flex-row items-center justify-between gap-2">
					<Text className="font-medium text-foreground text-sm">
						{`문구 ${slotLayout.texts.length}/${AD_BANNER_MAX_BLOCKS}`}
					</Text>
					<Button
						isDisabled={!canAddBlock}
						onPress={() => {
							const { block, layout: next } = addTextBlock(layout, slot);
							onLayoutChange(next);
							onSelect(block.id);
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>문구 추가</Button.Label>
					</Button>
				</View>
				{canAddBlock ? null : (
					<Text className="text-muted text-xs" selectable>
						{`문구는 최대 ${AD_BANNER_MAX_BLOCKS}개까지 넣을 수 있어요.`}
					</Text>
				)}
				{slotLayout.texts.length > 0 ? (
					<View className="flex-row flex-wrap gap-2">
						{slotLayout.texts.map((block, index) => {
							const selected = block.id === selectedBlock?.id;

							return (
								<Chip
									accessibilityRole="button"
									accessibilityState={{ selected }}
									color={selected ? "accent" : "default"}
									key={block.id}
									onPress={() => onSelect(selected ? null : block.id)}
									variant={selected ? "primary" : "soft"}
								>
									<Chip.Label>
										{block.content.trim() || `문구 ${index + 1}`}
									</Chip.Label>
								</Chip>
							);
						})}
					</View>
				) : null}
			</View>

			{selectedBlock ? (
				<SlotTextPanel
					backgroundColor={color}
					block={selectedBlock}
					colorHexDraft={
						hexDrafts[`text:${selectedBlock.id}`] ?? selectedBlock.color
					}
					isColorBackground={!usesImage}
					onChange={(patch) =>
						onLayoutChange(
							updateTextBlock(layoutOrEmpty, slot, selectedBlock.id, patch)
						)
					}
					onColorHexDraftChange={(raw) =>
						applyHexDraft(`text:${selectedBlock.id}`, raw, (hex) =>
							onLayoutChange(
								updateTextBlock(layoutOrEmpty, slot, selectedBlock.id, {
									color: hex,
								})
							)
						)
					}
					onDelete={() => {
						onLayoutChange(
							removeTextBlock(layoutOrEmpty, slot, selectedBlock.id)
						);
						onSelect(null);
					}}
					scrimEnabled={slotLayout.scrim.enabled}
				/>
			) : null}
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

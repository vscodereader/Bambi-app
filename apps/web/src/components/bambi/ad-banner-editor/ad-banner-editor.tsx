"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@bambi-app/ui/components/empty";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { Switch } from "@bambi-app/ui/components/switch";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FieldHint } from "@/components/bambi/form-message";
import {
	AD_BANNER_DEFAULT_BACKGROUND_COLOR,
	AD_BANNER_MAX_BLOCKS,
	AD_BANNER_SCRIM_OPACITY_MAX,
	AD_BANNER_SCRIM_OPACITY_MIN,
	type AdBannerLayout,
	type AdBannerSlot,
	type AdBannerSlotLayout,
	type AdBannerTextBlock,
	createAdBannerTextBlock,
} from "@/lib/bambi/ad-banner-layout";
import { EditorBlockPanel } from "./editor-block-panel";
import { EditorCanvas } from "./editor-canvas";

const SLOT_OPTIONS: { label: string; value: AdBannerSlot }[] = [
	{ label: "가로형", value: "horizontal" },
	{ label: "세로형", value: "vertical" },
];

// 서버 zod는 문구를 trim 후 1자 이상으로 받는다. 빈 블록을 그대로 저장하면 배너가 아니라
// 공고 저장 전체가 반려되면서 구인자에겐 원인이 안 보이는 에러만 뜬다. 여기서 먼저 잡고,
// 어느 슬롯의 어느 블록인지까지 짚어 준다.
const findBlankBlock = (
	layout: AdBannerLayout
): { block: AdBannerTextBlock; slot: AdBannerSlot } | null => {
	for (const slot of ["horizontal", "vertical"] as const) {
		const block = layout[slot].texts.find(
			(candidate) => candidate.content.trim().length === 0
		);

		if (block) {
			return { block, slot };
		}
	}

	return null;
};

// 배너 문구 자유 배치 에디터. window·postMessage를 모르는 순수 컴포넌트다 — 팝업·다이얼로그
// 껍데기가 각자 방식으로 onSave·onCancel을 채운다.
export function AdBannerEditor({
	backgroundUrls,
	initialLayout,
	onCancel,
	onSave,
}: {
	backgroundUrls: { horizontal?: string; vertical?: string };
	initialLayout: AdBannerLayout;
	onCancel: () => void;
	onSave: (layout: AdBannerLayout) => void;
}) {
	const [layout, setLayout] = useState<AdBannerLayout>(initialLayout);
	const [slot, setSlot] = useState<AdBannerSlot>("horizontal");
	const [selectedId, setSelectedId] = useState<null | string>(null);

	const slotLayout = layout[slot];
	// 슬롯을 바꾸면 다른 슬롯의 id는 여기서 걸러져 자동으로 선택이 풀린다.
	const selectedBlock =
		slotLayout.texts.find((block) => block.id === selectedId) ?? null;
	const canAddBlock = slotLayout.texts.length < AD_BANNER_MAX_BLOCKS;

	const updateSlot = (patch: Partial<AdBannerSlotLayout>) => {
		setLayout((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));
	};

	const updateBlock = (id: string, patch: Partial<AdBannerTextBlock>) => {
		setLayout((prev) => ({
			...prev,
			[slot]: {
				...prev[slot],
				texts: prev[slot].texts.map((block) =>
					block.id === id ? { ...block, ...patch } : block
				),
			},
		}));
	};

	const handleBlockChange = (patch: Partial<AdBannerTextBlock>) => {
		if (!selectedBlock) {
			return;
		}

		updateBlock(selectedBlock.id, patch);

		// 글리치는 pseudo 요소 배경색이 효과의 부품이다. 이미지 배경에서 스크림이 꺼져 있으면
		// 넘길 색이 없어 세 겹이 뭉개지므로 자동으로 켜고 알린다.
		if (
			patch.animation === "glitch" &&
			slotLayout.background.type === "image" &&
			!slotLayout.scrim.enabled
		) {
			updateSlot({ scrim: { ...slotLayout.scrim, enabled: true } });
			toast.info("글리치는 배경이 필요해 오버레이를 켰습니다.");
		}
	};

	const handleAddBlock = () => {
		const block = createAdBannerTextBlock(crypto.randomUUID());
		updateSlot({ texts: [...slotLayout.texts, block] });
		setSelectedId(block.id);
	};

	const handleDeleteBlock = () => {
		if (!selectedBlock) {
			return;
		}

		updateSlot({
			texts: slotLayout.texts.filter((block) => block.id !== selectedBlock.id),
		});
		setSelectedId(null);
	};

	const handleSave = () => {
		const blank = findBlankBlock(layout);

		if (blank) {
			setSlot(blank.slot);
			setSelectedId(blank.block.id);
			toast.error("내용이 비어 있는 문구가 있어요. 채우거나 삭제해 주세요.");
			return;
		}

		onSave(layout);
	};

	const handleScrimOpacity = (value: string) => {
		const opacity = Number(value);

		if (!Number.isFinite(opacity)) {
			return;
		}

		updateSlot({
			scrim: {
				...slotLayout.scrim,
				opacity: Math.min(
					AD_BANNER_SCRIM_OPACITY_MAX,
					Math.max(AD_BANNER_SCRIM_OPACITY_MIN, opacity)
				),
			},
		});
	};

	return (
		<div className="flex w-full flex-col gap-4">
			<ToggleGroup
				aria-label="배너 슬롯"
				className="grid w-full grid-cols-2 gap-2 sm:w-fit sm:grid-flow-col sm:grid-cols-none"
				onValueChange={(next: string[]) =>
					setSlot((next.at(-1) as AdBannerSlot) ?? slot)
				}
				value={[slot]}
				variant="outline"
			>
				{SLOT_OPTIONS.map((option) => (
					<ToggleGroupItem key={option.value} value={option.value}>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			<div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
				<div className="flex flex-col items-center gap-2">
					<EditorCanvas
						backgroundUrl={backgroundUrls[slot]}
						onMove={(id, x, y) => updateBlock(id, { x, y })}
						onSelect={setSelectedId}
						selectedId={selectedId}
						slot={slot}
						slotLayout={slotLayout}
					/>
					<FieldHint>
						문구를 끌어 옮기세요. 키보드는 Tab으로 문구를 고른 뒤 방향키(Shift는
						5%씩)로 옮깁니다.
					</FieldHint>
				</div>

				{selectedBlock ? (
					<EditorBlockPanel
						background={slotLayout.background}
						block={selectedBlock}
						onChange={handleBlockChange}
						onDelete={handleDeleteBlock}
						scrimEnabled={slotLayout.scrim.enabled}
					/>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>선택된 문구가 없습니다</EmptyTitle>
							<EmptyDescription>
								문구를 누르면 여기서 내용·크기·색을 바꿀 수 있습니다.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</div>

			<Separator />

			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<span className="font-medium text-sm">배경</span>
					<div className="flex flex-wrap items-center gap-3">
						<ToggleGroup
							aria-label="배경"
							onValueChange={(next: string[]) => {
								const type = next.at(-1);

								if (!type) {
									return;
								}

								updateSlot({
									background:
										type === "color"
											? {
													color: AD_BANNER_DEFAULT_BACKGROUND_COLOR,
													type: "color",
												}
											: { type: "image" },
								});
							}}
							value={[slotLayout.background.type]}
							variant="outline"
						>
							<ToggleGroupItem value="image">이미지</ToggleGroupItem>
							<ToggleGroupItem value="color">단색</ToggleGroupItem>
						</ToggleGroup>

						{slotLayout.background.type === "color" ? (
							<div className="flex items-center gap-2">
								<Label htmlFor="ad-banner-background-color">배경색</Label>
								<Input
									className="h-9 w-16 p-1"
									id="ad-banner-background-color"
									onChange={(event) =>
										updateSlot({
											background: { color: event.target.value, type: "color" },
										})
									}
									type="color"
									value={slotLayout.background.color}
								/>
							</div>
						) : null}
					</div>
				</div>

				{slotLayout.background.type === "image" ? (
					<div className="flex flex-wrap items-center gap-3">
						<Label htmlFor="ad-banner-scrim">어두운 오버레이</Label>
						<Switch
							checked={slotLayout.scrim.enabled}
							id="ad-banner-scrim"
							onCheckedChange={(checked) =>
								updateSlot({ scrim: { ...slotLayout.scrim, enabled: checked } })
							}
						/>
						<Label htmlFor="ad-banner-scrim-opacity">강도</Label>
						<Input
							className="w-20"
							disabled={!slotLayout.scrim.enabled}
							id="ad-banner-scrim-opacity"
							max={AD_BANNER_SCRIM_OPACITY_MAX}
							min={AD_BANNER_SCRIM_OPACITY_MIN}
							onChange={(event) => handleScrimOpacity(event.target.value)}
							step={5}
							type="number"
							value={slotLayout.scrim.opacity}
						/>
						<FieldHint>
							0~100%. 사진이 밝을수록 높이면 글자가 또렷합니다.
						</FieldHint>
					</div>
				) : null}

				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-col gap-1">
						<Button
							className="w-fit"
							disabled={!canAddBlock}
							onClick={handleAddBlock}
							variant="outline"
						>
							<Plus data-icon="inline-start" />
							문구 추가
						</Button>
						<FieldHint>
							슬롯당 최대 {AD_BANNER_MAX_BLOCKS}개 ({slotLayout.texts.length}/
							{AD_BANNER_MAX_BLOCKS}).
						</FieldHint>
					</div>

					<div className="flex gap-2">
						<Button onClick={onCancel} variant="outline">
							취소
						</Button>
						<Button onClick={handleSave}>저장</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

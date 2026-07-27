"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@bambi-app/ui/components/empty";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { Slider } from "@bambi-app/ui/components/slider";
import { Switch } from "@bambi-app/ui/components/switch";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { cn } from "@bambi-app/ui/lib/utils";
import { Plus, TriangleAlert, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
	clampPercent,
	createAdBannerTextBlock,
} from "@/lib/bambi/ad-banner-layout";
import {
	JOB_AD_BANNER_SPECS,
	type JobAdBannerUsage,
} from "@/lib/bambi/job-ad-banner-spec";
import type { JobFormMediaItem } from "@/lib/bambi-job-form";
import { EditorBlockPanel } from "./editor-block-panel";
import { EditorCanvas } from "./editor-canvas";
import { EditorImageSlot } from "./editor-image-slot";

export interface AdBannerEditorMedia {
	adHorizontal: JobFormMediaItem | null;
	adVertical: JobFormMediaItem | null;
}

export interface AdBannerEditorResult {
	layout: AdBannerLayout;
	media: AdBannerEditorMedia;
}

// 슬롯(레이아웃 축)과 미디어 슬롯(업로드 축)의 대응. 두 축이 코드 여기저기서 따로 매핑되면
// "가로형 탭인데 세로형 이미지를 검사한다" 같은 조용한 어긋남이 생긴다.
const SLOT_META: Record<
	AdBannerSlot,
	{
		label: string;
		mediaKey: keyof AdBannerEditorMedia;
		usage: JobAdBannerUsage;
	}
> = {
	horizontal: {
		label: "가로형",
		mediaKey: "adHorizontal",
		usage: "ad_horizontal",
	},
	vertical: { label: "세로형", mediaKey: "adVertical", usage: "ad_vertical" },
};

const SLOT_ORDER = ["horizontal", "vertical"] as const;

// 새 문구를 추가할 때마다 어긋나게 놓는 간격(%). 슬롯당 최대 5개라 마지막 블록도 캔버스 안이다.
const BLOCK_CASCADE_STEP = 6;

// 서버 zod는 문구를 trim 후 1자 이상으로 받는다. 빈 블록을 그대로 저장하면 배너가 아니라
// 공고 저장 전체가 반려되면서 구인자에겐 원인이 안 보이는 에러만 뜬다. 여기서 먼저 잡고,
// 어느 슬롯의 어느 블록인지까지 짚어 준다.
const findBlankBlock = (
	layout: AdBannerLayout
): { block: AdBannerTextBlock; slot: AdBannerSlot } | null => {
	for (const slot of SLOT_ORDER) {
		const block = layout[slot].texts.find(
			(candidate) => candidate.content.trim().length === 0
		);

		if (block) {
			return { block, slot };
		}
	}

	return null;
};

// 배너 에디터. window·postMessage를 모르는 순수 컴포넌트다 — 팝업·다이얼로그 껍데기가 각자
// 방식으로 onSave·onCancel을 채운다. 배경 이미지는 initialMedia 하나에서만 온다: 배경 URL을
// 따로 받으면 "패널에서 고른 이미지"와 "캔버스가 그리는 이미지"가 갈린다.
export function AdBannerEditor({
	initialLayout,
	initialMedia,
	onCancel,
	onSave,
	requiredUsages,
}: {
	initialLayout: AdBannerLayout;
	initialMedia: AdBannerEditorMedia;
	onCancel: () => void;
	onSave: (result: AdBannerEditorResult) => void;
	requiredUsages: JobAdBannerUsage[];
}) {
	const [layout, setLayout] = useState<AdBannerLayout>(initialLayout);
	const [media, setMedia] = useState<AdBannerEditorMedia>(initialMedia);
	const [slot, setSlot] = useState<AdBannerSlot>("horizontal");
	const [selectedId, setSelectedId] = useState<null | string>(null);
	// 저장 가드가 잡은 사유. 토스트로만 알리면 스크롤 밖의 어느 칸이 문제인지 알 수 없어,
	// 문제가 난 자리 옆에 붙이고 그 컨트롤로 포커스를 옮긴다.
	const [saveError, setSaveError] = useState<{
		field: "image" | "text";
		message: string;
	} | null>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const contentInputRef = useRef<HTMLInputElement>(null);

	const meta = SLOT_META[slot];
	const slotLayout = layout[slot];
	// 슬롯을 바꾸면 다른 슬롯의 id는 여기서 걸러져 자동으로 선택이 풀린다.
	const selectedBlock =
		slotLayout.texts.find((block) => block.id === selectedId) ?? null;
	const canAddBlock = slotLayout.texts.length < AD_BANNER_MAX_BLOCKS;
	const slotMedia = media[meta.mediaKey];

	// saveError는 실패할 때마다 새 객체라, 같은 사유가 이어져도 포커스가 다시 옮겨 간다.
	useEffect(() => {
		if (!saveError) {
			return;
		}

		const target =
			saveError.field === "image"
				? imageInputRef.current
				: contentInputRef.current;
		target?.focus();
	}, [saveError]);

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

		setSaveError(null);
		updateBlock(selectedBlock.id, patch);

		// 글리치는 pseudo 요소 배경색이 효과의 부품이다. 이미지 배경에서 스크림이 꺼져 있으면
		// 넘길 색이 없어 세 겹이 뭉개지므로 자동으로 켠다.
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
		const created = createAdBannerTextBlock(crypto.randomUUID());
		// 기본 좌표는 항상 한가운데라 그대로 추가하면 블록이 정확히 포개진다. 포인터 히트는 늘
		// 맨 위 블록이 가져가 아래 블록은 목록·Tab으로만 잡힌다. 기존 개수만큼 어긋나게 놓는다.
		const offset = slotLayout.texts.length * BLOCK_CASCADE_STEP;
		const block = {
			...created,
			x: clampPercent(created.x + offset),
			y: clampPercent(created.y + offset),
		};
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
		setSaveError(null);
	};

	const handleSave = () => {
		// 필수 배너 이미지가 없으면 공고 제출 단계에서 반려된다. 그 슬롯으로 옮겨 놓고 막는다.
		const missing = SLOT_ORDER.find((candidate) => {
			const candidateMeta = SLOT_META[candidate];

			return (
				requiredUsages.includes(candidateMeta.usage) &&
				!media[candidateMeta.mediaKey]
			);
		});

		if (missing) {
			setSlot(missing);
			setSaveError({
				field: "image",
				message: `${JOB_AD_BANNER_SPECS[SLOT_META[missing].usage].label} 이미지를 등록해 주십시오.`,
			});
			return;
		}

		const blank = findBlankBlock(layout);

		if (blank) {
			setSlot(blank.slot);
			setSelectedId(blank.block.id);
			setSaveError({
				field: "text",
				message: "내용이 비어 있습니다. 채우거나 문구를 삭제해 주십시오.",
			});
			return;
		}

		setSaveError(null);
		onSave({ layout, media });
	};

	return (
		<div className="flex w-full min-w-0 flex-col gap-4">
			{/* 저장·취소는 화면이 길어져도 늘 닿아야 한다 — 스크롤 맨 끝에 두면 사라진다. */}
			<div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-border border-b bg-background py-3">
				<ToggleGroup
					aria-label="배너 슬롯"
					className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-fit"
					onValueChange={(next: string[]) =>
						setSlot((next.at(-1) as AdBannerSlot) ?? slot)
					}
					value={[slot]}
					variant="outline"
				>
					{SLOT_ORDER.map((value) => {
						const option = SLOT_META[value];
						const incomplete =
							requiredUsages.includes(option.usage) && !media[option.mediaKey];

						return (
							<ToggleGroupItem key={value} value={value}>
								{option.label}
								{/* 어느 슬롯이 아직 비었는지 탭에서 바로 보인다. 저장 버튼을 눌러야
								    알게 되면 두 슬롯을 오가며 원인을 찾아야 한다. */}
								{incomplete ? (
									<>
										<TriangleAlert aria-hidden="true" data-icon="inline-end" />
										<span className="sr-only">이미지 없음</span>
									</>
								) : null}
							</ToggleGroupItem>
						);
					})}
				</ToggleGroup>

				<div className="flex items-center gap-2">
					<Button onClick={onCancel} variant="outline">
						취소
					</Button>
					<Button onClick={handleSave}>저장</Button>
				</div>
			</div>

			<div className="grid min-w-0 items-start gap-4 lg:grid-cols-[3fr_2fr]">
				{/* 캔버스가 주인공이다. 데스크톱에서 더 넓은 칸을 차지하고, 모바일에서는 위로 온다. */}
				<div className="flex min-w-0 flex-col items-center gap-2">
					<EditorCanvas
						backgroundUrl={slotMedia?.previewUrl}
						onMove={(id, x, y) => updateBlock(id, { x, y })}
						onResize={(id, width, x) => updateBlock(id, { width, x })}
						onSelect={setSelectedId}
						selectedId={selectedId}
						slot={slot}
						slotLayout={slotLayout}
					/>
					<FieldHint>
						문구를 끌어서 옮기고, 선택된 문구의 좌우 손잡이로 폭을 조절합니다.
						키보드로는 Tab으로 고른 뒤 방향키로 1%씩, Shift와 함께 누르면 5%씩
						움직입니다.
					</FieldHint>
					{/* 세로 캔버스는 끌기 편하도록 실제 슬롯(폭 약 92px)보다 크게 그린다.
					    비율은 같지만 글자 크기 감각이 어긋나므로 그 사실을 알려 준다. */}
					{slot === "vertical" ? (
						<FieldHint>
							세로형은 실제 노출 폭이 편집 화면의 약 절반입니다. 여기서 작아
							보이지 않을 정도로 글자 크기를 넉넉히 잡아 주십시오.
						</FieldHint>
					) : null}
				</div>

				<div className="flex min-w-0 flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>{meta.label} 배너</CardTitle>
							<CardDescription>
								{JOB_AD_BANNER_SPECS[meta.usage].description}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<EditorImageSlot
								error={saveError?.field === "image" ? saveError.message : null}
								inputRef={imageInputRef}
								item={slotMedia}
								onChange={(item) => {
									setSaveError(null);
									setMedia((prev) => ({ ...prev, [meta.mediaKey]: item }));
								}}
								required={requiredUsages.includes(meta.usage)}
								usage={meta.usage}
							/>

							<Separator />

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
														background: {
															color: event.target.value,
															type: "color",
														},
													})
												}
												type="color"
												value={slotLayout.background.color}
											/>
										</div>
									) : null}
								</div>
								<FieldHint>
									단색을 고르면 올린 이미지 대신 이 색이 배너 바탕이 됩니다.
									이미지는 그대로 보관됩니다.
								</FieldHint>
							</div>

							{slotLayout.background.type === "image" ? (
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between gap-2">
										<Label htmlFor="ad-banner-scrim">어두운 오버레이</Label>
										<Switch
											checked={slotLayout.scrim.enabled}
											id="ad-banner-scrim"
											onCheckedChange={(checked) =>
												updateSlot({
													scrim: { ...slotLayout.scrim, enabled: checked },
												})
											}
										/>
									</div>
									<div
										className={cn(
											"flex items-center gap-3",
											!slotLayout.scrim.enabled && "opacity-50"
										)}
									>
										<Slider
											aria-label="오버레이 강도"
											disabled={!slotLayout.scrim.enabled}
											max={AD_BANNER_SCRIM_OPACITY_MAX}
											min={AD_BANNER_SCRIM_OPACITY_MIN}
											onValueChange={(value) =>
												updateSlot({
													scrim: { ...slotLayout.scrim, opacity: value },
												})
											}
											step={5}
											value={slotLayout.scrim.opacity}
										/>
										<span className="w-10 shrink-0 text-right text-muted-foreground text-xs">
											{slotLayout.scrim.opacity}%
										</span>
									</div>
									<FieldHint>
										사진이 밝을수록 강도를 높여야 글자가 또렷합니다.
									</FieldHint>
								</div>
							) : null}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>문구</CardTitle>
							<CardDescription>
								{slotLayout.texts.length}/{AD_BANNER_MAX_BLOCKS}개 · 목록에서
								고르면 아래에서 편집합니다.
							</CardDescription>
							<CardAction>
								<Button
									disabled={!canAddBlock}
									onClick={handleAddBlock}
									size="sm"
									variant="outline"
								>
									<Plus data-icon="inline-start" />
									추가
								</Button>
							</CardAction>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{slotLayout.texts.length === 0 ? (
								<Empty>
									<EmptyHeader>
										<EmptyTitle>아직 문구가 없습니다</EmptyTitle>
										<EmptyDescription>
											문구를 추가하면 캔버스에서 위치와 폭을 자유롭게 잡을 수
											있습니다. 추가하지 않으면 이미지만 그대로 노출됩니다.
										</EmptyDescription>
									</EmptyHeader>
									<EmptyContent>
										<Button onClick={handleAddBlock} variant="outline">
											<Plus data-icon="inline-start" />첫 문구 추가
										</Button>
									</EmptyContent>
								</Empty>
							) : (
								// 캔버스에서 겹친 블록은 클릭으로 고르기 어렵다. 목록이 확실한 경로다.
								<ul className="flex flex-col gap-1">
									{slotLayout.texts.map((block, index) => (
										<li key={block.id}>
											<Button
												aria-pressed={block.id === selectedId}
												className="w-full justify-start overflow-hidden"
												onClick={() => setSelectedId(block.id)}
												variant={
													block.id === selectedId ? "secondary" : "ghost"
												}
											>
												<Type data-icon="inline-start" />
												<span className="min-w-0 truncate">
													{block.content.trim() ||
														`문구 ${index + 1} (비어 있음)`}
												</span>
											</Button>
										</li>
									))}
								</ul>
							)}

							{selectedBlock ? (
								<>
									<Separator />
									<EditorBlockPanel
										background={slotLayout.background}
										block={selectedBlock}
										contentRef={contentInputRef}
										error={
											saveError?.field === "text" ? saveError.message : null
										}
										onChange={handleBlockChange}
										onDelete={handleDeleteBlock}
										scrimEnabled={slotLayout.scrim.enabled}
									/>
								</>
							) : null}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

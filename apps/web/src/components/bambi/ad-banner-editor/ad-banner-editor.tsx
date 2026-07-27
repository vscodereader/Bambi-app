"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
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
import { Plus, TriangleAlert, Type } from "lucide-react";
import type { RefObject } from "react";
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
	formatAdBannerBlockLabel,
} from "@/lib/bambi/ad-banner-layout";
import {
	findJobAdBannerRejection,
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

// 이미지 슬롯이 "등록할 수 없습니다"라고 띄우는 사유(비율·최소 크기)는 실제 반려 사유다.
// 저장 가드가 존재 여부만 보면, 경고를 무시하고 저장한 뒤 공고 제출 시점에 다른 창의 다른
// 문구로 막히게 된다 — 이 리디자인이 없애려던 흐름이다. 빈 문구와 같은 자리에서 잡는다.
const REJECTION_MESSAGES: Record<"aspect" | "size", string> = {
	aspect: "비율이 규격과 크게 달라 등록할 수 없습니다.",
	size: "최소 크기보다 작아 등록할 수 없습니다.",
};

const findRejectedImage = (
	media: AdBannerEditorMedia
): { message: string; slot: AdBannerSlot } | null => {
	for (const slot of SLOT_ORDER) {
		const { mediaKey, usage } = SLOT_META[slot];
		const item = media[mediaKey];
		const rejection = findJobAdBannerRejection({
			height: item?.height,
			usage,
			width: item?.width,
		});

		if (rejection) {
			return {
				message: `${JOB_AD_BANNER_SPECS[usage].label} 이미지는 ${REJECTION_MESSAGES[rejection]} 다른 이미지로 바꿔 주십시오.`,
				slot,
			};
		}
	}

	return null;
};

// 배너 에디터. window·postMessage를 모르는 순수 컴포넌트다 — 팝업·다이얼로그 껍데기가 각자
// 방식으로 onSave·onCancel을 채운다. 배경 이미지는 initialMedia 하나에서만 온다: 배경 URL을
// 따로 받으면 "패널에서 고른 이미지"와 "캔버스가 그리는 이미지"가 갈린다.
export function AdBannerEditor({
	closeRequestRef,
	initialLayout,
	initialMedia,
	onCancel,
	onSave,
	requiredUsages,
}: {
	// 껍데기(팝업 창·다이얼로그)가 자기 닫기 경로(X 버튼·Esc·백드롭)를 여기로 흘려보내는
	// 통로. 편집 상태는 전부 이 컴포넌트 안에 있어 "변경됐는지"를 아는 곳도 여기뿐이다 —
	// 껍데기마다 확인 창을 따로 두면 세 곳에서 갈린다.
	closeRequestRef?: RefObject<(() => void) | null>;
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
	const [isDiscardOpen, setIsDiscardOpen] = useState(false);
	// 저장 가드가 잡은 사유. 토스트로만 알리면 스크롤 밖의 어느 칸이 문제인지 알 수 없어,
	// 문제가 난 자리 옆에 붙이고 그 컨트롤로 포커스를 옮긴다.
	const [saveError, setSaveError] = useState<{
		field: "image" | "text";
		message: string;
	} | null>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const contentInputRef = useRef<HTMLInputElement>(null);

	// 편집 시작 시점의 값. initialLayout은 런처가 매 렌더 새로 만들 수 있어(layout이 null이면
	// createEmptyAdBannerLayout()) prop을 그대로 비교하면 항상 "변경됨"이 된다. useState로 첫
	// 렌더의 값을 붙들어 둔다.
	const [initial] = useState(() => ({
		layout: initialLayout,
		media: initialMedia,
	}));
	// setLayout·setMedia는 사용자가 실제로 손댈 때만 불리고 매번 새 객체를 만든다. 참조 비교로
	// "한 번이라도 편집했는가"가 정확히 잡힌다(직접 원래대로 되돌린 경우만 과탐지 — 확인을 한 번
	// 더 받는 쪽이라 안전하다).
	const isDirty = layout !== initial.layout || media !== initial.media;

	// 탭 닫기·새로고침·OS 창 닫기. 공용 useUnsavedChangesWarning 대신 직접 거는 이유: 저장과
	// "버리고 닫기"는 같은 틱에 window.close()를 부르므로 상태로는 경고를 끌 수 없다(리렌더가
	// 늦어 이미 답한 질문을 브라우저가 한 번 더 묻는다). 리스너가 보는 ref를 떠나기 직전에 내린다.
	const warnOnUnloadRef = useRef(true);

	useEffect(() => {
		if (!isDirty) {
			return;
		}

		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!warnOnUnloadRef.current) {
				return;
			}

			event.preventDefault();
			event.returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [isDirty]);

	// 껍데기가 창·다이얼로그를 닫는 경로로 넘기기 직전에 거친다.
	const leave = (close: () => void) => {
		warnOnUnloadRef.current = false;
		close();
	};

	const requestClose = () => {
		if (isDirty) {
			setIsDiscardOpen(true);
			return;
		}

		leave(onCancel);
	};

	// 껍데기가 부르는 시점의 최신 requestClose를 넘겨야 한다. 의존성 배열 없이 매 렌더 갱신한다.
	useEffect(() => {
		if (!closeRequestRef) {
			return;
		}

		closeRequestRef.current = requestClose;

		return () => {
			closeRequestRef.current = null;
		};
	});

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

		const rejected = findRejectedImage(media);

		if (rejected) {
			setSlot(rejected.slot);
			setSaveError({ field: "image", message: rejected.message });
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
		leave(() => onSave({ layout, media }));
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
					<Button onClick={requestClose} type="button" variant="outline">
						취소
					</Button>
					<Button onClick={handleSave} type="button">
						저장
					</Button>
				</div>
			</div>

			{/* 이 화면의 상태는 전부 로컬이라 닫는 순간 이미지 두 장과 문구 좌표·색·굵기가
			    복구 불가로 사라진다. 손댄 적이 있을 때만 묻는다 — 아무것도 안 고쳤으면 그냥
			    닫혀야 한다. */}
			<AlertDialog onOpenChange={setIsDiscardOpen} open={isDiscardOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>편집 내용을 버릴까요?</AlertDialogTitle>
						<AlertDialogDescription>
							저장하지 않은 이미지와 문구 배치가 모두 사라집니다. 되돌릴 수
							없습니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>계속 편집</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setIsDiscardOpen(false);
								leave(onCancel);
							}}
							variant="destructive"
						>
							버리고 닫기
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

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
							<CardDescription className="text-pretty">
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
									{/* 래퍼에 opacity-50을 또 걸면 슬라이더 자신의
									    data-disabled:opacity-50과 곱해져 실효 0.25가 된다 — 꺼진
									    상태의 값이 거의 안 보인다. 흐리게 만드는 일은 슬라이더가
									    이미 한다. */}
									<div className="flex items-center gap-3">
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
										{/* 끄는 동안 매 프레임 바뀌는 숫자다. tabular-nums가 없으면
										    글리프 폭이 달라 값이 좌우로 흔들린다. */}
										<span className="w-10 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
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
							<CardDescription className="text-pretty tabular-nums">
								{slotLayout.texts.length}/{AD_BANNER_MAX_BLOCKS}개 · 목록에서
								고르면 아래에서 편집합니다.
							</CardDescription>
							<CardAction>
								<Button
									disabled={!canAddBlock}
									onClick={handleAddBlock}
									size="sm"
									type="button"
									variant="outline"
								>
									<Plus aria-hidden="true" data-icon="inline-start" />
									추가
								</Button>
							</CardAction>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{slotLayout.texts.length === 0 ? (
								<Empty>
									<EmptyHeader>
										<EmptyTitle>아직 문구가 없습니다</EmptyTitle>
										<EmptyDescription className="text-pretty">
											문구를 추가하면 캔버스에서 위치와 폭을 자유롭게 잡을 수
											있습니다. 추가하지 않으면 이미지만 그대로 노출됩니다.
										</EmptyDescription>
									</EmptyHeader>
									<EmptyContent>
										<Button
											onClick={handleAddBlock}
											type="button"
											variant="outline"
										>
											<Plus aria-hidden="true" data-icon="inline-start" />첫
											문구 추가
										</Button>
									</EmptyContent>
								</Empty>
							) : (
								// 캔버스에서 겹친 블록은 클릭으로 고르기 어렵다. 목록이 확실한 경로다.
								// 선택은 aria-pressed(토글)가 아니라 aria-current다 — 하나만 고를 수
								// 있고 같은 항목을 다시 눌러 해제할 수 없다.
								<ul className="flex flex-col gap-1">
									{slotLayout.texts.map((block, index) => (
										<li key={block.id}>
											<Button
												aria-current={
													block.id === selectedId ? "true" : undefined
												}
												className="w-full justify-start overflow-hidden"
												onClick={() => setSelectedId(block.id)}
												type="button"
												variant={
													block.id === selectedId ? "secondary" : "ghost"
												}
											>
												<Type aria-hidden="true" data-icon="inline-start" />
												<span className="min-w-0 truncate">
													{formatAdBannerBlockLabel(block, index)}
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

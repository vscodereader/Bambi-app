"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Slider } from "@bambi-app/ui/components/slider";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { Trash2, TriangleAlert } from "lucide-react";
import type { RefObject } from "react";
import { FieldHint } from "@/components/bambi/form-message";
import {
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_FONT_SIZE_MAX,
	AD_BANNER_FONT_SIZE_MIN,
	AD_BANNER_TEXT_ALIGN_OPTIONS,
	AD_BANNER_TEXT_MAX_LENGTH,
	AD_BANNER_TEXT_WEIGHT_OPTIONS,
	AD_BANNER_WIDTH_MAX,
	AD_BANNER_WIDTH_MIN,
	type AdBannerAnimation,
	type AdBannerSlotLayout,
	type AdBannerTextAlign,
	type AdBannerTextBlock,
	type AdBannerTextWeight,
	isLowContrast,
} from "@/lib/bambi/ad-banner-layout";

const toggleGroupClassName = "grid w-full grid-cols-3 gap-2";

// 선택된 블록의 속성 편집. 위치는 캔버스에서 끌거나 방향키로 옮긴다.
export function EditorBlockPanel({
	background,
	block,
	contentRef,
	error,
	onChange,
	onDelete,
	scrimEnabled,
}: {
	background: AdBannerSlotLayout["background"];
	block: AdBannerTextBlock;
	contentRef?: RefObject<HTMLInputElement | null>;
	error?: null | string;
	onChange: (patch: Partial<AdBannerTextBlock>) => void;
	onDelete: () => void;
	scrimEnabled: boolean;
}) {
	// 경고일 뿐 저장을 막지 않는다 — 배경 사진에 따라 성립하는 조합도 있다.
	const lowContrast =
		background.type === "color" && isLowContrast(background.color, block.color);
	const unprotectedImage = background.type === "image" && !scrimEnabled;
	const selectedAnimation = AD_BANNER_ANIMATION_OPTIONS.find(
		(option) => option.value === block.animation
	);
	const contentId = `block-content-${block.id}`;
	const errorId = `${contentId}-error`;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<h3 className="font-medium text-sm">문구 속성</h3>
				<Button onClick={onDelete} size="sm" variant="ghost">
					<Trash2 data-icon="inline-start" />
					삭제
				</Button>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor={contentId}>문구</Label>
				<Input
					aria-describedby={error ? errorId : undefined}
					aria-invalid={error ? true : undefined}
					id={contentId}
					maxLength={AD_BANNER_TEXT_MAX_LENGTH}
					onChange={(event) => onChange({ content: event.target.value })}
					placeholder="주말 알바 급구"
					ref={contentRef}
					value={block.content}
				/>
				{/* 저장 가드가 잡은 사유는 토스트가 아니라 이 필드 옆에서 읽혀야 한다. */}
				<div aria-live="polite" className="empty:hidden">
					{error ? (
						<p className="text-destructive text-xs" id={errorId}>
							{error}
						</p>
					) : null}
				</div>
				<FieldHint>{AD_BANNER_TEXT_MAX_LENGTH}자 이내.</FieldHint>
			</div>

			{/* 숫자 입력이던 값은 슬라이더로 바꿨다 — 입력을 비우면 즉시 최솟값으로 튀어
			    "지우고 다시 쓰기"가 안 됐다. 방향키(1씩)로 정확한 값도 그대로 맞출 수 있다. */}
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<span className="font-medium text-sm">글자 크기</span>
					<span className="text-muted-foreground text-xs">
						{block.fontSize}%
					</span>
				</div>
				<Slider
					aria-label="글자 크기"
					max={AD_BANNER_FONT_SIZE_MAX}
					min={AD_BANNER_FONT_SIZE_MIN}
					onValueChange={(value) => onChange({ fontSize: value })}
					value={block.fontSize}
				/>
				<FieldHint>배너 폭 대비 %라 슬롯 크기에 맞춰 늘어납니다.</FieldHint>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<span className="font-medium text-sm">문구 폭</span>
					<span className="text-muted-foreground text-xs">{block.width}%</span>
				</div>
				<Slider
					aria-label="문구 폭"
					max={AD_BANNER_WIDTH_MAX}
					min={AD_BANNER_WIDTH_MIN}
					onValueChange={(value) => onChange({ width: value })}
					value={block.width}
				/>
				<FieldHint>
					배너 폭 대비 %입니다. 이 폭 안에서 줄바꿈되고 정렬이 적용됩니다.
					캔버스에 선택된 문구의 좌우 손잡이로도 조절할 수 있습니다.
				</FieldHint>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor={`block-color-${block.id}`}>글자 색</Label>
				<Input
					className="h-9 p-1"
					id={`block-color-${block.id}`}
					onChange={(event) => onChange({ color: event.target.value })}
					type="color"
					value={block.color}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<span className="font-medium text-sm">굵기</span>
				<ToggleGroup
					aria-label="굵기"
					className={toggleGroupClassName}
					onValueChange={(next: string[]) =>
						onChange({
							weight: (next.at(-1) ?? block.weight) as AdBannerTextWeight,
						})
					}
					value={[block.weight]}
					variant="outline"
				>
					{AD_BANNER_TEXT_WEIGHT_OPTIONS.map((option) => (
						<ToggleGroupItem key={option.value} value={option.value}>
							{option.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div className="flex flex-col gap-2">
				<span className="font-medium text-sm">정렬</span>
				<ToggleGroup
					aria-label="정렬"
					className={toggleGroupClassName}
					onValueChange={(next: string[]) =>
						onChange({
							align: (next.at(-1) ?? block.align) as AdBannerTextAlign,
						})
					}
					value={[block.align]}
					variant="outline"
				>
					{AD_BANNER_TEXT_ALIGN_OPTIONS.map((option) => (
						<ToggleGroupItem key={option.value} value={option.value}>
							{option.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div className="flex flex-col gap-2">
				<span className="font-medium text-sm">연출</span>
				<ToggleGroup
					aria-label="연출"
					className="grid w-full grid-cols-2 gap-2"
					onValueChange={(next: string[]) =>
						onChange({
							animation: (next.at(-1) ?? null) as AdBannerAnimation | null,
						})
					}
					value={block.animation ? [block.animation] : []}
					variant="outline"
				>
					{AD_BANNER_ANIMATION_OPTIONS.map((option) => (
						<ToggleGroupItem key={option.value} value={option.value}>
							{option.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				{/* 이름만 보고는 "글리치"가 뭔지 알 수 없다. 고른 연출의 설명을 붙인다. */}
				{selectedAnimation ? (
					<FieldHint>{selectedAnimation.description}</FieldHint>
				) : null}
				<FieldHint>
					고른 연출을 다시 누르면 해제됩니다. 편집 화면에서는 연출을 재생하지
					않습니다.
				</FieldHint>
			</div>

			{lowContrast ? (
				<Alert variant="warning">
					<TriangleAlert />
					<AlertDescription>
						이 조합은 읽기 어려울 수 있습니다. 배경색이나 글자색을 바꿔 주세요.
					</AlertDescription>
				</Alert>
			) : null}

			{unprotectedImage ? (
				<Alert variant="warning">
					<TriangleAlert />
					<AlertDescription>
						사진에 따라 글자가 안 보일 수 있습니다. 어두운 오버레이를 켜면
						안정적입니다.
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	);
}

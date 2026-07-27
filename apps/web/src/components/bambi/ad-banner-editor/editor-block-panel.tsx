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
import { AdBannerText } from "@/components/bambi/ad-banner-text";
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
	resolveAdBannerScrimColor,
} from "@/lib/bambi/ad-banner-layout";

const toggleGroupClassName = "grid w-full grid-cols-3 gap-2";

// 미리보기는 연출만 보여 준다. 구인자가 쓴 문구를 그대로 쓰면 길이에 따라 상자가 늘었다 줄고,
// 한 글자짜리 문구에서는 타이핑·글자 분리가 뭉개져 무엇이 다른지 알 수 없다.
const ANIMATION_PREVIEW_TEXT = "밤비알바";

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
	// 글리치는 pseudo 배경색이 효과의 부품이라 실제 배너와 같은 색을 넘겨야 한다.
	// 미리보기 상자의 배경도 같은 색으로 칠해야 잔상이 상자 위에 뜬 얼룩으로 보이지 않는다.
	const scrimColor = resolveAdBannerScrimColor(background);
	const contentId = `block-content-${block.id}`;
	const errorId = `${contentId}-error`;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-pretty font-medium text-sm">문구 속성</h3>
				<Button onClick={onDelete} size="sm" type="button" variant="ghost">
					<Trash2 aria-hidden="true" data-icon="inline-start" />
					삭제
				</Button>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor={contentId}>문구</Label>
				<Input
					aria-describedby={error ? errorId : undefined}
					aria-invalid={error ? true : undefined}
					autoComplete="off"
					id={contentId}
					maxLength={AD_BANNER_TEXT_MAX_LENGTH}
					onChange={(event) => onChange({ content: event.target.value })}
					placeholder="주말 알바 급구…"
					ref={contentRef}
					value={block.content}
				/>
				{/* 저장 가드가 잡은 사유는 토스트가 아니라 이 필드 옆에서 읽혀야 한다.
				    empty:hidden을 걸면 리전이 갱신 순간 display:none이라 스크린리더가 삽입을
				    놓친다 — 빈 채로 늘 렌더해 두고 자식만 조건부로 둔다. */}
				<div aria-live="polite">
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
					{/* 슬라이더를 끄는 동안 매 프레임 바뀌는 숫자다. tabular-nums가 없으면 자릿수가
					    같아도 글리프 폭이 달라 값이 좌우로 흔들린다. */}
					<span className="text-muted-foreground text-xs tabular-nums">
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
					<span className="text-muted-foreground text-xs tabular-nums">
						{block.width}%
					</span>
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
				{/* 이름만 보고는 "글리치"가 뭔지 알 수 없다. 고른 연출의 설명을 붙인다.
				    이 설명이 미리보기의 대체 텍스트 역할도 한다 — 미리보기 상자는 aria-hidden이다. */}
				{selectedAnimation ? (
					<FieldHint>{selectedAnimation.description}</FieldHint>
				) : null}
				{/* 연출을 해제해도 상자를 지우지 않는다 — 켤 때마다 패널 높이가 튀어 아래 경고가 밀린다.
				    연출이 없으면 같은 자리에 정적 문구가 남아 "연출 없음"이 그대로 보인다.
				    key로 연출이 바뀔 때마다 리마운트해 새 연출을 처음부터 재생시킨다(글자 색만 바꿀
				    때는 key가 그대로라 재생 중인 연출이 끊기지 않는다).
				    화면 낭독기에는 "밤비알바"가 정보가 아니라 소음이다 — 위 설명 문구가 대신한다. */}
				<div
					aria-hidden="true"
					className="flex min-h-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-[var(--preview-bg)] p-3 text-center"
					style={
						{
							"--preview-bg": scrimColor,
							"--preview-color": block.color,
						} as React.CSSProperties
					}
				>
					<AdBannerText
						animation={block.animation}
						className="break-words font-bold text-[color:var(--preview-color)] text-lg"
						key={block.animation ?? "none"}
						scrimColor={scrimColor}
						text={ANIMATION_PREVIEW_TEXT}
					/>
				</div>
				<FieldHint>
					고른 연출을 다시 누르면 해제됩니다. 미리보기는 실제 문구 대신
					‘밤비알바’로 움직임만 보여 줍니다.
				</FieldHint>
			</div>

			{lowContrast ? (
				<Alert variant="warning">
					<TriangleAlert aria-hidden="true" />
					<AlertDescription className="text-pretty">
						이 조합은 읽기 어려울 수 있습니다. 배경색이나 글자색을 바꿔
						주십시오.
					</AlertDescription>
				</Alert>
			) : null}

			{unprotectedImage ? (
				<Alert variant="warning">
					<TriangleAlert aria-hidden="true" />
					<AlertDescription className="text-pretty">
						사진에 따라 글자가 안 보일 수 있습니다. 어두운 오버레이를 켜면
						안정적입니다.
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	);
}

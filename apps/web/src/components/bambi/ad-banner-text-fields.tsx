"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Input } from "@bambi-app/ui/components/input";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { TriangleAlert } from "lucide-react";
import Image from "next/image";
import { FieldHint, FieldLabel } from "@/components/bambi/form-message";
import {
	AD_BANNER_ANIMATION_OPTIONS,
	AD_BANNER_HEADLINE_MAX_LENGTH,
	AD_BANNER_SUBLINE_MAX_LENGTH,
	AD_BANNER_THEME_OPTIONS,
	AD_BANNER_VERTICAL_TEXT_MAX_LENGTH,
	type AdBannerAnimation,
	type AdBannerTheme,
} from "@/lib/bambi/ad-banner-animations";
import type { AdBannerTextConfig } from "@/lib/bambi/api-job-mapper";
import type { JobAdBannerTextForm } from "@/lib/bambi-job-form";
import { AdBannerTextOverlay } from "./ad-banner-text-overlay";

// 카드형 토글: 연출 설명이 길어 줄바꿈을 허용하고, 그리드 행 안에서 높이를 맞춘다
// (job-exposure-fields의 상품 카드와 같은 규칙).
const toggleItemClassName =
	"h-full min-h-14 w-full min-w-0 flex-col items-start justify-start gap-1 whitespace-normal px-3 py-2 text-left";

// 배너 문구·연출 입력. 프리미엄 상품을 골랐을 때만 렌더된다(호출부가 판단하며, 배너 업로드
// 슬롯과 같은 조건이다). 오른쪽에 실제 렌더 컴포넌트를 그대로 쓴 미리보기를 붙여 구인자가
// 저장 전에 결과를 본다 — 폼 상태를 그대로 쓰므로 미리보기와 실제 배너가 어긋날 수 없다.
export function AdBannerTextFields({
	onChange,
	previewImageUrl,
	value,
}: {
	onChange: (value: JobAdBannerTextForm) => void;
	previewImageUrl: { horizontal?: string; vertical?: string };
	value: JobAdBannerTextForm;
}) {
	const update = (patch: Partial<JobAdBannerTextForm>) => {
		onChange({ ...value, ...patch });
	};
	// 오버레이가 받는 모양으로만 바꾼다(값은 그대로). 빈 문자열은 오버레이에서 falsy라
	// 문구 없음으로 취급된다 — 서버도 공백을 null로 정규화한다.
	const previewConfig: AdBannerTextConfig = {
		animation: value.adBannerAnimation,
		headline: value.adBannerHeadline,
		subline: value.adBannerSubline,
		theme: value.adBannerTheme,
		verticalText: value.adBannerVerticalText,
	};
	// light 테마는 흰 스크림 + shiny 연출은 흰 글자 고정이라 겹치면 글자가 사실상 사라진다.
	// 조합 자체를 막지는 않는다(배경 이미지가 어두우면 성립할 수 있고, 바로 아래 미리보기로
	// 확인된다) — 대신 왜 안 보이는지 알려 준다.
	const isLowContrastCombo =
		value.adBannerTheme === "light" && value.adBannerAnimation === "shiny";

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm">배너 문구·연출</h2>
				<FieldHint>
					배너 이미지 위에 얹을 문구입니다. 비워두면 이미지만 노출됩니다.
				</FieldHint>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<div className="flex flex-col gap-2">
					<FieldLabel htmlFor="adBannerHeadline" optional>
						배너 메인 문구
					</FieldLabel>
					<Input
						id="adBannerHeadline"
						maxLength={AD_BANNER_HEADLINE_MAX_LENGTH}
						onChange={(event) =>
							update({ adBannerHeadline: event.target.value })
						}
						placeholder="주말 알바 급구"
						value={value.adBannerHeadline}
					/>
					<FieldHint>
						가로형 배너에 크게 노출됩니다. {AD_BANNER_HEADLINE_MAX_LENGTH}자
						이내.
					</FieldHint>
				</div>

				<div className="flex flex-col gap-2">
					<FieldLabel htmlFor="adBannerSubline" optional>
						배너 보조 문구
					</FieldLabel>
					<Input
						id="adBannerSubline"
						maxLength={AD_BANNER_SUBLINE_MAX_LENGTH}
						onChange={(event) =>
							update({ adBannerSubline: event.target.value })
						}
						placeholder="당일 지급 · 초보 환영"
						value={value.adBannerSubline}
					/>
					<FieldHint>
						메인 문구 아래 작게 붙습니다. {AD_BANNER_SUBLINE_MAX_LENGTH}자 이내.
					</FieldHint>
				</div>

				<div className="flex flex-col gap-2">
					<FieldLabel htmlFor="adBannerVerticalText" optional>
						세로형 배너 문구
					</FieldLabel>
					<Input
						id="adBannerVerticalText"
						maxLength={AD_BANNER_VERTICAL_TEXT_MAX_LENGTH}
						onChange={(event) =>
							update({ adBannerVerticalText: event.target.value })
						}
						placeholder="주말 급구"
						value={value.adBannerVerticalText}
					/>
					<FieldHint>
						우측 세로 배너는 폭이 좁아 별도 문구를 씁니다.
						{AD_BANNER_VERTICAL_TEXT_MAX_LENGTH}자 이내.
					</FieldHint>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="adBannerAnimation" optional>
					문구 연출
				</FieldLabel>
				<ToggleGroup
					aria-label="문구 연출"
					className="grid w-full grid-cols-1 items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-3"
					id="adBannerAnimation"
					onValueChange={(next: string[]) =>
						update({
							adBannerAnimation: (next.at(-1) ??
								null) as AdBannerAnimation | null,
						})
					}
					value={value.adBannerAnimation ? [value.adBannerAnimation] : []}
					variant="outline"
				>
					{AD_BANNER_ANIMATION_OPTIONS.map((option) => (
						<ToggleGroupItem
							className={toggleItemClassName}
							key={option.value}
							value={option.value}
						>
							<span className="w-full break-words font-medium text-sm">
								{option.label}
							</span>
							<span className="w-full break-words text-muted-foreground text-xs">
								{option.description}
							</span>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="adBannerTheme" optional>
					배너 테마
				</FieldLabel>
				<ToggleGroup
					aria-label="배너 테마"
					className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
					id="adBannerTheme"
					onValueChange={(next: string[]) =>
						update({
							adBannerTheme: (next.at(-1) ?? null) as AdBannerTheme | null,
						})
					}
					value={value.adBannerTheme ? [value.adBannerTheme] : []}
					variant="outline"
				>
					{AD_BANNER_THEME_OPTIONS.map((option) => (
						<ToggleGroupItem key={option.value} value={option.value}>
							{option.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{isLowContrastCombo ? (
				<Alert variant="warning">
					<TriangleAlert />
					<AlertDescription>
						밝은 오버레이 + 반짝임은 흰 배경에 흰 글자라 문구가 거의 보이지
						않습니다. 어두운 오버레이나 다른 연출을 골라 주세요.
					</AlertDescription>
				</Alert>
			) : null}

			<div className="flex flex-col gap-2">
				<span className="font-medium text-sm">미리보기</span>
				<div className="flex flex-col items-start gap-4 sm:flex-row">
					<div className="relative aspect-[7/3] w-full max-w-80 overflow-hidden rounded-lg border border-border bg-muted">
						{previewImageUrl.horizontal ? (
							<Image
								alt=""
								className="object-cover"
								fill
								sizes="20rem"
								src={previewImageUrl.horizontal}
								unoptimized
							/>
						) : null}
						<AdBannerTextOverlay config={previewConfig} variant="horizontal" />
					</div>
					{/* 실제 우측 슬롯과 같은 h-52·4:9라 약 92px 폭 제약이 그대로 재현된다. */}
					<div className="relative aspect-[4/9] h-52 overflow-hidden rounded-lg border border-border bg-muted">
						{previewImageUrl.vertical ? (
							<Image
								alt=""
								className="object-cover"
								fill
								sizes="6rem"
								src={previewImageUrl.vertical}
								unoptimized
							/>
						) : null}
						<AdBannerTextOverlay config={previewConfig} variant="vertical" />
					</div>
				</div>
			</div>
		</div>
	);
}

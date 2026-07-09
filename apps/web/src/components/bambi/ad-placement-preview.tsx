"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { cn } from "@bambi-app/ui/lib/utils";
import { AdBanner, HorizontalAdBanner, SAMPLE_BANNERS } from "./ad-banner";

// /seeker 실제 슬롯을 축소 재현한 위치 미리보기의 템플릿 ID.
// 스키마 pgEnum(ad_preview_template)과 동일 값·순서를 유지한다(단일 소스).
export type PreviewTemplate =
	| "premium-top"
	| "special-list"
	| "urgent-list"
	| "recommended-list"
	| "side-vertical"
	| "side-horizontal"
	| "none";

export const PREVIEW_TEMPLATE_LABELS: Record<PreviewTemplate, string> = {
	"premium-top": "상단 프리미엄 배너",
	"special-list": "스페셜 채용 노출",
	"urgent-list": "급구 채용 노출",
	"recommended-list": "추천 채용 노출",
	"side-vertical": "우측 세로 배너",
	"side-horizontal": "좌측 가로 배너",
	none: "미리보기 없음",
};

// Select 등에서 쓰는 옵션 배열(라벨과 동일 순서).
export const PREVIEW_TEMPLATE_OPTIONS: {
	value: PreviewTemplate;
	label: string;
}[] = [
	{ value: "premium-top", label: PREVIEW_TEMPLATE_LABELS["premium-top"] },
	{ value: "special-list", label: PREVIEW_TEMPLATE_LABELS["special-list"] },
	{ value: "urgent-list", label: PREVIEW_TEMPLATE_LABELS["urgent-list"] },
	{
		value: "recommended-list",
		label: PREVIEW_TEMPLATE_LABELS["recommended-list"],
	},
	{ value: "side-vertical", label: PREVIEW_TEMPLATE_LABELS["side-vertical"] },
	{
		value: "side-horizontal",
		label: PREVIEW_TEMPLATE_LABELS["side-horizontal"],
	},
	{ value: "none", label: PREVIEW_TEMPLATE_LABELS.none },
];

// 리스트 슬롯 톤 — /seeker 유료 노출 사다리(스페셜>급구>추천)의 액센트·섹션명과 일치.
type ListTone = "special" | "urgent" | "recommended";

const LIST_TONE_ACCENT: Record<ListTone, string> = {
	special: "bg-coral-500",
	urgent: "bg-amber-500",
	recommended: "bg-sky-400",
};

const LIST_TONE_BORDER: Record<ListTone, string> = {
	special: "border-coral-200",
	urgent: "border-amber-200",
	recommended: "border-sky-200",
};

const LIST_SECTION_LABEL: Record<ListTone, string> = {
	special: "스페셜 채용",
	urgent: "급구 채용",
	recommended: "추천 채용",
};

// 실제 VisualJobCard(Job+핸들러 필요) 대신 슬롯 실루엣만 재현한 경량 미니카드.
function MiniJobCard({
	tone,
	highlighted,
}: {
	tone: ListTone;
	highlighted?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 rounded-lg border p-2",
				LIST_TONE_BORDER[tone],
				highlighted && "ring-2 ring-coral-200"
			)}
		>
			<div className="h-10 w-full rounded-md bg-muted" />
			<div className="h-2 w-3/4 rounded-full bg-muted" />
			<div className="h-2 w-1/2 rounded-full bg-muted" />
			<div className="h-3 w-12 rounded-full bg-muted" />
		</div>
	);
}

// 리스트형 슬롯: 액센트 바 헤더 + 미니카드 2개(1개는 coral 링으로 강조).
function ListPreview({ tone }: { tone: ListTone }) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className={cn("h-4 w-1 rounded-full", LIST_TONE_ACCENT[tone])}
				/>
				<span className="font-semibold text-foreground text-sm">
					{LIST_SECTION_LABEL[tone]}
				</span>
				<Badge>이 자리</Badge>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<MiniJobCard highlighted tone={tone} />
				<MiniJobCard tone={tone} />
			</div>
		</div>
	);
}

// premium-top: 상단 프리미엄 가로 배너 그리드.
function PremiumTopPreview() {
	return (
		<div className="grid grid-cols-2 gap-2">
			<HorizontalAdBanner adKey="preview-premium-1" />
			<HorizontalAdBanner adKey="preview-premium-2" />
			<HorizontalAdBanner adKey="preview-premium-3" />
			<HorizontalAdBanner adKey="preview-premium-4" />
		</div>
	);
}

// side-horizontal: 좌측 사이드의 가로 배너 세로 스택.
function SideHorizontalPreview() {
	return (
		<div className="flex flex-col gap-2">
			<HorizontalAdBanner adKey="preview-side-h-1" />
			<HorizontalAdBanner adKey="preview-side-h-2" />
		</div>
	);
}

// side-vertical: 우측 사이드의 세로 배너 스택(미니 크기로 축소).
function SideVerticalPreview() {
	return (
		<div className="flex flex-col items-start gap-2">
			<AdBanner
				className="h-28"
				seed={SAMPLE_BANNERS[0]}
				src={SAMPLE_BANNERS[0]}
			/>
			<AdBanner
				className="h-28"
				seed={SAMPLE_BANNERS[1]}
				src={SAMPLE_BANNERS[1]}
			/>
		</div>
	);
}

function PreviewBody({
	template,
}: {
	template: Exclude<PreviewTemplate, "none">;
}) {
	switch (template) {
		case "premium-top":
			return <PremiumTopPreview />;
		case "side-horizontal":
			return <SideHorizontalPreview />;
		case "side-vertical":
			return <SideVerticalPreview />;
		case "special-list":
			return <ListPreview tone="special" />;
		case "urgent-list":
			return <ListPreview tone="urgent" />;
		case "recommended-list":
			return <ListPreview tone="recommended" />;
		default:
			return null;
	}
}

// 이 광고가 /seeker 사이트 어디에 게시되는지 축소 재현해 보여주는 미니 목업.
export function AdPlacementPreview({
	template,
}: {
	template: PreviewTemplate;
}) {
	if (template === "none") {
		return null;
	}

	const isSide = template === "side-vertical" || template === "side-horizontal";

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
			<p className="font-semibold text-coral-600 text-xs">
				{PREVIEW_TEMPLATE_LABELS[template]}
				{isSide ? (
					<span className="ml-1 font-normal text-muted-foreground">
						· 넓은 화면에서 노출
					</span>
				) : null}
			</p>
			<PreviewBody template={template} />
		</div>
	);
}

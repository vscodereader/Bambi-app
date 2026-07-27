"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type {
	AdBannerLayout,
	AdBannerSlot,
	AdBannerSlotLayout,
	AdBannerTextBlock,
} from "@/lib/bambi/ad-banner-layout";
import { AdBannerText } from "./ad-banner-text";

const WEIGHT_CLASS_NAMES = {
	bold: "font-bold",
	extrabold: "font-extrabold",
	normal: "font-normal",
} as const;

const ALIGN_CLASS_NAMES = {
	center: "text-center",
	left: "text-left",
	right: "text-right",
} as const;

// 글리치는 pseudo 요소에 배경색을 깔아야 효과가 성립한다. 색 배경이면 그 색을, 이미지 배경이면
// 스크림 색을 넘긴다(스크림이 꺼져 있어도 글리치가 뭉개지지 않도록 어두운 기본값을 준다).
// 기본값은 아래 스크림이 쓰는 bg-ink-900과 같은 토큰이라 스크림이 켜져 있으면 색이 맞아떨어진다.
const resolveScrimColor = (
	background: AdBannerSlotLayout["background"]
): string =>
	background.type === "color" ? background.color : "var(--ink-900)";

function TextBlockView({
	block,
	scrimColor,
	shadowed,
}: {
	block: AdBannerTextBlock;
	scrimColor: string;
	shadowed: boolean;
}) {
	return (
		<div
			className={cn(
				"absolute top-[var(--block-y)] left-[var(--block-x)] max-w-full -translate-x-1/2 -translate-y-1/2",
				ALIGN_CLASS_NAMES[block.align],
				WEIGHT_CLASS_NAMES[block.weight]
			)}
			// 좌표·크기·색은 구인자가 정한 런타임 값이라 Tailwind 클래스로 표현할 수 없다.
			// CSS 변수 주입에만 한정한다(배치·크기 적용은 전부 위 className이 한다).
			style={
				{
					"--block-color": block.color,
					"--block-size": `${block.fontSize}cqw`,
					"--block-x": `${block.x}%`,
					"--block-y": `${block.y}%`,
				} as React.CSSProperties
			}
		>
			<AdBannerText
				animation={block.animation}
				className={cn(
					"text-[color:var(--block-color)] text-[length:var(--block-size)] leading-tight",
					// 사진 위에 스크림도 없이 얹히는 문구는 대비 하한이 아예 없다. 에디터가 경고만 하고
					// 저장은 막지 않으므로 그림자로 최소한의 윤곽을 만든다(스크림·단색 배경에서는
					// 대비가 이미 확보돼 있어 붙이지 않는다 — 괜히 탁해진다).
					shadowed && "drop-shadow-md"
				)}
				scrimColor={scrimColor}
				text={block.content}
			/>
		</div>
	);
}

// 슬롯 위에 얹는 자유 배치 레이아웃. 레이아웃이 없거나, 그릴 것이 하나도 없으면(문구 0개 +
// 이미지 배경) null을 돌려 호출부가 이미지만 그리게 한다 — 배너를 편집하지 않은 공고는 종전과
// 완전히 같은 결과다. 문구가 없어도 단색 배경은 그려야 한다: 에디터에서 지정한 색이 실제
// 배너에서만 사라지고 업로드 이미지가 그대로 나오는 불일치가 생긴다.
export function AdBannerLayoutRenderer({
	layout,
	slot,
}: {
	layout: AdBannerLayout | null;
	slot: AdBannerSlot;
}) {
	if (!layout) {
		return null;
	}

	const slotLayout = layout[slot];

	if (slotLayout.texts.length === 0 && slotLayout.background.type === "image") {
		return null;
	}

	const scrimColor = resolveScrimColor(slotLayout.background);
	// 스크림은 이미지 배경의 가독성 보조다. 색 배경에서는 색을 흐릴 뿐이라 무시한다.
	const showScrim =
		slotLayout.background.type === "image" && slotLayout.scrim.enabled;

	return (
		// @container가 cqw의 기준이다. 없으면 cqw가 엉뚱한 조상 컨테이너를 잡아 크기가 어긋난다.
		// pointer-events-none이라 아래 공고 상세 링크 클릭을 막지 않는다(자식까지 함께 적용된다).
		<div className="@container pointer-events-none absolute inset-0">
			{slotLayout.background.type === "color" ? (
				<div
					className="absolute inset-0 bg-[var(--slot-bg)]"
					style={
						{ "--slot-bg": slotLayout.background.color } as React.CSSProperties
					}
				/>
			) : null}
			{showScrim ? (
				// 불투명도는 0~100 백분율로 저장된다. CSS는 0~1이라 100으로 나눠야 한다 —
				// 그대로 넣으면 1 이상으로 클램프돼 이미지가 완전히 가려진다.
				<div
					className="absolute inset-0 bg-ink-900 opacity-[var(--scrim-opacity)]"
					style={
						{
							"--scrim-opacity": slotLayout.scrim.opacity / 100,
						} as React.CSSProperties
					}
				/>
			) : null}
			{slotLayout.texts.map((block) => (
				<TextBlockView
					block={block}
					key={block.id}
					scrimColor={scrimColor}
					shadowed={slotLayout.background.type === "image" && !showScrim}
				/>
			))}
		</div>
	);
}

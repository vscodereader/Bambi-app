// 배너 레이아웃 순수 로직(배경·스크림·문구 블록). 저장 형태·검증은 서버 zod
// (bambi-ad-banner-layout)가 유일한 방어선이라 그 타입을 그대로 재사용하고, 값·기본값·상한은
// 웹(apps/web/src/lib/bambi/ad-banner-layout.ts)과 1:1로 맞춘다 — 한쪽만 늘리면 서버가 반려한다.
import {
	AD_BANNER_ANIMATIONS,
	AD_BANNER_TEXT_ALIGNS,
	AD_BANNER_TEXT_WEIGHTS,
	type AdBannerLayoutInput,
} from "@bambi-app/api/services/bambi-ad-banner-layout";
import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";

import type { JobAdBannerUsage } from "@/src/lib/employer/ad-exposure";

// 슬롯 배경(이미지 위에 스크림, 또는 단색). 서버 스키마의 union을 그대로 쓴다.
export type NativeBannerBackground =
	AdBannerLayoutInput["horizontal"]["background"];
export type AdBannerSlot = "horizontal" | "vertical";
export type AdBannerSlotLayout = AdBannerLayoutInput["horizontal"];
export type AdBannerTextBlock = AdBannerSlotLayout["texts"][number];
export type AdBannerAnimation = (typeof AD_BANNER_ANIMATIONS)[number];
export type AdBannerTextAlign = (typeof AD_BANNER_TEXT_ALIGNS)[number];
export type AdBannerTextWeight = (typeof AD_BANNER_TEXT_WEIGHTS)[number];

// 웹 기본값과 같아야 한다: 스크림 65%, 단색 기본색 #1f2937, 글자색 흰색, 글자 크기 8%, 폭 60%.
const DEFAULT_SCRIM_OPACITY = 65;
export const DEFAULT_BANNER_BACKGROUND_COLOR = "#1f2937";
export const DEFAULT_BANNER_TEXT_COLOR = "#ffffff";
export const AD_BANNER_MAX_BLOCKS = 5;
export const AD_BANNER_TEXT_MAX_LENGTH = 40;
// 글자 크기·폭·좌표는 전부 슬롯 폭 대비 %다(고정 px는 슬롯 폭에 따라 넘친다).
export const AD_BANNER_FONT_SIZE_MIN = 2;
export const AD_BANNER_FONT_SIZE_MAX = 20;
const AD_BANNER_DEFAULT_FONT_SIZE = 8;
export const AD_BANNER_WIDTH_MIN = 10;
export const AD_BANNER_WIDTH_MAX = 100;
const AD_BANNER_DEFAULT_WIDTH = 60;
export const AD_BANNER_SCRIM_OPACITY_MIN = 0;
export const AD_BANNER_SCRIM_OPACITY_MAX = 100;
// 새 문구를 추가할 때마다 어긋나게 놓는 간격(%). 슬롯당 최대 5개라 마지막 블록도 캔버스 안이다.
const BLOCK_CASCADE_STEP = 6;

export const AD_BANNER_ANIMATION_LABELS: Record<AdBannerAnimation, string> = {
	blur: "블러 등장",
	glitch: "글리치",
	split: "글자 분리",
	typing: "타이핑",
};
export const AD_BANNER_ANIMATION_DESCRIPTIONS: Record<
	AdBannerAnimation,
	string
> = {
	blur: "흐릿하게 시작해 또렷해지며 나타납니다.",
	glitch: "화면 잡음처럼 글자가 흔들립니다.",
	split: "글자가 하나씩 아래에서 올라옵니다.",
	typing: "한 글자씩 입력되듯 나타납니다.",
};
export const AD_BANNER_TEXT_WEIGHT_LABELS: Record<AdBannerTextWeight, string> =
	{ bold: "굵게", extrabold: "매우 굵게", normal: "보통" };
export const AD_BANNER_TEXT_ALIGN_LABELS: Record<AdBannerTextAlign, string> = {
	center: "가운데",
	left: "왼쪽",
	right: "오른쪽",
};
// 토글 그룹용 선택지. 값 목록은 서버 카탈로그에서 오므로 값을 늘리면 서버·웹과 함께 늘려야 한다.
export const AD_BANNER_ANIMATION_OPTIONS = AD_BANNER_ANIMATIONS.map(
	(value) => ({
		label: AD_BANNER_ANIMATION_LABELS[value],
		value,
	})
);
export const AD_BANNER_TEXT_WEIGHT_OPTIONS = AD_BANNER_TEXT_WEIGHTS.map(
	(value) => ({ label: AD_BANNER_TEXT_WEIGHT_LABELS[value], value })
);
export const AD_BANNER_TEXT_ALIGN_OPTIONS = AD_BANNER_TEXT_ALIGNS.map(
	(value) => ({ label: AD_BANNER_TEXT_ALIGN_LABELS[value], value })
);
export const AD_BANNER_SLOT_LABELS: Record<AdBannerSlot, string> = {
	horizontal: "가로형",
	vertical: "세로형",
};

// usage(업로드 축) ↔ 슬롯(레이아웃 축) 대응. 서버·웹의 SLOT_FOR_USAGE와 같은 표다.
export const SLOT_FOR_USAGE = {
	ad_horizontal: "horizontal",
	ad_vertical: "vertical",
} as const satisfies Record<JobAdBannerUsage, AdBannerSlot>;

// 프리셋 색 팔레트. 새 라이브러리 없이 고를 수 있게 8색만 둔다. hex 직접 입력은 UI에서 받는다.
export const BANNER_COLOR_PRESETS = [
	"#1f2937",
	"#111827",
	"#0f172a",
	"#7c2d12",
	"#831843",
	"#4c1d95",
	"#065f46",
	"#374151",
] as const;

// 글자색 프리셋. 배경 프리셋이 전부 어두운 톤이라 밝은 색 위주로 둔다.
export const TEXT_COLOR_PRESETS = [
	"#ffffff",
	"#fde68a",
	"#fca5a5",
	"#f9a8d4",
	"#a5b4fc",
	"#6ee7b7",
	"#111827",
] as const;

const createEmptySlot = (): AdBannerSlotLayout => ({
	background: { type: "image" },
	scrim: { enabled: true, opacity: DEFAULT_SCRIM_OPACITY },
	texts: [],
});

// 배너를 편집한 적 없는 공고의 시작값. 렌더러는 이미지만 그린다 — 미편집 공고와 같은 결과다.
export const createEmptyBannerLayout = (): AdBannerLayoutInput => ({
	horizontal: createEmptySlot(),
	version: 1,
	vertical: createEmptySlot(),
});

// 슬롯 하나만 바꿔 되돌린다. 레이아웃이 없던 공고는 기본값에서 시작한다.
export const withSlot = (
	layout: AdBannerLayoutInput | null,
	slot: AdBannerSlot,
	patch: Partial<AdBannerSlotLayout>
): AdBannerLayoutInput => {
	const base = layout ?? createEmptyBannerLayout();

	return { ...base, [slot]: { ...base[slot], ...patch } };
};

// 고른 슬롯의 배경만 바꿔 되돌려 준다. 문구·스크림은 그대로 둔다.
export const withSlotBackground = (
	layout: AdBannerLayoutInput | null,
	usage: JobAdBannerUsage,
	background: NativeBannerBackground
): AdBannerLayoutInput =>
	withSlot(layout, SLOT_FOR_USAGE[usage], { background });

// 슬롯의 현재 배경. 레이아웃이 없으면 이미지 배경이 기본이다.
export const getSlotBackground = (
	layout: AdBannerLayoutInput | null,
	usage: JobAdBannerUsage
): NativeBannerBackground =>
	layout ? layout[SLOT_FOR_USAGE[usage]].background : { type: "image" };

// 이 슬롯의 배너 이미지가 실제로 필요한가. 단색 배경이면 렌더러가 색으로 덮어 업로드 이미지가
// 화면에 안 나오므로 필수가 아니다(웹 isAdBannerImageRequired와 같은 규칙). 레이아웃이 없으면
// (미편집 공고) 종전대로 필수다.
export const isBannerImageRequired = (
	layout: AdBannerLayoutInput | null,
	usage: JobAdBannerUsage
): boolean => getSlotBackground(layout, usage).type === "image";

// NaN만 따로 막는다. 드래그는 (dx / 슬롯 폭) × 100을 넘기는데 아직 레이아웃 전이라 폭이 0이면
// NaN이 나오고, 그대로 두면 JSON에서 null이 돼 서버 zod가 반려한다.
export const clampPercent = (value: number): number =>
	Number.isNaN(value) ? 50 : Math.min(100, Math.max(0, value));

const clampRange = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, Math.round(value)));

// 새 블록은 캔버스 중앙에서 개수만큼 어긋나게 놓는다 — 겹쳐 생기면 뒤 블록을 잡을 수 없다.
export const addTextBlock = (
	layout: AdBannerLayoutInput | null,
	slot: AdBannerSlot
): { block: AdBannerTextBlock; layout: AdBannerLayoutInput } => {
	const base = layout ?? createEmptyBannerLayout();
	const offset = base[slot].texts.length * BLOCK_CASCADE_STEP;
	const block: AdBannerTextBlock = {
		align: "center",
		animation: null,
		color: DEFAULT_BANNER_TEXT_COLOR,
		content: "새 문구",
		fontSize: AD_BANNER_DEFAULT_FONT_SIZE,
		// Hermes엔 crypto.randomUUID가 없다 — 설명 블록과 같은 폴백 헬퍼를 쓴다.
		id: generateChatMessageId(),
		weight: "bold",
		width: AD_BANNER_DEFAULT_WIDTH,
		x: clampPercent(50 + offset),
		y: clampPercent(50 + offset),
	};

	return {
		block,
		layout: withSlot(base, slot, { texts: [...base[slot].texts, block] }),
	};
};

export const removeTextBlock = (
	layout: AdBannerLayoutInput,
	slot: AdBannerSlot,
	id: string
): AdBannerLayoutInput =>
	withSlot(layout, slot, {
		texts: layout[slot].texts.filter((block) => block.id !== id),
	});

// 블록 속성 갱신. 숫자 범위는 여기서 접어 슬라이더·드래그가 각자 클램프하지 않게 한다.
// 글리치는 배경색이 효과의 부품이라 이미지 배경에서 고르면 스크림을 함께 켠다(웹과 같은 규칙).
export const updateTextBlock = (
	layout: AdBannerLayoutInput,
	slot: AdBannerSlot,
	id: string,
	patch: Partial<AdBannerTextBlock>
): AdBannerLayoutInput => {
	const slotLayout = layout[slot];
	const texts = slotLayout.texts.map((block) => {
		if (block.id !== id) {
			return block;
		}

		const next = { ...block, ...patch };

		return {
			...next,
			fontSize: clampRange(
				next.fontSize,
				AD_BANNER_FONT_SIZE_MIN,
				AD_BANNER_FONT_SIZE_MAX
			),
			width: clampRange(next.width, AD_BANNER_WIDTH_MIN, AD_BANNER_WIDTH_MAX),
			x: clampPercent(next.x),
			y: clampPercent(next.y),
		};
	});
	const forceScrim =
		patch.animation === "glitch" &&
		slotLayout.background.type === "image" &&
		!slotLayout.scrim.enabled;

	return withSlot(layout, slot, {
		scrim: forceScrim
			? { ...slotLayout.scrim, enabled: true }
			: slotLayout.scrim,
		texts,
	});
};

// 등록 직전 레이아웃 검사. 서버 zod는 빈 문구를 반려하는데 그 에러는 "공고를 등록하지 못했어요"
// 로만 보여 원인을 알 수 없다. 단색 배경에 문구가 없으면 배너가 빈 색 사각형이 된다 — 웹
// 에디터의 저장 가드와 같은 두 규칙을 여기서 먼저 잡는다. 검사 대상은 요구 슬롯만이다
// (리스팅 상품은 슬롯이 없어 레이아웃 잔재가 있어도 등록을 막지 않는다).
export const findBannerLayoutIssue = (
	layout: AdBannerLayoutInput | null,
	requiredUsages: readonly JobAdBannerUsage[]
): { message: string; slot: AdBannerSlot } | null => {
	if (!layout) {
		return null;
	}

	for (const usage of requiredUsages) {
		const slot = SLOT_FOR_USAGE[usage];
		const slotLayout = layout[slot];
		const label = AD_BANNER_SLOT_LABELS[slot];

		if (slotLayout.texts.some((block) => block.content.trim().length === 0)) {
			return {
				message: `${label} 배너에 내용이 빈 문구가 있어요. 채우거나 삭제해 주세요.`,
				slot,
			};
		}

		if (
			slotLayout.background.type === "color" &&
			slotLayout.texts.length === 0
		) {
			return {
				message: `${label} 배너가 단색 배경만 있고 문구가 없어 빈 색 사각형으로 노출돼요. 문구를 추가하거나 배경을 이미지로 바꿔 주세요.`,
				slot,
			};
		}
	}

	return null;
};

// hex를 6자리 소문자로 정규화. 트림·형식 검증을 여기서 다 한다(" #3f3f3f" 같은 값이 parseInt를
// 통과해 엉뚱한 휘도를 내지 않게).
const HEX_PREFIX = /^#/;
const SIX_HEX = /^[0-9a-f]{6}$/;

const relativeLuminance = (hex: string): number => {
	const value = hex.trim().replace(HEX_PREFIX, "").toLowerCase();

	if (!SIX_HEX.test(value)) {
		return Number.NaN;
	}

	const [r, g, b] = [0, 2, 4].map((offset) => {
		const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;

		return raw <= 0.039_28 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
	});

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG AA 본문 기준 4.5 미만이면 경고(저장은 막지 않는다). 읽을 수 없는 색은 대비 1로 보아
// 경고 쪽으로 판정한다 — NaN을 흘리면 비교가 전부 false가 되어 경고가 조용히 꺼진다.
export const isLowContrast = (background: string, text: string): boolean => {
	const a = relativeLuminance(background);
	const b = relativeLuminance(text);

	if (Number.isNaN(a) || Number.isNaN(b)) {
		return true;
	}

	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5;
};

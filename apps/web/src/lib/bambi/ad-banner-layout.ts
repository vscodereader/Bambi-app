// 프리미엄 광고 배너 레이아웃. 구인자가 에디터에서 만든 결과를 그대로 담는 형태이며,
// job_ad_banner_layout.layout(jsonb)에 이 구조로 저장된다. 서버 zod
// (packages/api/src/services/bambi-ad-banner-layout.ts)와 값·범위가 1:1로 일치해야 한다.

export type AdBannerAnimation = "split" | "typing" | "glitch" | "blur";
export type AdBannerTextWeight = "normal" | "bold" | "extrabold";
export type AdBannerTextAlign = "left" | "center" | "right";
export type AdBannerSlot = "horizontal" | "vertical";

export const AD_BANNER_ANIMATION_VALUES = [
	"split",
	"typing",
	"glitch",
	"blur",
] as const satisfies readonly AdBannerAnimation[];

export const AD_BANNER_ANIMATION_LABELS: Record<AdBannerAnimation, string> = {
	blur: "블러 등장",
	glitch: "글리치",
	split: "글자 분리",
	typing: "타이핑",
};

const AD_BANNER_ANIMATION_DESCRIPTIONS: Record<AdBannerAnimation, string> = {
	blur: "흐릿하게 시작해 또렷해지며 나타납니다.",
	glitch: "화면 잡음처럼 글자가 흔들립니다.",
	split: "글자가 하나씩 아래에서 올라옵니다.",
	typing: "한 글자씩 입력되듯 나타납니다.",
};

export const AD_BANNER_ANIMATION_OPTIONS = AD_BANNER_ANIMATION_VALUES.map(
	(value) => ({
		description: AD_BANNER_ANIMATION_DESCRIPTIONS[value],
		label: AD_BANNER_ANIMATION_LABELS[value],
		value,
	})
);

// 슬롯당 문구 상한. 무제한이면 검수·렌더 비용이 커진다.
export const AD_BANNER_MAX_BLOCKS = 5;
export const AD_BANNER_TEXT_MAX_LENGTH = 40;
// 폰트 크기는 컨테이너 폭 대비 백분율(cqw)이다. 고정 px는 슬롯 폭이 272~600px로 변할 때 넘친다.
export const AD_BANNER_FONT_SIZE_MIN = 2;
export const AD_BANNER_FONT_SIZE_MAX = 20;
export const AD_BANNER_DEFAULT_FONT_SIZE = 8;
export const AD_BANNER_DEFAULT_TEXT_COLOR = "#ffffff";
export const AD_BANNER_DEFAULT_BACKGROUND_COLOR = "#1f2937";
// WCAG AA 본문 기준. 에디터 경고 판정에만 쓰고 저장을 막지는 않는다.
export const AD_BANNER_CONTRAST_THRESHOLD = 4.5;

export interface AdBannerTextBlock {
	align: AdBannerTextAlign;
	// null이면 애니메이션 없이 정적으로 렌더한다.
	animation: AdBannerAnimation | null;
	color: string;
	content: string;
	// 컨테이너 폭 대비 백분율.
	fontSize: number;
	id: string;
	weight: AdBannerTextWeight;
	// 블록 중심의 위치(%). 좌상단 기준이면 폰트 크기를 바꿀 때 블록이 밀려 편집 중 위치가 흔들린다.
	x: number;
	y: number;
}

export interface AdBannerSlotLayout {
	background: { type: "image" } | { color: string; type: "color" };
	// 이미지 배경 위 가독성 보조. 색 배경에서는 의미가 없어 렌더러가 무시한다.
	scrim: { enabled: boolean; opacity: number };
	texts: AdBannerTextBlock[];
}

export interface AdBannerLayout {
	horizontal: AdBannerSlotLayout;
	// 스키마가 바뀌면 렌더러가 분기할 수 있도록 버전을 박아 둔다.
	version: 1;
	vertical: AdBannerSlotLayout;
}

const createEmptySlot = (): AdBannerSlotLayout => ({
	background: { type: "image" },
	scrim: { enabled: true, opacity: 65 },
	texts: [],
});

// 편집을 시작할 때의 상태. 문구가 없으므로 렌더러는 이미지만 그린다 — 배너를 편집하지 않은
// 공고와 같은 결과다.
export const createEmptyAdBannerLayout = (): AdBannerLayout => ({
	horizontal: createEmptySlot(),
	version: 1,
	vertical: createEmptySlot(),
});

// 새 블록은 캔버스 중앙에 놓는다. 모서리에 생기면 구인자가 매번 끌어와야 한다.
export const createAdBannerTextBlock = (id: string): AdBannerTextBlock => ({
	align: "center",
	animation: null,
	color: AD_BANNER_DEFAULT_TEXT_COLOR,
	content: "새 문구",
	fontSize: AD_BANNER_DEFAULT_FONT_SIZE,
	id,
	weight: "bold",
	x: 50,
	y: 50,
});

export const clampPercent = (value: number): number =>
	Math.min(100, Math.max(0, value));

// #abc → #aabbcc. 축약형을 그대로 파싱하면 NaN이 나오고, NaN은 비교에서 전부 false라
// isLowContrast가 "대비 충분"으로 오판한다 — 경고가 조용히 사라지는 방향이라 위험하다.
const expandHex = (hex: string): string => {
	const value = hex.replace("#", "");

	return value.length === 3
		? value
				.split("")
				.map((char) => char + char)
				.join("")
		: value;
};

// sRGB 상대휘도. 알파 합성은 하지 않는다 — 에디터 경고는 단색 배경일 때만 계산한다.
const relativeLuminance = (hex: string): number => {
	const value = expandHex(hex);
	const channels = [0, 2, 4].map((offset) => {
		const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
		return raw <= 0.039_28 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
	});

	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

export const contrastRatio = (hexA: string, hexB: string): number => {
	const a = relativeLuminance(hexA);
	const b = relativeLuminance(hexB);

	// 파싱 실패(잘못된 hex)는 대비 1로 본다. NaN을 흘리면 경고가 꺼지므로, 모르면 경고하는 쪽으로 판정한다.
	if (Number.isNaN(a) || Number.isNaN(b)) {
		return 1;
	}

	const lighter = Math.max(a, b);
	const darker = Math.min(a, b);

	return (lighter + 0.05) / (darker + 0.05);
};

export const isLowContrast = (background: string, text: string): boolean =>
	contrastRatio(background, text) < AD_BANNER_CONTRAST_THRESHOLD;

// 검수용 문구 수집. 두 슬롯을 모두 훑어야 한 쪽 문구가 금칙어 검사를 빠져나가지 않는다.
export const collectAdBannerLayoutTexts = (
	layout: AdBannerLayout
): string[] => [
	...layout.horizontal.texts.map((block) => block.content),
	...layout.vertical.texts.map((block) => block.content),
];

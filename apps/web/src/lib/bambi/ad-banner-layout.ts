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

// 굵기·정렬도 연출과 같은 카탈로그로 둔다. 에디터 안의 로컬 배열이 원본이면 값을 하나 늘리는
// 순간 서버 zod가 반려하는데(배너가 아니라 프리미엄 공고 저장 전체가 막힌다) 대조할 대상이
// 없어 테스트가 전부 통과한다.
export const AD_BANNER_TEXT_WEIGHT_VALUES = [
	"normal",
	"bold",
	"extrabold",
] as const satisfies readonly AdBannerTextWeight[];

export const AD_BANNER_TEXT_WEIGHT_LABELS: Record<AdBannerTextWeight, string> =
	{
		bold: "굵게",
		extrabold: "매우 굵게",
		normal: "보통",
	};

export const AD_BANNER_TEXT_WEIGHT_OPTIONS = AD_BANNER_TEXT_WEIGHT_VALUES.map(
	(value) => ({
		label: AD_BANNER_TEXT_WEIGHT_LABELS[value],
		value,
	})
);

export const AD_BANNER_TEXT_ALIGN_VALUES = [
	"left",
	"center",
	"right",
] as const satisfies readonly AdBannerTextAlign[];

export const AD_BANNER_TEXT_ALIGN_LABELS: Record<AdBannerTextAlign, string> = {
	center: "가운데",
	left: "왼쪽",
	right: "오른쪽",
};

export const AD_BANNER_TEXT_ALIGN_OPTIONS = AD_BANNER_TEXT_ALIGN_VALUES.map(
	(value) => ({
		label: AD_BANNER_TEXT_ALIGN_LABELS[value],
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
// 스크림 불투명도는 0~100 백분율이다. CSS의 0~1이 아니다 — 서버 zod와 렌더러가 이 스케일에서
// 갈리면 기본값 65가 저장 단계에서 반려되거나 CSS에서 클램프돼 완전 불투명 스크림이 된다.
export const AD_BANNER_SCRIM_OPACITY_MIN = 0;
export const AD_BANNER_SCRIM_OPACITY_MAX = 100;
export const AD_BANNER_DEFAULT_SCRIM_OPACITY = 65;
// 문구 블록의 너비(컨테이너 폭 대비 %). 이 너비 안에서 줄바꿈되고 정렬이 적용된다.
// 너비가 없으면 블록이 글자에 딱 맞게 줄어들어 정렬 설정이 화면에 아무 영향을 주지 않는다.
export const AD_BANNER_WIDTH_MIN = 10;
export const AD_BANNER_WIDTH_MAX = 100;
export const AD_BANNER_DEFAULT_WIDTH = 60;

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
	// 컨테이너 폭 대비 백분율. 이 폭 안에서 줄바꿈되고 align이 적용된다.
	width: number;
	// 블록 중심의 위치(%). 좌상단 기준이면 폰트 크기를 바꿀 때 블록이 밀려 편집 중 위치가 흔들린다.
	x: number;
	y: number;
}

export interface AdBannerSlotLayout {
	background: { type: "image" } | { color: string; type: "color" };
	// 이미지 배경 위 가독성 보조. 색 배경에서는 의미가 없어 렌더러가 무시한다.
	// opacity는 0~100 백분율(AD_BANNER_SCRIM_OPACITY_MIN/MAX).
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
	scrim: { enabled: true, opacity: AD_BANNER_DEFAULT_SCRIM_OPACITY },
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
	width: AD_BANNER_DEFAULT_WIDTH,
	x: 50,
	y: 50,
});

// 블록을 사람에게 부르는 이름. 목록 버튼과 캔버스 블록의 접근성 이름이 여기서만 나와야
// 한다 — 각자 만들면 빈 문구가 목록에서는 "문구 3 (비어 있음)", 캔버스에서는 `문구 ""`로
// 갈려 같은 블록이 두 이름으로 읽힌다.
export const formatAdBannerBlockLabel = (
	block: AdBannerTextBlock,
	index: number
): string => block.content.trim() || `문구 ${index + 1} (비어 있음)`;

// NaN만 따로 막는다. 드래그 핸들러는 (clientX - rect.left) / rect.width * 100을 넘기는데,
// 슬롯 탭이 아직 레이아웃되지 않아 rect.width가 0이면 0/0 = NaN이 나온다. NaN이 좌표에 박히면
// JSON.stringify가 말없이 null로 바꿔 서버 zod가 반려하거나 jsonb에 null이 들어간다.
// ±Infinity는 클램프가 이미 0·100으로 접어 유한하게 만드니 그대로 둔다.
export const clampPercent = (value: number): number =>
	Number.isNaN(value) ? 50 : Math.min(100, Math.max(0, value));

// 너비는 0이 될 수 없다 — 0이면 블록이 사라져 다시 잡을 수 없다. 리사이즈 핸들도 좌표와 같은
// 나눗셈을 거치므로 NaN이 들어올 수 있고, 그때는 기본값으로 되돌린다(clampPercent와 같은 방향).
export const clampBlockWidth = (value: number): number =>
	Number.isNaN(value)
		? AD_BANNER_DEFAULT_WIDTH
		: Math.min(AD_BANNER_WIDTH_MAX, Math.max(AD_BANNER_WIDTH_MIN, value));

// hex를 6자리 소문자로 정규화한다. null이면 읽을 수 없는 값이다.
// 트림과 형식 검증을 여기서 다 하는 이유: parseInt는 선행 공백을 건너뛰므로 " #3f3f3f" 같은
// 붙여넣기 값이 NaN 없이 "그럴듯하지만 틀린" 휘도를 내고, 그러면 NaN 가드조차 걸리지 않는다.
// (" #3f3f3f"는 " 3"→15, "f3"→243, "f3"→243으로 읽혀 어두운 회색이 밝은 청록이 된다.)
const HEX_PREFIX = /^#/;
const ANY_CHAR = /./g;
const SIX_DIGIT_HEX = /^[0-9a-f]{6}$/;

const parseHex = (hex: string): string | null => {
	const value = hex.trim().replace(HEX_PREFIX, "").toLowerCase();
	const full =
		value.length === 3 ? value.replace(ANY_CHAR, (char) => char + char) : value;

	return SIX_DIGIT_HEX.test(full) ? full : null;
};

// sRGB 상대휘도. 알파 합성은 하지 않는다 — 에디터 경고는 단색 배경일 때만 계산한다.
const relativeLuminance = (hex: string): number => {
	const value = parseHex(hex);

	if (value === null) {
		return Number.NaN;
	}

	const channels = [0, 2, 4].map((offset) => {
		const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
		return raw <= 0.039_28 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
	});

	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

export const contrastRatio = (hexA: string, hexB: string): number => {
	const a = relativeLuminance(hexA);
	const b = relativeLuminance(hexB);

	// 읽을 수 없는 색은 대비 1로 본다. NaN을 흘리면 모든 비교가 false가 되어 경고가 조용히
	// 꺼지므로, 모르면 경고하는 쪽으로 판정한다.
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

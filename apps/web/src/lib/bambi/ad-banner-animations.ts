// 프리미엄 광고 배너 문구에 적용하는 애니메이션·테마 카탈로그.
// 서버(packages/api/src/routers/bambi/jobs.ts)의 zod enum, DB enum(adBannerAnimation·adBannerTheme)과
// 값이 1:1로 일치해야 한다. 여기가 어긋나면 구인자가 고른 값이 저장 단계에서 반려된다.
export type AdBannerAnimation =
	| "blur-in"
	| "decrypt"
	| "typing"
	| "shiny"
	| "gradient";

export type AdBannerTheme = "dark" | "light" | "coral" | "none";

export const AD_BANNER_ANIMATION_VALUES = [
	"blur-in",
	"decrypt",
	"typing",
	"shiny",
	"gradient",
] as const satisfies readonly AdBannerAnimation[];

export const AD_BANNER_THEME_VALUES = [
	"dark",
	"light",
	"coral",
	"none",
] as const satisfies readonly AdBannerTheme[];

// enum 원값이 화면에 새지 않도록 라벨을 반드시 경유한다.
export const AD_BANNER_ANIMATION_LABELS: Record<AdBannerAnimation, string> = {
	"blur-in": "블러 등장",
	decrypt: "해독 효과",
	gradient: "그라디언트",
	shiny: "반짝임",
	typing: "타이핑",
};

export const AD_BANNER_THEME_LABELS: Record<AdBannerTheme, string> = {
	coral: "코럴 그라디언트",
	dark: "어두운 오버레이",
	light: "밝은 오버레이",
	none: "오버레이 없음",
};

const AD_BANNER_ANIMATION_DESCRIPTIONS: Record<AdBannerAnimation, string> = {
	"blur-in": "흐릿하게 시작해 또렷해지며 나타납니다.",
	decrypt: "무작위 글자가 하나씩 제자리를 찾아갑니다.",
	gradient: "글자 위로 색이 천천히 흘러갑니다.",
	shiny: "글자 위로 빛이 스쳐 지나갑니다.",
	typing: "한 글자씩 입력되듯 나타납니다.",
};

// 폼 ToggleGroup이 쓰는 선택지. 값 순서는 카탈로그 순서를 그대로 따른다.
export const AD_BANNER_ANIMATION_OPTIONS = AD_BANNER_ANIMATION_VALUES.map(
	(value) => ({
		description: AD_BANNER_ANIMATION_DESCRIPTIONS[value],
		label: AD_BANNER_ANIMATION_LABELS[value],
		value,
	})
);

export const AD_BANNER_THEME_OPTIONS = AD_BANNER_THEME_VALUES.map((value) => ({
	label: AD_BANNER_THEME_LABELS[value],
	value,
}));

// 테마 미지정 배너는 어두운 오버레이로 렌더한다(가장 안전한 대비).
export const DEFAULT_AD_BANNER_THEME: AdBannerTheme = "dark";

// 문구 길이 상한. 서버 zod와 같은 값을 써야 한다 — 폼에서 통과한 문구가 저장에서 반려되면 안 된다.
// 세로형은 표시 폭이 약 92px뿐이라 8자가 상한이다.
export const AD_BANNER_HEADLINE_MAX_LENGTH = 20;
export const AD_BANNER_SUBLINE_MAX_LENGTH = 30;
export const AD_BANNER_VERTICAL_TEXT_MAX_LENGTH = 8;

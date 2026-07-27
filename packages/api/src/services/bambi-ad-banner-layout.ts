import z from "zod";

// 배너 레이아웃 JSON의 서버 검증. JSON으로 옮기면서 DB enum·NOT NULL·길이 제약이 사라졌으므로
// 이 스키마가 유일한 방어선이다. 값·범위는 apps/web/src/lib/bambi/ad-banner-layout.ts와 1:1로
// 일치해야 한다(ad-banner-catalog-parity.test.ts가 대조한다).
//
// 색은 6자리 hex만 받는다. 8자리(알파 포함)를 허용하면 웹의 대비 계산이 알파를 무시한 채
// "완전 투명인데 대비 21"로 읽어 저대비 경고가 조용히 꺼진다.
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_BLOCKS = 5;
const MAX_TEXT_LENGTH = 40;
const FONT_SIZE_MIN = 2;
const FONT_SIZE_MAX = 20;
// 스크림 불투명도는 0~100 백분율이다. CSS의 0~1 스케일로 잡으면 기본값 65가 전부 반려된다.
const SCRIM_OPACITY_MIN = 0;
const SCRIM_OPACITY_MAX = 100;
// 문구 블록의 너비(컨테이너 폭 대비 %).
const WIDTH_MIN = 10;
const WIDTH_MAX = 100;
const WIDTH_DEFAULT = 60;

export const AD_BANNER_ANIMATIONS = [
	"split",
	"typing",
	"glitch",
	"blur",
] as const;

// 웹 카탈로그(AD_BANNER_TEXT_ALIGN_VALUES·AD_BANNER_TEXT_WEIGHT_VALUES)의 사본이다.
// 인라인 z.enum으로 두면 parity 테스트가 대조할 대상이 없어, 폼에 값을 하나 늘리는 순간
// 프리미엄 공고 저장이 통째로 반려되는데도 테스트가 전부 통과한다.
export const AD_BANNER_TEXT_ALIGNS = ["left", "center", "right"] as const;
export const AD_BANNER_TEXT_WEIGHTS = ["normal", "bold", "extrabold"] as const;

const textBlockSchema = z
	.object({
		align: z.enum(AD_BANNER_TEXT_ALIGNS),
		animation: z.enum(AD_BANNER_ANIMATIONS).nullable(),
		color: z.string().regex(HEX_COLOR, "색상 형식이 올바르지 않습니다."),
		content: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
		fontSize: z.number().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX),
		id: z.string().min(1).max(64),
		weight: z.enum(AD_BANNER_TEXT_WEIGHTS),
		// 기존 저장분에는 width가 없다. strict 스키마에서 필수로 두면 이미 저장된 레이아웃이
		// parseStoredAdBannerLayout에서 전부 반려돼 운영 중인 배너가 통째로 사라진다.
		width: z.number().min(WIDTH_MIN).max(WIDTH_MAX).default(WIDTH_DEFAULT),
		// 좌표는 슬롯 대비 백분율이다. 범위를 벗어나면 렌더에서 슬롯 밖으로 나간다.
		x: z.number().min(0).max(100),
		y: z.number().min(0).max(100),
	})
	.strict();

const slotLayoutSchema = z
	.object({
		background: z.union([
			z.object({ type: z.literal("image") }).strict(),
			z
				.object({
					color: z.string().regex(HEX_COLOR),
					type: z.literal("color"),
				})
				.strict(),
		]),
		scrim: z
			.object({
				enabled: z.boolean(),
				opacity: z.number().min(SCRIM_OPACITY_MIN).max(SCRIM_OPACITY_MAX),
			})
			.strict(),
		// id가 겹치면 렌더러의 key가 충돌하고 에디터의 블록 수정이 같은 id를 가진 블록에 전부
		// 적용된다. 자해성이지만 저장 전에 막는 편이 싸다.
		texts: z
			.array(textBlockSchema)
			.max(MAX_BLOCKS)
			.refine(
				(texts) =>
					new Set(texts.map((block) => block.id)).size === texts.length,
				"문구 식별자가 중복됩니다."
			),
	})
	.strict();

export const adBannerLayoutSchema = z
	.object({
		horizontal: slotLayoutSchema,
		version: z.literal(1),
		vertical: slotLayoutSchema,
	})
	.strict();

export type AdBannerLayoutInput = z.infer<typeof adBannerLayoutSchema>;

// 저장된 jsonb를 읽는 경로의 관문. drizzle이 unknown으로 주는 값을 캐스팅만 하면 형태가
// 어긋난 행 하나가 렌더러에서 `layout[slot].texts`로 터지고, 이 렌더러는 마켓플레이스·공고상세·
// 채팅목록 등 여러 화면의 광고 레일에 붙어 있어 한 행이 화면 전체를 내린다. 수동 DB 편집·부분
// 복구·훗날의 v2 스키마가 그런 행을 만들 수 있으므로 읽을 때마다 다시 검증하고, 실패하면
// null로 떨어뜨려 "배너를 편집하지 않은 공고"와 같은 취급을 받게 한다.
export const parseStoredAdBannerLayout = (
	layout: unknown
): AdBannerLayoutInput | null => {
	const parsed = adBannerLayoutSchema.safeParse(layout);

	return parsed.success ? parsed.data : null;
};

// usage(업로드 축) ↔ 슬롯(레이아웃 축) 대응. 웹의 SLOT_FOR_USAGE와 같은 표다.
const SLOT_FOR_USAGE = {
	ad_horizontal: "horizontal",
	ad_vertical: "vertical",
} as const;

// 이 슬롯의 배너 이미지가 실제로 필요한가. 배경이 단색이면 렌더러가 색으로 덮어 업로드
// 이미지가 화면에 전혀 나오지 않으므로 요구하지 않는다. 웹의 isAdBannerImageRequired와 판정이
// 1:1로 같아야 한다 — 한쪽만 열리면 폼은 통과시키는데 서버가 반려하는(또는 그 반대) 막다른
// 길이 생긴다.
// 입력이 unknown인 이유: 호출부가 이미 파싱된 레이아웃(후보 필터)과 저장 직전의 원본
// (create/update)을 섞어 넘긴다. 형태를 못 읽으면 "레이아웃 없음"과 같이 취급해 이미지를
// 요구한다 — 모르면 막는 쪽이다.
export const isAdBannerImageRequired = (
	layout: unknown,
	usage: "ad_horizontal" | "ad_vertical"
): boolean => {
	const parsed = adBannerLayoutSchema.safeParse(layout);

	return (
		!parsed.success ||
		parsed.data[SLOT_FOR_USAGE[usage]].background.type === "image"
	);
};

// 검수용 문구 수집. 두 슬롯을 모두 훑어야 한쪽 슬롯 문구가 금칙어 검사를 빠져나가지 않는다.
// 저장된 jsonb를 다시 읽는 경로에서는 형태를 신뢰할 수 없으므로 파싱에 실패하면 던지지 않고
// 빈 배열을 돌려 호출부가 그냥 넘어가게 한다(그 경우 렌더러도 같은 이유로 아무것도 그리지 않는다).
export const collectLayoutTexts = (layout: unknown): string[] => {
	const parsed = adBannerLayoutSchema.safeParse(layout);

	if (!parsed.success) {
		return [];
	}

	return [
		...parsed.data.horizontal.texts.map((block) => block.content),
		...parsed.data.vertical.texts.map((block) => block.content),
	];
};

// 화면에서 읽히는 순서(위→아래, 왼→오른쪽)대로 구분자 없이 이어 붙인다.
// 자유 배치가 되면서 생긴 구멍을 막는다: "미성"과 "년"을 나란히 놓으면 배너에는 "미성년"으로
// 보이지만, 블록별로 끊어 검사하거나 공백으로 이어 붙이면 금칙어에 걸리지 않는다.
// 배열 순서(=추가 순서)로 이으면 나중에 추가한 블록을 앞으로 끌어다 놓는 것만으로 다시
// 빠져나가므로, 반드시 좌표로 정렬해야 한다.
const toReadingOrderText = (
	texts: AdBannerLayoutInput["horizontal"]["texts"]
): string =>
	[...texts]
		.sort((a, b) => a.y - b.y || a.x - b.x)
		.map((block) => block.content)
		.join("");

// 금칙어 검사에 넘길 문자열. 블록별 문구와 읽기 순서 조립본을 함께 실어 양쪽 다 걸리게 한다.
export const collectLayoutModerationText = (layout: unknown): string => {
	const parsed = adBannerLayoutSchema.safeParse(layout);

	if (!parsed.success) {
		return "";
	}

	return [
		...collectLayoutTexts(layout),
		toReadingOrderText(parsed.data.horizontal.texts),
		toReadingOrderText(parsed.data.vertical.texts),
	].join(" ");
};

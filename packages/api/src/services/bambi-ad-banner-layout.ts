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

export const AD_BANNER_ANIMATIONS = [
	"split",
	"typing",
	"glitch",
	"blur",
] as const;

const textBlockSchema = z
	.object({
		align: z.enum(["left", "center", "right"]),
		animation: z.enum(AD_BANNER_ANIMATIONS).nullable(),
		color: z.string().regex(HEX_COLOR, "색상 형식이 올바르지 않습니다."),
		content: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
		fontSize: z.number().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX),
		id: z.string().min(1).max(64),
		weight: z.enum(["normal", "bold", "extrabold"]),
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
		texts: z.array(textBlockSchema).max(MAX_BLOCKS),
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

// 검수용 문구 수집. 두 슬롯을 모두 훑어야 한쪽 슬롯 문구가 금칙어 검사를 빠져나가지 않는다.
// 저장된 jsonb를 다시 읽는 경로에서는 형태를 신뢰할 수 없으므로 파싱에 실패하면 던지지 않고
// 빈 배열을 돌려 호출부가 그냥 넘어가게 한다.
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

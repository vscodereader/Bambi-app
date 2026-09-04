// 배너 레이아웃 순수 로직. 앱에는 문구 편집기가 없고 슬롯 배경(이미지/단색)만 바꾼다.
// 저장 형태·검증은 서버 zod(bambi-ad-banner-layout)가 유일한 방어선이라 그 타입을 그대로
// 재사용하고, 값·기본값은 웹(apps/web/src/lib/bambi/ad-banner-layout.ts)과 1:1로 맞춘다.
import type { AdBannerLayoutInput } from "@bambi-app/api/services/bambi-ad-banner-layout";

import type { JobAdBannerUsage } from "@/src/lib/employer/ad-exposure";

// 슬롯 배경(이미지 위에 스크림, 또는 단색). 서버 스키마의 union을 그대로 쓴다.
export type NativeBannerBackground =
	AdBannerLayoutInput["horizontal"]["background"];

// 웹 기본값과 같아야 한다: 스크림 65%, 단색 기본색 #1f2937.
const DEFAULT_SCRIM_OPACITY = 65;
export const DEFAULT_BANNER_BACKGROUND_COLOR = "#1f2937";

// usage(업로드 축) ↔ 슬롯(레이아웃 축) 대응. 서버·웹의 SLOT_FOR_USAGE와 같은 표다.
const SLOT_FOR_USAGE = {
	ad_horizontal: "horizontal",
	ad_vertical: "vertical",
} as const;

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

const createEmptySlot = (): AdBannerLayoutInput["horizontal"] => ({
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

// 고른 슬롯의 배경만 바꿔 되돌려 준다. 웹에서 만든 문구·스크림은 그대로 둔다 —
// 통째로 새 레이아웃을 보내면 웹 작업물이 사라진다. 레이아웃이 없던 공고는 기본값에서 시작한다.
export const withSlotBackground = (
	layout: AdBannerLayoutInput | null,
	usage: JobAdBannerUsage,
	background: NativeBannerBackground
): AdBannerLayoutInput => {
	const base = layout ?? createEmptyBannerLayout();
	const slot = SLOT_FOR_USAGE[usage];

	return {
		...base,
		[slot]: { ...base[slot], background },
	};
};

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

"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Megaphone } from "lucide-react";
import {
	type AdBannerTheme,
	DEFAULT_AD_BANNER_THEME,
} from "@/lib/bambi/ad-banner-animations";
import type { AdBannerTextConfig } from "@/lib/bambi/api-job-mapper";
import { AdBannerText } from "./ad-banner-text";

// 이미지 위에 글자를 얹으므로 가독성 확보용 스크림이 필요하다. 강도는 프리셋마다 고정한다 —
// 구인자가 색을 자유 지정하면 대비가 무너진 배너가 나온다.
// 가로형 글자는 아래에 붙지만(justify-end) 패딩·서브라인 때문에 바닥이 아니라 높이의
// 25~38% 대역(헤드라인이 두 줄로 밀리면 최대 ~56%)에 놓인다. 그래서 "맨 아래가 가장 진한"
// 그라디언트는 정작 글자가 있는 곳에서 옅어진다 — 아래→위로 곧장 흘리는 스크림은
// 정지점 색을 아무리 어둡게 잡아도 4.5:1을 보장하지 못한다(바닥에서만 통과한다).
// 그래서 가장 진한 농도를 55%까지 **유지**하고 그 위로만 투명하게 뺀다. 글자 대역 전체가
// 균일 구간에 들어와 대비가 아래 농도값 그대로 나오고(보간 구간에 안 걸린다),
// 위쪽 45%는 비워 배너 이미지가 살아난다. 농도는 세로형과 같은 값을 재사용한다.
// coral은 coral-600(#e5304c)이 흰 글자 기준 불투명일 때도 4.32:1이라 어떤 농도로도 통과가
// 불가능해, 세로형과 같은 이유로 한 단계 어두운 coral-700(#c11f39)을 쓴다.
// ponytail: 55%는 슬롯 비율(7:3)·패딩·서브라인으로 추정한 글자 대역 상한이지 실측이 아니다.
// 슬롯 높이나 패딩이 바뀌어 글자가 55% 위로 올라가면 다시 보간 구간에 걸린다 — 실기기에서
// 대역을 재고, 어긋나면 세로형처럼 균일 스크림(inset-0 전체)으로 가는 게 확실한 해법이다.
const THEME_HORIZONTAL_SCRIM_CLASS_NAMES: Record<AdBannerTheme, string> = {
	coral: "bg-gradient-to-t from-55% from-coral-700/85 to-transparent",
	dark: "bg-gradient-to-t from-55% from-ink-900/65 to-transparent",
	light: "bg-gradient-to-t from-55% from-white/70 to-transparent",
	none: "",
};

// 세로형은 글자 축이 세로다(writing-mode: vertical-rl). 8자면 세로 슬롯 높이의 절반 이상을
// 세로로 가로질러서, 세로 그라디언트를 쓰면 어디에 정렬하든 글자 일부가 옅은 구간(40%)이나
// 투명 구간에 걸린다 — 밝은 사진 위에서 흰 글자 대비가 4.5:1 아래로 떨어진다.
// 정렬을 아래로 옮기는 것으로는 해결되지 않아(글자 축 = 그라디언트 축) 세로형만 균일 스크림을 쓴다.
//
// 농도는 "순백(또는 순흑) 사진이 깔린 최악의 경우"에도 4.5:1을 넘기는 선에서 가장 옅게 잡았다.
// 합성은 sRGB 공간에서 일어나므로 상대휘도를 선형 보간해 계산하면 안 된다(그러면 필요한
// 농도를 크게 과대평가한다). 실측 대비 — 후임자가 조정할 때 이 값들을 기준으로 삼으면 된다:
//   ink-900   흰 글자/순백 사진: α=0.585에서 4.52:1(마지노선), 0.65 → 5.65:1, 0.85 → 11.65:1
//   white     ink-900 글자/순흑 사진: α=0.70 → 8.62:1
//   coral-600 흰 글자/순백 사진: α=1.0에서도 4.32:1로 **어떤 농도로도 통과 불가**
// 그래서 coral은 가로·세로 모두 한 단계 어두운 coral-700을 쓴다(α=0.85 → 4.77:1). ink 계열로 갈아타면
// 더 옅게 깔 수 있지만, 92px 슬롯에서 코럴 워시가 사라지면 coral 테마가 dark와 구분되지 않아
// 구인자가 고른 테마가 무의미해진다 — 브랜드 톤을 지키는 쪽을 택했다.
// ponytail: coral만 농도가 높아 사진이 많이 가려진다. 더 옅게 가려면 coral-800(#9e1b31)을
// Tailwind 색으로 노출해야 하는데(현재 coral-50~700만 매핑) 그건 토큰 파일 소유자 몫이다.
const THEME_VERTICAL_SCRIM_CLASS_NAMES: Record<AdBannerTheme, string> = {
	coral: "bg-coral-700/85",
	dark: "bg-ink-900/65",
	light: "bg-white/70",
	none: "",
};

// 글자색은 오버레이 컨테이너에만 걸고 AdBannerText에는 절대 넘기지 않는다(상속으로 먹인다).
// shiny·gradient 연출은 bg-clip-text + text-transparent로 글자를 그리는데, AdBannerText가
// cn(연출클래스, className) 순으로 병합해서 className에 text-* 색이 섞이면 tailwind-merge가
// text-transparent를 걷어내 연출이 소리 없이 사라지고 평범한 글자로 떨어진다.
// 컨테이너에 두면 자식의 text-transparent가 상속을 이기므로 연출이 살고, prefers-reduced-motion
// 정적 렌더처럼 연출 클래스가 빠지는 경로에서만 상속색이 드러나 대비도 유지된다.
// (shiny는 흰색 고정이라 구조적으로 어두운 배경 전제다 — light 테마와 조합하면 잘 안 읽힌다.)
const THEME_TEXT_CLASS_NAMES: Record<AdBannerTheme, string> = {
	coral: "text-white",
	dark: "text-white",
	light: "text-ink-900",
	// 스크림이 없으면 배경이 무엇이든 읽히도록 그림자로 버틴다. filter라 색 병합과 충돌하지 않는다.
	none: "text-white drop-shadow-md",
};

// 그릴 문구가 슬롯별로 다르다. 가로형은 headline, 세로형은 verticalText가 기준이며
// 헤드라인을 잘라 세로에 쓰지 않는다(20자를 8자 폭에 넣으면 잘린 문구가 노출된다).
export function AdBannerTextOverlay({
	config,
	variant,
}: {
	config: AdBannerTextConfig;
	variant: "horizontal" | "vertical";
}) {
	const theme = config.theme ?? DEFAULT_AD_BANNER_THEME;
	// 오버레이는 배너 이미지와 그 아래 공고 상세 링크 위에 깔리므로 클릭을 삼키면 안 된다.
	const overlayBase = cn(
		"pointer-events-none absolute inset-0",
		variant === "vertical"
			? THEME_VERTICAL_SCRIM_CLASS_NAMES[theme]
			: THEME_HORIZONTAL_SCRIM_CLASS_NAMES[theme],
		THEME_TEXT_CLASS_NAMES[theme]
	);

	if (variant === "vertical") {
		if (!config.verticalText) {
			return null;
		}

		return (
			<div className={cn(overlayBase, "flex items-center justify-center p-2")}>
				<AdBannerText
					animation={config.animation}
					className="font-extrabold text-base leading-tight tracking-tight [writing-mode:vertical-rl]"
					text={config.verticalText}
				/>
			</div>
		);
	}

	if (!config.headline) {
		return null;
	}

	return (
		<div
			className={cn(
				overlayBase,
				"flex flex-col items-center justify-end gap-1 p-3 text-center"
			)}
		>
			<AdBannerText
				animation={config.animation}
				className="font-extrabold text-sm leading-tight tracking-tight sm:text-lg"
				text={config.headline}
			/>
			{config.subline ? (
				<span className="text-xs leading-tight opacity-90">
					{config.subline}
				</span>
			) : null}
		</div>
	);
}

// 빈 광고 슬롯에 들어가는 "광고 등록 문의" 내용. 예전엔 전화번호가 박힌 PNG였고, 번호를
// 바꾸려면 이미지를 다시 만들어야 했다. 이제 운영자 설정값을 그대로 렌더한다.
// 세로형은 표시 폭이 약 92px뿐이라 세로쓰기 대신 줄바꿈으로 흘린다 — 번호가 세로로 서면 읽기 어렵다.
export function AdSlotInquiryContent({
	tel,
	variant,
}: {
	tel: string;
	variant: "horizontal" | "vertical";
}) {
	if (variant === "vertical") {
		return (
			<div className="flex size-full flex-col items-center justify-center gap-2 bg-coral-500 p-2 text-center text-white">
				<Megaphone className="size-4" />
				<span className="font-bold text-xs leading-tight">광고 등록 문의</span>
				<span className="font-extrabold text-sm leading-tight tracking-tight">
					{tel}
				</span>
			</div>
		);
	}

	return (
		<div className="flex size-full flex-col items-center justify-center gap-1 bg-coral-500 p-3 text-center text-white">
			<span className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
				<Megaphone className="size-4" />
				광고 등록 문의
			</span>
			<span className="font-extrabold text-lg tracking-tight sm:text-xl">
				{tel}
			</span>
		</div>
	);
}

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
const THEME_SCRIM_CLASS_NAMES: Record<AdBannerTheme, string> = {
	coral: "bg-gradient-to-t from-coral-600/85 via-coral-500/45 to-transparent",
	dark: "bg-gradient-to-t from-ink-900/85 via-ink-900/40 to-transparent",
	light: "bg-gradient-to-t from-white/90 via-white/50 to-transparent",
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
		THEME_SCRIM_CLASS_NAMES[theme],
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

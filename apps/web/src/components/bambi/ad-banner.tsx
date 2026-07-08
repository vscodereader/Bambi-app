"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import { sampleThumbnailUrl } from "@/lib/bambi/sample-thumbnails";

// 세로형 배너 샘플 이미지(80x180). 우측 사이드 rail에서 세로형으로 노출한다.
export const SAMPLE_BANNERS = [
	"/bambi/sample-banners/banner-1.gif",
	"/bambi/sample-banners/banner-2.gif",
	"/bambi/sample-banners/banner-3.gif",
	"/bambi/sample-banners/banner-4.gif",
	"/bambi/sample-banners/banner-5.gif",
	"/bambi/sample-banners/banner-6.gif",
] as const;

interface AdBannerProps {
	className?: string;
	src: string;
}

// 세로형 광고 배너(우측 사이드용) — 상단 프리미엄 배너와 같은 높이(h-52).
export function AdBanner({ className, src }: AdBannerProps) {
	return (
		<Image
			alt="광고 배너"
			className={cn("h-52 w-auto rounded-lg", className)}
			height={180}
			sizes="120px"
			src={src}
			unoptimized
			width={80}
		/>
	);
}

interface AdBannerRailProps {
	className?: string;
	count?: number;
	offset?: number;
}

// 세로 배너 스택(우측). 컬럼 안에서 가운데 정렬한다.
export function AdBannerRail({
	className,
	count = 3,
	offset = 0,
}: AdBannerRailProps) {
	const banners = Array.from({ length: count }, (_, i) => {
		const index = (offset + i) % SAMPLE_BANNERS.length;
		return { index, src: SAMPLE_BANNERS[index] };
	});
	return (
		<div className={cn("flex flex-col items-center gap-3", className)}>
			{banners.map((banner) => (
				<AdBanner key={banner.index} src={banner.src} />
			))}
		</div>
	);
}

interface HorizontalAdBannerProps {
	adKey: string;
	className?: string;
}

// 가로형 광고 배너(좌측 사이드·상단 프리미엄용) — 공고 카드 크기의 가로 이미지.
// 공고 썸네일 샘플(가로형 200x89)을 결정적으로 사용한다.
export function HorizontalAdBanner({
	adKey,
	className,
}: HorizontalAdBannerProps) {
	return (
		<Image
			alt="광고 배너"
			className={cn(
				"aspect-[200/89] w-full rounded-lg border border-border object-cover",
				className
			)}
			height={89}
			sizes="272px"
			src={sampleThumbnailUrl(adKey)}
			unoptimized
			width={200}
		/>
	);
}

interface HorizontalAdBannerRailProps {
	className?: string;
	keys: readonly string[];
}

// 가로형 배너 세로 스택(좌측 사이드).
export function HorizontalAdBannerRail({
	className,
	keys,
}: HorizontalAdBannerRailProps) {
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{keys.map((adKey) => (
				<HorizontalAdBanner adKey={adKey} key={adKey} />
			))}
		</div>
	);
}

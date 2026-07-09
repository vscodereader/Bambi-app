"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { adJobHref } from "@/lib/bambi/ad-links";
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
	// 배너 클릭 시 이동할 광고 공고를 결정하는 결정적 키(배너 이미지 경로 등).
	seed: string;
	src: string;
}

// 세로형 광고 배너(우측 사이드용) — 상단 프리미엄 배너와 같은 높이(h-52).
// 클릭하면 광고 공고 상세로 이동한다. Link는 이미지 크기에 맞춰(w-fit) 좌측 정렬을 유지한다.
export function AdBanner({ className, seed, src }: AdBannerProps) {
	return (
		<Link
			aria-label="광고 공고 상세 보기"
			className="block w-fit rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={adJobHref(seed)}
		>
			<Image
				alt="광고 배너"
				className={cn("h-52 w-auto rounded-lg", className)}
				height={180}
				sizes="120px"
				src={src}
				unoptimized
				width={80}
			/>
		</Link>
	);
}

interface AdBannerRailProps {
	className?: string;
	count?: number;
	offset?: number;
}

// 세로 배너 스택(우측). 컬럼 안에서 왼쪽(콘텐츠 쪽)에 붙여 정렬한다.
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
		<div className={cn("flex flex-col items-start gap-3", className)}>
			{banners.map((banner) => (
				<AdBanner key={banner.index} seed={banner.src} src={banner.src} />
			))}
		</div>
	);
}

interface HorizontalAdBannerProps {
	adKey: string;
	className?: string;
}

// 가로형 광고 배너(좌측 사이드·상단 프리미엄용) — 공고 카드와 동일한 크기.
// 폭은 그리드/컬럼(공고 카드와 동일)으로 정해지고, 높이는 공고 카드 렌더 높이(약 118px)에
// 고정해 카드와 정확히 맞춘다. 공고 썸네일 샘플(가로형 200x89)을 결정적으로 크롭해 채운다.
// 클릭하면 광고 공고 상세로 이동한다.
export function HorizontalAdBanner({
	adKey,
	className,
}: HorizontalAdBannerProps) {
	return (
		<Link
			aria-label="광고 공고 상세 보기"
			className="block overflow-hidden rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={adJobHref(adKey)}
		>
			<Image
				alt="광고 배너"
				className={cn(
					"h-[118px] w-full rounded-lg border border-border object-cover",
					className
				)}
				height={89}
				sizes="272px"
				src={sampleThumbnailUrl(adKey)}
				unoptimized
				width={200}
			/>
		</Link>
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

"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";

// 광고 배너 샘플 이미지(80x180 세로형). 공고 썸네일처럼 정적 샘플을 노출한다.
// 실제 캠페인 데이터가 붙기 전까지 목업으로 사용한다.
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

// 단일 세로 광고 배너 — 배너 이미지 자체가 카드다(외곽 박스·문구 없음).
export function AdBanner({ className, src }: AdBannerProps) {
	return (
		<Image
			alt="광고 배너"
			className={cn("h-auto w-full rounded-lg", className)}
			height={180}
			sizes="220px"
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

// 세로 배너 여러 개를 스택으로 묶는다. sticky 스크롤 추종은 사용처(부모 컬럼)에서 제어한다.
// offset으로 좌/우 rail이 서로 다른 샘플을 노출하도록 한다.
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
		<div className={cn("flex flex-col gap-3", className)}>
			{banners.map((banner) => (
				<AdBanner key={banner.index} src={banner.src} />
			))}
		</div>
	);
}

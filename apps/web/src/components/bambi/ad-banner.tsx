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

// 세로형 광고 배너(우측 사이드용) — 규격 4:9(권장 400×900).
// 슬롯 비율은 업로드 규격(lib/bambi/job-ad-banner-spec.ts)과 같아야 배너가 잘리지 않는다.
// 클릭하면 광고 공고 상세로 이동한다.
export function AdBanner({ className, seed, src }: AdBannerProps) {
	return (
		<Link
			aria-label="광고 공고 상세 보기"
			className="block w-fit rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={adJobHref(seed)}
		>
			<Image
				alt="광고 배너"
				className={cn(
					"aspect-[4/9] h-52 w-auto rounded-lg object-cover",
					className
				)}
				height={900}
				sizes="120px"
				src={src}
				unoptimized
				width={400}
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

// 가로형 광고 배너(좌측 사이드·상단 프리미엄용) — 규격 7:3, 최소 259×111.
// 아래 width/height는 next/image의 비율 힌트일 뿐 요구 해상도가 아니다(실제 폭은 sizes로 결정).
// 폭은 그리드/컬럼(공고 카드와 동일)으로 정해지고 높이는 비율로 따라온다. 슬롯 비율은
// 업로드 규격(lib/bambi/job-ad-banner-spec.ts)과 같아야 배너가 잘리지 않는다.
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
					"aspect-[7/3] w-full rounded-lg border border-border object-cover",
					className
				)}
				height={600}
				sizes="272px"
				src={sampleThumbnailUrl(adKey)}
				unoptimized
				width={1400}
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

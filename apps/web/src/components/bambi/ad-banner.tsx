"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";

const bannerHref = (item: AdBannerItem): Route =>
	`/seeker/jobs/${item.id}` as Route;

interface AdBannerProps {
	className?: string;
	item: AdBannerItem;
}

// 세로형 광고 배너(우측 사이드용) — 상단 프리미엄 배너와 같은 높이(h-52).
// 결제완료된 배너 공고의 커버 이미지를 세로 크롭해 노출하고, 클릭하면 공고 상세로 이동한다.
export function AdBanner({ className, item }: AdBannerProps) {
	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className="block w-fit rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={bannerHref(item)}
		>
			<Image
				alt={`${item.company} ${item.title} 광고 배너`}
				className={cn("h-52 w-20 rounded-lg object-cover", className)}
				height={180}
				sizes="120px"
				src={item.coverUrl}
				unoptimized
				width={80}
			/>
		</Link>
	);
}

interface AdBannerRailProps {
	className?: string;
	items: AdBannerItem[];
}

// 세로 배너 스택(우측). 판매된 배너만 렌더하고, 없으면 부모가 영역을 숨긴다.
export function AdBannerRail({ className, items }: AdBannerRailProps) {
	return (
		<div className={cn("flex flex-col items-start gap-3", className)}>
			{items.map((item) => (
				<AdBanner item={item} key={item.id} />
			))}
		</div>
	);
}

interface HorizontalAdBannerProps {
	className?: string;
	item: AdBannerItem;
}

// 가로형 광고 배너(좌측 사이드·상단 프리미엄용) — 공고 카드와 동일한 크기.
// 폭은 그리드/컬럼으로 정해지고 높이는 공고 카드 렌더 높이에 맞춘다.
export function HorizontalAdBanner({
	className,
	item,
}: HorizontalAdBannerProps) {
	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className="block overflow-hidden rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={bannerHref(item)}
		>
			<Image
				alt={`${item.company} ${item.title} 광고 배너`}
				className={cn(
					"h-[118px] w-full rounded-lg border border-border object-cover",
					className
				)}
				height={89}
				sizes="272px"
				src={item.coverUrl}
				unoptimized
				width={200}
			/>
		</Link>
	);
}

interface HorizontalAdBannerRailProps {
	className?: string;
	items: AdBannerItem[];
}

// 가로형 배너 세로 스택(좌측 사이드).
export function HorizontalAdBannerRail({
	className,
	items,
}: HorizontalAdBannerRailProps) {
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{items.map((item) => (
				<HorizontalAdBanner item={item} key={item.id} />
			))}
		</div>
	);
}

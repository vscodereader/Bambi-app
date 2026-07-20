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

// 세로형 광고 배너(우측 사이드용) — 규격 4:9(권장 400×900), 높이는 상단 프리미엄 배너와 같다(h-52).
// 슬롯 비율은 업로드 규격(lib/bambi/job-ad-banner-spec.ts)과 같아야 배너가 잘리지 않는다.
// 결제완료된 배너 공고의 이미지를 노출하고, 클릭하면 해당 공고 상세로 이동한다.
export function AdBanner({ className, item }: AdBannerProps) {
	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className="block w-fit rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={bannerHref(item)}
		>
			<Image
				alt={`${item.company} ${item.title} 광고 배너`}
				className={cn(
					"aspect-[4/9] h-52 w-auto rounded-lg object-cover",
					className
				)}
				height={900}
				sizes="120px"
				src={item.imageUrl}
				unoptimized
				width={400}
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

// 가로형 광고 배너(좌측 사이드·상단 프리미엄용) — 규격 7:3, 최소 150×50.
// 아래 width/height는 next/image의 비율 힌트일 뿐 요구 해상도가 아니다(실제 폭은 sizes로 결정).
// 폭은 그리드/컬럼(공고 카드와 동일)으로 정해지고 높이는 비율로 따라온다. 슬롯 비율은
// 업로드 규격(lib/bambi/job-ad-banner-spec.ts)과 같아야 배너가 잘리지 않는다.
// 클릭하면 광고 공고 상세로 이동한다.
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
					"aspect-[7/3] w-full rounded-lg border border-border object-cover",
					className
				)}
				height={600}
				sizes="272px"
				src={item.imageUrl}
				unoptimized
				width={1400}
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

"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";

const bannerHref = (item: AdBannerItem): Route =>
	`/seeker/jobs/${item.id}` as Route;

// 좌/우 배너 rail은 슬롯 3개를 기준으로 채운다 — 서버가 좌/우 배너를 최대 3개로
// 제한하는 상한과 짝이다. 판매분 뒤 빈 슬롯은 아래 자리표시로 메운다.
const AD_RAIL_SLOT_COUNT = 3;
const AD_RAIL_SLOT_KEYS = ["slot-1", "slot-2", "slot-3"] as const;

// 빈 광고 슬롯 자리표시 — "광고 모집중 입니다." 문구를 실제 배너와 같은 비율/크기로
// 보여주는 클릭 불가 장식(aria-hidden). 스켈레톤 "형태"는 muted 배경 + 점선 테두리로
// 표현한다(pulse 없이 정적). 비율/크기(aspect·h·w)는 호출부가 className으로 넘긴다 —
// display 클래스도 반드시 함께 넘겨야 한다(base엔 flex/hidden이 없어 breakpoint 토글이 가능).
export function AdSlotPlaceholder({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"items-center justify-center rounded-lg border border-border border-dashed bg-muted p-2 text-center font-semibold text-muted-foreground text-xs",
				className
			)}
		>
			광고 모집중 입니다.
		</div>
	);
}

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

// 세로 배너 스택(우측). 판매된 배너를 먼저 깔고, 남은 슬롯(총 3개)은 "광고 모집중"
// 자리표시로 채워 빈 상태에서도 영역이 보이게 한다.
export function AdBannerRail({ className, items }: AdBannerRailProps) {
	const emptySlotKeys = AD_RAIL_SLOT_KEYS.slice(
		items.length,
		AD_RAIL_SLOT_COUNT
	);
	return (
		<div className={cn("flex flex-col items-start gap-3", className)}>
			{items.map((item) => (
				<AdBanner item={item} key={item.id} />
			))}
			{emptySlotKeys.map((key) => (
				<AdSlotPlaceholder className="flex aspect-[4/9] h-52" key={key} />
			))}
		</div>
	);
}

interface HorizontalAdBannerProps {
	className?: string;
	item: AdBannerItem;
}

// 가로형 광고 배너(좌측 사이드·상단 프리미엄용) — 규격 7:3, 최소 700×300.
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

// 가로형 배너 세로 스택(좌측 사이드). 판매분 뒤 남은 슬롯(총 3개)은 "광고 모집중"
// 자리표시로 채워 빈 상태에서도 영역이 보이게 한다.
export function HorizontalAdBannerRail({
	className,
	items,
}: HorizontalAdBannerRailProps) {
	const emptySlotKeys = AD_RAIL_SLOT_KEYS.slice(
		items.length,
		AD_RAIL_SLOT_COUNT
	);
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{items.map((item) => (
				<HorizontalAdBanner item={item} key={item.id} />
			))}
			{emptySlotKeys.map((key) => (
				<AdSlotPlaceholder className="flex aspect-[7/3] w-full" key={key} />
			))}
		</div>
	);
}

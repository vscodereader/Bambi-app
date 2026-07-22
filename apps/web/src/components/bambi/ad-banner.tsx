"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";

const bannerHref = (item: AdBannerItem): Route =>
	`/seeker/jobs/${item.id}` as Route;

// 좌/우 배너 rail은 슬롯 3개를 항상 렌더한다 — 서버가 그룹당 고정 길이(3칸) 배열을 내려주고
// 활성 칸만 광고, 나머지는 null이다. 데이터가 없거나(로딩) null인 칸은 자리표시로 채운다.
const AD_RAIL_SLOT_KEYS = ["slot-1", "slot-2", "slot-3"] as const;

// 빈 슬롯 자리표시 이미지(가로 7:3 / 세로 4:9) — 실제 배너/카드가 채워지기 전 자리를
// 지키는 장식이라 alt은 비운다.
const PLACEHOLDER_HORIZONTAL_SRC =
	"/bambi/placeholder/horizontal-placeholder.png";
const PLACEHOLDER_VERTICAL_SRC = "/bambi/placeholder/vertical-placeholder.png";

// 빈 광고/카드 슬롯 자리표시 — 실제 배너와 같은 비율/크기로 placeholder 이미지를 채우는
// 클릭 불가 장식(aria-hidden). 비율/크기(aspect·h·w)는 호출부가 className으로 넘긴다 —
// display 클래스도 반드시 함께 넘겨야 한다(base엔 flex/hidden이 없어 breakpoint 토글이 가능).
// variant는 세로형(우측 사이드) 슬롯에서만 "vertical"로 넘긴다(기본은 가로형).
export function AdSlotPlaceholder({
	className,
	variant = "horizontal",
}: {
	className?: string;
	variant?: "horizontal" | "vertical";
}) {
	return (
		<div
			aria-hidden="true"
			className={cn("relative overflow-hidden rounded-lg", className)}
		>
			<Image
				alt=""
				className="object-cover"
				fill
				sizes={variant === "vertical" ? "120px" : "272px"}
				src={
					variant === "vertical"
						? PLACEHOLDER_VERTICAL_SRC
						: PLACEHOLDER_HORIZONTAL_SRC
				}
				unoptimized
			/>
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
	items: (AdBannerItem | null)[];
}

// 세로 배너 스택(우측). 슬롯 3칸을 항상 렌더하고, 활성 칸(non-null)은 배너로, 빈 칸은
// "광고 모집중" 자리표시로 채운다.
export function AdBannerRail({ className, items }: AdBannerRailProps) {
	return (
		<div className={cn("flex flex-col items-start gap-3", className)}>
			{AD_RAIL_SLOT_KEYS.map((key, index) => {
				const item = items[index];
				return item ? (
					<AdBanner item={item} key={item.id} />
				) : (
					<AdSlotPlaceholder
						className="flex aspect-[4/9] h-52"
						key={key}
						variant="vertical"
					/>
				);
			})}
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
	items: (AdBannerItem | null)[];
}

// 가로형 배너 세로 스택(좌측 사이드). 슬롯 3칸을 항상 렌더하고, 활성 칸(non-null)은 배너로,
// 빈 칸은 "광고 모집중" 자리표시로 채운다.
export function HorizontalAdBannerRail({
	className,
	items,
}: HorizontalAdBannerRailProps) {
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{AD_RAIL_SLOT_KEYS.map((key, index) => {
				const item = items[index];
				return item ? (
					<HorizontalAdBanner item={item} key={item.id} />
				) : (
					<AdSlotPlaceholder className="flex aspect-[7/3] w-full" key={key} />
				);
			})}
		</div>
	);
}

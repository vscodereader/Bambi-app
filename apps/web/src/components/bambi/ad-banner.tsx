"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { resolveAdInquiryTel } from "@/lib/bambi/ad-inquiry-tel";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";
import { orpc } from "@/utils/orpc";
import {
	AdBannerTextOverlay,
	AdSlotInquiryContent,
} from "./ad-banner-text-overlay";

const bannerHref = (item: AdBannerItem): Route =>
	`/seeker/jobs/${item.id}` as Route;

// 좌/우 배너 rail은 슬롯 3개를 항상 렌더한다 — 서버가 그룹당 고정 길이(3칸) 배열을 내려주고
// 활성 칸만 광고, 나머지는 null이다. 데이터가 없거나(로딩) null인 칸은 자리표시로 채운다.
const AD_RAIL_SLOT_KEYS = ["slot-1", "slot-2", "slot-3"] as const;

// 빈 광고/카드 슬롯 자리표시 — 실제 배너와 같은 비율/크기로 "광고 등록 문의"를 그리는
// 클릭 불가 장식(aria-hidden). 8칸이 같은 문구를 반복하므로 스크린리더에는 읽히지 않게 두고,
// 빈 슬롯이 클릭되면 실제 광고와 혼동되므로 링크도 걸지 않는다.
// 예전엔 번호가 박힌 PNG 2종이었고 번호를 바꾸려면 이미지를 다시 만들어야 했다 — 이제 운영자
// 설정값(siteSettings.getFooter)을 그대로 렌더한다.
// 비율/크기(aspect·h·w)는 호출부가 className으로 넘긴다 —
// display 클래스도 반드시 함께 넘겨야 한다(base엔 flex/hidden이 없어 breakpoint 토글이 가능).
// variant는 세로형(우측 사이드) 슬롯에서만 "vertical"로 넘긴다(기본은 가로형).
export function AdSlotPlaceholder({
	className,
	variant = "horizontal",
}: {
	className?: string;
	variant?: "horizontal" | "vertical";
}) {
	const { data } = useQuery(orpc.bambi.siteSettings.getFooter.queryOptions());
	const tel = resolveAdInquiryTel({
		adInquiryTel: data?.adInquiryTel,
		tel: data?.tel,
	});

	return (
		<div
			aria-hidden="true"
			className={cn("relative overflow-hidden rounded-lg", className)}
		>
			{/* 폴백 끝단인 BAMBI_COMPANY.tel이 아직 "TODO_고객센터 전화" 플레이스홀더다.
			    운영자가 광고 문의·고객센터 번호를 둘 다 비워두면 그 문자열이 빈 슬롯 8칸에
			    그대로 노출되므로, TODO_로 시작하면 번호를 비우고 문구만 남긴다. */}
			<AdSlotInquiryContent
				tel={tel.startsWith("TODO_") ? "" : tel}
				variant={variant}
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
// 문구(item.text)가 있으면 이미지 위에 오버레이로 얹는다 — 오버레이가 absolute inset-0이라
// Link에 relative가 필요하고(없으면 엉뚱한 조상 기준으로 배치된다), 스크림이 둥근 모서리를
// 덮지 않도록 overflow-hidden도 함께 둔다.
export function AdBanner({ className, item }: AdBannerProps) {
	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className="relative block w-fit overflow-hidden rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
			{item.text ? (
				<AdBannerTextOverlay config={item.text} variant="vertical" />
			) : null}
		</Link>
	);
}

interface AdBannerRailProps {
	className?: string;
	items: (AdBannerItem | null)[];
}

// 세로 배너 스택(우측). 슬롯 3칸을 항상 렌더하고, 활성 칸(non-null)은 배너로, 빈 칸은
// "광고 등록 문의" 자리표시로 채운다.
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
// 문구(item.text)가 있으면 이미지 위에 오버레이로 얹는다 — 오버레이가 absolute inset-0이라
// Link에 relative가 필요하다(없으면 엉뚱한 조상 기준으로 배치된다).
export function HorizontalAdBanner({
	className,
	item,
}: HorizontalAdBannerProps) {
	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className="relative block overflow-hidden rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
			{item.text ? (
				<AdBannerTextOverlay config={item.text} variant="horizontal" />
			) : null}
		</Link>
	);
}

interface HorizontalAdBannerRailProps {
	className?: string;
	items: (AdBannerItem | null)[];
}

// 가로형 배너 세로 스택(좌측 사이드). 슬롯 3칸을 항상 렌더하고, 활성 칸(non-null)은 배너로,
// 빈 칸은 "광고 등록 문의" 자리표시로 채운다.
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

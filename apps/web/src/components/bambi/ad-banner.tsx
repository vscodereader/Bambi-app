"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { isAdBannerImageRequired } from "@/lib/bambi/ad-banner-layout";
import { resolveAdInquiryTel } from "@/lib/bambi/ad-inquiry-tel";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";
import { orpc } from "@/utils/orpc";
import { AdBannerLayoutRenderer } from "./ad-banner-layout-renderer";

const AD_BANNER_SURFACE_CLASS = "relative block overflow-hidden rounded-lg";
const AD_BANNER_LINK_CLASS =
	"transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// 배너 상자. 갈 곳이 있으면 Link, 없으면 같은 크기의 div다 — 수집 공고 배너는 상세 페이지가
// 없어서 링크를 걸면 누른 사람이 오류 화면을 본다. href 없는 <a>로 두는 것도 같은 문제라
// (포커스는 먹고 아무 일도 안 한다) 요소 자체를 바꾼다.
function AdBannerFrame({
	children,
	className,
	item,
}: {
	children: ReactNode;
	className?: string;
	item: AdBannerItem;
}) {
	if (!item.href) {
		return (
			<div className={cn(AD_BANNER_SURFACE_CLASS, className)}>{children}</div>
		);
	}

	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className={cn(AD_BANNER_SURFACE_CLASS, AD_BANNER_LINK_CLASS, className)}
			href={item.href as Route}
		>
			{children}
		</Link>
	);
}

// 좌/우 배너 rail은 슬롯 3개를 항상 렌더한다 — 서버가 그룹당 고정 길이(3칸) 배열을 내려주고
// 활성 칸만 광고, 나머지는 null이다. 데이터가 없거나(로딩) null인 칸은 자리표시로 채운다.
const AD_RAIL_SLOT_KEYS = ["slot-1", "slot-2", "slot-3"] as const;

// 빈 광고 슬롯에 들어가는 "광고 등록 문의" 내용. 예전엔 전화번호가 박힌 PNG였고, 번호를
// 바꾸려면 이미지를 다시 만들어야 했다. 이제 운영자 설정값을 그대로 렌더한다.
// 세로형은 표시 폭이 약 92px뿐이라 세로쓰기 대신 줄바꿈으로 흘린다 — 번호가 세로로 서면 읽기 어렵다.
function AdSlotInquiryContent({
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
// 레이아웃(item.layout)이 있으면 이미지 위에 세로 슬롯 레이아웃을 얹는다 — 오버레이가
// absolute inset-0이라 Link에 relative가 필요하고(없으면 엉뚱한 조상 기준으로 배치된다),
// 스크림이 둥근 모서리를 덮지 않도록 overflow-hidden도 함께 둔다.
// 배경이 단색인 슬롯은 이미지를 아예 그리지 않는다. 렌더러가 absolute inset-0으로 색을 덮어
// 보이지도 않는데다, item.imageUrl은 배너가 없으면 커버·샘플 사진으로 폴백하므로 엉뚱한 사진을
// 받아 놓고 가리는 낭비가 된다. 대신 같은 크기 클래스를 가진 빈 상자가 슬롯 크기를 만든다
// (Image가 유일한 크기 소스였다 — 그냥 빼면 슬롯이 무너진다).
export function AdBanner({ className, item }: AdBannerProps) {
	const surfaceClassName = cn("aspect-[4/9] h-52 w-auto rounded-lg", className);

	return (
		<AdBannerFrame className="w-fit" item={item}>
			{/* 이미지가 없는 단색 배너의 접근성 이름은 Link의 aria-label이 이미 담당한다 —
			    빈 상자에는 alt에 해당하는 이름을 줄 것이 없고, 실제 내용인 문구는 레이아웃
			    렌더러가 텍스트로 그린다. */}
			{isAdBannerImageRequired(item.layout, "ad_vertical") ? (
				<Image
					alt={`${item.company} ${item.title} 광고 배너`}
					className={cn(surfaceClassName, "object-cover")}
					height={900}
					sizes="120px"
					src={item.imageUrl}
					unoptimized
					width={400}
				/>
			) : (
				<div className={surfaceClassName} />
			)}
			{item.layout ? (
				<AdBannerLayoutRenderer layout={item.layout} slot="vertical" />
			) : null}
		</AdBannerFrame>
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
// 레이아웃(item.layout)이 있으면 이미지 위에 가로 슬롯 레이아웃을 얹는다 — 오버레이가
// absolute inset-0이라 Link에 relative가 필요하다(없으면 엉뚱한 조상 기준으로 배치된다).
export function HorizontalAdBanner({
	className,
	item,
}: HorizontalAdBannerProps) {
	// 단색 배경 처리는 AdBanner(세로형)와 같다 — 그쪽 주석 참고.
	const surfaceClassName = cn(
		"aspect-[7/3] w-full rounded-lg border border-border",
		className
	);

	return (
		<AdBannerFrame item={item}>
			{isAdBannerImageRequired(item.layout, "ad_horizontal") ? (
				<Image
					alt={`${item.company} ${item.title} 광고 배너`}
					className={cn(surfaceClassName, "object-cover")}
					height={600}
					sizes="272px"
					src={item.imageUrl}
					unoptimized
					width={1400}
				/>
			) : (
				<div className={surfaceClassName} />
			)}
			{item.layout ? (
				<AdBannerLayoutRenderer layout={item.layout} slot="horizontal" />
			) : null}
		</AdBannerFrame>
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

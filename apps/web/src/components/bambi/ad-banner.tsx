"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { isAdBannerImageRequired } from "@/lib/bambi/ad-banner-layout";
import { resolveAdInquiryTel } from "@/lib/bambi/ad-inquiry-tel";
import type { AdBannerItem } from "@/lib/bambi/api-job-mapper";
import {
	shouldTrackPromotion,
	trackPromotionSelect,
	trackPromotionView,
} from "@/lib/bambi/ga-promotion";
import { usePromotionImpression } from "@/lib/bambi/use-promotion-impression";
import { orpc } from "@/utils/orpc";
import { AdBannerLayoutRenderer } from "./ad-banner-layout-renderer";

// GA4 프로모션 슬롯 지정(이슈 #59) — rail이 칸 순번으로 만들어 배너까지 내려보낸다.
interface PromotionSlot {
	index: number;
	slot: string;
}

const AD_BANNER_SURFACE_CLASS = "relative block overflow-hidden rounded-lg";

const AD_BANNER_LINK_CLASS =
	"transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// 배너 상자. 결제 광고는 우리 공고 상세로, 수집 배너는 수집 전용 상세로 간다(매퍼가 주소를
// 만든다) — 갈 곳 없는 배너는 이제 없으므로 항상 Link다.
// promotion이 넘어온 결제 배너(순수 프리미엄)만 GA4 프로모션으로 계측한다(이슈 #59) —
// 크롤링 채움 배너는 shouldTrackPromotion이 거르고, 노출은 뷰포트 50% 진입 시 1회다.
function AdBannerFrame({
	children,
	className,
	item,
	promotion,
}: {
	children: ReactNode;
	className?: string;
	item: AdBannerItem;
	promotion?: PromotionSlot;
}) {
	const tracked = promotion && shouldTrackPromotion(item) ? promotion : null;
	// onImpress는 primitive에만 의존시킨다. item 객체는 렌더마다 새로 만들어지므로
	// (useAdBannerJobs의 map) 객체째 의존하면 매 렌더 ref가 detach/재attach되고,
	// 그때마다 IntersectionObserver 초기 콜백이 취소돼 노출이 통째로 유실될 수 있다.
	const { crawled, id, title } = item;
	const slot = tracked?.slot ?? null;
	const index = tracked?.index ?? 0;
	const onImpress = useMemo(
		() =>
			slot === null
				? null
				: () => trackPromotionView({ crawled, id, title }, slot, index),
		[crawled, id, index, slot, title]
	);
	const impressionRef = usePromotionImpression(onImpress);

	return (
		<Link
			aria-label={`${item.company} ${item.title} 광고 공고 상세 보기`}
			className={cn(AD_BANNER_SURFACE_CLASS, AD_BANNER_LINK_CLASS, className)}
			href={item.href as Route}
			onClick={
				tracked
					? () => trackPromotionSelect(item, tracked.slot, tracked.index)
					: undefined
			}
			ref={impressionRef}
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
			<div className="flex size-full flex-col items-center justify-center gap-2 rounded-lg border border-coral-300 bg-destructive/10 p-2 text-center text-destructive">
				<Megaphone className="size-4" />
				<span className="font-bold text-xs leading-tight">광고 등록 문의</span>
				<span className="font-extrabold text-sm leading-tight tracking-tight">
					{tel}
				</span>
			</div>
		);
	}

	return (
		<div className="flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-coral-300 bg-destructive/10 p-3 text-center text-destructive">
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
// 클릭 불가 장식(aria-hidden). 아홉 칸이 같은 문구를 반복하므로 스크린리더에는 읽히지 않게 두고,
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
			    운영자가 광고 문의·고객센터 번호를 둘 다 비워두면 그 문자열이 빈 슬롯 아홉 칸에
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
	// 넘기면 이 배너를 GA4 프로모션으로 계측한다(이슈 #59). rail이 칸 순번으로 만들어 준다.
	promotion?: PromotionSlot;
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
export function AdBanner({ className, item, promotion }: AdBannerProps) {
	// 수집 배너도 결제 배너와 같은 규격 슬롯으로 그린다. 세로 수집 배너 원본은 실측 80×180 —
	// 정확히 4:9라 규격 슬롯을 object-cover로 채워도 잘리는 부분이 없다. 반대로 원본 비율로
	// 그리면 슬롯이 이미지 크기로 줄어들어 옆의 결제 슬롯과 크기가 어긋난다(사용자 확인 사항).
	const surfaceClassName = cn("aspect-[4/9] h-52 w-auto rounded-lg", className);

	return (
		<AdBannerFrame className="w-fit" item={item} promotion={promotion}>
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
	// 로딩 중이면 슬롯을 스켈레톤으로 채운다 — 광고 있는 칸도 응답 대기 동안 문의 배너가
	// 번쩍이는 걸 막는다(로딩 vs "광고 없음" 구분은 useAdBannerJobs.isLoading).
	isLoading?: boolean;
	items: (AdBannerItem | null)[];
	// GA4 프로모션 지면 접두어(이슈 #59). 넘기면 각 칸이 `${promotionSurface}_${순번}` 슬롯으로
	// 계측되고, 안 넘기면 이 rail은 계측하지 않는다.
	promotionSurface?: string;
}

// 세로 배너 스택(우측). 슬롯 3칸을 항상 렌더하고, 활성 칸(non-null)은 배너로, 빈 칸은
// "광고 등록 문의" 자리표시로 채운다. 로딩 중에는 같은 크기 스켈레톤을 그린다.
export function AdBannerRail({
	className,
	isLoading,
	items,
	promotionSurface,
}: AdBannerRailProps) {
	return (
		<div className={cn("flex flex-col items-start gap-3", className)}>
			{AD_RAIL_SLOT_KEYS.map((key, index) => {
				if (isLoading) {
					return (
						<Skeleton className="aspect-[4/9] h-52 rounded-lg" key={key} />
					);
				}
				const item = items[index];
				return item ? (
					<AdBanner
						item={item}
						key={item.id}
						promotion={
							promotionSurface
								? { index, slot: `${promotionSurface}_${index + 1}` }
								: undefined
						}
					/>
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
	// AdBannerProps.promotion과 같다 — 넘기면 GA4 프로모션으로 계측한다(이슈 #59).
	promotion?: PromotionSlot;
}

// 가로형 광고 배너(좌측 사이드·상단 프리미엄용) — 노출 슬롯은 16:9.
// 업로드 규격(job-ad-banner-spec.ts)은 아직 7:3(최소 700×300)이라 슬롯보다 넓적하다 —
// object-cover가 좌우를 약 24% 잘라낸다. 규격을 16:9로 맞추는 건 검증·안내·매뉴얼을
// 함께 바꾸는 별건이라 여기서는 손대지 않았다.
// 아래 width/height는 next/image의 비율 힌트일 뿐 요구 해상도가 아니다(실제 폭은 sizes로 결정).
// 폭은 그리드/컬럼(공고 카드와 동일)으로 정해지고 높이는 비율로 따라온다. 슬롯 비율은
// 업로드 규격(lib/bambi/job-ad-banner-spec.ts)과 같아야 배너가 잘리지 않는다.
// 클릭하면 광고 공고 상세로 이동한다.
// 레이아웃(item.layout)이 있으면 이미지 위에 가로 슬롯 레이아웃을 얹는다 — 오버레이가
// absolute inset-0이라 Link에 relative가 필요하다(없으면 엉뚱한 조상 기준으로 배치된다).
export function HorizontalAdBanner({
	className,
	item,
	promotion,
}: HorizontalAdBannerProps) {
	// 단색 배경 처리는 AdBanner(세로형)와 같다 — 그쪽 주석 참고.
	// 수집 배너도 결제 배너와 똑같은 슬롯에 object-cover로 채운다. 가로 수집 원본은 실측
	// 240×117(≈2.05)로 16:9(≈1.78)보다 넓적해 좌우가 잘리지만, 슬롯이 이미지 크기대로
	// 늘었다 줄었다 하면 옆 결제 슬롯·레일과 높이가 어긋난다(사용자 결정).
	const surfaceClassName = cn(
		"aspect-[16/9] w-full rounded-lg border border-border",
		className
	);

	return (
		<AdBannerFrame item={item} promotion={promotion}>
			{isAdBannerImageRequired(item.layout, "ad_horizontal") ? (
				<Image
					alt={`${item.company} ${item.title} 광고 배너`}
					className={cn(surfaceClassName, "object-fill")}
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
	// 로딩 중이면 슬롯을 스켈레톤으로 채운다(AdBannerRail 주석 참고).
	isLoading?: boolean;
	items: (AdBannerItem | null)[];
	// GA4 프로모션 지면 접두어(이슈 #59). 넘기면 각 칸이 `${promotionSurface}_${순번}` 슬롯으로
	// 계측되고, 안 넘기면 이 rail은 계측하지 않는다.
	promotionSurface?: string;
}

// 레일 슬롯 비율 — 공고 카드(VisualJobCard) 높이 118px(p-2 16 + 썸네일 h-14 56 + gap-2 8 +
// 급여 행 h-9 36 + border 2)을 aside 폭 259px에서 만드는 비율이다. 컴포넌트 기본값 16:9는
// 상단 프리미엄 3칸이 계속 쓰므로 여기서만 className으로 덮는다.
// 카드 구조(패딩·썸네일·급여 행 높이)나 aside 폭이 바뀌면 이 비율도 같이 갱신해야 한다.
// 이미지가 object-fill이라 16:9보다 세로로 조금 더 눌리지만, 슬롯 크기를 고정하고 이미지를
// 맞추는 기존 결정을 유지한다(슬롯이 이미지대로 늘면 옆 카드와 높이가 어긋난다).
const RAIL_SLOT_ASPECT_CLASS = "aspect-[259/118]";

// 가로형 배너 세로 스택(좌측 사이드). 슬롯 3칸을 항상 렌더하고, 활성 칸(non-null)은 배너로,
// 빈 칸은 "광고 등록 문의" 자리표시로 채운다. 로딩 중에는 같은 크기 스켈레톤을 그린다.
export function HorizontalAdBannerRail({
	className,
	isLoading,
	items,
	promotionSurface,
}: HorizontalAdBannerRailProps) {
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{AD_RAIL_SLOT_KEYS.map((key, index) => {
				if (isLoading) {
					return (
						<Skeleton
							className={cn(RAIL_SLOT_ASPECT_CLASS, "w-full rounded-lg")}
							key={key}
						/>
					);
				}
				const item = items[index];
				return item ? (
					<HorizontalAdBanner
						className={RAIL_SLOT_ASPECT_CLASS}
						item={item}
						key={item.id}
						promotion={
							promotionSurface
								? { index, slot: `${promotionSurface}_${index + 1}` }
								: undefined
						}
					/>
				) : (
					<AdSlotPlaceholder
						className={cn("flex w-full", RAIL_SLOT_ASPECT_CLASS)}
						key={key}
					/>
				);
			})}
		</div>
	);
}

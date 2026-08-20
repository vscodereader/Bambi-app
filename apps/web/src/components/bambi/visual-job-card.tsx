"use client";

import { Badge as UiBadge } from "@bambi-app/ui/components/badge";
import { cn } from "@bambi-app/ui/lib/utils";
import { useCallback, useMemo } from "react";
import { adPeriodTier, formatAdPeriod } from "@/lib/bambi/ad-period";
import {
	JOB_LISTS,
	shouldTrackJobAnalytics,
	trackJobListView,
	trackJobSelect,
} from "@/lib/bambi/ga-job";
import {
	type PromotionDefinition,
	RECOMMENDED_PROMOTION,
	SPECIAL_PROMOTION,
	shouldTrackPromotion,
	trackPromotionSelect,
	trackPromotionView,
} from "@/lib/bambi/ga-promotion";
import {
	HIT_RIBBON_CLASS_BY_TONE,
	shouldShowHitRibbon,
} from "@/lib/bambi/job-hit";
import type { Job } from "@/lib/bambi/types";
import { useAdPeriodTiers } from "@/lib/bambi/use-ad-period-tiers";
import { usePromotionImpression } from "@/lib/bambi/use-promotion-impression";
import { AdPeriodTierIcon } from "./ad-period-tier-icon";
import { Badge } from "./ds";
import { MapPinIcon } from "./icons";
import { JobCoverImage } from "./job-cover-image";

interface VisualJobCardProps {
	active?: boolean;
	analyticsIndex?: number;
	job: Job;
	onOpen: (job: Job) => void;
	tone: "organic" | "recommended" | "special" | "urgent";
	trackAnalytics?: boolean;
}

const JOB_CARD_TEXT_LIMIT = 7;

export function truncateJobCardText(value: string): string {
	const characters = Array.from(value);
	return characters.length > JOB_CARD_TEXT_LIMIT
		? `${characters.slice(0, JOB_CARD_TEXT_LIMIT).join("")}...`
		: value;
}

const fullTextTitle = (value: string): string | undefined =>
	Array.from(value).length > JOB_CARD_TEXT_LIMIT ? value : undefined;

const getPromotion = (
	tone: VisualJobCardProps["tone"]
): PromotionDefinition | null => {
	switch (tone) {
		case "special":
			return SPECIAL_PROMOTION;
		case "recommended":
			return RECOMMENDED_PROMOTION;
		default:
			return null;
	}
};

// 등급 카드는 배경 틴트 없이 테두리 색상만으로 구분한다.
const toneClassName = {
	organic: "border-border bg-card",
	recommended: "border-sky-300 bg-card",
	special: "border-coral-300 bg-card",
	urgent: "border-amber-300 bg-card",
} as const;

// HIT 공고는 테두리를 한 단계 진하게 + 얇은 링으로 과하지 않게 강조한다.
const hitBorderClassName = {
	organic: "",
	recommended: "border-sky-400 ring-1 ring-sky-200",
	special: "border-coral-400 ring-1 ring-coral-200",
	urgent: "border-amber-400 ring-1 ring-amber-200",
} as const;

// 티어 배지 색을 등급별로 구분해 유료 노출 사다리를 시각화한다.
// 단위 배지는 스페셜·추천도 급구와 동일하게 danger 톤으로 통일한다.
const toneBadge = {
	organic: "neutral",
	recommended: "danger",
	special: "danger",
	urgent: "danger",
} as const;

// 알려진 급여 단위(시급·일급 등)를 금액과 분리해 금액을 카드 앵커로 강조한다.
const PAY_UNITS = ["시급", "일급", "주급", "월급", "급여", "연봉"] as const;

// 머리 토큰이 숫자 없는 1~4자이고 꼬리가 숫자로 시작하는지 — 자유 텍스트 단위 판별용.
const HEAD_HAS_DIGIT = /\d/;
const TAIL_STARTS_WITH_DIGIT = /^\d/;

// pay를 "단위 + 금액"으로 가른다. 목록에 없어도 수집 공고의 자유 텍스트 단위를 뱃지로 뺀다.
export function splitPay(pay: string): { amount: string; unit: null | string } {
	const trimmed = pay.trim();
	const spaceIndex = trimmed.indexOf(" ");
	if (spaceIndex === -1) {
		return { amount: trimmed, unit: null };
	}
	const head = trimmed.slice(0, spaceIndex);
	const tail = trimmed.slice(spaceIndex + 1);
	// 알려진 단위는 꼬리가 숫자가 아니어도 분리한다("급여 협의"의 "급여").
	if (PAY_UNITS.some((unit) => unit === head)) {
		return { amount: tail, unit: head };
	}
	// 수집 공고는 payUnitOptions 5종 밖 단위(건당·TC 등, dev DB에 건당만 47건)가 자유
	// 텍스트로 실재한다. 머리가 숫자 없는 1~4자이고 꼬리가 숫자로 시작하면 단위로 인정해
	// 뱃지로 뺀다("면접 후 협의"처럼 꼬리가 숫자가 아니면 통째로 금액 자리에 둔다).
	const looksLikeFreeTextUnit =
		head.length <= 4 &&
		!HEAD_HAS_DIGIT.test(head) &&
		TAIL_STARTS_WITH_DIGIT.test(tail);
	if (looksLikeFreeTextUnit) {
		return { amount: tail, unit: head };
	}
	return { amount: trimmed, unit: null };
}

// 급여 행 오른쪽 끝의 누적 광고 배지(아이콘 + "N회 N일"). adPeriod가 없으면 카드가 렌더하지
// 않으므로 여기서는 값이 있다고 가정한다. 새 행을 만들지 않도록 급여 행 안에 ml-auto로 얹는다.
function JobAdPeriodBadge({
	adPeriod,
}: {
	adPeriod: NonNullable<Job["adPeriod"]>;
}) {
	// 운영자 설정 등급(없으면 상수 폴백). react-query 캐시가 카드마다의 조회를 합친다.
	const tiers = useAdPeriodTiers();
	const tier = adPeriodTier(adPeriod.totalDays, tiers);
	return (
		<UiBadge
			// 테두리·세로 패딩 없음: 칩이 아니라 급여 행에 얹힌 글자로 보이게 한다. pr-0으로
			// 배지 오른쪽 끝을 카드 콘텐츠 경계(p-2)에 맞추고, 왼쪽 px-2는 급여와의 간격으로 남긴다.
			// 아이콘이 24px이라 배지 높이도 24px — 급여 행 h-9(36px) 안이라 카드 높이는 그대로다.
			className={cn(
				"ml-auto h-auto border-0 py-0 pr-0 font-semibold",
				tier.colorClass
			)}
			title={`광고 ${adPeriod.count}회 · 누적 ${adPeriod.totalDays}일`}
			variant="outline"
		>
			{/* 업로드 아이콘이 16px에선 알아보기 어려워 배지에서만 24px로 키운다. */}
			<AdPeriodTierIcon
				className="size-6"
				icon={tier.icon}
				iconImageUrl={tier.iconImageUrl}
			/>
			{formatAdPeriod(adPeriod)}
		</UiBadge>
	);
}

export function VisualJobCard({
	active = false,
	analyticsIndex = 0,
	job,
	onOpen,
	trackAnalytics = false,
	tone,
}: VisualJobCardProps) {
	const { amount: payAmount, unit: payUnit } = splitPay(job.pay);
	// organic엔 리본 없음. Hit이고 tone이 special/urgent/recommended일 때만 표시.
	const showHitRibbon = shouldShowHitRibbon(job, tone);
	const hitRibbonClassName =
		tone === "organic" ? "" : HIT_RIBBON_CLASS_BY_TONE[tone];
	const analyticsContext = useMemo(
		() =>
			tone === "urgent"
				? null
				: {
						index: analyticsIndex,
						listId: JOB_LISTS[tone].id,
						listName: JOB_LISTS[tone].name,
						tone,
					},
		[analyticsIndex, tone]
	);
	const promotion = getPromotion(tone);
	const promotionSlot = `seeker_${tone}_${analyticsIndex + 1}`;
	const handleImpression = useCallback(() => {
		if (!(trackAnalytics && analyticsContext)) {
			return;
		}
		trackJobListView([job], analyticsContext);
		if (
			promotion &&
			shouldTrackJobAnalytics(job, tone) &&
			shouldTrackPromotion(job)
		) {
			trackPromotionView(job, promotionSlot, analyticsIndex, promotion);
		}
	}, [
		analyticsContext,
		analyticsIndex,
		job,
		promotion,
		promotionSlot,
		tone,
		trackAnalytics,
	]);
	const impressionRef = usePromotionImpression(
		trackAnalytics && analyticsContext ? handleImpression : null
	);
	const handleOpen = () => {
		if (trackAnalytics && analyticsContext) {
			trackJobSelect(job, analyticsContext);
			if (
				promotion &&
				shouldTrackJobAnalytics(job, tone) &&
				shouldTrackPromotion(job)
			) {
				trackPromotionSelect(job, promotionSlot, analyticsIndex, promotion);
			}
		}
		onOpen(job);
	};
	return (
		<article
			className={cn(
				"relative flex flex-col gap-2 overflow-hidden rounded-lg border bg-card p-2 transition-colors",
				toneClassName[tone],
				showHitRibbon && hitBorderClassName[tone],
				active && "border-coral-400 ring-2 ring-coral-100"
			)}
			ref={impressionRef}
		>
			{showHitRibbon ? (
				// 카드 우측 상단을 대각선으로 가로지르는 얇은 코너 리본. article의 overflow-hidden이
				// 양끝을 삼각 코너로 잘라주고, 코너에 대칭 배치해 HIT를 중앙에 둔다.
				// pointer-events-none으로 아래 카드 클릭을 가리지 않는다.
				<span
					className={cn(
						"pointer-events-none absolute top-4 -right-6 z-10 w-24 rotate-45 py-0.5 text-center font-extrabold text-[10px] leading-none tracking-wider",
						hitRibbonClassName
					)}
				>
					<span aria-hidden="true">HIT</span>
					<span className="sr-only">인기 공고</span>
				</span>
			) : null}
			<button
				className="flex cursor-pointer flex-col gap-2 border-none bg-transparent p-0 text-left"
				onClick={handleOpen}
				type="button"
			>
				<div className="flex items-start gap-3">
					{job.coverImage ? (
						<JobCoverImage
							className="h-14 w-30 shrink-0 rounded-md border border-white object-fill"
							height={56}
							media={job.coverImage}
							width={56}
						/>
					) : (
						<div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-white bg-secondary font-extrabold text-coral-700 text-sm">
							{job.company.slice(0, 2)}
						</div>
					)}
					<div
						className={cn(
							"flex min-w-0 flex-1 flex-col gap-1",
							showHitRibbon && "pr-8"
						)}
					>
						<h3
							className="m-0 truncate font-extrabold text-[15px] leading-snug"
							title={fullTextTitle(job.title)}
						>
							{truncateJobCardText(job.title)}
						</h3>
						<span
							className="truncate font-semibold text-muted-foreground text-xs"
							title={fullTextTitle(job.company)}
						>
							{truncateJobCardText(job.company)}
						</span>
						<span className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
							<span className="inline-flex size-3 shrink-0">
								<MapPinIcon />
							</span>
							<span className="truncate">
								{job.location}
								{job.type ? ` · ${job.type}` : ""}
							</span>
						</span>
					</div>
				</div>
			</button>
			{/* mt-auto: 그리드 행이 늘어나(모집중 placeholder 등) 카드가 stretch 되어도
			    급여 행이 항상 카드 하단에 붙도록 고정한다. 광고 배지는 새 행을 만들지 않고
			    이 행 오른쪽 끝(ml-auto)에 얹어 카드 높이(122px) 결합을 건드리지 않는다. */}
			<div className="mt-auto flex items-center">
				<span className="flex h-9 min-w-0 items-center gap-1.5">
					{payUnit ? (
						<Badge className="shrink-0" tone={toneBadge[tone]}>
							{payUnit}
						</Badge>
					) : null}
					<span className="truncate font-extrabold text-base text-coral-600 leading-none">
						{payAmount}
					</span>
				</span>
				{job.adPeriod ? <JobAdPeriodBadge adPeriod={job.adPeriod} /> : null}
			</div>
		</article>
	);
}

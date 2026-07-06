"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import {
	HIT_RIBBON_CLASS_BY_TONE,
	shouldShowHitRibbon,
} from "@/lib/bambi/job-hit";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button } from "./ds";
import { MapPinIcon, Message } from "./icons";

interface VisualJobCardProps {
	active?: boolean;
	job: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	tone: "organic" | "recommended" | "special" | "urgent";
}

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
const toneBadge = {
	organic: "neutral",
	recommended: "primary",
	special: "primary",
	urgent: "danger",
} as const;

// 알려진 급여 단위(시급·일급 등)를 금액과 분리해 금액을 카드 앵커로 강조한다.
const PAY_UNITS = ["시급", "일급", "주급", "월급", "급여", "연봉"] as const;

function splitPay(pay: string): { amount: string; unit: null | string } {
	const trimmed = pay.trim();
	const spaceIndex = trimmed.indexOf(" ");
	if (spaceIndex === -1) {
		return { amount: trimmed, unit: null };
	}
	const head = trimmed.slice(0, spaceIndex);
	const isKnownUnit = PAY_UNITS.some((unit) => unit === head);
	if (!isKnownUnit) {
		return { amount: trimmed, unit: null };
	}
	return { amount: trimmed.slice(spaceIndex + 1), unit: head };
}

const DESC_MAX_LENGTH = 15;

// 설명은 15자 초과 시 말줄임(…) 처리한다.
function truncateDesc(desc: string): string {
	const trimmed = desc.trim();
	return trimmed.length > DESC_MAX_LENGTH
		? `${trimmed.slice(0, DESC_MAX_LENGTH)}…`
		: trimmed;
}

export function VisualJobCard({
	active = false,
	job,
	onChat,
	onOpen,
	tone,
}: VisualJobCardProps) {
	const { amount: payAmount, unit: payUnit } = splitPay(job.pay);
	const shortDesc = truncateDesc(job.desc);
	// organic엔 리본 없음. Hit이고 tone이 special/urgent/recommended일 때만 표시.
	const showHitRibbon = shouldShowHitRibbon(job, tone);
	const hitRibbonClassName =
		tone === "organic" ? "" : HIT_RIBBON_CLASS_BY_TONE[tone];
	return (
		<article
			className={cn(
				"relative flex flex-col gap-2 overflow-hidden rounded-lg border bg-card p-2 transition-colors",
				toneClassName[tone],
				showHitRibbon && hitBorderClassName[tone],
				active && "border-coral-400 ring-2 ring-coral-100"
			)}
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
				onClick={() => onOpen(job)}
				type="button"
			>
				{job.coverImage ? (
					<div className="relative aspect-[7/3] w-full overflow-hidden rounded-lg border border-white">
						<Image
							alt={job.coverImage.altText || job.coverImage.fileName}
							className="object-cover"
							fill
							sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 100vw"
							src={job.coverImage.url}
							unoptimized
						/>
					</div>
				) : (
					<div className="flex aspect-[7/3] w-full items-center justify-center rounded-lg border border-white bg-secondary font-extrabold text-coral-700 text-xl">
						{job.company.slice(0, 2)}
					</div>
				)}
				<div
					className={cn("flex min-w-0 flex-col gap-1", showHitRibbon && "pr-8")}
				>
					<h3 className="m-0 truncate font-extrabold text-[15px] leading-snug">
						{job.company}
					</h3>
					<span className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
						<span className="inline-flex size-3 shrink-0">
							<MapPinIcon />
						</span>
						<span className="truncate">
							{job.location}
							{job.type ? ` · ${job.type}` : ""}
						</span>
					</span>
					<p className="m-0 truncate text-muted-foreground text-xs leading-relaxed">
						{shortDesc}
					</p>
				</div>
			</button>
			<div className="flex items-end justify-between gap-2">
				<span className="flex min-w-0 items-end gap-1.5">
					{payUnit ? (
						<Badge className="shrink-0" tone={toneBadge[tone]}>
							{payUnit}
						</Badge>
					) : null}
					<span className="truncate font-extrabold text-base text-coral-600 leading-none">
						{payAmount}
					</span>
				</span>
				<Button
					className="h-9 shrink-0 justify-center"
					onClick={() => onChat(job)}
					rightIcon={<Message />}
					size="sm"
					variant="secondary"
				>
					채팅
				</Button>
			</div>
		</article>
	);
}

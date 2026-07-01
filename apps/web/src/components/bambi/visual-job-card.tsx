"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button } from "./ds";
import { CheckIcon, MapPinIcon, Message } from "./icons";

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

const toneLabel = {
	organic: "최신",
	recommended: "추천",
	special: "스페셜",
	urgent: "급구",
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

interface Marker {
	label: string;
	tone: "danger" | "dark" | "success";
}

// HOT/오늘면접/신규 마커를 기존 필드에서 파생한다(스키마 변경 없음).
function getMarkers(job: Job, tone: VisualJobCardProps["tone"]): Marker[] {
	const markers: Marker[] = [];
	if (tone === "urgent") {
		markers.push({ label: "HOT", tone: "danger" });
	}
	if (job.tags.includes("오늘 면접")) {
		markers.push({ label: "오늘면접", tone: "success" });
	}
	if (job.featured) {
		markers.push({ label: "신규", tone: "dark" });
	}
	return markers;
}

export function VisualJobCard({
	active = false,
	job,
	onChat,
	onOpen,
	tone,
}: VisualJobCardProps) {
	const { amount: payAmount, unit: payUnit } = splitPay(job.pay);
	const markers = getMarkers(job, tone);
	const shortDesc = truncateDesc(job.desc);
	return (
		<article
			className={cn(
				"flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors",
				toneClassName[tone],
				active && "border-coral-400 ring-2 ring-coral-100"
			)}
		>
			<button
				className="flex cursor-pointer flex-col gap-2 border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
				{/* 배지는 항상 한 줄 — flex-wrap 금지, 넘치면 클립 */}
				<div className="flex items-center gap-1 overflow-hidden">
					<Badge className="shrink-0" tone={toneBadge[tone]}>
						{job.promotionLabel ?? toneLabel[tone]}
					</Badge>
					{markers.map((marker) => (
						<Badge className="shrink-0" key={marker.label} tone={marker.tone}>
							{marker.label}
						</Badge>
					))}
					{job.verified ? (
						<Badge className="shrink-0" tone="success">
							<span className="inline-flex size-3">
								<CheckIcon />
							</span>
							검수
						</Badge>
					) : null}
				</div>
				<div className="flex items-start gap-3">
					{job.coverImage ? (
						<Image
							alt={job.coverImage.altText || job.coverImage.fileName}
							className="size-20 shrink-0 rounded-lg border border-white object-cover"
							height={80}
							src={job.coverImage.url}
							unoptimized
							width={80}
						/>
					) : (
						<div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-white bg-secondary font-extrabold text-base text-coral-700">
							{job.company.slice(0, 2)}
						</div>
					)}
					<div className="flex min-w-0 flex-1 flex-col gap-1">
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
				</div>
			</button>
			<div className="flex items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-1.5">
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
